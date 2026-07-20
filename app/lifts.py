"""Lifting-ledger routes and input validation."""

import math
import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional, Tuple

from fastapi import APIRouter, Request

from . import db, game, records

router = APIRouter(prefix="/api")

PLAIN_DECIMAL = re.compile(r"^[+-]?\d+(?:\.\d+)?$")
ISO_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_LIFT_COUNT = 2_147_483_647
MAX_LIFT_WEIGHT = 1_000_000


def _parse_decimal(value, field: str) -> Decimal:
    if isinstance(value, bool):
        raise ValueError(f"Record {field} as a plain number.")
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError(f"Record {field} as a finite number.")
        return Decimal(str(value))
    if isinstance(value, str):
        text = value.strip()
        if not PLAIN_DECIMAL.fullmatch(text):
            raise ValueError(f"Record {field} as a plain number.")
        return Decimal(text)
    raise ValueError(f"Record {field} as a plain number.")


def _parse_values(body) -> Tuple[float, int]:
    if not isinstance(body, dict):
        raise ValueError("The set record is malformed.")
    if "weight" not in body:
        raise ValueError("Record the weight, even when it is zero.")
    if "reps" not in body:
        raise ValueError("Record the reps, seconds, or steps.")
    weight_decimal = _parse_decimal(body["weight"], "weight")
    reps_decimal = _parse_decimal(body["reps"], "reps, seconds, or steps")
    weight = float(weight_decimal)
    if not math.isfinite(weight) or weight < 0:
        raise ValueError("Weight must be a finite, non-negative number.")
    if weight_decimal > MAX_LIFT_WEIGHT:
        raise ValueError("That weight is too large for the ledger.")
    if reps_decimal < 0 or reps_decimal != reps_decimal.to_integral_value():
        raise ValueError("Reps, seconds, or steps must be a non-negative whole number.")
    if reps_decimal > MAX_LIFT_COUNT:
        raise ValueError("That set count is too large for the ledger.")
    reps = int(reps_decimal)
    if not math.isfinite(weight * reps):
        raise ValueError("That set is too large for the ledger.")
    return weight, reps


def _parse_quest_id(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError("The quest mark on that set is malformed.")
    return value


def day_bounds(value: str) -> Tuple[str, str]:
    if not ISO_DAY.fullmatch(value):
        raise ValueError("Name the ledger day as YYYY-MM-DD.")
    try:
        start = date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("That day does not exist in the ledger.") from error
    return start.isoformat(), (start + timedelta(days=1)).isoformat()


@router.post("/lifts")
async def log_lift(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        raise ValueError("The set record is malformed.")
    raw_exercise = body.get("exercise")
    exercise = raw_exercise.strip() if isinstance(raw_exercise, str) else ""
    if not exercise:
        raise ValueError("Name the exercise.")
    weight, reps = _parse_values(body)
    quest_id = _parse_quest_id(body.get("quest_id"))
    today = game.today()
    cursor = db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps, quest_id) VALUES (?,?,?,?,?)",
        (game.now_iso(), exercise, weight, reps, quest_id),
    )
    db.commit()
    set_id = cursor.lastrowid
    if set_id is None:
        raise RuntimeError("The lifting ledger did not return its new set mark.")
    return {
        "ok": True,
        "today": today,
        "sets_today": db.q(
            "SELECT COUNT(*) AS n FROM lift_sets WHERE ts >= ?", (today,)
        ).fetchone()["n"],
        "set": records.lift_payload(set_id),
    }


@router.delete("/lifts/last")
def undo_lift():
    row = db.q("SELECT id FROM lift_sets ORDER BY id DESC LIMIT 1").fetchone()
    if row:
        db.q("DELETE FROM lift_sets WHERE id=?", (row["id"],))
        db.commit()
    return {"ok": True}


@router.get("/lifts/recent")
def recent_lifts(limit: int = 20):
    return {"today": game.today(), "sets": records.recent_lift_payload(limit)}


@router.delete("/lifts/day/{dstr}")
def delete_lift_day(dstr: str):
    start, end = day_bounds(dstr)
    count = db.q(
        "SELECT COUNT(*) AS n FROM lift_sets WHERE ts>=? AND ts<?", (start, end)
    ).fetchone()["n"]
    if not count:
        raise ValueError("No sets recorded that day.")
    db.q("DELETE FROM lift_sets WHERE ts>=? AND ts<?", (start, end))
    db.commit()
    db.log_event(
        game.now_iso(),
        "amend",
        f"Wick struck an entire lifting session ({count} sets) from {start}.",
    )
    return {"ok": True, "deleted": count}


@router.delete("/lifts/{set_id}")
def delete_lift(set_id: int):
    row = db.q("SELECT exercise FROM lift_sets WHERE id=?", (set_id,)).fetchone()
    if not row:
        raise ValueError("No such set in the ledger.")
    db.q("DELETE FROM lift_sets WHERE id=?", (set_id,))
    db.commit()
    db.log_event(
        game.now_iso(),
        "amend",
        f"Wick struck a set of {row['exercise']} from the record.",
    )
    return {"ok": True}


@router.patch("/lifts/{set_id}")
async def edit_lift(set_id: int, request: Request):
    body = await request.json()
    weight, reps = _parse_values(body)
    row = db.q("SELECT * FROM lift_sets WHERE id=?", (set_id,)).fetchone()
    if not row:
        raise ValueError("No such set in the ledger.")
    db.q("UPDATE lift_sets SET weight=?, reps=? WHERE id=?", (weight, reps, set_id))
    db.commit()
    db.log_event(
        game.now_iso(),
        "amend",
        f"Wick corrected a set of {row['exercise']}: {weight} x {reps}.",
    )
    return {"ok": True}

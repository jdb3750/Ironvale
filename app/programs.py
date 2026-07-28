"""Doctrines: well-known training programs + user-built routines.

When a doctrine is active for a lift giver, that giver's first quest offer is
the program's next session, with linear-progression weight suggestions.
"""
import uuid
from typing import Callable, Dict, NamedTuple, Optional

from . import db, exercises, game, quests

# inc: weight added per completed session that included the lift
PROGRAMS = {
    "starting_strength": {
        "name": "Starting Strength",
        "giver": "kettlebell",
        "desc": "Rippetoe's novice barbell doctrine. Squat every day it meets you. Add weight every session.",
        "inc": {"Deadlift": 5.0, "default": 2.5},
        "sessions": [
            {"label": "Workout A", "exercises": [("Back Squat", 3, 5), ("Bench Press", 3, 5), ("Deadlift", 1, 5)]},
            {"label": "Workout B", "exercises": [("Back Squat", 3, 5), ("Overhead Press", 3, 5), ("Barbell Row", 3, 5)]},
        ],
    },
    "stronglifts": {
        "name": "StrongLifts 5x5",
        "giver": "kettlebell",
        "desc": "Five sets of five, alternating days. Simple, brutal, effective.",
        "inc": {"Deadlift": 5.0, "default": 2.5},
        "sessions": [
            {"label": "Workout A", "exercises": [("Back Squat", 5, 5), ("Bench Press", 5, 5), ("Barbell Row", 5, 5)]},
            {"label": "Workout B", "exercises": [("Back Squat", 5, 5), ("Overhead Press", 5, 5), ("Deadlift", 1, 5)]},
        ],
    },
    "simple_sinister": {
        "name": "Simple & Sinister",
        "giver": "kettlebell",
        "desc": "Pavel's daily rite: 100 one-hand swings, 10 get-ups. Same bell until it feels like a toy.",
        "inc": {"default": 0.0},
        "sessions": [
            {"label": "The Daily Rite", "exercises": [("Kettlebell Swing", 10, 10), ("Turkish Get-Up", 10, 1)]},
        ],
    },
    "armor_building": {
        "name": "Armor Building Complex",
        "giver": "kettlebell",
        "desc": "Dan John's double-bell complex: 2 cleans, 1 press, 3 front squats. Rounds until dignified.",
        "inc": {"default": 0.0},
        "sessions": [
            {"label": "The Complex", "exercises": [("Kettlebell Clean & Press", 6, 3), ("Goblet Squat", 6, 3), ("Kettlebell Swing", 3, 10)]},
        ],
    },
}


def get_routines():
    return db.kv_get("routines", [])


def save_routine(payload):
    routines = get_routines()
    exs = []
    for e in payload.get("exercises", []):
        name = e.get("exercise", "").strip()
        if not name:
            continue
        exs.append({
            "exercise": name,
            "sets": max(1, min(12, int(e.get("sets", 3)))),
            "reps": max(1, min(50, int(e.get("reps", 8)))),
        })
    if not exs:
        raise ValueError("A routine needs at least one exercise.")
    if not payload.get("name", "").strip():
        raise ValueError("Name the routine.")
    r = {
        "id": "r" + uuid.uuid4().hex[:8],
        "name": payload["name"].strip()[:40],
        "giver": payload.get("giver", "strength"),
        "exercises": exs,
    }
    routines.append(r)
    db.kv_set("routines", routines)
    return r


def delete_routine(rid):
    routines = [r for r in get_routines() if r["id"] != rid]
    db.kv_set("routines", routines)
    # deselect if active anywhere
    s = game.get_settings()
    changed = False
    for g in ("kettlebell", "strength"):
        if s.get(f"program_{g}") == f"custom:{rid}":
            s[f"program_{g}"] = None
            changed = True
    if changed:
        db.kv_set("settings", s)


def active_program(giver, current_date=None):
    return game.get_settings(current_date).get(f"program_{giver}")


def select_program(giver, key):
    if key:
        if key.startswith("custom:"):
            if not any(r["id"] == key[7:] for r in get_routines()):
                raise ValueError("No such routine.")
        elif key not in PROGRAMS or PROGRAMS[key]["giver"] != giver:
            raise ValueError("No such doctrine for this trainer.")
    s = game.get_settings()
    s[f"program_{giver}"] = key
    db.kv_set("settings", s)


def _session_index(key):
    state = db.kv_get("program_state", {})
    return state.get(key, 0)


def advance(key):
    state = db.kv_get("program_state", {})
    state[key] = state.get(key, 0) + 1
    db.kv_set("program_state", state)


class ProgramWeightContext(NamedTuple):
    increments: Dict[str, float]
    program_key: str
    weight_for: Callable[[str], Optional[float]]


def _suggest(exercise, context):
    last = context.weight_for(exercise)
    if last is None:
        return None
    inc = context.increments.get(
        exercise,
        context.increments.get("default", 0.0),
    )
    if not inc:
        return last
    row = db.q(
        "SELECT status FROM quests WHERE kind=? AND details LIKE ? ORDER BY id DESC LIMIT 1",
        (f"program:{context.program_key}", f'%{exercise}%'),
    ).fetchone()
    if row and row["status"] == "done":
        return round(last + inc, 1)
    return last


def build_program_offer(
    giver,
    weight_for=None,
    current_date=None,
):
    """The doctrine's next session as a quest offer, or None."""
    lookup = weight_for or game.last_weight
    key = active_program(giver, current_date)
    if not key:
        return None
    if key.startswith("custom:"):
        r = next((x for x in get_routines() if x["id"] == key[7:]), None)
        if not r:
            return None
        routine = [{
            "exercise": e["exercise"], "sets": e["sets"], "reps": e["reps"], "unit": "reps",
            "suggest_weight": lookup(e["exercise"]),
            "groups": exercises.groups_for(e["exercise"]),
        } for e in r["exercises"]]
        title, label, kind = r["name"], "your routine", f"program:{key}"
        blurb = "Your own doctrine, sworn in your own hand."
    else:
        p = PROGRAMS[key]
        sess = p["sessions"][_session_index(key) % len(p["sessions"])]
        routine = [{
            "exercise": name, "sets": sets, "reps": reps, "unit": "reps",
            "suggest_weight": _suggest(
                name,
                ProgramWeightContext(p["inc"], key, lookup),
            ),
            "groups": exercises.groups_for(name),
        } for name, sets, reps in sess["exercises"]]
        title, label, kind = f"{p['name']} — {sess['label']}", p["name"], f"program:{key}"
        blurb = p["desc"]
    total_sets = sum(r["sets"] for r in routine)
    o = {
        "kind": kind, "giver": giver, "title": title, "program": True,
        "intensity": "hard", "style": "program",
        "focus": sorted({g for r in routine for g in r["groups"]})[:3],
        "routine": routine, "structure": f"The doctrine: {label}. Do the work as written.",
        "blurb": blurb, "total_sets": total_sets,
    }
    quests._price_offer(o, minutes=total_sets * 3, intensity="hard")
    return o

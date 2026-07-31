"""Shared game core: the character, settings, time helpers, activity
categories, and training-history analysis every other module leans on.

Import direction: quests.py / economy.py / records.py import from here;
this module imports none of them (keeps the graph acyclic)."""
import statistics
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from . import db, exercises

RUN_TYPES = ("Run", "VirtualRun", "TrailRun")

# activity type -> category, for calendar color-coding, stats and muscle credit
CATEGORIES = {
    "run": RUN_TYPES,
    "ride": ("Ride", "VirtualRide", "GravelRide", "MountainBikeRide", "EBikeRide"),
    "climb": ("RockClimbing", "Bouldering", "Climbing"),
    "strength": ("WeightTraining", "Crossfit", "Workout", "HIIT"),
    "mobility": ("Yoga", "Pilates", "Stretching"),
    "walk": ("Walk", "Hike", "Snowshoe"),
    "swim": ("Swim", "OpenWaterSwim"),
}


def category(activity_type):
    for cat, types in CATEGORIES.items():
        if activity_type in types:
            return cat
    return "other"


# muscle groups credited by non-lifting activity categories
CATEGORY_MUSCLES = {"climb": ["back", "arms", "core"]}

# unverified "sworn" deeds via Wick the Scrivener — prorated rewards (no witness)
CLAIM_PRORATE = 0.7
CLAIM_TYPES = {
    "climb":    {"label": "Climbing / Bouldering", "type": "RockClimbing", "factor": 1.5, "stat": "str"},
    "strength": {"label": "Weightlifting",         "type": "WeightTraining", "factor": 1.4, "stat": "str"},
    "run":      {"label": "A run",                 "type": "Run",  "factor": 1.5, "stat": "end"},
    "ride":     {"label": "A ride",                "type": "Ride", "factor": 1.3, "stat": "end"},
    "hike":     {"label": "Walk / Hike",           "type": "Hike", "factor": 1.0, "stat": "end"},
    "mobility": {"label": "Yoga / Mobility",       "type": "Yoga", "factor": 1.0, "stat": "spr"},
    "other":    {"label": "Something else",        "type": "Workout", "factor": 1.2, "stat": "con"},
}

AMBITION = [
    {"name": "Mend",    "mult": 0.80, "desc": "Recover. Shorter, gentler quests."},
    {"name": "Keep",    "mult": 1.00, "desc": "Hold the line. Quests match your habits."},
    {"name": "Forge",   "mult": 1.12, "desc": "Steady improvement. Quests nudge upward."},
    {"name": "Conquer", "mult": 1.25, "desc": "Push hard. Quests demand more."},
]

GIVER_ARCHETYPES = {
    "endurance": {
        "archetype": "Endurance",
        "display": {"name": "Old Fenn", "title": "the Wayfarer", "sprite": "fenn"},
        "modalities": ("run", "ride", "swim", "climb"),
    },
    "strength": {
        "archetype": "Strength",
        "display": {"name": "Grunhilda", "title": "Iron-Bell", "sprite": "grunhilda"},
        "modalities": ("barbell", "dumbbell", "kettlebell", "bodyweight"),
    },
    "bram": {
        # Historical identity remains registered; retirement owns no live modalities.
        "archetype": "Retired",
        "display": {"name": "Ser Bram", "title": "the Old Knight at Rest", "sprite": "bram"},
        "modalities": (),
    },
    "recovery": {
        "archetype": "Recovery",
        "display": {"name": "Sage Elowen", "title": "of the Willow", "sprite": "elowen"},
        "modalities": ("mobility", "stretch", "easy movement", "rest"),
    },
}

GIVERS = {giver: ownership["display"] for giver, ownership in GIVER_ARCHETYPES.items()}
# Historical giver identity is permanent; only this smaller live roster may
# generate or accept new quests.
OFFERABLE_GIVERS = ("endurance", "strength", "recovery")

COUNSEL_MODES = ("considered", "self", "scheduled")
COUNSEL_FOCUSES = ("run", "ride", "swim", "climb", "strength")
COUNSEL_FOCUS_GIVERS = {
    "run": "endurance",
    "ride": "endurance",
    "swim": "endurance",
    "climb": "endurance",
    "strength": "strength",
    "rest": "recovery",
}
COUNSEL_SCHEDULE_DAYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
COUNSEL_SCHEDULE_TIERS = {
    "run": ("easy", "steady", "quality", "long"),
    "ride": ("easy", "steady", "quality", "long"),
    "swim": ("easy", "steady", "quality", "long"),
    "climb": ("technique", "volume", "limit-session"),
    "strength": ("volume", "circuit", "strength"),
    "rest": (),
}


def profile_tz():
    stored = db.kv_get("settings")
    name = stored.get("timezone") if isinstance(stored, dict) else None
    if isinstance(name, str) and name:
        try:
            return ZoneInfo(name)
        except (KeyError, TypeError, ValueError, ZoneInfoNotFoundError):
            pass
    return datetime.now().astimezone().tzinfo


def now():
    return datetime.now(profile_tz())


def now_iso():
    return now().isoformat(timespec="seconds")


def today():
    return now().date().isoformat()


def utc_to_local_iso(s):
    """Normalize a UTC ISO timestamp to profile-local time as an offset-aware
    ISO string with second precision (the same format now_iso() emits).

    intervals.icu reports `start_date` in UTC but `start_date_local` in the
    athlete's local time. When the trusted `start_date_local` is missing we
    still need the activity to land on the day the athlete actually trained,
    not the UTC day (a 21:00 PDT run is 04:00Z the next day). The app has no
    per-profile `timezone` setting is the source of truth, with system-local
    time as the fallback — the same source now()/today() and every cutoff use.
    This helper reuses that one source rather than inventing a new one. Naive
    inputs (no offset/Z) are read as UTC per the
    `start_date` field contract.

    Returns None for empty/non-string/unparseable input so callers can fall
    back to the raw value instead of silently blanking a real timestamp.
    """
    if not isinstance(s, str) or not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(profile_tz()).isoformat(timespec="seconds")


# ---------------- character ----------------

def default_char():
    return {
        "name": "Adventurer",
        "level": 1,
        "xp": 0,
        "gold": 60,
        "tokens": 1,
        "vigor": 4,
        "stats": {"str": 5, "end": 5, "con": 5, "spr": 5},
        "streak": {"count": 0, "last": None},
        "deepest_floor": 0,
        "deaths": 0,
        "quests_done": 0,
    }


def get_char():
    c = db.kv_get("character")
    if not c:
        c = default_char()
        db.kv_set("character", c)
    c.setdefault("appearance", {"skin": 0, "hair": 1, "hair_color": 0, "shirt": 2, "pants": 0})
    return c


def save_char(c):
    db.kv_set("character", c)


def _normalize_counsel_charter(value):
    if not isinstance(value, dict) or set(value) - {"primary", "secondary"}:
        return None
    primary = value.get("primary")
    secondary = value.get("secondary", [])
    if not isinstance(primary, str):
        return None
    if not isinstance(secondary, list):
        return None
    # Persisted "iron" focus values are a legacy alias; normalize identity
    # before validation so an old charter cannot be silently erased.
    primary = "strength" if primary == "iron" else primary
    secondary = [
        "strength" if focus == "iron" else focus
        for focus in secondary
    ]
    if primary not in COUNSEL_FOCUSES:
        return None
    if any(
        not isinstance(focus, str) or focus not in COUNSEL_FOCUSES
        for focus in secondary
    ):
        return None
    if primary in secondary or len(secondary) != len(set(secondary)):
        return None
    return {"primary": primary, "secondary": secondary}


def _normalize_counsel_iron_today(value, current_date):
    if not isinstance(value, dict) or set(value) != {"date", "equipment"}:
        return None
    equipment = value.get("equipment")
    if (
        value.get("date") != current_date
        or equipment not in GIVER_ARCHETYPES["strength"]["modalities"]
    ):
        return None
    return {"date": current_date, "equipment": equipment}


def validate_counsel_schedule(value, routine_keys=None):
    if (
        not isinstance(value, dict)
        or set(value) != set(COUNSEL_SCHEDULE_DAYS)
    ):
        raise ValueError("The weekly counsel plan must name all seven days.")
    normalized = {}
    for day in COUNSEL_SCHEDULE_DAYS:
        slots = value[day]
        if not isinstance(slots, list):
            raise ValueError(f"{day.title()}'s counsel paths must be written as a list.")
        normalized_slots = []
        for slot in slots:
            if not isinstance(slot, dict):
                raise ValueError(f"{day.title()} holds an unrecognized counsel path.")
            if "optional" not in slot or type(slot["optional"]) is not bool:
                raise ValueError("A weekly path must be marked optional or sworn.")

            # Slot-shape invariant: its fields are the discriminant. This keeps
            # v0.26 modality+tier slots valid without a persisted migration.
            if "routine" in slot:
                if set(slot) != {"routine", "optional"}:
                    raise ValueError(f"{day.title()} holds an unrecognized counsel path.")
                routine = slot["routine"]
                if (
                    not isinstance(routine, str)
                    or not routine
                    or (
                        routine_keys is not None
                        and routine not in routine_keys
                    )
                ):
                    raise ValueError(f"{day.title()} names a routine that is not written.")
                normalized_slots.append({
                    "routine": routine,
                    "optional": slot["optional"],
                })
                continue

            expected_keys = (
                {"modality", "tier", "optional"}
                if "tier" in slot
                else {"optional"} | ({"modality"} if "modality" in slot else set())
            )
            if set(slot) != expected_keys:
                raise ValueError(f"{day.title()} holds an unrecognized counsel path.")
            modality = slot.get("modality")
            if modality is not None and (
                not isinstance(modality, str)
                or modality not in COUNSEL_SCHEDULE_TIERS
            ):
                raise ValueError(f"{day.title()} names a path the Council does not know.")

            if "tier" in slot:
                if modality == "rest":
                    raise ValueError("Rest takes no effort tier.")
                if not isinstance(modality, str):
                    raise ValueError("A sized path must name its modality.")
                tier = slot["tier"]
                if tier not in COUNSEL_SCHEDULE_TIERS[modality]:
                    raise ValueError(
                        f"That effort does not belong to {modality} on {day.title()}."
                    )
                normalized_slot = {
                    "modality": modality,
                    "tier": tier,
                    "optional": slot["optional"],
                }
            elif modality is not None:
                normalized_slot = {
                    "modality": modality,
                    "optional": slot["optional"],
                }
            else:
                normalized_slot = {"optional": slot["optional"]}
            normalized_slots.append(normalized_slot)
        normalized[day] = normalized_slots
    return normalized


def _normalize_counsel_schedule(value, routine_keys=None):
    try:
        return validate_counsel_schedule(value, routine_keys)
    except (KeyError, TypeError, ValueError):
        return None


def counsel_schedule_options():
    return {
        "days": list(COUNSEL_SCHEDULE_DAYS),
        "modalities": [
            {
                "value": modality,
                "giver": COUNSEL_FOCUS_GIVERS[modality],
                "tiers": list(tiers),
            }
            for modality, tiers in COUNSEL_SCHEDULE_TIERS.items()
        ],
    }


def get_settings(current_date=None, schedule_routine_keys=None):
    stored = db.kv_get("settings")
    s = stored if isinstance(stored, dict) else {}
    s.setdefault("ambition", 2)
    s.setdefault("units", "km")
    s.setdefault("intervals_athlete_id", "")
    s.setdefault("intervals_api_key", "")
    s.setdefault("weight_unit", "kg")
    s.setdefault("timezone", "")
    s.setdefault("counsel_mode", "considered")
    s.setdefault("counsel_nudge_enabled", False)
    s.setdefault("counsel_charter", None)
    s.setdefault("counsel_iron_today", None)
    s.setdefault("counsel_schedule", None)
    if s["counsel_mode"] not in COUNSEL_MODES:
        s["counsel_mode"] = "considered"
    if type(s["counsel_nudge_enabled"]) is not bool:
        s["counsel_nudge_enabled"] = False
    s["counsel_charter"] = _normalize_counsel_charter(s["counsel_charter"])
    # This declaration is eligible only for one profile-local day; persisted
    # stale or malformed state must become absent at the settings boundary.
    if s["counsel_iron_today"] is not None:
        s["counsel_iron_today"] = _normalize_counsel_iron_today(
            s["counsel_iron_today"],
            current_date or today(),
        )
    if s["counsel_schedule"] is not None:
        s["counsel_schedule"] = _normalize_counsel_schedule(
            s["counsel_schedule"],
            schedule_routine_keys,
        )
    return s


def xp_to_next(level):
    return int(80 * (level ** 1.35))


def apply_xp(c, amount):
    c["xp"] += amount
    levels = 0
    while c["xp"] >= xp_to_next(c["level"]):
        c["xp"] -= xp_to_next(c["level"])
        c["level"] += 1
        levels += 1
    return levels


def ambition_mult(settings=None):
    s = settings if settings is not None else get_settings()
    return AMBITION[max(0, min(3, s["ambition"]))]["mult"]


# ---------------- training history ----------------

def modality_history(cat, days=60, default_median=20):
    """run_history's shape for ANY activity category — session count, median
    and p80 minutes, recent weekly volume. Drives adaptive offer sizing for
    every modality a giver serves (runs, rides, swims, climbs, ...)."""
    types = CATEGORIES[cat]
    cutoff = (now() - timedelta(days=days)).isoformat()
    ph = ",".join("?" * len(types))
    rows = db.q(
        f"SELECT * FROM activities WHERE type IN ({ph}) AND start >= ? ORDER BY start",
        (*types, cutoff),
    ).fetchall()
    mins = [r["moving_time"] / 60 for r in rows if r["moving_time"]]
    if not mins:
        return {"n": 0, "median": default_median, "p80": default_median + 5, "weekly_min": 0, "rows": rows}
    mins_sorted = sorted(mins)
    p80 = mins_sorted[min(len(mins_sorted) - 1, int(len(mins_sorted) * 0.8))]
    recent_cutoff = (now() - timedelta(days=28)).isoformat()
    recent = [r["moving_time"] / 60 for r in rows if r["start"] >= recent_cutoff and r["moving_time"]]
    return {
        "n": len(mins),
        "median": statistics.median(mins),
        "p80": p80,
        "weekly_min": round(sum(recent) / 4, 1),
        "rows": rows,
    }


def run_history(days=60):
    h = modality_history("run", days=days)
    h["runs"] = h.pop("rows")
    return h


def muscle_recency():
    """Per muscle group: days since last trained (999 = never) and 14-day set counts."""
    rows = db.q(
        "SELECT exercise, ts FROM lift_sets WHERE ts >= ?",
        ((now() - timedelta(days=90)).isoformat(),),
    ).fetchall()
    last = {}
    recent_sets = {g: 0 for g in exercises.GROUPS}
    cutoff14 = (now() - timedelta(days=14)).isoformat()
    for r in rows:
        for g in exercises.groups_for(r["exercise"]):
            if g not in last or r["ts"] > last[g]:
                last[g] = r["ts"]
            if r["ts"] >= cutoff14:
                recent_sets[g] = recent_sets.get(g, 0) + 1
    # non-lift activities also credit muscles (e.g. synced climbing hits back/arms/core)
    for a in db.q(
        "SELECT type, start FROM activities WHERE start >= ?",
        ((now() - timedelta(days=90)).isoformat(),),
    ).fetchall():
        groups = CATEGORY_MUSCLES.get(category(a["type"]))
        if not groups:
            continue
        for g in groups:
            if g not in last or a["start"] > last[g]:
                last[g] = a["start"]
            if a["start"] >= cutoff14:
                recent_sets[g] = recent_sets.get(g, 0) + 1
    out = {}
    for g in exercises.GROUPS:
        days = _days_since(last[g]) if g in last else 999
        out[g] = {"days_since": days, "sets_14d": recent_sets.get(g, 0)}
    return out


def _days_since(iso):
    try:
        dt = datetime.fromisoformat(iso)
    except (ValueError, TypeError):
        return 999
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=now().tzinfo)
    return (now() - dt).days


def last_weight(exercise):
    row = db.q(
        "SELECT weight FROM lift_sets WHERE exercise=? ORDER BY ts DESC LIMIT 1",
        (exercise,),
    ).fetchone()
    return row["weight"] if row else None

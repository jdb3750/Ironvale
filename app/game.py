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
    "running": {
        "archetype": "Endurance",
        "display": {"name": "Old Fenn", "title": "the Wayfarer", "sprite": "fenn"},
        "modalities": ("run", "ride", "swim"),
    },
    "kettlebell": {
        "archetype": "Iron",
        "display": {"name": "Grunhilda", "title": "Iron-Bell", "sprite": "grunhilda"},
        "modalities": ("barbell", "dumbbell", "kettlebell"),
    },
    "strength": {
        "archetype": "Skill",
        "display": {"name": "Ser Bram", "title": "the Unburdened", "sprite": "bram"},
        "modalities": ("climbing", "calisthenics", "plyometrics", "sprints"),
    },
    "mobility": {
        "archetype": "Recovery",
        "display": {"name": "Sage Elowen", "title": "of the Willow", "sprite": "elowen"},
        "modalities": ("mobility", "stretch", "easy movement", "rest"),
    },
}

GIVERS = {giver: ownership["display"] for giver, ownership in GIVER_ARCHETYPES.items()}

COUNSEL_MODES = ("considered", "self")
COUNSEL_FOCUSES = ("run", "ride", "swim", "climb", "iron")


def profile_tz():
    name = get_settings().get("timezone")
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


def get_settings():
    s = db.kv_get("settings") or {}
    s.setdefault("ambition", 2)
    s.setdefault("units", "km")
    s.setdefault("intervals_athlete_id", "")
    s.setdefault("intervals_api_key", "")
    s.setdefault("weight_unit", "kg")
    s.setdefault("timezone", "")
    s.setdefault("counsel_mode", "considered")
    s.setdefault("counsel_nudge_enabled", False)
    s.setdefault("counsel_charter", None)
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


def ambition_mult():
    s = get_settings()
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

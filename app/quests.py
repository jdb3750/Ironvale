"""Quest engine: adaptive offer generation, the quest lifecycle (accept ->
match -> complete), the Rest Writ, unguided-run bonuses, and Wick's sworn
claims. Split out of game.py in the pre-1.0 refactor.

Import direction: this module may import game (shared core) and db;
game.py imports neither this nor records/economy."""
import json
import math
import random
from datetime import datetime, timedelta
from typing import Literal, NamedTuple, Optional, Tuple

import pydantic

from . import db, exercises, intervals, items, raid
from .game import (
    AMBITION, CATEGORIES, CLAIM_PRORATE, CLAIM_TYPES, GIVER_ARCHETYPES, GIVERS, RUN_TYPES,
    ambition_mult, apply_xp, category, get_char, get_settings, last_weight,
    modality_history, muscle_recency, now, now_iso, run_history, save_char, today,
)

# ---------------- quest generation ----------------

def _r5(x, lo=10):
    return max(lo, int(round(x / 5.0) * 5))


RUN_FLAVOR = {
    "easy":      ["The Gentle Leagues", "Miles of Morning Mist", "The Shepherd's Round", "Soft Roads Home"],
    "steady":    ["The Courier's Route", "The Old Patrol", "Roads of the Vale", "The Steady Drum"],
    "tempo":     ["The Wolf's Pace", "Outrun the Bell", "The Tax Collector Cometh", "Chase the Falling Sun"],
    "intervals": ["Lightning Drills", "The Hare's Gambit", "Stormburst Sprints", "Arrows from the String"],
    "long":      ["The Great Circuit", "Pilgrimage to the Far Cairn", "The Long Watch", "Beyond the Last Fence"],
    "hills":     ["The Sisyphean Slopes", "Assault on Beacon Hill", "The Giant's Staircase", "Up the Crag"],
}

# Fenn serves every endurance road, wet and turning ones included — a
# profile that swims or rides sees those quests on his board (see
# _endurance_mix). Same voice, different weather.
SWIM_FLAVOR = {
    "easy":      ["The Quiet Water", "The Miller's Pond Round", "Soft Strokes Home"],
    "steady":    ["The Ferryman's Wage", "Crossing the Grey Mere", "The Long Stroke"],
    "intervals": ["Stormwater Sprints", "The Pike's Pursuit", "Whitecap Drills"],
    "long":      ["The Great Crossing", "To the Far Shore", "The Deep Patrol"],
}

RIDE_FLAVOR = {
    "easy":      ["The Miller's Errand", "Soft Wheels Home", "The Rolling Meadows"],
    "steady":    ["The Courier's Circuit", "Wheels of the Vale", "The Turning Road"],
    "hills":     ["The Switchback Penance", "Assault on the High Pass", "The Grinding Climb"],
    "long":      ["The Far Village Errand", "Beyond the Watchtower", "The Century's Apprentice"],
}

CLIMB_FLAVOR = {
    "session":   ["The Wall's Interrogation", "Trial of Grip and Nerve", "The Vertical Court"],
    "volume":    ["Laps on the Old Face", "The Ant's Ascent", "Stonework"],
    "technique": ["Quiet Feet", "The Spider's Lesson", "Statecraft of the Foothold"],
}

ENDURANCE_MODALITIES = ("run", "ride", "swim")
ENDURANCE_FLAVOR = {"run": RUN_FLAVOR, "ride": RIDE_FLAVOR, "swim": SWIM_FLAVOR}

LIFT_FLAVOR = ["The Iron Communion", "Trial of the Bell", "Grunhilda's Reckoning", "The Bell Tolls for Thee", "Rites of the Forge-Daughter"]

MOBILITY_FLAVOR = ["The Willow's Lesson", "Unknotting the Rope", "The Patient Root", "Stillwater Rites", "The Long Exhale"]

EnduranceModality = Literal["run", "ride", "swim"]
LiftStyle = Literal["strength", "volume", "circuit"]
STARTER_MEDIANS = {"run": 20.0, "ride": 40.0, "swim": 20.0}


class CandidateHistory(NamedTuple):
    session_count: int
    median_minutes: float
    p80_minutes: float


class QuestCandidate(NamedTuple):
    candidate_key: str
    payload: dict[str, pydantic.JsonValue]
    target_groups: Tuple[str, ...]


class LiftCandidateContext(NamedTuple):
    giver: str
    style: LiftStyle
    focus: Tuple[str, ...]
    exercises: Tuple[str, ...]
    weights: Tuple[Optional[float], ...]
    iron_session_count: int


def _history_context(history) -> CandidateHistory:
    return CandidateHistory(
        session_count=history["n"],
        median_minutes=history["median"],
        p80_minutes=history["p80"],
    )


def _endurance_candidate(
    modality: EnduranceModality,
    payload: dict[str, pydantic.JsonValue],
    sizing: str,
) -> QuestCandidate:
    variant = payload["kind"].split("_", 1)[1]
    complete = {
        **payload,
        "modality": modality,
        "giver": "running",
        "title": ENDURANCE_FLAVOR[modality][variant][0],
        "sizing": sizing,
        "reason_codes": ["cold_start"] if sizing == "generic_starter" else [],
    }
    _price_offer(complete, minutes=complete["target_minutes"], intensity=complete["intensity"])
    target_groups = ("legs", "posterior") if modality in ("run", "ride") else ("back", "shoulders")
    return QuestCandidate(payload["kind"], complete, target_groups)


def build_endurance_candidates(
    modality: EnduranceModality,
    history: CandidateHistory,
    ambition: float,
) -> Tuple[QuestCandidate, ...]:
    sizing = "personalized" if history.session_count >= 3 else "generic_starter"
    med = history.median_minutes if sizing == "personalized" else STARTER_MEDIANS[modality]
    pool = []
    easy_minutes = _r5(med * 0.75 * ambition)
    pool.append({
        "kind": f"{modality}_easy", "intensity": "low", "target_minutes": easy_minutes,
        "structure": {
            "run": f"Run {easy_minutes} minutes at an easy, conversational pace. Nose-breathing easy.",
            "ride": f"Ride {easy_minutes} minutes at an easy spin. Light gears, light heart.",
            "swim": f"Swim {easy_minutes} minutes relaxed. Long strokes, long exhales, no clock-watching.",
        }[modality],
        "blurb": {
            "run": "The roads are quiet. Keep them company.",
            "ride": "The meadows roll. Let the wheels roll with them.",
            "swim": "The water argues less when you stop arguing back.",
        }[modality],
    })
    steady_minutes = _r5(med * ambition)
    pool.append({
        "kind": f"{modality}_steady", "intensity": "moderate", "target_minutes": steady_minutes,
        "structure": {
            "run": f"Run {steady_minutes} minutes at a steady, comfortable effort.",
            "ride": f"Ride {steady_minutes} minutes at a steady, comfortable effort.",
            "swim": f"Swim {steady_minutes} minutes continuous at a comfortable, steady effort.",
        }[modality],
        "blurb": {
            "run": "A courier's pace: not hurried, never idle.",
            "ride": "A courier's wage is earned in the turning, not the sprinting.",
            "swim": "A ferryman crosses in all weather. So do you.",
        }[modality],
    })
    if modality == "run":
        tempo_work = _r5(max(10, med * 0.5 * ambition), lo=8)
        repetitions = max(4, min(8, int(med / 4)))
        pool.extend((
            {
                "kind": "run_tempo", "intensity": "hard", "target_minutes": tempo_work + 15,
                "structure": f"10 min easy warm-up, {tempo_work} min at tempo (comfortably hard, ~85%), 5 min cool-down.",
                "blurb": "Something is gaining on you. Do not let it.",
            },
            {
                "kind": "run_intervals", "intensity": "hard", "target_minutes": 10 + repetitions * 4 + 5,
                "structure": f"10 min warm-up, then {repetitions} x (2 min hard / 2 min easy jog), 5 min cool-down.",
                "blurb": "Strike like lightning. Rest like rain. Repeat.",
            },
            {
                "kind": "run_hills", "intensity": "hard", "target_minutes": 10 + repetitions * 3 + 5,
                "structure": f"10 min warm-up, then {repetitions} x (45-60 sec uphill hard, walk down), 5 min cool-down.",
                "blurb": "The hill was here first. Show it respect, then defeat it.",
            },
        ))
    elif modality == "swim":
        repetitions = max(4, min(10, int(med / 3)))
        pool.append({
            "kind": "swim_intervals", "intensity": "hard", "target_minutes": 5 + repetitions * 3 + 5,
            "structure": f"5 min easy warm-up, then {repetitions} x (2 min strong / 1 min easy), 5 min easy cool-down.",
            "blurb": "Somewhere below, a pike is pacing you. Outswim it.",
        })
    elif modality == "ride":
        repetitions = max(3, min(8, int(med / 10)))
        pool.append({
            "kind": "ride_hills", "intensity": "hard", "target_minutes": 15 + repetitions * 5 + 5,
            "structure": f"15 min easy warm-up, then {repetitions} x (3 min hard climb or big-gear grind, easy spin down), 5 min cool-down.",
            "blurb": "The pass does not lower itself. Rise to it.",
        })
    if sizing == "personalized":
        long_minutes = _r5(min(max(history.p80_minutes * 1.15, med * 1.35) * ambition, med * 2.0))
        pool.append({
            "kind": f"{modality}_long", "intensity": "moderate", "target_minutes": long_minutes,
            "structure": {
                "run": f"Run {long_minutes} minutes at an easy-to-steady effort. Slow is fine. Stopping is not.",
                "ride": f"Ride {long_minutes} minutes at an easy-to-steady effort. Bring water; the watchtower is farther than it looks.",
                "swim": f"Swim {long_minutes} minutes at an easy-to-steady effort. The far shore is patient.",
            }[modality],
            "blurb": {
                "run": "The far cairn will not visit itself.",
                "ride": "Past the last fence, the Vale keeps going. Go see.",
                "swim": "Every crossing worth telling of started as too far.",
            }[modality],
        })
    return tuple(_endurance_candidate(modality, payload, sizing) for payload in pool)


def _run_pool(rng):
    del rng
    return [dict(candidate.payload) for candidate in build_endurance_candidates(
        "run", _history_context(run_history()), ambition_mult()
    )]


def _swim_pool(rng):
    del rng
    return [dict(candidate.payload) for candidate in build_endurance_candidates(
        "swim", _history_context(modality_history("swim", default_median=20)), ambition_mult()
    )]


def _ride_pool(rng):
    del rng
    return [dict(candidate.payload) for candidate in build_endurance_candidates(
        "ride", _history_context(modality_history("ride", default_median=40)), ambition_mult()
    )]


def _endurance_mix():
    """Split Fenn's three offer slots among the endurance modalities this
    profile actually practices (last 28 days). Every practiced modality gets
    at least one slot (up to three); leftover slots go to the most practiced.
    Cold start — no endurance history at all — deals the classic all-run
    board. Counts are deterministic per day, so the daily offer cache stays
    stable regardless of how often this runs."""
    counts = {m: modality_history(m, days=28)["n"] for m in ENDURANCE_MODALITIES}
    practiced = [m for m in ENDURANCE_MODALITIES if counts[m] > 0]
    if not practiced:
        return {"run": 3}
    practiced.sort(key=lambda m: -counts[m])
    practiced = practiced[:3]
    mix = {m: 1 for m in practiced}
    for _ in range(3 - len(practiced)):
        mix[practiced[0]] += 1
    return mix


def gen_endurance_offers(rng):
    pools = {"run": _run_pool, "ride": _ride_pool, "swim": _swim_pool}
    offers = []
    for m, slots in _endurance_mix().items():
        pool = pools[m](rng)
        offers += rng.sample(pool, min(slots, len(pool)))
    rng.shuffle(offers)
    for o in offers:
        o["title"] = rng.choice(ENDURANCE_FLAVOR[o["modality"]][o["kind"].split("_")[1]])
        o["giver"] = "running"
        _price_offer(o, minutes=o["target_minutes"], intensity=o["intensity"])
    return offers


def _pick_exercises(rng, names, focus_groups, count=4):
    """2 exercises hitting focus groups, then fill with variety."""
    chosen = []

    def hits(ex, g):
        return g in exercises.EXERCISES[ex]["groups"]

    for g in focus_groups:
        cands = [n for n in names if hits(n, g) and n not in chosen]
        if cands:
            chosen.append(rng.choice(cands))
    rest = [n for n in names if n not in chosen]
    rng.shuffle(rest)
    while len(chosen) < count and rest:
        nxt = rest.pop()
        covered = {g for c in chosen for g in exercises.EXERCISES[c]["groups"]}
        if set(exercises.EXERCISES[nxt]["groups"]) - covered or len(rest) == 0:
            chosen.append(nxt)
    return chosen[:count]


def build_lift_candidate(context: LiftCandidateContext) -> QuestCandidate:
    routine = []
    for index, name in enumerate(context.exercises):
        unit, low_reps, high_reps = exercises.EXERCISES[name]["scheme"]
        if context.style == "strength":
            sets, reps = 4, low_reps
        elif context.style == "volume":
            sets, reps = 3, high_reps
        else:
            sets, reps = 3, int((low_reps + high_reps) / 2)
        routine.append({
            "exercise": name,
            "sets": sets,
            "reps": reps,
            "unit": unit,
            "suggest_weight": context.weights[index],
            "groups": exercises.EXERCISES[name]["groups"],
        })
    style_desc = {
        "strength": "Heavy and low. Rest well between sets.",
        "volume": "Lighter, more reps. Chase the burn.",
        "circuit": "Move briskly between exercises, minimal rest.",
    }
    total_sets = sum(entry["sets"] for entry in routine)
    has_history = context.iron_session_count > 0
    payload = {
        "kind": f"lift_{context.style}",
        "giver": context.giver,
        "title": LIFT_FLAVOR[0],
        "intensity": "hard" if context.style == "strength" else "moderate",
        "focus": list(context.focus),
        "style": context.style,
        "routine": routine,
        "structure": style_desc[context.style],
        "blurb": f"Focus: {', '.join(context.focus)}. {style_desc[context.style]}",
        "total_sets": total_sets,
        "sizing": "personalized" if has_history else "generic_starter",
        "reason_codes": [] if has_history else ["no_iron_history"],
    }
    _price_offer(payload, minutes=total_sets * 3, intensity=payload["intensity"])
    routine_key = "|".join(
        f"{entry['exercise']}:{entry['suggest_weight']}" for entry in routine
    )
    key = f"{context.giver}:{payload['kind']}:{'-'.join(context.focus)}:{routine_key}"
    return QuestCandidate(key, payload, context.focus)


def build_climb_candidates(
    history: CandidateHistory,
    ambition: float,
) -> Tuple[QuestCandidate, ...]:
    median_minutes = history.median_minutes
    session_minutes = _r5(median_minutes * ambition, lo=30)
    volume_minutes = _r5(median_minutes * 0.9 * ambition, lo=30)
    technique_minutes = _r5(max(30, median_minutes * 0.7), lo=30)
    pool = [
        {
            "kind": "climb_session", "intensity": "hard", "target_minutes": session_minutes,
            "structure": f"{session_minutes} minutes at the wall. Warm up on easy ground, then push attempts near your limit while fresh.",
            "blurb": "The wall asks its questions plainly. Answer with your hands.",
        },
        {
            "kind": "climb_volume", "intensity": "moderate", "target_minutes": volume_minutes,
            "structure": f"{volume_minutes} minutes of mileage: many routes or problems well below your limit, minimal rest between.",
            "blurb": "A soldier drills the easy strikes ten hundred times. So does a climber.",
        },
        {
            "kind": "climb_technique", "intensity": "low", "target_minutes": technique_minutes,
            "structure": f"{technique_minutes} minutes climbing deliberately easy: silent feet, straight arms, no rushed moves.",
            "blurb": "Strength wins moves. Footwork wins walls.",
        },
    ]
    candidates = []
    for payload in pool:
        variant = payload["kind"].split("_", 1)[1]
        complete = {
            **payload,
            "modality": "climb",
            "giver": "strength",
            "title": CLIMB_FLAVOR[variant][0],
        }
        _price_offer(complete, minutes=complete["target_minutes"], intensity=complete["intensity"])
        candidates.append(QuestCandidate(payload["kind"], complete, ("back", "arms", "core")))
    return tuple(candidates)


def _climb_pool(rng):
    del rng
    return [dict(candidate.payload) for candidate in build_climb_candidates(
        _history_context(modality_history("climb", default_median=60)), ambition_mult()
    )]


def gen_climb_offers(rng):
    offers = _climb_pool(rng)
    rng.shuffle(offers)
    for o in offers:
        o["giver"] = "strength"
        o["title"] = rng.choice(CLIMB_FLAVOR[o["kind"].split("_")[1]])
        _price_offer(o, minutes=o["target_minutes"], intensity=o["intensity"])
    return offers


def gen_lift_offers(rng):
    rec = muscle_recency()
    # stale-first: groups untrained the longest get priority
    ranked = sorted(exercises.GROUPS, key=lambda g: -rec[g]["days_since"])
    offers = []
    styles: list[LiftStyle] = ["strength", "volume", "circuit"]
    rng.shuffle(styles)
    focus_sets = [ranked[0:2], ranked[1:3], [ranked[0], ranked[3]]]
    iron_session_count = len(db.q(
        "SELECT DISTINCT substr(ts, 1, 10) AS day FROM lift_sets WHERE ts >= ?",
        ((now() - timedelta(days=60)).date().isoformat(),),
    ).fetchall())
    for i, equipment in enumerate(GIVER_ARCHETYPES["kettlebell"]["modalities"]):
        style = styles[i % len(styles)]
        focus = focus_sets[i]
        names = [
            name for name, exercise in exercises.EXERCISES.items()
            if exercise["equipment"] == equipment
        ]
        chosen = _pick_exercises(rng, names, focus)
        candidate = build_lift_candidate(LiftCandidateContext(
            giver="kettlebell",
            style=style,
            focus=tuple(focus),
            exercises=tuple(chosen),
            weights=tuple(last_weight(name) for name in chosen),
            iron_session_count=iron_session_count,
        ))
        o = dict(candidate.payload)
        o["title"] = rng.choice(LIFT_FLAVOR)
        offers.append(o)
    return offers


def gen_mobility_offers(rng):
    sessions = [
        ("Stretch & Breathe", 15, "15 min: hip openers, couch stretch, hamstring floss, deep breathing."),
        ("The Long Walk", 30, "Walk 30 minutes outdoors. No phone. Look at things."),
        ("Yoga Flow", 20, "20 min of sun salutations and whatever your joints ask for."),
        ("Roll & Hang", 15, "10 min foam rolling the sore bits, then 3 x max-time dead hang."),
    ]
    picks = rng.sample(sessions, 3)
    offers = []
    for name, minutes, struct in picks:
        o = {
            "kind": "mobility", "giver": "mobility",
            "title": rng.choice(MOBILITY_FLAVOR),
            "intensity": "low", "target_minutes": minutes,
            "structure": struct, "blurb": name + ". The body keeps the score; settle the debt.",
            "bonus_vigor": 1,
        }
        _price_offer(o, minutes=minutes, intensity="low")
        offers.append(o)
    return offers


def _price_offer(o, minutes, intensity):
    factor = {"low": 1.0, "moderate": 1.35, "hard": 1.7}[intensity]
    o["xp"] = int(minutes * factor * 2.2)
    o["gold"] = int(o["xp"] * 0.45)
    o["vigor"] = 3 if intensity == "hard" else 2


# ---------------- the rest writ ----------------
# When the wellness omens say the body is losing, Sage Elowen issues a writ
# to REST. It is sworn like any quest but completes itself: at dawn the next
# day, if no hard training was logged during the writ's day, it resolves as
# kept — rewards land AND the rested day is stitched into the streak, so the
# streak never pressures training through exhaustion. A hard workout during
# the writ breaks it quietly (no penalty; the willow does not scold).

REST_WRIT_TITLE = "The Rest Writ"

REST_WRIT_BLURBS = [
    "The willow has read your omens and writes plainly: rest.",
    "Elowen presses a sealed writ into your hand. It weighs nothing, and everything.",
    "Some quests are carried. This one is set down.",
    "The strongest oath is sometimes stillness.",
]

# what counts as breaking a rest writ: a real training session, not a stroll.
# walks / hikes / yoga / mobility never break it — they're encouraged.
WRIT_HARD_CATEGORIES = ("run", "ride", "climb", "strength", "swim", "other")
WRIT_HARD_MIN_SECONDS = 15 * 60
WRIT_HARD_MIN_SETS = 6


def rest_writ_signal():
    """Read the omens. Returns a list of in-world reason strings when recovery
    data says today should be a rest day, else None.

    Fires on any ONE strong signal or TWO weak ones:
      HRV week-avg vs prior baseline:  strong <= -8%,  weak <= -5%
      RHR week-avg vs prior baseline:  strong >= +4bpm, weak >= +2.5bpm
      sleep: last night < 5h (strong); 7-night avg < 6h (strong) / < 6.5h (weak)

    Requires a wellness reading within the last 2 days — no writ without
    fresh evidence (stale data must never spawn writs forever)."""
    rows = db.q(
        "SELECT * FROM wellness WHERE date >= ? ORDER BY date",
        ((now() - timedelta(days=60)).date().isoformat(),),
    ).fetchall()
    if not rows:
        return None
    if rows[-1]["date"] < (now().date() - timedelta(days=2)).isoformat():
        return None

    week, before = rows[-7:], rows[:-7]

    def vals(field, src):
        return [r[field] for r in src if r[field] is not None]

    def avg(v):
        return sum(v) / len(v) if v else None

    strong, weak, reasons = 0, 0, []

    hrv_w, hrv_b = avg(vals("hrv", week)), avg(vals("hrv", before))
    if hrv_w and hrv_b:
        delta = (hrv_w - hrv_b) / hrv_b * 100
        if delta <= -8:
            strong += 1
            reasons.append(f"your heart's rhythm sits {abs(delta):.0f}% beneath its usual song")
        elif delta <= -5:
            weak += 1
            reasons.append(f"your heart's rhythm runs {abs(delta):.0f}% quiet")

    rhr_w, rhr_b = avg(vals("resting_hr", week)), avg(vals("resting_hr", before))
    if rhr_w and rhr_b:
        d = rhr_w - rhr_b
        if d >= 4:
            strong += 1
            reasons.append(f"your resting pulse runs {d:.0f} beats hot")
        elif d >= 2.5:
            weak += 1
            reasons.append(f"your resting pulse is {d:.1f} beats above its wont")

    last_sleep = vals("sleep_secs", rows[-1:])
    sleep_w = avg(vals("sleep_secs", week))
    if last_sleep and last_sleep[0] < 5 * 3600:
        strong += 1
        reasons.append(f"last night gave you only {last_sleep[0]/3600:.1f} hours of sleep")
    elif sleep_w and sleep_w < 6.0 * 3600:
        strong += 1
        reasons.append(f"sleep has averaged {sleep_w/3600:.1f} hours this week")
    elif sleep_w and sleep_w < 6.5 * 3600:
        weak += 1
        reasons.append(f"sleep has run thin this week ({sleep_w/3600:.1f}h a night)")

    if strong >= 1 or weak >= 2:
        return reasons
    return None


def rest_writ_offer():
    """Elowen's leading offer when the omens call for rest, else None.
    At most one writ per calendar day, in ANY status — an abandoned or broken
    writ means the player chose to train; the willow does not nag."""
    if db.q(
        "SELECT 1 FROM quests WHERE kind='rest' AND accepted_at LIKE ? LIMIT 1",
        (today() + "%",),
    ).fetchone():
        return None
    reasons = rest_writ_signal()
    if not reasons:
        return None
    rng = random.Random(f"writ:{today()}")
    return {
        "kind": "rest", "giver": "mobility",
        "title": REST_WRIT_TITLE,
        "intensity": "low",
        "writ_day": today(),
        "reasons": reasons,
        "blurb": rng.choice(REST_WRIT_BLURBS),
        "structure": "From acceptance until dawn: no hard training. Walks, stretches and sleep are the whole of the quest.",
        "xp": 45, "gold": 20, "vigor": 2, "bonus_vigor": 1,
    }


def _writ_hard_activity(quest):
    """The activity (or set-logging session) that breaks this writ, if any —
    a hard-category activity of >=15 min, or >=6 logged lift sets, started
    within the writ window (acceptance -> end of the writ's calendar day).
    Returns something with name/type keys, or None."""
    writ_day = quest["details"].get("writ_day") or quest["accepted_at"][:10]
    end = writ_day + "T23:59:59"
    rows = db.q(
        "SELECT * FROM activities WHERE start >= ? AND start <= ?",
        (quest["accepted_at"], end),
    ).fetchall()
    for r in rows:
        if category(r["type"]) in WRIT_HARD_CATEGORIES and (r["moving_time"] or 0) >= WRIT_HARD_MIN_SECONDS:
            return r
    n = db.q(
        "SELECT COUNT(*) AS n FROM lift_sets WHERE ts >= ? AND ts <= ?",
        (quest["accepted_at"], end),
    ).fetchone()["n"]
    if n >= WRIT_HARD_MIN_SETS:
        return {"name": f"{n} sets at the iron", "type": "WeightTraining"}
    return None


def resolve_rest_writs():
    """Resolve active rest writs. Called from /api/state, /api/sync and the
    background loop — never from a user 'turn in' action.

    Same-day: a hard workout breaks the writ immediately (status 'broken',
    gentle notice, no penalty). The morning after: the writ completes as
    kept — rewards apply HERE, at resolution, including the streak stitch
    for the rested day (never deferred to bubble-tap time, so no completion
    on the new day can race the streak math)."""
    for q_ in active_quests():
        if q_["kind"] != "rest":
            continue
        writ_day = q_["details"].get("writ_day") or q_["accepted_at"][:10]
        hard = _writ_hard_activity(q_)
        if hard:
            db.q("UPDATE quests SET status='broken', completed_at=? WHERE id=?", (now_iso(), q_["id"]))
            db.commit()
            what = hard["name"] or hard["type"]
            db.log_event(now_iso(), "writ", f"The Rest Writ slipped away — {what} broke the stillness.")
            _queue_writ_notice({"type": "broken", "ts": now_iso(), "title": q_["title"], "detail": what})
        elif today() > writ_day:
            rewards = complete_quest(q_["id"], _writ=True)
            _queue_writ_notice({"type": "kept", "ts": now_iso(), "title": q_["title"], "rewards": rewards})


def _queue_writ_notice(n):
    lst = db.kv_get("writ_notices", [])
    lst.append(n)
    db.kv_set("writ_notices", lst[-10:])


def writ_notices_pending():
    """Read-only peek at unseen willow-bubble notices. Rewards were already
    applied at resolution, so sweeping stale notices (>3 days unseen) loses
    nothing but the moment."""
    lst = db.kv_get("writ_notices", [])
    cutoff = (now() - timedelta(days=3)).isoformat()
    fresh = [n for n in lst if n["ts"] >= cutoff]
    if len(fresh) != len(lst):
        db.kv_set("writ_notices", fresh)
    return fresh


def ack_writ_notice(ts=None):
    """The player tapped the willow's bubble — pop and return that notice."""
    lst = db.kv_get("writ_notices", [])
    if not lst:
        raise ValueError("The willow has nothing more for you.")
    idx = next((i for i, n in enumerate(lst) if n["ts"] == ts), 0) if ts else 0
    n = lst.pop(idx)
    db.kv_set("writ_notices", lst)
    return n


def get_offers(giver, reroll=False):
    key = f"offers:archetype-v2:{giver}:{today()}"
    bump_key = f"offerbump:{giver}:{today()}"
    bump = db.kv_get(bump_key, 0)
    if reroll:
        bump += 1
        db.kv_set(bump_key, bump)
        db.kv_del(key)
    cached = db.kv_get(key)
    if cached is None:
        rng = random.Random(f"{giver}:{today()}:{bump}")
        if giver == "running":
            cached = gen_endurance_offers(rng)
        elif giver == "kettlebell":
            cached = gen_lift_offers(rng)
        elif giver == "strength":
            cached = gen_climb_offers(rng)
        elif giver == "mobility":
            cached = gen_mobility_offers(rng)
        else:
            raise ValueError("unknown giver")
        for i, o in enumerate(cached):
            o["offer_id"] = i
        db.kv_set(key, cached)
    # an active doctrine's next session leads the offers (built fresh — weights progress)
    if giver == "kettlebell":
        from . import programs
        po = programs.build_program_offer(giver)
        if po:
            po["offer_id"] = 99
            return [po] + cached[:2]
    # a rest writ leads Elowen's offers (built fresh — the omens change with each sync)
    if giver == "mobility":
        ro = rest_writ_offer()
        if ro:
            ro["offer_id"] = 98
            return [ro] + cached[:2]
    return cached


# ---------------- quest lifecycle ----------------

def active_quests():
    rows = db.q("SELECT * FROM quests WHERE status='active' ORDER BY accepted_at").fetchall()
    return [_quest_row(r) for r in rows]


def _quest_row(r):
    import json
    return {
        "id": r["id"], "giver": r["giver"], "kind": r["kind"], "title": r["title"],
        "details": json.loads(r["details"]), "status": r["status"],
        "accepted_at": r["accepted_at"], "completed_at": r["completed_at"],
        "honor": bool(r["honor"]),
        "rewards": json.loads(r["rewards"]) if r["rewards"] else None,
    }


def accept_offer(giver, offer_id):
    import json
    for q_ in active_quests():
        if q_["giver"] == giver:
            raise ValueError(f"You already carry a quest from {GIVERS[giver]['name']}. Finish or abandon it first.")
    offers = get_offers(giver)
    offer = next((o for o in offers if o["offer_id"] == offer_id), None)
    if not offer:
        raise ValueError("That offer has faded.")
    cur = db.q(
        "INSERT INTO quests (giver, kind, title, details, status, accepted_at) VALUES (?,?,?,?, 'active', ?)",
        (giver, offer["kind"], offer["title"], json.dumps(offer), now_iso()),
    )
    db.commit()
    db.log_event(now_iso(), "quest", f"Accepted quest: {offer['title']}")
    return cur.lastrowid


def abandon_quest(quest_id):
    db.q("UPDATE quests SET status='abandoned' WHERE id=? AND status='active'", (quest_id,))
    db.commit()
    db.log_event(now_iso(), "quest", "A quest was abandoned. The Vale forgives; the ledger remembers.")


def find_matching_activity(quest):
    """Find an unlinked synced activity that satisfies this quest.

    modality set -> an activity of that category, >=70% target duration
                    (swim quests need swims, climb quests need climbs, ...)
    running      -> a run of >=70% target duration (pre-modality quests)
    mobility     -> yoga/stretch/walk/hike of >=70% target duration
    lifting      -> a WeightTraining-type session of reasonable length
    """
    g = quest["giver"]
    details = quest["details"]
    if quest["kind"] == "rest":
        return None  # a rest writ is KEPT, not fulfilled — a yoga session must never "complete" it
    modality = details.get("modality")
    if modality in CATEGORIES:
        types = CATEGORIES[modality]
        need_s = details.get("target_minutes", 20) * 60 * 0.7
    elif g == "running":
        types = RUN_TYPES
        need_s = details.get("target_minutes", 20) * 60 * 0.7
    elif g == "mobility":
        types = CATEGORIES["mobility"] + CATEGORIES["walk"]
        need_s = details.get("target_minutes", 15) * 60 * 0.7
    else:  # kettlebell / strength
        types = CATEGORIES["strength"]
        need_s = max(15 * 60, details.get("total_sets", 12) * 90)
    ph = ",".join("?" * len(types))
    rows = db.q(
        f"SELECT * FROM activities WHERE type IN ({ph}) AND start >= ? "
        "AND id NOT IN (SELECT activity_id FROM quests WHERE activity_id IS NOT NULL) "
        "ORDER BY moving_time DESC",
        (*types, quest["accepted_at"]),
    ).fetchall()
    for r in rows:
        if (r["moving_time"] or 0) >= need_s:
            return r
    return None


def lift_progress(quest):
    row = db.q(
        "SELECT COUNT(*) AS n FROM lift_sets WHERE quest_id=?", (quest["id"],)
    ).fetchone()
    return row["n"]


def quest_completable(quest):
    """Returns (auto_ok, progress_note, activity_row_or_none)."""
    g = quest["giver"]
    if quest["kind"] == "rest":
        if _writ_hard_activity(quest):
            return False, "The iron called and you answered — the writ will slip away quietly.", None
        if today() > quest["details"].get("writ_day", quest["accepted_at"][:10]):
            return False, "Dawn has come. The writ resolves itself — the willow will send word.", None
        return False, "The writ holds until dawn. Gentle walks and stretches are permitted — encouraged, even.", None
    act = find_matching_activity(quest)
    if act:
        return True, f"Matched: {act['name'] or act['type']} ({round((act['moving_time'] or 0)/60)} min)", act
    modality = quest["details"].get("modality")
    if modality in ("ride", "swim", "climb"):
        label = {"ride": "ride", "swim": "swim", "climb": "climb session"}[modality]
        return False, f"No matching {label} found yet. Sync your log, or swear on your honor.", None
    if g == "running":
        return False, "No matching run found yet. Sync your log, or swear on your honor.", None
    if g in ("kettlebell", "strength"):
        need = quest["details"].get("total_sets", 12)
        done = lift_progress(quest)
        if done >= math.ceil(need * 0.6):
            return True, f"{done}/{need} sets logged.", None
        return False, f"{done}/{need} sets logged (need {math.ceil(need*0.6)}) — or a synced lifting session will do.", None
    return False, "No matching session synced yet. Honor also accepted.", None


def auto_complete_ready():
    """Complete active quests satisfied by a SYNCED activity. Called after each sync.
    (Set-count progress never auto-completes — you might still be mid-workout.)"""
    done = []
    for q_ in active_quests():
        if find_matching_activity(q_):
            try:
                rewards = complete_quest(q_["id"])
                done.append({"id": q_["id"], "title": q_["title"], "giver": q_["giver"], "rewards": rewards})
            except ValueError:
                pass
    return done


def reconcile_honor_completions(slug):
    """Replace a counted honor activity with its later tracker record when unambiguous."""
    rows = db.q(
        "SELECT q.*, a.id AS synthetic_id, a.start AS synthetic_start, "
        "a.type AS synthetic_type, a.moving_time AS synthetic_seconds "
        "FROM quests q JOIN activities a ON a.id=q.activity_id "
        "WHERE q.status='done' AND q.honor=1 AND a.source='honor'"
    ).fetchall()
    reconciled = 0
    for row in rows:
        synthetic_seconds = row["synthetic_seconds"] or 0
        if not synthetic_seconds:
            continue
        candidates = db.q(
            "SELECT * FROM activities WHERE source='intervals.icu' AND start LIKE ? "
            "AND id NOT IN (SELECT activity_id FROM quests WHERE activity_id IS NOT NULL)",
            (row["synthetic_start"][:10] + "%",),
        ).fetchall()
        max_gap = max(15 * 60, int(synthetic_seconds * 0.5))
        matches = [
            activity for activity in candidates
            if category(activity["type"]) == category(row["synthetic_type"])
            and abs((activity["moving_time"] or 0) - synthetic_seconds) <= max_gap
        ]
        if len(matches) != 1:
            continue
        tracker = matches[0]
        raid.mark_reconciled_activity(slug, row["synthetic_id"], tracker["id"])
        db.q("UPDATE quests SET activity_id=? WHERE id=?", (tracker["id"], row["id"]))
        db.q("DELETE FROM activities WHERE id=?", (row["synthetic_id"],))
        db.log_event(
            now_iso(), "reconcile",
            f"The ravens found the true record for '{row['title']}'. Wick struck out its honor duplicate.",
        )
        reconciled += 1
    if reconciled:
        db.commit()
    return reconciled


def invalidate_offers():
    """New training data arrived — regenerate today's quest offers from it."""
    db.q("DELETE FROM kv WHERE key LIKE 'offers:%'")
    db.commit()


def _update_streak(c, effective=None):
    """Bump the daily streak; returns True on a 5-day milestone.

    `effective` backdates the credit (ISO date). Rest writs resolve the
    morning AFTER the rested day but must stitch THAT day into the streak —
    otherwise resting would read as a broken streak, which is the exact
    thing the writ exists to prevent. Never rewinds: if a later day is
    already credited, the stitch is a no-op."""
    streak = c["streak"]
    t = effective or today()
    last = streak["last"]
    if last == t or (last and last > t):
        pass  # that day (or a later one) is already credited
    elif last == (datetime.fromisoformat(t).date() - timedelta(days=1)).isoformat():
        streak["count"] += 1
    else:
        streak["count"] = 1
    streak["last"] = max(last, t) if last else t
    streak["best"] = max(streak.get("best", 0), streak["count"])
    return streak["count"] > 0 and streak["count"] % 5 == 0


def complete_quest(quest_id, honor=False, _writ=False):
    import json
    row = db.q("SELECT * FROM quests WHERE id=? AND status='active'", (quest_id,)).fetchone()
    if not row:
        raise ValueError("No such active quest.")
    quest = _quest_row(row)
    if quest["kind"] == "rest":
        # a writ keeps itself — only resolve_rest_writs() may complete it,
        # and honor completion would mean swearing the night ended early
        if not _writ:
            raise ValueError("A writ is not turned in — it keeps itself until dawn.")
        auto_ok, note, act = True, "The writ was kept. Dawn found you rested.", None
    else:
        auto_ok, note, act = quest_completable(quest)
        if not auto_ok and not honor:
            raise ValueError(note)

    details = quest["details"]
    # honor completions still enter the historical record as a typed activity
    linked_id = act["id"] if act else None
    if not act and honor:
        from . import intervals
        # the synthetic activity's type follows the quest's modality so the
        # calendar/records stay truthful — an honored swim IS a swim
        modality_types = {"run": "Run", "ride": "Ride", "swim": "Swim", "climb": "Climbing"}
        giver_types = {"running": "Run", "mobility": "Yoga", "kettlebell": "WeightTraining", "strength": "WeightTraining"}
        act_type = modality_types.get(details.get("modality")) or giver_types.get(quest["giver"], "Workout")
        mins = details.get("target_minutes") or details.get("total_sets", 12) * 3
        linked_id = intervals.add_manual_activity({
            "type": act_type, "minutes": mins,
            "name": quest["title"] + " (honor)", "source": "honor",
        })
    rng = random.Random()
    c = get_char()
    xp = details.get("xp", 40)
    gold = details.get("gold", 15) + rng.randint(1, 12)
    vigor = details.get("vigor", 2) + details.get("bonus_vigor", 0)
    token = rng.random() < (0.55 if details.get("intensity") == "hard" else 0.3)
    drop = "monster_pack" if rng.random() < 0.06 else None  # rare treat; gear lives in the dungeon now

    # stat gains by discipline
    gains = {}
    g = quest["giver"]
    if g == "running":
        gains["end"] = 2 if details.get("intensity") == "hard" else 1
    elif g in ("kettlebell", "strength"):
        gains["str"] = 2 if details.get("intensity") == "hard" else 1
    elif g == "mobility":
        gains["spr"] = 1

    # a kept writ credits the RESTED day (yesterday), not the resolution day
    streak_effective = details.get("writ_day") if quest["kind"] == "rest" else None
    streak_bonus = _update_streak(c, effective=streak_effective)
    streak = c["streak"]
    if streak_bonus:
        gains["con"] = gains.get("con", 0) + 1

    for k, v in gains.items():
        c["stats"][k] = min(99, c["stats"][k] + v)
    levels = apply_xp(c, xp)
    c["gold"] += gold
    c["vigor"] = min(10, c["vigor"] + vigor)
    if token:
        c["tokens"] += 1
    if drop:
        db.inv_add(drop)
    c["quests_done"] += 1
    save_char(c)

    rewards = {
        "xp": xp, "gold": gold, "vigor": vigor, "token": token,
        "item": items.get(drop) if drop else None,
        "stat_gains": gains, "levels": levels, "level": c["level"],
        "streak": streak["count"], "streak_bonus": streak_bonus,
        "note": note if auto_ok else "Completed on your honor.",
    }
    db.q(
        "UPDATE quests SET status='done', completed_at=?, honor=?, activity_id=?, rewards=? WHERE id=?",
        (now_iso(), 0 if auto_ok else 1, linked_id, json.dumps(rewards), quest_id),
    )
    db.commit()
    db.log_event(now_iso(), "quest_done", f"Completed '{quest['title']}' — +{xp} XP, +{gold} gold" + (f", LEVEL UP to {c['level']}!" if levels else ""))
    if quest["kind"].startswith("program:"):
        from . import programs
        programs.advance(quest["kind"][8:])
    return rewards


def claim_deed(kind, minutes, note=""):
    """A sworn-but-unverified deed via Wick the Scrivener. Prorated rewards."""
    from . import intervals
    ct = CLAIM_TYPES.get(kind)
    if not ct:
        raise ValueError("Wick has no column in his ledger for that.")
    minutes = max(5, min(300, int(minutes)))
    rng = random.Random()
    c = get_char()
    xp = int(minutes * ct["factor"] * 2.2 * CLAIM_PRORATE)
    gold = int(xp * 0.45) + rng.randint(0, 6)
    vigor = 2 if minutes >= 45 else 1
    gains = {ct["stat"]: 1}
    streak_bonus = _update_streak(c)
    if streak_bonus:
        gains["con"] = gains.get("con", 0) + 1
    for k, v in gains.items():
        c["stats"][k] = min(99, c["stats"][k] + v)
    levels = apply_xp(c, xp)
    c["gold"] += gold
    c["vigor"] = min(10, c["vigor"] + vigor)
    save_char(c)
    name = (note or ct["label"]).strip()[:60] + " (sworn)"
    intervals.add_manual_activity({"type": ct["type"], "minutes": minutes, "name": name, "source": "sworn"})
    db.log_event(now_iso(), "claim", f"Sworn before Wick: {name}, {minutes} min — +{xp} XP (prorated).")
    return {
        "xp": xp, "gold": gold, "vigor": vigor, "token": False, "item": None,
        "stat_gains": gains, "levels": levels, "level": c["level"],
        "streak": c["streak"]["count"], "streak_bonus": streak_bonus,
        "note": "Sworn without witness — Wick pays seven coins in ten.",
    }


# ---------------- unguided runs (no quest accepted, Fenn pays anyway) ----------------

MIN_UNGUIDED_MINUTES = 8

UNGUIDED_TITLE_FLAVOR = {
    "run": ["The Unsworn Run", "The Road Without a Writ", "The Unbidden Pace"],
    "ride": ["The Unsworn Circuit", "The Road Without a Writ", "The Unbidden Ride"],
    "climb": ["The Unsworn Ascent", "The Wall Without a Writ", "The Unbidden Crux"],
    "strength": ["The Unsworn Iron", "The Lift Without a Writ", "The Unbidden Forge"],
    "mobility": ["The Unscripted Flow", "The Willow Without a Writ", "The Unbidden Stretch"],
    "walk": ["The Unsworn Waymark", "The Road Without a Writ", "The Unbidden Ramble"],
    "swim": ["The Uncharted Current", "The Crossing Without a Writ", "The Unsworn Stroke"],
    "other": ["The Unwritten Workout", "The Deed Without a Writ", "The Unbidden Effort"],
}

UNGUIDED_ACTIVITY_LABELS = {
    "run": "a run", "ride": "a ride", "climb": "a climb", "strength": "a workout",
    "mobility": "a mobility session", "walk": "a walk", "swim": "a swim",
    "other": "a workout",
}

UNGUIDED_STAT_BY_CATEGORY = {
    "run": "end", "ride": "end", "walk": "end", "swim": "end",
    "climb": "str", "strength": "str", "mobility": "spr", "other": "con",
}

DEED_GIVER_BY_CATEGORY = {
    "run": "running", "ride": "running", "walk": "running", "swim": "running",
    "climb": "strength", "strength": "kettlebell",
    "mobility": "mobility",
    "other": "wick",
}

DEED_NOTES = {
    "running": [
        "Fenn saw you out there, oath or no oath, and paid you anyway.",
        "No quest was sworn for this one. The road told him regardless.",
        "You trained without asking. Fenn noticed. Fenn always notices.",
    ],
    "kettlebell": [
        "You swung without her blessing. The bell heard it anyway.",
        "Sweat without a writ still rings true. Grunhilda pays what rings true.",
        "The forge does not ask who ordered the fire. Well struck.",
    ],
    "strength": [
        "The wall remembers every move, sworn or not. Ser Bram settles his debts.",
        "You climbed without orders. Good. Initiative suits you.",
        "The keep watched you on the stone. A knight pays what honor owes.",
    ],
    "mobility": [
        "Stillness taken unbidden is stillness all the same.",
        "The willow saw you bend, and it approves. Quietly.",
        "No writ asked for this practice. The practice counts. It always counts.",
    ],
    "wick": [
        "This deed reached the ledger without a writ. Wick recorded it anyway.",
        "Unsworn and unasked — still ink-worthy. Signed, sealed, paid.",
        "The record keeps what the road forgets. Your pay, per the ledger.",
    ],
}


def deed_giver(activity_type):
    return DEED_GIVER_BY_CATEGORY.get(category(activity_type), "wick")


def _unguided_title(activity_type, activity_id):
    flavors = UNGUIDED_TITLE_FLAVOR.get(category(activity_type), UNGUIDED_TITLE_FLAVOR["other"])
    return random.Random(f"unguided-title:{activity_id}").choice(flavors)


def _unguided_stat_gains(activity_type):
    stat = UNGUIDED_STAT_BY_CATEGORY.get(category(activity_type), "con")
    return {stat: 1}


def _unguided_completion_title(cand):
    return cand.get("title") or f"A Deed Unsworn — {cand.get('activity_name') or 'the road'}"


def grant_unguided_run_bonus():
    _sweep_stale_unguided_candidates()
    t = today()
    seen_key = f"unguided_bonus_seen:{t}"
    seen = set(db.kv_get(seen_key, []))
    rows = db.q(
        "SELECT * FROM activities WHERE start >= ? AND source='intervals.icu' "
        "AND id NOT IN (SELECT activity_id FROM quests WHERE activity_id IS NOT NULL) "
        "ORDER BY start ASC",
        (t,),
    ).fetchall()
    rng = random.Random()
    candidates = db.kv_get("unguided_bonus_candidates", [])
    dirty = False
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        dirty = True
        minutes = (r["moving_time"] or 0) / 60
        if minutes < MIN_UNGUIDED_MINUTES:
            continue
        activity_type = r["type"] or "Workout"
        activity_category = category(activity_type)
        giver = deed_giver(activity_type)
        xp = int(minutes * 1.35 * 2.2)  # priced as a "moderate" quest, per _price_offer
        candidates.append({
            "activity_id": r["id"],
            "activity_name": r["name"] or UNGUIDED_ACTIVITY_LABELS[activity_category],
            "activity_type": activity_type,
            "category": activity_category,
            "giver": giver,
            "title": _unguided_title(activity_type, r["id"]),
            "minutes": round(minutes),
            "date": t,
            "xp": xp,
            "gold": int(xp * 0.45) + rng.randint(1, 12),
            "vigor": 2,
            "token": rng.random() < 0.3,
            "drop": "monster_pack" if rng.random() < 0.06 else None,
            "stat_gains": _unguided_stat_gains(activity_type),
            "note": rng.choice(DEED_NOTES[giver]),
        })
    if dirty:
        db.kv_set(seen_key, list(seen))
        db.kv_set("unguided_bonus_candidates", candidates)


def _record_unguided_completion(cand, rewards, completed_at):
    import json

    # No dedup guard needed here: _apply_unguided_bonus already refuses to pay
    # (and thus never reaches this) when the activity is linked to any quest.
    activity = db.q("SELECT start FROM activities WHERE id=?", (cand["activity_id"],)).fetchone()
    accepted_at = activity["start"] if activity else completed_at
    title = _unguided_completion_title(cand)
    details = {
        "unguided": True,
        "activity_id": cand["activity_id"],
        "target_minutes": cand["minutes"],
        "activity_type": cand.get("activity_type"),
        "category": cand.get("category"),
    }
    db.q(
        "INSERT INTO quests (giver, kind, title, details, status, accepted_at, completed_at, "
        "honor, activity_id, rewards) VALUES (?,?,?,?, 'done', ?, ?, 0, ?, ?)",
        ("running", "unguided_activity", title, json.dumps(details), accepted_at,
         completed_at, cand["activity_id"], json.dumps(rewards)),
    )
    db.commit()


def _activity_already_rewarded(activity_id):
    """True if this activity is linked to any completed quest — a sworn quest
    it fulfilled, or a prior unguided payout. The single source of truth for
    'has this deed already paid out', so Fenn never rewards the same activity
    twice regardless of what order things happened in."""
    return bool(db.q(
        "SELECT 1 FROM quests WHERE activity_id=? LIMIT 1", (activity_id,)
    ).fetchone())


def _apply_unguided_bonus(cand):
    """Actually mutate the character for a queued candidate — used both by a
    real click (claim_unguided_bonus) and by the silent day-passed sweep.
    Streak/level math reads the CURRENT character state at apply time (not
    whatever it was back when the run was first detected), since other
    things may have happened to the character in between.

    Returns None (paying nothing) if the activity has since been linked to a
    quest: a candidate can be queued before an activity is used to complete a
    sworn quest, and that quest's reward already covered the work."""
    if _activity_already_rewarded(cand.get("activity_id")):
        return None
    c = get_char()
    gains = dict(cand["stat_gains"])
    streak_bonus = _update_streak(c)
    if streak_bonus:
        gains["con"] = gains.get("con", 0) + 1
    for k, v in gains.items():
        c["stats"][k] = min(99, c["stats"][k] + v)
    levels = apply_xp(c, cand["xp"])
    c["gold"] += cand["gold"]
    c["vigor"] = min(10, c["vigor"] + cand["vigor"])
    if cand["token"]:
        c["tokens"] += 1
    if cand["drop"]:
        db.inv_add(cand["drop"])
    save_char(c)
    rewards = {
        "xp": cand["xp"], "gold": cand["gold"], "vigor": cand["vigor"], "token": cand["token"],
        "item": items.get(cand["drop"]) if cand["drop"] else None,
        "stat_gains": gains, "levels": levels, "level": c["level"],
        "streak": c["streak"]["count"], "streak_bonus": streak_bonus,
        "note": cand["note"], "quest_title": _unguided_completion_title(cand),
    }
    completed_at = now_iso()
    _record_unguided_completion(cand, rewards, completed_at)
    db.log_event(
        completed_at, "unguided_activity",
        f"Fenn rewarded an unguided activity ({cand['minutes']} min) — +{cand['xp']} XP, +{cand['gold']} gold"
        + (f", LEVEL UP to {c['level']}!" if levels else ""),
    )
    return rewards


def _sweep_stale_unguided_candidates():
    """A candidate dated before today means a full day passed with nobody
    tapping the bubble — Fenn just pays quietly, with no bubble at all
    (there's no "same-day surprise" left to show)."""
    t = today()
    cands = db.kv_get("unguided_bonus_candidates", [])
    fresh = [c for c in cands if c["date"] == t]
    stale = [c for c in cands if c["date"] != t]
    for cand in stale:
        _apply_unguided_bonus(cand)
    if stale:
        db.kv_set("unguided_bonus_candidates", fresh)


def unguided_pending():
    """Read-only peek at today's still-unclaimed bubbles — never mutates the
    character; claiming is an explicit action (claim_unguided_bonus)."""
    _sweep_stale_unguided_candidates()
    cands = db.kv_get("unguided_bonus_candidates", [])
    for c in cands:
        # candidates queued before per-giver attribution lack the field;
        # they were all Fenn's back then (load-bearing JSON: .setdefault)
        c.setdefault("giver", "running")
    return cands


def claim_unguided_bonus(activity_id=None):
    """The player tapped Fenn's bubble — grant the reward now. Claims the
    given activity_id if provided, else the oldest still-pending one."""
    cands = db.kv_get("unguided_bonus_candidates", [])
    if not cands:
        raise ValueError("No deed waits to be claimed today.")
    idx = 0
    if activity_id:
        idx = next((i for i, c in enumerate(cands) if c["activity_id"] == activity_id), 0)
    cand = cands.pop(idx)
    db.kv_set("unguided_bonus_candidates", cands)
    rewards = _apply_unguided_bonus(cand)
    if rewards is None:
        # Activity got linked to a quest between queuing and this tap — the
        # quest already paid for it. Drop the bubble, grant nothing.
        raise ValueError("Fenn already settled up for that one.")
    return rewards

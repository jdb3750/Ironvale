"""Core game engine: character, adaptive quest generation, rewards, economy, stats."""
import math
import random
import statistics
from datetime import datetime, timedelta

from . import db, exercises, items

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

GIVERS = {
    "running":  {"name": "Old Fenn",            "title": "the Wayfarer",   "sprite": "fenn"},
    "kettlebell": {"name": "Grunhilda",         "title": "Iron-Bell",      "sprite": "grunhilda"},
    "strength": {"name": "Ser Bram",            "title": "the Loadbearer", "sprite": "bram"},
    "mobility": {"name": "Sage Elowen",         "title": "of the Willow",  "sprite": "elowen"},
}


def now():
    return datetime.now().astimezone()


def now_iso():
    return now().isoformat(timespec="seconds")


def today():
    return now().date().isoformat()


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

def run_history(days=60):
    cutoff = (now() - timedelta(days=days)).isoformat()
    ph = ",".join("?" * len(RUN_TYPES))
    rows = db.q(
        f"SELECT * FROM activities WHERE type IN ({ph}) AND start >= ? ORDER BY start",
        (*RUN_TYPES, cutoff),
    ).fetchall()
    mins = [r["moving_time"] / 60 for r in rows if r["moving_time"]]
    if not mins:
        return {"n": 0, "median": 20, "p80": 25, "weekly_min": 0, "runs": rows}
    mins_sorted = sorted(mins)
    p80 = mins_sorted[min(len(mins_sorted) - 1, int(len(mins_sorted) * 0.8))]
    recent_cutoff = (now() - timedelta(days=28)).isoformat()
    recent = [r["moving_time"] / 60 for r in rows if r["start"] >= recent_cutoff and r["moving_time"]]
    return {
        "n": len(mins),
        "median": statistics.median(mins),
        "p80": p80,
        "weekly_min": round(sum(recent) / 4, 1),
        "runs": rows,
    }


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

LIFT_FLAVOR = {
    "kettlebell": ["The Iron Communion", "Trial of the Bell", "Grunhilda's Reckoning", "The Bell Tolls for Thee", "Rites of the Forge-Daughter"],
    "strength":   ["The Loadbearer's Oath", "Trial of Heavy Things", "The Squire's Burden", "Steel Shall Be Answered", "The Weight of Duty"],
}

MOBILITY_FLAVOR = ["The Willow's Lesson", "Unknotting the Rope", "The Patient Root", "Stillwater Rites", "The Long Exhale"]


def gen_running_offers(rng):
    h = run_history()
    amb = ambition_mult()
    med = h["median"]
    pool = []
    ez = _r5(med * 0.75 * amb)
    pool.append({
        "kind": "run_easy", "intensity": "low", "target_minutes": ez,
        "structure": f"Run {ez} minutes at an easy, conversational pace. Nose-breathing easy.",
        "blurb": "The roads are quiet. Keep them company.",
    })
    st = _r5(med * amb)
    pool.append({
        "kind": "run_steady", "intensity": "moderate", "target_minutes": st,
        "structure": f"Run {st} minutes at a steady, comfortable effort.",
        "blurb": "A courier's pace: not hurried, never idle.",
    })
    tempo_work = _r5(max(10, med * 0.5 * amb), lo=8)
    tempo_total = tempo_work + 15
    pool.append({
        "kind": "run_tempo", "intensity": "hard", "target_minutes": tempo_total,
        "structure": f"10 min easy warm-up, {tempo_work} min at tempo (comfortably hard, ~85%), 5 min cool-down.",
        "blurb": "Something is gaining on you. Do not let it.",
    })
    reps = max(4, min(8, int(med / 4)))
    ivl_total = 10 + reps * 4 + 5
    pool.append({
        "kind": "run_intervals", "intensity": "hard", "target_minutes": ivl_total,
        "structure": f"10 min warm-up, then {reps} x (2 min hard / 2 min easy jog), 5 min cool-down.",
        "blurb": "Strike like lightning. Rest like rain. Repeat.",
    })
    if h["n"] >= 3:
        lng = _r5(min(max(h["p80"] * 1.15, med * 1.35) * amb, med * 2.0))
        pool.append({
            "kind": "run_long", "intensity": "moderate", "target_minutes": lng,
            "structure": f"Run {lng} minutes at an easy-to-steady effort. Slow is fine. Stopping is not.",
            "blurb": "The far cairn will not visit itself.",
        })
    hill_reps = max(4, min(8, int(med / 4)))
    pool.append({
        "kind": "run_hills", "intensity": "hard", "target_minutes": 10 + hill_reps * 3 + 5,
        "structure": f"10 min warm-up, then {hill_reps} x (45-60 sec uphill hard, walk down), 5 min cool-down.",
        "blurb": "The hill was here first. Show it respect, then defeat it.",
    })
    offers = rng.sample(pool, min(3, len(pool)))
    for o in offers:
        o["title"] = rng.choice(RUN_FLAVOR[o["kind"].split("_")[1]])
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


def _build_routine(rng, chosen, style):
    routine = []
    for name in chosen:
        unit, lo, hi = exercises.EXERCISES[name]["scheme"]
        if style == "strength":
            sets, reps = 4, lo
        elif style == "volume":
            sets, reps = 3, hi
        else:  # circuit
            sets, reps = 3, int((lo + hi) / 2)
        w = last_weight(name)
        routine.append({
            "exercise": name, "sets": sets, "reps": reps, "unit": unit,
            "suggest_weight": w,
            "groups": exercises.EXERCISES[name]["groups"],
        })
    return routine


def gen_lift_offers(rng, giver):
    names = exercises.KB_NAMES if giver == "kettlebell" else exercises.GYM_NAMES
    rec = muscle_recency()
    # stale-first: groups untrained the longest get priority
    ranked = sorted(exercises.GROUPS, key=lambda g: -rec[g]["days_since"])
    offers = []
    styles = ["strength", "volume", "circuit"]
    rng.shuffle(styles)
    focus_sets = [ranked[0:2], ranked[1:3], [ranked[0], ranked[3]]]
    style_desc = {
        "strength": "Heavy and low. Rest well between sets.",
        "volume": "Lighter, more reps. Chase the burn.",
        "circuit": "Move briskly between exercises, minimal rest.",
    }
    for i in range(3):
        style = styles[i % len(styles)]
        focus = focus_sets[i]
        chosen = _pick_exercises(rng, names, focus)
        routine = _build_routine(rng, chosen, style)
        total_sets = sum(r["sets"] for r in routine)
        o = {
            "kind": f"lift_{style}",
            "giver": giver,
            "title": rng.choice(LIFT_FLAVOR[giver]),
            "intensity": "hard" if style == "strength" else "moderate",
            "focus": focus,
            "style": style,
            "routine": routine,
            "structure": style_desc[style],
            "blurb": f"Focus: {', '.join(focus)}. {style_desc[style]}",
            "total_sets": total_sets,
        }
        _price_offer(o, minutes=total_sets * 3, intensity=o["intensity"])
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


def get_offers(giver, reroll=False):
    key = f"offers:{giver}:{today()}"
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
            cached = gen_running_offers(rng)
        elif giver in ("kettlebell", "strength"):
            cached = gen_lift_offers(rng, giver)
        elif giver == "mobility":
            cached = gen_mobility_offers(rng)
        else:
            raise ValueError("unknown giver")
        for i, o in enumerate(cached):
            o["offer_id"] = i
        db.kv_set(key, cached)
    # an active doctrine's next session leads the offers (built fresh — weights progress)
    if giver in ("kettlebell", "strength"):
        from . import programs
        po = programs.build_program_offer(giver)
        if po:
            po["offer_id"] = 99
            return [po] + cached[:2]
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

    running  -> a run of >=70% target duration
    mobility -> yoga/stretch/walk/hike of >=70% target duration
    lifting  -> a WeightTraining-type session of reasonable length
    """
    g = quest["giver"]
    details = quest["details"]
    if g == "running":
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
    act = find_matching_activity(quest)
    if act:
        return True, f"Matched: {act['name'] or act['type']} ({round((act['moving_time'] or 0)/60)} min)", act
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


def invalidate_offers():
    """New training data arrived — regenerate today's quest offers from it."""
    db.q("DELETE FROM kv WHERE key LIKE 'offers:%'")
    db.commit()


def _update_streak(c):
    """Bump the daily streak; returns True on a 5-day milestone."""
    streak = c["streak"]
    t = today()
    if streak["last"] == t:
        pass
    elif streak["last"] == (now().date() - timedelta(days=1)).isoformat():
        streak["count"] += 1
    else:
        streak["count"] = 1
    streak["last"] = t
    streak["best"] = max(streak.get("best", 0), streak["count"])
    return streak["count"] > 0 and streak["count"] % 5 == 0


def complete_quest(quest_id, honor=False):
    import json
    row = db.q("SELECT * FROM quests WHERE id=? AND status='active'", (quest_id,)).fetchone()
    if not row:
        raise ValueError("No such active quest.")
    quest = _quest_row(row)
    auto_ok, note, act = quest_completable(quest)
    if not auto_ok and not honor:
        raise ValueError(note)

    details = quest["details"]
    # honor completions still enter the historical record as a typed activity
    linked_id = act["id"] if act else None
    if not act and honor:
        from . import intervals
        type_map = {"running": "Run", "mobility": "Yoga", "kettlebell": "WeightTraining", "strength": "WeightTraining"}
        mins = details.get("target_minutes") or details.get("total_sets", 12) * 3
        linked_id = intervals.add_manual_activity({
            "type": type_map.get(quest["giver"], "Workout"), "minutes": mins,
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

    streak_bonus = _update_streak(c)
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

UNGUIDED_RUN_NOTES = [
    "Fenn saw you out there, oath or no oath, and paid you anyway.",
    "No quest was sworn for this one. The road told him regardless.",
    "You ran without asking. Fenn noticed. Fenn always notices.",
]


def grant_unguided_run_bonus():
    """Old Fenn notices a run that arrived with no accepted running quest to
    catch it, and queues it as an unclaimed candidate — same payout math as
    one of his moderate-intensity quests, but NOT actually applied to the
    character yet. The reward only lands when the player taps his speech
    bubble (see claim_unguided_bonus); if a full calendar day passes
    unclaimed, it's paid out silently instead, with no bubble at all (see
    _sweep_stale_unguided_candidates) — the whole point of the bubble was
    the same-day moment, so there's nothing to show once that's passed.

    Only looks at TODAY's activities actually synced from intervals.icu (so
    a first-time 400-day history import never floods this, and
    manual/honor/sworn entries — which already have their own reward path —
    never double-dip), skips entirely while a running quest is active, and
    dedupes per activity id per day (kv key baked with the date, same idiom
    as offer caching) so repeated sync ticks never queue the same run
    twice."""
    _sweep_stale_unguided_candidates()
    if db.q("SELECT 1 FROM quests WHERE giver='running' AND status='active'").fetchone():
        return
    t = today()
    seen_key = f"unguided_bonus_seen:{t}"
    seen = set(db.kv_get(seen_key, []))
    ph = ",".join("?" * len(RUN_TYPES))
    rows = db.q(
        f"SELECT * FROM activities WHERE type IN ({ph}) AND start >= ? AND source='intervals.icu' "
        "AND id NOT IN (SELECT activity_id FROM quests WHERE activity_id IS NOT NULL) "
        "ORDER BY start ASC",
        (*RUN_TYPES, t),
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
            continue  # too short to count as a real run; still marked seen above
        xp = int(minutes * 1.35 * 2.2)  # priced as a "moderate" quest, per _price_offer
        candidates.append({
            "activity_id": r["id"],
            "activity_name": r["name"] or "a run",
            "minutes": round(minutes),
            "date": t,
            "xp": xp,
            "gold": int(xp * 0.45) + rng.randint(1, 12),
            "vigor": 2,
            "token": rng.random() < 0.3,
            "drop": "monster_pack" if rng.random() < 0.06 else None,
            "stat_gains": {"end": 1},
            "note": rng.choice(UNGUIDED_RUN_NOTES),
        })
    if dirty:
        db.kv_set(seen_key, list(seen))
        db.kv_set("unguided_bonus_candidates", candidates)


def _apply_unguided_bonus(cand):
    """Actually mutate the character for a queued candidate — used both by a
    real click (claim_unguided_bonus) and by the silent day-passed sweep.
    Streak/level math reads the CURRENT character state at apply time (not
    whatever it was back when the run was first detected), since other
    things may have happened to the character in between."""
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
        "note": cand["note"],
    }
    db.log_event(
        now_iso(), "unguided_run",
        f"Fenn rewarded an unguided run ({cand['minutes']} min) — +{cand['xp']} XP, +{cand['gold']} gold"
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
    return db.kv_get("unguided_bonus_candidates", [])


def claim_unguided_bonus(activity_id=None):
    """The player tapped Fenn's bubble — grant the reward now. Claims the
    given activity_id if provided, else the oldest still-pending one."""
    cands = db.kv_get("unguided_bonus_candidates", [])
    if not cands:
        raise ValueError("Fenn has nothing more to give you today.")
    idx = 0
    if activity_id:
        idx = next((i for i, c in enumerate(cands) if c["activity_id"] == activity_id), 0)
    cand = cands.pop(idx)
    db.kv_set("unguided_bonus_candidates", cands)
    return _apply_unguided_bonus(cand)


# ---------------- economy ----------------

def buy(item_id):
    it = items.get(item_id)
    if not it or it.get("price") is None:
        raise ValueError("Pip does not stock that.")
    c = get_char()
    if c["gold"] < it["price"]:
        raise ValueError("Not enough gold. Pip is sympathetic but firm.")
    c["gold"] -= it["price"]
    save_char(c)
    db.inv_add(item_id)
    db.log_event(now_iso(), "shop", f"Bought {it['name']} for {it['price']} gold.")
    return it


def crank(use_token):
    c = get_char()
    if use_token:
        if c["tokens"] < 1:
            raise ValueError("No brass tokens. Quests sometimes pay in them.")
        c["tokens"] -= 1
    else:
        if c["gold"] < items.GACHA_COST_GOLD:
            raise ValueError(f"The Krankwerk wants {items.GACHA_COST_GOLD} gold or a brass token.")
        c["gold"] -= items.GACHA_COST_GOLD
    save_char(c)
    item_id = items.gacha_roll(random.Random())
    db.inv_add(item_id)
    it = items.get(item_id)
    db.log_event(now_iso(), "gacha", f"The Krankwerk dispensed: {it['name']} ({it['rarity']}).")
    return it


# ---------------- stats & chronicle ----------------

def wellness_series(days=180):
    """days<=0 means "all time" — no cutoff at all."""
    if days and days > 0:
        cutoff = (now() - timedelta(days=days)).date().isoformat()
        rows = db.q("SELECT * FROM wellness WHERE date >= ? ORDER BY date", (cutoff,)).fetchall()
    else:
        rows = db.q("SELECT * FROM wellness ORDER BY date").fetchall()
    return [dict(r) for r in rows]


def insights():
    """Plain-spoken readings of the omens: wellness trends + training balance."""
    out = []
    week_acts = db.q(
        "SELECT type FROM activities WHERE start >= ?",
        ((now() - timedelta(days=7)).isoformat(),),
    ).fetchall()
    if week_acts:
        tally = {}
        for a in week_acts:
            cat = category(a["type"])
            tally[cat] = tally.get(cat, 0) + 1
        nice = {"run": "run", "ride": "ride", "climb": "climb", "strength": "lifting session",
                "mobility": "mobility session", "walk": "walk", "swim": "swim", "other": "other deed"}
        parts = [f"{n} {nice.get(k, k)}{'s' if n > 1 else ''}" for k, n in sorted(tally.items(), key=lambda x: -x[1])]
        out.append(["info", f"This week the ledger shows: {', '.join(parts)}."])
    rows = db.q(
        "SELECT * FROM wellness WHERE date >= ? ORDER BY date",
        ((now() - timedelta(days=60)).date().isoformat(),),
    ).fetchall()

    def vals(field, subset=None):
        src = subset if subset is not None else rows
        return [r[field] for r in src if r[field] is not None]

    def avg(v):
        return sum(v) / len(v) if v else None

    week, before = rows[-7:], rows[:-7]
    hrv_w, hrv_b = avg(vals("hrv", week)), avg(vals("hrv", before))
    if hrv_w and hrv_b:
        delta = (hrv_w - hrv_b) / hrv_b * 100
        if delta >= 4:
            out.append(["good", f"HRV runs {delta:.0f}% above your baseline. Recovery favors you — a hard quest would land well."])
        elif delta <= -4:
            out.append(["warn", f"HRV sits {abs(delta):.0f}% below baseline. Favor easy quests, or let Sage Elowen have you for a day."])
    rhr_w, rhr_b = avg(vals("resting_hr", week)), avg(vals("resting_hr", before))
    if rhr_w and rhr_b:
        d = rhr_w - rhr_b
        if d >= 3:
            out.append(["warn", f"Resting heart rate is up {d:.0f} bpm on the week. The body whispers before it shouts."])
        elif d <= -2:
            out.append(["good", f"Resting heart rate is down {abs(d):.0f} bpm — the engine grows quieter at idle."])
    vo2 = vals("vo2max")
    if len(vo2) >= 2 and abs(vo2[-1] - vo2[0]) >= 0.5:
        d = vo2[-1] - vo2[0]
        out.append(["good" if d > 0 else "info", f"VO2max moved {'+' if d > 0 else ''}{d:.1f} over ~two months (now {vo2[-1]:.1f})."])
    ctl = vals("ctl")
    if len(ctl) >= 28:
        d = ctl[-1] - ctl[-28]
        if d >= 3:
            out.append(["good", f"Fitness (CTL) climbed {d:.0f} points this month. The grind is working."])
        elif d <= -3:
            out.append(["info", f"Fitness (CTL) slipped {abs(d):.0f} points this month. The Vale takes no offense; it simply remembers."])
    sleep = avg(vals("sleep_secs", week))
    if sleep:
        h = sleep / 3600
        if h >= 7.5:
            out.append(["good", f"Sleeping {h:.1f}h a night this week. The forge of recovery runs hot — the body will take the work."])
        elif h >= 6.5:
            out.append(["info", f"Averaging {h:.1f}h of sleep this week. Passable, but an extra half-hour would pay dividends."])
        else:
            out.append(["warn", f"Only {h:.1f}h of sleep a night this week. Even heroes are mostly made in bed — protect the dark hours."])

    h = run_history()
    if h["n"] >= 4:
        out.append(["info", f"Typical run: {h['median']:.0f} min. Weekly volume: {h['weekly_min']:.0f} min. Quests are sized to this."])
    stale = [(g, m["days_since"]) for g, m in muscle_recency().items() if 10 <= m["days_since"] < 999]
    if stale:
        names = ", ".join(g for g, _ in sorted(stale, key=lambda x: -x[1])[:3])
        out.append(["warn", f"Neglected muscle groups: {names}. The givers will steer you there."])
    c = get_char()
    if c["streak"]["count"] >= 3:
        out.append(["good", f"A {c['streak']['count']}-day streak burns. Feed it."])
    if not out:
        out.append(["info", "The ravens have little to report yet. Link intervals.icu in Settings, or go make some history."])
    return out


def calendar_payload(year, month):
    from datetime import date as _date
    start = _date(year, month, 1)
    end = _date(year + (month == 12), month % 12 + 1, 1)
    days = {}

    def day(dstr):
        return days.setdefault(dstr, {"acts": [], "sets": 0, "quests": 0})

    for a in db.q(
        "SELECT * FROM activities WHERE start >= ? AND start < ? ORDER BY start",
        (start.isoformat(), end.isoformat()),
    ).fetchall():
        day(a["start"][:10])["acts"].append({
            "id": a["id"], "type": a["type"], "category": category(a["type"]),
            "name": a["name"], "minutes": round((a["moving_time"] or 0) / 60),
            "source": a["source"],
        })
    for r in db.q("SELECT ts FROM lift_sets WHERE ts >= ? AND ts < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        day(r["ts"][:10])["sets"] += 1
    for r in db.q("SELECT completed_at FROM quests WHERE status='done' AND completed_at >= ? AND completed_at < ?",
                  (start.isoformat(), end.isoformat())).fetchall():
        day(r["completed_at"][:10])["quests"] += 1
    return {"year": year, "month": month, "days": days}


def day_payload(dstr):
    acts = [dict(a) | {"category": category(a["type"]), "minutes": round((a["moving_time"] or 0) / 60)}
            for a in db.q("SELECT * FROM activities WHERE start LIKE ? ORDER BY start", (dstr + "%",)).fetchall()]
    sets_ = [dict(r) for r in db.q("SELECT * FROM lift_sets WHERE ts LIKE ? ORDER BY id", (dstr + "%",)).fetchall()]
    quests = [{"id": r["id"], "title": r["title"], "giver": r["giver"]}
              for r in db.q("SELECT * FROM quests WHERE status='done' AND completed_at LIKE ?", (dstr + "%",)).fetchall()]
    return {"date": dstr, "activities": acts, "sets": sets_, "quests": quests}


def stats_payload(wellness_days=180):
    c = get_char()
    weeks = []
    for i in range(11, -1, -1):
        start = (now().date() - timedelta(days=now().date().weekday() + 7 * i))
        end = start + timedelta(days=7)
        ph = ",".join("?" * len(RUN_TYPES))
        run = db.q(
            f"SELECT COALESCE(SUM(moving_time),0) AS s, COALESCE(SUM(distance),0) AS d, COUNT(*) AS n "
            f"FROM activities WHERE type IN ({ph}) AND start >= ? AND start < ?",
            (*RUN_TYPES, start.isoformat(), end.isoformat()),
        ).fetchone()
        lift = db.q(
            "SELECT COUNT(*) AS n, COALESCE(SUM(weight*reps),0) AS tonnage FROM lift_sets WHERE ts >= ? AND ts < ?",
            (start.isoformat(), end.isoformat()),
        ).fetchone()
        weeks.append({
            "week": start.isoformat(),
            "run_min": round(run["s"] / 60), "run_km": round(run["d"] / 1000, 1), "runs": run["n"],
            "sets": lift["n"], "tonnage": round(lift["tonnage"]),
        })
    prs = db.q(
        "SELECT exercise, MAX(weight) AS max_w, MAX(weight * (1 + reps/30.0)) AS e1rm, COUNT(*) AS sets "
        "FROM lift_sets GROUP BY exercise ORDER BY max_w DESC"
    ).fetchall()
    recent = db.q(
        "SELECT * FROM activities ORDER BY start DESC LIMIT 15"
    ).fetchall()
    return {
        "character": c,
        "weeks": weeks,
        "muscles": muscle_recency(),
        "prs": [dict(r) for r in prs],
        "recent_activities": [dict(r) | {"category": category(r["type"])} for r in recent],
        "run_summary": {k: v for k, v in run_history().items() if k != "runs"},
        "wellness": wellness_series(wellness_days),
        "insights": insights(),
    }


def chronicle(limit=60):
    rows = db.q("SELECT * FROM ledger ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    return [dict(r) for r in rows]

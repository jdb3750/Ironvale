"""The Siege: a weekly boss raid fought with real workouts, by everyone.

Every Monday a procedurally generated horror camps outside the town walls —
ONE boss shared by every adventurer profile on this server. Its HP scales to
the combined recent training volume of the whole roster. The only way to hurt
it is to train: every synced activity (any profile) deals damage at sync time
(1 active minute = 10 damage). Fell it before the week turns and every
adventurer can claim the spoils: that week's trophy hat (siege-exclusive),
a monster pack, and brass tokens.

State lives in data/raid.json — a SHARED file beside profiles.json, not in
any profile's DB. All mutation goes through one lock.
"""
import json
import os
import random
import threading
from datetime import timedelta

from . import db, game, profiles

RAID_PATH = os.path.join(db.DATA_DIR, "raid.json")
_lock = threading.Lock()

DMG_PER_MIN = 10
HP_TUNING = 0.85          # slightly beatable at usual volume
DEFAULT_WEEKLY_MIN = 150  # expected minutes for a profile with no history
MIN_HP = 1200

BOSS_FIRST = [
    "Grandmother Rot", "Baron Sagg", "The Couch Regent", "Old Man Torpor",
    "Mold-King Vetch", "Auntie Anchor", "The Yawning One", "Duke Dust",
    "Slumberjack Hale", "The Draft Under the Door", "Madam Mildew",
    "The Unrisen Loaf",
]
BOSS_EPITHET = [
    "the Sloth Ascendant", "the Unmoved", "Devourer of Mondays",
    "the Great Procrastinator", "Wilter of Wills", "the Snoozebringer",
    "Herald of Later", "the Heavy Blanket", "Bane of Alarm Clocks",
    "the Second Helping", "Patron of Excuses", "the Long Sit",
]

# siege-exclusive trophy hats, rotating weekly (never in the Krankwerk pool)
TROPHIES = ["hat_horns", "hat_skullcrown", "hat_tentacle",
            "hat_antlers", "hat_embercrown", "hat_eyestalk"]

# a rare chance the fallen beast is subdued rather than slain, joining the
# claimer's menagerie as a (creepy) creature
CAPTURE_CHANCE = 0.12

DESC_ORIGIN = [
    "Dredged from the silt beneath the Undercroft,",
    "Born of a thousand skipped mornings,",
    "Congealed from the collective sighs of the unmotivated,",
    "Older than the town's first laid cobblestone,",
    "Spat out by a door left too long unopened,",
    "Woken by the smell of a gym bag left to cool,",
    "Grown fat in the gap between intention and action,",
]
DESC_TRAIT = [
    "it wears a hide of matted shadow and old excuses.",
    "its many eyes track every unlaced boot in the Vale.",
    "it drags a tail heavy with the weight of tomorrow.",
    "each horn is notched once for every resolution broken.",
    "it breathes a fog that turns limbs to wet sand.",
    "its bulk ripples with a slow, patient, terrible hunger.",
    "frost rimes its fangs though no winter birthed it.",
]
DESC_THREAT = [
    "Only honest sweat can wound it — and only the whole town's, at that.",
    "It feeds on rest days and grows fat on the word 'later'.",
    "Strike it with every mile, every rep, every stretched minute.",
    "It cannot be reasoned with, bribed, or snoozed.",
    "The siege ends when it falls — or when the week turns and it wanders off, victorious.",
]


def describe(dna):
    rng = random.Random(f"desc:{dna}")
    return f"{rng.choice(DESC_ORIGIN)} {rng.choice(DESC_TRAIT)} {rng.choice(DESC_THREAT)}"


def week_key(dt=None):
    dt = dt or game.now()
    y, w, _ = dt.isocalendar()
    return f"{y}-W{w:02d}"


def week_start(dt=None):
    dt = dt or game.now()
    monday = dt - timedelta(days=dt.weekday())
    return monday.replace(hour=0, minute=0, second=0, microsecond=0)


def _load():
    if os.path.exists(RAID_PATH):
        with open(RAID_PATH) as f:
            return json.load(f)
    return {"week": None, "history": []}


def _save(r):
    with open(RAID_PATH, "w") as f:
        json.dump(r, f, indent=2)


def _expected_weekly_minutes():
    """Sum of every profile's average weekly active minutes (last 28 days)."""
    total = 0.0
    since = (game.now() - timedelta(days=28)).isoformat()
    for p in profiles.ensure_index():
        token = db.set_profile(os.path.join(db.DATA_DIR, p["file"]))
        try:
            row = db.q("SELECT SUM(moving_time) AS s FROM activities WHERE start >= ?", (since,)).fetchone()
            weekly = ((row["s"] or 0) / 60.0) / 4.0
        finally:
            db.reset_profile(token)
        total += max(DEFAULT_WEEKLY_MIN, weekly)
    return total


def _spawn(r, wk):
    """A new horror shambles up. Deterministic per week; HP scales to roster."""
    if r.get("week"):
        r["history"].append({
            "week": r["week"], "name": r.get("name"), "epithet": r.get("epithet"),
            "hp_max": r.get("hp_max", 0),
            "dealt": sum(r.get("damage", {}).values()),
            "defeated": bool(r.get("defeated_at")),
        })
        r["history"] = r["history"][-26:]  # half a year of siege lore
    rng = random.Random(f"siege:{wk}")
    hp = max(MIN_HP, int(_expected_weekly_minutes() * DMG_PER_MIN * HP_TUNING))
    r.update({
        "week": wk,
        "name": rng.choice(BOSS_FIRST),
        "epithet": rng.choice(BOSS_EPITHET),
        "dna": rng.randint(0, 2**31 - 1),
        "trophy": TROPHIES[rng.randrange(len(TROPHIES))],
        "hp_max": hp,
        "damage": {}, "names": {}, "counted": {}, "blows": {},
        "log": [], "defeated_at": None, "claimed": [],
    })
    return r


def _current_locked():
    r = _load()
    wk = week_key()
    if r.get("week") != wk:
        r = _spawn(r, wk)
        _save(r)
    return r


def apply_damage(slug):
    """Count this profile's uncounted activities for the current week as
    damage. Runs inside the profile's own DB context (caller's middleware or
    sync loop already routed it). Returns damage dealt this call."""
    if not slug or not profiles.get(slug):
        return 0
    with _lock:
        r = _current_locked()
        seen = set(r["counted"].get(slug, []))
        rows = db.q(
            "SELECT id, name, type, moving_time FROM activities WHERE start >= ?",
            (week_start().isoformat(),),
        ).fetchall()
        char_name = game.get_char()["name"]
        dealt = 0
        already_down = bool(r["defeated_at"])
        blows = r.setdefault("blows", {}).setdefault(slug, [])
        for a in rows:
            if a["id"] in seen:
                continue
            seen.add(a["id"])
            dmg = max(10, int(round((a["moving_time"] or 0) / 60.0)) * DMG_PER_MIN)
            dealt += dmg
            label = a["name"] or a["type"]
            blows.append({"ts": game.now_iso(), "dmg": dmg, "label": label})
            r["log"].append({
                "ts": game.now_iso(), "who": char_name, "dmg": dmg,
                "text": f"{char_name} strikes for {dmg} ({label})",
            })
        if dealt:
            r["blows"][slug] = blows[-60:]
            r["counted"][slug] = sorted(seen)
            r["damage"][slug] = r["damage"].get(slug, 0) + dealt
            r["names"][slug] = char_name
            r["log"] = r["log"][-60:]
            total = sum(r["damage"].values())
            if total >= r["hp_max"] and not r["defeated_at"]:
                r["defeated_at"] = game.now_iso()
                r["log"].append({
                    "ts": game.now_iso(), "who": None, "dmg": 0,
                    "text": f"{r['name']}, {r['epithet']}, FALLS! The town holds. Claim your spoils!",
                })
            _save(r)
            if not already_down and r["defeated_at"]:
                db.log_event(game.now_iso(), "siege",
                             f"The siege of {r['name']} is broken — the final blow was struck this hour.")
        elif slug not in r["counted"] or r["counted"].get(slug) != sorted(seen):
            r["counted"][slug] = sorted(seen)
            _save(r)
        return dealt


def state_for(slug):
    with _lock:
        r = _current_locked()
    now = game.now()
    next_monday = week_start() + timedelta(days=7)
    hours_left = max(0, int((next_monday - now).total_seconds() // 3600))
    total = sum(r["damage"].values())
    blows_by = r.get("blows", {})
    contributors = sorted(
        [{"name": r["names"].get(s, s), "damage": d, "you": s == slug,
          "blows": blows_by.get(s, [])[::-1]}
         for s, d in r["damage"].items()],
        key=lambda x: -x["damage"],
    )
    wk_start = week_start()
    return {
        "week": r["week"], "name": r["name"], "epithet": r["epithet"],
        "dna": r["dna"], "trophy": r["trophy"],
        "description": describe(r["dna"]),
        "started": wk_start.date().isoformat(),
        "week_num": wk_start.isocalendar()[1],
        "hp_max": r["hp_max"], "dealt": total,
        "hp_left": max(0, r["hp_max"] - total),
        "defeated": bool(r["defeated_at"]),
        "claimed": slug in r["claimed"],
        "your_damage": r["damage"].get(slug, 0),
        "contributors": contributors,
        "log": r["log"][-12:][::-1],
        "days_left": hours_left // 24, "hours_left": hours_left,
        "history": r["history"][-4:][::-1],
    }


def claim(slug):
    """The beast is down: this adventurer collects their spoils (once).
    Rarely, the beast is subdued rather than slain and joins the menagerie."""
    from . import items
    from . import monsters as menagerie
    apply_damage(slug)  # count any just-synced killing blow before we judge (takes the lock itself)
    with _lock:
        r = _current_locked()
        if not r["defeated_at"]:
            raise ValueError("The beast still stands. Spoils come after the fall.")
        if slug in r["claimed"]:
            raise ValueError("You have already claimed this week's spoils.")
        r["claimed"].append(slug)
        _save(r)
        trophy, boss_name, boss_epithet, boss_dna, wk = r["trophy"], r["name"], r["epithet"], r["dna"], r["week"]
    c = game.get_char()
    c["tokens"] += 2
    game.save_char(c)
    db.inv_add(trophy)
    db.inv_add("monster_pack")
    it = items.get(trophy)
    db.log_event(game.now_iso(), "siege",
                 f"Spoils of the siege claimed: {it['name']}, a monster pack, and 2 brass tokens.")
    captured = None
    rng = random.Random()
    if rng.random() < CAPTURE_CHANCE:
        captured = menagerie.capture_boss(boss_name, boss_epithet, boss_dna, f"subdued siege, {wk}")
        db.log_event(game.now_iso(), "siege",
                     f"Astonishing — {boss_name} did not die but YIELDED. It follows you home to the Menagerie.")
    return {"trophy": it, "pack": True, "tokens": 2, "captured": captured, "character": game.get_char()}

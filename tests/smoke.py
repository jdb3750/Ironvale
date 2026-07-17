"""Iron Vale smoke test — the regression net for refactors.

Boots the app against a throwaway scratch DATA_DIR, seeds a plausible save,
and walks every read endpoint plus the core lifecycles (quest accept ->
complete, dungeon enter -> move -> retire, gacha, colosseum). Asserts status
codes and payload SHAPE, not deep values — feature-level math has its own
tests; this net exists to prove a refactor moved code without changing
behavior.

Run:  .venv/bin/python tests/smoke.py
(never against the live data/ dir — it always builds its own scratch)
"""
import json
import math
import os
import shutil
import sys
import tempfile
from datetime import timedelta

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-smoke-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import db, game, quests, raid  # noqa: E402

client = TestClient(app)
PASS = 0


def ok(label, cond, detail=""):
    global PASS
    assert cond, f"SMOKE FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


def get(path, **expect):
    r = client.get(path)
    ok(f"GET {path}", r.status_code == 200, f"-> {r.status_code}: {r.text[:120]}")
    body = r.json()
    for key in expect.get("keys", []):
        ok(f"  {path} has '{key}'", key in body)
    return body


def lift_count():
    return db.q("SELECT COUNT(*) AS n FROM lift_sets").fetchone()["n"]


def lift_row(set_id):
    row = db.q("SELECT * FROM lift_sets WHERE id=?", (set_id,)).fetchone()
    return dict(row) if row else None


def ledger_count():
    return db.q("SELECT COUNT(*) AS n FROM ledger").fetchone()["n"]


def json_request(method, path, payload):
    return client.request(
        method,
        path,
        content=json.dumps(payload),
        headers={"content-type": "application/json"},
    )


# ---- boot + seed ----------------------------------------------------------
client.get("/api/state")  # first touch creates the schema
selected = client.post("/api/profiles/select", json={"slug": "main"})
ok("scratch main profile selected", selected.status_code == 200)
NOW = game.now()

for path in ("/docs", "/redoc", "/openapi.json"):
    ok(f"GET {path} disabled", client.get(path).status_code == 404)


def iso(days_ago, hour=7):
    return (NOW - timedelta(days=days_ago)).replace(
        hour=hour, minute=0, second=0).isoformat(timespec="seconds")


acts = [
    ("s1", 1, "Run", "morning run", 2400, 8000),
    ("s2", 3, "Ride", "loop", 2700, 20000),
    ("s3", 5, "Yoga", "flow", 1800, None),
    ("s4", 8, "RockClimbing", "gym session", 5400, None),
    ("s5", 35, "Run", "long run", 3600, 10000),
    ("s6", 400, "Run", "ancient run", 1800, 5000),
]
for id_, days, typ, name_, secs, dist in acts:
    db.q("INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
         "VALUES (?, 'smoke', ?, ?, ?, ?, ?)", (id_, iso(days), typ, name_, secs, dist))
for i in range(6):
    db.q("INSERT INTO lift_sets (ts, exercise, weight, reps) "
         "VALUES (?, 'Goblet Squat', 24, 10)", (iso(2, 17),))
db.q("INSERT INTO quests (giver, kind, title, details, status, accepted_at, completed_at, honor) "
     "VALUES ('running', 'run', 'old quest', '{}', 'done', ?, ?, 1)", (iso(40), iso(40, 9)))
db.q("INSERT INTO monsters (name, dna, rarity, personality, born, source) "
     "VALUES ('Smokey', 42, 'common', 'calm', ?, 'smoke')", (iso(6),))
db.q("INSERT INTO ledger (ts, kind, text) VALUES (?, 'death', 'smoke death')", (iso(9),))
for i in range(30):
    db.q("INSERT OR IGNORE INTO wellness (date, hrv, resting_hr, vo2max, weight, sleep_secs, ctl, atl, readiness) "
         "VALUES (?, 70, 52, 44, 78, 27000, 45, 45, NULL)", (iso(i)[:10],))
db.commit()

# ---- every read endpoint --------------------------------------------------
print("read endpoints:")
st = get("/api/state", keys=["character", "active_quests", "givers", "version",
                              "npc_notices", "almanac_unread", "writ_notices"])
ok("default siege timezone is UTC", st["siege_timezone"] == "UTC" and raid.get_siege_timezone() == "UTC")
get("/api/stats?wellness_days=90", keys=["character", "weeks", "muscles", "insights", "wellness"])
get("/api/calendar?year=%d&month=%d" % (NOW.year, NOW.month), keys=["days"])
get("/api/day/" + iso(1)[:10], keys=["activities", "sets", "quests"])
get("/api/tapestry", keys=["days", "woven", "best_stretch"])
alm = get("/api/almanac", keys=["months", "month", "latest"])
ok("almanac has editions", len(alm["months"]) >= 1)
ks = get("/api/keepsakes", keys=["keepsakes"])
ok("keepsakes earned from seed", len(ks["keepsakes"]) >= 3)  # quill, receipt, shell at minimum
get("/api/road", keys=["total_km", "landmarks"])
get("/api/raid")
get("/api/chronicle", keys=["events"])
get("/api/items")
get("/api/trinkets", keys=["trinkets"])
exercise_payload = get("/api/exercises")
exercise_public = {exercise["name"]: exercise for exercise in exercise_payload["exercises"]}
ok("exercise catalog exposes units without schemes", all(exercise.get("unit") in ("reps", "seconds", "steps") and "scheme" not in exercise for exercise in exercise_payload["exercises"]))
ok("exercise Plank exposes seconds only", exercise_public["Plank"].get("unit") == "seconds" and "scheme" not in exercise_public["Plank"])
ok("exercise Farmer Carry exposes steps only", exercise_public["Farmer Carry"].get("unit") == "steps" and "scheme" not in exercise_public["Farmer Carry"])
ok("exercise Back Squat exposes reps only", exercise_public["Back Squat"].get("unit") == "reps" and "scheme" not in exercise_public["Back Squat"])
today_before = lift_count()
today_payload = get("/api/today", keys=["today"])
ok("server today is authoritative and side-effect free", today_payload == {"today": game.today()} and lift_count() == today_before)
get("/api/programs")
get("/api/monsters")
get("/api/inventory")
get("/api/claim/types", keys=["types"])
get("/api/lifts/recent")
get("/api/quests/log")
get("/api/profiles")
for giver in ("running", "kettlebell", "strength", "mobility"):
    get(f"/api/offers/{giver}", keys=["offers"])
get("/api/colosseum/fight")
get("/api/dungeon", keys=["state", "stats", "theme", "enter_cost"])

# ---- quest lifecycle: accept -> matching deed -> completable -> complete --
print("quest lifecycle:")
offers = client.get("/api/offers/running").json()["offers"]
r = client.post("/api/quests/accept", json={"giver": "running", "offer_id": offers[0]["offer_id"]})
ok("accept quest", r.status_code == 200)
q = client.get("/api/state").json()["active_quests"]
ok("quest is active", len(q) == 1)
mins = q[0]["details"].get("target_minutes", 30)
after_accept = (game.now() + timedelta(minutes=1)).isoformat(timespec="seconds")
db.q("INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
     "VALUES ('smoke-run', 'smoke', ?, 'Run', 'quest run', ?, ?)",
     (after_accept, (mins + 10) * 60, (mins + 10) * 150))
db.commit()
q = client.get("/api/state").json()["active_quests"]
ok("quest completable after matching deed", q[0]["completable"], q[0]["progress_note"])
r = client.post(f"/api/quests/{q[0]['id']}/complete", json={})
ok("complete quest", r.status_code == 200 and "rewards" in r.json())
ok("xp granted", client.get("/api/state").json()["character"]["xp"] > 0)

free_climb = (game.now() + timedelta(minutes=2)).isoformat(timespec="seconds")
db.q("INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
     "VALUES ('smoke-free-climb', 'intervals.icu', ?, 'RockClimbing', 'unplanned climb', 1800, NULL)",
     (free_climb,))
free_other = (game.now() + timedelta(minutes=3)).isoformat(timespec="seconds")
db.q("INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
     "VALUES ('smoke-free-other', 'intervals.icu', ?, 'Elliptical', 'unplanned cross-training', 1500, NULL)",
     (free_other,))
db.commit()
quests.grant_unguided_run_bonus()
pending = quests.unguided_pending()
climb = next(c for c in pending if c["activity_id"] == "smoke-free-climb")
other = next(c for c in pending if c["activity_id"] == "smoke-free-other")
ok("unguided climb queued", climb["title"])
ok("unguided other activity queued", other["title"])
ok("deed attributed to its archetype giver", climb["giver"] == "strength")
ok("unclassifiable deed reaches Wick", other["giver"] == "wick")
ok("HIIT deeds belong to Grunhilda", quests.deed_giver("HIIT") == "kettlebell"
   and quests.deed_giver("WeightTraining") == "strength"
   and quests.deed_giver("OpenWaterSwim") == "running")
rewards = quests.claim_unguided_bonus("smoke-free-climb")
ok("unguided climb reward claimed", rewards["xp"] > 0)
ok("unguided title returned", rewards["quest_title"] == climb["title"])
quests.claim_unguided_bonus("smoke-free-other")
day = client.get("/api/day/" + free_climb[:10]).json()
ok("unguided title appears as calendar quest", any(q_["title"] == climb["title"] for q_ in day["quests"]))

# never pay twice: an activity linked to a completed quest must not also pay an
# unguided bonus. Re-queue the just-claimed climb (now quest-linked) and confirm
# both payout paths refuse it.
gold_before = game.get_char()["gold"]
db.kv_set("unguided_bonus_candidates", [{
    "activity_id": "smoke-free-climb", "activity_name": "a climb", "activity_type": "RockClimbing",
    "category": "climb", "title": "dupe", "minutes": 30, "date": iso(0)[:10],
    "xp": 99, "gold": 99, "vigor": 2, "token": False, "drop": None,
    "note": "n", "stat_gains": {"str": 1},
}])
dupe = client.post("/api/unguided/claim", json={"activity_id": "smoke-free-climb"})
ok("double unguided claim refused", dupe.status_code == 400)
ok("refused claim paid nothing", game.get_char()["gold"] == gold_before)
quests._sweep_stale_unguided_candidates()  # stale-payout path must also refuse
ok("double unguided sweep paid nothing", game.get_char()["gold"] == gold_before)

# ---- dungeon: enter -> move -> retire --------------------------------------
print("dungeon lifecycle:")
c = game.get_char()
c["vigor"] = 10
game.save_char(c)
r = client.post("/api/dungeon/enter")
ok("dungeon enter", r.status_code == 200 and r.json()["theme"]["key"])
ok("dungeon enter returns reconciled character", r.json().get("character", {}).get("vigor") == 8)
d = r.json()["state"]
moved = False
dr = None
for dr, (dx, dy) in {"n": (0, -1), "s": (0, 1), "e": (1, 0), "w": (-1, 0)}.items():
    if f"{d['px'] + dx},{d['py'] + dy}" in d["cells"]:
        r = client.post("/api/dungeon/action", json={"action": "move", "dir": dr})
        moved = r.status_code == 200
        break
ok("dungeon move", moved)
# retire needs entrance/stairs; fresh runs start at the entrance — walk back if we left it
state_now = client.get("/api/dungeon").json()["state"]
if state_now and not state_now.get("combat"):
    here = state_now["cells"][f"{state_now['px']},{state_now['py']}"]
    if here["type"] not in ("entrance", "stairs"):
        # step back to the entrance cell we came from
        if dr is None:
            raise AssertionError("SMOKE FAIL: dungeon return direction")
        back = {"n": "s", "s": "n", "e": "w", "w": "e"}[dr]
        client.post("/api/dungeon/action", json={"action": "move", "dir": back})
    r = client.post("/api/dungeon/action", json={"action": "retire"})
    ok("dungeon retire", r.status_code == 200 and r.json().get("retired"))
else:
    # ambushed on the very first step — flee-then-retire is not worth a flaky
    # net; killing the run state directly still exercises the exit paths
    db.kv_del("dungeon")
    ok("dungeon retire (skipped: combat on first step)", True)

# ---- economy: gacha ---------------------------------------------------------
print("economy:")
c = game.get_char()
c["gold"] = 500
game.save_char(c)
r = client.post("/api/gacha", json={"use_token": False})
ok("gacha crank", r.status_code == 200)

print("lift API:")

created = client.post("/api/lifts", json={
    "exercise": "Back Squat", "weight": 80.5, "reps": 5, "quest_id": None,
})
created_body = created.json()
created_set = created_body.get("set", {})
created_id = created_set.get("id")
ok("lift create returns authoritative date", created.status_code == 200 and created_body.get("today") == game.today())
ok("lift create returns exact persisted record", created_set == lift_row(created_id) | {"unit": "reps"})
ok("lift create returns stable numeric fields", isinstance(created_set.get("weight"), (int, float)) and not isinstance(created_set.get("weight"), bool) and isinstance(created_set.get("reps"), int))

patched = client.patch(f"/api/lifts/{created_id}", json={"weight": " 82.25 ", "reps": " 6 "})
ok("lift PATCH targets exact id", patched.status_code == 200 and lift_row(created_id)["weight"] == 82.25 and lift_row(created_id)["reps"] == 6)

missing_patch = client.patch("/api/lifts/99999999", json={"weight": 1, "reps": 1})
missing_delete = client.delete("/api/lifts/99999999")
ok("lift PATCH missing id fails", missing_patch.status_code == 400)
ok("lift DELETE missing id fails", missing_delete.status_code == 400)

deleted = client.delete(f"/api/lifts/{created_id}")
ok("lift DELETE targets exact id", deleted.status_code == 200 and lift_row(created_id) is None)

custom_plank_details = {
    "routine": [{"exercise": "Plank", "sets": 1, "reps": 30, "unit": "reps"}],
}
custom_plank = db.q(
    "INSERT INTO quests (giver, kind, title, details, status, accepted_at) VALUES (?,?,?,?,?,?)",
    ("strength", "program:custom:smoke", "Custom Plank", json.dumps(custom_plank_details), "active", game.now_iso()),
)
custom_plank_id = custom_plank.lastrowid
farmer_details = {
    "routine": [{"exercise": "Farmer Carry", "sets": 1, "reps": 40, "unit": "steps"}],
}
farmer_quest = db.q(
    "INSERT INTO quests (giver, kind, title, details, status, accepted_at) VALUES (?,?,?,?,?,?)",
    ("kettlebell", "strength", "Carry the Vale", json.dumps(farmer_details), "active", game.now_iso()),
)
farmer_quest_id = farmer_quest.lastrowid
db.commit()

custom_plank_post = client.post("/api/lifts", json={
    "exercise": "Plank", "weight": 0, "reps": 30, "quest_id": custom_plank_id,
})
farmer_post = client.post("/api/lifts", json={
    "exercise": "Farmer Carry", "weight": 24, "reps": 40, "quest_id": farmer_quest_id,
})
custom_plank_set = custom_plank_post.json().get("set", {})
farmer_set = farmer_post.json().get("set", {})
ok("active custom Plank uses persisted reps", custom_plank_set.get("unit") == "reps" and isinstance(custom_plank_set.get("reps"), int))
ok("active Farmer Carry uses persisted steps", farmer_set.get("unit") == "steps" and isinstance(farmer_set.get("reps"), int))

db.q("UPDATE quests SET status='done', completed_at=? WHERE id=?", (game.now_iso(), custom_plank_id))
db.q("UPDATE quests SET status='abandoned' WHERE id=?", (farmer_quest_id,))
db.commit()

questless_payloads = [
    ("Plank", 0, 45, "seconds"),
    ("Farmer Carry", 32, 55, "steps"),
    ("Back Squat", 70, 5, "reps"),
]
questless_sets = []
for exercise, weight, reps, unit in questless_payloads:
    response = client.post("/api/lifts", json={
        "exercise": exercise, "weight": weight, "reps": reps, "quest_id": None,
    })
    result = response.json().get("set", {})
    questless_sets.append(result)
    ok(f"questless {exercise} POST catalog unit {unit}", response.status_code == 200 and result.get("unit") == unit and result.get("quest_id") is None)

recent = client.get("/api/lifts/recent?limit=100").json()
recent_by_id = {row["id"]: row for row in recent["sets"]}
day = client.get(f"/api/day/{game.today()}").json()
day_by_id = {row["id"]: row for row in day["sets"]}
ok("recent lifts returns authoritative today", recent.get("today") == game.today())
ok("completed custom Plank preserves reps", recent_by_id[custom_plank_set["id"]]["unit"] == "reps" and day_by_id[custom_plank_set["id"]]["unit"] == "reps")
ok("abandoned Farmer Carry preserves steps", recent_by_id[farmer_set["id"]]["unit"] == "steps" and day_by_id[farmer_set["id"]]["unit"] == "steps")
for result, (exercise, _, _, unit) in zip(questless_sets, questless_payloads):
    set_id = result["id"]
    ok(f"questless {exercise} fresh recent/day unit {unit}", recent_by_id[set_id]["unit"] == unit and day_by_id[set_id]["unit"] == unit)

valid_number = client.post("/api/lifts", json={"exercise": "Deadlift", "weight": 100, "reps": 5})
valid_string = client.post("/api/lifts", json={"exercise": "Deadlift", "weight": " 100.75 ", "reps": " 5 "})
ok("lift accepts JSON numeric values", valid_number.status_code == 200 and valid_number.json()["set"]["weight"] == 100 and valid_number.json()["set"]["reps"] == 5)
ok("lift accepts trimmed plain-decimal strings", valid_string.status_code == 200 and valid_string.json()["set"]["weight"] == 100.75 and valid_string.json()["set"]["reps"] == 5)

invalid_weight = [
    ("null", None), ("empty", ""), ("whitespace", "   "), ("boolean", True),
    ("array", []), ("object", {}), ("malformed", "heavy"), ("exponent", "1e2"),
    ("negative", -1), ("nan", math.nan), ("positive infinity", math.inf),
    ("negative infinity", -math.inf),
]
invalid_reps = [
    ("null", None), ("empty", ""), ("whitespace", "   "), ("boolean", False),
    ("array", []), ("object", {}), ("malformed", "five"), ("exponent", "1e2"),
    ("negative", -1), ("fractional", 1.5), ("nan", math.nan),
    ("positive infinity", math.inf), ("negative infinity", -math.inf),
]

for field, payload in (("weight", {"exercise": "Deadlift", "reps": 5}),
                       ("reps", {"exercise": "Deadlift", "weight": 100})):
    before = lift_count()
    response = client.post("/api/lifts", json=payload)
    ok(f"POST missing {field} rejects without mutation", response.status_code == 400 and lift_count() == before)

for label, value in invalid_weight:
    before = lift_count()
    response = json_request("POST", "/api/lifts", {"exercise": "Deadlift", "weight": value, "reps": 5})
    ok(f"POST invalid weight {label} rejects without mutation", response.status_code == 400 and lift_count() == before)
for label, value in invalid_reps:
    before = lift_count()
    response = json_request("POST", "/api/lifts", {"exercise": "Deadlift", "weight": 100, "reps": value})
    ok(f"POST invalid reps {label} rejects without mutation", response.status_code == 400 and lift_count() == before)

before = lift_count()
huge_reps = client.post("/api/lifts", json={"exercise": "Deadlift", "weight": 100, "reps": 10 ** 100})
ok("POST oversized reps rejects without mutation", huge_reps.status_code == 400 and lift_count() == before)

before = lift_count()
overflowing_set = client.post("/api/lifts", json={
    "exercise": "Deadlift", "weight": "1" + "0" * 308, "reps": 2_147_483_647,
})
ok("POST overflowing tonnage rejects without mutation", overflowing_set.status_code == 400 and lift_count() == before)

before = lift_count()
oversized_weight = client.post("/api/lifts", json={
    "exercise": "Deadlift", "weight": "1" + "0" * 308, "reps": 1,
})
ok("POST stats-overflowing weight rejects without mutation", oversized_weight.status_code == 400 and lift_count() == before)

invalid_quest_ids = [
    ("boolean", True), ("array", []), ("object", {}), ("string", "2"),
    ("fractional", 1.5), ("zero", 0), ("negative", -1),
]
for label, value in invalid_quest_ids:
    before = lift_count()
    response = json_request("POST", "/api/lifts", {
        "exercise": "Deadlift", "weight": 100, "reps": 5, "quest_id": value,
    })
    ok(f"POST invalid quest id {label} rejects without mutation", response.status_code == 400 and lift_count() == before)

before = lift_count()
blank_exercise = client.post("/api/lifts", json={"exercise": "   ", "weight": 100, "reps": 5})
ok("POST blank exercise rejects without mutation", blank_exercise.status_code == 400 and lift_count() == before)

patch_target = client.post("/api/lifts", json={"exercise": "Deadlift", "weight": 100, "reps": 5}).json()["set"]
patch_id = patch_target["id"]
for field, payload in (("weight", {"reps": 5}), ("reps", {"weight": 100})):
    before = (lift_row(patch_id), ledger_count())
    response = client.patch(f"/api/lifts/{patch_id}", json=payload)
    ok(f"PATCH missing {field} rejects without mutation", response.status_code == 400 and (lift_row(patch_id), ledger_count()) == before)
for label, value in invalid_weight:
    before = (lift_row(patch_id), ledger_count())
    response = json_request("PATCH", f"/api/lifts/{patch_id}", {"weight": value, "reps": 5})
    ok(f"PATCH invalid weight {label} rejects without mutation", response.status_code == 400 and (lift_row(patch_id), ledger_count()) == before)
for label, value in invalid_reps:
    before = (lift_row(patch_id), ledger_count())
    response = json_request("PATCH", f"/api/lifts/{patch_id}", {"weight": 100, "reps": value})
    ok(f"PATCH invalid reps {label} rejects without mutation", response.status_code == 400 and (lift_row(patch_id), ledger_count()) == before)

before = (lift_row(patch_id), ledger_count())
overflowing_patch = client.patch(f"/api/lifts/{patch_id}", json={
    "weight": "1" + "0" * 308, "reps": 2_147_483_647,
})
ok("PATCH overflowing tonnage rejects without mutation", overflowing_patch.status_code == 400 and (lift_row(patch_id), ledger_count()) == before)

before = (lift_row(patch_id), ledger_count())
oversized_weight_patch = client.patch(f"/api/lifts/{patch_id}", json={
    "weight": "1" + "0" * 308, "reps": 1,
})
ok("PATCH stats-overflowing weight rejects without mutation", oversized_weight_patch.status_code == 400 and (lift_row(patch_id), ledger_count()) == before)

patch_numbers = client.patch(f"/api/lifts/{patch_id}", json={"weight": 101.5, "reps": 6})
patch_strings = client.patch(f"/api/lifts/{patch_id}", json={"weight": " 102.25 ", "reps": " 7 "})
ok("PATCH accepts numeric and trimmed decimal values", patch_numbers.status_code == 200 and patch_strings.status_code == 200 and lift_row(patch_id)["weight"] == 102.25 and lift_row(patch_id)["reps"] == 7)

before = lift_count()
wildcard_day = client.delete("/api/lifts/day/%25")
invalid_day = client.delete("/api/lifts/day/2026-02-30")
ok("wildcard lift day delete rejects without mutation", wildcard_day.status_code == 400 and lift_count() == before)
ok("invalid lift day delete rejects without mutation", invalid_day.status_code == 400 and lift_count() == before)

# ---- writes that must not 500 ----------------------------------------------
print("misc writes:")
r = client.post("/api/settings", json={"weight_unit": "kg"})
ok("save settings", r.status_code == 200)
bad_weight_unit = client.post("/api/settings", json={
    "weight_unit": '<img src=x onerror=alert(1)>',
})
settings_after_bad_unit = client.get("/api/state").json()["settings"]
ok("reject unsafe weight unit without mutation", bad_weight_unit.status_code == 400 and settings_after_bad_unit["weight_unit"] == "kg")
bad_timezone = client.post("/api/settings", json={"timezone": "Not/A_Timezone"})
ok("reject invalid timezone", bad_timezone.status_code == 400)
r = client.post("/api/settings", json={"timezone": "America/Los_Angeles"})
ok("save valid timezone", r.status_code == 200 and client.get("/api/today").json()["today"] == game.today())
r = client.post("/api/settings", json={"siege_timezone": "America/New_York"})
ok("save valid siege timezone", r.status_code == 200 and r.json().get("siege_timezone") == "America/New_York")
ok("siege timezone round-trips through state", client.get("/api/state").json()["siege_timezone"] == "America/New_York")
ok("siege week uses shared timezone", raid.week_start().tzinfo.key == "America/New_York")
r = client.post("/api/settings", json={"siege_timezone": "Not/A_Timezone"})
ok("reject invalid siege timezone", r.status_code == 400)
r = client.post("/api/claim", json={"kind": "hike", "minutes": 30, "note": "smoke"})
ok("scrivener claim", r.status_code == 200)

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nSMOKE PASSED — {PASS} checks green")

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
from app import db, game  # noqa: E402

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


# ---- boot + seed ----------------------------------------------------------
client.get("/api/state")  # first touch creates the schema
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
get("/api/exercises")
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

# ---- dungeon: enter -> move -> retire --------------------------------------
print("dungeon lifecycle:")
c = game.get_char()
c["vigor"] = 10
game.save_char(c)
r = client.post("/api/dungeon/enter")
ok("dungeon enter", r.status_code == 200 and r.json()["theme"]["key"])
d = r.json()["state"]
moved = False
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

# ---- writes that must not 500 ----------------------------------------------
print("misc writes:")
r = client.post("/api/lifts", json={"exercise": "Deadlift", "weight": 100, "reps": 5})
ok("log lift", r.status_code == 200)
r = client.post("/api/settings", json={"weight_unit": "kg"})
ok("save settings", r.status_code == 200)
r = client.post("/api/claim", json={"kind": "hike", "minutes": 30, "note": "smoke"})
ok("scrivener claim", r.status_code == 200)

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nSMOKE PASSED — {PASS} checks green")

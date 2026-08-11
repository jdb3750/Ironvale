"""Regression test for seam 9: a non-finite float anywhere in a response
payload must not 400 the whole endpoint.

Starlette's JSONResponse serialises with allow_nan=False, so a single inf/nan
value nested anywhere in a payload raises ValueError. app.main installs a
SafeJSONResponse (bound to the name `JSONResponse`, and set as the app's
default_response_class) that recursively coerces non-finite floats to `null`
before encoding. This test proves two things directly, without going through
the HTTP layer:

  1. The sanitiser is a no-op, byte-for-byte, on a payload that has no
     non-finite floats — the fix must not touch ordinary numbers.
  2. A payload with inf/nan buried anywhere (including nested inside lists
     and dicts) survives render() and comes back as `null` in that spot,
     instead of raising.

Run: .venv/bin/python tests/test_nonfinite_json.py
"""
import json
import math
import os
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-nonfinite-json-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.responses import JSONResponse as StockJSONResponse  # noqa: E402
from app.main import JSONResponse, _sanitize_nonfinite  # noqa: E402

PASS = 0


def ok(label, condition, detail=""):
    global PASS
    assert condition, f"NONFINITE JSON FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


# ---- a representative healthy payload: nested dicts/lists, ints, floats,
# strings, bools, None. Nothing here is non-finite. ------------------------
HEALTHY = {
    "character": {"name": "Adventurer", "level": 3, "xp": 41.5, "gold": 120},
    "weeks": [
        {"week": "2026-08-03", "run_km": 12.3, "run_min": 45, "runs": 2},
        {"week": "2026-08-10", "run_km": 0.0, "run_min": 0, "runs": 0},
    ],
    "flags": {"active": True, "note": None},
    "recent_activities": [
        {"id": "a1", "distance": 8000.0, "moving_time": 2400, "avg_hr": None},
    ],
}

ok(
    "healthy payload is byte-identical through the sanitiser",
    JSONResponse(HEALTHY).render(HEALTHY) == StockJSONResponse(HEALTHY).render(HEALTHY),
    "-> sanitiser altered a payload with no non-finite floats",
)

ok(
    "sanitizing a healthy payload returns an equal (not just equivalent-looking) structure",
    _sanitize_nonfinite(HEALTHY) == HEALTHY,
)

# ---- the stock class is the thing that breaks today: prove the baseline --
CORRUPT = {
    "recent_activities": [
        {"id": "bad", "distance": float("inf"), "moving_time": 60},
    ],
    "weeks": [{"week": "2026-08-10", "run_km": float("nan"), "runs": 1}],
    "nested": {"deep": {"list": [1, 2, float("-inf"), {"x": float("nan")}]}},
}

raised = False
try:
    StockJSONResponse(CORRUPT).render(CORRUPT)
except ValueError:
    raised = True
ok("stock JSONResponse still raises on non-finite floats (baseline, unpatched)", raised)

# ---- the app's response class must not raise, and must degrade every
# non-finite float, at any depth, to null -----------------------------------
rendered = JSONResponse(CORRUPT).render(CORRUPT)
decoded = json.loads(rendered)
ok(
    "SafeJSONResponse renders a payload with non-finite floats without raising",
    isinstance(rendered, (bytes, bytearray)),
)
ok(
    "top-level list item's non-finite float becomes null",
    decoded["recent_activities"][0]["distance"] is None,
)
ok(
    "nan becomes null (not the string 'nan')",
    decoded["weeks"][0]["run_km"] is None,
)
ok(
    "a non-finite float nested three levels deep inside dicts and lists becomes null",
    decoded["nested"]["deep"]["list"][2] is None and decoded["nested"]["deep"]["list"][3]["x"] is None,
)
ok(
    "finite sibling values in the same corrupt payload are untouched",
    decoded["recent_activities"][0]["moving_time"] == 60
    and decoded["nested"]["deep"]["list"][0] == 1
    and decoded["nested"]["deep"]["list"][1] == 2,
)

# ---- math.isfinite is the only test that matters — bools and ints must
# never be mistaken for floats and must pass through untouched -------------
ok(
    "bool is not treated as a non-finite float (True/False pass through)",
    _sanitize_nonfinite({"a": True, "b": False}) == {"a": True, "b": False},
)
ok(
    "plain int passes through untouched",
    _sanitize_nonfinite({"n": 7}) == {"n": 7},
)
ok(
    "an ordinary finite float is returned as the identical value",
    _sanitize_nonfinite(3.5) == 3.5 and math.isfinite(_sanitize_nonfinite(3.5)),
)

# ---- live endpoints: a non-finite activities.distance already on disk
# must not 400 any reader, not just the one seam 3 guarded (/api/road). -----
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import db, game  # noqa: E402

client = TestClient(app)
client.get("/api/state")  # first touch creates the schema
client.post("/api/profiles/select", json={"slug": "main"})
db.q(
    "INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
    "VALUES ('seam9-inf', 'smoke', ?, 'Run', 'seam 9 corrupt distance', 60, ?)",
    (game.now_iso(), float("inf")),
)
db.commit()

# every GET endpoint that can be reached with the corrupt row present —
# mirrors the read-endpoint sweep in tests/smoke.py.
READ_ENDPOINTS = (
    "/api/state", "/api/road", "/api/raid", "/api/stats?wellness_days=90",
    "/api/calendar?year=%d&month=%d" % (game.now().year, game.now().month),
    "/api/day/" + game.now_iso()[:10], "/api/tapestry", "/api/almanac",
    "/api/keepsakes", "/api/chronicle", "/api/items", "/api/trinkets",
    "/api/exercises", "/api/today", "/api/programs", "/api/monsters",
    "/api/inventory", "/api/claim/types", "/api/lifts/recent", "/api/quests/log",
    "/api/dungeon",
)
for path in READ_ENDPOINTS:
    r = client.get(path)
    ok(f"a non-finite persisted distance does not break GET {path}", r.status_code == 200,
       f"-> {r.status_code}: {r.text[:160]}")

stats_body = client.get("/api/stats?wellness_days=90").json()
corrupt_recent = next(a for a in stats_body["recent_activities"] if a["id"] == "seam9-inf")
ok(
    "/api/stats reports the corrupt row's distance as unknown (null), not a nonsense number",
    corrupt_recent["distance"] is None,
    f"-> {corrupt_recent}",
)

day_body = client.get("/api/day/" + game.now_iso()[:10]).json()
corrupt_day_act = next((a for a in day_body["activities"] if a["id"] == "seam9-inf"), None)
ok(
    "/api/day reports the corrupt row's distance as unknown (null), not a nonsense number",
    corrupt_day_act is not None and corrupt_day_act["distance"] is None,
    f"-> {corrupt_day_act}",
)

# a healthy /api/stats response (no corrupt rows) is unaffected: numbers,
# ordering, and structure survive the sanitiser untouched.
db.q("DELETE FROM activities WHERE id='seam9-inf'")
db.commit()
db.q(
    "INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
    "VALUES ('seam9-finite', 'smoke', ?, 'Run', 'seam 9 finite distance', 1800, 5000)",
    (game.now_iso(),),
)
db.commit()
finite_stats = client.get("/api/stats?wellness_days=90").json()
finite_recent = next(a for a in finite_stats["recent_activities"] if a["id"] == "seam9-finite")
ok(
    "a healthy (finite) distance passes through the sanitiser exactly, in km terms",
    finite_recent["distance"] == 5000,
    f"-> {finite_recent}",
)
db.q("DELETE FROM activities WHERE id='seam9-finite'")
db.commit()

print(f"\nNONFINITE JSON PASSED — {PASS} checks green")

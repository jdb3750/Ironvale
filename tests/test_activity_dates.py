"""Regression test for the intervals.icu activity date-boundary fix.

When `start_date_local` is absent, intervals.icu's UTC `start_date` used to be
stored verbatim. A late-evening local workout (e.g. 21:00 PDT = 04:00Z next
day) was then bucketed on the WRONG calendar day. The fix converts the UTC
fallback to system-local time (the same timezone source now()/today() use) so
the activity lands on the day the athlete actually trained, while the trusted
`start_date_local` is still stored verbatim.

Run:  .venv/bin/python tests/test_activity_dates.py
(never against the live data/ dir — it builds its own scratch)
"""
import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timezone

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-dates-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app import db, game, intervals  # noqa: E402

client = TestClient(app)
client.get("/api/state")  # first touch creates the schema

PASS = 0


def ok(label, cond, detail=""):
    global PASS
    assert cond, f"DATE FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


# Find a UTC timestamp whose UTC date differs from the system-local date, so
# naive-UTC storage would bucket the activity on the wrong day. Returns None
# only when the system timezone is UTC (no crossing is possible there).
def _crossing_case():
    base = date(2026, 7, 16)
    for h in range(24):
        for m in (0, 30):
            u = datetime(base.year, base.month, base.day, h, m, tzinfo=timezone.utc)
            local_day = u.astimezone().date()
            if local_day != base:
                return u.isoformat(), base.isoformat(), local_day.isoformat()
    return None


crossing = _crossing_case()
if crossing:
    UTC_ISO, UTC_DAY, LOCAL_DAY = crossing
else:
    UTC_ISO, UTC_DAY, LOCAL_DAY = "2026-07-16T02:00:00Z", "2026-07-16", "2026-07-16"
CROSSES = crossing is not None

print(f"system tz offset={datetime.now().astimezone().utcoffset()}; "
      f"crosses midnight={CROSSES} (utc={UTC_DAY}, local={LOCAL_DAY})")

# ---- game.utc_to_local_iso: pure conversion -------------------------------
print("utc_to_local_iso unit cases:")
ref = datetime(2026, 7, 16, 2, 0, 0, tzinfo=timezone.utc).astimezone().isoformat(timespec="seconds")
ok("UTC with Z", game.utc_to_local_iso("2026-07-16T02:00:00Z") == ref)
ok("UTC with +00:00", game.utc_to_local_iso("2026-07-16T02:00:00+00:00") == ref)
ok("naive read as UTC", game.utc_to_local_iso("2026-07-16T02:00:00") == ref)
ok("local date prefix", game.utc_to_local_iso("2026-07-16T02:00:00Z")[:10] == LOCAL_DAY)
ok("fractional seconds truncated to seconds precision",
   game.utc_to_local_iso("2026-07-16T02:00:00.123Z") == ref)
ok("empty string -> None", game.utc_to_local_iso("") is None)
ok("None -> None", game.utc_to_local_iso(None) is None)
ok("non-string -> None", game.utc_to_local_iso(123) is None)
ok("malformed -> None", game.utc_to_local_iso("not a date") is None)
ok("invalid fields -> None", game.utc_to_local_iso("2026-13-40T99:99:99Z") is None)

# ---- intervals.activity_start: field selection ----------------------------
print("activity_start selection:")
ok("trusted start_date_local is verbatim",
   intervals.activity_start({"start_date_local": "2026-07-15T19:00:00",
                             "start_date": "2026-07-16T02:00:00Z"}) == "2026-07-15T19:00:00")
ok("UTC fallback is converted to local",
   intervals.activity_start({"start_date": "2026-07-16T02:00:00Z"})
   == game.utc_to_local_iso("2026-07-16T02:00:00Z"))
ok("both absent -> empty", intervals.activity_start({}) == "")
ok("malformed start_date kept verbatim (no data loss)",
   intervals.activity_start({"start_date": "not a date"}) == "not a date")
ok("empty start_date -> empty", intervals.activity_start({"start_date": ""}) == "")
ok("None start_date -> empty", intervals.activity_start({"start_date": None}) == "")

# ---- the core date-boundary regression ------------------------------------
print("date-boundary regression:")
start = intervals.activity_start({"start_date": UTC_ISO})
ok("UTC fallback categorized on LOCAL day", start[:10] == LOCAL_DAY, f"got {start[:10]}")
if CROSSES:
    ok("...and NOT on the UTC day (old verbatim-UTC bug)", start[:10] != UTC_DAY)
else:
    ok("system tz is UTC: no crossing possible, conversion is correct identity",
       start[:10] == UTC_DAY)

# ---- end-to-end through the real sync() storage path ----------------------
print("end-to-end via sync() -> /api/day:")
db.kv_set("settings", {"intervals_athlete_id": "999", "intervals_api_key": "secret"})


def sync_with(acts):
    """Run a real intervals.sync() against a mocked activities payload."""
    orig = intervals._get
    intervals._get = lambda path, params, athlete, key: acts if path.endswith("/activities") else []
    try:
        return intervals.sync()
    finally:
        intervals._get = orig


# boundary act: only UTC start_date (exercises the fix).
# trusted act: start_date_local set to the UTC day (exercises verbatim trust);
#   when the boundary crosses, the two acts land on different days even though
#   they describe the same UTC moment.
sync_with([
    {"id": "act-boundary", "type": "Run", "name": "late run", "moving_time": 1800,
     "start_date": UTC_ISO},
    {"id": "act-trusted", "type": "Ride", "name": "trusted ride", "moving_time": 1200,
     "start_date": UTC_ISO, "start_date_local": f"{UTC_DAY}T08:00:00"},
])
ok("sync stored 2 new activities",
   db.q("SELECT COUNT(*) AS n FROM activities WHERE id IN ('act-boundary','act-trusted')").fetchone()["n"] == 2)

day_local = client.get(f"/api/day/{LOCAL_DAY}").json()
day_utc = client.get(f"/api/day/{UTC_DAY}").json()
ids_local = {a["id"] for a in day_local["activities"]}
ids_utc = {a["id"] for a in day_utc["activities"]}
ok("boundary act (UTC fallback) appears on LOCAL day", "act-boundary" in ids_local)
ok("trusted act (start_date_local) appears on its own day", "act-trusted" in ids_utc)
if CROSSES:
    ok("boundary act NOT mis-bucketed on the UTC day", "act-boundary" not in ids_utc)
    ok("trusted act NOT on the converted local day", "act-trusted" not in ids_local)

# ---- existing-record correction (ON CONFLICT refreshes start) -------------
# The old bug stored verbatim UTC when start_date_local was absent. sync()'s
# ON CONFLICT UPDATE must now refresh `start` so a re-sync corrects historical
# rows without needing a wipe/reseed.
print("existing-record correction via re-sync:")
buggy_start = UTC_ISO  # exactly what the pre-fix code stored verbatim (UTC, wrong day)
db.q("INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
     "VALUES (?, 'intervals.icu', ?, 'Run', 'stale boundary run', 1800, NULL)",
     ("act-preseed-bug", buggy_start))
db.commit()
ok("pre-seeded buggy activity with verbatim UTC start",
   db.q("SELECT start FROM activities WHERE id=?", ("act-preseed-bug",)).fetchone()["start"] == buggy_start)
if CROSSES:
    ok("buggy activity visible on UTC day before re-sync",
       any(a["id"] == "act-preseed-bug" for a in client.get(f"/api/day/{UTC_DAY}").json()["activities"]))

# Re-sync the SAME id with a UTC-only payload (no start_date_local) -> fix converts to local.
new = sync_with([{"id": "act-preseed-bug", "type": "Run", "name": "stale boundary run",
                  "moving_time": 1800, "start_date": UTC_ISO}])
ok("re-sync of existing activity reports 0 new (update, not insert)", new == 0, f"new={new}")
fixed_start = db.q("SELECT start FROM activities WHERE id=?", ("act-preseed-bug",)).fetchone()["start"]
ok("stored start refreshed to converted local",
   fixed_start == game.utc_to_local_iso(UTC_ISO), f"got {fixed_start}")
ok("stored start now on LOCAL day", fixed_start[:10] == LOCAL_DAY, f"got {fixed_start[:10]}")
if CROSSES:
    ok("corrected activity moved OFF the UTC day",
       not any(a["id"] == "act-preseed-bug" for a in client.get(f"/api/day/{UTC_DAY}").json()["activities"]))
ok("corrected activity now appears on LOCAL day",
   any(a["id"] == "act-preseed-bug" for a in client.get(f"/api/day/{LOCAL_DAY}").json()["activities"]))

# Trusted start_date_local must remain respected on re-sync: a row stored from
# a trusted local value is re-synced with start_date_local still present (and a
# different UTC start_date) and must keep its trusted local start, not be
# overwritten by the UTC->local conversion.
db.q("INSERT INTO activities (id, source, start, type, name, moving_time, distance) "
     "VALUES (?, 'intervals.icu', ?, 'Ride', 'trusted re-sync ride', 1200, NULL)",
     ("act-preseed-trusted", f"{UTC_DAY}T08:00:00"))
db.commit()
sync_with([{"id": "act-preseed-trusted", "type": "Ride", "name": "trusted re-sync ride",
            "moving_time": 1200, "start_date": UTC_ISO,
            "start_date_local": f"{UTC_DAY}T08:00:00"}])
trusted_start = db.q("SELECT start FROM activities WHERE id=?", ("act-preseed-trusted",)).fetchone()["start"]
ok("trusted start_date_local preserved on re-sync",
   trusted_start == f"{UTC_DAY}T08:00:00", f"got {trusted_start}")
ok("trusted activity stays on its own day",
   any(a["id"] == "act-preseed-trusted" for a in client.get(f"/api/day/{UTC_DAY}").json()["activities"]))

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nDATE PASSED — {PASS} checks green")

"""tools/backfill_unguided_givers.py — the historical giver correction.

This tool is the only thing in the repo written to mutate a live save, so it
is tested harder than its size suggests. What matters is not just that it
fixes the wrong rows, but that it leaves everything else alone: a backfill
that over-reaches on real training history cannot be undone by re-running it.

Run: .venv/bin/python tests/test_backfill_unguided_givers.py
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-backfill-")
os.environ["DATA_DIR"] = SCRATCH
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app import db  # noqa: E402
from tools.backfill_unguided_givers import survey, true_giver  # noqa: E402

PASS = 0
DB_PATH = os.path.join(SCRATCH, "backfill.db")

# activity type -> the giver that deed should have been filed under
CASES = (
    ("Run", "run", "endurance"),
    ("Ride", "ride", "endurance"),
    ("Walk", "walk", "endurance"),
    ("Swim", "swim", "endurance"),
    ("RockClimbing", "climb", "bram"),
    ("WeightTraining", "strength", "strength"),
    ("Yoga", "mobility", "recovery"),
    ("Kayaking", "other", "wick"),
)


def ok(label, cond, detail=""):
    global PASS
    assert cond, f"BACKFILL FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def giver_of(title):
    conn = connect()
    try:
        row = conn.execute("SELECT giver FROM quests WHERE title=?", (title,)).fetchone()
        return row["giver"] if row else None
    finally:
        conn.close()


db.set_profile(DB_PATH)
db.conn()

# Every row starts wrongly filed as 'endurance', which is exactly what the
# pre-seam-5 recorder wrote regardless of what the deed actually was.
for index, (activity_type, cat, _expected) in enumerate(CASES):
    details = json.dumps({"unguided": True, "activity_id": f"a{index}",
                          "activity_type": activity_type, "category": cat})
    db.q("INSERT INTO quests (giver, kind, title, details, status, accepted_at, completed_at) "
         "VALUES ('endurance','unguided_activity',?,?,'done',?,?)",
         (f"deed {activity_type}", details,
          f"2026-07-{index + 1:02d}T07:00:00", f"2026-07-{index + 1:02d}T08:00:00"))
db.q("INSERT INTO quests (giver, kind, title, details, status, accepted_at, completed_at) "
     "VALUES ('endurance','unguided_activity','mystery','{}','done',"
     "'2026-07-20T07:00:00','2026-07-20T08:00:00')")
db.q("INSERT INTO quests (giver, kind, title, details, status, accepted_at, completed_at) "
     "VALUES ('endurance','run','a sworn run','{}','done',"
     "'2026-07-21T07:00:00','2026-07-21T08:00:00')")
db.commit()

print("the mapping is read from the app, not restated:")
for activity_type, cat, expected in CASES:
    ok(f"{activity_type} belongs to {expected}",
       true_giver(json.dumps({"activity_type": activity_type, "category": cat})) == expected)
ok("a row with no usable details yields no verdict", true_giver("{}") is None)
ok("malformed details yield no verdict rather than raising", true_giver("{not json") is None)

print("a dry run writes nothing:")
before = [dict(r) for r in connect().execute("SELECT id, giver FROM quests ORDER BY id")]
result = subprocess.run(
    [sys.executable, os.path.join(ROOT, "tools", "backfill_unguided_givers.py"), DB_PATH],
    capture_output=True, text=True, cwd=ROOT, check=True)
after = [dict(r) for r in connect().execute("SELECT id, giver FROM quests ORDER BY id")]
ok("dry run leaves every row untouched", before == after)
ok("dry run says so", "DRY RUN" in result.stdout)
ok("dry run counts the misattributed rows", "misattributed:     4" in result.stdout,
   result.stdout)

print("applying corrects only what it should:")
subprocess.run(
    [sys.executable, os.path.join(ROOT, "tools", "backfill_unguided_givers.py"),
     DB_PATH, "--apply"],
    capture_output=True, text=True, cwd=ROOT, check=True)
for activity_type, _cat, expected in CASES:
    ok(f"deed {activity_type} is now filed under {expected}",
       giver_of(f"deed {activity_type}") == expected)
ok("a sworn quest is never touched", giver_of("a sworn run") == "endurance")
ok("a row whose giver cannot be determined is left alone", giver_of("mystery") == "endurance")

conn = connect()
entries = conn.execute("SELECT text FROM ledger WHERE kind='migration'").fetchall()
conn.close()
ok("exactly one ledger entry records the change", len(entries) == 1)
ok("the ledger entry names the count", "4 unguided deed(s)" in entries[0]["text"],
   entries[0]["text"])

print("re-running is a no-op:")
_, wrong, _, _ = survey(connect())
ok("a second survey finds nothing left to correct", wrong == [])
repeat = subprocess.run(
    [sys.executable, os.path.join(ROOT, "tools", "backfill_unguided_givers.py"),
     DB_PATH, "--apply"],
    capture_output=True, text=True, cwd=ROOT, check=True)
conn = connect()
entries_after = conn.execute("SELECT text FROM ledger WHERE kind='migration'").fetchall()
conn.close()
ok("re-applying writes no second ledger entry", len(entries_after) == 1, repeat.stdout)

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nBACKFILL PASSED — {PASS} checks green")

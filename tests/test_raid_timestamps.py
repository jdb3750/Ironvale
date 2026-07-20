"""Regression test for the Siege's profile-local activity timestamps.

An intervals.icu ``start_date_local`` value has no UTC offset. The activity
must first be interpreted in the adventurer's profile timezone, then compared
with the shared Siege Bell's UTC week boundary.

Run: .venv/bin/python tests/test_raid_timestamps.py
"""
import os
import shutil
import sys
import tempfile
from datetime import datetime

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-raid-times-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, game, profiles, raid  # noqa: E402

PASS = 0


def ok(label, condition, detail=""):
    global PASS
    assert condition, f"RAID TIME FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


# Given: the shared Siege turns at midnight UTC while an adventurer is in PDT.
profiles.ensure_index()
token = db.set_profile(profiles.path_for("main"))
try:
    settings = game.get_settings()
    settings["timezone"] = "America/Los_Angeles"
    db.kv_set("settings", settings)
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time) "
        "VALUES (?, 'intervals.icu', ?, 'Run', 'Sunday evening run', 1205)",
        ("late-sunday-run", "2026-07-19T19:27:29"),
    )
    db.commit()

    original_siege_now = raid.siege_now
    raid.siege_now = lambda: datetime.fromisoformat("2026-07-20T01:00:00+00:00")
    try:
        # When: the just-synced, offsetless local activity strikes the Siege.
        damage = raid.apply_damage("main")
    finally:
        raid.siege_now = original_siege_now

    # Then: it is 02:27 UTC Monday and strikes the new week's boss once.
    ok("late Sunday PDT run damages the new UTC Siege week", damage == 200, f"got {damage}")
finally:
    db.reset_profile(token)
    shutil.rmtree(SCRATCH, ignore_errors=True)

print(f"\nRAID TIME PASSED — {PASS} checks green")

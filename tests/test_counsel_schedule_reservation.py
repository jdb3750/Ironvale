import atexit
import os
import shutil
import sys
import tempfile


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-schedule-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import counsel, db, quests  # noqa: E402


db.set_profile(os.path.join(SCRATCH, "schedule.db"))
db.kv_set("settings", {"timezone": "UTC", "ambition": 2})
offer = {
    "kind": "run_easy",
    "title": "An Easy Run",
    "details": "Run easy for 30 minutes",
    "target": {"minutes": 30},
    "xp": 30,
    "gold": 12,
    "vigor": 1,
}
quest_id = quests.create_quest_from_offer("endurance", offer, None)

# Given: a real quest. When: Scheduled mode accepts it. Then: storage and attribution agree.
db.q(
    "INSERT INTO counsel_attributions "
    "(quest_id, mode, accepted_at, offered_option_keys, chosen_option_key) "
    "VALUES (?, 'schedule', '2026-07-26T12:00:00+00:00', "
    "'[\"run:easy\"]', 'run:easy')",
    (quest_id,),
)
db.commit()
stored_mode = db.q(
    "SELECT mode FROM counsel_attributions WHERE quest_id=?",
    (quest_id,),
).fetchone()["mode"]
assert stored_mode == "schedule"

attribution = counsel.validate_attribution("schedule", ["run:easy"], "run:easy")
assert attribution.mode == "schedule"

print("COUNSEL SCHEDULE RESERVATION PASSED")

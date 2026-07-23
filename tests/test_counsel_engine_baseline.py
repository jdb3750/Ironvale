import atexit
import os
import random
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-baseline-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, exercises, game, quests  # noqa: E402


NOW = datetime(2026, 7, 23, 12, tzinfo=timezone.utc)
game.now = lambda: NOW


def ok(label, condition):
    assert condition, f"COUNSEL BASELINE FAIL: {label}"
    print(f"  ok  {label}")


def seed_activity(activity_id, days_ago, activity_type, minutes):
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time) VALUES (?,?,?,?,?,?)",
        (
            activity_id,
            "baseline",
            (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"),
            activity_type,
            activity_id,
            minutes * 60,
        ),
    )


def quoted_reward(offer):
    factor = {"low": 1.0, "moderate": 1.35, "hard": 1.7}[offer["intensity"]]
    minutes = offer["target_minutes"] if "target_minutes" in offer else offer["total_sets"] * 3
    expected_xp = int(minutes * factor * 2.2)
    return offer["xp"] == expected_xp and offer["gold"] == int(expected_xp * 0.45)


db.set_profile(db.DB_PATH)
seed_activity("run", 1, "Run", 40)
seed_activity("ride", 2, "Ride", 50)
seed_activity("swim", 3, "Swim", 30)
seed_activity("climb", 4, "RockClimbing", 60)
db.commit()

endurance = quests.gen_endurance_offers(random.Random("counsel-baseline"))
ok("Fenn retains one offer for each practiced endurance modality",
   {offer["modality"] for offer in endurance} == {"run", "ride", "swim"})
ok("Fenn retains reward pricing from each offer target", all(quoted_reward(offer) for offer in endurance))

climb = quests.gen_climb_offers(random.Random("counsel-baseline"))
ok("Bram retains three climb offers", len(climb) == 3 and all(offer["modality"] == "climb" for offer in climb))
ok("Bram retains reward pricing from each offer target", all(quoted_reward(offer) for offer in climb))

iron = quests.gen_lift_offers(random.Random("counsel-baseline"))
equipment = {
    exercises.EXERCISES[row["exercise"]]["equipment"]
    for offer in iron
    for row in offer["routine"]
}
ok("Grunhilda retains all iron equipment", equipment == {"barbell", "dumbbell", "kettlebell"})
ok("Grunhilda retains three separately priced routines", len(iron) == 3 and all(quoted_reward(offer) for offer in iron))

print("COUNSEL BASELINE PASSED")

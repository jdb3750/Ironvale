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


def offer_contract(offer):
    return (
        offer["kind"],
        offer.get("target_minutes"),
        offer.get("total_sets"),
        offer["intensity"],
        offer["xp"],
        offer["gold"],
    )


db.set_profile(db.DB_PATH)
seed_activity("run", 1, "Run", 40)
seed_activity("ride", 2, "Ride", 50)
seed_activity("swim", 3, "Swim", 30)
seed_activity("climb", 4, "RockClimbing", 60)
db.commit()

endurance = quests.gen_endurance_offers(random.Random("counsel-baseline"))
ok("Fenn retains one offer for each practiced endurance modality",
   {offer["modality"] for offer in endurance} == {"run", "ride", "swim"})
ok(
    "Fenn retains the characterized offers and rewards",
    {offer_contract(offer) for offer in endurance}
    == {
        ("ride_steady", 45, None, "moderate", 133, 59),
        ("swim_easy", 15, None, "low", 33, 14),
        ("run_intervals", 35, None, "hard", 130, 58),
    },
)

climb = quests.gen_climb_offers(random.Random("counsel-baseline"))
ok("Bram retains three climb offers", len(climb) == 3 and all(offer["modality"] == "climb" for offer in climb))
ok(
    "Bram retains the characterized offers and rewards",
    {offer_contract(offer) for offer in climb}
    == {
        ("climb_session", 65, None, "hard", 243, 109),
        ("climb_technique", 40, None, "low", 88, 39),
        ("climb_volume", 60, None, "moderate", 178, 80),
    },
)

iron = quests.gen_lift_offers(random.Random("counsel-baseline"))
equipment = {
    exercises.EXERCISES[row["exercise"]]["equipment"]
    for offer in iron
    for row in offer["routine"]
}
ok("Grunhilda retains all iron equipment", equipment == {"barbell", "dumbbell", "kettlebell"})
ok(
    "Grunhilda retains the characterized routines and rewards",
    {offer_contract(offer) for offer in iron}
    == {
        ("lift_strength", None, 16, "hard", 179, 80),
        ("lift_circuit", None, 9, "moderate", 80, 36),
        ("lift_volume", None, 12, "moderate", 106, 47),
    },
)

print("COUNSEL BASELINE PASSED")

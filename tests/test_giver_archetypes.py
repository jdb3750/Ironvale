import atexit
import os
import shutil
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-giver-archetypes-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import counsel_candidates, db, game, programs  # noqa: E402


db.set_profile(db.DB_PATH)
expected_titles = {
    "running": ("Old Fenn", "the Wayfarer"),
    "kettlebell": ("Grunhilda", "Iron-Bell"),
    "strength": ("Ser Bram", "the Unburdened"),
    "mobility": ("Sage Elowen", "of the Willow"),
}
assert tuple(game.GIVER_ARCHETYPES) == tuple(expected_titles)
for giver, (name, title) in expected_titles.items():
    ownership = game.GIVER_ARCHETYPES[giver]
    assert ownership["display"]["name"] == name
    assert ownership["display"]["title"] == title
    assert game.GIVERS[giver] == ownership["display"]
    assert all(
        option.payload["giver"] == giver
        for option in counsel_candidates.for_giver(giver)
    )
assert all(
    programs.PROGRAMS[key]["giver"] == "kettlebell"
    for key in ("starting_strength", "stronglifts", "simple_sinister", "armor_building")
)

print("GIVER ARCHETYPES PASSED")

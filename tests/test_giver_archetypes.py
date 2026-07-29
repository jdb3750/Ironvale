import atexit
import os
import shutil
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-giver-archetypes-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import counsel_candidates, counsel_context, db, game, programs  # noqa: E402


db.set_profile(db.DB_PATH)
context = counsel_context.assemble()
expected_titles = {
    "running": ("Old Fenn", "the Wayfarer"),
    "kettlebell": ("Grunhilda", "Iron-Bell"),
    "strength": ("Ser Bram", "the Old Knight at Rest"),
    "mobility": ("Sage Elowen", "of the Willow"),
}
assert tuple(game.GIVER_ARCHETYPES) == tuple(expected_titles)
assert tuple(game.GIVERS) == tuple(expected_titles)
assert game.OFFERABLE_GIVERS == ("running", "kettlebell", "mobility")
assert game.GIVER_ARCHETYPES["running"]["modalities"] == counsel_candidates.FENN_MODALITIES
assert game.GIVER_ARCHETYPES["strength"]["archetype"] == "Retired"
assert game.GIVER_ARCHETYPES["strength"]["modalities"] == ()
for giver, (name, title) in expected_titles.items():
    ownership = game.GIVER_ARCHETYPES[giver]
    assert ownership["display"]["name"] == name
    assert ownership["display"]["title"] == title
    assert game.GIVERS[giver] == ownership["display"]
for giver in game.OFFERABLE_GIVERS:
    assert all(
        option.payload["giver"] == giver
        for option in counsel_candidates.for_giver(giver, context)
    )
assert all(
    programs.PROGRAMS[key]["giver"] == "kettlebell"
    for key in ("starting_strength", "stronglifts", "simple_sinister", "armor_building")
)

print("GIVER ARCHETYPES PASSED")

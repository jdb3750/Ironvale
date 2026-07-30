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
    "endurance": ("Old Fenn", "the Wayfarer"),
    "strength": ("Grunhilda", "Iron-Bell"),
    "bram": ("Ser Bram", "the Old Knight at Rest"),
    "recovery": ("Sage Elowen", "of the Willow"),
}
assert tuple(game.GIVER_ARCHETYPES) == tuple(expected_titles)
assert tuple(game.GIVERS) == tuple(expected_titles)
assert game.OFFERABLE_GIVERS == ("endurance", "strength", "recovery")
assert game.GIVER_ARCHETYPES["endurance"]["modalities"] == counsel_candidates.FENN_MODALITIES
assert game.GIVER_ARCHETYPES["bram"]["archetype"] == "Retired"
assert game.GIVER_ARCHETYPES["bram"]["modalities"] == ()
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
    programs.PROGRAMS[key]["giver"] == "strength"
    for key in ("starting_strength", "stronglifts", "simple_sinister", "armor_building")
)

print("GIVER ARCHETYPES PASSED")

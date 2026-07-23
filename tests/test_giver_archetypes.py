import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import game


EXPECTED_ARCHETYPES = {
    "running": {
        "archetype": "Endurance",
        "name": "Old Fenn",
        "title": "the Wayfarer",
        "modalities": ("run", "ride", "swim"),
    },
    "kettlebell": {
        "archetype": "Iron",
        "name": "Grunhilda",
        "title": "Iron-Bell",
        "modalities": ("barbell", "dumbbell", "kettlebell"),
    },
    "strength": {
        "archetype": "Skill",
        "name": "Ser Bram",
        "title": "the Loadbearer",
        "modalities": ("climbing", "calisthenics", "plyometrics", "sprints"),
    },
    "mobility": {
        "archetype": "Recovery",
        "name": "Sage Elowen",
        "title": "of the Willow",
        "modalities": ("mobility", "stretch", "easy movement", "rest"),
    },
}


for giver, expected in EXPECTED_ARCHETYPES.items():
    ownership = game.GIVER_ARCHETYPES[giver]
    assert ownership["archetype"] == expected["archetype"]
    assert ownership["display"]["name"] == expected["name"]
    assert ownership["display"]["title"] == expected["title"]
    assert ownership["modalities"] == expected["modalities"]
    assert game.GIVERS[giver] == ownership["display"]

assert tuple(game.GIVER_ARCHETYPES) == tuple(EXPECTED_ARCHETYPES)

print("GIVER ARCHETYPES PASSED")

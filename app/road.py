"""The Long Road: a lifetime pilgrimage measured in real kilometers.

Every synced kilometer moves a small pilgrim (the player's own hero) along an
endless road out of the Vale. Landmarks wait at fixed distances; reaching one
unlocks its lore and a claimable reward. Quests reward the week and the Siege
rewards the group — the Road rewards the years.

Distance counted (from the activities table, meters -> km):
  - run + walk/hike categories at full value (the pilgrim walks the road)
  - rides at one quarter (a courier's shortcut is still travel, but the road
    remembers feet more fondly than wheels)
  - swims at full value (earned the hard way)
  - everything else (climbing, lifting) covers no ground

The road never ends: past the last authored landmark, procedurally named
cairns continue every 250 km forever.
"""
import math
import random

from . import db, game

RIDE_FACTOR = 0.25

LANDMARKS = [
    {"km": 0,    "key": "vale_gate",  "name": "The Vale Gate",        "icon": "road_gate",
     "lore": "Every road out of the Vale begins beneath this arch. Yours did too, apparently — the keeper marks your name in chalk and misspells it."},
    {"km": 10,   "key": "millbrook",  "name": "Millbrook Fields",     "icon": "road_field",
     "lore": "Wheat to the horizon and one very opinionated scarecrow. Travelers leave a pebble on the stile for luck; the pile is now taller than the stile."},
    {"km": 25,   "key": "ford",       "name": "The Whispering Ford",  "icon": "road_ford",
     "lore": "The river here repeats everything you say, half a second late and slightly kinder. Many stay an hour longer than they meant to."},
    {"km": 50,   "key": "thornwood",  "name": "Thornwood",            "icon": "road_forest",
     "lore": "The trees grew thorns to keep the lazy out, or so the sign claims. The path through is worn smooth by those who kept going anyway."},
    {"km": 75,   "key": "saltflats",  "name": "The Salt Flats",       "icon": "road_salt",
     "lore": "White, flat, and honest — no shade, no shortcuts, nowhere to pretend. The horizon watches you earn every step."},
    {"km": 100,  "key": "cinder",     "name": "Cinder Pass",          "icon": "road_pass",
     "lore": "A hundred kilometers from home, the mountains finally let you through. The wind up here has opinions about your pacing."},
    {"km": 150,  "key": "glasslake",  "name": "The Glass Lake",       "icon": "road_lake",
     "lore": "So still it doubles the sky. Pilgrims report seeing the person they were at kilometer zero looking back up at them, visibly impressed."},
    {"km": 200,  "key": "steppe",     "name": "The Howling Steppe",   "icon": "road_steppe",
     "lore": "Grass, wind, and distance in every direction. The howling turns out to be the wind. Mostly."},
    {"km": 300,  "key": "sunken",     "name": "The Sunken City",      "icon": "road_sunken",
     "lore": "Towers lean out of the marsh like old men mid-sentence. Whoever lived here also skipped leg day, the masons' records suggest. It did not save them."},
    {"km": 400,  "key": "mirror",     "name": "The Mirror Peaks",     "icon": "road_peaks",
     "lore": "Twin mountains, each convinced it is the original. The echo of your footsteps arrives before you do."},
    {"km": 500,  "key": "lighthouse", "name": "The Last Lighthouse",  "icon": "road_lighthouse",
     "lore": "Five hundred kilometers of road behind you, and a light that has burned for no one in a century flickers on as you approach. It remembers what feet sound like."},
    {"km": 650,  "key": "gardens",    "name": "The Hanging Gardens of Whit", "icon": "road_gardens",
     "lore": "Planted by a gardener who believed rest was a plant you had to water. Everything here blooms sideways, unhurried, magnificent."},
    {"km": 800,  "key": "teeth",      "name": "The World's Teeth",    "icon": "road_teeth",
     "lore": "Jagged white spires the maps refuse to draw consistently. Between them the road narrows to a dare."},
    {"km": 1000, "key": "edge",       "name": "The Edge of the Map",  "icon": "road_edge",
     "lore": "The cartographers stopped here. The road did not. A signpost reads simply: 'FURTHER'."},
]

BEYOND_INTERVAL_KM = 250
BEYOND_ADJ = ["Nameless", "Patient", "Unwritten", "Wandering", "Quiet", "Furthest",
              "Stubborn", "Endless", "Borrowed", "Hollow", "Windworn", "Sleepless"]
BEYOND_NOUN = ["Cairn", "Milestone", "Waymark", "Crossing", "Rest", "Threshold",
               "Vigil", "Reach", "Standing Stone", "Marker"]


def _beyond_landmark(n):
    """The nth landmark past the Edge of the Map — procedurally named, forever."""
    rng = random.Random(f"beyond:{n}")
    return {
        "km": 1000 + BEYOND_INTERVAL_KM * n,
        "key": f"beyond_{n}",
        "name": f"The {rng.choice(BEYOND_ADJ)} {rng.choice(BEYOND_NOUN)}",
        "icon": "road_cairn",
        "lore": rng.choice([
            "No map admits this place exists. Your legs disagree.",
            "Someone stacked these stones for whoever came next. That was you.",
            "The road here is only a suggestion, and still you followed it.",
            "Past the edge of the map, distance stops being geography and becomes biography.",
        ]),
    }


def total_km():
    """Lifetime road distance, by the counting rules in the module docstring."""
    cats = {}
    for cat in ("run", "walk", "swim", "ride"):
        types = game.CATEGORIES[cat]
        ph = ",".join("?" * len(types))
        row = db.q(f"SELECT SUM(distance) AS d FROM activities WHERE type IN ({ph})", types).fetchone()
        cats[cat] = (row["d"] or 0) / 1000.0
    km = cats["run"] + cats["walk"] + cats["swim"] + cats["ride"] * RIDE_FACTOR
    return km, cats


def _landmarks_through(km):
    """All authored landmarks, plus enough 'beyond' cairns to cover the
    traveled distance and show the next two unreached."""
    marks = list(LANDMARKS)
    if not isinstance(km, (int, float)) or not math.isfinite(km) or km < 0:
        return marks
    n = 1
    while marks[-1]["km"] <= km + BEYOND_INTERVAL_KM * 2:
        marks.append(_beyond_landmark(n))
        n += 1
    return marks


def _reward_for(index):
    """Rewards grow gently with distance; every third landmark adds a pack."""
    return {
        "gold": 30 + index * 10,
        "tokens": 1,
        "pack": index % 3 == 2,
    }


def state():
    km, cats = total_km()
    distance_known = math.isfinite(km) and km >= 0
    claimed = set(db.kv_get("road_claimed", []))
    marks = _landmarks_through(km)
    out = []
    for i, m in enumerate(marks):
        reached = distance_known and km >= m["km"]
        out.append({
            "km": m["km"], "key": m["key"], "name": m["name"] if reached else "???",
            "icon": m["icon"], "reached": reached,
            "claimed": m["key"] in claimed,
            "lore": m["lore"] if reached else None,
            "reward": _reward_for(i) if reached and m["key"] not in claimed else None,
        })
    nxt = next((m for m in out if not m["reached"]), None)
    return {
        "total_km": round(km, 1) if distance_known else "unknown",
        "breakdown": {
            key: round(value, 1) if math.isfinite(value) else "unknown"
            for key, value in cats.items()
        },
        "ride_factor": RIDE_FACTOR,
        "landmarks": out,
        "next_km": nxt["km"] if distance_known and nxt else None,
        "km_to_next": round(nxt["km"] - km, 1) if distance_known and nxt else None,
        "unclaimed": sum(1 for m in out if m["reached"] and not m["claimed"]),
    }


def claim_next():
    """Claim the oldest reached-but-unclaimed landmark; returns its card."""
    km, _ = total_km()
    if not math.isfinite(km) or km < 0:
        raise ValueError("The Long Road cannot make out the distance in its ledger.")
    claimed = db.kv_get("road_claimed", [])
    marks = _landmarks_through(km)
    for i, m in enumerate(marks):
        if km >= m["km"] and m["key"] not in claimed:
            reward = _reward_for(i)
            c = game.get_char()
            c["gold"] += reward["gold"]
            c["tokens"] += reward["tokens"]
            game.save_char(c)
            if reward["pack"]:
                db.inv_add("monster_pack")
            claimed.append(m["key"])
            db.kv_set("road_claimed", claimed)
            db.log_event(game.now_iso(), "road",
                         f"The Long Road: reached {m['name']} ({m['km']} km walked).")
            return {"landmark": m["name"], "km": m["km"], "lore": m["lore"],
                    "reward": reward, "character": c}
    raise ValueError("The road stretches on — no new landmark underfoot yet.")

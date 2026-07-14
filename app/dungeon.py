"""The Undercroft: server-side roguelike engine, Binding-of-Isaac rules.

You descend with nothing but your training. EVERYTHING — weapons, armor,
charms, trinkets, potions — is found below: a shop on every floor (Pip gets
around), a relic room on every floor, chests, and monster drops. None of it
ever leaves the dungeon: retire and only your looted gold banks; die and even
that stays down there, plus your depth resets to floor 1.

Vigor (earned by completing workout quests) buys expeditions.
"""
import math
import random
from datetime import datetime

from . import db, items, game

SIZE = 6
ENTER_COST = 2
MONSTER_CAPTURE_CHANCE = 0.05
BOSS_CAPTURE_CHANCE = 0.20
LUCK_CAPTURE_BONUS = 0.008

MONSTERS = [
    # (min_floor, name, sprite, hp, atk, def, gold)
    (1, "Giant Rat", "rat", 8, 3, 0, 6),
    (1, "Cave Bat", "bat", 6, 4, 0, 5),
    (1, "Mudslick Slime", "slime", 10, 3, 1, 7),
    (2, "Skeleton Porter", "skeleton", 12, 5, 1, 10),
    (3, "Cultist of the Soft Couch", "cultist", 14, 6, 1, 14),
    (4, "Ghoul", "ghoul", 18, 7, 2, 18),
    (5, "Rust Wraith", "wraith", 20, 8, 2, 24),
    (7, "Undercroft Troll", "troll", 30, 10, 3, 36),
    (9, "Pale Drake", "drake", 38, 12, 4, 50),
]

BOSSES = [
    ("The Gatekeeper of Sloth", "boss1"),
    ("Grandmother Rot", "boss2"),
    ("The Hollow King", "boss3"),
]

# Floor themes: one biome per 3-floor band, matching the boss cadence so each
# theme culminates in its own boss fight, then cycles. Purely cosmetic —
# names, flavor text, and an accent color; no numbers change.
THEMES = [
    {"key": "catacombs", "name": "The Catacombs", "accent": "#b8a888",
     "adj": ["Crypt", "Barrow", "Bone-Dust"],
     "enter": "Dry bones and dead prayers. The Catacombs do not mind visitors; they mind leavers.",
     "empties": [
         "Niches of the politely dead. None of them stir. Probably.",
         "A prayer is scratched here in a dead tongue. It rhymes with 'lift'.",
         "Bone dust settles in your bootprints, tidying up after you.",
     ]},
    {"key": "fungal", "name": "The Fungal Deep", "accent": "#7ab55c",
     "adj": ["Sporeback", "Glowcap", "Mold-Slick"],
     "enter": "The walls breathe here. Glowcaps light the way — for whom, it is not said.",
     "empties": [
         "A chamber of soft blue light. The mushrooms lean toward you, listening.",
         "Spores drift like slow snow. You try not to think about your lungs.",
         "Something vast and fungal exhales, far below. The floor rises slightly.",
     ]},
    {"key": "drowned", "name": "The Drowned Halls", "accent": "#6aa0c8",
     "adj": ["Barnacled", "Tide-Worn", "Silt-Heavy"],
     "enter": "Water to the ankle, cold as debt. Somewhere, a bell rings under the flood.",
     "empties": [
         "Ankle-deep water, black as ink. Your reflection lags a half-second behind.",
         "Fish with too many eyes watch from a flooded stair.",
         "High-water marks on the wall, each one higher than the last. Hm.",
     ]},
    {"key": "ashen", "name": "The Ashen Foundry", "accent": "#e07030",
     "adj": ["Cinder", "Slag-Crusted", "Smolder"],
     "enter": "Dead forges, warm walls. Whatever worked these fires never clocked out.",
     "empties": [
         "A cold anvil the size of an ox. The hammer beside it is worse.",
         "Slag glitters in the walls like a night sky that fell on hard times.",
         "The air tastes of iron and overtime.",
     ]},
    {"key": "roots", "name": "The Roots of the World", "accent": "#a06ac8",
     "adj": ["Gnarled", "Loam-Dark", "Deep-Root"],
     "enter": "Roots thick as towers. You are under everything now, including your own history.",
     "empties": [
         "A root the width of a road pulses, once, like a slow heart.",
         "Loam and old starlight. The dark here is older than the stone above it.",
         "Something far above creaks — the world, shifting its weight on you.",
     ]},
]


def theme_for(floor):
    return THEMES[((floor - 1) // 3) % len(THEMES)]


def theme_payload(d):
    """The bits the frontend needs, or None when not below."""
    if not d:
        return None
    t = theme_for(d["floor"])
    return {"key": t["key"], "name": t["name"], "accent": t["accent"]}

GEAR_TIERS = {
    "weapon": ["sword_rusty", "sword_soldier", "warhammer", "runeblade"],
    "armor": ["vest_padded", "chain_shirt", "plate", "dragonscale"],
    "charm": ["pendant_vigor", "clover", "ring_greed", "second_wind"],
}

CONSUMABLES = ["potion_small", "potion_big", "bomb", "smoke_bomb", "whetstone",
               "ironskin", "torch", "bread"]


def _tier_for_floor(floor, rng):
    """0-3, biased upward as you descend."""
    base = min(3, (floor - 1) // 3)
    t = base + (1 if rng.random() < 0.3 else 0)
    return min(3, t)


def base_stats():
    """What your training earned you — the only thing you bring down."""
    c = game.get_char()
    s = c["stats"]
    return {
        "max_hp": 18 + s["con"] * 2 + c["level"] * 2,
        "atk": 3 + math.floor(s["str"] * 0.6) + c["level"] // 2,
        "def": math.floor(s["con"] * 0.3),
        "luck": math.floor(s["spr"] * 0.5),
        "greed": 0.0,
        "crit": 0,
        "revive": False,
    }


def run_stats(d):
    """Base stats + everything the dungeon has yielded this run."""
    ps = base_stats()
    for slot in ("weapon", "armor", "charm"):
        it = items.ITEMS.get(d["gear"].get(slot) or "", {})
        ps["atk"] += it.get("atk", 0)
        ps["def"] += it.get("def", 0)
        ps["max_hp"] += it.get("hp", 0)
        ps["luck"] += it.get("luck", 0)
        ps["greed"] += it.get("greed", 0)
        ps["revive"] = ps["revive"] or it.get("revive", False)
    for tid in d.get("trinkets", []):
        eff = items.TRINKETS.get(tid, {}).get("effect", {})
        ps["atk"] += eff.get("atk", 0)
        ps["def"] += eff.get("def", 0)
        ps["max_hp"] += eff.get("hp", 0)
        ps["luck"] += eff.get("luck", 0)
        ps["greed"] += eff.get("greed", 0)
        ps["crit"] += eff.get("crit", 0)
    return ps


def player_stats():
    d = get_state()
    return run_stats(d) if d else base_stats()


def _gen_floor(floor, rng):
    cells = {}
    x, y = 0, rng.randrange(SIZE)
    start = (x, y)
    path = [start]
    visited = {start}
    while len(visited) < 16:
        dx, dy = rng.choice([(1, 0), (-1, 0), (0, 1), (0, -1), (1, 0)])
        nx, ny = path[-1][0] + dx, path[-1][1] + dy
        if 0 <= nx < SIZE and 0 <= ny < SIZE:
            path.append((nx, ny))
            visited.add((nx, ny))
        elif rng.random() < 0.3 and len(path) > 1:
            path.pop()
    far = max(visited, key=lambda p: abs(p[0] - start[0]) + abs(p[1] - start[1]))
    for pos in visited:
        if pos == start:
            t = "entrance"
        elif pos == far:
            t = "stairs"
        else:
            r = rng.random()
            if r < 0.36:
                t = "monster"
            elif r < 0.52:
                t = "chest"
            elif r < 0.62:
                t = "trap"
            elif r < 0.68:
                t = "shrine"
            else:
                t = "empty"
        cells[f"{pos[0]},{pos[1]}"] = {"type": t, "seen": pos == start, "cleared": pos == start}
    # Isaac rules: every floor gets a shop and a relic room
    plain = [k for k, v in cells.items() if v["type"] in ("empty", "trap", "shrine")]
    rng.shuffle(plain)
    if plain:
        cells[plain.pop()] = {"type": "merchant", "seen": False, "cleared": False}
    if plain:
        cells[plain.pop()] = {"type": "relic", "seen": False, "cleared": False}
    boss = floor % 3 == 0
    return {"cells": cells, "px": start[0], "py": start[1], "boss_floor": boss,
            "shop_stock": None, "relic": None}


def _monster_for(floor, rng, boss=False):
    if boss:
        name, sprite = BOSSES[(floor // 3 - 1) % len(BOSSES)]
        hp = 24 + floor * 4
        return {"name": name, "sprite": sprite, "hp": hp, "max_hp": hp,
                "atk": 6 + floor, "def": 1 + floor // 3, "gold": 30 + floor * 8, "boss": True}
    pool = [m for m in MONSTERS if m[0] <= floor]
    _, name, sprite, hp, atk, deff, gold = rng.choice(pool[-4:] if len(pool) > 4 else pool)
    hp = hp + floor * 2 + rng.randint(0, 3)
    if rng.random() < 0.6:  # the biome rubs off on its residents
        name = f"{rng.choice(theme_for(floor)['adj'])} {name}"
    return {"name": name, "sprite": sprite, "hp": hp, "max_hp": hp,
            "atk": atk + floor // 2, "def": deff, "gold": gold + floor * 2, "boss": False}


def get_state():
    return db.kv_get("dungeon")


def _save(d):
    db.kv_set("dungeon", d)


def enter():
    if get_state():
        raise ValueError("You are already below. Finish what you started.")
    c = game.get_char()
    if c["vigor"] < ENTER_COST:
        raise ValueError(f"The Warden bars the gate: you need {ENTER_COST} Vigor. Complete quests to earn it.")
    c["vigor"] -= ENTER_COST
    game.save_char(c)
    floor = max(1, db.kv_get("resume_floor", 1))
    rng = random.Random()
    d = {
        "floor": floor,
        "gear": {"weapon": None, "armor": None, "charm": None},
        "items": {"bread": 1},
        "trinkets": [],
        "buff_atk": 0, "buff_def": 0,
        "loot_gold": 0,
        "combat": None,
        "seed": rng.randint(0, 2**31),
        "log": [f"Floor {floor} — {theme_for(floor)['name']}. {theme_for(floor)['enter']}",
                "You carry nothing but your training. The dark provides — at a price."],
    }
    d["hp"] = base_stats()["max_hp"]
    d.update(_gen_floor(floor, random.Random(d["seed"])))
    _reveal_adjacent(d)
    _save(d)
    db.log_event(game.now_iso(), "dungeon", f"Descended into the Undercroft (floor {floor}).")
    return d


def _cell(d, x, y):
    return d["cells"].get(f"{x},{y}")


def _reveal_adjacent(d):
    for dx, dy in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        c = _cell(d, d["px"] + dx, d["py"] + dy)
        if c:
            c["seen"] = True


def _rng(d):
    return random.Random()


def _run_item_add(d, iid, n=1):
    d["items"][iid] = d["items"].get(iid, 0) + n


def _run_item_remove(d, iid):
    if d["items"].get(iid, 0) < 1:
        return False
    d["items"][iid] -= 1
    if d["items"][iid] == 0:
        del d["items"][iid]
    return True


def _gen_shop(d, rng):
    """Pip's floor shop: consumables plus one piece of gear or a trinket."""
    stock = []
    for iid in rng.sample(CONSUMABLES, 3):
        base = items.ITEMS[iid].get("price", 20) or 20
        stock.append({"id": iid, "kind": "item",
                      "price": max(4, int(base * 0.4 * rng.uniform(0.8, 1.25) * (1 + d["floor"] * 0.08)))})
    if rng.random() < 0.55:
        slot = rng.choice(["weapon", "armor", "charm"])
        gid = GEAR_TIERS[slot][_tier_for_floor(d["floor"], rng)]
        base = items.ITEMS[gid].get("price") or 180
        stock.append({"id": gid, "kind": "gear",
                      "price": max(15, int(base * 0.35 * rng.uniform(0.85, 1.2)))})
    else:
        tid = rng.choice(list(items.TRINKETS.keys()))
        stock.append({"id": tid, "kind": "trinket",
                      "price": int(30 + d["floor"] * 6 * rng.uniform(0.8, 1.3))})
    return stock


def _gen_relic(d, rng):
    """The floor's pedestal: one free power, take it or leave it."""
    if rng.random() < 0.6:
        slot = rng.choice(["weapon", "armor", "charm"])
        gid = GEAR_TIERS[slot][_tier_for_floor(d["floor"], rng)]
        return {"kind": "gear", "id": gid, "slot": slot}
    tid = rng.choice([t for t in items.TRINKETS if t not in d["trinkets"]] or list(items.TRINKETS))
    return {"kind": "trinket", "id": tid}


def _pdmg(d, ps, rng, mult=1.0):
    m = d["combat"]
    crit = rng.randint(1, 100) <= 5 + ps["luck"] * 2 + ps.get("crit", 0)
    dmg = max(1, int((ps["atk"] + d["buff_atk"] + rng.randint(0, 3) - m["def"]) * mult))
    if crit:
        dmg = int(dmg * 1.8)
    return dmg, crit


def _monster_hit(d, ps, rng, braced=False):
    m = d["combat"]
    dmg = max(1, m["atk"] + rng.randint(0, 2) - ps["def"] - d["buff_def"])
    if braced:
        dmg = max(0, dmg // 2)
    d["hp"] -= dmg
    return dmg


def _on_kill(d, ps, rng, result):
    """Loot, possible capture, cell cleanup after a monster falls."""
    from . import monsters as menagerie
    m = d["combat"]
    gold = int(m["gold"] * (1 + ps["greed"]))
    d["loot_gold"] += gold
    d["log"].append(f"The {m['name']} falls! You claim {gold} gold.")
    droll = 0.5 if m["boss"] else 0.15
    if rng.random() < droll:
        drop = rng.choice(CONSUMABLES)
        _run_item_add(d, drop)
        d["log"].append(f"It was carrying: {items.get(drop)['name']}!")
    cap_chance = BOSS_CAPTURE_CHANCE if m["boss"] else MONSTER_CAPTURE_CHANCE + ps["luck"] * LUCK_CAPTURE_BONUS
    if rng.random() < cap_chance:
        mon = menagerie.capture(m["name"], d["floor"], boss=m["boss"])
        d["log"].append(f"It yields rather than dies! '{mon['name']}' ({mon['rarity']}, {mon['personality']}) joins your menagerie.")
        result["captured"] = mon
    cell = _cell(d, d["px"], d["py"])
    cell["cleared"] = True
    if m["boss"]:
        cell["boss_dead"] = True
    d["combat"] = None


def _die(d):
    """Death: everything found this run stays down here. Depth resets."""
    c = game.get_char()
    ps = run_stats(d)
    if ps["revive"]:
        # the amulet shatters, whichever slot it rode in
        if d["gear"].get("charm") == "second_wind":
            d["gear"]["charm"] = None
        d["hp"] = max(1, run_stats(d)["max_hp"] // 2)
        d["combat"] = None
        d["log"].append("The Amulet of Second Wind shatters — and you breathe again.")
        _save(d)
        return {"died": False, "revived": True}
    c["deaths"] += 1
    game.save_char(c)
    db.kv_set("resume_floor", 1)
    db.kv_del("dungeon")
    db.log_event(game.now_iso(), "death",
                 f"Died on floor {d['floor']}. {d['loot_gold']} unbanked gold and everything found stays in the dark.")
    return {
        "died": True, "floor": d["floor"], "lost_gold": d["loot_gold"],
        "lost_items": [], "toll": None,
    }


def action(payload):
    d = get_state()
    if not d:
        raise ValueError("You are not in the Undercroft.")
    act = payload.get("action")
    rng = _rng(d)
    ps = run_stats(d)
    d["log"] = []
    result = {}

    if act == "move":
        if d["combat"]:
            raise ValueError("The foe blocks your path.")
        dx, dy = {"n": (0, -1), "s": (0, 1), "e": (1, 0), "w": (-1, 0)}[payload["dir"]]
        nx, ny = d["px"] + dx, d["py"] + dy
        cell = _cell(d, nx, ny)
        if not cell:
            raise ValueError("A wall of old stone. No way through.")
        d["px"], d["py"] = nx, ny
        cell["seen"] = True
        _reveal_adjacent(d)
        if not cell["cleared"]:
            t = cell["type"]
            if t == "monster" or (t == "stairs" and d["boss_floor"] and not cell.get("boss_dead")):
                boss = t == "stairs" and d["boss_floor"]
                d["combat"] = _monster_for(d["floor"], rng, boss=boss)
                d["log"].append(f"{'The way down is guarded! ' if boss else ''}A {d['combat']['name']} attacks!")
                if rng.random() < 0.25:
                    dmg = _monster_hit(d, ps, rng)
                    d["log"].append(f"Ambush! It strikes first for {dmg}.")
            elif t == "chest":
                gold = int((5 + d["floor"] * 3 + rng.randint(0, 8)) * (1 + ps["greed"]))
                d["loot_gold"] += gold
                d["log"].append(f"A dusty chest: {gold} gold.")
                r2 = rng.random()
                if r2 < 0.25:
                    drop = rng.choice(CONSUMABLES)
                    _run_item_add(d, drop)
                    d["log"].append(f"Beneath the coins: {items.get(drop)['name']}!")
                elif r2 < 0.33 and len(d["trinkets"]) < 8:
                    tid = rng.choice([t_ for t_ in items.TRINKETS if t_ not in d["trinkets"]] or list(items.TRINKETS))
                    if tid not in d["trinkets"]:
                        d["trinkets"].append(tid)
                        d["log"].append(f"A trinket glints: {items.trinket(tid)['name']} — {items.trinket(tid)['desc']}")
                cell["cleared"] = True
            elif t == "trap":
                dodge = rng.randint(1, 100) <= 25 + ps["luck"] * 3
                if dodge:
                    d["log"].append("A blade whistles past your ear. The trap misses.")
                else:
                    dmg = rng.randint(2, 4 + d["floor"])
                    d["hp"] -= dmg
                    d["log"].append(f"A trap! Rusty spikes bite for {dmg}.")
                cell["cleared"] = True
            elif t == "shrine":
                heal = max(4, int(ps["max_hp"] * 0.3))
                d["hp"] = min(ps["max_hp"], d["hp"] + heal)
                d["log"].append(f"A quiet shrine to forgotten wardens. You recover {heal} HP.")
                cell["cleared"] = True
            elif t == "merchant":
                if not d.get("shop_stock"):
                    d["shop_stock"] = _gen_shop(d, random.Random(d["seed"] ^ 0xB1D))
                d["log"].append("A lantern in the dark — Pip?! 'Every floor, friend. I get around. Cave prices, loot gold only.'")
            elif t == "relic":
                if not d.get("relic"):
                    d["relic"] = _gen_relic(d, random.Random(d["seed"] ^ 0x4E1))
                d["log"].append("A pedestal in a shaft of pale light. Something waits on it.")
            elif t == "stairs":
                d["log"].append("Stairs spiral down into deeper dark.")
            else:
                d["log"].append(rng.choice(theme_for(d["floor"])["empties"] + [
                    "An empty chamber. Something scuttles away.",
                    "Scratched into the wall: 'SHOULD HAVE STRETCHED'.",
                ]))
                cell["cleared"] = True
        elif cell["type"] == "merchant":
            d["log"].append("Pip nods. 'Back for more?'")
        elif cell["type"] == "relic" and d.get("relic"):
            d["log"].append("The pedestal waits, patient as stone.")

    elif act in ("attack", "brace"):
        if not d["combat"]:
            raise ValueError("Nothing to fight here.")
        m = d["combat"]
        if act == "attack":
            dmg, crit = _pdmg(d, ps, rng)
            m["hp"] -= dmg
            d["log"].append(("CRITICAL! " if crit else "") + f"You strike the {m['name']} for {dmg}.")
        else:
            d["log"].append("You brace behind your guard.")
        if m["hp"] > 0:
            dmg = _monster_hit(d, ps, rng, braced=(act == "brace"))
            d["log"].append(f"The {m['name']} hits for {dmg}." if dmg else f"The {m['name']} glances off your guard.")
        else:
            _on_kill(d, ps, rng, result)

    elif act == "flee":
        if not d["combat"]:
            raise ValueError("Nothing to flee from. Yet.")
        if rng.randint(1, 100) <= 55 + ps["luck"] * 2:
            d["combat"] = None
            d["log"].append("You slip away into the dark. The room remains unconquered.")
        else:
            dmg = _monster_hit(d, ps, rng)
            d["log"].append(f"You stumble! The {d['combat']['name']} punishes you for {dmg}.")

    elif act == "use":
        iid = payload.get("item_id")
        it = items.ITEMS.get(iid)
        if not it or it.get("type") != "consumable":
            raise ValueError("You cannot use that here.")
        eff = it.get("effect", {})
        if ("bomb" in eff or "escape" in eff) and not d["combat"]:
            raise ValueError("Save it for a fight.")
        if not _run_item_remove(d, iid):
            raise ValueError("Your pack holds no such thing. The dungeon provides — go find one.")
        if "heal" in eff:
            d["hp"] = min(ps["max_hp"], d["hp"] + eff["heal"])
            d["log"].append(f"You use the {it['name']}: +{eff['heal']} HP.")
            if d["combat"]:
                dmg = _monster_hit(d, ps, rng)
                d["log"].append(f"The {d['combat']['name']} hits for {dmg} while you drink.")
        elif "bomb" in eff:
            m = d["combat"]
            dmg = eff["bomb"] + d["floor"]
            m["hp"] -= dmg
            d["log"].append(f"BOOM. The {m['name']} takes {dmg}.")
            if m["hp"] <= 0:
                _on_kill(d, ps, rng, result)
            else:
                dmg2 = _monster_hit(d, ps, rng)
                d["log"].append(f"It retaliates for {dmg2}.")
        elif "escape" in eff:
            d["combat"] = None
            d["log"].append("Smoke everywhere. When it clears, you are elsewhere.")
        elif "buff_atk" in eff:
            d["buff_atk"] += eff["buff_atk"]
            d["log"].append(f"You hone your weapon. +{eff['buff_atk']} ATK this expedition.")
        elif "buff_def" in eff:
            d["buff_def"] += eff["buff_def"]
            d["log"].append(f"Your skin takes on an iron sheen. +{eff['buff_def']} DEF this expedition.")
        elif "reveal" in eff:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    cc = _cell(d, d["px"] + dx, d["py"] + dy)
                    if cc:
                        cc["seen"] = True
            d["log"].append("Torchlight pushes back the dark.")

    elif act == "buy":
        cell = _cell(d, d["px"], d["py"])
        if not cell or cell["type"] != "merchant":
            raise ValueError("Pip is not here. Pip is somewhere else, being elusive.")
        stock = d.get("shop_stock") or []
        entry = next((s for s in stock if s["id"] == payload.get("item_id")), None)
        if not entry:
            raise ValueError("Pip pats his pockets. 'Fresh out of that one.'")
        if d["loot_gold"] < entry["price"]:
            raise ValueError("'Loot gold only down here, friend. Go shake some monsters,' says Pip.")
        d["loot_gold"] -= entry["price"]
        stock.remove(entry)
        if entry["kind"] == "trinket":
            t = items.trinket(entry["id"])
            if entry["id"] in d["trinkets"]:
                d["loot_gold"] += entry["price"]
                raise ValueError("You already carry that trinket.")
            d["trinkets"].append(entry["id"])
            d["log"].append(f"Bought {t['name']}. {t['desc']}")
        elif entry["kind"] == "gear":
            it = items.get(entry["id"])
            slot = it["type"]
            old = d["gear"].get(slot)
            d["gear"][slot] = entry["id"]
            d["log"].append(f"Bought {it['name']}." + (f" Your {items.get(old)['name']} clatters to the floor, spent." if old else ""))
        else:
            _run_item_add(d, entry["id"])
            d["log"].append(f"Bought {items.get(entry['id'])['name']}. Pip tips his cap.")

    elif act == "take_relic":
        cell = _cell(d, d["px"], d["py"])
        if not cell or cell["type"] != "relic" or cell["cleared"] or not d.get("relic"):
            raise ValueError("No pedestal here, or it stands empty.")
        r = d["relic"]
        if r["kind"] == "gear":
            it = items.get(r["id"])
            old = d["gear"].get(r["slot"])
            d["gear"][r["slot"]] = r["id"]
            d["log"].append(f"You take the {it['name']} from the pedestal." + (f" The {items.get(old)['name']} crumbles to rust." if old else ""))
        else:
            t = items.trinket(r["id"])
            if r["id"] not in d["trinkets"]:
                d["trinkets"].append(r["id"])
            d["log"].append(f"You take the {t['name']}. {t['desc']}")
        cell["cleared"] = True
        d["relic"] = None

    elif act == "descend":
        cell = _cell(d, d["px"], d["py"])
        if not cell or cell["type"] != "stairs":
            raise ValueError("No stairs here.")
        if d["combat"]:
            raise ValueError("The guardian still stands.")
        if d["boss_floor"] and not cell.get("boss_dead"):
            raise ValueError("Something vast sleeps on the stairs. Wake it first.")
        d["floor"] += 1
        c = game.get_char()
        if d["floor"] > c["deepest_floor"]:
            c["deepest_floor"] = d["floor"]
            game.save_char(c)
        d["seed"] = rng.randint(0, 2**31)
        d.update(_gen_floor(d["floor"], random.Random(d["seed"])))
        _reveal_adjacent(d)
        heal = max(2, ps["max_hp"] // 10)
        for tid in d["trinkets"]:
            heal += items.TRINKETS.get(tid, {}).get("effect", {}).get("moss", 0)
        d["hp"] = min(ps["max_hp"], d["hp"] + heal)
        t = theme_for(d["floor"])
        crossed = (d["floor"] - 1) % 3 == 0  # first floor of a new biome
        d["log"] = [f"Floor {d['floor']} — {t['name']}. " +
                    (t["enter"] if crossed else "The air grows colder.") + f" (+{heal} HP)"]

    elif act == "retire":
        cell = _cell(d, d["px"], d["py"])
        if cell["type"] not in ("entrance", "stairs"):
            raise ValueError("You can only retire at the entrance or the stairs.")
        if d["combat"]:
            raise ValueError("Not while something is trying to eat you.")
        c = game.get_char()
        c["gold"] += d["loot_gold"]
        game.save_char(c)
        db.kv_set("resume_floor", d["floor"])
        db.kv_del("dungeon")
        db.log_event(game.now_iso(), "dungeon",
                     f"Retired from floor {d['floor']} with {d['loot_gold']} gold banked. The gear stayed below, as it must.")
        return {"retired": True, "banked_gold": d["loot_gold"],
                "banked_items": [], "floor": d["floor"]}
    else:
        raise ValueError("The dark does not understand.")

    if d["hp"] <= 0:
        death = _die(d)
        if death.get("died"):
            return {"death": death, "log": d["log"]}
    _save(d)
    result["state"] = d
    result["log"] = d["log"]
    return result

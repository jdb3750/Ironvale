"""Item catalog: shop stock, gacha (Crankwerk) pool, equipment and consumables."""
import random

# slot: weapon / armor / charm.  consumables have effects used in town or dungeon.
ITEMS = {
    # ---- consumables ----
    "potion_small":  {"name": "Lesser Healing Draught", "sprite": "potion", "type": "consumable", "rarity": "common",   "price": 25,  "desc": "Restores 12 HP in the Undercroft.", "effect": {"heal": 12}},
    "potion_big":    {"name": "Greater Healing Draught", "sprite": "potion_big", "type": "consumable", "rarity": "uncommon", "price": 60,  "desc": "Restores 30 HP in the Undercroft.", "effect": {"heal": 30}},
    "bomb":          {"name": "Blackpowder Bomb",  "sprite": "bomb", "type": "consumable", "rarity": "common",   "price": 30,  "desc": "Deals heavy damage to a foe. Combat only.", "effect": {"bomb": 10}},
    "smoke_bomb":    {"name": "Smoke Bomb",        "sprite": "smoke", "type": "consumable", "rarity": "common",   "price": 20,  "desc": "Escape any fight, guaranteed.", "effect": {"escape": True}},
    "whetstone":     {"name": "Dwarven Whetstone", "sprite": "whetstone",  "type": "consumable", "rarity": "uncommon", "price": 45,  "desc": "+3 ATK for the rest of this expedition.", "effect": {"buff_atk": 3}},
    "ironskin":      {"name": "Ironskin Draught",  "sprite": "flask_iron", "type": "consumable", "rarity": "uncommon", "price": 45,  "desc": "+3 DEF for the rest of this expedition.", "effect": {"buff_def": 3}},
    "torch":         {"name": "Everbright Torch",  "sprite": "torch_item", "type": "consumable", "rarity": "common",   "price": 15,  "desc": "Reveals all rooms adjacent to you.", "effect": {"reveal": True}},
    "bread":         {"name": "Waybread",          "sprite": "bread", "type": "consumable", "rarity": "common",   "price": 10,  "desc": "Restores 5 HP. Tastes of home.", "effect": {"heal": 5}},
    # ---- weapons ----
    "sword_rusty":   {"name": "Rusty Shortsword",  "sprite": "sword_rusty", "type": "weapon", "rarity": "common",    "price": 45,  "atk": 1, "desc": "It has seen better centuries. +1 ATK."},
    "sword_soldier": {"name": "Soldier's Blade",   "sprite": "sword", "type": "weapon", "rarity": "uncommon",  "price": 110, "atk": 2, "desc": "Honest steel. +2 ATK."},
    "warhammer":     {"name": "Warden's Maul",     "sprite": "hammer", "type": "weapon", "rarity": "rare",     "price": 200, "atk": 3, "desc": "Argument-ender. +3 ATK."},
    "runeblade":     {"name": "Runeblade of the Vale", "sprite": "runeblade", "type": "weapon", "rarity": "legendary", "price": None, "atk": 5, "desc": "Whispers in a dead tongue. +5 ATK. Crankwerk only."},
    # ---- armor ----
    "vest_padded":   {"name": "Padded Vest",       "sprite": "vest", "type": "armor", "rarity": "common",    "price": 45,  "def": 1, "desc": "Better than a shirt. +1 DEF."},
    "chain_shirt":   {"name": "Chain Shirt",       "sprite": "chain", "type": "armor", "rarity": "uncommon",  "price": 120, "def": 2, "desc": "Rings of good iron. +2 DEF."},
    "plate":         {"name": "Vale Plate",        "sprite": "plate_armor", "type": "armor", "rarity": "rare",      "price": 220, "def": 3, "desc": "Forged for the old wardens. +3 DEF."},
    "dragonscale":   {"name": "Dragonscale Cloak", "sprite": "cloak", "type": "armor", "rarity": "legendary", "price": None, "def": 5, "desc": "Still warm. +5 DEF. Crankwerk only."},
    # ---- charms ----
    "pendant_vigor": {"name": "Pendant of Vigor",  "sprite": "pendant", "type": "charm", "rarity": "uncommon",  "price": 90,  "hp": 6,   "desc": "+6 max HP in the Undercroft."},
    "ring_greed":    {"name": "Ring of Greed",     "sprite": "ring", "type": "charm", "rarity": "rare",      "price": 150, "greed": 0.25, "desc": "+25% gold found in the Undercroft."},
    "clover":        {"name": "Lucky Clover",      "sprite": "clover", "type": "charm", "rarity": "uncommon",  "price": 80,  "luck": 4, "desc": "+4 LCK. Traps miss, crits land."},
    "second_wind":   {"name": "Amulet of Second Wind", "sprite": "amulet", "type": "charm", "rarity": "legendary", "price": None, "revive": True, "desc": "Cheat death once, then it shatters. Crankwerk only."},
    # ---- packs ----
    "monster_pack":  {"name": "Monster Pack",      "sprite": "pack", "type": "pack", "rarity": "uncommon", "price": 500, "desc": "Three procedurally questionable creatures. Rip it open at the ranch."},
    # ---- menagerie hats (Crankwerk cosmetics — droppable onto monsters) ----
    "hat_cone":    {"name": "Party Cone",        "sprite": "hat_cone",   "type": "hat", "rarity": "common",    "price": None, "desc": "A festive little cone. Mandatory fun."},
    "hat_bow":     {"name": "Crimson Bow",       "sprite": "hat_bow",    "type": "hat", "rarity": "common",    "price": None, "desc": "Ties the whole creature together."},
    "hat_mush":    {"name": "Mushroom Cap",      "sprite": "hat_mush",   "type": "hat", "rarity": "common",    "price": None, "desc": "Damp. Stylish. Possibly sentient."},
    "hat_flower":  {"name": "Meadow Flower",     "sprite": "hat_flower", "type": "hat", "rarity": "uncommon",  "price": None, "desc": "Picked from the ranch itself."},
    "hat_top":     {"name": "Tiny Top Hat",      "sprite": "hat_top",    "type": "hat", "rarity": "uncommon",  "price": None, "desc": "For monsters of distinction."},
    "hat_wizard":  {"name": "Wizard's Point",    "sprite": "hat_wizard", "type": "hat", "rarity": "rare",      "price": None, "desc": "+0 to spells. +100 to vibes."},
    "hat_crown":   {"name": "Little Crown",      "sprite": "hat_crown",  "type": "hat", "rarity": "rare",      "price": None, "desc": "Every pen needs a monarch."},
    "hat_halo":    {"name": "Suspicious Halo",   "sprite": "hat_halo",   "type": "hat", "rarity": "legendary", "price": None, "desc": "This monster has definitely done nothing wrong, ever."},
    # ---- siege trophies (weekly raid rewards ONLY — never in the Crankwerk) ----
    "hat_horns":      {"name": "Siegebreaker Horns",   "sprite": "hat_horns",      "type": "hat", "rarity": "legendary", "price": None, "desc": "Sawn from a fallen siege beast. It hardly misses them."},
    "hat_skullcrown": {"name": "Crown of the Unrisen", "sprite": "hat_skullcrown", "type": "hat", "rarity": "legendary", "price": None, "desc": "Bone-white and faintly smug. A siege trophy."},
    "hat_tentacle":   {"name": "The Friendly Tentacle","sprite": "hat_tentacle",   "type": "hat", "rarity": "legendary", "price": None, "desc": "It waves at passersby. A siege trophy."},
    "hat_antlers":    {"name": "Torpor's Antlers",     "sprite": "hat_antlers",    "type": "hat", "rarity": "legendary", "price": None, "desc": "Shed by something vast and sleepy. A siege trophy."},
    "hat_embercrown": {"name": "Ember Crown",          "sprite": "hat_embercrown", "type": "hat", "rarity": "legendary", "price": None, "desc": "Still warm from the siege. Do not store near hay."},
    "hat_eyestalk":   {"name": "The Watchful Stalk",   "sprite": "hat_eyestalk",   "type": "hat", "rarity": "legendary", "price": None, "desc": "It blinks when you aren't looking. A siege trophy."},
    # ---- curios (legacy keepsakes) ----
    "pet_rock":      {"name": "Pet Rock",          "sprite": "rock", "type": "curio", "rarity": "common",   "price": None, "desc": "It is loyal. It is a rock."},
    "wooden_spoon":  {"name": "Wooden Spoon",      "sprite": "spoon", "type": "curio", "rarity": "common",   "price": None, "desc": "Award for participation."},
    "old_boot":      {"name": "Surprisingly Old Boot", "sprite": "boot", "type": "curio", "rarity": "common", "price": None, "desc": "Someone ran far in this once."},
    "gilded_bell":   {"name": "Gilded Kettlebell Figurine", "sprite": "bellfig", "type": "curio", "rarity": "rare", "price": None, "desc": "Grunhilda would weep."},
    # ---- pen decorations (appear in the Menagerie automatically) ----
    "decor_flowers": {"name": "Flower Patch",    "sprite": "decor_flowers", "type": "decor", "rarity": "common",   "price": None, "desc": "Brightens the pen. The herd approves."},
    "decor_boulder": {"name": "Ponder Boulder",  "sprite": "decor_boulder", "type": "decor", "rarity": "common",   "price": None, "desc": "For sitting near, thoughtfully."},
    "decor_pond":    {"name": "Wee Pond",        "sprite": "decor_pond",    "type": "decor", "rarity": "uncommon", "price": None, "desc": "Reflects the moon and the occasional monster."},
    "decor_gnome":   {"name": "Garden Gnome",    "sprite": "decor_gnome",   "type": "decor", "rarity": "rare",     "price": None, "desc": "He sees everything. He says nothing."},
}

RARITY_ORDER = ["common", "uncommon", "rare", "legendary"]

# The Crankwerk vends delights for the Menagerie: hats, decor, and packs.
GACHA_POOL = [
    ("hat_cone", 12), ("hat_bow", 12), ("hat_mush", 10),
    ("decor_flowers", 9), ("decor_boulder", 9),
    ("hat_flower", 7), ("hat_top", 7), ("decor_pond", 6),
    ("monster_pack", 6),
    ("hat_wizard", 3), ("hat_crown", 3), ("decor_gnome", 2.5),
    ("hat_halo", 1.2),
]

GACHA_COST_GOLD = 35

# Trinkets: passive powers found only in the Undercroft; they never leave it.
TRINKETS = {
    "tk_foot":   {"name": "Rabbit's Foot",     "sprite": "clover",     "rarity": "common",   "desc": "+3 LCK. The rabbit is fine, probably.", "effect": {"luck": 3}},
    "tk_fang":   {"name": "Troll Fang",        "sprite": "sword_rusty","rarity": "common",   "desc": "+1 ATK. Still sharp with resentment.", "effect": {"atk": 1}},
    "tk_shell":  {"name": "Beetle Shell",      "sprite": "vest",       "rarity": "common",   "desc": "+1 DEF. The beetle donated it, mostly willingly.", "effect": {"def": 1}},
    "tk_coin":   {"name": "Greedy Coin",       "sprite": "ring",       "rarity": "uncommon", "desc": "+20% gold found. It hums near treasure.", "effect": {"greed": 0.2}},
    "tk_heart":  {"name": "Stone Heart",       "sprite": "amulet",     "rarity": "uncommon", "desc": "+6 max HP. Beats once a minute.", "effect": {"hp": 6}},
    "tk_moss":   {"name": "Wardens' Moss",     "sprite": "bread",      "rarity": "uncommon", "desc": "Heal 4 HP each time you descend.", "effect": {"moss": 4}},
    "tk_lens":   {"name": "Cracked Lens",      "sprite": "whetstone",  "rarity": "rare",     "desc": "+12% crit. See the seams in things.", "effect": {"crit": 12}},
    "tk_bell":   {"name": "Grunhilda's Locket","sprite": "bellfig",    "rarity": "rare",     "desc": "+2 ATK, +4 max HP. Smells faintly of chalk.", "effect": {"atk": 2, "hp": 4}},
}


def trinket(tid):
    t = TRINKETS.get(tid)
    return dict(id=tid, **t) if t else None


def require_trinket(tid):
    result = trinket(tid)
    if result is None:
        raise ValueError(f"Unknown trinket ID: {tid}")
    return result


def shop_stock():
    return [
        dict(id=k, **v)
        for k, v in ITEMS.items()
        if v.get("price") is not None
    ]


def gacha_roll(rng: random.Random):
    total = sum(w for _, w in GACHA_POOL)
    pick = rng.uniform(0, total)
    acc = 0.0
    for item_id, w in GACHA_POOL:
        acc += w
        if pick <= acc:
            return item_id
    return GACHA_POOL[-1][0]


def get(item_id):
    it = ITEMS.get(item_id)
    return dict(id=item_id, **it) if it else None


def require_item(item_id):
    result = get(item_id)
    if result is None:
        raise ValueError(f"Unknown item ID: {item_id}")
    return result

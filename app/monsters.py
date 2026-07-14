"""The Menagerie: procedurally generated monsters.

A monster is a name, a personality, a rarity, and a 31-bit DNA seed. The seed
deterministically drives the pixel-sprite generator in the frontend, so the
server never needs to know what a monster looks like — only that some of them
are, frankly, upsetting. Sources: ripped packs, and creatures subdued in the
Undercroft.
"""
import random
import threading

from . import db, game

PACK_COST = 500
PACK_SIZE = 3
STARTER_SOURCE = "starter"
_starter_lock = threading.Lock()

RARITIES = [("common", 60), ("uncommon", 25), ("rare", 12), ("legendary", 3)]

SYL_A = ["Grub", "Snor", "Fizz", "Blib", "Mo", "Quag", "Zim", "Plod", "Wug",
         "Drib", "Hob", "Squig", "Tat", "Yim", "Onk", "Bem", "Glim", "Norb",
         "Fen", "Wib", "Crum", "Dob", "Splo", "Murt", "Gron", "Piff"]
SYL_B = ["bly", "kin", "nub", "zle", "wort", "pod", "gus", "let", "doo",
         "mph", "bert", "wig", "loo", "snout", "kle", "bun", "gle", "fitz",
         "muncher", "ling", "bop", "quist", "dust", "flap"]

PERSONALITIES = [
    "gluttonous", "sleepy", "brave", "anxious", "dramatic", "polite",
    "feral", "smug", "curious", "melancholy", "boisterous", "gentle",
    "suspicious of birds", "afraid of soup", "noble", "unhinged",
    "always cold", "hums constantly", "collects pebbles", "easily offended",
    "convinced it is a dog", "allergic to mornings", "aggressively friendly",
    "plotting something", "just happy to be here",
]


def _roll_rarity(rng):
    total = sum(w for _, w in RARITIES)
    pick = rng.uniform(0, total)
    acc = 0.0
    for r, w in RARITIES:
        acc += w
        if pick <= acc:
            return r
    return "common"


def _build(rng, source, rarity=None):
    return {
        "name": rng.choice(SYL_A) + rng.choice(SYL_B),
        "dna": rng.randint(0, 2**31 - 1),
        "rarity": rarity or _roll_rarity(rng),
        "personality": rng.choice(PERSONALITIES),
        "born": game.now_iso(),
        "source": source,
    }


def _gen(rng, source, rarity=None):
    m = _build(rng, source, rarity)
    cur = db.q(
        "INSERT INTO monsters (name, dna, rarity, personality, born, source) VALUES (?,?,?,?,?,?)",
        (m["name"], m["dna"], m["rarity"], m["personality"], m["born"], m["source"]),
    )
    db.commit()
    m["id"] = cur.lastrowid
    return m


def preview(rng, source, rarity=None):
    """An ephemeral monster dict — never written to the database. Used for
    one-off spectacles (Colosseum rivals) that shouldn't clutter the herd."""
    m = _build(rng, source, rarity)
    m["id"] = None
    m["hat"] = None
    return m


def all_monsters():
    return [dict(r) for r in db.q("SELECT * FROM monsters ORDER BY id").fetchall()]


def ensure_starter():
    with _starter_lock:
        existing = db.q(
            "SELECT * FROM monsters WHERE source=? ORDER BY id LIMIT 1", (STARTER_SOURCE,)
        ).fetchone()
        if existing:
            db.kv_set("starter_claimed", True)
            if not get_buddy():
                db.kv_set("buddy_id", existing["id"])
            return dict(existing)
        if db.kv_get("starter_claimed", False):
            return None
        starter = _gen(random.Random(), STARTER_SOURCE, rarity="common")
        db.kv_set("starter_claimed", True)
        if not get_buddy():
            db.kv_set("buddy_id", starter["id"])
        db.log_event(game.now_iso(), "menagerie", f"{starter['name']} was your first creature. It is small, strange, and yours.")
        return starter


SERIES_ADJ = ["Velvet", "Damp", "Hollow", "Gilded", "Whispering", "Feral", "Sunken",
              "Umbral", "Wandering", "Peculiar", "Mossy", "Thunderous", "Bashful",
              "Forgotten", "Iridescent", "Crumbling", "Midnight", "Wobbling"]
SERIES_NOUN = ["Omens", "Hoard", "Court", "Litter", "Chorus", "Assembly", "Brood",
               "Parade", "Congress", "Menace", "Kindred", "Delegation", "Riot",
               "Symposium", "Puddle", "Vanguard", "Picnic"]


SERIES_EPOCH_YEAR = 2026
SERIES_EPOCH_MONTH = 1  # January 2026 is Series 1


def series_index(year, month):
    return (year - SERIES_EPOCH_YEAR) * 12 + (month - SERIES_EPOCH_MONTH) + 1


def series_name(n):
    rng = random.Random(f"series:{n}")
    return f"Series {n}: The {rng.choice(SERIES_ADJ)} {rng.choice(SERIES_NOUN)}"


def current_series():
    """The pack series is a limited monthly run — every pack ripped this
    calendar month belongs to the same series; it changes at the 1st."""
    now = game.now()
    n = series_index(now.year, now.month)
    if now.month == 12:
        next_month = now.replace(year=now.year + 1, month=1, day=1)
    else:
        next_month = now.replace(month=now.month + 1, day=1)
    next_month = next_month.replace(hour=0, minute=0, second=0, microsecond=0)
    days_left = max(1, (next_month.date() - now.date()).days)
    return {"n": n, "name": series_name(n), "expires": next_month.date().isoformat(), "days_left": days_left}


def rip_pack():
    """Consume a pack item if carried, else pay gold. Returns three fresh horrors
    from this calendar month's series — a limited run that rotates monthly."""
    c = game.get_char()
    if db.inv_remove("monster_pack"):
        paid = "a Monster Pack"
    else:
        if c["gold"] < PACK_COST:
            raise ValueError(f"A pack costs {PACK_COST} gold (or find a Monster Pack out in the world).")
        c["gold"] -= PACK_COST
        game.save_char(c)
        paid = f"{PACK_COST} gold"
    cs = current_series()
    series = cs["name"]
    rng = random.Random()
    mons = [_gen(rng, series) for _ in range(PACK_SIZE)]
    best = max(mons, key=lambda m: [r for r, _ in RARITIES].index(m["rarity"]))
    db.log_event(game.now_iso(), "menagerie",
                 f"Ripped {series} ({paid}): {', '.join(m['name'] for m in mons)}. Best pull: {best['name']} ({best['rarity']}).")
    return {"series": series, "series_days_left": cs["days_left"], "monsters": mons}


def set_hat(mid, hat_id):
    """Crown a monster (hat_id None removes it; the hat returns to the box)."""
    row = db.q("SELECT * FROM monsters WHERE id=?", (mid,)).fetchone()
    if not row:
        raise ValueError("No such creature in the pen.")
    old = row["hat"]
    if hat_id:
        from . import items
        it = items.ITEMS.get(hat_id)
        if not it or it["type"] != "hat":
            raise ValueError("That does not go on a head.")
        if not db.inv_remove(hat_id):
            raise ValueError("You do not own that hat.")
    if old:
        db.inv_add(old)
    db.q("UPDATE monsters SET hat=? WHERE id=?", (hat_id, mid))
    db.commit()
    return {"ok": True}


def set_free(mid):
    row = db.q("SELECT * FROM monsters WHERE id=?", (mid,)).fetchone()
    if not row:
        raise ValueError("No such creature in the pen.")
    if row["hat"]:
        db.inv_add(row["hat"])  # the hat stays; the memories go
    if db.kv_get("buddy_id") == mid:
        db.kv_del("buddy_id")
    db.q("DELETE FROM monsters WHERE id=?", (mid,))
    db.commit()
    db.log_event(game.now_iso(), "menagerie",
                 f"{row['name']} ({row['rarity']}) was set free. It looked back once, then was gone.")
    return {"ok": True, "name": row["name"]}


def get_buddy():
    bid = db.kv_get("buddy_id")
    if not bid:
        return None
    row = db.q("SELECT * FROM monsters WHERE id=?", (bid,)).fetchone()
    if not row:
        db.kv_del("buddy_id")
        return None
    return dict(row)


def toggle_buddy(mid):
    row = db.q("SELECT * FROM monsters WHERE id=?", (mid,)).fetchone()
    if not row:
        raise ValueError("No such creature in the pen.")
    if db.kv_get("buddy_id") == mid:
        db.kv_del("buddy_id")
        db.log_event(game.now_iso(), "menagerie",
                     f"{row['name']} is no longer your buddy. It pretends not to mind.")
        return {"ok": True, "buddy": None}
    db.kv_set("buddy_id", mid)
    db.log_event(game.now_iso(), "menagerie",
                 f"{row['name']} is now your buddy. It follows you everywhere, approximately.")
    return {"ok": True, "buddy": dict(row)}


def capture(species, floor, boss=False):
    """A subdued Undercroft dweller joins the menagerie."""
    rng = random.Random()
    rarity = "rare" if boss else None
    m = _gen(rng, f"subdued: {species}, floor {floor}", rarity=rarity)
    db.log_event(game.now_iso(), "menagerie",
                 f"The {species} yielded on floor {floor} — '{m['name']}' ({m['rarity']}, {m['personality']}) joins the ranch.")
    return m


BOSS_PERSONALITIES = [
    "radiates ancient malice", "still dreams of the siege", "eyes you, always",
    "hungers, patiently", "smells faintly of Mondays", "unbowed, merely resting",
    "plots a rematch", "too proud to be a pet, and knows it",
]


def capture_boss(name, epithet, dna, source):
    """A fallen siege beast that YIELDS instead of dying — kept in the pen as a
    genuinely creepy legendary creature (boss=1 → the meaner sprite generator)."""
    rng = random.Random(f"bosscap:{dna}")
    personality = rng.choice(BOSS_PERSONALITIES)
    cur = db.q(
        "INSERT INTO monsters (name, dna, rarity, personality, born, source, hat, boss) "
        "VALUES (?,?,?,?,?,?,NULL,1)",
        (name, dna, "legendary", personality, game.now_iso(), source),
    )
    db.commit()
    return {"id": cur.lastrowid, "name": name, "dna": dna, "rarity": "legendary",
            "personality": personality, "epithet": epithet, "boss": 1, "hat": None,
            "born": game.now_iso(), "source": source}

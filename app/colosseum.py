"""The Colosseum: quick games of chance starring your buddy monster.

Three spectacles — a duel, a race, a pageant — each a short auto-resolved
contest against a handful of freshly-summoned rivals. You bet gold on a
contestant; the field is simulated server-side (a few rounds of combat, a
short race, a panel of judges) and the frontend just dramatizes whatever
actually happened. Nothing here is permanent: no injuries, no XP, no items —
just gold changing hands and a line in the Chronicle.
"""
import random

from . import db, game
from . import monsters as menagerie

RARITY_WEIGHT = {"common": 1.0, "uncommon": 1.5, "rare": 2.2, "legendary": 3.5}
FIELD_SIZE = {"fight": 2, "race": 4, "pageant": 4}
LABELS = {"fight": "The Duel", "race": "The Race", "pageant": "The Pageant"}
MIN_BET, MAX_BET = 5, 500


def _field(kind, buddy):
    rng = random.Random()
    n = FIELD_SIZE[kind]
    contestants = [{
        "name": buddy["name"], "dna": buddy["dna"], "rarity": buddy["rarity"],
        "personality": buddy["personality"], "hat": buddy.get("hat"), "is_buddy": True,
    }]
    for _ in range(n - 1):
        o = menagerie.preview(rng, f"colosseum:{kind}")
        contestants.append({**o, "is_buddy": False})
    return contestants, rng


def _odds(contestants, rng):
    """Anyone can win. Rarity tilts the field only faintly (dampened by the
    0.35 exponent), so this stays a genuine game of chance — and the posted
    odds are derived from those same flattened chances (with a small house
    margin), so there is no always-bet-the-longshot exploit either."""
    weights = [RARITY_WEIGHT[c["rarity"]] ** 0.35 * rng.uniform(0.9, 1.1) for c in contestants]
    total = sum(weights)
    probs = [w / total for w in weights]
    odds = [max(1.2, round(0.95 / p, 2)) for p in probs]
    return probs, odds


def _sim_fight(contestants, probs, rng):
    # tiny dampened rarity edge + wide day-of-the-match form swing + wild
    # damage rolls: worst-case matchup is ~59/41, tuned by simulation —
    # a slight favorite, never a lock. Touch these numbers together or the
    # fight quietly becomes deterministic again (int truncation compounds).
    form = [rng.uniform(0.7, 1.35) for _ in contestants]
    hp = [25, 25]
    max_hp = hp[:]
    atk = [3.5 + RARITY_WEIGHT[c["rarity"]] ** 0.35 for c in contestants]
    rounds = []
    turn = rng.randrange(2)
    for _ in range(8):
        if hp[0] <= 0 or hp[1] <= 0:
            break
        attacker, defender = turn, 1 - turn
        dmg = max(1, int(atk[attacker] * form[attacker] + rng.randint(-3, 5)))
        crit = rng.random() < 0.12
        if crit:
            dmg = int(dmg * 1.6)
        hp[defender] = max(0, hp[defender] - dmg)
        rounds.append({"attacker": attacker, "damage": dmg, "crit": crit, "hp": hp[:]})
        turn = defender
    if hp[0] <= 0 and hp[1] <= 0:
        winner = rng.randrange(2)
    elif hp[0] <= 0:
        winner = 1
    elif hp[1] <= 0:
        winner = 0
    else:
        winner = 0 if hp[0] >= hp[1] else 1
    return {"rounds": rounds, "max_hp": max_hp, "winner": winner}


def _sim_race(contestants, probs, rng):
    n = len(contestants)
    # form on the day matters more than pedigree
    speed = [1.0 + probs[i] * 0.9 + rng.uniform(0, 0.5) for i in range(n)]
    pos = [0.0] * n
    ticks = []
    for _ in range(22):
        for i in range(n):
            pos[i] += speed[i] * rng.uniform(0.45, 1.55)
        ticks.append(pos[:])
    order = sorted(range(n), key=lambda i: -pos[i])
    return {"ticks": ticks, "winner": order[0], "order": order}


def _sim_pageant(contestants, probs, rng):
    n = len(contestants)
    # the judges are fickle; pedigree buys only a few points
    scores = []
    for i in range(n):
        base = 55 + probs[i] * 40
        scores.append(round(max(10, min(99, base + rng.uniform(-22, 22))), 1))
    order = sorted(range(n), key=lambda i: -scores[i])
    return {"scores": scores, "winner": order[0], "order": order}


def _key(kind):
    return f"colosseum:{kind}"


def preview_field(kind):
    if kind not in FIELD_SIZE:
        raise ValueError("No such spectacle.")
    buddy = menagerie.get_buddy()
    if not buddy:
        return {"kind": kind, "needs_buddy": True}
    cached = db.kv_get(_key(kind))
    if not cached:
        contestants, rng = _field(kind, buddy)
        probs, odds = _odds(contestants, rng)
        cached = {"contestants": contestants, "probs": probs, "odds": odds}
        db.kv_set(_key(kind), cached)
    return {"kind": kind, "needs_buddy": False, "contestants": cached["contestants"],
            "odds": cached["odds"], "min_bet": MIN_BET, "max_bet": MAX_BET,
            "gold": game.get_char()["gold"]}


def enter(kind, contestant_idx, wager):
    if kind not in FIELD_SIZE:
        raise ValueError("No such spectacle.")
    try:
        wager = int(wager)
    except (TypeError, ValueError):
        raise ValueError("That is not a wager.")
    if wager < MIN_BET or wager > MAX_BET:
        raise ValueError(f"Wagers run {MIN_BET}-{MAX_BET} gold.")
    cached = db.kv_get(_key(kind))
    if not cached:
        raise ValueError("The field has scattered — take another look before betting.")
    contestants, probs, odds = cached["contestants"], cached["probs"], cached["odds"]
    if not (0 <= contestant_idx < len(contestants)):
        raise ValueError("No such contestant.")
    c = game.get_char()
    if c["gold"] < wager:
        raise ValueError("You don't have that much gold to wager.")

    rng = random.Random()
    if kind == "fight":
        result = _sim_fight(contestants, probs, rng)
    elif kind == "race":
        result = _sim_race(contestants, probs, rng)
    else:
        result = _sim_pageant(contestants, probs, rng)

    winner_idx = result["winner"]
    won = winner_idx == contestant_idx
    c["gold"] -= wager
    payout = int(round(wager * odds[contestant_idx])) if won else 0
    if won:
        c["gold"] += payout
    game.save_char(c)
    db.kv_del(_key(kind))  # the field disperses; a fresh one awaits next visit

    picked_name = contestants[contestant_idx]["name"]
    winner_name = contestants[winner_idx]["name"]
    if won:
        note = f"{LABELS[kind]}: backed {picked_name} for {wager}g — victory! +{payout}g."
    else:
        note = f"{LABELS[kind]}: backed {picked_name} for {wager}g — {winner_name} took it instead. Gold gone."
    db.log_event(game.now_iso(), "colosseum", note)

    return {
        "kind": kind, "contestants": contestants, "odds": odds,
        "picked": contestant_idx, "winner": winner_idx, "won": won,
        "wager": wager, "payout": payout, "character": c, **result,
    }

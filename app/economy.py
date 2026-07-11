"""Economy: the shop and the Krankwerk gacha. Split out of game.py in the
pre-1.0 refactor. May import game (shared core) and db; never the reverse."""
import random

from . import db, items
from .game import get_char, now_iso, save_char

def buy(item_id):
    it = items.get(item_id)
    if not it or it.get("price") is None:
        raise ValueError("Pip does not stock that.")
    c = get_char()
    if c["gold"] < it["price"]:
        raise ValueError("Not enough gold. Pip is sympathetic but firm.")
    c["gold"] -= it["price"]
    save_char(c)
    db.inv_add(item_id)
    db.log_event(now_iso(), "shop", f"Bought {it['name']} for {it['price']} gold.")
    return it


def crank(use_token):
    c = get_char()
    if use_token:
        if c["tokens"] < 1:
            raise ValueError("No brass tokens. Quests sometimes pay in them.")
        c["tokens"] -= 1
    else:
        if c["gold"] < items.GACHA_COST_GOLD:
            raise ValueError(f"The Krankwerk wants {items.GACHA_COST_GOLD} gold or a brass token.")
        c["gold"] -= items.GACHA_COST_GOLD
    save_char(c)
    item_id = items.gacha_roll(random.Random())
    db.inv_add(item_id)
    it = items.get(item_id)
    db.log_event(now_iso(), "gacha", f"The Krankwerk dispensed: {it['name']} ({it['rarity']}).")
    return it



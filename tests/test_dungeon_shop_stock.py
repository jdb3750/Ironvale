"""Regression tests for Pip's per-floor shop stock.

Run: .venv/bin/python tests/test_dungeon_shop_stock.py
"""
import os
import shutil
import sys
import tempfile

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-dungeon-shop-")
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, dungeon, game  # noqa: E402

PASS = 0


def ok(label, condition, detail=""):
    global PASS
    assert condition, f"DUNGEON SHOP FAIL: {label} {detail}"
    PASS += 1
    print(f"  ok  {label}")


def merchant_run(stock):
    return {
        "floor": 1,
        "gear": {"weapon": None, "armor": None, "charm": None},
        "items": {}, "trinkets": [], "buff_atk": 0, "buff_def": 0,
        "loot_gold": 0, "combat": None, "seed": 123, "log": [],
        "hp": dungeon.base_stats()["max_hp"],
        "cells": {
            "0,0": {"type": "entrance", "seen": True, "cleared": True},
            "1,0": {"type": "merchant", "seen": True, "cleared": False},
        },
        "px": 0, "py": 0, "boss_floor": False,
        "shop_stock": stock, "relic": None,
    }


game.get_char()

# Given: Pip's stock was bought out and the empty list was persisted.
db.kv_set("dungeon", merchant_run([]))
# When: the adventurer returns to Pip's merchant cell.
sold_out = dungeon.action({"action": "move", "dir": "e"})["state"]
# Then: the floor stays sold out instead of generating fresh goods.
ok("sold-out Pip stock remains sold out", sold_out["shop_stock"] == [], sold_out["shop_stock"])

# Given: a newly generated floor has never initialized Pip's stock.
db.kv_set("dungeon", merchant_run(None))
# When: the adventurer reaches Pip for the first time.
new_shop = dungeon.action({"action": "move", "dir": "e"})["state"]
# Then: Pip receives the normal initial four-item stock.
ok("unvisited Pip stock initializes once", len(new_shop["shop_stock"] or []) == 4)

shutil.rmtree(SCRATCH, ignore_errors=True)
print(f"\nDUNGEON SHOP PASSED — {PASS} checks green")

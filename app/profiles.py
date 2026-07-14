"""Adventurer profiles: one save file per player, arcade-cabinet style.

The index lives in data/profiles.json. Each entry maps a slug to a DB file.
New profiles require a PIN of exactly four digits (hashed — this is a
keep-your-sibling-out lock, not bank security), while an adopted legacy main
profile can remain PINless. The pre-profiles save (ironvale.db) is adopted as
the first profile automatically.
"""
import hashlib
import json
import os
import re
import threading

from . import db

INDEX = os.path.join(db.DATA_DIR, "profiles.json")
_lock = threading.Lock()


def _hash_pin(pin):
    return hashlib.sha256(("ironvale-pin:" + str(pin)).encode()).hexdigest()


def _load():
    if os.path.exists(INDEX):
        with open(INDEX) as f:
            return json.load(f)
    return []


def _save(idx):
    with open(INDEX, "w") as f:
        json.dump(idx, f, indent=2)


def ensure_index():
    """Adopt a pre-profiles save as the first profile."""
    with _lock:
        idx = _load()
        if not idx:
            idx = [{"slug": "main", "name": "Adventurer", "file": "ironvale.db", "pin": None}]
            _save(idx)
        return idx


def all_profiles():
    return [{"slug": p["slug"], "name": p["name"], "has_pin": bool(p.get("pin"))}
            for p in ensure_index()]


def get(slug):
    for p in ensure_index():
        if p["slug"] == slug:
            return p
    return None


def path_for(slug):
    p = get(slug)
    return os.path.join(db.DATA_DIR, p["file"]) if p else None


def _validate_pin(pin):
    if not re.fullmatch(r"\d{4}", str(pin or "")):
        raise ValueError("The PIN must be exactly 4 digits.")
    return str(pin)


def set_pin(slug, pin):
    pin = _validate_pin(pin)
    with _lock:
        idx = _load()
        for p in idx:
            if p["slug"] == slug:
                p["pin"] = _hash_pin(pin)
                _save(idx)
                return {"ok": True}
    raise ValueError("No such adventurer on the roster.")


def create(name, pin=None):
    name = (name or "").strip()[:24]
    if not name:
        raise ValueError("Every adventurer needs a name.")
    pin = _validate_pin(pin)
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "adventurer"
    with _lock:
        idx = _load() or ensure_index()
        base = slug
        n = 2
        while any(p["slug"] == slug for p in idx):
            slug = f"{base}{n}"
            n += 1
        entry = {"slug": slug, "name": name, "file": f"{slug}.db",
                 "pin": _hash_pin(pin)}
        idx.append(entry)
        _save(idx)
    # christen the new save with the profile's name
    token = db.set_profile(os.path.join(db.DATA_DIR, entry["file"]))
    try:
        from . import game, monsters
        c = game.get_char()
        c["name"] = name
        game.save_char(c)
        monsters.ensure_starter()
    finally:
        db.reset_profile(token)
    return entry


def verify(slug, pin=None):
    p = get(slug)
    if not p:
        raise ValueError("No such adventurer on the roster.")
    if p.get("pin") and _hash_pin(pin or "") != p["pin"]:
        raise ValueError("Wrong PIN. The roster keeper squints at you.")
    return p

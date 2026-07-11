"""SQLite persistence layer. One small DB file per adventurer profile,
JSON columns for flexible game state. The active profile's DB path rides a
contextvar set by middleware (and by the background sync loop), so every
query below transparently hits the right save file."""
import contextvars
import json
import os
import sqlite3
import threading

DATA_DIR = os.environ.get(
    "DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "ironvale.db")

_local = threading.local()
_profile_path = contextvars.ContextVar("iv_profile_path", default=None)


def set_profile(path):
    """Point subsequent queries in this context at a profile's DB. Returns a reset token."""
    return _profile_path.set(path)


def reset_profile(token):
    _profile_path.reset(token)


def current_path():
    return _profile_path.get() or DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS kv (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giver TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    accepted_at TEXT NOT NULL,
    completed_at TEXT,
    honor INTEGER DEFAULT 0,
    activity_id TEXT,
    rewards TEXT
);
CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    start TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT,
    moving_time INTEGER,
    distance REAL,
    load REAL,
    avg_hr REAL
);
CREATE TABLE IF NOT EXISTS lift_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    exercise TEXT NOT NULL,
    weight REAL NOT NULL,
    reps INTEGER NOT NULL,
    quest_id INTEGER
);
CREATE TABLE IF NOT EXISTS inventory (
    item_id TEXT PRIMARY KEY,
    qty INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS equipment (
    slot TEXT PRIMARY KEY,
    item_id TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS monsters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    dna INTEGER NOT NULL,
    rarity TEXT NOT NULL,
    personality TEXT NOT NULL,
    born TEXT NOT NULL,
    source TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS wellness (
    date TEXT PRIMARY KEY,
    hrv REAL,
    resting_hr REAL,
    vo2max REAL,
    weight REAL,
    sleep_secs REAL,
    ctl REAL,
    atl REAL,
    readiness REAL
);
CREATE INDEX IF NOT EXISTS idx_quests_status_accepted ON quests(status, accepted_at);
CREATE INDEX IF NOT EXISTS idx_activities_type_start ON activities(type, start);
CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(start);
CREATE INDEX IF NOT EXISTS idx_lift_sets_ts ON lift_sets(ts);
CREATE INDEX IF NOT EXISTS idx_ledger_kind_ts ON ledger(kind, ts);
"""


def conn():
    path = current_path()
    if not hasattr(_local, "conns"):
        _local.conns = {}
    c = _local.conns.get(path)
    if c is None:
        c = sqlite3.connect(path)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA journal_mode=WAL")
        c.executescript(SCHEMA)
        for _col, _decl in (("hat", "TEXT"), ("boss", "INTEGER DEFAULT 0")):
            try:  # additive migrations for the monsters table
                c.execute(f"ALTER TABLE monsters ADD COLUMN {_col} {_decl}")
            except sqlite3.OperationalError:
                pass
        c.commit()
        _local.conns[path] = c
    return c


def q(sql, args=()):
    return conn().execute(sql, args)


def commit():
    conn().commit()


def kv_get(key, default=None):
    row = q("SELECT value FROM kv WHERE key=?", (key,)).fetchone()
    return json.loads(row["value"]) if row else default


def kv_set(key, value):
    q(
        "INSERT INTO kv (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        (key, json.dumps(value)),
    )
    commit()


def kv_del(key):
    q("DELETE FROM kv WHERE key=?", (key,))
    commit()


def inv_add(item_id, n=1):
    q(
        "INSERT INTO inventory (item_id, qty) VALUES (?, ?) "
        "ON CONFLICT(item_id) DO UPDATE SET qty=qty+?",
        (item_id, n, n),
    )
    commit()


def inv_remove(item_id, n=1):
    row = q("SELECT qty FROM inventory WHERE item_id=?", (item_id,)).fetchone()
    if not row or row["qty"] < n:
        return False
    if row["qty"] == n:
        q("DELETE FROM inventory WHERE item_id=?", (item_id,))
    else:
        q("UPDATE inventory SET qty=qty-? WHERE item_id=?", (n, item_id))
    commit()
    return True


def inv_all():
    return {
        r["item_id"]: r["qty"]
        for r in q("SELECT item_id, qty FROM inventory WHERE qty > 0").fetchall()
    }


def log_event(ts, kind, text):
    q("INSERT INTO ledger (ts, kind, text) VALUES (?, ?, ?)", (ts, kind, text))
    commit()

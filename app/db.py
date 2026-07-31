"""SQLite persistence layer. One small DB file per adventurer profile,
JSON columns for flexible game state. The active profile's DB path rides a
contextvar set by middleware (and by the background sync loop), so every
query below transparently hits the right save file."""
import contextvars
import json
import os
import sqlite3
import threading
from datetime import datetime, timezone

DATA_DIR = os.environ.get(
    "DATA_DIR", os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
)
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "ironvale.db")

_local = threading.local()
_profile_path = contextvars.ContextVar("iv_profile_path", default=None)
_migration_lock = threading.Lock()

# Collision invariant: the retired giver must vacate "strength" before
# Grunhilda claims it. Never derive or reorder this sequence.
GIVER_KEY_RENAMES = (
    ("strength", "bram"),
    ("kettlebell", "strength"),
    ("running", "endurance"),
    ("mobility", "recovery"),
)
GIVER_KEY_MIGRATION_MARKER = "migration:giver-keys-v1"


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
CREATE TABLE IF NOT EXISTS counsel_attributions (
    quest_id INTEGER PRIMARY KEY REFERENCES quests(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('counsel', 'self', 'schedule')),
    accepted_at TEXT NOT NULL,
    offered_option_keys TEXT NOT NULL,
    chosen_option_key TEXT NOT NULL,
    optional INTEGER
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


def _migration_is_current(connection):
    table = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='kv'",
    ).fetchone()
    if not table:
        return False
    return connection.execute(
        "SELECT 1 FROM kv WHERE key=?",
        (GIVER_KEY_MIGRATION_MARKER,),
    ).fetchone() is not None


def _rename_settings_givers(settings):
    if not isinstance(settings, dict):
        return settings
    renamed = dict(settings)
    for old, new in GIVER_KEY_RENAMES:
        old_key = f"program_{old}"
        new_key = f"program_{new}"
        if old_key not in renamed:
            continue
        if new_key in renamed:
            raise RuntimeError(
                f"Cannot migrate {old_key}: {new_key} already exists.",
            )
        renamed[new_key] = renamed.pop(old_key)
    return renamed


def _rename_list_givers(value):
    if not isinstance(value, list):
        return value
    replacements = dict(GIVER_KEY_RENAMES)
    renamed = []
    for item in value:
        if isinstance(item, dict) and item.get("giver") in replacements:
            item = {**item, "giver": replacements[item["giver"]]}
        renamed.append(item)
    return renamed


def _migrate_json_value(connection, key, transform):
    row = connection.execute(
        "SELECT value FROM kv WHERE key=?",
        (key,),
    ).fetchone()
    if row is None:
        return
    value = json.loads(row["value"])
    renamed = transform(value)
    if renamed != value:
        connection.execute(
            "UPDATE kv SET value=? WHERE key=?",
            (json.dumps(renamed), key),
        )


def _migrate_giver_keys(connection):
    if _migration_is_current(connection):
        return False

    replacements = dict(GIVER_KEY_RENAMES)
    try:
        connection.execute("BEGIN IMMEDIATE")
        for old, new in GIVER_KEY_RENAMES:
            source_count = connection.execute(
                "SELECT COUNT(*) AS count FROM quests WHERE giver=?",
                (old,),
            ).fetchone()["count"]
            target_count = connection.execute(
                "SELECT COUNT(*) AS count FROM quests WHERE giver=?",
                (new,),
            ).fetchone()["count"]
            if source_count and target_count:
                raise RuntimeError(
                    f"Cannot migrate giver {old!r}: target {new!r} already has quests.",
                )
            connection.execute(
                "UPDATE quests SET giver=? WHERE giver=?",
                (new, old),
            )

        for row in connection.execute(
            "SELECT id, details FROM quests",
        ).fetchall():
            details = json.loads(row["details"])
            if not isinstance(details, dict) or details.get("giver") not in replacements:
                continue
            details["giver"] = replacements[details["giver"]]
            connection.execute(
                "UPDATE quests SET details=? WHERE id=?",
                (json.dumps(details), row["id"]),
            )

        _migrate_json_value(connection, "settings", _rename_settings_givers)
        _migrate_json_value(connection, "routines", _rename_list_givers)
        _migrate_json_value(
            connection,
            "unguided_bonus_candidates",
            _rename_list_givers,
        )
        # Offer caches are derivative and embed legacy giver identities;
        # invalidation avoids serving payloads from the retired namespace.
        connection.execute(
            "DELETE FROM kv "
            "WHERE key LIKE 'offerbump:%' OR key LIKE 'offers:archetype-v2:%'",
        )
        connection.execute(
            "INSERT INTO kv (key, value) VALUES (?, 'true')",
            (GIVER_KEY_MIGRATION_MARKER,),
        )
        log_event(
            datetime.now(timezone.utc).isoformat(),
            "migration",
            "The ledger's quest-giver keys were renamed without changing their oaths.",
            connection,
        )
        connection.commit()
    except (json.JSONDecodeError, sqlite3.Error, RuntimeError):
        connection.rollback()
        raise
    return True


def conn():
    path = current_path()
    if not hasattr(_local, "conns"):
        _local.conns = {}
    c = _local.conns.get(path)
    if c is None:
        with _migration_lock:
            is_new = not os.path.exists(path)
            c = sqlite3.connect(path)
            c.row_factory = sqlite3.Row
            needs_giver_migration = not is_new and not _migration_is_current(c)
            if needs_giver_migration:
                from . import vault

                vault.ensure_snapshot_before_migration()
            try:
                c.execute("PRAGMA foreign_keys=ON")
                c.execute("PRAGMA journal_mode=WAL")
                c.executescript(SCHEMA)
                for _col, _decl in (("hat", "TEXT"), ("boss", "INTEGER DEFAULT 0")):
                    try:  # additive migrations for the monsters table
                        c.execute(f"ALTER TABLE monsters ADD COLUMN {_col} {_decl}")
                    except sqlite3.OperationalError:
                        pass
                try:
                    c.execute(
                        "ALTER TABLE counsel_attributions ADD COLUMN optional INTEGER"
                    )
                except sqlite3.OperationalError:
                    pass
                if is_new:
                    c.execute(
                        "INSERT INTO kv (key, value) VALUES (?, 'true')",
                        (GIVER_KEY_MIGRATION_MARKER,),
                    )
                    c.commit()
                else:
                    _migrate_giver_keys(c)
                _local.conns[path] = c
            except Exception:
                c.close()
                raise
    return c


def q(sql, args=()):
    return conn().execute(sql, args)


def commit():
    conn().commit()


def rollback() -> None:
    conn().rollback()


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


def log_event(ts, kind, text, connection=None):
    target = connection or conn()
    target.execute(
        "INSERT INTO ledger (ts, kind, text) VALUES (?, ?, ?)",
        (ts, kind, text),
    )
    if connection is None:
        target.commit()

import atexit
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-giver-key-migration-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, game  # noqa: E402


LEGACY_TO_CURRENT = {
    "running": "endurance",
    "kettlebell": "strength",
    "strength": "bram",
    "mobility": "recovery",
}
CHARTER = {"primary": "run", "secondary": ["climb", "strength"]}
FAILURES = []


def legacy_database(
    name,
    quest_counts=None,
    settings=None,
    routines=None,
    candidates=None,
    caches=False,
):
    path = os.path.join(SCRATCH, name)
    connection = sqlite3.connect(path)
    try:
        connection.executescript(db.SCHEMA)
        for giver, count in (quest_counts or {}).items():
            for index in range(count):
                details = json.dumps(
                    {
                        "giver": giver,
                        "focus": "strength",
                        "marker": f"{giver}-{index}",
                    },
                )
                connection.execute(
                    "INSERT INTO quests "
                    "(giver, kind, title, details, status, accepted_at, completed_at) "
                    "VALUES (?, 'legacy', ?, ?, 'done', ?, ?)",
                    (
                        giver,
                        f"{giver} history {index}",
                        details,
                        "2026-07-01T10:00:00+00:00",
                        "2026-07-01T11:00:00+00:00",
                    ),
                )
        if settings is not None:
            connection.execute(
                "INSERT INTO kv (key, value) VALUES ('settings', ?)",
                (json.dumps(settings),),
            )
        if routines is not None:
            connection.execute(
                "INSERT INTO kv (key, value) VALUES ('routines', ?)",
                (json.dumps(routines),),
            )
        if candidates is not None:
            connection.execute(
                "INSERT INTO kv (key, value) VALUES ('unguided_bonus_candidates', ?)",
                (json.dumps(candidates),),
            )
        if caches:
            for giver in LEGACY_TO_CURRENT:
                connection.execute(
                    "INSERT INTO kv (key, value) VALUES (?, ?)",
                    (f"offerbump:{giver}:2026-07-10", "2"),
                )
                connection.execute(
                    "INSERT INTO kv (key, value) VALUES (?, ?)",
                    (
                        f"offers:archetype-v2:{giver}:2026-07-10",
                        json.dumps([{"giver": giver}]),
                    ),
                )
        connection.commit()
    finally:
        connection.close()
    return path


def quest_counts(connection):
    return {
        row["giver"]: row["count"]
        for row in connection.execute(
            "SELECT giver, COUNT(*) AS count FROM quests GROUP BY giver ORDER BY giver",
        ).fetchall()
    }


collision_path = legacy_database(
    "collision.db",
    {"running": 2, "kettlebell": 3, "strength": 5, "mobility": 7},
    {
        "counsel_charter": CHARTER,
        "program_running": "road",
        "program_kettlebell": None,
        "program_strength": "old-bram",
        "program_mobility": "willow",
    },
    [
        {"id": "run", "giver": "running", "exercises": []},
        {"id": "iron", "giver": "kettlebell", "exercises": []},
        {"id": "bram", "giver": "strength", "exercises": []},
        {"id": "rest", "giver": "mobility", "exercises": []},
    ],
    [
        {"activity_id": giver, "giver": giver, "date": "2026-07-10"}
        for giver in LEGACY_TO_CURRENT
    ],
    caches=True,
)
bare_path = legacy_database(
    "bare.db",
    {"running": 1, "kettlebell": 2},
)
friend_path = legacy_database(
    "friend.db",
    {"running": 6, "kettlebell": 1, "strength": 1},
    {"ambition": 2},
)


def migrate(path):
    token = db.set_profile(path)
    try:
        return db.conn()
    finally:
        db.reset_profile(token)


def collision_and_namespace():
    connection = migrate(collision_path)
    assert quest_counts(connection) == {
        "bram": 5,
        "endurance": 2,
        "recovery": 7,
        "strength": 3,
    }

    rows = connection.execute(
        "SELECT giver, details FROM quests ORDER BY id",
    ).fetchall()
    assert all(json.loads(row["details"])["giver"] == row["giver"] for row in rows)
    assert all(json.loads(row["details"])["focus"] == "strength" for row in rows)

    settings = json.loads(
        connection.execute(
            "SELECT value FROM kv WHERE key='settings'",
        ).fetchone()["value"],
    )
    assert json.dumps(settings["counsel_charter"]) == json.dumps(CHARTER)
    assert settings["program_endurance"] == "road"
    assert "program_running" not in settings
    assert settings["program_strength"] is None
    assert "program_kettlebell" not in settings
    assert settings["program_bram"] == "old-bram"
    assert settings["program_recovery"] == "willow"

    routines = json.loads(
        connection.execute(
            "SELECT value FROM kv WHERE key='routines'",
        ).fetchone()["value"],
    )
    assert [routine["giver"] for routine in routines] == [
        "endurance",
        "strength",
        "bram",
        "recovery",
    ]
    candidates = json.loads(
        connection.execute(
            "SELECT value FROM kv WHERE key='unguided_bonus_candidates'",
        ).fetchone()["value"],
    )
    assert [candidate["giver"] for candidate in candidates] == [
        "endurance",
        "strength",
        "bram",
        "recovery",
    ]
    assert connection.execute(
        "SELECT COUNT(*) AS count FROM kv "
        "WHERE key LIKE 'offerbump:%' OR key LIKE 'offers:archetype-v2:%'",
    ).fetchone()["count"] == 0


def backup_precedes_mutation():
    backup_path = os.path.join(
        SCRATCH,
        "backups",
        datetime.now(timezone.utc).date().isoformat(),
        "giver-key-migration-v1",
        os.path.basename(collision_path),
    )
    backup = sqlite3.connect(f"file:{backup_path}?mode=ro", uri=True)
    backup.row_factory = sqlite3.Row
    try:
        assert quest_counts(backup) == {
            "kettlebell": 3,
            "mobility": 7,
            "running": 2,
            "strength": 5,
        }
    finally:
        backup.close()


def idempotent_second_pass():
    connection = migrate(collision_path)
    before = connection.iterdump()
    before_sql = "\n".join(before)
    assert db._migrate_giver_keys(connection) is False
    after_sql = "\n".join(connection.iterdump())
    assert after_sql == before_sql
    assert connection.execute(
        "SELECT COUNT(*) AS count FROM ledger WHERE kind='migration'",
    ).fetchone()["count"] == 1


def every_profile_and_bare_settings():
    bare = migrate(bare_path)
    friend = migrate(friend_path)
    assert quest_counts(bare) == {"endurance": 1, "strength": 2}
    assert bare.execute(
        "SELECT value FROM kv WHERE key='settings'",
    ).fetchone() is None
    assert quest_counts(friend) == {"bram": 1, "endurance": 6, "strength": 1}
    assert json.loads(
        friend.execute(
            "SELECT value FROM kv WHERE key='settings'",
        ).fetchone()["value"],
    ) == {"ambition": 2}


def migrated_history_resolves_identity():
    connection = migrate(collision_path)
    row = connection.execute(
        "SELECT giver FROM quests WHERE title='strength history 0'",
    ).fetchone()
    assert row["giver"] == "bram"
    assert game.GIVERS[row["giver"]]["name"] == "Ser Bram"
    assert game.GIVERS[row["giver"]]["title"] == "the Old Knight at Rest"


def fresh_database_starts_current():
    fresh_path = os.path.join(SCRATCH, "fresh.db")
    connection = migrate(fresh_path)
    assert tuple(game.GIVERS) == (
        "endurance",
        "strength",
        "bram",
        "recovery",
    )
    assert connection.execute(
        "SELECT COUNT(*) AS count FROM ledger WHERE kind='migration'",
    ).fetchone()["count"] == 0
    assert connection.execute(
        "SELECT value FROM kv WHERE key=?",
        (db.GIVER_KEY_MIGRATION_MARKER,),
    ).fetchone() is not None


SCENARIOS = (
    ("collision and focus namespace", collision_and_namespace),
    ("backup precedes mutation", backup_precedes_mutation),
    ("idempotent second pass", idempotent_second_pass),
    ("every profile including bare settings", every_profile_and_bare_settings),
    ("migrated history resolves identity", migrated_history_resolves_identity),
    ("fresh database starts current", fresh_database_starts_current),
)

for label, scenario in SCENARIOS:
    try:
        scenario()
        print(f"  ok  {label}")
    except Exception as error:  # noqa: BLE001 - collect every independent scenario
        FAILURES.append(f"{label}: {error!r}")
        print(f" FAIL {label}: {error!r}")

if FAILURES:
    raise AssertionError("\n".join(FAILURES))

print("\nGIVER KEY MIGRATION PASSED")

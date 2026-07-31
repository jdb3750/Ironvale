import atexit
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone

from fastapi.testclient import TestClient


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-attribution-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import counsel, db, game, profiles, quests  # noqa: E402
from app.main import app  # noqa: E402


ACCEPTED_AT = "2026-07-24T09:30:00+00:00"
NOW = datetime(2026, 7, 24, 9, 30, tzinfo=timezone.utc)
quests.now = lambda: NOW
quests.now_iso = lambda: ACCEPTED_AT
quests.today = lambda: NOW.date().isoformat()


def ok(label, condition):
    assert condition, f"COUNSEL ATTRIBUTION FAIL: {label}"
    print(f"  ok  {label}")


def emit(label, payload):
    print(f"{label} {json.dumps(payload, separators=(',', ':'), sort_keys=True)}")


def reset_profile(name):
    db.set_profile(os.path.join(SCRATCH, f"{name}.db"))
    db.kv_set("settings", {"timezone": "UTC", "ambition": 2})


def attribution_count(quest_id):
    table_exists = db.q("SELECT 1 FROM sqlite_master "
                        "WHERE type='table' AND name='counsel_attributions'").fetchone()
    if not table_exists:
        return 0
    return db.q("SELECT COUNT(*) AS n FROM counsel_attributions WHERE quest_id=?",
                (quest_id,)).fetchone()["n"]


def fresh_offer():
    candidate = quests.build_endurance_candidates(
        "run", quests.CandidateHistory(3, 40.0, 50.0), 1.0,
    )[0]
    return {**candidate.payload, "offer_id": 0}


def row_count(table):
    return db.q(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]


def mode_snapshot_acceptance_is_immutable():
    # Given: a real HTTP acceptance starts in considered mode. When: the
    # persisted setting flips to self immediately after the first mode read.
    # Then: the quest payload and immutable attribution still agree on counsel.
    client = TestClient(app)
    profiles.ensure_index()
    created = client.post(
        "/api/profiles",
        json={"name": "mode-snapshot-race", "pin": "1234"},
    )
    ok("mode snapshot creates a scratch profile", created.status_code == 200)
    slug = created.json()["slug"]
    path = profiles.path_for(slug)
    ok("mode snapshot resolves its profile path", path is not None)
    assert path is not None
    settings = client.post(
        "/api/settings",
        json={"timezone": "UTC", "counsel_mode": "considered"},
    )
    ok("mode snapshot starts in considered mode", settings.status_code == 200)
    offers = client.get("/api/offers/endurance")
    ok("mode snapshot reads current offers", offers.status_code == 200)
    selected = offers.json()["offers"][0]

    original_assemble = counsel.counsel_context.assemble
    mode_reads = []

    def changing_context():
        context = original_assemble()
        mode_reads.append(context.counsel_mode)
        if len(mode_reads) == 1:
            changed = game.get_settings()
            changed["counsel_mode"] = "self"
            db.kv_set("settings", changed)
        return context

    counsel.counsel_context.assemble = changing_context
    try:
        accepted = client.post(
            "/api/quests/accept",
            json={"giver": "endurance", "option_key": selected["option_key"]},
        )
    finally:
        counsel.counsel_context.assemble = original_assemble
    ok("mode snapshot accepts the current option", accepted.status_code == 200)
    payload = accepted.json()

    token = db.set_profile(path)
    try:
        quest = db.q("SELECT details FROM quests WHERE id=?", (payload["quest_id"],)).fetchone()
        details = json.loads(quest["details"])
        record = counsel.get_attribution(payload["quest_id"])
        saved_mode = game.get_settings()["counsel_mode"]
    finally:
        db.reset_profile(token)
    emit("MODE SNAPSHOT", {
        "quest_id": payload["quest_id"],
        "mode_reads": mode_reads,
        "quest_mode": details["counsel_mode"],
        "attribution_mode": record.mode if record else None,
        "saved_mode": saved_mode,
    })
    ok("mode snapshot reads mode exactly once", mode_reads == ["considered"])
    ok(
        "mode snapshot keeps quest and attribution on counsel",
        details["counsel_mode"] == "considered"
        and record is not None
        and record.mode == "counsel"
        and record.offered_option_keys == (selected["option_key"],)
        and record.chosen_option_key == selected["option_key"],
    )
    ok("mode snapshot preserves the later self setting", saved_mode == "self")


# Given: the existing offer-acceptance path with no counsel metadata.
# When: a player accepts the offer. Then: its quest payload and reward fields
# remain unchanged and the historical path has no attribution.
reset_profile("legacy")
legacy_offer = quests.get_offers("endurance")[0]
legacy_quest_id = quests.accept_offer("endurance", legacy_offer["offer_id"])
legacy_row = db.q("SELECT * FROM quests WHERE id=?", (legacy_quest_id,)).fetchone()
legacy_details = json.loads(legacy_row["details"])
legacy_rewards = {key: legacy_details[key] for key in ("xp", "gold", "vigor")}
ok("legacy accept creates one active quest and ledger event",
   legacy_row["status"] == "active" and row_count("ledger") == 1)
ok("legacy accept preserves the selected offer payload", legacy_details == legacy_offer)
ok("legacy accept preserves offer rewards",
   legacy_rewards == {key: legacy_offer[key] for key in ("xp", "gold", "vigor")})
ok("legacy accept creates no attribution", attribution_count(legacy_quest_id) == 0)
emit("LEGACY QUEST", {
    "quest_id": legacy_quest_id, "giver": legacy_row["giver"],
    "kind": legacy_row["kind"], "status": legacy_row["status"],
    "rewards": legacy_rewards, "attribution_count": attribution_count(legacy_quest_id),
})

print("COUNSEL ATTRIBUTION CHARACTERIZATION PASSED")


def schema_is_lean():
    # Given: a newly initialized profile. When: its schema is inspected. Then:
    # only the lean attribution table and its quest identity constraint exist.
    reset_profile("schema")
    tables = {row["name"] for row in db.q(
        "SELECT name FROM sqlite_master WHERE type='table' "
        "AND (name LIKE 'counsel_%' OR name LIKE 'council_%')").fetchall()}
    columns = {row["name"]: row for row in
               db.q("PRAGMA table_info(counsel_attributions)").fetchall()}
    foreign_keys = db.q("PRAGMA foreign_key_list(counsel_attributions)").fetchall()
    triggers = db.q("SELECT name FROM sqlite_master WHERE type='trigger' "
                    "AND sql LIKE '%counsel_attributions%'").fetchall()
    ok("schema adds only counsel_attributions", tables == {"counsel_attributions"})
    ok("attribution schema stores only lean fields",
       tuple(columns) == ("quest_id", "mode", "accepted_at",
                          "offered_option_keys", "chosen_option_key"))
    ok("quest identity is unique", columns["quest_id"]["pk"] == 1)
    ok("quest identity references quests",
       len(foreign_keys) == 1 and foreign_keys[0]["table"] == "quests"
       and foreign_keys[0]["from"] == "quest_id" and foreign_keys[0]["to"] == "id")
    ok("schema adds no attribution trigger", triggers == [])
    emit("LEAN SCHEMA", {
        "tables": sorted(tables), "columns": list(columns), "trigger_count": len(triggers),
    })


def valid_create_is_atomic():
    # Given: one selected offer and valid considered-mode attribution. When:
    # they are created together. Then: one commit links exactly one row of each.
    reset_profile("valid")
    offer = fresh_offer()
    attribution = counsel.validate_attribution("counsel",
                                               ["run:easy", "run:steady"], "run:steady")
    commit_calls = []
    original_commit = db.commit

    def counted_commit():
        commit_calls.append(True)
        original_commit()

    db.commit = counted_commit
    try:
        quest_id = quests.create_quest_from_offer("endurance", offer, attribution)
    finally:
        db.commit = original_commit

    raw = db.q("SELECT * FROM counsel_attributions WHERE quest_id=?",
               (quest_id,)).fetchone()
    record = counsel.get_attribution(quest_id)
    quest_row = db.q("SELECT accepted_at FROM quests WHERE id=?", (quest_id,)).fetchone()
    linked_quests = int(quest_row is not None)
    ok("valid create commits exactly once", len(commit_calls) == 1)
    ok("valid create links one quest and one attribution",
       linked_quests == 1 and attribution_count(quest_id) == 1)
    ok("valid create stores compact offered keys",
       raw["offered_option_keys"] == '["run:easy","run:steady"]')
    ok("valid create query returns the stored shape",
       record is not None and record.quest_id == quest_id and record.mode == "counsel"
       and record.accepted_at == ACCEPTED_AT
       and quest_row["accepted_at"] == record.accepted_at
       and record.offered_option_keys == ("run:easy", "run:steady")
       and record.chosen_option_key == "run:steady")
    emit("CREATED ATTRIBUTION", {
        "quest_id": quest_id, "linked_quest_rows": linked_quests,
        "mode": raw["mode"], "accepted_at": raw["accepted_at"],
        "offered_option_keys": json.loads(raw["offered_option_keys"]),
        "chosen_option_key": raw["chosen_option_key"],
    })


def malformed_inputs_leave_no_rows():
    # Given: malformed mode, offered-key, and chosen-key inputs. When: each is
    # validated for creation. Then: it is rejected with no committed rows.
    cases = (
        ("invalid-mode", "invalid", ["run:easy"], "run:easy"),
        ("empty-offered", "counsel", [], "run:easy"),
        ("empty-key", "counsel", ["run:easy", ""], "run:easy"),
        ("non-string-key", "counsel", ["run:easy", json.loads("7")], "run:easy"),
        ("duplicate-key", "counsel", ["run:easy", "run:easy"], "run:easy"),
        ("chosen-not-offered", "self", ["run:easy"], "run:steady"),
        ("empty-chosen", "self", ["run:easy"], ""),
    )
    for label, mode, offered_keys, chosen_key in cases:
        reset_profile(f"malformed-{label}")
        rejected = False
        try:
            attribution = counsel.Attribution(
                json.loads(json.dumps(mode)),
                tuple(offered_keys),
                chosen_key,
            )
            quests.create_quest_from_offer("endurance", fresh_offer(), attribution)
        except counsel.AttributionValidationError:
            rejected = True
        except sqlite3.DatabaseError:
            db.rollback()
            rejected = True
        quests_count = row_count("quests")
        attributions_count = row_count("counsel_attributions")
        ok(
            f"{label} rejects without committing",
            rejected and quests_count == 0 and attributions_count == 0,
        )
        emit("INVALID INPUT", {
            "case": label, "rejected": rejected,
            "quests": quests_count, "attributions": attributions_count,
        })


def duplicate_attribution_preserves_original():
    # Given: a committed quest attribution. When: the same quest identity is
    # attributed again. Then: uniqueness rejects it without changing the first.
    reset_profile("duplicate")
    original = counsel.validate_attribution(
        "self",
        ["run:easy", "run:steady"],
        "run:easy",
    )
    quest_id = quests.create_quest_from_offer("endurance", fresh_offer(), original)
    duplicate = counsel.validate_attribution(
        "counsel",
        ["run:steady"],
        "run:steady",
    )
    rejected = False
    try:
        counsel.insert_attribution(quest_id, ACCEPTED_AT, duplicate)
        db.commit()
    except sqlite3.IntegrityError:
        db.rollback()
        rejected = True
    stored = counsel.get_attribution(quest_id)
    ok(
        "duplicate attribution is rejected",
        rejected and row_count("quests") == 1 and row_count("counsel_attributions") == 1,
    )
    ok(
        "duplicate rejection preserves the original",
        stored is not None
        and stored.mode == "self"
        and stored.offered_option_keys == ("run:easy", "run:steady")
        and stored.chosen_option_key == "run:easy",
    )
    emit("DUPLICATE REJECTED", {
        "quest_id": quest_id, "rejected": rejected, "quests": row_count("quests"),
        "attributions": row_count("counsel_attributions"),
        "original_mode": stored.mode if stored else None,
    })


def malformed_stored_json_is_typed():
    # Given: a corrupt historical offered-key payload. When: it is queried.
    # Then: the persistence seam reports a typed data error, not raw JSON.
    reset_profile("corrupt-json")
    quest_id = quests.create_quest_from_offer("endurance", fresh_offer(), None)
    db.q(
        "INSERT INTO counsel_attributions "
        "(quest_id, mode, accepted_at, offered_option_keys, chosen_option_key) "
        "VALUES (?, 'counsel', ?, 'not-json', 'run:easy')",
        (quest_id, ACCEPTED_AT),
    )
    db.commit()
    rejected = False
    try:
        counsel.get_attribution(quest_id)
    except counsel.AttributionDataError:
        rejected = True
    ok("malformed stored JSON raises a typed data error", rejected)
    emit("MALFORMED STORED JSON", {"quest_id": quest_id, "typed_rejection": rejected})


def attribution_insert_failure_rolls_back_quest():
    # Given: an initialized scratch profile whose attribution adapter fails.
    # When: atomic creation inserts its quest first. Then: rollback removes it.
    reset_profile("insert-failure")
    db.q("DROP TABLE counsel_attributions")
    db.commit()
    attribution = counsel.validate_attribution(
        "counsel",
        ["run:easy"],
        "run:easy",
    )
    rejected = False
    try:
        quests.create_quest_from_offer("endurance", fresh_offer(), attribution)
    except sqlite3.OperationalError:
        rejected = True
    ok(
        "attribution insert failure rolls back its quest",
        rejected and row_count("quests") == 0 and row_count("ledger") == 0,
    )
    emit("INSERT FAILURE ROLLBACK", {
        "rejected": rejected, "quests": row_count("quests"),
        "attributions": attribution_count(1),
    })


SCENARIO_FAILURES = []


def run_scenario(label, scenario):
    try:
        scenario()
    except (AssertionError, AttributeError, sqlite3.DatabaseError) as exc:
        SCENARIO_FAILURES.append(f"{label}: {type(exc).__name__}: {exc}")
        print(f"  RED {label}: {type(exc).__name__}: {exc}")


run_scenario("lean schema", schema_is_lean)
run_scenario("valid atomic create", valid_create_is_atomic)
run_scenario("malformed input rollback", malformed_inputs_leave_no_rows)
run_scenario("duplicate attribution", duplicate_attribution_preserves_original)
run_scenario("defensive query", malformed_stored_json_is_typed)
run_scenario("insert rollback", attribution_insert_failure_rolls_back_quest)
run_scenario("mode snapshot", mode_snapshot_acceptance_is_immutable)

assert not SCENARIO_FAILURES, "\n".join(SCENARIO_FAILURES)
print("COUNSEL ATTRIBUTION PASSED")

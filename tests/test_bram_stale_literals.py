import json
from typing import Optional

from counsel_giver_test_support import (
    NOW,
    client,
    db,
    game,
    new_profile,
    seed_activity,
)

from app import programs, quests


def seed_legacy_bram_quest(status: str = "active") -> int:
    details = {
        "target_minutes": 30,
        "intensity": "easy",
        "structure": "Thirty minutes on the wall.",
        "xp": 40,
        "gold": 15,
        "vigor": 2,
    }
    completed_at = NOW.isoformat(timespec="seconds") if status == "done" else None
    cursor = db.q(
        "INSERT INTO quests "
        "(giver, kind, title, details, status, accepted_at, completed_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (
            "bram",
            "climb_technique",
            "An Old Oath of the Wall",
            json.dumps(details),
            status,
            NOW.isoformat(timespec="seconds"),
            completed_at,
        ),
    )
    db.commit()
    assert cursor.lastrowid is not None
    return cursor.lastrowid


def legacy_bram_quest_matches_climbing() -> None:
    # Given: a pre-modality Bram climb with no lift sets.
    new_profile("bram-climb-completion")
    quest_id = seed_legacy_bram_quest()
    seed_activity("Climbing", 0, 30)

    # When: his retired board evaluates the old oath.
    active = client.get("/api/offers/bram").json()["active"]

    # Then: wall time completes it; lift-set progress is irrelevant.
    assert active["id"] == quest_id
    assert active["completable"] is True
    assert quests.lift_progress(active) == 0


def legacy_bram_honor_activity_is_climbing() -> None:
    # Given: a legacy Bram climb with no synced witness.
    new_profile("bram-honor-type")
    quest_id = seed_legacy_bram_quest()

    # When: it is completed on honor.
    completed = client.post(f"/api/quests/{quest_id}/complete", json={"honor": True})

    # Then: the synthetic record is climbing, never weight training.
    assert completed.status_code == 200
    activity = db.q(
        "SELECT type FROM activities WHERE source='honor'"
    ).fetchone()
    assert activity["type"] == "Climbing"


def legacy_bram_climb_grants_endurance() -> None:
    # Given: an easy legacy climb and its initial character stats.
    new_profile("bram-climb-gain")
    quest_id = seed_legacy_bram_quest()
    before = game.get_char()["stats"].copy()

    # When: the old oath is completed on honor.
    completed = client.post(f"/api/quests/{quest_id}/complete", json={"honor": True})

    # Then: it follows Fenn's climbing discipline, not Grunhilda's strength gain.
    gains = completed.json()["rewards"]["stat_gains"]
    after = game.get_char()["stats"]
    assert gains == {"end": 1}
    assert after["end"] == before["end"] + 1
    assert after["str"] == before["str"]


def programs_route_queries_only_strength() -> None:
    # Given: an observable doctrine lookup boundary.
    new_profile("bram-program-query")
    calls = []
    original = programs.active_program

    def record_call(giver: str, current_date: Optional[str] = None) -> Optional[str]:
        calls.append(giver)
        return original(giver, current_date)

    programs.active_program = record_call
    try:
        # When: the doctrine payload is requested.
        response = client.get("/api/programs")
    finally:
        programs.active_program = original

    # Then: only the actual routine giver owns an active slot.
    assert response.status_code == 200
    assert response.json()["active"] == {"strength": None}
    assert calls == ["strength"]


def routine_without_giver_defaults_to_strength() -> None:
    # Given: a valid custom routine without an explicit giver.
    new_profile("routine-default-giver")

    # When: the routine is created through the live API.
    response = client.post(
        "/api/routines",
        json={
            "name": "Doorway Pulls",
            "exercises": [{"exercise": "Pull-Up", "sets": 3, "reps": 5}],
        },
    )

    # Then: it belongs to the giver who can actually offer routines.
    assert response.status_code == 200
    assert response.json()["routine"]["giver"] == "strength"


def unguided_climb_still_belongs_to_bram() -> None:
    # Given: an unsworn climb with no active quest.
    new_profile("bram-unguided-climb")
    seed_activity("RockClimbing", 0, 30)

    # When: unsworn deeds are gathered.
    quests.grant_unguided_run_bonus()
    climb = next(
        candidate
        for candidate in quests.unguided_pending()
        if candidate["category"] == "climb"
    )

    # Then: retired Bram still notices and credits it.
    assert quests.deed_giver("RockClimbing") == "bram"
    assert climb["giver"] == "bram"


def bram_identity_and_history_remain_registered() -> None:
    # Given: a completed quest stored forever under Bram's identity key.
    new_profile("bram-permanent-identity")
    quest_id = seed_legacy_bram_quest("done")

    # When: history and registry data are read.
    history = client.get("/api/quests/log").json()["quests"]
    stored = next(quest for quest in history if quest["id"] == quest_id)
    identity = game.GIVERS[stored["giver"]]

    # Then: his name, portrait key, and title still resolve.
    assert stored["giver"] == "bram"
    assert identity == {
        "name": "Ser Bram",
        "title": "the Old Knight at Rest",
        "sprite": "bram",
    }


SCENARIOS = (
    ("legacy climb completion", legacy_bram_quest_matches_climbing),
    ("honor activity type", legacy_bram_honor_activity_is_climbing),
    ("climb stat gain", legacy_bram_climb_grants_endurance),
    ("program query ownership", programs_route_queries_only_strength),
    ("routine default giver", routine_without_giver_defaults_to_strength),
    ("unguided climb credit", unguided_climb_still_belongs_to_bram),
    ("permanent identity", bram_identity_and_history_remain_registered),
)

failures = []
for label, scenario in SCENARIOS:
    try:
        scenario()
        print(f"  ok  {label}")
    except Exception as exc:
        failures.append(f"{label}: {exc}")
        print(f"  FAIL  {label}: {exc}")

if failures:
    raise AssertionError("\n".join(failures))

print("BRAM STALE LITERALS PASSED")

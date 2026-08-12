import json
import re
from pathlib import Path
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

ROOT = Path(__file__).resolve().parents[1]
GIVER_JS = (ROOT / "static" / "js" / "giver.js").read_text(encoding="utf-8")
TOWN_JS = (ROOT / "static" / "js" / "town.js").read_text(encoding="utf-8")

# Vocabulary that belongs to Grunhilda's weight room, not Bram's wall. His
# retirement (§0c) was from setting tasks, not from being a lifter — he was
# never one. A v0.30.1 sweep corrected seven such literals; these are the
# live pools that survived it.
LIFTING_WORDS = ("barbell", "deadlift", "load", "carry", "iron", "plates", "bell")


def _block(text: str, pattern: str) -> str:
    match = re.search(pattern, text, re.S)
    assert match is not None, f"pattern not found: {pattern}"
    return match.group(1)


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


def bram_greeting_pool_has_no_lifting_vocabulary() -> None:
    # Given: the pool Bram greets from when an old wall oath is still active.
    greetings = _block(GIVER_JS, r"const GREETINGS = \{(.*?)\n\};")
    bram_lines = _block(greetings, r"bram: \[(.*?)\]").lower()

    # Then: nothing in it talks about carrying, barbells or deadlifts.
    for word in LIFTING_WORDS:
        assert word not in bram_lines, f"greeting pool still says '{word}': {bram_lines!r}"


def bram_completion_reaction_has_no_lifting_vocabulary() -> None:
    # Given: what Bram says when a legacy climb quest is completed.
    reactions = _block(GIVER_JS, r"const REACTIONS = \{(.*?)\n\};")
    complete_block = _block(reactions, r"complete: \{(.*?)\n  \},\n  abandon:")
    bram_lines = _block(complete_block, r"bram: \[(.*?)\]").lower()

    # Then: the reward for finishing a wall oath isn't a barbell's approval.
    for word in LIFTING_WORDS:
        assert word not in bram_lines, f"completion pool still says '{word}': {bram_lines!r}"


def bram_unsworn_deed_bubble_credits_climbing_not_iron() -> None:
    # Given: the town bubble Bram raises when he credits an unsworn climb.
    bram_bubble = _block(TOWN_JS, r"bld-bram'.*?lines: \[(.*?)\]").lower()

    # Then: it speaks to ground or wall gained, not iron moved.
    assert "iron" not in bram_bubble, f"unsworn bubble still says 'iron': {bram_bubble!r}"


SCENARIOS = (
    ("legacy climb completion", legacy_bram_quest_matches_climbing),
    ("honor activity type", legacy_bram_honor_activity_is_climbing),
    ("climb stat gain", legacy_bram_climb_grants_endurance),
    ("program query ownership", programs_route_queries_only_strength),
    ("routine default giver", routine_without_giver_defaults_to_strength),
    ("unguided climb credit", unguided_climb_still_belongs_to_bram),
    ("permanent identity", bram_identity_and_history_remain_registered),
    ("greeting pool voice", bram_greeting_pool_has_no_lifting_vocabulary),
    ("completion reaction voice", bram_completion_reaction_has_no_lifting_vocabulary),
    ("unsworn bubble voice", bram_unsworn_deed_bubble_credits_climbing_not_iron),
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

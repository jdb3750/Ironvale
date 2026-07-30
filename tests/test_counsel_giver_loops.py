import json
from datetime import timedelta

from counsel_giver_test_support import (
    AcceptanceResponse,
    NOW,
    assert_active_continuation,
    assert_option_contract,
    assert_reroll_is_harmless,
    assert_single_iron_implement,
    client,
    counsel,
    db,
    game,
    new_profile,
    offers,
    row_count,
    seed_activity,
    seed_adverse_wellness,
    write_fresh_sync,
)


def considered_contract() -> None:
    # Given: identical fresh profiles. When: each giver is read repeatedly. Then:
    # one stable, disclosed, giver-owned option is returned.
    expected_modalities = {
        "endurance": {"run", "ride", "swim"},
        "strength": {None},
        "recovery": {None},
    }
    for giver in game.OFFERABLE_GIVERS:
        new_profile(f"considered-{giver}")
        write_fresh_sync()
        first = offers(giver)
        second = offers(giver)
        assert first == second and len(first) == 1
        assert_reroll_is_harmless(giver, first)
        assert_option_contract(first[0])
        assert first[0].giver == giver
        if giver in expected_modalities:
            assert first[0].modality in expected_modalities[giver]
        if giver == "strength":
            assert_single_iron_implement(first[0])
    new_profile("considered-repeat")
    write_fresh_sync()
    independent = offers("endurance")
    new_profile("considered-repeat")
    write_fresh_sync()
    assert offers("endurance") == independent


def self_tiers() -> None:
    # Given: Choose-your-own mode without a doctrine or writ. When: each board is
    # read. Then: the approved modality-specific alternatives remain ordered.
    expected = {
        "endurance": ("easy", "steady", "quality"),
        "strength": ("volume", "circuit", "strength"),
    }
    for giver, labels in expected.items():
        new_profile(f"self-{giver}", "self")
        write_fresh_sync()
        current = offers(giver)
        assert tuple(option.tier_label for option in current) == labels
        assert len({option.option_key for option in current}) == 3
        assert all(option.counsel_mode == "self" for option in current)
    iron = offers("strength")
    assert tuple(option.tier_cues for option in iron) == (
        ["lighter_load", "higher_reps"],
        ["brisk_transitions", "moderate_load"],
        ["heavy_load", "low_reps"],
    )
    new_profile("self-mobility", "self")
    write_fresh_sync()
    mobility = offers("recovery")
    assert len(mobility) == 3 and all(option.kind == "mobility" for option in mobility)


def fenn_modality_dispatch() -> None:
    # Given: all four of Fenn's activity-shaped roads are practiced and climbing
    # is most due. Then: his tiers come from the climb builder, not endurance.
    new_profile("self-fenn-climb", "self")
    write_fresh_sync()
    for activity_type, days_ago, minutes in (
        ("Run", 1, 35),
        ("Ride", 2, 60),
        ("Swim", 3, 30),
        ("Climbing", 9, 75),
    ):
        seed_activity(activity_type, days_ago, minutes)
    climbing = offers("endurance")
    assert {option.giver for option in climbing} == {"endurance"}
    assert {option.modality for option in climbing} == {"climb"}
    assert tuple(option.tier_label for option in climbing) == (
        "technique",
        "volume",
        "limit-session",
    )

    for modality, activity_type, minutes in (
        ("run", "Run", 35),
        ("ride", "Ride", 60),
        ("swim", "Swim", 30),
    ):
        new_profile(f"self-fenn-{modality}", "self")
        write_fresh_sync()
        seed_activity(activity_type, 4, minutes)
        current = offers("endurance")
        assert {option.modality for option in current} == {modality}
        assert tuple(option.tier_label for option in current) == (
            "easy",
            "steady",
            "quality",
        )


def seed_bram_quest(status: str = "active") -> int:
    accepted_at = (NOW - timedelta(hours=1)).isoformat(timespec="seconds")
    completed_at = NOW.isoformat(timespec="seconds") if status == "completed" else None
    details = {
        "modality": "climb",
        "target_minutes": 30,
        "intensity": "easy",
        "structure": "Thirty minutes on the wall.",
        "xp": 40,
        "gold": 15,
        "vigor": 2,
    }
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
            accepted_at,
            completed_at,
        ),
    )
    db.commit()
    assert cursor.lastrowid is not None
    return cursor.lastrowid


def bram_retirement_preserves_quests_and_history() -> None:
    # Bram's identity remains permanent, but his live roster endpoint is empty.
    new_profile("bram-retired")
    retired = client.get("/api/offers/bram")
    assert retired.status_code == 200
    assert retired.json() == {"offers": [], "active": None}
    refused = client.post(
        "/api/quests/accept",
        json={"giver": "bram", "option_key": "an-old-bram-offer"},
    )
    assert refused.status_code == 400
    assert "no longer sets quests" in refused.json()["error"].casefold()

    # A pre-existing oath still returns through Bram's endpoint and may complete.
    new_profile("bram-active-complete")
    quest_id = seed_bram_quest()
    seed_activity("Climbing", 0, 45)
    continued = client.get("/api/offers/bram")
    assert continued.status_code == 200
    assert continued.json()["offers"] == []
    assert continued.json()["active"]["id"] == quest_id
    assert continued.json()["active"]["completable"] is True
    completed = client.post(
        f"/api/quests/{quest_id}/complete",
        json={"honor": False},
    )
    assert completed.status_code == 200
    assert db.q("SELECT status FROM quests WHERE id=?", (quest_id,)).fetchone()["status"] == "done"
    assert client.get("/api/offers/bram").json() == {"offers": [], "active": None}

    # The same transition keeps abandonment available.
    new_profile("bram-active-abandon")
    abandoned_id = seed_bram_quest()
    active = client.get("/api/offers/bram").json()
    assert active["offers"] == [] and active["active"]["id"] == abandoned_id
    abandoned = client.post(f"/api/quests/{abandoned_id}/abandon")
    assert abandoned.status_code == 200
    assert db.q(
        "SELECT status FROM quests WHERE id=?",
        (abandoned_id,),
    ).fetchone()["status"] == "abandoned"

    # Completed rows keep resolving the permanent display registry.
    new_profile("bram-history")
    historical_id = seed_bram_quest("completed")
    history = client.get("/api/quests/log")
    assert history.status_code == 200
    stored = next(quest for quest in history.json()["quests"] if quest["id"] == historical_id)
    assert stored["giver"] == "bram"
    assert game.GIVERS[stored["giver"]]["name"] == "Ser Bram"
    assert game.GIVERS[stored["giver"]]["title"] == "the Old Knight at Rest"
    assert game.GIVER_ARCHETYPES[stored["giver"]]["archetype"] == "Retired"
    assert game.GIVER_ARCHETYPES[stored["giver"]]["modalities"] == ()


def elowen_and_doctrine_precedence() -> None:
    # Given: a Rest Writ or selected doctrine. When: either loop is read. Then:
    # the existing single progression/recovery path supersedes generic choices.
    new_profile("rest-writ")
    seed_adverse_wellness()
    considered = offers("recovery")
    assert len(considered) == 1 and considered[0].kind == "rest"
    assert client.post("/api/settings", json={"counsel_mode": "self"}).status_code == 200
    self_options = offers("recovery")
    assert len(self_options) == 1 and self_options[0].kind == "rest"
    assert self_options[0].option_key != considered[0].option_key
    new_profile("doctrine")
    write_fresh_sync()
    selected = client.post(
        "/api/programs/select",
        json={"giver": "strength", "key": "starting_strength"},
    )
    assert selected.status_code == 200
    for mode in ("considered", "self"):
        assert client.post("/api/settings", json={"counsel_mode": mode}).status_code == 200
        current = offers("strength")
        assert len(current) == 1 and current[0].program is True
        assert current[0].progression is not None
        assert current[0].progression.key == "starting_strength"


def cold_start_boundaries() -> None:
    # Given: one, two, or three runs and zero or one Iron sessions. When: self
    # options are built. Then: personalization begins only at the defined seam.
    for sessions in (1, 2, 3):
        new_profile(f"run-{sessions}", "self")
        write_fresh_sync()
        for days_ago in range(1, sessions + 1):
            seed_activity("Run", days_ago, 40 + days_ago)
        current = offers("endurance")
        expected = "personalized" if sessions == 3 else "generic_starter"
        assert all(option.sizing == expected for option in current)
        assert all(
            ("cold_start" in option.reason_codes) == (sessions < 3)
            for option in current
        )
    new_profile("iron-zero", "self")
    write_fresh_sync()
    generic = offers("strength")
    assert all(option.sizing == "generic_starter" for option in generic)
    assert all("no_iron_history" in option.reason_codes for option in generic)
    assert all(
        row.suggest_weight is None
        for option in generic
        for row in option.routine
    )
    new_profile("iron-one", "self")
    write_fresh_sync()
    db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
        (NOW.isoformat(timespec="seconds"), "Back Squat", 82.5, 5),
    )
    db.commit()
    personalized = offers("strength")
    assert all(option.sizing == "personalized" for option in personalized)
    assert all(
        any(
            row.exercise == "Back Squat" and row.suggest_weight == 82.5
            for row in option.routine
        )
        for option in personalized
    )


def wellness_modes() -> None:
    # Given: fresh versus missing wellness. When: each loop builds endurance.
    # Then: Considered suppresses hard work while self retains it with a warning.
    new_profile("fresh-considered")
    write_fresh_sync()
    assert offers("endurance")[0].intensity == "hard"
    new_profile("missing-considered")
    suppressed = offers("endurance")[0]
    assert suppressed.intensity != "hard"
    assert {"wellness_data_missing", "hard_option_suppressed"} <= set(
        suppressed.reason_codes,
    )
    new_profile("missing-self", "self")
    self_options = offers("endurance")
    hard = next(option for option in self_options if option.tier_label == "quality")
    assert hard.intensity == "hard" and hard.wellness_warning
    assert "hard_option_wellness_warning" in hard.reason_codes


def accept_security_and_attribution() -> None:
    # Given: server-issued identities. When: valid, stale, forged, and malformed
    # accepts are posted. Then: only current identities atomically write derived tags.
    new_profile("valid-counsel")
    write_fresh_sync()
    current = offers("endurance")
    chosen = current[0]
    before_accept = (
        row_count("quests"),
        row_count("counsel_attributions"),
        row_count("ledger"),
    )
    accepted = client.post(
        "/api/quests/accept",
        json={"giver": "endurance", "option_key": chosen.option_key},
    )
    assert accepted.status_code == 200
    accepted_payload = AcceptanceResponse.model_validate(accepted.json())
    record = counsel.get_attribution(accepted_payload.quest_id)
    assert record is not None
    assert record.mode == "counsel"
    assert record.offered_option_keys == tuple(option.option_key for option in current)
    assert record.chosen_option_key == chosen.option_key
    assert_active_continuation(chosen, record.quest_id)
    after_refusal = (
        row_count("quests"),
        row_count("counsel_attributions"),
        row_count("ledger"),
    )
    assert after_refusal == (
        before_accept[0] + 1,
        before_accept[1] + 1,
        before_accept[2] + 1,
    )
    new_profile("valid-self", "self")
    write_fresh_sync()
    self_options = offers("endurance")
    self_chosen = self_options[1]
    forged_tag = client.post(
        "/api/quests/accept",
        json={
            "giver": "endurance",
            "offer_id": self_chosen.offer_id,
            "mode": "schedule",
            "tag": "schedule",
        },
    )
    assert forged_tag.status_code == 200
    forged_payload = AcceptanceResponse.model_validate(forged_tag.json())
    self_record = counsel.get_attribution(forged_payload.quest_id)
    assert self_record is not None
    assert self_record.mode == "self"
    new_profile("stale")
    write_fresh_sync()
    stale_key = offers("endurance")[0].option_key
    assert client.post("/api/settings", json={"counsel_mode": "self"}).status_code == 200
    stale = client.post(
        "/api/quests/accept",
        json={"giver": "endurance", "option_key": stale_key},
    )
    assert stale.status_code == 400
    assert (row_count("quests"), row_count("counsel_attributions")) == (0, 0)
    assert row_count("ledger") == 1
    new_profile("malformed", "self")
    write_fresh_sync()
    valid_key = offers("endurance")[0].option_key
    malformed = (
        {"giver": "unknown", "option_key": valid_key},
        {"giver": "endurance"},
        {"giver": "endurance", "option_key": 7},
        {"giver": "endurance", "offer_id": "7"},
        {"giver": "endurance", "offer_id": True},
        {"giver": "endurance", "offer_id": 7},
        {"giver": "strength", "option_key": valid_key},
        {"giver": "endurance", "option_key": "forged"},
    )
    assert all(
        client.post("/api/quests/accept", json=payload).status_code == 400
        for payload in malformed
    )
    invalid_setting = client.post("/api/settings", json={"counsel_mode": {"bad": True}})
    assert invalid_setting.status_code == 400
    assert game.get_settings()["counsel_mode"] == "self"
    assert (row_count("quests"), row_count("counsel_attributions")) == (0, 0)
    assert row_count("ledger") == 1


failures: list[str] = []
for label, scenario in (
    ("considered contract", considered_contract),
    ("self tiers", self_tiers),
    ("Fenn dispatches each modality to its existing tiers", fenn_modality_dispatch),
    ("Bram retirement preserves quests and history", bram_retirement_preserves_quests_and_history),
    ("Elowen and doctrine precedence", elowen_and_doctrine_precedence),
    ("cold-start boundaries", cold_start_boundaries),
    ("wellness modes", wellness_modes),
    ("accept security and attribution", accept_security_and_attribution),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL GIVER LOOPS PASSED")

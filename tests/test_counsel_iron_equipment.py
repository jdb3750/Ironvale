from datetime import timedelta
from typing import Optional

from counsel_giver_test_support import (
    NOW,
    client,
    db,
    exercises,
    game,
    new_profile,
    offer_response,
    offers,
    write_fresh_sync,
)
from app import programs


def option_equipment(current) -> set[str]:
    return {
        exercises.EXERCISES[row.exercise]["equipment"]
        for option in current
        for row in option.routine
    }


def seed_recent_barbell() -> None:
    db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
        (NOW.isoformat(timespec="seconds"), "Back Squat", 82.5, 5),
    )
    db.commit()


def set_iron_today(equipment: Optional[str]) -> None:
    value = (
        {"date": NOW.date().isoformat(), "equipment": equipment}
        if equipment is not None
        else None
    )
    response = client.post("/api/settings", json={"counsel_iron_today": value})
    assert response.status_code == 200


def create_iron_routine(name: str, exercise_names: list[str]) -> str:
    response = client.post(
        "/api/routines",
        json={
            "name": name,
            "giver": "kettlebell",
            "exercises": [
                {"exercise": exercise, "sets": 3, "reps": 8}
                for exercise in exercise_names
            ],
        },
    )
    assert response.status_code == 200
    routine = response.json()["routine"]
    routine_id = routine["id"]
    selected = client.post(
        "/api/programs/select",
        json={"giver": "kettlebell", "key": f"custom:{routine_id}"},
    )
    assert selected.status_code == 200
    return routine_id


def override_restricts_generic_iron_in_both_modes() -> None:
    for mode in ("considered", "self"):
        # Given: the most recent Iron row is barbell, so current behavior offers barbell.
        new_profile(f"iron-equipment-{mode}", mode)
        write_fresh_sync()
        seed_recent_barbell()
        before_response = offer_response("kettlebell")
        before = before_response.offers
        assert tuple(before_response.modalities) == tuple(
            game.GIVER_ARCHETYPES["kettlebell"]["modalities"],
        )
        assert option_equipment(before) == {"barbell"}

        # When: the player says only kettlebells are available today.
        set_iron_today("kettlebell")
        after = offers("kettlebell")

        # Then: every offered tier uses kettlebells and explains the narrowing.
        assert option_equipment(after) == {"kettlebell"}
        assert all("equipment_today" in option.reason_codes for option in after)


def override_expires_after_the_profile_day() -> None:
    # Given: today's override changes the most-recent-barbell fallback.
    new_profile("iron-equipment-expiry", "self")
    write_fresh_sync()
    seed_recent_barbell()
    set_iron_today("kettlebell")
    assert option_equipment(offers("kettlebell")) == {"kettlebell"}

    # When: the profile clock rolls into tomorrow.
    original_now = game.now
    game.now = lambda: NOW + timedelta(days=1)
    try:
        expired = offers("kettlebell")
        normalized = game.get_settings()["counsel_iron_today"]
    finally:
        game.now = original_now

    # Then: the stored declaration is treated as absent without cleanup work.
    assert option_equipment(expired) == {"barbell"}
    assert normalized is None
    assert all("equipment_today" not in option.reason_codes for option in expired)


def malformed_and_unknown_equipment_are_rejected() -> None:
    # Given: a fresh profile. When: malformed or unknown declarations cross the API.
    new_profile("iron-equipment-invalid")
    malformed = client.post(
        "/api/settings",
        json={"counsel_iron_today": "kettlebell"},
    )
    unknown = client.post(
        "/api/settings",
        json={
            "counsel_iron_today": {
                "date": NOW.date().isoformat(),
                "equipment": "cable-machine",
            },
        },
    )

    # Then: neither declaration enters saved settings.
    assert malformed.status_code == 400
    assert unknown.status_code == 400
    assert game.get_settings()["counsel_iron_today"] is None


def malformed_persisted_equipment_degrades_to_absent() -> None:
    # Given: malformed persisted settings. When: the settings boundary normalizes them.
    new_profile("iron-equipment-persisted")
    settings = game.get_settings()
    settings["counsel_iron_today"] = {"date": NOW.date().isoformat()}
    db.kv_set("settings", settings)
    wrong_shape = game.get_settings()["counsel_iron_today"]

    settings["counsel_iron_today"] = {
        "date": NOW.date().isoformat(),
        "equipment": "cable-machine",
    }
    db.kv_set("settings", settings)
    unknown = game.get_settings()["counsel_iron_today"]

    # Then: untrusted old state cannot block the boot endpoint.
    assert wrong_shape is None
    assert unknown is None


def incompatible_doctrine_waits_without_advancing_in_both_modes() -> None:
    for mode in ("considered", "self"):
        # Given: the selected barbell doctrine is the current offer.
        new_profile(f"iron-doctrine-mismatch-{mode}", mode)
        write_fresh_sync()
        selected = client.post(
            "/api/programs/select",
            json={"giver": "kettlebell", "key": "starting_strength"},
        )
        assert selected.status_code == 200
        before = offers("kettlebell")
        assert len(before) == 1
        assert before[0].program is True
        assert before[0].progression is not None
        assert before[0].progression.key == "starting_strength"
        program_state = db.kv_get("program_state", {})

        # When: only a kettlebell is available today.
        set_iron_today("kettlebell")
        after = offers("kettlebell")

        # Then: generic kettlebell work replaces only today's offer.
        assert option_equipment(after) == {"kettlebell"}
        assert all(option.program is False for option in after)
        assert all("equipment_today" in option.reason_codes for option in after)
        assert all(
            "doctrine_equipment_mismatch" in option.reason_codes
            for option in after
        )
        assert programs.active_program("kettlebell") == "starting_strength"
        assert db.kv_get("program_state", {}) == program_state


def compatible_doctrine_remains_offered_in_both_modes() -> None:
    for mode in ("considered", "self"):
        # Given: a kettlebell doctrine is selected.
        new_profile(f"iron-doctrine-compatible-{mode}", mode)
        write_fresh_sync()
        selected = client.post(
            "/api/programs/select",
            json={"giver": "kettlebell", "key": "simple_sinister"},
        )
        assert selected.status_code == 200

        # When: today's available implement is also a kettlebell.
        set_iron_today("kettlebell")
        current = offers("kettlebell")

        # Then: the doctrine remains the one offer and carries the day's reason.
        assert len(current) == 1
        assert current[0].program is True
        assert current[0].progression is not None
        assert current[0].progression.key == "simple_sinister"
        assert option_equipment(current) == {"kettlebell"}
        assert "equipment_today" in current[0].reason_codes


def off_catalog_doctrine_survives_without_override() -> None:
    # Given: an accepted custom doctrine contains a movement outside the catalog.
    new_profile("iron-doctrine-off-catalog-none")
    write_fresh_sync()
    routine_id = create_iron_routine("Sandbag Day", ["Sandbag Carry"])

    # When: Grunhilda's board is opened without a same-day override.
    response = client.get("/api/offers/kettlebell")

    # Then: the legacy doctrine remains readable and offered exactly as written.
    assert response.status_code == 200
    current = offer_response("kettlebell").offers
    assert len(current) == 1
    assert current[0].program is True
    assert current[0].progression is not None
    assert current[0].progression.key == f"custom:{routine_id}"
    assert [row.exercise for row in current[0].routine] == ["Sandbag Carry"]


def off_catalog_doctrine_waits_with_override() -> None:
    # Given: an off-catalog custom doctrine is selected and has not advanced.
    new_profile("iron-doctrine-off-catalog-override")
    write_fresh_sync()
    routine_id = create_iron_routine("Sandbag Day", ["Sandbag Carry"])
    program_state = db.kv_get("program_state", {})

    # When: only kettlebells are declared for today.
    set_iron_today("kettlebell")
    response = client.get("/api/offers/kettlebell")

    # Then: the board stays available and serves generic kettlebell work instead.
    assert response.status_code == 200
    current = offer_response("kettlebell").offers
    assert option_equipment(current) == {"kettlebell"}
    assert all(option.program is False for option in current)
    assert all(
        "doctrine_equipment_mismatch" in option.reason_codes
        for option in current
    )
    assert programs.active_program("kettlebell") == f"custom:{routine_id}"
    assert db.kv_get("program_state", {}) == program_state


def bodyweight_does_not_block_matching_iron_doctrine() -> None:
    # Given: a custom doctrine mixes barbell work with an always-available body.
    new_profile("iron-doctrine-barbell-bodyweight")
    write_fresh_sync()
    routine_id = create_iron_routine(
        "Bar and Body",
        ["Back Squat", "Push-Up"],
    )

    # When: the player declares a barbell-only day.
    set_iron_today("barbell")
    current = offers("kettlebell")

    # Then: every movement is performable and the doctrine remains offered.
    assert len(current) == 1
    assert current[0].program is True
    assert current[0].progression is not None
    assert current[0].progression.key == f"custom:{routine_id}"
    assert {row.exercise for row in current[0].routine} == {
        "Back Squat",
        "Push-Up",
    }


def override_sizing_uses_only_matching_implement_history() -> None:
    # Given: the ledger has barbell history but no kettlebell history.
    new_profile("iron-equipment-truthful-sizing", "self")
    write_fresh_sync()
    seed_recent_barbell()
    before = offers("kettlebell")
    assert all(option.sizing == "personalized" for option in before)

    # When: the offered implement is narrowed to kettlebells.
    set_iron_today("kettlebell")
    after = offers("kettlebell")

    # Then: sizing, reasons, weights, and provenance all tell the same story.
    assert all(option.sizing == "generic_starter" for option in after)
    assert all("no_iron_history" in option.reason_codes for option in after)
    assert all(
        row.suggest_weight is None
        for option in after
        for row in option.routine
    )
    assert all(
        option.source.provider == "Iron Vale starter guidance"
        for option in after
    )


def no_override_preserves_current_behavior() -> None:
    # Given: the current most-recent-row behavior without an override.
    new_profile("iron-equipment-none", "self")
    write_fresh_sync()
    seed_recent_barbell()
    before = offers("kettlebell")
    assert option_equipment(before) == {"barbell"}
    assert all(option.sizing == "personalized" for option in before)

    # When: the optional declaration is explicitly clear.
    set_iron_today(None)
    after = offers("kettlebell")

    # Then: the complete observable offer set is unchanged.
    assert after == before
    assert [option.sizing for option in after] == [
        option.sizing for option in before
    ]
    assert all("equipment_today" not in option.reason_codes for option in after)


def live_override_keeps_one_request_clock() -> None:
    # Given: a live override and a clock that visibly advances on every read.
    new_profile("iron-equipment-one-clock")
    write_fresh_sync()
    set_iron_today("kettlebell")
    clock_reads = []
    instants = iter(NOW + timedelta(seconds=step) for step in range(10))
    original_now = game.now

    def ticking_now():
        instant = next(instants)
        clock_reads.append(instant)
        return instant

    # When: the public giver evaluation captures its qualified context.
    game.now = ticking_now
    try:
        current = offers("kettlebell")
    finally:
        game.now = original_now

    # Then: the override and every Council consumer share that one captured clock.
    assert current
    assert clock_reads == [NOW], clock_reads
    assert all("equipment_today" in option.reason_codes for option in current)


failures: list[str] = []
for label, scenario in (
    (
        "override restricts generic iron in both modes",
        override_restricts_generic_iron_in_both_modes,
    ),
    ("override expires after the profile day", override_expires_after_the_profile_day),
    (
        "malformed and unknown equipment are rejected",
        malformed_and_unknown_equipment_are_rejected,
    ),
    (
        "malformed persisted equipment degrades to absent",
        malformed_persisted_equipment_degrades_to_absent,
    ),
    (
        "incompatible doctrine waits without advancing in both modes",
        incompatible_doctrine_waits_without_advancing_in_both_modes,
    ),
    (
        "compatible doctrine remains offered in both modes",
        compatible_doctrine_remains_offered_in_both_modes,
    ),
    (
        "off-catalog doctrine survives without an override",
        off_catalog_doctrine_survives_without_override,
    ),
    (
        "off-catalog doctrine waits unchanged with an override",
        off_catalog_doctrine_waits_with_override,
    ),
    (
        "bodyweight remains compatible with matching iron",
        bodyweight_does_not_block_matching_iron_doctrine,
    ),
    (
        "override sizing uses matching implement history",
        override_sizing_uses_only_matching_implement_history,
    ),
    ("no override preserves current behavior", no_override_preserves_current_behavior),
    ("live override keeps one request clock", live_override_keeps_one_request_clock),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL IRON EQUIPMENT PASSED")

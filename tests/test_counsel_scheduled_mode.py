import json

from counsel_giver_test_support import (
    AcceptanceResponse,
    NOW,
    client,
    counsel,
    db,
    game,
    new_profile,
    offer_response,
    offers,
    seed_activity,
    seed_adverse_wellness,
    write_fresh_sync,
)

from app import programs


TODAY = "friday"


def weekly_plan(today_slots):
    return {
        day: list(today_slots) if day == TODAY else []
        for day in game.COUNSEL_SCHEDULE_DAYS
    }


def save_plan(today_slots, mode="scheduled", nudge=False):
    saved = client.post(
        "/api/settings",
        json={
            "counsel_mode": mode,
            "counsel_schedule": weekly_plan(today_slots),
            "counsel_nudge_enabled": nudge,
        },
    )
    assert saved.status_code == 200, saved.json()


def scheduled_sized_slot() -> None:
    # Given: a planned easy run. When: Fenn is visited. Then: only that tier appears.
    new_profile("scheduled-sized")
    write_fresh_sync()
    save_plan([{"modality": "run", "tier": "easy", "optional": False}])
    current = offers("endurance")
    assert len(current) == 1
    assert (current[0].modality, current[0].tier_label) == ("run", "easy")
    assert current[0].counsel_mode == "scheduled"


def scheduled_routine_slot() -> None:
    # Given: built-in and custom routines. When: their owners are visited. Then: each appears exactly.
    new_profile("scheduled-built-in")
    write_fresh_sync()
    save_plan([{"routine": "starting_strength", "optional": False}])
    built_in = offers("strength")
    assert len(built_in) == 1 and built_in[0].program
    assert built_in[0].progression is not None
    assert built_in[0].progression.key == "starting_strength"
    assert built_in[0].kind == "program:starting_strength"

    new_profile("scheduled-custom")
    write_fresh_sync()
    custom = programs.save_routine({
        "name": "Rings at Dawn",
        "giver": "strength",
        "exercises": [{"exercise": "Pull-Up", "sets": 4, "reps": 6}],
    })
    save_plan([{"routine": f"custom:{custom['id']}", "optional": False}])
    custom_offer = offers("strength")
    assert len(custom_offer) == 1 and custom_offer[0].program
    assert custom_offer[0].kind == f"program:custom:{custom['id']}"
    assert [(row.exercise, row.suggest_weight) for row in custom_offer[0].routine] == [
        ("Pull-Up", None),
    ]


def scheduled_open_slots() -> None:
    # Given: an open climbing slot. When: Fenn is visited. Then: Considered chooses its effort.
    new_profile("scheduled-open-climb")
    write_fresh_sync()
    seed_activity("Run", 1, 35)
    seed_activity("Climbing", 8, 70)
    save_plan([{"modality": "climb", "optional": False}])
    climbing = offers("endurance")
    assert len(climbing) == 1
    assert climbing[0].modality == "climb"
    assert climbing[0].tier_label == "limit-session"

    # Given: a fully open day. When: each giver is visited. Then: Considered selection is preserved.
    for giver in game.OFFERABLE_GIVERS:
        new_profile(f"scheduled-open-any-{giver}")
        write_fresh_sync()
        considered = offers(giver)
        save_plan([{"optional": False}])
        scheduled = offers(giver)
        assert len(scheduled) == len(considered) == 1
        assert (
            scheduled[0].kind,
            scheduled[0].tier_label,
            scheduled[0].intensity,
            scheduled[0].modality,
            scheduled[0].structure,
        ) == (
            considered[0].kind,
            considered[0].tier_label,
            considered[0].intensity,
            considered[0].modality,
            considered[0].structure,
        )


def scheduled_rest_and_empty_giver() -> None:
    # Given: a rest day. When: boards are visited. Then: Elowen offers it and Fenn names the empty state.
    new_profile("scheduled-rest")
    write_fresh_sync()
    save_plan([{"modality": "rest", "optional": False}])
    recovery = offers("recovery")
    assert len(recovery) == 1
    assert recovery[0].giver == "recovery"
    assert offer_response("endurance").offers == []
    assert offer_response("endurance").schedule_status == "no_slot_today"


def scheduled_same_lane_sequence() -> None:
    # Given: two Fenn slots. When: the first is accepted. Then: the second becomes current.
    new_profile("scheduled-same-lane")
    write_fresh_sync()
    save_plan([
        {"modality": "run", "tier": "easy", "optional": False},
        {"modality": "climb", "tier": "technique", "optional": False},
    ])
    first = offers("endurance")
    assert len(first) == 1 and first[0].modality == "run"
    accepted = client.post(
        "/api/quests/accept",
        json={"giver": "endurance", "option_key": first[0].option_key},
    )
    assert accepted.status_code == 200
    quest_id = AcceptanceResponse.model_validate(accepted.json()).quest_id
    db.q(
        "UPDATE quests SET status='done', completed_at=? WHERE id=?",
        (NOW.isoformat(timespec="seconds"), quest_id),
    )
    db.commit()
    second = offers("endurance")
    assert len(second) == 1
    assert (second[0].modality, second[0].tier_label) == ("climb", "technique")


def scheduled_wellness_handling() -> None:
    # Given: adverse wellness. When: scheduled work is served. Then: sized work eases and routines warn.
    new_profile("scheduled-quality-downgrade")
    seed_adverse_wellness()
    seed_activity("Run", 3, 40)
    save_plan([{"modality": "run", "tier": "quality", "optional": False}])
    downgraded = offers("endurance")
    assert len(downgraded) == 1
    assert downgraded[0].tier_label == "steady"
    assert downgraded[0].intensity != "hard"
    assert "schedule_hard_downgrade" in downgraded[0].reason_codes

    new_profile("scheduled-routine-warning")
    seed_adverse_wellness()
    save_plan([{"routine": "starting_strength", "optional": False}])
    routine = offers("strength")
    assert len(routine) == 1
    assert routine[0].kind == "program:starting_strength"
    assert routine[0].wellness_warning
    assert "hard_option_wellness_warning" in routine[0].reason_codes


def scheduled_long_fallback_boundary() -> None:
    # Given: a planned gated tier. When: history grows. Then: the closest tier gives way to the planned one.
    for sessions in (2, 3):
        new_profile(f"scheduled-long-{sessions}")
        write_fresh_sync()
        for days_ago in range(1, sessions + 1):
            seed_activity("Run", days_ago, 40 + days_ago)
        save_plan([{"modality": "run", "tier": "long", "optional": False}])
        current = offers("endurance")
        assert len(current) == 1
        if sessions < 3:
            assert current[0].tier_label == "quality"
            assert "cold_start" in current[0].reason_codes
            assert "schedule_tier_unavailable" in current[0].reason_codes
        else:
            assert current[0].tier_label == "long"
            assert current[0].kind == "run_long"
            assert "schedule_tier_unavailable" not in current[0].reason_codes


def scheduled_attribution() -> None:
    # Given: scheduled work. When: it is accepted. Then: the server records schedule attribution.
    new_profile("scheduled-attribution")
    write_fresh_sync()
    save_plan([{"modality": "run", "tier": "easy", "optional": False}])
    current = offers("endurance")
    accepted = client.post(
        "/api/quests/accept",
        json={
            "giver": "endurance",
            "option_key": current[0].option_key,
            "mode": "self",
        },
    )
    assert accepted.status_code == 200
    quest_id = AcceptanceResponse.model_validate(accepted.json()).quest_id
    attribution = counsel.get_attribution(quest_id)
    assert attribution is not None
    assert attribution.mode == "schedule"


def prior_modes_ignore_the_plan() -> None:
    # Given: a saved plan. When: another loop is active. Then: its bytes remain unchanged.
    plan = [{"modality": "climb", "tier": "technique", "optional": False}]
    for mode in ("considered", "self"):
        new_profile(f"schedule-inert-{mode}", mode)
        write_fresh_sync()
        seed_activity("Run", 2, 35)
        before = client.get("/api/offers/endurance").content
        saved = client.post(
            "/api/settings",
            json={"counsel_schedule": weekly_plan(plan)},
        )
        assert saved.status_code == 200
        after = client.get("/api/offers/endurance").content
        assert after == before


def scheduled_daily_pointer() -> None:
    # Given: scheduled mode. When: today has work or is empty. Then: the pointer names work or stays quiet.
    new_profile("scheduled-pointer")
    write_fresh_sync()
    save_plan(
        [{"modality": "run", "tier": "steady", "optional": False}],
        nudge=True,
    )
    pointer = client.get("/api/state").json()["counsel_nudge"]
    assert pointer["focus"] == "run"
    assert pointer["giver"] == "endurance"
    assert pointer["reason"] == "schedule"

    save_plan([], nudge=True)
    assert client.get("/api/state").json()["counsel_nudge"] is None

    save_plan(
        [
            {"optional": False},
            {"modality": "run", "tier": "steady", "optional": False},
        ],
        nudge=True,
    )
    assert client.get("/api/state").json()["counsel_nudge"] is None


failures: list[str] = []
for label, scenario in (
    ("sized slot", scheduled_sized_slot),
    ("routine slot", scheduled_routine_slot),
    ("open slots", scheduled_open_slots),
    ("rest and empty giver", scheduled_rest_and_empty_giver),
    ("same-lane sequence", scheduled_same_lane_sequence),
    ("wellness handling", scheduled_wellness_handling),
    ("long fallback boundary", scheduled_long_fallback_boundary),
    ("schedule attribution", scheduled_attribution),
    ("prior modes ignore plan", prior_modes_ignore_the_plan),
    ("scheduled daily pointer", scheduled_daily_pointer),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL SCHEDULED MODE PASSED")

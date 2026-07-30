from counsel_giver_test_support import (
    client,
    counsel,
    db,
    new_profile,
    offers,
    seed_activity,
)


DAYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)


def empty_schedule():
    return {day: [] for day in DAYS}


def valid_schedule():
    schedule = empty_schedule()
    schedule["monday"] = [
        {"modality": "run", "tier": "easy", "optional": False},
        {"modality": "strength", "tier": "volume", "optional": True},
    ]
    schedule["wednesday"] = [
        {"modality": "rest", "optional": False},
    ]
    schedule["saturday"] = [
        {"modality": "climb", "tier": "technique", "optional": False},
    ]
    return schedule


def all_slot_shapes_round_trip() -> None:
    new_profile("schedule-round-trip")
    routine_response = client.post(
        "/api/routines",
        json={
            "name": "Rings and sliders",
            "giver": "strength",
            "exercises": [
                {"exercise": "Pull-Up", "sets": 3, "reps": 5},
                {"exercise": "Bulgarian Split Squat", "sets": 3, "reps": 8},
            ],
        },
    )
    assert routine_response.status_code == 200
    routine_key = f"custom:{routine_response.json()['routine']['id']}"
    schedule = empty_schedule()
    schedule["monday"] = [
        {"modality": "run", "tier": "long", "optional": False},
    ]
    schedule["tuesday"] = [
        {"routine": "starting_strength", "optional": False},
        {"routine": routine_key, "optional": True},
    ]
    schedule["wednesday"] = [
        {"modality": "climb", "optional": False},
    ]
    schedule["thursday"] = [
        {"optional": True},
    ]
    schedule["sunday"] = [
        {"modality": "rest", "optional": False},
    ]

    saved = client.post("/api/settings", json={"counsel_schedule": schedule})
    state = client.get("/api/state")

    assert saved.status_code == 200
    assert state.status_code == 200
    assert state.json()["settings"]["counsel_schedule"] == schedule


def open_without_modality_persists() -> None:
    new_profile("schedule-open")
    schedule = empty_schedule()
    schedule["tuesday"] = [
        {"optional": False},
    ]

    saved = client.post("/api/settings", json={"counsel_schedule": schedule})

    assert saved.status_code == 200
    assert (
        client.get("/api/state").json()["settings"]["counsel_schedule"]["tuesday"]
        == [{"optional": False}]
    )


def accepts_long_and_rejects_wrong_tiers() -> None:
    new_profile("schedule-tier-validation")
    long_run = empty_schedule()
    long_run["saturday"] = [
        {"modality": "run", "tier": "long", "optional": False},
    ]
    accepted = client.post("/api/settings", json={"counsel_schedule": long_run})

    invalid_strength = empty_schedule()
    invalid_strength["friday"] = [
        {"modality": "strength", "tier": "quality", "optional": False},
    ]
    wrong_strength_tier = client.post(
        "/api/settings",
        json={"counsel_schedule": invalid_strength},
    )

    assert accepted.status_code == 200
    assert (
        client.get("/api/state").json()["settings"]["counsel_schedule"]["saturday"]
        == [{"modality": "run", "tier": "long", "optional": False}]
    )
    assert wrong_strength_tier.status_code == 400
    assert "effort" in wrong_strength_tier.json()["error"].lower()


def accepts_same_lane_slots() -> None:
    new_profile("schedule-same-lane")
    schedule = empty_schedule()
    schedule["tuesday"] = [
        {"modality": "run", "tier": "steady", "optional": False},
        {"modality": "climb", "tier": "volume", "optional": False},
    ]

    accepted = client.post("/api/settings", json={"counsel_schedule": schedule})

    assert accepted.status_code == 200
    persisted = client.get("/api/state").json()["settings"]["counsel_schedule"]
    assert persisted["tuesday"] == schedule["tuesday"]
    assert len(persisted["tuesday"]) == 2


def validates_routine_keys() -> None:
    new_profile("schedule-routine-keys")
    routine_response = client.post(
        "/api/routines",
        json={
            "name": "Strength A",
            "giver": "strength",
            "exercises": [{"exercise": "Pull-Up", "sets": 5, "reps": 5}],
        },
    )
    assert routine_response.status_code == 200
    routine_key = f"custom:{routine_response.json()['routine']['id']}"
    schedule = empty_schedule()
    schedule["monday"] = [{"routine": routine_key, "optional": False}]

    saved = client.post("/api/settings", json={"counsel_schedule": schedule})
    assert saved.status_code == 200
    assert (
        client.get("/api/state").json()["settings"]["counsel_schedule"]["monday"]
        == [{"routine": routine_key, "optional": False}]
    )

    unknown = empty_schedule()
    unknown["monday"] = [
        {"routine": "custom:rdoesnotexist", "optional": False},
    ]
    rejected = client.post(
        "/api/settings",
        json={"counsel_schedule": unknown},
    )

    assert rejected.status_code == 400
    assert "routine" in rejected.json()["error"].lower()
    assert (
        client.get("/api/state").json()["settings"]["counsel_schedule"]["monday"]
        == [{"routine": routine_key, "optional": False}]
    )


def legacy_sized_slots_still_load() -> None:
    new_profile("schedule-legacy")
    legacy = valid_schedule()
    db.kv_set(
        "settings",
        {
            "timezone": "UTC",
            "counsel_mode": "considered",
            "counsel_schedule": legacy,
        },
    )

    state = client.get("/api/state")

    assert state.status_code == 200
    assert state.json()["settings"]["counsel_schedule"] == legacy
    assert "tier" in state.json()["settings"]["counsel_schedule"]["monday"][0]


def malformed_persisted_schedule_degrades_to_absent() -> None:
    new_profile("schedule-malformed")
    db.kv_set(
        "settings",
        {
            "timezone": "UTC",
            "counsel_mode": "considered",
            "counsel_schedule": {
                "monday": [{"modality": "teleport", "tier": "hard"}],
            },
        },
    )

    state = client.get("/api/state")

    assert state.status_code == 200
    assert state.json()["settings"]["counsel_schedule"] is None


def schedule_is_inert() -> None:
    new_profile("schedule-inert")
    seed_activity("Run", 5, 35)
    enabled = client.post(
        "/api/settings",
        json={
            "counsel_nudge_enabled": True,
            "counsel_charter": {"primary": "run", "secondary": []},
        },
    )
    assert enabled.status_code == 200

    offers_before = [option.model_dump() for option in offers("endurance")]
    nudge_before = client.get("/api/state").json()["counsel_nudge"]
    schedule = valid_schedule()
    saved = client.post("/api/settings", json={"counsel_schedule": schedule})
    offers_after = offers("endurance")
    nudge_after = client.get("/api/state").json()["counsel_nudge"]

    assert saved.status_code == 200
    assert [option.model_dump() for option in offers_after] == offers_before
    assert nudge_after == nudge_before

    accepted = client.post(
        "/api/quests/accept",
        json={
            "giver": "endurance",
            "option_key": offers_after[0].option_key,
        },
    )
    assert accepted.status_code == 200
    attribution = counsel.get_attribution(accepted.json()["quest_id"])
    assert attribution is not None
    assert attribution.mode == "counsel"


SCENARIOS = (
    all_slot_shapes_round_trip,
    open_without_modality_persists,
    accepts_long_and_rejects_wrong_tiers,
    accepts_same_lane_slots,
    validates_routine_keys,
    legacy_sized_slots_still_load,
    malformed_persisted_schedule_degrades_to_absent,
    schedule_is_inert,
)

failures = []
for scenario in SCENARIOS:
    try:
        scenario()
        print(f"  ok  {scenario.__name__}")
    except Exception as exc:
        failures.append((scenario.__name__, exc))
        print(f"  FAIL {scenario.__name__}: {exc}")

if failures:
    raise AssertionError(f"{len(failures)} counsel schedule scenario(s) failed")

print(f"\nPASSED: {len(SCENARIOS)} counsel schedule settings scenarios")

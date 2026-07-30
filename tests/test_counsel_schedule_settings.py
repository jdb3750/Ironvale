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


def round_trip() -> None:
    new_profile("schedule-round-trip")
    schedule = valid_schedule()

    saved = client.post("/api/settings", json={"counsel_schedule": schedule})
    state = client.get("/api/state")

    assert saved.status_code == 200
    assert state.status_code == 200
    assert state.json()["settings"]["counsel_schedule"] == schedule


def rejects_two_endurance_paths() -> None:
    new_profile("schedule-one-lane")
    schedule = empty_schedule()
    schedule["thursday"] = [
        {"modality": "run", "tier": "steady", "optional": False},
        {"modality": "climb", "tier": "volume", "optional": False},
    ]

    rejected = client.post("/api/settings", json={"counsel_schedule": schedule})

    assert rejected.status_code == 400
    assert "run" in rejected.json()["error"].lower()
    assert "climb" in rejected.json()["error"].lower()
    assert "one path" in rejected.json()["error"].lower()
    assert client.get("/api/state").json()["settings"]["counsel_schedule"] is None


def accepts_two_giver_lanes() -> None:
    new_profile("schedule-two-lanes")
    schedule = empty_schedule()
    schedule["tuesday"] = [
        {"modality": "ride", "tier": "quality", "optional": False},
        {"modality": "strength", "tier": "circuit", "optional": False},
    ]

    accepted = client.post("/api/settings", json={"counsel_schedule": schedule})

    assert accepted.status_code == 200
    assert (
        client.get("/api/state").json()["settings"]["counsel_schedule"]
        == schedule
    )


def rejects_wrong_tiers() -> None:
    new_profile("schedule-tier-validation")
    invalid_strength = empty_schedule()
    invalid_strength["friday"] = [
        {"modality": "strength", "tier": "quality", "optional": False},
    ]
    wrong_strength_tier = client.post(
        "/api/settings",
        json={"counsel_schedule": invalid_strength},
    )

    rest_with_tier = empty_schedule()
    rest_with_tier["sunday"] = [
        {"modality": "rest", "tier": "easy", "optional": False},
    ]
    tiered_rest = client.post(
        "/api/settings",
        json={"counsel_schedule": rest_with_tier},
    )

    assert wrong_strength_tier.status_code == 400
    assert "effort" in wrong_strength_tier.json()["error"].lower()
    assert tiered_rest.status_code == 400
    assert "rest" in tiered_rest.json()["error"].lower()
    assert "tier" in tiered_rest.json()["error"].lower()
    assert client.get("/api/state").json()["settings"]["counsel_schedule"] is None


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
    round_trip,
    rejects_two_endurance_paths,
    accepts_two_giver_lanes,
    rejects_wrong_tiers,
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

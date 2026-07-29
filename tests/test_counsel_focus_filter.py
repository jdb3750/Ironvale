from counsel_giver_test_support import (
    client,
    game,
    new_profile,
    offers,
    seed_activity,
    write_fresh_sync,
)


def set_charter(primary: str, secondary: list[str]) -> None:
    saved = client.post(
        "/api/settings",
        json={"counsel_charter": {"primary": primary, "secondary": secondary}},
    )
    assert saved.status_code == 200


def seed_three_endurance_roads() -> None:
    # Swim is the stalest road, so recency alone would always name it.
    for days_ago in (1, 2, 3):
        seed_activity("Run", days_ago, 40)
    for days_ago in (4, 5, 6):
        seed_activity("Ride", days_ago, 60)
    for days_ago in (7, 8, 9):
        seed_activity("Swim", days_ago, 30)


def charter_narrows_the_road() -> None:
    # Given: run, ride and swim all practiced, swim the stalest. When: the
    # charter names run and strength. Then: Fenn offers run, not the stale swim.
    new_profile("focus-considered")
    write_fresh_sync()
    seed_three_endurance_roads()
    assert offers("running")[0].modality == "swim"
    set_charter("run", ["strength"])
    narrowed = offers("running")
    assert len(narrowed) == 1
    assert narrowed[0].modality == "run"
    assert "focus_charter" in narrowed[0].reason_codes


def charter_narrows_every_tier() -> None:
    # Given: the same history in Choose-your-own. When: the charter names run.
    # Then: all three tiers are run — not three tiers of an unwanted modality.
    new_profile("focus-self", "self")
    write_fresh_sync()
    seed_three_endurance_roads()
    assert {option.modality for option in offers("running")} == {"swim"}
    set_charter("run", [])
    tiers = offers("running")
    assert len(tiers) == 3
    assert {option.modality for option in tiers} == {"run"}
    assert all("focus_charter" in option.reason_codes for option in tiers)


def focus_narrows_but_never_gates() -> None:
    # Given: a charter naming no road Fenn owns. When: his board is read. Then:
    # he still offers the practiced road — walking to the hut is the request.
    new_profile("focus-disjoint")
    write_fresh_sync()
    seed_three_endurance_roads()
    set_charter("climb", ["strength"])
    fallback = offers("running")
    assert len(fallback) == 1
    assert fallback[0].modality == "swim"
    assert "focus_charter" not in fallback[0].reason_codes


def charter_ignores_unpracticed_roads() -> None:
    # Given: a charter naming ride, which has never been done. When: the board
    # is read. Then: practiced roads still win — the counsel never invents one.
    new_profile("focus-unpracticed")
    write_fresh_sync()
    for days_ago in (1, 2, 3):
        seed_activity("Run", days_ago, 40)
    set_charter("ride", ["swim"])
    offered = offers("running")
    assert offered[0].modality == "run"
    assert "focus_charter" not in offered[0].reason_codes


def unset_charter_keeps_recency() -> None:
    # Given: no charter at all. When: the board is read. Then: behaviour is
    # exactly the pre-existing recency pick.
    new_profile("focus-none")
    write_fresh_sync()
    seed_three_endurance_roads()
    assert game.get_settings()["counsel_charter"] is None
    unchanged = offers("running")
    assert unchanged[0].modality == "swim"
    assert "focus_charter" not in unchanged[0].reason_codes


failures: list[str] = []
for label, scenario in (
    ("charter narrows the road", charter_narrows_the_road),
    ("charter narrows every tier", charter_narrows_every_tier),
    ("focus narrows but never gates", focus_narrows_but_never_gates),
    ("charter ignores unpracticed roads", charter_ignores_unpracticed_roads),
    ("unset charter keeps recency", unset_charter_keeps_recency),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL FOCUS FILTER PASSED")

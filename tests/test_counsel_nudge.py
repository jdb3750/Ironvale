"""The daily pointer: opt-in, practiced-only, deterministic, and read-only.

Every scenario drives the real /api/state read the town consumes. The nudge
must never name a modality without recorded practice, never write anything,
and never change how an acceptance is attributed.
"""

from counsel_giver_test_support import (
    client,
    counsel,
    db,
    game,
    new_profile,
    offers,
    seed_activity,
    seed_adverse_wellness,
)
from app import counsel_nudge


def nudge():
    response = client.get("/api/state")
    assert response.status_code == 200
    return response.json()["counsel_nudge"]


def enable(**settings):
    saved = client.post(
        "/api/settings", json={"counsel_nudge_enabled": True, **settings}
    )
    assert saved.status_code == 200


def database_contents():
    tables = tuple(
        row["name"]
        for row in db.q(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
    )
    return {
        table: tuple(
            tuple(row)
            for row in db.q(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall()
        )
        for table in tables
    }


def disabled_by_default() -> None:
    # Given: recorded practice but the pointer untouched. Then: no nudge.
    new_profile("nudge-off")
    seed_activity("Run", 5, 30)
    assert nudge() is None


def no_practice_no_nudge() -> None:
    # Given: the pointer on but an empty ledger. Then: silence, not invention.
    new_profile("nudge-empty")
    enable()
    assert nudge() is None


def charter_cadence() -> None:
    # Given: primary run overdue at two days while secondary strength rests. Then:
    # the primary's tighter cadence wins; flipped recency flips the pointer.
    new_profile("nudge-cadence")
    seed_activity("Run", 3, 30)
    seed_activity("WeightTraining", 1, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["strength"]})
    first = nudge()
    assert first is not None and (first["focus"], first["giver"]) == ("run", "endurance")
    assert first["reason"] == "cadence" and first["days_since"] == 3

    new_profile("nudge-cadence-flip")
    seed_activity("Run", 0, 30)
    seed_activity("WeightTraining", 5, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["strength"]})
    flipped = nudge()
    assert flipped is not None
    assert (flipped["focus"], flipped["giver"]) == ("strength", "strength")

    new_profile("nudge-nothing-due")
    seed_activity("Run", 1, 30)
    seed_activity("WeightTraining", 2, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["strength"]})
    assert nudge() is None  # everything inside its cadence: no nagging


def exact_cadence_boundaries() -> None:
    # Given: the primary sits exactly at day two. Then: it becomes due.
    new_profile("nudge-primary-day-two")
    seed_activity("Run", 2, 30)
    enable(counsel_charter={"primary": "run", "secondary": []})
    primary_due = nudge()
    assert primary_due is not None
    assert (primary_due["focus"], primary_due["days_since"]) == ("run", 2)

    # Given: the secondary sits at day three. Then: it is not due yet.
    new_profile("nudge-secondary-day-three")
    seed_activity("Run", 0, 30)
    seed_activity("WeightTraining", 3, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["strength"]})
    assert nudge() is None

    # Given: the secondary reaches day four. Then: it becomes due.
    new_profile("nudge-secondary-day-four")
    seed_activity("Run", 0, 30)
    seed_activity("WeightTraining", 4, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["strength"]})
    secondary_due = nudge()
    assert secondary_due is not None
    assert (secondary_due["focus"], secondary_due["days_since"]) == ("strength", 4)


def practiced_only() -> None:
    # Given: declared strength with zero strength sessions. Then: strength is never
    # named — a practiced-but-undeclared run wins through the fallback instead.
    new_profile("nudge-unpracticed")
    seed_activity("Run", 6, 30)
    enable(counsel_charter={"primary": "strength", "secondary": []})
    pointed = nudge()
    assert pointed is not None and pointed["focus"] == "run"
    assert pointed["reason"] == "balance"

    new_profile("nudge-unpracticed-quiet")
    seed_activity("Run", 1, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["strength"]})
    quiet = nudge()
    assert quiet is None or quiet["focus"] != "strength"


def future_activity_is_not_practice() -> None:
    # Given: the only matching activity starts in the future. Then: it cannot
    # establish a practiced modality or create a pointer.
    new_profile("nudge-future-only")
    seed_activity("Run", -5, 30)
    enable()
    assert nudge() is None


def malformed_persisted_charter_is_normalized() -> None:
    # Given: a legacy/corrupt charter bypassed the HTTP parser. Then: the
    # settings boundary supplies a safe empty charter and state still renders.
    new_profile("nudge-malformed-charter")
    seed_activity("Run", 5, 30)
    db.kv_set(
        "settings",
        {
            "timezone": "UTC",
            "counsel_mode": "considered",
            "counsel_nudge_enabled": True,
            "counsel_charter": {"primary": "run", "secondary": 1},
        },
    )
    pointed = nudge()
    assert game.get_settings()["counsel_charter"] is None
    assert pointed is not None and pointed["giver"] == "endurance"


def legacy_iron_charter_survives_as_strength() -> None:
    # Given: the deployed spelling was persisted before Strength absorbed bodyweight.
    new_profile("nudge-legacy-iron-charter")
    db.kv_set(
        "settings",
        {
            "timezone": "UTC",
            "counsel_mode": "considered",
            "counsel_nudge_enabled": False,
            "counsel_charter": {"primary": "iron", "secondary": ["run"]},
        },
    )

    # Then: settings preserves the charter under the declared Strength focus.
    assert game.get_settings()["counsel_charter"] == {
        "primary": "strength",
        "secondary": ["run"],
    }


def focus_resolution_is_explicit() -> None:
    assert counsel_nudge._giver_for_focus("strength") == "strength"
    assert counsel_nudge._giver_for_focus("climb") == "endurance"

    try:
        counsel_nudge._giver_for_focus("unmapped")
    except ValueError as error:
        assert "unmapped" in str(error)
        assert "focus" in str(error).casefold()
    except StopIteration as error:
        raise AssertionError("unresolvable focus leaked StopIteration") from error
    else:
        raise AssertionError("unresolvable focus did not fail")


def climb_nudge_routes_to_fenn() -> None:
    # Given: climbing is the practiced, overdue charter focus. Then: the daily
    # pointer names Fenn, never Bram's permanent historical identity.
    new_profile("nudge-climb-fenn")
    seed_activity("Climbing", 5, 75)
    enable(counsel_charter={"primary": "climb", "secondary": []})
    pointed = nudge()
    assert pointed is not None
    assert (pointed["focus"], pointed["giver"], pointed["giver_name"]) == (
        "climb",
        "endurance",
        "Old Fenn",
    )


def malformed_persisted_settings_are_normalized() -> None:
    new_profile("nudge-malformed-settings")
    db.kv_set("settings", 1)
    settings = game.get_settings()
    assert settings["counsel_mode"] == "considered"
    assert settings["counsel_nudge_enabled"] is False
    assert settings["counsel_charter"] is None
    assert client.get("/api/state").status_code == 200


def fallback_determinism() -> None:
    # Given: no charter. Then: the stalest practiced modality, frozen-order ties.
    new_profile("nudge-fallback")
    seed_activity("Run", 1, 30)
    seed_activity("WeightTraining", 6, 30)
    enable()
    stale = nudge()
    assert stale is not None and (stale["focus"], stale["reason"]) == ("strength", "balance")

    new_profile("nudge-tie")
    seed_activity("Run", 3, 30)
    seed_activity("Ride", 3, 40)
    enable()
    tied = nudge()
    assert tied is not None and tied["focus"] == "run"  # frozen order breaks the tie

    assert nudge() == tied  # deterministic repeat, same inputs same pointer


def strain_routes_to_practiced_recovery_only() -> None:
    # Given: adverse omens. Then: Elowen only when recovery is actually
    # practiced; otherwise the pointer stays on a practiced path.
    new_profile("nudge-strain")
    seed_activity("Run", 0, 30)
    seed_activity("Yoga", 2, 20)
    seed_adverse_wellness()
    enable()
    strained = nudge()
    assert strained is not None
    assert (strained["giver"], strained["reason"]) == ("recovery", "strain")

    new_profile("nudge-strain-unpracticed")
    seed_activity("Run", 3, 30)
    seed_adverse_wellness()
    enable()
    unpracticed = nudge()
    assert unpracticed is not None and unpracticed["giver"] != "recovery"


def read_only() -> None:
    # Given: a settled profile. Then: repeated nudge-bearing state reads leave
    # every persisted value unchanged, not merely the same number of rows.
    new_profile("nudge-read-only")
    seed_activity("Run", 4, 30)
    enable()
    assert nudge() is not None  # first state read settles starter/writ churn
    before = database_contents()
    assert nudge() is not None
    assert nudge() is not None
    assert database_contents() == before


def attribution_is_untouched() -> None:
    # Given: the pointer is consumed before acceptance. Then: following its
    # giver preserves the selected loop's ordinary attribution.
    new_profile("nudge-attribution")
    seed_activity("Run", 5, 30)
    enable()
    considered_pointer = nudge()
    assert considered_pointer is not None
    assert considered_pointer["giver"] == "endurance"
    considered = client.post(
        "/api/quests/accept",
        json={
            "giver": considered_pointer["giver"],
            "option_key": offers(considered_pointer["giver"])[0].option_key,
        },
    )
    assert considered.status_code == 200
    record = counsel.get_attribution(considered.json()["quest_id"])
    assert record is not None and record.mode == "counsel"

    new_profile("nudge-attribution-self", "self")
    seed_activity("Run", 5, 30)
    enable()
    self_pointer = nudge()
    assert self_pointer is not None
    assert self_pointer["giver"] == "endurance"
    chosen = client.post(
        "/api/quests/accept",
        json={
            "giver": self_pointer["giver"],
            "option_key": offers(self_pointer["giver"])[0].option_key,
        },
    )
    assert chosen.status_code == 200
    self_record = counsel.get_attribution(chosen.json()["quest_id"])
    assert self_record is not None and self_record.mode == "self"


failures: list[str] = []
for label, scenario in (
    ("nudge is disabled by default", disabled_by_default),
    ("no practice means no nudge", no_practice_no_nudge),
    ("charter cadence selects the overdue focus", charter_cadence),
    ("cadence boundaries are exact", exact_cadence_boundaries),
    ("a declared-but-unpracticed focus is never named", practiced_only),
    ("future activity is not practice", future_activity_is_not_practice),
    ("malformed persisted charter is normalized", malformed_persisted_charter_is_normalized),
    ("legacy iron charter survives as strength", legacy_iron_charter_survives_as_strength),
    ("focus resolution is explicit", focus_resolution_is_explicit),
    ("climb nudge routes to Fenn", climb_nudge_routes_to_fenn),
    ("malformed persisted settings are normalized", malformed_persisted_settings_are_normalized),
    ("empty-charter fallback is deterministic", fallback_determinism),
    ("strain routes to Elowen only when recovery is practiced", strain_routes_to_practiced_recovery_only),
    ("nudge reads write nothing", read_only),
    ("a nudge never changes attribution", attribution_is_untouched),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL NUDGE PASSED")

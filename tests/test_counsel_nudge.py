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
    # Given: primary run overdue at two days while secondary iron rests. Then:
    # the primary's tighter cadence wins; flipped recency flips the pointer.
    new_profile("nudge-cadence")
    seed_activity("Run", 3, 30)
    seed_activity("WeightTraining", 1, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["iron"]})
    first = nudge()
    assert first is not None and (first["focus"], first["giver"]) == ("run", "running")
    assert first["reason"] == "cadence" and first["days_since"] == 3

    new_profile("nudge-cadence-flip")
    seed_activity("Run", 0, 30)
    seed_activity("WeightTraining", 5, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["iron"]})
    flipped = nudge()
    assert flipped is not None
    assert (flipped["focus"], flipped["giver"]) == ("iron", "kettlebell")

    new_profile("nudge-nothing-due")
    seed_activity("Run", 1, 30)
    seed_activity("WeightTraining", 2, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["iron"]})
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
    enable(counsel_charter={"primary": "run", "secondary": ["iron"]})
    assert nudge() is None

    # Given: the secondary reaches day four. Then: it becomes due.
    new_profile("nudge-secondary-day-four")
    seed_activity("Run", 0, 30)
    seed_activity("WeightTraining", 4, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["iron"]})
    secondary_due = nudge()
    assert secondary_due is not None
    assert (secondary_due["focus"], secondary_due["days_since"]) == ("iron", 4)


def practiced_only() -> None:
    # Given: a declared iron focus with zero iron sessions. Then: iron is never
    # named — a practiced-but-undeclared run wins through the fallback instead.
    new_profile("nudge-unpracticed")
    seed_activity("Run", 6, 30)
    enable(counsel_charter={"primary": "iron", "secondary": []})
    pointed = nudge()
    assert pointed is not None and pointed["focus"] == "run"
    assert pointed["reason"] == "balance"

    new_profile("nudge-unpracticed-quiet")
    seed_activity("Run", 1, 30)
    enable(counsel_charter={"primary": "run", "secondary": ["iron"]})
    quiet = nudge()
    assert quiet is None or quiet["focus"] != "iron"


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
    assert pointed is not None and pointed["giver"] == "running"


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
    assert stale is not None and (stale["focus"], stale["reason"]) == ("iron", "balance")

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
    assert (strained["giver"], strained["reason"]) == ("mobility", "strain")

    new_profile("nudge-strain-unpracticed")
    seed_activity("Run", 3, 30)
    seed_adverse_wellness()
    enable()
    unpracticed = nudge()
    assert unpracticed is not None and unpracticed["giver"] != "mobility"


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
    assert considered_pointer["giver"] == "running"
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
    assert self_pointer["giver"] == "running"
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

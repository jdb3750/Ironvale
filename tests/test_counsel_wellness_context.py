import atexit
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Callable, List, NamedTuple, Optional, Tuple, Union

import pydantic

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-wellness-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import counsel_context, counsel_rules, db, game, profiles, quests  # noqa: E402
from app.counsel_context_model import WellnessFieldName  # noqa: E402
from app.main import app  # noqa: E402


NOW = datetime(2026, 7, 27, 12, tzinfo=timezone.utc)
game.now = quests.now = lambda: NOW
quests.now_iso = lambda: NOW.isoformat(timespec="seconds")
quests.today = lambda: NOW.date().isoformat()
client = TestClient(app)
assert client.get("/api/profiles").status_code == 200
profile_number = 0
WellnessValue = Union[float, str]


class OfferSource(pydantic.BaseModel):
    wellness_freshness: str


class MobilityOffer(pydantic.BaseModel):
    kind: str
    title: str
    blurb: str
    structure: str
    xp: int
    gold: int
    vigor: int
    bonus_vigor: int
    option_key: str
    tier_label: str
    source: OfferSource
    writ_day: Optional[str] = None
    reasons: Tuple[str, ...] = ()


class MobilityPayload(pydantic.BaseModel):
    offers: Tuple[MobilityOffer, ...]


class MobilityClockResult(NamedTuple):
    status: int
    body: bytes
    game_calls: Tuple[datetime, ...]
    quest_now_calls: Tuple[datetime, ...]
    quest_today_calls: Tuple[str, ...]


def new_profile(label: str, nudge: bool = False) -> None:
    global profile_number
    profile_number += 1
    created = client.post(
        "/api/profiles",
        json={"name": f"{label}-{profile_number}", "pin": "1234"},
    )
    assert created.status_code == 200
    path = profiles.path_for(created.json()["slug"])
    assert path is not None
    db.set_profile(path)
    saved = client.post(
        "/api/settings",
        json={
            "timezone": "UTC",
            "counsel_mode": "considered",
            "counsel_nudge_enabled": nudge,
        },
    )
    assert saved.status_code == 200


def seed_wellness(
    observed_on: str,
    hrv: WellnessValue,
    resting_hr: WellnessValue,
    succeeded_at: datetime = NOW,
) -> None:
    db.q(
        "INSERT INTO wellness (date, hrv, resting_hr) VALUES (?,?,?)",
        (observed_on, hrv, resting_hr),
    )
    db.commit()
    db.kv_set(
        "sync_status",
        {
            "revision": 1,
            "activity": {"revision": 1},
            "wellness": {
                "revision": 1,
                "succeeded_at": succeeded_at.isoformat(timespec="seconds"),
                "newest_observation_date": observed_on,
                "field_as_of": {
                    "hrv": observed_on,
                    "resting_hr": observed_on,
                },
            },
        },
    )


def request_state_with_context() -> Tuple[
    int,
    bytes,
    Tuple[counsel_context.QualifiedTrainingContext, ...],
]:
    contexts: List[counsel_context.QualifiedTrainingContext] = []
    original = counsel_context.assemble

    def capture(
        current: Optional[datetime] = None,
    ) -> counsel_context.QualifiedTrainingContext:
        context = original(current)
        contexts.append(context)
        return context

    counsel_context.assemble = capture
    try:
        response = client.get("/api/state")
    finally:
        counsel_context.assemble = original
    return response.status_code, response.content, tuple(contexts)


def request_mobility_with_context() -> Tuple[
    int,
    bytes,
    Tuple[counsel_context.QualifiedTrainingContext, ...],
]:
    contexts: List[counsel_context.QualifiedTrainingContext] = []
    original = counsel_context.assemble

    def capture(
        current: Optional[datetime] = None,
    ) -> counsel_context.QualifiedTrainingContext:
        context = original(current)
        contexts.append(context)
        return context

    counsel_context.assemble = capture
    try:
        response = client.get("/api/offers/mobility")
    finally:
        counsel_context.assemble = original
    return response.status_code, response.content, tuple(contexts)


def mobility_at_midnight(boundary: datetime) -> MobilityClockResult:
    after_midnight = boundary + timedelta(seconds=2)
    game_calls: List[datetime] = []
    quest_now_calls: List[datetime] = []
    quest_today_calls: List[str] = []
    original_game_now = game.now
    original_quest_now = quests.now
    original_quest_today = quests.today

    def adversarial_game_now() -> datetime:
        current = boundary if not game_calls else after_midnight
        game_calls.append(current)
        return current

    def adversarial_quest_now() -> datetime:
        quest_now_calls.append(after_midnight)
        return after_midnight

    def adversarial_quest_today() -> str:
        current = after_midnight.date().isoformat()
        quest_today_calls.append(current)
        return current

    game.now = adversarial_game_now
    quests.now = adversarial_quest_now
    quests.today = adversarial_quest_today
    try:
        response = client.get("/api/offers/mobility")
    finally:
        game.now = original_game_now
        quests.now = original_quest_now
        quests.today = original_quest_today
    return MobilityClockResult(
        response.status_code,
        response.content,
        tuple(game_calls),
        tuple(quest_now_calls),
        tuple(quest_today_calls),
    )


def numeric_control_is_fresh() -> None:
    # Given: valid persisted numeric wellness and fresh structured metadata.
    new_profile("numeric-control")
    seed_wellness(NOW.date().isoformat(), 60.0, 50.0)

    # When: the real state route assembles Council context.
    status, body, contexts = request_state_with_context()

    # Then: existing numeric behavior remains fresh and typed.
    assert status == 200, {"status": status, "body": body.decode()}
    assert len(contexts) == 1
    context = contexts[0]
    assert context.wellness.aggregate_freshness == "fresh"
    assert context.wellness_field("hrv").readings[0].value == 60.0
    assert context.wellness_field("resting_hr").readings[0].value == 50.0
    assert counsel_rules.rule_state(context=context).wellness_state == "fresh"


def assert_malformed_route(
    label: str,
    nudge: bool,
    hrv: WellnessValue,
    resting_hr: WellnessValue,
    malformed_field: WellnessFieldName,
) -> None:
    # Given: one malformed persisted field with otherwise fresh metadata.
    new_profile(label, nudge)
    seed_wellness(NOW.date().isoformat(), hrv, resting_hr)

    # When: the real state route assembles Council context.
    status, body, contexts = request_state_with_context()

    # Then: the route survives and Council treats that field as unknown.
    assert status == 200, {"status": status, "body": body.decode()}
    assert len(contexts) == 1
    context = contexts[0]
    field = context.wellness_field(malformed_field)
    assert context.wellness.aggregate_freshness == "missing"
    assert field.fresh is False and field.readings == ()
    assert counsel_rules.rule_state(context=context).wellness_state == "missing"


def malformed_hrv_with_nudge_disabled_is_missing() -> None:
    assert_malformed_route(
        "bad-hrv-disabled",
        False,
        "malformed-hrv",
        60.0,
        "hrv",
    )


def malformed_hrv_with_nudge_enabled_is_missing() -> None:
    assert_malformed_route(
        "bad-hrv-enabled",
        True,
        "malformed-hrv",
        60.0,
        "hrv",
    )


def malformed_rhr_with_nudge_disabled_is_missing() -> None:
    assert_malformed_route(
        "bad-rhr-disabled",
        False,
        60.0,
        "malformed-rhr",
        "resting_hr",
    )


def malformed_rhr_with_nudge_enabled_is_missing() -> None:
    assert_malformed_route(
        "bad-rhr-enabled",
        True,
        60.0,
        "malformed-rhr",
        "resting_hr",
    )


def assert_malformed_mobility_route(
    label: str,
    nudge: bool,
    hrv: WellnessValue,
    resting_hr: WellnessValue,
    malformed_field: WellnessFieldName,
) -> None:
    # Given: malformed persisted recovery data and either nudge setting.
    new_profile(label, nudge)
    seed_wellness(NOW.date().isoformat(), hrv, resting_hr)

    # When: Elowen's real public offer route constructs recovery options.
    status, body, contexts = request_mobility_with_context()

    # Then: recovery shares the qualified missing state instead of reparsing.
    assert status == 200, {"status": status, "body": body.decode()}
    assert len(contexts) == 1
    field = contexts[0].wellness_field(malformed_field)
    assert field.fresh is False and field.readings == ()
    payload = MobilityPayload.model_validate_json(body)
    assert payload.offers
    assert all(
        option.source.wellness_freshness == "missing"
        for option in payload.offers
    )


def malformed_hrv_mobility_with_nudge_disabled_is_missing() -> None:
    assert_malformed_mobility_route(
        "mobility-bad-hrv-disabled",
        False,
        "malformed-hrv",
        60.0,
        "hrv",
    )


def malformed_hrv_mobility_with_nudge_enabled_is_missing() -> None:
    assert_malformed_mobility_route(
        "mobility-bad-hrv-enabled",
        True,
        "malformed-hrv",
        60.0,
        "hrv",
    )


def malformed_rhr_mobility_with_nudge_disabled_is_missing() -> None:
    assert_malformed_mobility_route(
        "mobility-bad-rhr-disabled",
        False,
        60.0,
        "malformed-rhr",
        "resting_hr",
    )


def malformed_rhr_mobility_with_nudge_enabled_is_missing() -> None:
    assert_malformed_mobility_route(
        "mobility-bad-rhr-enabled",
        True,
        60.0,
        "malformed-rhr",
        "resting_hr",
    )


def seed_recovery_sleep(observed_on: str, sleep_secs: float) -> None:
    db.q(
        "INSERT INTO wellness (date, sleep_secs) VALUES (?,?) "
        "ON CONFLICT(date) DO UPDATE SET sleep_secs=excluded.sleep_secs",
        (observed_on, sleep_secs),
    )
    db.commit()


def assert_inadmissible_recovery_date_keeps_mobility(
    label: str,
    observed_on: str,
) -> None:
    # Given: ordinary current-day mobility followed by an inadmissible short-sleep row.
    new_profile(label)
    seed_wellness(NOW.date().isoformat(), 60.0, 50.0)
    baseline_status, baseline_body, _ = request_mobility_with_context()
    baseline = MobilityPayload.model_validate_json(baseline_body)
    assert baseline_status == 200
    assert baseline.offers and all(offer.kind == "mobility" for offer in baseline.offers)
    seed_recovery_sleep(observed_on, 3600.0)

    # When: the real public route is read repeatedly.
    first_status, first_body, first_contexts = request_mobility_with_context()
    second_status, second_body, second_contexts = request_mobility_with_context()

    # Then: the inadmissible row cannot alter recovery context or response bytes.
    assert first_status == second_status == 200
    assert first_body == second_body == baseline_body
    assert len(first_contexts) == len(second_contexts) == 1
    assert all(
        day.observed_on != observed_on
        for context in first_contexts + second_contexts
        for day in context.wellness.recovery_days
    )


def tomorrow_short_sleep_cannot_create_rest_writ() -> None:
    assert_inadmissible_recovery_date_keeps_mobility(
        "future-recovery-date",
        (NOW.date() + timedelta(days=1)).isoformat(),
    )


def malformed_date_short_sleep_cannot_create_rest_writ() -> None:
    assert_inadmissible_recovery_date_keeps_mobility(
        "malformed-recovery-date",
        "not-a-date",
    )


def current_day_short_sleep_preserves_rest_writ_exactly() -> None:
    # Given: one valid current-day short-sleep observation.
    new_profile("valid-current-recovery-date")
    observed_on = NOW.date().isoformat()
    seed_wellness(observed_on, 60.0, 50.0)
    seed_recovery_sleep(observed_on, 3600.0)

    # When: Elowen's public route is read twice.
    first_status, first_body, first_contexts = request_mobility_with_context()
    second_status, second_body, second_contexts = request_mobility_with_context()
    payload = MobilityPayload.model_validate_json(first_body)

    # Then: valid Rest Writ selection, copy, rewards, and bytes remain exact.
    assert first_status == second_status == 200
    assert first_body == second_body
    assert len(first_contexts) == len(second_contexts) == 1
    assert tuple(
        day.observed_on
        for day in first_contexts[0].wellness.recovery_days
    ) == (observed_on,)
    assert len(payload.offers) == 1
    offer = payload.offers[0]
    assert offer.kind == "rest"
    assert offer.title == "The Rest Writ"
    assert offer.blurb == "Some quests are carried. This one is set down."
    assert offer.structure == (
        "From acceptance until dawn: no hard training. Walks, stretches "
        "and sleep are the whole of the quest."
    )
    assert (offer.xp, offer.gold, offer.vigor, offer.bonus_vigor) == (45, 20, 2, 1)
    assert offer.writ_day == observed_on
    assert offer.reasons == ("last night gave you only 1.0 hours of sleep",)
    assert offer.tier_label == "rest-writ"


def one_midnight_clock_owns_recovery_options() -> None:
    # Given: a request captured one second before midnight.
    boundary = datetime(2026, 7, 27, 23, 59, 59, tzinfo=timezone.utc)
    new_profile("mobility-midnight")
    seed_wellness(NOW.date().isoformat(), 60.0, 50.0)

    # When: every later ambient clock would report the following day.
    first = mobility_at_midnight(boundary)
    second = mobility_at_midnight(boundary)

    # Then: one captured clock owns Rest Writ checks, seed, and option identity.
    assert first.status == second.status == 200
    assert first.game_calls == second.game_calls == (boundary,)
    assert first.quest_now_calls == second.quest_now_calls == ()
    assert first.quest_today_calls == second.quest_today_calls == ()
    assert first.body == second.body


def one_request_clock_owns_all_freshness() -> None:
    # Given: metadata exactly on both 48-hour and two-day boundaries.
    boundary = NOW
    observed_on = (boundary.date() - timedelta(days=2)).isoformat()
    new_profile("one-clock")
    seed_wellness(observed_on, 60.0, 50.0, boundary - timedelta(hours=48))
    calls: List[datetime] = []
    original_now = game.now

    def adversarial_now() -> datetime:
        value = boundary if not calls else boundary + timedelta(seconds=1)
        calls.append(value)
        return value

    # When: context captures the request time.
    game.now = adversarial_now
    try:
        context = counsel_context.assemble()
    finally:
        game.now = original_now

    # Then: no second clock can move aggregate freshness past the boundary.
    assert calls == [boundary], calls
    assert context.wellness.aggregate_freshness == "fresh"
    assert all(field.fresh for field in context.wellness.fields[:2])


def supplied_clock_owns_all_freshness() -> None:
    # Given: the same boundary plus an adversarial ambient clock.
    boundary = NOW
    observed_on = (boundary.date() - timedelta(days=2)).isoformat()
    new_profile("supplied-clock")
    seed_wellness(observed_on, 60.0, 50.0, boundary - timedelta(hours=48))
    calls: List[datetime] = []
    original_now = game.now

    def adversarial_now() -> datetime:
        calls.append(boundary + timedelta(seconds=1))
        return calls[-1]

    # When: the caller supplies the captured request time.
    game.now = adversarial_now
    try:
        context = counsel_context.assemble(boundary)
    finally:
        game.now = original_now

    # Then: every freshness result uses the supplied time without a clock read.
    assert calls == [], calls
    assert context.wellness.aggregate_freshness == "fresh"
    assert all(field.fresh for field in context.wellness.fields[:2])


def run_scenario(label: str, scenario: Callable[[], None]) -> Optional[str]:
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failure = f"{label}: {type(error).__name__}: {error}"
        print(f"  RED {failure}")
        return failure
    return None


failures: List[str] = []
for label, scenario in (
    ("valid numeric wellness remains fresh", numeric_control_is_fresh),
    ("malformed HRV, nudge disabled", malformed_hrv_with_nudge_disabled_is_missing),
    ("malformed HRV, nudge enabled", malformed_hrv_with_nudge_enabled_is_missing),
    ("malformed RHR, nudge disabled", malformed_rhr_with_nudge_disabled_is_missing),
    ("malformed RHR, nudge enabled", malformed_rhr_with_nudge_enabled_is_missing),
    (
        "mobility malformed HRV, nudge disabled",
        malformed_hrv_mobility_with_nudge_disabled_is_missing,
    ),
    (
        "mobility malformed HRV, nudge enabled",
        malformed_hrv_mobility_with_nudge_enabled_is_missing,
    ),
    (
        "mobility malformed RHR, nudge disabled",
        malformed_rhr_mobility_with_nudge_disabled_is_missing,
    ),
    (
        "mobility malformed RHR, nudge enabled",
        malformed_rhr_mobility_with_nudge_enabled_is_missing,
    ),
    (
        "tomorrow short sleep cannot create a Rest Writ",
        tomorrow_short_sleep_cannot_create_rest_writ,
    ),
    (
        "malformed-date short sleep cannot create a Rest Writ",
        malformed_date_short_sleep_cannot_create_rest_writ,
    ),
    (
        "current-day short sleep preserves Rest Writ exactly",
        current_day_short_sleep_preserves_rest_writ_exactly,
    ),
    ("one midnight clock owns recovery options", one_midnight_clock_owns_recovery_options),
    ("one request clock owns aggregate and fields", one_request_clock_owns_all_freshness),
    ("supplied clock owns aggregate and fields", supplied_clock_owns_all_freshness),
):
    failure = run_scenario(label, scenario)
    if failure is not None:
        failures.append(failure)

assert not failures, "\n".join(failures)
print("COUNSEL WELLNESS CONTEXT PASSED")

import atexit
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Callable, List, Optional, Tuple, Union


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
    ("one request clock owns aggregate and fields", one_request_clock_owns_all_freshness),
    ("supplied clock owns aggregate and fields", supplied_clock_owns_all_freshness),
):
    failure = run_scenario(label, scenario)
    if failure is not None:
        failures.append(failure)

assert not failures, "\n".join(failures)
print("COUNSEL WELLNESS CONTEXT PASSED")

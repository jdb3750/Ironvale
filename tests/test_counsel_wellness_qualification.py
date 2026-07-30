import atexit
import hashlib
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Callable, List, Optional, Tuple, Union

from pydantic import BaseModel, ConfigDict


class OfferSource(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    wellness_as_of: Optional[str]
    wellness_freshness: str


class Offer(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    source: OfferSource


class OfferPayload(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    offers: Tuple[Offer, ...]


class RunningOffer(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    intensity: str
    tier_label: str
    reason_codes: Tuple[str, ...]


class RunningPayload(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    offers: Tuple[RunningOffer, ...]


WellnessValue = Union[float, str, None]
StatusDate = Union[str, int, None]
NOW = datetime(2026, 7, 27, 12, tzinfo=timezone.utc)
TODAY = NOW.date().isoformat()
YESTERDAY = (NOW.date() - timedelta(days=1)).isoformat()


def main() -> None:
    scratch = tempfile.mkdtemp(prefix="iron-vale-wellness-qualification-")
    atexit.register(shutil.rmtree, scratch, ignore_errors=True)
    os.environ["DATA_DIR"] = scratch
    os.environ["PYTHONPYCACHEPREFIX"] = os.path.join(scratch, "pycache")
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    from fastapi.testclient import TestClient

    from app import counsel_context, counsel_rules, db, game, profiles, quests
    from app.counsel_context_model import WellnessFieldName
    from app.main import app

    game.now = quests.now = lambda: NOW
    quests.now_iso = lambda: NOW.isoformat(timespec="seconds")
    quests.today = lambda: TODAY
    client = TestClient(app)
    assert client.get("/api/profiles").status_code == 200
    profile_number = 0

    def new_profile(label: str, nudge: bool = False, exact: bool = False) -> None:
        nonlocal profile_number
        profile_number += 1
        name = label if exact else f"{label}-{profile_number}"
        created = client.post(
            "/api/profiles",
            json={"name": name, "pin": "1234"},
        )
        assert created.status_code == 200, created.content
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
        assert saved.status_code == 200, saved.content

    def seed_row(
        observed_on: str,
        hrv: WellnessValue,
        resting_hr: WellnessValue,
        sleep_secs: WellnessValue = 27000.0,
    ) -> None:
        db.q(
            "INSERT INTO wellness (date, hrv, resting_hr, sleep_secs) "
            "VALUES (?,?,?,?)",
            (observed_on, hrv, resting_hr, sleep_secs),
        )
        db.commit()

    def write_status(
        newest: StatusDate,
        hrv_as_of: StatusDate,
        resting_hr_as_of: StatusDate,
        succeeded_at: StatusDate = NOW.isoformat(timespec="seconds"),
        extra_field_dates: Tuple[Tuple[str, StatusDate], ...] = (),
    ) -> None:
        field_as_of = {
            "hrv": hrv_as_of,
            "resting_hr": resting_hr_as_of,
        }
        field_as_of.update(extra_field_dates)
        db.kv_set(
            "sync_status",
            {
                "revision": 1,
                "activity": {"revision": 1},
                "wellness": {
                    "revision": 1,
                    "succeeded_at": succeeded_at,
                    "newest_observation_date": newest,
                    "field_as_of": field_as_of,
                },
            },
        )

    def source(path: str) -> Tuple[int, bytes, OfferSource]:
        response = client.get(path)
        payload = OfferPayload.model_validate_json(response.content)
        assert payload.offers
        return response.status_code, response.content, payload.offers[0].source

    def ordinary_valid_public_bytes_are_exact() -> None:
        # Given: the unchanged-HEAD characterization fixture.
        new_profile("Wellness Baseline", exact=True)
        seed_row(YESTERDAY, 60.0, 50.0)
        seed_row(TODAY, 61.0, 49.0)
        write_status(TODAY, TODAY, TODAY)

        # When: typed context and all ordinary public Council surfaces render.
        captured = counsel_context.assemble(NOW)
        state = client.get("/api/state")
        mobility = client.get("/api/offers/recovery")
        running = client.get("/api/offers/endurance")

        # Then: valid readings, disclosure, and response bytes stay characterized.
        assert captured.wellness.aggregate_freshness == "fresh"
        assert captured.wellness.newest_observation_date == TODAY
        assert captured.wellness_field("hrv").readings == (
            (TODAY, 61.0),
            (YESTERDAY, 60.0),
        )
        assert captured.wellness_field("resting_hr").readings == (
            (TODAY, 49.0),
            (YESTERDAY, 50.0),
        )
        expected = {
            "mobility": (
                866,
                "0fadb7dfab1f7ec0ff1311d720f7a54e7229028f7aa4c3c8df42afad8fd5e7dc",
            ),
            "endurance": (
                830,
                "95d3ceb5e46b5010b7dc95f4a1aa3d1229bc46198633977ada4bb8aefd490c0b",
            ),
        }
        assert state.status_code == 200
        for label, response in (
            ("mobility", mobility),
            ("endurance", running),
        ):
            assert response.status_code == 200
            observed = (
                len(response.content),
                hashlib.sha256(response.content).hexdigest(),
            )
            assert observed == expected[label], (label, observed, expected[label])

    def metadata_is_absent(raw: StatusDate, label: str) -> None:
        # Given: valid table data but one inadmissible authoritative date kind.
        new_profile(f"metadata-{label}")
        seed_row(TODAY, 61.0, 49.0)
        write_status(raw, raw, raw)

        # When: context and public disclosures consume the qualified snapshot.
        captured = counsel_context.assemble(NOW)
        state = client.get("/api/state")
        running_status, _, running_source = source("/api/offers/endurance")
        mobility_status, _, mobility_source = source("/api/offers/recovery")

        # Then: no consumer can observe or use the inadmissible date.
        assert state.status_code == running_status == mobility_status == 200
        assert captured.wellness.aggregate_freshness == "missing"
        assert captured.wellness.newest_observation_date is None
        for field in captured.wellness.fields:
            assert field.as_of is None
            assert field.fresh is False
            assert field.readings == ()
        assert counsel_rules.rule_state(context=captured).wellness_state == "missing"
        for disclosure in (running_source, mobility_source):
            assert disclosure.wellness_as_of is None
            assert disclosure.wellness_freshness == "missing"

    def invalid_prior_trend_row_is_absent() -> None:
        # Given: a valid current reading and an impossible prior calendar date.
        new_profile("invalid-prior")
        seed_row("2026-02-30", 99.0, 30.0)
        seed_row(TODAY, 61.0, 49.0)
        write_status(TODAY, TODAY, TODAY)

        # When: trend readings are assembled and published.
        captured = counsel_context.assemble(NOW)
        running_status, _, _ = source("/api/offers/endurance")

        # Then: only qualified rows survive the assembly boundary.
        assert running_status == 200
        assert captured.wellness_field("hrv").readings == ((TODAY, 61.0),)
        assert captured.wellness_field("resting_hr").readings == ((TODAY, 49.0),)

    def malformed_rows_cannot_crowd_out_valid_trend() -> None:
        # Given: fourteen valid priors and an adverse authoritative current row.
        new_profile("malformed-crowding")
        for days_ago in range(14, 0, -1):
            observed_on = (NOW.date() - timedelta(days=days_ago)).isoformat()
            seed_row(observed_on, 60.0, 50.0)
        seed_row(TODAY, 40.0, 70.0)
        write_status(TODAY, TODAY, TODAY)
        baseline_context = counsel_context.assemble(NOW)
        baseline_rules = counsel_rules.rule_state(context=baseline_context)
        baseline_response = client.get("/api/offers/endurance")
        baseline_payload = RunningPayload.model_validate_json(
            baseline_response.content,
        )
        expected_hrv = ((TODAY, 40.0),) + tuple(
            (
                (NOW.date() - timedelta(days=days_ago)).isoformat(),
                60.0,
            )
            for days_ago in range(1, 15)
        )
        expected_resting_hr = ((TODAY, 70.0),) + tuple(
            (
                (NOW.date() - timedelta(days=days_ago)).isoformat(),
                50.0,
            )
            for days_ago in range(1, 15)
        )
        assert baseline_response.status_code == 200
        assert baseline_context.wellness_field("hrv").readings == expected_hrv
        assert (
            baseline_context.wellness_field("resting_hr").readings
            == expected_resting_hr
        )
        assert baseline_rules.suppresses_hard is True
        assert {
            "wellness_trend_low_hrv",
            "wellness_trend_high_resting_hr",
            "hard_suppressed_wellness_trend",
        } <= set(baseline_rules.reason_codes)
        assert baseline_payload.offers[0].intensity != "hard"

        # When: twenty-eight invalid dates sort ahead of every valid prior.
        for index in range(28):
            seed_row(f"{YESTERDAY}~{index:02d}", 100.0, 20.0)
        crowded_context = counsel_context.assemble(NOW)
        crowded_rules = counsel_rules.rule_state(context=crowded_context)
        crowded_response = client.get("/api/offers/endurance")

        # Then: qualification precedes retention for context, rules, and HTTP.
        assert crowded_context.wellness_field("hrv").readings == expected_hrv
        assert (
            crowded_context.wellness_field("resting_hr").readings
            == expected_resting_hr
        )
        assert crowded_rules == baseline_rules
        assert crowded_response.status_code == 200
        assert crowded_response.content == baseline_response.content

    def non_finite_authoritative_value_is_missing(
        field_name: WellnessFieldName,
        value: WellnessValue,
        value_label: str,
        nudge: bool,
    ) -> None:
        # Given: fresh metadata names a non-reading as authoritative.
        new_profile(f"{field_name}-{value_label}-{nudge}", nudge=nudge)
        hrv = value if field_name == "hrv" else 61.0
        resting_hr = value if field_name == "resting_hr" else 49.0
        seed_row(TODAY, hrv, resting_hr)
        write_status(TODAY, TODAY, TODAY)

        # When: nudge, running, and mobility traverse the real HTTP routes.
        captured = counsel_context.assemble(NOW)
        state = client.get("/api/state")
        running_status, _, running_source = source("/api/offers/endurance")
        mobility_status, _, mobility_source = source("/api/offers/recovery")

        # Then: no false current reading or false freshness can escape.
        assert state.status_code == running_status == mobility_status == 200
        target = captured.wellness_field(field_name)
        assert target.readings == ()
        assert target.fresh is False
        assert captured.wellness.aggregate_freshness == "missing"
        assert counsel_rules.rule_state(context=captured).wellness_state == "missing"
        for disclosure in (running_source, mobility_source):
            assert disclosure.wellness_as_of == TODAY
            assert disclosure.wellness_freshness == "missing"

    def hostile_then_valid_transition_has_no_stale_leak() -> None:
        # Given: one profile first reports future metadata over valid table data.
        new_profile("transition")
        seed_row(TODAY, 61.0, 49.0)
        tomorrow = (NOW.date() + timedelta(days=1)).isoformat()
        write_status(tomorrow, tomorrow, tomorrow)
        first_status, _, first_source = source("/api/offers/endurance")

        # When: the same profile receives valid authoritative metadata.
        write_status(TODAY, TODAY, TODAY)
        second_status, second_body, second_source = source("/api/offers/endurance")
        third_status, third_body, third_source = source("/api/offers/endurance")

        # Then: invalid state never leaks and valid bytes recover deterministically.
        assert first_status == second_status == third_status == 200
        assert first_source.wellness_as_of is None
        assert first_source.wellness_freshness == "missing"
        assert second_source == third_source
        assert second_source.wellness_as_of == TODAY
        assert second_source.wellness_freshness == "fresh"
        assert second_body == third_body
        assert (
            len(second_body),
            hashlib.sha256(second_body).hexdigest(),
        ) == (
            830,
            "95d3ceb5e46b5010b7dc95f4a1aa3d1229bc46198633977ada4bb8aefd490c0b",
        )

    def extreme_succeeded_at_degrades_to_missing() -> None:
        # Given: finite current readings with a parseable offset that overflows.
        new_profile("extreme-succeeded-at", nudge=True)
        seed_row(TODAY, 61.0, 49.0)
        write_status(
            TODAY,
            TODAY,
            TODAY,
            succeeded_at="9999-12-31T23:59:59-23:59",
        )

        # When: context, nudge, running, and mobility traverse public routes.
        captured = counsel_context.assemble(NOW)
        state = client.get("/api/state")
        running_status, _, running_source = source("/api/offers/endurance")
        mobility_status, _, mobility_source = source("/api/offers/recovery")

        # Then: the timestamp is missing evidence, never a server error.
        assert state.status_code == running_status == mobility_status == 200
        assert captured.wellness.aggregate_freshness == "missing"
        assert all(field.fresh is False for field in captured.wellness.fields)
        assert counsel_rules.rule_state(context=captured).wellness_state == "missing"
        for disclosure in (running_source, mobility_source):
            assert disclosure.wellness_as_of == TODAY
            assert disclosure.wellness_freshness == "missing"

    def fresh_weight_with_stale_trend_fields_stays_mixed() -> None:
        # Given: the parent-characterized partial-valid wellness snapshot.
        new_profile("partial-valid")
        stale_day = (NOW.date() - timedelta(days=3)).isoformat()
        seed_row(stale_day, 61.0, 49.0)
        db.q(
            "INSERT INTO wellness (date, weight) VALUES (?,?)",
            (TODAY, 180.0),
        )
        db.commit()
        write_status(
            TODAY,
            stale_day,
            stale_day,
            extra_field_dates=(("weight", TODAY),),
        )

        # When: typed context and the three real public surfaces render.
        captured = counsel_context.assemble(NOW)
        rules = counsel_rules.rule_state(context=captured)
        state = client.get("/api/state")
        running = client.get("/api/offers/endurance")
        mobility = client.get("/api/offers/recovery")

        # Then: aggregate freshness and exact parent public behavior stay mixed.
        assert state.status_code == running.status_code == mobility.status_code == 200
        assert captured.wellness.aggregate_freshness == "fresh"
        assert tuple(
            (field.name, field.as_of, field.fresh, field.readings)
            for field in captured.wellness.fields
        ) == (
            ("hrv", stale_day, False, ((stale_day, 61.0),)),
            ("resting_hr", stale_day, False, ((stale_day, 49.0),)),
        )
        assert rules.wellness_state == "mixed"
        assert rules.reason_codes == (
            "wellness_data_mixed",
            "hard_suppressed_wellness_unknown",
        )
        running_observed = (
            len(running.content),
            hashlib.sha256(running.content).hexdigest(),
        )
        running_expected = (
            887,
            "5ff723b218b88a8591914451c2b1a4d8b8de715495650285c4e0c95c77ef3fea",
        )
        assert running_observed == running_expected, (
            running_observed,
            running_expected,
        )
        mobility_observed = (
            len(mobility.content),
            hashlib.sha256(mobility.content).hexdigest(),
        )
        mobility_expected = (
            922,
            "4e816a6ebaf41fff85b692082c391412b44d2889f6155c0fd9c5e24b40161377",
        )
        assert mobility_observed == mobility_expected, (
            mobility_observed,
            mobility_expected,
        )
        for response in (running, mobility):
            payload = OfferPayload.model_validate_json(response.content)
            assert payload.offers[0].source.wellness_as_of == TODAY
            assert payload.offers[0].source.wellness_freshness == "mixed"

    def concurrent_appends_stop_at_one_statement_snapshot() -> None:
        # Given: more than one batch of persisted rows and a missing recent day.
        new_profile("append-high-water")
        for days_ago in range(29, 1, -1):
            observed_on = (NOW.date() - timedelta(days=days_ago)).isoformat()
            seed_row(observed_on, 60.0, 50.0)
        seed_row(TODAY, 40.0, 70.0)
        for index in range(40):
            seed_row(f"malformed-initial-{index:02d}", 100.0, 20.0)
        write_status(TODAY, TODAY, TODAY)
        expected_dates = (TODAY,) + tuple(
            (NOW.date() - timedelta(days=days_ago)).isoformat()
            for days_ago in range(2, 30)
        )
        original_q = db.q
        snapshot_calls = 0

        def append_between_batches(sql: str, params=()):
            nonlocal snapshot_calls
            cursor = original_q(sql, params)
            if "FROM WELLNESS" not in sql.upper():
                return cursor
            snapshot_calls += 1

            class SnapshotCursor:
                def fetchall(self):
                    rows = cursor.fetchall()
                    assert snapshot_calls == 1
                    original_q(
                        "INSERT INTO wellness (date, hrv, resting_hr) "
                        "VALUES (?,?,?)",
                        (YESTERDAY, 39.0, 71.0),
                    )
                    for index in range(63):
                        original_q(
                            "INSERT INTO wellness (date, hrv, resting_hr) "
                            "VALUES (?,?,?)",
                            (
                                f"concurrent-{index:02d}",
                                100.0,
                                20.0,
                            ),
                        )
                    db.commit()
                    return rows

            return SnapshotCursor()

        # When: rows are appended immediately after the single statement fetch.
        db.q = append_between_batches
        try:
            captured = counsel_context.assemble(NOW)
        finally:
            db.q = original_q

        # Then: one statement bounds both fields and excludes every append.
        assert snapshot_calls == 1
        assert tuple(
            reading.observed_on
            for reading in captured.wellness_field("hrv").readings
        ) == expected_dates
        assert tuple(
            reading.observed_on
            for reading in captured.wellness_field("resting_hr").readings
        ) == expected_dates
        assert YESTERDAY not in expected_dates

    def rowid_reuse_after_statement_capture_is_excluded_everywhere() -> None:
        # Given: a valid current row followed by a removable maximum rowid.
        new_profile("rowid-reuse")
        seed_row(TODAY, 61.0, 49.0)
        seed_row("capture-placeholder", 99.0, 20.0)
        write_status(TODAY, TODAY, TODAY)
        captured_max = db.q(
            "SELECT MAX(rowid) AS max_rowid FROM wellness",
        ).fetchone()["max_rowid"]
        post_capture_day = (NOW.date() - timedelta(days=7)).isoformat()
        original_q = db.q
        wellness_queries = 0
        mutation_fired = False
        reused_rowid = None

        def delete_max_and_reuse_rowid() -> None:
            nonlocal mutation_fired, reused_rowid
            if mutation_fired:
                return
            mutation_fired = True
            original_q(
                "DELETE FROM wellness WHERE rowid = ?",
                (captured_max,),
            )
            original_q(
                "INSERT INTO wellness (date, hrv, resting_hr, sleep_secs) "
                "VALUES (?,?,?,?)",
                (post_capture_day, 39.0, 71.0, 18000.0),
            )
            db.commit()
            reused_rowid = original_q(
                "SELECT rowid AS wellness_rowid FROM wellness WHERE date = ?",
                (post_capture_day,),
            ).fetchone()["wellness_rowid"]

        class CaptureCursor:
            def __init__(self, cursor) -> None:
                self.cursor = cursor

            def fetchall(self):
                rows = self.cursor.fetchall()
                delete_max_and_reuse_rowid()
                return rows

        def capture_then_mutate(sql: str, params=()):
            nonlocal wellness_queries
            if "FROM WELLNESS" in sql.upper():
                wellness_queries += 1
            cursor = original_q(sql, params)
            normalized = sql.upper()
            is_snapshot = "SLEEP_SECS" in normalized
            is_trend_scan = "SELECT ROWID AS WELLNESS_ROWID" in normalized
            if not mutation_fired and (is_snapshot or is_trend_scan):
                return CaptureCursor(cursor)
            return cursor

        # When: the database changes after the captured statement is fetched.
        db.q = capture_then_mutate
        try:
            captured = counsel_context.assemble(NOW)
        finally:
            db.q = original_q

        # Then: rowid reuse is excluded from trends and recovery, with one query.
        assert mutation_fired is True, "statement capture did not trigger mutation"
        assert reused_rowid == captured_max, (reused_rowid, captured_max)
        assert wellness_queries == 1, wellness_queries
        assert captured.wellness_field("hrv").readings == ((TODAY, 61.0),), captured.wellness_field("hrv").readings
        assert captured.wellness_field("resting_hr").readings == ((TODAY, 49.0),), captured.wellness_field("resting_hr").readings
        assert all(
            day.observed_on != post_capture_day
            for day in captured.wellness.recovery_days
        ), captured.wellness.recovery_days
        print(
            "  observed rowid reuse: "
            f"queries={wellness_queries} captured={captured_max} "
            f"reused={reused_rowid} recovery_excluded={post_capture_day not in tuple(day.observed_on for day in captured.wellness.recovery_days)}",
        )

    scenarios: List[Tuple[str, Callable[[], None]]] = [
        ("ordinary valid public bytes are exact", ordinary_valid_public_bytes_are_exact),
        (
            "future metadata is absent",
            lambda: metadata_is_absent(
                (NOW.date() + timedelta(days=1)).isoformat(),
                "future",
            ),
        ),
        ("malformed metadata is absent", lambda: metadata_is_absent("not-a-date", "bad")),
        (
            "invalid calendar metadata is absent",
            lambda: metadata_is_absent("2026-02-30", "calendar"),
        ),
        ("non-string metadata is absent", lambda: metadata_is_absent(42, "integer")),
        ("invalid prior trend row is absent", invalid_prior_trend_row_is_absent),
        (
            "malformed rows cannot crowd out valid trend",
            malformed_rows_cannot_crowd_out_valid_trend,
        ),
        (
            "hostile then valid transition is clean",
            hostile_then_valid_transition_has_no_stale_leak,
        ),
        (
            "extreme succeeded_at degrades to missing",
            extreme_succeeded_at_degrades_to_missing,
        ),
        (
            "fresh weight with stale trend fields stays mixed",
            fresh_weight_with_stale_trend_fields_stays_mixed,
        ),
        (
            "concurrent appends stop at one statement snapshot",
            concurrent_appends_stop_at_one_statement_snapshot,
        ),
        (
            "rowid reuse after statement capture is excluded everywhere",
            rowid_reuse_after_statement_capture_is_excluded_everywhere,
        ),
    ]
    field_names: Tuple[WellnessFieldName, ...] = ("hrv", "resting_hr")
    for field_name in field_names:
        for value_label, value in (
            ("null", None),
            ("nan", float("nan")),
            ("text", "not-numeric"),
        ):
            for nudge in (False, True):
                scenarios.append(
                    (
                        f"{field_name} {value_label}, nudge {nudge}",
                        lambda field_name=field_name, value=value,
                        value_label=value_label, nudge=nudge:
                        non_finite_authoritative_value_is_missing(
                            field_name,
                            value,
                            value_label,
                            nudge,
                        ),
                    ),
                )

    failures: List[str] = []
    for label, scenario in scenarios:
        try:
            scenario()
            print(f"  ok  {label}")
        except (
            AssertionError,
            KeyError,
            OverflowError,
            TypeError,
            ValueError,
        ) as error:
            failure = f"{label}: {type(error).__name__}: {error}"
            failures.append(failure)
            print(f"  RED {failure}")
    assert not failures, "\n".join(failures)
    print("COUNSEL WELLNESS QUALIFICATION PASSED")


main()

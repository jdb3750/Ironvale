import math
from datetime import date, datetime, timedelta
from typing import Final, NamedTuple, Optional, Tuple

from . import db, sync_status
from .counsel_context_model import (
    RecoveryWellnessDay,
    WellnessField,
    WellnessFieldName,
    WellnessReading,
    WellnessSnapshot,
)


TREND_PRIOR_LIMIT: Final[int] = 28


class _QualifiedWellnessRow(NamedTuple):
    raw_observed_on: str
    observed_on: date
    hrv: Optional[float]
    resting_hr: Optional[float]
    sleep_secs: Optional[float]


def _qualified_date(
    value: Optional[str],
    current_day: date,
) -> Optional[date]:
    if value is None:
        return None
    try:
        observed_on = date.fromisoformat(value)
    except ValueError:
        return None
    return observed_on if observed_on <= current_day else None


def _finite_number(value: object) -> Optional[float]:
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
    ):
        return None
    numeric = float(value)
    return numeric if math.isfinite(numeric) else None


def _wellness_rows(current: datetime) -> Tuple[_QualifiedWellnessRow, ...]:
    rows = db.q(
        "SELECT date, hrv, resting_hr, sleep_secs FROM wellness",
    ).fetchall()
    current_day = current.date()
    qualified = []
    for row in rows:
        raw_observed_on = row["date"]
        if not isinstance(raw_observed_on, str):
            continue
        observed_on = _qualified_date(raw_observed_on, current_day)
        if observed_on is None:
            continue
        qualified.append(
            _QualifiedWellnessRow(
                raw_observed_on,
                observed_on,
                _finite_number(row["hrv"]),
                _finite_number(row["resting_hr"]),
                _finite_number(row["sleep_secs"]),
            ),
        )
    return tuple(qualified)


def _recovery_days(
    current: datetime,
    rows: Tuple[_QualifiedWellnessRow, ...],
) -> Tuple[RecoveryWellnessDay, ...]:
    cutoff = (current - timedelta(days=60)).date()
    return tuple(
        RecoveryWellnessDay(
            row.observed_on.isoformat(),
            row.hrv,
            row.resting_hr,
            row.sleep_secs,
        )
        for row in sorted(rows, key=lambda item: item.observed_on)
        if row.observed_on >= cutoff
    )


def qualified_recovery_days(
    current: datetime,
) -> Tuple[RecoveryWellnessDay, ...]:
    return _recovery_days(current, _wellness_rows(current))


def _field_is_fresh(
    succeeded: Optional[datetime],
    as_of: Optional[date],
    current: datetime,
) -> bool:
    if succeeded is None or as_of is None:
        return False
    age = current - succeeded
    return (
        timedelta(0) <= age <= timedelta(hours=48)
        and current.date() - timedelta(days=2) <= as_of <= current.date()
    )


def _aggregate_freshness(
    succeeded: Optional[datetime],
    observations: Tuple[date, ...],
    current: datetime,
) -> str:
    if succeeded is None or not observations:
        return "missing"
    age = current - succeeded
    fetch_is_recent = timedelta(0) <= age <= timedelta(hours=48)
    observation_is_recent = (
        max(observations) >= current.date() - timedelta(days=2)
    )
    return "fresh" if fetch_is_recent and observation_is_recent else "stale"


def _wellness_readings(
    name: WellnessFieldName,
    as_of: Optional[date],
    rows: Tuple[_QualifiedWellnessRow, ...],
) -> Tuple[Tuple[WellnessReading, ...], bool]:
    if as_of is None:
        return (), False
    as_of_value = as_of.isoformat()
    current_reading = None
    prior_readings = []
    for row in rows:
        value = row.hrv if name == "hrv" else row.resting_hr
        if row.observed_on > as_of or value is None:
            continue
        reading = WellnessReading(row.observed_on.isoformat(), value)
        if row.raw_observed_on == as_of_value:
            current_reading = reading
        elif row.observed_on < as_of:
            prior_readings.append(reading)
            prior_readings.sort(reverse=True)
            del prior_readings[TREND_PRIOR_LIMIT:]
    readings = (
        (current_reading,) + tuple(prior_readings)
        if current_reading is not None
        else tuple(prior_readings)
    )
    return readings, current_reading is not None


def _succeeded_at(
    value: Optional[str],
    current: datetime,
) -> Optional[datetime]:
    if value is None:
        return None
    try:
        succeeded = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if succeeded.tzinfo is None:
            succeeded = succeeded.replace(tzinfo=current.tzinfo)
        return succeeded.astimezone(current.tzinfo)
    except (OverflowError, ValueError):
        return None


def build_wellness_snapshot(
    status: sync_status.StreamStatus,
    current: datetime,
) -> WellnessSnapshot:
    current_day = current.date()
    succeeded = _succeeded_at(status["succeeded_at"], current)
    newest = _qualified_date(status["newest_observation_date"], current_day)
    field_dates = {
        name: _qualified_date(value, current_day)
        for name, value in status["field_as_of"].items()
    }
    rows = _wellness_rows(current)
    fields = []
    metadata_gap = False
    for name in ("hrv", "resting_hr"):
        as_of = field_dates[name]
        readings, current_value_is_valid = _wellness_readings(
            name,
            as_of,
            rows,
        )
        if not current_value_is_valid:
            metadata_gap = True
        fields.append(
            WellnessField(
                name,
                as_of.isoformat() if as_of is not None else None,
                current_value_is_valid
                and _field_is_fresh(
                    succeeded,
                    as_of,
                    current,
                ),
                readings,
            ),
        )
    return WellnessSnapshot(
        "missing"
        if metadata_gap
        else _aggregate_freshness(
            succeeded,
            tuple(
                observed_on
                for observed_on in field_dates.values()
                if observed_on is not None
            ),
            current,
        ),
        newest.isoformat() if newest is not None else None,
        tuple(fields),
        _recovery_days(current, rows),
    )

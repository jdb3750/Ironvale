import math
from datetime import date, datetime, timedelta
from typing import Final, Optional, Tuple

from . import db, sync_status
from .counsel_context_model import (
    RecoveryWellnessDay,
    WellnessField,
    WellnessFieldName,
    WellnessReading,
    WellnessSnapshot,
)


TREND_PRIOR_LIMIT: Final[int] = 28


def _finite_number(value: object) -> Optional[float]:
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
    ):
        return None
    numeric = float(value)
    return numeric if math.isfinite(numeric) else None


def qualified_recovery_days(
    current: datetime,
) -> Tuple[RecoveryWellnessDay, ...]:
    rows = db.q(
        "SELECT date, hrv, resting_hr, sleep_secs FROM wellness "
        "WHERE date >= ? ORDER BY date",
        ((current - timedelta(days=60)).date().isoformat(),),
    ).fetchall()
    return tuple(
        RecoveryWellnessDay(
            str(row["date"]),
            _finite_number(row["hrv"]),
            _finite_number(row["resting_hr"]),
            _finite_number(row["sleep_secs"]),
        )
        for row in rows
    )


def _field_is_fresh(
    succeeded_at: Optional[str],
    as_of: Optional[str],
    current: datetime,
) -> bool:
    if succeeded_at is None or as_of is None:
        return False
    try:
        succeeded = datetime.fromisoformat(succeeded_at.replace("Z", "+00:00"))
        observed_on = date.fromisoformat(as_of)
    except ValueError:
        return False
    if succeeded.tzinfo is None:
        succeeded = succeeded.replace(tzinfo=current.tzinfo)
    age = current - succeeded.astimezone(current.tzinfo)
    return (
        timedelta(0) <= age <= timedelta(hours=48)
        and current.date() - timedelta(days=2) <= observed_on <= current.date()
    )


def _aggregate_freshness(
    status: sync_status.StreamStatus,
    current: datetime,
) -> str:
    succeeded_value = status["succeeded_at"]
    if succeeded_value is None:
        return "missing"
    try:
        succeeded = datetime.fromisoformat(
            succeeded_value.replace("Z", "+00:00"),
        )
    except ValueError:
        return "missing"
    observations = []
    for value in status["field_as_of"].values():
        if value is None:
            continue
        try:
            observations.append(date.fromisoformat(value))
        except ValueError:
            continue
    if not observations:
        return "missing"
    if succeeded.tzinfo is None:
        succeeded = succeeded.replace(tzinfo=current.tzinfo)
    age = current - succeeded.astimezone(current.tzinfo)
    fetch_is_recent = timedelta(0) <= age <= timedelta(hours=48)
    observation_is_recent = (
        max(observations) >= current.date() - timedelta(days=2)
    )
    return "fresh" if fetch_is_recent and observation_is_recent else "stale"


def _wellness_readings(
    name: WellnessFieldName,
    as_of: Optional[str],
) -> Tuple[Tuple[WellnessReading, ...], bool]:
    if as_of is None:
        return (), False
    rows = db.q(
        f"SELECT date, {name} AS value FROM wellness "
        f"WHERE {name} IS NOT NULL AND date <= ? "
        "ORDER BY date DESC LIMIT ?",
        (as_of, TREND_PRIOR_LIMIT + 1),
    ).fetchall()
    readings = []
    current_value_is_valid = True
    for row in rows:
        observed_on = str(row["date"])
        raw_value = row["value"]
        if (
            not isinstance(raw_value, (int, float))
            or isinstance(raw_value, bool)
        ):
            if observed_on == as_of:
                current_value_is_valid = False
            continue
        value = float(raw_value)
        if not math.isfinite(value):
            if observed_on == as_of:
                current_value_is_valid = False
            continue
        readings.append(WellnessReading(observed_on, value))
    return tuple(readings), current_value_is_valid


def build_wellness_snapshot(
    status: sync_status.StreamStatus,
    current: datetime,
) -> WellnessSnapshot:
    fields = []
    metadata_gap = False
    for name in ("hrv", "resting_hr"):
        as_of = status["field_as_of"][name]
        readings, current_value_is_valid = _wellness_readings(name, as_of)
        if not current_value_is_valid:
            metadata_gap = True
        fields.append(
            WellnessField(
                name,
                as_of,
                current_value_is_valid
                and _field_is_fresh(
                    status["succeeded_at"],
                    as_of,
                    current,
                ),
                readings,
            ),
        )
    return WellnessSnapshot(
        "missing" if metadata_gap else _aggregate_freshness(status, current),
        status["newest_observation_date"],
        tuple(fields),
        qualified_recovery_days(current),
    )

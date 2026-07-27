import math
from datetime import date, datetime, timedelta
from typing import Dict, NamedTuple, Optional, Tuple

import pydantic

from . import db, exercises, game, syncing


LOWER_BODY_SET_GATE, TREND_PRIOR_MINIMUM, TREND_PRIOR_LIMIT = 6, 14, 28
JsonMap = Dict[str, pydantic.JsonValue]


class RuleState(NamedTuple):
    reason_codes: Tuple[str, ...]
    suppresses_hard: bool
    includes_rest: bool
    wellness_state: str
    lower_body_active: bool


class CandidateProvenance(NamedTuple):
    sources: Tuple[str, ...]
    activity_as_of: Optional[str]


def sync_status() -> JsonMap:
    return pydantic.parse_obj_as(JsonMap, syncing.get_sync_status())


def _local_datetime(value: str, current: datetime) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=current.tzinfo)
    return parsed.astimezone(current.tzinfo)


def _lower_body_proxy(current: datetime) -> Dict[str, pydantic.JsonValue]:
    cutoff = current - timedelta(hours=48)
    rows = db.q(
        "SELECT ts, exercise FROM lift_sets WHERE ts >= ? ORDER BY ts, exercise, id",
        (cutoff.date().isoformat(),),
    ).fetchall()
    matches = []
    for row in rows:
        local_time = _local_datetime(row["ts"], current)
        groups = exercises.groups_for(row["exercise"])
        if (
            local_time is not None
            and cutoff <= local_time <= current
            and any(group in ("legs", "posterior") for group in groups)
        ):
            matches.append(
                {
                    "ts": local_time.isoformat(timespec="seconds"),
                    "exercise": row["exercise"],
                },
            )
    return {
        "set_count": len(matches),
        "active": len(matches) >= LOWER_BODY_SET_GATE,
        "sets": matches,
    }


def _wellness_field_is_fresh(
    wellness: Dict[str, pydantic.JsonValue],
    field: str,
    current: datetime,
) -> bool:
    succeeded_value = wellness.get("succeeded_at")
    field_as_of = wellness.get("field_as_of")
    if not isinstance(succeeded_value, str) or not isinstance(field_as_of, dict):
        return False
    observed_value = field_as_of.get(field)
    if not isinstance(observed_value, str):
        return False
    try:
        succeeded_at = datetime.fromisoformat(succeeded_value.replace("Z", "+00:00"))
        observed_on = date.fromisoformat(observed_value)
    except ValueError:
        return False
    if succeeded_at.tzinfo is None:
        succeeded_at = succeeded_at.replace(tzinfo=current.tzinfo)
    age = current - succeeded_at.astimezone(current.tzinfo)
    return (
        timedelta(0) <= age <= timedelta(hours=48)
        and current.date() - timedelta(days=2) <= observed_on <= current.date()
    )


def _wellness_readings(
    field: str,
    field_as_of: Optional[str],
) -> Tuple[Tuple[str, float], ...]:
    if field_as_of is None:
        return ()
    column = {"hrv": "hrv", "resting_hr": "resting_hr"}[field]
    rows = db.q(
        f"SELECT date, {column} AS value FROM wellness "
        f"WHERE {column} IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT ?",
        (field_as_of, TREND_PRIOR_LIMIT + 1),
    ).fetchall()
    return tuple((row["date"], float(row["value"])) for row in rows)


def _nearest_rank(values: Tuple[float, ...], quantile: float) -> float:
    ordered = sorted(values)
    rank = max(1, math.ceil(quantile * len(ordered)))
    return ordered[rank - 1]


def _wellness_trend(sync: JsonMap, current: datetime) -> JsonMap:
    wellness_value = sync.get("wellness")
    wellness = wellness_value if isinstance(wellness_value, dict) else {}
    field_value = wellness.get("field_as_of")
    field_as_of = field_value if isinstance(field_value, dict) else {}
    freshness = {
        field: _wellness_field_is_fresh(wellness, field, current)
        for field in ("hrv", "resting_hr")
    }
    readings = {
        field: _wellness_readings(
            field,
            str(field_as_of.get(field))
            if isinstance(field_as_of.get(field), str)
            else None,
        )
        for field in ("hrv", "resting_hr")
    }
    enough_history = all(
        len(readings[field]) >= TREND_PRIOR_MINIMUM + 1
        for field in ("hrv", "resting_hr")
    )
    low_hrv = False
    high_resting_hr = False
    if all(freshness.values()) and enough_history:
        hrv_prior = tuple(value for _, value in readings["hrv"][1:])
        resting_prior = tuple(value for _, value in readings["resting_hr"][1:])
        low_hrv = readings["hrv"][0][1] <= _nearest_rank(hrv_prior, 0.25)
        high_resting_hr = readings["resting_hr"][0][1] >= _nearest_rank(
            resting_prior,
            0.75,
        )
    reason_codes = []
    if low_hrv:
        reason_codes.append("wellness_trend_low_hrv")
    if high_resting_hr:
        reason_codes.append("wellness_trend_high_resting_hr")
    if low_hrv and high_resting_hr:
        reason_codes.append("hard_suppressed_wellness_trend")
    freshness_payload: JsonMap = {
        field: value for field, value in freshness.items()
    }
    readings_payload: JsonMap = {
        field: [
            {"date": observed_on, "value": value}
            for observed_on, value in readings[field]
        ]
        for field in ("hrv", "resting_hr")
    }
    return {
        "field_fresh": freshness_payload,
        "readings": readings_payload,
        "reason_codes": reason_codes,
        "suppresses_hard": low_hrv and high_resting_hr,
    }


def _wellness_state(sync: JsonMap, trend: JsonMap) -> str:
    wellness_value = sync.get("wellness")
    wellness = wellness_value if isinstance(wellness_value, dict) else {}
    aggregate = wellness.get("freshness")
    if aggregate in ("missing", "stale"):
        return aggregate
    field_value = trend.get("field_fresh")
    field_fresh = field_value if isinstance(field_value, dict) else {}
    if field_fresh.get("hrv") is True and field_fresh.get("resting_hr") is True:
        return "fresh"
    return "mixed"


def _rule_state(current: datetime, snapshot: JsonMap) -> RuleState:
    trend = _wellness_trend(snapshot, current)
    wellness_state = _wellness_state(snapshot, trend)
    reason_codes = []
    wellness_suppresses = wellness_state != "fresh"
    if wellness_suppresses:
        reason_codes.append(
            {
                "missing": "wellness_data_missing",
                "stale": "wellness_data_stale",
                "mixed": "wellness_data_mixed",
            }[wellness_state],
        )
        reason_codes.append("hard_suppressed_wellness_unknown")
    trend_reasons = trend.get("reason_codes")
    if isinstance(trend_reasons, list):
        reason_codes.extend(
            reason for reason in trend_reasons if isinstance(reason, str)
        )
    lower_body = _lower_body_proxy(current)
    lower_body_active = bool(lower_body["active"])
    if lower_body_active:
        reason_codes.append("recent_lower_body_six_sets")
    trend_suppresses = bool(trend["suppresses_hard"])
    return RuleState(
        reason_codes=tuple(reason_codes),
        suppresses_hard=wellness_suppresses or trend_suppresses,
        includes_rest=wellness_suppresses or trend_suppresses or lower_body_active,
        wellness_state=wellness_state,
        lower_body_active=lower_body_active,
    )


def rule_state(
    current: Optional[datetime] = None,
    snapshot: Optional[JsonMap] = None,
) -> RuleState:
    status = snapshot if snapshot is not None else sync_status()
    return _rule_state(current or game.now(), status)


def source_disclosure(
    rules: Optional[RuleState] = None,
    snapshot: Optional[JsonMap] = None,
    provenance: Optional[CandidateProvenance] = None,
) -> Dict[str, pydantic.JsonValue]:
    status = snapshot if snapshot is not None else sync_status()
    state = rules or rule_state(snapshot=status)
    record = provenance or CandidateProvenance(("Iron Vale",), None)
    provider = " + ".join(record.sources)
    wellness_value = status.get("wellness")
    wellness = wellness_value if isinstance(wellness_value, dict) else {}
    return {
        "provider": provider,
        "activity_source": provider,
        "activity_as_of": record.activity_as_of,
        "wellness_as_of": wellness.get("newest_observation_date"),
        "wellness_freshness": state.wellness_state,
    }

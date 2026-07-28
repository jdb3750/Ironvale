import math
from datetime import datetime
from typing import Dict, NamedTuple, Optional, Tuple

import pydantic

from . import counsel_context


TREND_PRIOR_MINIMUM = 14
JsonMap = Dict[str, pydantic.JsonValue]


class RuleState(NamedTuple):
    reason_codes: Tuple[str, ...]
    suppresses_hard: bool
    includes_rest: bool
    wellness_state: str
    lower_body_active: bool


CandidateProvenance = counsel_context.CandidateProvenance


def _nearest_rank(values: Tuple[float, ...], quantile: float) -> float:
    ordered = sorted(values)
    rank = max(1, math.ceil(quantile * len(ordered)))
    return ordered[rank - 1]


def _wellness_trend(
    context: counsel_context.QualifiedTrainingContext,
) -> JsonMap:
    fields = {
        name: context.wellness_field(name)
        for name in ("hrv", "resting_hr")
    }
    readings = {
        name: fields[name].readings
        for name in ("hrv", "resting_hr")
    }
    enough_history = all(
        len(readings[name]) >= TREND_PRIOR_MINIMUM + 1
        for name in ("hrv", "resting_hr")
    )
    low_hrv = False
    high_resting_hr = False
    if all(field.fresh for field in fields.values()) and enough_history:
        hrv_prior = tuple(reading.value for reading in readings["hrv"][1:])
        resting_prior = tuple(
            reading.value for reading in readings["resting_hr"][1:]
        )
        low_hrv = readings["hrv"][0].value <= _nearest_rank(hrv_prior, 0.25)
        high_resting_hr = readings["resting_hr"][0].value >= _nearest_rank(
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
        name: field.fresh for name, field in fields.items()
    }
    readings_payload: JsonMap = {
        name: [
            {"date": reading.observed_on, "value": reading.value}
            for reading in readings[name]
        ]
        for name in ("hrv", "resting_hr")
    }
    return {
        "field_fresh": freshness_payload,
        "readings": readings_payload,
        "reason_codes": reason_codes,
        "suppresses_hard": low_hrv and high_resting_hr,
    }


def _wellness_state(
    context: counsel_context.QualifiedTrainingContext,
    trend: JsonMap,
) -> str:
    aggregate = context.wellness.aggregate_freshness
    if aggregate in ("missing", "stale"):
        return aggregate
    field_value = trend.get("field_fresh")
    field_fresh = field_value if isinstance(field_value, dict) else {}
    if field_fresh.get("hrv") is True and field_fresh.get("resting_hr") is True:
        return "fresh"
    return "mixed"


def _rule_state(
    context: counsel_context.QualifiedTrainingContext,
) -> RuleState:
    trend = _wellness_trend(context)
    wellness_state = _wellness_state(context, trend)
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
    lower_body_active = context.lower_body.active
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
    context: Optional[counsel_context.QualifiedTrainingContext] = None,
) -> RuleState:
    captured = context or counsel_context.assemble(current)
    return _rule_state(captured)


def source_disclosure(
    rules: Optional[RuleState] = None,
    context: Optional[counsel_context.QualifiedTrainingContext] = None,
    provenance: Optional[CandidateProvenance] = None,
) -> Dict[str, pydantic.JsonValue]:
    captured = context or counsel_context.assemble()
    state = rules or _rule_state(captured)
    record = provenance or CandidateProvenance(("Iron Vale",), None)
    provider = " + ".join(record.sources)
    return {
        "provider": provider,
        "activity_source": provider,
        "activity_as_of": record.activity_as_of,
        "wellness_as_of": captured.wellness.newest_observation_date,
        "wellness_freshness": state.wellness_state,
    }

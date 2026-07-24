import json
import math
from datetime import date, datetime, timedelta
from typing import Dict, Final, Literal, NamedTuple, Optional, Sequence, Tuple

import pydantic

from . import db, exercises, game, syncing


ACTIVITY_LOOKBACK_DAYS = 60
LOWER_BODY_SET_GATE = 6
TREND_PRIOR_MINIMUM = 14
TREND_PRIOR_LIMIT = 28
CounselMode = Literal["counsel", "self"]
VALID_ATTRIBUTION_MODES: Final[Dict[str, CounselMode]] = {"counsel": "counsel", "self": "self"}


class RuleState(NamedTuple):
    reason_codes: Tuple[str, ...]
    suppresses_hard: bool
    includes_rest: bool
    wellness_state: str


class Attribution(NamedTuple):
    mode: CounselMode
    offered_option_keys: Tuple[str, ...]
    chosen_option_key: str


class AttributionRecord(NamedTuple):
    quest_id: int
    mode: CounselMode
    accepted_at: str
    offered_option_keys: Tuple[str, ...]
    chosen_option_key: str


class AttributionValidationError(ValueError):
    field: str
    detail: str

    def __init__(self, field: str, detail: str) -> None:
        self.field = field
        self.detail = detail
        super().__init__(f"{field}: {detail}")


class AttributionDataError(ValueError):
    quest_id: int
    detail: str

    def __init__(self, quest_id: int, detail: str) -> None:
        self.quest_id = quest_id
        self.detail = detail
        super().__init__(f"quest {quest_id}: {detail}")


def validate_attribution(
    mode: str, offered_option_keys: Sequence[str], chosen_option_key: str
) -> Attribution:
    if not isinstance(mode, str):
        raise AttributionValidationError("mode", "must be counsel or self")
    try:
        parsed_mode = VALID_ATTRIBUTION_MODES[mode]
    except KeyError as exc:
        raise AttributionValidationError("mode", "must be counsel or self") from exc
    if isinstance(offered_option_keys, str):
        raise AttributionValidationError("offered_option_keys", "must be a non-empty list")
    keys = tuple(offered_option_keys)
    if not keys:
        raise AttributionValidationError("offered_option_keys", "must be a non-empty list")
    if any(not isinstance(key, str) or not key.strip() for key in keys):
        raise AttributionValidationError("offered_option_keys", "must contain only non-empty strings")
    if len(keys) != len(set(keys)):
        raise AttributionValidationError("offered_option_keys", "must be unique")
    if not isinstance(chosen_option_key, str) or not chosen_option_key.strip():
        raise AttributionValidationError("chosen_option_key", "must be a non-empty string")
    if chosen_option_key not in keys:
        raise AttributionValidationError("chosen_option_key", "must be one of the offered keys")
    return Attribution(parsed_mode, keys, chosen_option_key)


def insert_attribution(quest_id: int, accepted_at: str, attribution: Attribution) -> None:
    parsed = validate_attribution(
        attribution.mode, attribution.offered_option_keys, attribution.chosen_option_key
    )
    db.q(
        "INSERT INTO counsel_attributions "
        "(quest_id, mode, accepted_at, offered_option_keys, chosen_option_key) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            quest_id, parsed.mode, accepted_at,
            json.dumps(list(parsed.offered_option_keys), separators=(",", ":")),
            parsed.chosen_option_key,
        ),
    )


def get_attribution(quest_id: int) -> Optional[AttributionRecord]:
    row = db.q(
        "SELECT quest_id, mode, accepted_at, offered_option_keys, chosen_option_key "
        "FROM counsel_attributions WHERE quest_id=?",
        (quest_id,),
    ).fetchone()
    if row is None:
        return None
    try:
        raw_offered_keys = json.loads(row["offered_option_keys"])
    except (json.JSONDecodeError, TypeError) as exc:
        raise AttributionDataError(quest_id, "offered option keys are not valid JSON") from exc
    if not isinstance(raw_offered_keys, list):
        raise AttributionDataError(quest_id, "offered option keys are not a list")
    try:
        parsed = validate_attribution(row["mode"], raw_offered_keys, row["chosen_option_key"])
    except AttributionValidationError as exc:
        raise AttributionDataError(quest_id, str(exc)) from exc
    accepted_at = row["accepted_at"]
    if not isinstance(accepted_at, str) or not accepted_at:
        raise AttributionDataError(quest_id, "accepted timestamp is missing")
    return AttributionRecord(
        row["quest_id"], parsed.mode, accepted_at,
        parsed.offered_option_keys, parsed.chosen_option_key,
    )


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
            matches.append({"ts": local_time.isoformat(timespec="seconds"), "exercise": row["exercise"]})
    return {"set_count": len(matches), "active": len(matches) >= LOWER_BODY_SET_GATE, "sets": matches}


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
    return timedelta(0) <= age <= timedelta(hours=48) and current.date() - timedelta(days=2) <= observed_on <= current.date()


def _wellness_readings(field: str, field_as_of: Optional[str]) -> Tuple[Tuple[str, float], ...]:
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


def _wellness_trend(
    sync: Dict[str, pydantic.JsonValue],
    current: datetime,
) -> Dict[str, pydantic.JsonValue]:
    wellness = sync["wellness"]
    field_as_of = wellness["field_as_of"]
    freshness = {
        field: _wellness_field_is_fresh(wellness, field, current)
        for field in ("hrv", "resting_hr")
    }
    readings = {
        field: _wellness_readings(field, field_as_of[field])
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
        high_resting_hr = readings["resting_hr"][0][1] >= _nearest_rank(resting_prior, 0.75)
    reason_codes = []
    if low_hrv:
        reason_codes.append("wellness_trend_low_hrv")
    if high_resting_hr:
        reason_codes.append("wellness_trend_high_resting_hr")
    if low_hrv and high_resting_hr:
        reason_codes.append("hard_suppressed_wellness_trend")
    return {
        "field_fresh": freshness,
        "readings": {
            field: [{"date": observed_on, "value": value} for observed_on, value in readings[field]]
            for field in ("hrv", "resting_hr")
        },
        "reason_codes": reason_codes,
        "suppresses_hard": low_hrv and high_resting_hr,
    }


def _wellness_state(sync: Dict[str, pydantic.JsonValue], trend: Dict[str, pydantic.JsonValue]) -> str:
    aggregate = sync["wellness"]["freshness"]
    if aggregate in ("missing", "stale"):
        return aggregate
    field_fresh = trend["field_fresh"]
    if field_fresh["hrv"] and field_fresh["resting_hr"]:
        return "fresh"
    return "mixed"


def _rule_state(current: datetime) -> RuleState:
    sync = syncing.get_sync_status()
    trend = _wellness_trend(sync, current)
    wellness_state = _wellness_state(sync, trend)
    reason_codes = []
    wellness_suppresses = wellness_state != "fresh"
    if wellness_suppresses:
        reason_codes.append({
            "missing": "wellness_data_missing",
            "stale": "wellness_data_stale",
            "mixed": "wellness_data_mixed",
        }[wellness_state])
        reason_codes.append("hard_suppressed_wellness_unknown")
    reason_codes.extend(trend["reason_codes"])
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
    )


def rule_state(current: Optional[datetime] = None) -> RuleState:
    return _rule_state(current or game.now())


def source_disclosure(rules: Optional[RuleState] = None) -> Dict[str, pydantic.JsonValue]:
    state = rules or rule_state()
    sync = syncing.get_sync_status()
    return {
        "provider": "intervals.icu",
        "activity_source": "intervals.icu",
        "activity_as_of": sync["activity"]["newest_observation_date"],
        "wellness_as_of": sync["wellness"]["newest_observation_date"],
        "wellness_freshness": state.wellness_state,
    }

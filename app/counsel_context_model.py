import statistics
from datetime import datetime, timedelta
from typing import Final, Literal, NamedTuple, Optional, Tuple


TrainingKind = Literal["run", "ride", "swim", "climb", "iron", "recovery"]
WellnessFieldName = Literal["hrv", "resting_hr"]
ACTIVITY_LOOKBACK_DAYS: Final[int] = 60
LOWER_BODY_SET_GATE: Final[int] = 6


class CandidateProvenance(NamedTuple):
    sources: Tuple[str, ...]
    activity_as_of: Optional[str]


class QualifiedActivity(NamedTuple):
    activity_id: str
    source: str
    started_at: datetime
    activity_type: str
    training_kind: Optional[TrainingKind]
    moving_seconds: float


class ActivityHistory(NamedTuple):
    training_kind: TrainingKind
    session_count: int
    median_minutes: float
    p80_minutes: float
    latest_at: Optional[datetime]
    provenance: CandidateProvenance


class QualifiedLiftSet(NamedTuple):
    set_id: int
    occurred_at: datetime
    exercise: str
    equipment: str
    groups: Tuple[str, ...]
    weight: Optional[float]


class LoggedLiftMovement(NamedTuple):
    exercise: str
    equipment: str
    groups: Tuple[str, ...]
    latest_at: datetime
    latest_set_id: int
    latest_weight: Optional[float]


class LatestLiftWeight(NamedTuple):
    exercise: str
    weight: Optional[float]
    occurred_at: datetime
    set_id: int


class LowerBodyProxy(NamedTuple):
    set_count: int
    active: bool
    sets: Tuple[QualifiedLiftSet, ...]


class WellnessReading(NamedTuple):
    observed_on: str
    value: float


class RecoveryWellnessDay(NamedTuple):
    observed_on: str
    hrv: Optional[float]
    resting_hr: Optional[float]
    sleep_secs: Optional[float]


class WellnessField(NamedTuple):
    name: WellnessFieldName
    as_of: Optional[str]
    fresh: bool
    readings: Tuple[WellnessReading, ...]


class WellnessSnapshot(NamedTuple):
    aggregate_freshness: str
    newest_observation_date: Optional[str]
    fields: Tuple[WellnessField, ...]
    recovery_days: Tuple[RecoveryWellnessDay, ...]


class QualifiedTrainingContext(NamedTuple):
    current: datetime
    timezone: str
    ambition_multiplier: float
    declared_focuses: Tuple[str, ...]
    activities: Tuple[QualifiedActivity, ...]
    histories: Tuple[ActivityHistory, ...]
    lift_sets: Tuple[QualifiedLiftSet, ...]
    lift_movements: Tuple[LoggedLiftMovement, ...]
    latest_lift_weights: Tuple[LatestLiftWeight, ...]
    iron_session_count: int
    lower_body: LowerBodyProxy
    wellness: WellnessSnapshot

    def history(self, training_kind: TrainingKind) -> ActivityHistory:
        return next(
            item
            for item in self.histories
            if item.training_kind == training_kind
        )

    def latest_weight(self, exercise: str) -> Optional[float]:
        return next(
            (
                item.weight
                for item in self.latest_lift_weights
                if item.exercise == exercise
            ),
            None,
        )

    def wellness_field(self, name: WellnessFieldName) -> WellnessField:
        return next(item for item in self.wellness.fields if item.name == name)


def build_history(
    activities: Tuple[QualifiedActivity, ...],
    training_kind: TrainingKind,
    default: float,
) -> ActivityHistory:
    matching = tuple(
        activity
        for activity in activities
        if activity.training_kind == training_kind
    )
    minutes = sorted(activity.moving_seconds / 60.0 for activity in matching)
    if not minutes:
        return ActivityHistory(
            training_kind,
            0,
            default,
            default + 5.0,
            None,
            CandidateProvenance(("Iron Vale starter guidance",), None),
        )
    p80_index = min(len(minutes) - 1, int(len(minutes) * 0.8))
    latest = max(activity.started_at for activity in matching)
    sources = tuple(dict.fromkeys(activity.source for activity in matching))
    return ActivityHistory(
        training_kind,
        len(minutes),
        float(statistics.median(minutes)),
        float(minutes[p80_index]),
        latest,
        CandidateProvenance(sources, latest.date().isoformat()),
    )


def summarize_lifts(
    lifts: Tuple[QualifiedLiftSet, ...],
    current: datetime,
    supported_equipment: Tuple[str, ...],
) -> Tuple[
    Tuple[LoggedLiftMovement, ...],
    Tuple[LatestLiftWeight, ...],
    int,
    LowerBodyProxy,
]:
    latest = {}
    for row in lifts:
        previous = latest.get(row.exercise)
        if previous is None or (row.occurred_at, row.set_id) > (
            previous.occurred_at,
            previous.set_id,
        ):
            latest[row.exercise] = row
    weights = tuple(
        LatestLiftWeight(row.exercise, row.weight, row.occurred_at, row.set_id)
        for row in sorted(
            latest.values(),
            key=lambda value: (value.occurred_at, value.set_id),
            reverse=True,
        )
    )
    cutoff = current - timedelta(days=ACTIVITY_LOOKBACK_DAYS)
    recent = tuple(
        row
        for row in lifts
        if row.occurred_at >= cutoff and row.equipment in supported_equipment
    )
    recent_latest = {}
    for row in recent:
        previous = recent_latest.get(row.exercise)
        if previous is None or (row.occurred_at, row.set_id) > (
            previous.occurred_at,
            previous.set_id,
        ):
            recent_latest[row.exercise] = row
    movements = tuple(
        LoggedLiftMovement(
            row.exercise,
            row.equipment,
            row.groups,
            row.occurred_at,
            row.set_id,
            row.weight,
        )
        for row in sorted(
            recent_latest.values(),
            key=lambda value: (value.occurred_at, value.set_id),
            reverse=True,
        )
    )
    lower_cutoff = current - timedelta(hours=48)
    lower_sets = tuple(
        row
        for row in lifts
        if row.occurred_at >= lower_cutoff
        and any(group in ("legs", "posterior") for group in row.groups)
    )
    return (
        movements,
        weights,
        len({row.occurred_at.date() for row in recent}),
        LowerBodyProxy(
            len(lower_sets),
            len(lower_sets) >= LOWER_BODY_SET_GATE,
            lower_sets,
        ),
    )

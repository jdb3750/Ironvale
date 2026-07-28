import math
from datetime import datetime, timedelta
from typing import Dict, Final, Optional, Tuple

from . import counsel_wellness, db, exercises, game, intervals
from .counsel_context_model import (
    ACTIVITY_LOOKBACK_DAYS as ACTIVITY_LOOKBACK_DAYS,
    ActivityHistory as ActivityHistory,
    CandidateProvenance as CandidateProvenance,
    QualifiedActivity as QualifiedActivity,
    QualifiedLiftSet as QualifiedLiftSet,
    QualifiedTrainingContext as QualifiedTrainingContext,
    TrainingKind as TrainingKind,
    WellnessField as WellnessField,
    WellnessFieldName as WellnessFieldName,
    WellnessReading as WellnessReading,
    WellnessSnapshot as WellnessSnapshot,
    build_history,
    summarize_lifts,
)


ACTIVITY_KINDS: Final[Dict[str, TrainingKind]] = {
    "run": "run",
    "ride": "ride",
    "swim": "swim",
    "climb": "climb",
    "strength": "iron",
    "mobility": "recovery",
}
HISTORY_DEFAULTS: Final[Dict[TrainingKind, float]] = {
    "run": 20.0,
    "ride": 40.0,
    "swim": 20.0,
    "climb": 60.0,
    "iron": 20.0,
    "recovery": 20.0,
}


def _local_datetime(value: str, current: datetime) -> Optional[datetime]:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=current.tzinfo)
    return parsed.astimezone(current.tzinfo)


# If a row cannot inform sizing, it cannot inform anything else either.
def _qualified_activities(current: datetime) -> Tuple[QualifiedActivity, ...]:
    cutoff = current - timedelta(days=ACTIVITY_LOOKBACK_DAYS)
    rows = db.q(
        "SELECT id, source, start, type, moving_time FROM activities "
        "WHERE source='intervals.icu' ORDER BY start, id",
    ).fetchall()
    qualified = []
    for row in rows:
        start = row["start"]
        duration = row["moving_time"]
        if (
            not isinstance(start, str)
            or not isinstance(duration, (int, float))
            or isinstance(duration, bool)
        ):
            continue
        local_time = _local_datetime(start, current)
        moving_seconds = float(duration)
        if (
            local_time is None
            or not math.isfinite(moving_seconds)
            or moving_seconds <= 0
            or local_time < cutoff
            or local_time > current
        ):
            continue
        activity_type = str(row["type"])
        qualified.append(
            QualifiedActivity(
                str(row["id"]),
                str(row["source"]),
                local_time,
                activity_type,
                ACTIVITY_KINDS.get(game.category(activity_type)),
                moving_seconds,
            ),
        )
    return tuple(qualified)


def _qualified_lifts(current: datetime) -> Tuple[QualifiedLiftSet, ...]:
    rows = db.q(
        "SELECT id, ts, exercise, weight FROM lift_sets ORDER BY ts, exercise, id",
    ).fetchall()
    qualified = []
    for row in rows:
        timestamp = row["ts"]
        exercise = row["exercise"]
        if not isinstance(timestamp, str) or not isinstance(exercise, str):
            continue
        local_time = _local_datetime(timestamp, current)
        catalog = exercises.EXERCISES.get(exercise)
        if local_time is None or local_time > current or catalog is None:
            continue
        raw_weight = row["weight"]
        weight = (
            float(raw_weight)
            if isinstance(raw_weight, (int, float))
            and not isinstance(raw_weight, bool)
            and math.isfinite(float(raw_weight))
            else None
        )
        qualified.append(
            QualifiedLiftSet(
                int(row["id"]),
                local_time,
                exercise,
                str(catalog["equipment"]),
                tuple(exercises.groups_for(exercise)),
                weight,
            ),
        )
    return tuple(qualified)


def assemble(
    current: Optional[datetime] = None,
) -> QualifiedTrainingContext:
    captured = current or game.now()
    activities = _qualified_activities(captured)
    lifts = _qualified_lifts(captured)
    movements, weights, sessions, lower_body = summarize_lifts(
        lifts,
        captured,
        tuple(game.GIVER_ARCHETYPES["kettlebell"]["modalities"]),
    )
    return QualifiedTrainingContext(
        captured,
        str(captured.tzinfo),
        game.ambition_mult(),
        activities,
        tuple(
            build_history(
                activities,
                training_kind,
                HISTORY_DEFAULTS[training_kind],
            )
            for training_kind in (
                "run",
                "ride",
                "swim",
                "climb",
                "iron",
                "recovery",
            )
        ),
        lifts,
        movements,
        weights,
        sessions,
        lower_body,
        counsel_wellness.build_wellness_snapshot(
            intervals.get_sync_status()["wellness"],
            captured,
        ),
    )

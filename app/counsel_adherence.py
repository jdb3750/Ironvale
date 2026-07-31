from datetime import datetime, timedelta
from typing import Mapping, NamedTuple, Optional, Sequence, Union

from . import db, game


ScheduleSlot = Mapping[str, Union[str, bool]]
CounselSchedule = Mapping[str, Sequence[ScheduleSlot]]


class ScheduleAdherence(NamedTuple):
    done: int
    planned: int


def current_week(
    schedule: Optional[CounselSchedule],
    current: datetime,
) -> Optional[ScheduleAdherence]:
    if schedule is None:
        return None
    elapsed_days = game.COUNSEL_SCHEDULE_DAYS[: current.weekday() + 1]
    # Current-week boundary: the denominator deliberately reads the mutable live
    # template. Editing intent changes this week; never extend this into history
    # without persisting historical intent, or later edits would rewrite the past.
    planned = sum(
        slot.get("optional") is False
        for day in elapsed_days
        for slot in schedule.get(day, ())
    )
    if planned == 0:
        return None
    week_start = current.date() - timedelta(days=current.weekday())
    week_end = week_start + timedelta(days=7)
    # Attribution migration boundary: legacy NULL rows predate this flag and are
    # required paths; only an explicit true value removes a completion.
    row = db.q(
        "SELECT COUNT(*) AS n FROM counsel_attributions AS attribution "
        "JOIN quests AS quest ON quest.id=attribution.quest_id "
        "WHERE attribution.mode='schedule' "
        "AND COALESCE(attribution.optional, 0)=0 "
        "AND quest.status='done' "
        "AND substr(quest.completed_at, 1, 10)>=? "
        "AND substr(quest.completed_at, 1, 10)<?",
        (week_start.isoformat(), week_end.isoformat()),
    ).fetchone()
    return ScheduleAdherence(int(row["n"]), planned)

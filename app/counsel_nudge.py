from typing import Dict, Final, Optional

import pydantic

from . import counsel_context, counsel_rules, game


PRIMARY_CADENCE_DAYS, SECONDARY_CADENCE_DAYS = 2, 4
FOCUS_KIND: Final[Dict[str, counsel_context.TrainingKind]] = {
    "run": "run",
    "ride": "ride",
    "swim": "swim",
    "climb": "climb",
    "iron": "iron",
    "recovery": "recovery",
}
JsonMap = Dict[str, pydantic.JsonValue]


def _giver_for_focus(focus: str) -> str:
    modality = "climbing" if focus == "climb" else focus
    return next(
        giver
        for giver, ownership in game.GIVER_ARCHETYPES.items()
        if modality in ownership["modalities"]
        or focus.casefold() == ownership["archetype"].casefold()
    )


def _days_since_practice(
    context: counsel_context.QualifiedTrainingContext,
) -> Dict[str, int]:
    days: Dict[str, int] = {}
    for focus, training_kind in FOCUS_KIND.items():
        latest = context.history(training_kind).latest_at
        if latest is not None:
            days[focus] = (context.current.date() - latest.date()).days
    return days


def _line(
    mode: str,
    focus: str,
    days_since: int,
    reason: str,
    focus_days: Dict[str, int],
) -> str:
    giver = "mobility" if focus == "recovery" else _giver_for_focus(focus)
    name = game.GIVERS[giver]["name"]
    if reason == "strain":
        return f"The omens counsel rest today. {name}'s willow shades the way."
    if mode == "considered":
        return f"The council points to {name}'s door today. The path is chosen; go."
    freshest = min(
        focus_days,
        key=lambda candidate: (
            focus_days[candidate],
            game.COUNSEL_FOCUSES.index(candidate),
        ),
    )
    if freshest != focus:
        return (
            f"The {freshest} has seen you of late; the {focus} has not in "
            f"{days_since} day{'s' if days_since != 1 else ''}. {name} keeps that path."
        )
    return (
        f"It has been {days_since} day{'s' if days_since != 1 else ''} since the "
        f"{focus}. {name} keeps that path."
    )


def _payload(
    mode: str,
    focus: str,
    days_since: int,
    reason: str,
    focus_days: Dict[str, int],
) -> JsonMap:
    giver = "mobility" if focus == "recovery" else _giver_for_focus(focus)
    return {
        "focus": focus,
        "giver": giver,
        "giver_name": game.GIVERS[giver]["name"],
        "days_since": days_since,
        "reason": reason,
        "line": _line(mode, focus, days_since, reason, focus_days),
    }


def daily_nudge(
    context: Optional[counsel_context.QualifiedTrainingContext] = None,
) -> Optional[JsonMap]:
    captured = context or counsel_context.assemble()
    settings = game.get_settings()
    if not settings["counsel_nudge_enabled"]:
        return None
    mode = settings["counsel_mode"]
    practiced = _days_since_practice(captured)
    focus_days = {
        focus: days
        for focus, days in practiced.items()
        if focus in game.COUNSEL_FOCUSES
    }
    if (
        "hard_suppressed_wellness_trend"
        in counsel_rules.rule_state(context=captured).reason_codes
        and "recovery" in practiced
    ):
        return _payload(mode, "recovery", practiced["recovery"], "strain", focus_days)
    if not focus_days:
        return None

    charter = settings["counsel_charter"]
    primary = charter["primary"] if charter else None
    secondary = tuple(charter["secondary"]) if charter else ()
    declared = tuple(dict.fromkeys((primary, *secondary)))
    declared_practiced = tuple(focus for focus in declared if focus in focus_days)
    if declared_practiced:
        def overdue(focus: str) -> int:
            cadence = (
                PRIMARY_CADENCE_DAYS
                if focus == primary
                else SECONDARY_CADENCE_DAYS
            )
            return focus_days[focus] - cadence

        best = min(
            declared_practiced,
            key=lambda focus: (
                -overdue(focus),
                game.COUNSEL_FOCUSES.index(focus),
            ),
        )
        if overdue(best) < 0:
            return None
        return _payload(mode, best, focus_days[best], "cadence", focus_days)

    stalest = min(
        focus_days,
        key=lambda focus: (
            -focus_days[focus],
            game.COUNSEL_FOCUSES.index(focus),
        ),
    )
    return _payload(mode, stalest, focus_days[stalest], "balance", focus_days)

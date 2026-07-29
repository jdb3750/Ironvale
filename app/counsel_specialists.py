import random
from datetime import timedelta
from typing import Dict, Final, NamedTuple, Optional, Tuple

from . import counsel_context, exercises, programs, quests
from .counsel_options import OptionDraft, TierMeta, draft_option, with_reason


class IronHistory(NamedTuple):
    exercises: Tuple[str, ...]
    weights: Tuple[Optional[float], ...]
    focus: Tuple[str, ...]
    session_count: int
    provenance: counsel_context.CandidateProvenance


IRON_TIERS: Final[Dict[str, TierMeta]] = {
    "volume": TierMeta(
        "volume",
        "Lighter loads and higher repetitions.",
        ("lighter_load", "higher_reps"),
    ),
    "circuit": TierMeta(
        "circuit",
        "Brisk transitions with moderate loads.",
        ("brisk_transitions", "moderate_load"),
    ),
    "strength": TierMeta(
        "strength",
        "Heavy loads and low repetitions.",
        ("heavy_load", "low_reps"),
    ),
}
RECOVERY_TIERS: Final[Tuple[TierMeta, ...]] = (
    TierMeta("restore", "Restore range and breath.", ("gentle_recovery",)),
    TierMeta(
        "move",
        "Easy movement without a training demand.",
        ("easy_movement",),
    ),
    TierMeta("unwind", "Unwind what training tightened.", ("mobility",)),
)


def _iron_exercises(
    context: counsel_context.QualifiedTrainingContext,
) -> IronHistory:
    iron_rows = context.lift_movements
    equipment = context.iron_equipment or (
        iron_rows[0].equipment if iron_rows else "kettlebell"
    )
    valid = [
        row
        for row in iron_rows
        if row.equipment == equipment
    ]
    source_rows = valid if context.iron_equipment else iron_rows
    names = []
    for row in valid:
        if row.exercise not in names:
            names.append(row.exercise)
    names.extend(
        name
        for name, exercise in exercises.EXERCISES.items()
        if exercise["equipment"] == equipment and name not in names
    )
    chosen = tuple(names[:4])
    # Bodyweight history sizes Strength but never implies an external load.
    weights = tuple(
        None
        if exercises.EXERCISES[name]["equipment"] == "bodyweight"
        else context.latest_weight(name)
        for name in chosen
    )
    focus_source = (
        tuple(group for row in valid for group in row.groups)
        if valid
        else tuple(
            group
            for name in chosen
            for group in exercises.groups_for(name)
        )
    )
    session_count = context.iron_session_count
    if context.iron_equipment is not None:
        cutoff = context.current - timedelta(
            days=counsel_context.ACTIVITY_LOOKBACK_DAYS,
        )
        session_count = len(
            {
                row.occurred_at.date()
                for row in context.lift_sets
                if row.occurred_at >= cutoff and row.equipment == equipment
            },
        )
    return IronHistory(
        chosen,
        weights,
        tuple(dict.fromkeys(focus_source))[:3],
        session_count,
        counsel_context.CandidateProvenance(
            (
                ("Iron Vale lift ledger",)
                if source_rows
                else ("Iron Vale starter guidance",)
            ),
            source_rows[0].latest_at.date().isoformat() if source_rows else None,
        ),
    )


def iron(
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    program = programs.build_program_offer(
        "kettlebell",
        context.latest_weight,
        context.current.date().isoformat(),
    )
    if program is not None:
        key = programs.active_program(
            "kettlebell",
            context.current.date().isoformat(),
        )
        progression = {
            "source": "doctrine",
            "key": key,
            "session": program["title"],
        }
        routine_value = program.get("routine")
        routine = routine_value if isinstance(routine_value, list) else []
        names = tuple(
            str(row["exercise"])
            for row in routine
            if isinstance(row, dict) and isinstance(row.get("exercise"), str)
        )
        doctrine_matches_today = True
        if context.iron_equipment is not None:
            # Today's implement plus bodyweight are performable; an unknown
            # movement cannot be promised and waits with the doctrine.
            available_today = {context.iron_equipment, "bodyweight"}
            doctrine_matches_today = all(
                exercises.EXERCISES.get(name, {}).get("equipment")
                in available_today
                for name in names
            )
        target_groups = tuple(
            dict.fromkeys(
                group for name in names for group in exercises.groups_for(name)
            ),
        )
        if doctrine_matches_today:
            draft = OptionDraft(
                f"doctrine:{key}",
                program,
                TierMeta(
                    "doctrine",
                    "The selected doctrine's next session.",
                    ("progression",),
                ),
                target_groups,
                counsel_context.CandidateProvenance(("Iron Vale doctrine",), None),
                progression,
            )
            return (
                with_reason(draft, "equipment_today")
                if context.iron_equipment
                else draft,
            )
    history = _iron_exercises(context)
    drafts = tuple(
        draft_option(
            quests.build_lift_candidate(
                quests.LiftCandidateContext(
                    "kettlebell",
                    style,
                    history.focus,
                    history.exercises,
                    history.weights,
                    history.session_count,
                ),
            ),
            IRON_TIERS[style],
            history.provenance,
        )
        for style in ("volume", "circuit", "strength")
    )
    if context.iron_equipment is None:
        return drafts
    narrowed = tuple(with_reason(draft, "equipment_today") for draft in drafts)
    if program is None:
        return narrowed
    return tuple(
        with_reason(draft, "doctrine_equipment_mismatch")
        for draft in narrowed
    )


def mobility(
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    writ = quests.rest_writ_offer_for_context(
        context.wellness,
        context.current,
    )
    if writ is not None:
        return (
            OptionDraft(
                f"rest:{writ['writ_day']}",
                writ,
                TierMeta(
                    "rest-writ",
                    "Keep the existing Rest Writ.",
                    ("rest",),
                ),
                (),
                counsel_context.CandidateProvenance(
                    ("Iron Vale Rest Writ",),
                    str(writ["writ_day"]),
                ),
            ),
        )
    generated = quests.gen_mobility_offers(
        random.Random(
            f"counsel:mobility:{context.current.date().isoformat()}",
        ),
    )
    return tuple(
        OptionDraft(
            f"mobility:{index}:{offer['target_minutes']}:{offer['structure']}",
            offer,
            RECOVERY_TIERS[index],
            (),
            counsel_context.CandidateProvenance(
                ("Iron Vale recovery archive",),
                None,
            ),
        )
        for index, offer in enumerate(generated)
    )

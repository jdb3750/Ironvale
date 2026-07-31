from typing import NamedTuple, Optional, Tuple

from . import (
    counsel_candidates,
    counsel_context,
    counsel_rules,
    db,
    exercises,
    game,
    programs,
)
from .counsel_options import OptionDraft, TierMeta, with_reason


class ScheduledDrafts(NamedTuple):
    drafts: Tuple[OptionDraft, ...]
    hard_was_suppressed: bool
    status: Optional[str]


def considered_drafts(
    drafts: Tuple[OptionDraft, ...],
    rules: counsel_rules.RuleState,
) -> Tuple[Tuple[OptionDraft, ...], bool]:
    if len(drafts) <= 1:
        return drafts, False
    eligible = tuple(
        draft
        for draft in drafts
        if draft.payload["intensity"] != "hard"
        or (
            not rules.suppresses_hard
            and not (
                rules.lower_body_active
                and any(
                    group in ("legs", "posterior")
                    for group in draft.target_groups
                )
            )
        )
    )
    return eligible[-1:], len(eligible) != len(drafts)


def _slot_giver(slot: counsel_context.CounselScheduleSlot) -> Optional[str]:
    if slot.routine is not None:
        return programs.scheduled_routine_giver(slot.routine)
    if slot.modality is not None:
        return game.COUNSEL_FOCUS_GIVERS[slot.modality]
    return None


def _accepted_today(giver: str, current_date: str) -> int:
    # Schedule-consumption invariant: each accepted quest advances only its giver's authored lane.
    row = db.q(
        "SELECT COUNT(*) AS n FROM quests "
        "WHERE giver=? AND substr(accepted_at, 1, 10)=?",
        (giver, current_date),
    ).fetchone()
    return int(row["n"])


def _current_slot(
    giver: str,
    context: counsel_context.QualifiedTrainingContext,
) -> Optional[counsel_context.CounselScheduleSlot]:
    routed = tuple(
        slot
        for slot in context.schedule_slots
        if _slot_giver(slot) == giver
    )
    consumed = _accepted_today(giver, context.current.date().isoformat())
    return routed[consumed] if consumed < len(routed) else None


def next_planned_slot(
    context: counsel_context.QualifiedTrainingContext,
) -> Optional[counsel_context.CounselScheduleSlot]:
    if any(
        slot.modality is None and slot.routine is None
        for slot in context.schedule_slots
    ):
        return None
    consumed = {
        giver: _accepted_today(giver, context.current.date().isoformat())
        for giver in game.OFFERABLE_GIVERS
    }
    seen = {giver: 0 for giver in game.OFFERABLE_GIVERS}
    for slot in context.schedule_slots:
        giver = _slot_giver(slot)
        if giver not in seen:
            continue
        if seen[giver] >= consumed[giver]:
            return slot
        seen[giver] += 1
    return None


def _routine_draft(
    slot: counsel_context.CounselScheduleSlot,
    context: counsel_context.QualifiedTrainingContext,
) -> Optional[OptionDraft]:
    key = slot.routine
    if key is None:
        return None
    giver = programs.scheduled_routine_giver(key)
    if giver is None:
        return None
    offer = programs.build_scheduled_routine_offer(
        key,
        giver,
        context.latest_weight,
    )
    if offer is None:
        return None
    rows = offer.get("routine")
    routine = rows if isinstance(rows, list) else []
    names = tuple(
        str(row["exercise"])
        for row in routine
        if isinstance(row, dict) and isinstance(row.get("exercise"), str)
    )
    target_groups = tuple(
        dict.fromkeys(
            group
            for name in names
            for group in exercises.groups_for(name)
        ),
    )
    return OptionDraft(
        f"schedule:{key}",
        offer,
        TierMeta(
            "doctrine",
            "The routine written into today's plan.",
            ("progression",),
        ),
        target_groups,
        counsel_context.CandidateProvenance(("Iron Vale weekly plan",), None),
        {
            "source": "schedule",
            "key": key,
            "session": offer["title"],
        },
    )


def _closest_tier(
    planned: str,
    drafts: Tuple[OptionDraft, ...],
    tier_order: Tuple[str, ...],
) -> OptionDraft:
    planned_index = tier_order.index(planned)
    return min(
        drafts,
        key=lambda draft: (
            abs(tier_order.index(draft.tier.label) - planned_index),
            tier_order.index(draft.tier.label),
        ),
    )


def _sized_draft(
    slot: counsel_context.CounselScheduleSlot,
    context: counsel_context.QualifiedTrainingContext,
    rules: counsel_rules.RuleState,
) -> OptionDraft:
    modality = slot.modality
    planned = slot.tier
    if modality is None or planned is None:
        raise ValueError("A sized weekly path must name its modality and effort.")
    drafts = counsel_candidates.scheduled_modality(modality, context)
    tier_order = game.COUNSEL_SCHEDULE_TIERS[modality]
    selected = next(
        (draft for draft in drafts if draft.tier.label == planned),
        None,
    )
    tier_unavailable = selected is None
    if selected is None:
        selected = _closest_tier(planned, drafts, tier_order)
    lower_body_relevant = (
        rules.lower_body_active
        and any(
            group in ("legs", "posterior")
            for group in selected.target_groups
        )
    )
    if (
        selected.payload["intensity"] == "hard"
        and (rules.suppresses_hard or lower_body_relevant)
    ):
        selected_index = tier_order.index(selected.tier.label)
        steadier = tuple(
            draft
            for draft in drafts
            if tier_order.index(draft.tier.label) < selected_index
        )
        if steadier:
            selected = with_reason(
                max(
                    steadier,
                    key=lambda draft: tier_order.index(draft.tier.label),
                ),
                "schedule_hard_downgrade",
            )
    if tier_unavailable:
        selected = with_reason(selected, "schedule_tier_unavailable")
    return selected


def resolve(
    giver: str,
    context: counsel_context.QualifiedTrainingContext,
    rules: counsel_rules.RuleState,
) -> ScheduledDrafts:
    if any(
        slot.modality is None and slot.routine is None
        for slot in context.schedule_slots
    ):
        drafts, suppressed = considered_drafts(
            counsel_candidates.for_giver(giver, context),
            rules,
        )
        return ScheduledDrafts(drafts, suppressed, None)
    slot = _current_slot(giver, context)
    if slot is None:
        return ScheduledDrafts((), False, "no_slot_today")
    if slot.routine is not None:
        routine = _routine_draft(slot, context)
        return ScheduledDrafts(
            (routine,) if routine is not None else (),
            False,
            None if routine is not None else "no_slot_today",
        )
    if slot.tier is not None:
        return ScheduledDrafts(
            (_sized_draft(slot, context, rules),),
            False,
            None,
        )
    if slot.modality == "strength":
        drafts = counsel_candidates.for_giver(giver, context)
    else:
        modality = slot.modality
        if modality is None:
            raise ValueError("An open weekly path lost its modality.")
        drafts = counsel_candidates.scheduled_modality(modality, context)
    considered, suppressed = considered_drafts(drafts, rules)
    return ScheduledDrafts(considered, suppressed, None)

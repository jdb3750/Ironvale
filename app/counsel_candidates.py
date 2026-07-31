import hashlib
import json
from typing import Dict, Final, Literal, NamedTuple, Tuple

import pydantic

from . import counsel_context, game, quests
from .counsel_options import (
    GameMode as GameMode,
    OptionContext as OptionContext,
    OptionDraft as OptionDraft,
    TierMeta as TierMeta,
    draft_option as draft_option,
    with_reason as with_reason,
)


FennModality = Literal["run", "ride", "swim", "climb"]
FENN_MODALITIES: Final[Tuple[FennModality, ...]] = (
    "run",
    "ride",
    "swim",
    "climb",
)


ENDURANCE_TIERS: Final[Dict[str, TierMeta]] = {
    "easy": TierMeta("easy", "Easy, conversational work.", ("easy_effort",)),
    "steady": TierMeta("steady", "Steady, comfortable work.", ("steady_effort",)),
    "quality": TierMeta("quality", "Purposeful quality work.", ("quality_effort",)),
    "long": TierMeta("long", "Long, patient endurance work.", ("long_effort",)),
}
CLIMB_TIERS: Final[Dict[str, TierMeta]] = {
    "technique": TierMeta("technique", "Deliberate movement practice.", ("easy_moves", "skill_focus")),
    "volume": TierMeta("volume", "More sub-limit climbing.", ("sub_limit", "more_moves")),
    "session": TierMeta("limit-session", "Fresh attempts near the limit.", ("limit_attempts",)),
}


class _FennChoice(NamedTuple):
    modality: FennModality
    narrowed_by_focus: bool


def _endurance_modality(
    context: counsel_context.QualifiedTrainingContext,
) -> _FennChoice:
    """Pick the one activity-shaped road Fenn offers today.

    Walking to Fenn's hut asks for his work, not for a specific modality, so
    the charter decides which of run/ride/swim/climb he may name. Without one —
    or when it names none of the roads actually practiced — this falls back to
    the least-recently-practiced road, because focus narrows and never gates.
    """
    histories = {
        modality: context.history(modality)
        for modality in FENN_MODALITIES
    }
    practiced: list[FennModality] = [
        modality
        for modality in FENN_MODALITIES
        if histories[modality].session_count > 0
    ]
    if not practiced:
        return _FennChoice("run", False)
    declared: list[FennModality] = [
        modality
        for modality in practiced
        if modality in context.declared_focuses
    ]
    eligible: list[FennModality] = declared or practiced
    return _FennChoice(
        min(
            eligible,
            key=lambda modality: histories[modality].latest_at or context.current,
        ),
        len(eligible) != len(practiced),
    )


def _endurance(
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    modality, narrowed = _endurance_modality(context)
    drafts = (
        _climb(context)
        if modality == "climb"
        else _endurance_road(context, modality)
    )
    if not narrowed:
        return drafts
    return tuple(with_reason(draft, "focus_charter") for draft in drafts)


def _endurance_road(
    context: counsel_context.QualifiedTrainingContext,
    modality: quests.EnduranceModality,
) -> Tuple[OptionDraft, ...]:
    history = context.history(modality)
    candidates = quests.build_endurance_candidates(
        modality,
        quests.CandidateHistory(
            history.session_count,
            history.median_minutes,
            history.p80_minutes,
        ),
        context.ambition_multiplier,
    )
    easy = next(candidate for candidate in candidates if str(candidate.payload["kind"]).endswith("_easy"))
    steady = next(candidate for candidate in candidates if str(candidate.payload["kind"]).endswith("_steady"))
    quality = next(candidate for candidate in candidates if candidate.payload["intensity"] == "hard")
    return (
        draft_option(easy, ENDURANCE_TIERS["easy"], history.provenance),
        draft_option(steady, ENDURANCE_TIERS["steady"], history.provenance),
        draft_option(quality, ENDURANCE_TIERS["quality"], history.provenance),
    )


def scheduled_modality(
    modality: str,
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    from . import counsel_specialists

    if modality == "strength":
        return counsel_specialists.generic_iron(context)
    if modality == "rest":
        return counsel_specialists.mobility(context)
    if modality == "climb":
        return _climb(context)
    if modality not in ("run", "ride", "swim"):
        raise ValueError(f"No Council candidate builder serves {modality!r}.")
    history = context.history(modality)
    candidates = quests.build_endurance_candidates(
        modality,
        quests.CandidateHistory(
            history.session_count,
            history.median_minutes,
            history.p80_minutes,
        ),
        context.ambition_multiplier,
    )
    by_tier = {}
    for candidate in candidates:
        tier = (
            "quality"
            if candidate.payload["intensity"] == "hard"
            else str(candidate.payload["kind"]).split("_", 1)[1]
        )
        if tier not in by_tier:
            by_tier[tier] = candidate
    return tuple(
        draft_option(
            by_tier[tier],
            ENDURANCE_TIERS[tier],
            history.provenance,
        )
        for tier in ("easy", "steady", "quality", "long")
        if tier in by_tier
    )


def _climb(
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    history = context.history("climb")
    candidates = quests.build_climb_candidates(
        quests.CandidateHistory(
            history.session_count,
            history.median_minutes,
            history.p80_minutes,
        ),
        context.ambition_multiplier,
    )
    # The shared candidate builder keeps Bram's historical payload; only live
    # Council climb offers cross this ownership boundary to Fenn.
    candidates = tuple(
        quests.QuestCandidate(
            candidate.candidate_key,
            {**candidate.payload, "giver": "endurance"},
            candidate.target_groups,
        )
        for candidate in candidates
    )
    by_variant = {
        str(candidate.payload["kind"]).split("_", 1)[1]: candidate
        for candidate in candidates
    }
    return tuple(
        draft_option(
            by_variant[variant],
            CLIMB_TIERS[variant],
            history.provenance,
        )
        for variant in ("technique", "volume", "session")
    )


def for_giver(
    giver: str,
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    from . import counsel_specialists

    if giver not in game.OFFERABLE_GIVERS:
        raise ValueError(f"{game.GIVERS[giver]['name']} no longer sets quests.")
    builder = {
        "Endurance": _endurance,
        "Strength": counsel_specialists.iron,
        "Recovery": counsel_specialists.mobility,
    }[game.GIVER_ARCHETYPES[giver]["archetype"]]
    return builder(context)


def finalize(draft: OptionDraft, context: OptionContext) -> Dict[str, pydantic.JsonValue]:
    candidate_reasons = draft.payload.get("reason_codes", [])
    reasons = list(candidate_reasons) if isinstance(candidate_reasons, list) else []
    reasons.extend(context.rule_reasons)
    if context.hard_was_suppressed:
        reasons.append("hard_option_suppressed")
    warning = (
        (
            context.mode == "self"
            or (context.mode == "scheduled" and draft.progression is not None)
        )
        and context.rules_suppress_hard
        and draft.payload["intensity"] == "hard"
    )
    if warning:
        reasons.append("hard_option_wellness_warning")
    option = {
        **draft.payload,
        "candidate_key": draft.candidate_key,
        "counsel_mode": context.mode,
        "tier_label": draft.tier.label,
        "tier_detail": draft.tier.detail,
        "tier_cues": list(draft.tier.cues),
        "reason_codes": list(dict.fromkeys(reasons)),
        "source": context.source,
        "wellness_warning": warning,
    }
    if draft.progression is not None:
        option["progression"] = draft.progression
    encoded = json.dumps(
        {"giver": option["giver"], "mode": context.mode, "option": option},
        sort_keys=True,
        separators=(",", ":"),
    )
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    option_key = f"{option['giver']}:{context.mode}:{draft.tier.label}:{digest[:20]}"
    return {**option, "option_key": option_key, "offer_id": int(digest[:13], 16)}

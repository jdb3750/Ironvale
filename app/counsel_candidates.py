import hashlib
import json
from typing import Dict, Final, Tuple

import pydantic

from . import counsel_context, game, quests
from .counsel_options import (
    GameMode as GameMode,
    OptionContext as OptionContext,
    OptionDraft as OptionDraft,
    TierMeta as TierMeta,
    draft_option as draft_option,
)


ENDURANCE_MODALITIES: Final[Tuple[quests.EnduranceModality, ...]] = (
    "run",
    "ride",
    "swim",
)


ENDURANCE_TIERS: Final[Dict[str, TierMeta]] = {
    "easy": TierMeta("easy", "Easy, conversational work.", ("easy_effort",)),
    "steady": TierMeta("steady", "Steady, comfortable work.", ("steady_effort",)),
    "quality": TierMeta("quality", "Purposeful quality work.", ("quality_effort",)),
}
CLIMB_TIERS: Final[Dict[str, TierMeta]] = {
    "technique": TierMeta("technique", "Deliberate movement practice.", ("easy_moves", "skill_focus")),
    "volume": TierMeta("volume", "More sub-limit climbing.", ("sub_limit", "more_moves")),
    "session": TierMeta("limit-session", "Fresh attempts near the limit.", ("limit_attempts",)),
}


def _endurance_modality(
    context: counsel_context.QualifiedTrainingContext,
) -> quests.EnduranceModality:
    histories = {
        modality: context.history(modality)
        for modality in ENDURANCE_MODALITIES
    }
    practiced: list[quests.EnduranceModality] = [
        modality
        for modality in ENDURANCE_MODALITIES
        if histories[modality].session_count > 0
    ]
    if not practiced:
        return "run"
    return min(
        practiced,
        key=lambda modality: histories[modality].latest_at or context.current,
    )


def _endurance(
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[OptionDraft, ...]:
    modality = _endurance_modality(context)
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

    builder = {
        "Endurance": _endurance,
        "Iron": counsel_specialists.iron,
        "Skill": _climb,
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
        context.mode == "self"
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

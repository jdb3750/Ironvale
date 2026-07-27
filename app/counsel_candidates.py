import hashlib
import json
from typing import Dict, Final, Tuple

import pydantic

from . import counsel_rules, game, quests
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
def _activity_provenance(history) -> counsel_rules.CandidateProvenance:
    rows = tuple(row for row in history["rows"] if row["moving_time"])
    sources = tuple(
        dict.fromkeys(str(row["source"]) for row in rows if row["source"])
    )
    latest = max(
        (str(row["start"])[:10] for row in rows if row["start"]),
        default=None,
    )
    return counsel_rules.CandidateProvenance(
        sources or ("Iron Vale starter guidance",),
        latest,
    )


def _endurance_modality() -> quests.EnduranceModality:
    histories = {
        modality: game.modality_history(
            modality,
            default_median=int(quests.STARTER_MEDIANS[modality]),
        )
        for modality in ENDURANCE_MODALITIES
    }
    practiced: list[quests.EnduranceModality] = [
        modality
        for modality in ENDURANCE_MODALITIES
        if histories[modality]["n"] > 0
    ]
    if not practiced:
        return "run"
    return min(
        practiced,
        key=lambda modality: histories[modality]["rows"][-1]["start"],
    )


def _endurance() -> Tuple[OptionDraft, ...]:
    modality = _endurance_modality()
    history = game.modality_history(
        modality,
        default_median=int(quests.STARTER_MEDIANS[modality]),
    )
    candidates = quests.build_endurance_candidates(
        modality,
        quests.CandidateHistory(
            history["n"],
            history["median"],
            history["p80"],
        ),
        game.ambition_mult(),
    )
    provenance = _activity_provenance(history)
    easy = next(candidate for candidate in candidates if str(candidate.payload["kind"]).endswith("_easy"))
    steady = next(candidate for candidate in candidates if str(candidate.payload["kind"]).endswith("_steady"))
    quality = next(candidate for candidate in candidates if candidate.payload["intensity"] == "hard")
    return (
        draft_option(easy, ENDURANCE_TIERS["easy"], provenance),
        draft_option(steady, ENDURANCE_TIERS["steady"], provenance),
        draft_option(quality, ENDURANCE_TIERS["quality"], provenance),
    )


def _climb() -> Tuple[OptionDraft, ...]:
    history = game.modality_history("climb", default_median=60)
    candidates = quests.build_climb_candidates(
        quests.CandidateHistory(
            history["n"],
            history["median"],
            history["p80"],
        ),
        game.ambition_mult(),
    )
    by_variant = {
        str(candidate.payload["kind"]).split("_", 1)[1]: candidate
        for candidate in candidates
    }
    return tuple(
        draft_option(
            by_variant[variant],
            CLIMB_TIERS[variant],
            _activity_provenance(history),
        )
        for variant in ("technique", "volume", "session")
    )


def for_giver(giver: str) -> Tuple[OptionDraft, ...]:
    from . import counsel_specialists

    builder = {
        "Endurance": _endurance,
        "Iron": counsel_specialists.iron,
        "Skill": _climb,
        "Recovery": counsel_specialists.mobility,
    }[game.GIVER_ARCHETYPES[giver]["archetype"]]
    return builder()


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

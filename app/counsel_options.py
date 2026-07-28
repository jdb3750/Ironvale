from typing import Dict, Literal, NamedTuple, Optional, Tuple

import pydantic

from . import counsel_context, quests


GameMode = Literal["considered", "self"]


class TierMeta(NamedTuple):
    label: str
    detail: str
    cues: Tuple[str, ...]


class OptionDraft(NamedTuple):
    candidate_key: str
    payload: Dict[str, pydantic.JsonValue]
    tier: TierMeta
    target_groups: Tuple[str, ...]
    provenance: counsel_context.CandidateProvenance
    progression: Optional[Dict[str, pydantic.JsonValue]] = None


class OptionContext(NamedTuple):
    mode: GameMode
    rule_reasons: Tuple[str, ...]
    source: Dict[str, pydantic.JsonValue]
    rules_suppress_hard: bool
    hard_was_suppressed: bool


def with_reason(draft: OptionDraft, code: str) -> OptionDraft:
    """Record why the field of offers was narrowed, so 'why this path' can say so."""
    existing = draft.payload.get("reason_codes", [])
    codes = list(existing) if isinstance(existing, list) else []
    if code in codes:
        return draft
    return draft._replace(
        payload={**draft.payload, "reason_codes": [*codes, code]},
    )


def draft_option(
    candidate: quests.QuestCandidate,
    tier: TierMeta,
    provenance: counsel_context.CandidateProvenance,
) -> OptionDraft:
    return OptionDraft(
        candidate.candidate_key,
        dict(candidate.payload),
        tier,
        candidate.target_groups,
        provenance,
    )

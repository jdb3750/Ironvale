from typing import Dict, NamedTuple, Optional, Tuple

import pydantic

from . import counsel_candidates, counsel_context, counsel_rules, game, quests
from .counsel_rules import (
    RuleState as RuleState,
    rule_state as rule_state,
    source_disclosure as source_disclosure,
)
from .counsel_attribution import (
    Attribution as Attribution,
    AttributionDataError as AttributionDataError,
    AttributionRecord as AttributionRecord,
    AttributionValidationError as AttributionValidationError,
    get_attribution as get_attribution,
    insert_attribution as insert_attribution,
    validate_attribution as validate_attribution,
)


class OptionIdentity(NamedTuple):
    option_key: Optional[str]
    offer_id: Optional[int]


class OfferValidationError(ValueError):
    pass


def _game_mode_for_date(current_date: Optional[str]) -> counsel_candidates.GameMode:
    mode = game.get_settings(current_date)["counsel_mode"]
    if mode == "considered":
        return "considered"
    if mode == "self":
        return "self"
    raise OfferValidationError("Choose one of the available game loops.")


def _game_mode() -> counsel_candidates.GameMode:
    return _game_mode_for_date(None)


def _giver_options(
    giver: str,
    mode: counsel_candidates.GameMode,
    context: counsel_context.QualifiedTrainingContext,
) -> Tuple[Dict[str, pydantic.JsonValue], ...]:
    if giver not in game.GIVER_ARCHETYPES:
        raise OfferValidationError("No such quest-giver.")
    rules = counsel_rules.rule_state(context=context)
    drafts = counsel_candidates.for_giver(giver, context)
    hard_suppressed = False
    if mode == "considered" and len(drafts) > 1:
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
        hard_suppressed = len(eligible) != len(drafts)
        drafts = eligible[-1:]
    return tuple(
        counsel_candidates.finalize(
            draft,
            counsel_candidates.OptionContext(
                mode,
                rules.reason_codes,
                counsel_rules.source_disclosure(
                    rules,
                    context,
                    draft.provenance,
                ),
                rules.suppresses_hard,
                hard_suppressed,
            ),
        )
        for draft in drafts
    )


def giver_options(giver: str) -> Tuple[Dict[str, pydantic.JsonValue], ...]:
    if giver not in game.GIVER_ARCHETYPES:
        raise OfferValidationError("No such quest-giver.")
    context = counsel_context.assemble()
    return _giver_options(
        giver,
        _game_mode_for_date(context.current.date().isoformat()),
        context,
    )


def accept_current_option(giver: str, identity: OptionIdentity) -> int:
    mode = _game_mode()
    if giver not in game.GIVER_ARCHETYPES:
        raise OfferValidationError("No such quest-giver.")
    for active in quests.active_quests():
        if active["giver"] == giver:
            name = game.GIVERS[giver]["name"]
            raise OfferValidationError(
                f"You already carry a quest from {name}. Finish or abandon it first.",
            )
    context = counsel_context.assemble()
    current = _giver_options(giver, mode, context)
    chosen = next(
        (
            option
            for option in current
            if (identity.option_key is None or option["option_key"] == identity.option_key)
            and (identity.offer_id is None or option["offer_id"] == identity.offer_id)
        ),
        None,
    )
    if chosen is None:
        raise OfferValidationError("That offer has faded.")
    attribution = validate_attribution(
        "counsel" if mode == "considered" else "self",
        tuple(str(option["option_key"]) for option in current),
        str(chosen["option_key"]),
    )
    return quests.create_quest_from_offer(giver, chosen, attribution)

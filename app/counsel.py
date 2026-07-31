from typing import Dict, NamedTuple, Optional, Tuple

import pydantic

from . import (
    counsel_candidates,
    counsel_context,
    counsel_rules,
    game,
    quests,
)
from .counsel_schedule import (
    considered_drafts as considered_schedule_drafts,
    current_slot as current_schedule_slot,
    resolve as resolve_schedule,
)
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


class GiverOfferResult(NamedTuple):
    options: Tuple[Dict[str, pydantic.JsonValue], ...]
    schedule_status: Optional[str]


class OfferValidationError(ValueError):
    pass


def _giver_options(
    giver: str,
    mode: counsel_candidates.GameMode,
    context: counsel_context.QualifiedTrainingContext,
) -> GiverOfferResult:
    if giver not in game.GIVERS:
        raise OfferValidationError("No such quest-giver.")
    if giver not in game.OFFERABLE_GIVERS:
        raise OfferValidationError(f"{game.GIVERS[giver]['name']} no longer sets quests.")
    rules = counsel_rules.rule_state(context=context)
    drafts = counsel_candidates.for_giver(giver, context)
    hard_suppressed = False
    schedule_status = None
    if mode == "scheduled":
        scheduled = resolve_schedule(giver, context, rules)
        drafts = scheduled.drafts
        hard_suppressed = scheduled.hard_was_suppressed
        schedule_status = scheduled.status
    elif mode == "considered":
        drafts, hard_suppressed = considered_schedule_drafts(
            drafts,
            rules,
        )
    return GiverOfferResult(
        tuple(
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
        ),
        schedule_status,
    )


def giver_offer_result(giver: str) -> GiverOfferResult:
    if giver not in game.GIVERS:
        raise OfferValidationError("No such quest-giver.")
    if giver not in game.OFFERABLE_GIVERS:
        raise OfferValidationError(f"{game.GIVERS[giver]['name']} no longer sets quests.")
    context = counsel_context.assemble()
    return _giver_options(
        giver,
        context.counsel_mode,
        context,
    )


def giver_options(giver: str) -> Tuple[Dict[str, pydantic.JsonValue], ...]:
    return giver_offer_result(giver).options


def accept_current_option(giver: str, identity: OptionIdentity) -> int:
    if giver not in game.GIVERS:
        raise OfferValidationError("No such quest-giver.")
    if giver not in game.OFFERABLE_GIVERS:
        raise OfferValidationError(f"{game.GIVERS[giver]['name']} no longer sets quests.")
    for active in quests.active_quests():
        if active["giver"] == giver:
            name = game.GIVERS[giver]["name"]
            raise OfferValidationError(
                f"You already carry a quest from {name}. Finish or abandon it first.",
            )
    context = counsel_context.assemble()
    mode = context.counsel_mode
    schedule_slot = (
        current_schedule_slot(giver, context)
        if mode == "scheduled"
        else None
    )
    current = _giver_options(giver, mode, context).options
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
        {
            "considered": "counsel",
            "self": "self",
            "scheduled": "schedule",
        }[mode],
        tuple(str(option["option_key"]) for option in current),
        str(chosen["option_key"]),
    )
    if schedule_slot is not None:
        attribution = attribution._replace(optional=schedule_slot.optional)
    return quests.create_quest_from_offer(giver, chosen, attribution)

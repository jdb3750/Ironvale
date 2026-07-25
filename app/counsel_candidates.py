import hashlib
import json
import random
from datetime import timedelta
from typing import Dict, Final, Literal, NamedTuple, Optional, Tuple

import pydantic

from . import db, exercises, game, programs, quests


GameMode = Literal["considered", "self"]
ENDURANCE_MODALITIES: Final[Tuple[quests.EnduranceModality, ...]] = (
    "run",
    "ride",
    "swim",
)


class TierMeta(NamedTuple):
    label: str
    detail: str
    cues: Tuple[str, ...]


class OptionDraft(NamedTuple):
    candidate_key: str
    payload: Dict[str, pydantic.JsonValue]
    tier: TierMeta
    progression: Optional[Dict[str, pydantic.JsonValue]] = None


class OptionContext(NamedTuple):
    mode: GameMode
    rule_reasons: Tuple[str, ...]
    source: Dict[str, pydantic.JsonValue]
    rules_suppress_hard: bool
    hard_was_suppressed: bool


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
IRON_TIERS: Final[Dict[str, TierMeta]] = {
    "volume": TierMeta("volume", "Lighter loads and higher repetitions.", ("lighter_load", "higher_reps")),
    "circuit": TierMeta("circuit", "Brisk transitions with moderate loads.", ("brisk_transitions", "moderate_load")),
    "strength": TierMeta("strength", "Heavy loads and low repetitions.", ("heavy_load", "low_reps")),
}
RECOVERY_TIERS: Final[Tuple[TierMeta, ...]] = (
    TierMeta("restore", "Restore range and breath.", ("gentle_recovery",)),
    TierMeta("move", "Easy movement without a training demand.", ("easy_movement",)),
    TierMeta("unwind", "Unwind what training tightened.", ("mobility",)),
)


def _draft(candidate: quests.QuestCandidate, tier: TierMeta) -> OptionDraft:
    return OptionDraft(candidate.candidate_key, dict(candidate.payload), tier)


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
    easy = next(candidate for candidate in candidates if str(candidate.payload["kind"]).endswith("_easy"))
    steady = next(candidate for candidate in candidates if str(candidate.payload["kind"]).endswith("_steady"))
    quality = next(candidate for candidate in candidates if candidate.payload["intensity"] == "hard")
    return (
        _draft(easy, ENDURANCE_TIERS["easy"]),
        _draft(steady, ENDURANCE_TIERS["steady"]),
        _draft(quality, ENDURANCE_TIERS["quality"]),
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
        _draft(by_variant[variant], CLIMB_TIERS[variant])
        for variant in ("technique", "volume", "session")
    )


def _iron_exercises() -> Tuple[Tuple[str, ...], Tuple[Optional[float], ...], int]:
    cutoff = (game.now() - timedelta(days=60)).date().isoformat()
    rows = db.q(
        "SELECT exercise, weight, ts FROM lift_sets WHERE ts >= ? "
        "ORDER BY ts DESC, id DESC",
        (cutoff,),
    ).fetchall()
    iron_rows = [
        row
        for row in rows
        if row["exercise"] in exercises.EXERCISES
        and exercises.EXERCISES[row["exercise"]]["equipment"]
        in game.GIVER_ARCHETYPES["kettlebell"]["modalities"]
    ]
    equipment = (
        exercises.EXERCISES[iron_rows[0]["exercise"]]["equipment"]
        if iron_rows
        else "kettlebell"
    )
    valid = [
        row
        for row in iron_rows
        if exercises.EXERCISES[row["exercise"]]["equipment"] == equipment
    ]
    names = []
    for row in valid:
        if row["exercise"] not in names:
            names.append(row["exercise"])
    names.extend(
        name
        for name, exercise in exercises.EXERCISES.items()
        if exercise["equipment"] == equipment and name not in names
    )
    chosen = tuple(names[:4])
    weights = tuple(game.last_weight(name) for name in chosen)
    return chosen, weights, len({row["ts"][:10] for row in iron_rows})


def _iron() -> Tuple[OptionDraft, ...]:
    program = programs.build_program_offer("kettlebell")
    if program is not None:
        key = programs.active_program("kettlebell")
        progression = {"source": "doctrine", "key": key, "session": program["title"]}
        return (
            OptionDraft(
                f"doctrine:{key}",
                program,
                TierMeta("doctrine", "The selected doctrine's next session.", ("progression",)),
                progression,
            ),
        )
    names, weights, session_count = _iron_exercises()
    focus = tuple(
        dict.fromkeys(
            group
            for name in names
            for group in exercises.groups_for(name)
        )
    )[:3]
    return tuple(
        _draft(
            quests.build_lift_candidate(
                quests.LiftCandidateContext(
                    "kettlebell",
                    style,
                    focus,
                    names,
                    weights,
                    session_count,
                ),
            ),
            IRON_TIERS[style],
        )
        for style in ("volume", "circuit", "strength")
    )


def _mobility() -> Tuple[OptionDraft, ...]:
    writ = quests.rest_writ_offer()
    if writ is not None:
        return (
            OptionDraft(
                f"rest:{writ['writ_day']}",
                writ,
                TierMeta("rest-writ", "Keep the existing Rest Writ.", ("rest",)),
            ),
        )
    generated = quests.gen_mobility_offers(
        random.Random(f"counsel:mobility:{game.today()}"),
    )
    return tuple(
        OptionDraft(
            f"mobility:{index}:{offer['target_minutes']}:{offer['structure']}",
            offer,
            RECOVERY_TIERS[index],
        )
        for index, offer in enumerate(generated)
    )


def for_giver(giver: str) -> Tuple[OptionDraft, ...]:
    builder = {
        "running": _endurance,
        "kettlebell": _iron,
        "strength": _climb,
        "mobility": _mobility,
    }[giver]
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

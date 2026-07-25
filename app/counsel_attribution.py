import json
from typing import Dict, Final, Literal, NamedTuple, Optional, Sequence, Tuple

from . import db


CounselMode = Literal["counsel", "self"]
VALID_ATTRIBUTION_MODES: Final[Dict[str, CounselMode]] = {
    "counsel": "counsel",
    "self": "self",
}


class Attribution(NamedTuple):
    mode: CounselMode
    offered_option_keys: Tuple[str, ...]
    chosen_option_key: str


class AttributionRecord(NamedTuple):
    quest_id: int
    mode: CounselMode
    accepted_at: str
    offered_option_keys: Tuple[str, ...]
    chosen_option_key: str


class AttributionValidationError(ValueError):
    field: str
    detail: str

    def __init__(self, field: str, detail: str) -> None:
        self.field = field
        self.detail = detail
        super().__init__(f"{field}: {detail}")


class AttributionDataError(ValueError):
    quest_id: int
    detail: str

    def __init__(self, quest_id: int, detail: str) -> None:
        self.quest_id = quest_id
        self.detail = detail
        super().__init__(f"quest {quest_id}: {detail}")


def validate_attribution(
    mode: str,
    offered_option_keys: Sequence[str],
    chosen_option_key: str,
) -> Attribution:
    if not isinstance(mode, str):
        raise AttributionValidationError("mode", "must be counsel or self")
    try:
        parsed_mode = VALID_ATTRIBUTION_MODES[mode]
    except KeyError as exc:
        raise AttributionValidationError("mode", "must be counsel or self") from exc
    if isinstance(offered_option_keys, str):
        raise AttributionValidationError(
            "offered_option_keys",
            "must be a non-empty list",
        )
    keys = tuple(offered_option_keys)
    if not keys:
        raise AttributionValidationError(
            "offered_option_keys",
            "must be a non-empty list",
        )
    if any(not isinstance(key, str) or not key.strip() for key in keys):
        raise AttributionValidationError(
            "offered_option_keys",
            "must contain only non-empty strings",
        )
    if len(keys) != len(set(keys)):
        raise AttributionValidationError(
            "offered_option_keys",
            "must be unique",
        )
    if not isinstance(chosen_option_key, str) or not chosen_option_key.strip():
        raise AttributionValidationError(
            "chosen_option_key",
            "must be a non-empty string",
        )
    if chosen_option_key not in keys:
        raise AttributionValidationError(
            "chosen_option_key",
            "must be one of the offered keys",
        )
    return Attribution(parsed_mode, keys, chosen_option_key)


def insert_attribution(
    quest_id: int,
    accepted_at: str,
    attribution: Attribution,
) -> None:
    parsed = validate_attribution(
        attribution.mode,
        attribution.offered_option_keys,
        attribution.chosen_option_key,
    )
    db.q(
        "INSERT INTO counsel_attributions "
        "(quest_id, mode, accepted_at, offered_option_keys, chosen_option_key) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            quest_id,
            parsed.mode,
            accepted_at,
            json.dumps(list(parsed.offered_option_keys), separators=(",", ":")),
            parsed.chosen_option_key,
        ),
    )


def get_attribution(quest_id: int) -> Optional[AttributionRecord]:
    row = db.q(
        "SELECT quest_id, mode, accepted_at, offered_option_keys, chosen_option_key "
        "FROM counsel_attributions WHERE quest_id=?",
        (quest_id,),
    ).fetchone()
    if row is None:
        return None
    try:
        raw_offered_keys = json.loads(row["offered_option_keys"])
    except (json.JSONDecodeError, TypeError) as exc:
        raise AttributionDataError(
            quest_id,
            "offered option keys are not valid JSON",
        ) from exc
    if not isinstance(raw_offered_keys, list):
        raise AttributionDataError(quest_id, "offered option keys are not a list")
    try:
        parsed = validate_attribution(
            row["mode"],
            raw_offered_keys,
            row["chosen_option_key"],
        )
    except AttributionValidationError as exc:
        raise AttributionDataError(quest_id, str(exc)) from exc
    accepted_at = row["accepted_at"]
    if not isinstance(accepted_at, str) or not accepted_at:
        raise AttributionDataError(quest_id, "accepted timestamp is missing")
    return AttributionRecord(
        row["quest_id"],
        parsed.mode,
        accepted_at,
        parsed.offered_option_keys,
        parsed.chosen_option_key,
    )

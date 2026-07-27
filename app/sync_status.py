from typing import Dict, Literal, Optional, Tuple

from typing_extensions import NotRequired, TypedDict


class StreamStatus(TypedDict):
    revision: int
    attempted_at: Optional[str]
    succeeded_at: Optional[str]
    newest_observation_date: Optional[str]
    field_as_of: Dict[str, Optional[str]]
    error: Optional[str]
    freshness: NotRequired[str]


class SyncStatus(TypedDict):
    revision: int
    activity: StreamStatus
    wellness: StreamStatus


StreamName = Literal["activity", "wellness"]


def _revision(value) -> int:
    return (
        value
        if isinstance(value, int) and not isinstance(value, bool) and value >= 0
        else 0
    )


def _stream(saved, stream: StreamName, fields: Tuple[str, ...]) -> StreamStatus:
    source = saved.get(stream)
    if not isinstance(source, dict):
        source = {}
    field_as_of = source.get("field_as_of")
    if not isinstance(field_as_of, dict):
        field_as_of = {}
    return {
        "revision": _revision(source.get("revision")),
        "attempted_at": (
            source.get("attempted_at")
            if isinstance(source.get("attempted_at"), str)
            else None
        ),
        "succeeded_at": (
            source.get("succeeded_at")
            if isinstance(source.get("succeeded_at"), str)
            else None
        ),
        "newest_observation_date": (
            source.get("newest_observation_date")
            if isinstance(source.get("newest_observation_date"), str)
            else None
        ),
        "field_as_of": {
            field: (
                field_as_of.get(field)
                if isinstance(field_as_of.get(field), str)
                else None
            )
            for field in fields
        },
        "error": (
            source.get("error")
            if isinstance(source.get("error"), str)
            else None
        ),
    }


def normalize(
    value,
    activity_fields: Tuple[str, ...],
    wellness_fields: Tuple[str, ...],
) -> SyncStatus:
    saved = value if isinstance(value, dict) else {}
    return {
        "revision": _revision(saved.get("revision")),
        "activity": _stream(saved, "activity", activity_fields),
        "wellness": _stream(saved, "wellness", wellness_fields),
    }

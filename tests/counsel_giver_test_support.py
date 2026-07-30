import atexit
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RoutineRow(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    exercise: str
    suggest_weight: Optional[float]


class ProgressionDetail(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    key: str


class SourceDisclosure(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    provider: str
    activity_source: str
    activity_as_of: Optional[str]
    wellness_as_of: Optional[str]
    wellness_freshness: str


class QuestOption(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    kind: str
    giver: str
    option_key: str
    offer_id: int
    tier_label: str
    tier_detail: str
    tier_cues: list[str]
    counsel_mode: str
    reason_codes: list[str]
    source: SourceDisclosure
    wellness_warning: bool
    intensity: str
    xp: int
    gold: int
    vigor: int
    modality: Optional[str] = None
    sizing: Optional[str] = None
    routine: list[RoutineRow] = Field(default_factory=list)
    program: bool = False
    progression: Optional[ProgressionDetail] = None


class ActiveQuest(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    id: int
    details: QuestOption


class OfferResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="ignore", frozen=True)

    offers: list[QuestOption]
    active: Optional[ActiveQuest]
    modalities: list[str] = Field(default_factory=list)


class AcceptanceResponse(BaseModel):
    model_config = ConfigDict(strict=True, extra="forbid", frozen=True)

    quest_id: int


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-givers-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import counsel, db, exercises, game, profiles, quests  # noqa: E402
from app.main import app  # noqa: E402

__all__ = (
    "NOW",
    "AcceptanceResponse",
    "OfferResponse",
    "QuestOption",
    "assert_active_continuation",
    "assert_option_contract",
    "assert_reroll_is_harmless",
    "assert_single_iron_implement",
    "client",
    "counsel",
    "db",
    "exercises",
    "game",
    "new_profile",
    "offer_response",
    "offers",
    "row_count",
    "seed_activity",
    "seed_adverse_wellness",
    "write_fresh_sync",
)


NOW = datetime(2026, 7, 24, 9, 30, tzinfo=timezone.utc)
game.now = lambda: NOW
quests.now = lambda: NOW
quests.now_iso = lambda: NOW.isoformat(timespec="seconds")
quests.today = lambda: NOW.date().isoformat()
client = TestClient(app)
assert client.post("/api/profiles/select", json={"slug": "main"}).status_code == 200
profile_number = 0
activity_number = 0


def row_count(table: str) -> int:
    return db.q(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"]


def new_profile(label: str, mode: str = "considered") -> None:
    global profile_number
    profile_number += 1
    created = client.post(
        "/api/profiles",
        json={"name": f"{label}-{profile_number}", "pin": "1234"},
    )
    assert created.status_code == 200
    path = profiles.path_for(created.json()["slug"])
    assert path is not None
    db.set_profile(path)
    saved = client.post(
        "/api/settings",
        json={"timezone": "UTC", "counsel_mode": mode},
    )
    assert saved.status_code == 200


def write_fresh_sync() -> None:
    today = NOW.date().isoformat()
    db.q(
        "INSERT OR IGNORE INTO wellness (date, hrv, resting_hr) VALUES (?,?,?)",
        (today, 61.0, 49.0),
    )
    db.commit()
    db.kv_set(
        "sync_status",
        {
            "revision": 1,
            "activity": {
                "revision": 1,
                "newest_observation_date": today,
                "field_as_of": {"moving_time": today},
            },
            "wellness": {
                "revision": 1,
                "succeeded_at": NOW.isoformat(timespec="seconds"),
                "newest_observation_date": today,
                "field_as_of": {"hrv": today, "resting_hr": today},
            },
        },
    )


def seed_activity(activity_type: str, days_ago: int, minutes: int) -> None:
    global activity_number
    activity_number += 1
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time) "
        "VALUES (?,?,?,?,?,?)",
        (
            f"giver-loop-{activity_number}",
            "intervals.icu",
            (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"),
            activity_type,
            activity_type,
            minutes * 60,
        ),
    )
    db.commit()


def seed_adverse_wellness() -> None:
    for days_ago in range(20, 6, -1):
        observed = (NOW.date() - timedelta(days=days_ago)).isoformat()
        db.q(
            "INSERT INTO wellness (date, hrv, resting_hr) VALUES (?,?,?)",
            (observed, 60.0, 50.0),
        )
    for days_ago in range(6, -1, -1):
        observed = (NOW.date() - timedelta(days=days_ago)).isoformat()
        db.q(
            "INSERT INTO wellness (date, hrv, resting_hr) VALUES (?,?,?)",
            (observed, 40.0, 56.0),
        )
    db.commit()
    write_fresh_sync()


def offer_response(giver: str, reroll: bool = False) -> OfferResponse:
    suffix = "?reroll=true" if reroll else ""
    response = client.get(f"/api/offers/{giver}{suffix}")
    assert response.status_code == 200
    return OfferResponse.model_validate(response.json())


def offers(giver: str) -> list[QuestOption]:
    return offer_response(giver).offers


def assert_option_contract(option: QuestOption) -> None:
    assert option.option_key and type(option.offer_id) is int
    assert option.tier_label and option.tier_detail
    assert option.source.provider
    assert option.source.activity_source == option.source.provider
    assert option.source.wellness_freshness in {"missing", "stale", "mixed", "fresh"}


def assert_reroll_is_harmless(
    giver: str,
    expected: list[QuestOption],
) -> None:
    gold_before = game.get_char()["gold"]
    response = offer_response(giver, reroll=True)
    assert response.offers == expected
    assert game.get_char()["gold"] == gold_before


def assert_single_iron_implement(option: QuestOption) -> None:
    equipment = {
        exercises.EXERCISES[row.exercise]["equipment"]
        for row in option.routine
    }
    assert len(equipment) == 1
    assert equipment <= set(game.GIVER_ARCHETYPES["strength"]["modalities"])


def assert_active_continuation(expected: QuestOption, quest_id: int) -> None:
    continued = offer_response("endurance").active
    assert continued is not None
    refused = client.post(
        "/api/quests/accept",
        json={"giver": "endurance", "option_key": expected.option_key},
    )
    assert continued.id == quest_id and refused.status_code == 400
    assert continued.details.option_key == expected.option_key
    assert (
        continued.details.xp,
        continued.details.gold,
        continued.details.vigor,
    ) == (expected.xp, expected.gold, expected.vigor)

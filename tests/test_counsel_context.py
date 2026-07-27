import atexit
import os
import re
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional, TypedDict


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-context-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import counsel, counsel_context, db, game, profiles, quests  # noqa: E402
from app.main import app  # noqa: E402


NOW = datetime(2026, 7, 27, 12, tzinfo=timezone.utc)
game.now = quests.now = lambda: NOW
quests.now_iso = lambda: NOW.isoformat(timespec="seconds")
quests.today = lambda: NOW.date().isoformat()
client = TestClient(app)
assert client.get("/api/profiles").status_code == 200
profile_number = 0


class SourcePayload(TypedDict):
    provider: str
    activity_as_of: Optional[str]


class RoutinePayload(TypedDict):
    exercise: str
    suggest_weight: Optional[float]


class OfferPayload(TypedDict):
    modality: str
    tier_label: str
    sizing: str
    target_minutes: int
    source: SourcePayload
    focus: list[str]
    routine: list[RoutinePayload]


def new_profile(label: str, *, nudge: bool = False) -> None:
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
        json={
            "timezone": "UTC",
            "counsel_mode": "considered",
            "counsel_nudge_enabled": nudge,
        },
    )
    assert saved.status_code == 200
    today = NOW.date().isoformat()
    db.kv_set(
        "sync_status",
        {
            "revision": 1,
            "activity": {
                "revision": 1,
                "newest_observation_date": today,
            },
            "wellness": {
                "revision": 1,
                "succeeded_at": NOW.isoformat(timespec="seconds"),
                "newest_observation_date": today,
                "field_as_of": {"hrv": today, "resting_hr": today},
            },
        },
    )


def activity(
    activity_id: str,
    activity_type: str,
    days_ago: int,
    minutes: int,
    *,
    source: str = "intervals.icu",
) -> None:
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time) "
        "VALUES (?,?,?,?,?,?)",
        (
            activity_id,
            source,
            (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"),
            activity_type,
            activity_id,
            minutes * 60,
        ),
    )
    db.commit()


def lift(exercise: str, count: int, weight: float = 24.0) -> None:
    for offset in range(count):
        db.q(
            "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
            (
                (NOW - timedelta(minutes=offset)).isoformat(timespec="seconds"),
                exercise,
                weight,
                8,
            ),
        )
    db.commit()


def offer(giver: str) -> OfferPayload:
    response = client.get(f"/api/offers/{giver}")
    assert response.status_code == 200
    return response.json()["offers"][0]


def unchanged_characterization() -> None:
    # Given three valid runs and fresh wellness, normal sizing/tier behavior
    # remains pinned while the qualification seam moves.
    new_profile("characterization")
    for index, days_ago in enumerate((3, 2, 1), 1):
        activity(f"run-{index}", "Run", days_ago, 40)
    first_response = client.get("/api/offers/running")
    second_response = client.get("/api/offers/running")
    assert first_response.content == second_response.content
    first = first_response.json()["offers"][0]
    assert (
        first["modality"],
        first["tier_label"],
        first["sizing"],
        first["target_minutes"],
    ) == ("run", "quality", "personalized", 35)


def zero_duration_does_not_change_endurance_recency() -> None:
    # Given a recent Run and a stale valid Swim, the least-recently-practiced
    # endurance modality is Swim.
    new_profile("zero-duration")
    activity("recent-run", "Run", 1, 35)
    activity("stale-swim", "Swim", 20, 30)
    before = offer("running")
    assert before["modality"] == "swim"
    before_as_of = before["source"]["activity_as_of"]

    # When a newer zero-duration Swim marker arrives, it cannot become
    # practice. Then selection and disclosure remain on the valid Swim row.
    activity("zero-swim", "Swim", 0, 0)
    after = offer("running")
    assert after["modality"] == "swim", {
        "before": before["modality"],
        "after_zero": after["modality"],
    }
    assert after["source"]["activity_as_of"] == before_as_of, {
        "before": before_as_of,
        "after_zero": after["source"]["activity_as_of"],
    }


def ineligible_activities_change_nothing() -> None:
    # Given valid recent Run plus stale Swim practice, capture all activity
    # consumers before inserting provider/future/duration-ineligible rows.
    new_profile("ineligible", nudge=True)
    activity("valid-run", "Run", 1, 35)
    activity("valid-swim", "Swim", 9, 30)
    before_offer = offer("running")
    before_nudge = client.get("/api/state").json()["counsel_nudge"]

    activity("manual-swim", "Swim", 0, 120, source="manual")
    activity("future-swim", "Swim", -2, 180)
    activity("zero-swim", "Swim", 0, 0)
    after_offer = offer("running")
    after_nudge = client.get("/api/state").json()["counsel_nudge"]

    assert after_offer == before_offer, {
        "before": {
            "modality": before_offer["modality"],
            "target": before_offer["target_minutes"],
            "source": before_offer["source"],
        },
        "after": {
            "modality": after_offer["modality"],
            "target": after_offer["target_minutes"],
            "source": after_offer["source"],
        },
    }
    assert after_nudge == before_nudge, {
        "before": before_nudge,
        "after": after_nudge,
    }
    assert after_offer["source"]["provider"] == "intervals.icu"
    expected_activity_as_of = (NOW - timedelta(days=9)).date().isoformat()
    assert after_offer["source"]["activity_as_of"] == expected_activity_as_of


def logged_movements_own_iron_context() -> None:
    # Given one real upper-body lift plus an activity-level strength marker,
    # Iron history and targeting come from the lift ledger movement/groups.
    new_profile("logged-iron")
    lift("Kettlebell Row", 1, 28.0)
    activity("weight-marker", "WeightTraining", 1, 90)
    iron = offer("kettlebell")
    assert iron["sizing"] == "personalized"
    assert iron["focus"] == ["back", "arms"], iron["focus"]
    assert (iron["routine"][0]["exercise"], iron["routine"][0]["suggest_weight"]) == ("Kettlebell Row", 28.0)

    # Six actual lower-body sets activate the targeted gate; the activity row
    # alone did not invent a lower-body movement.
    rules_before = counsel.rule_state(NOW)
    assert rules_before.lower_body_active is False
    lift("Goblet Squat", 6)
    assert counsel.rule_state(NOW).lower_body_active is True


def council_consumers_do_not_own_raw_training_reads() -> None:
    root = Path(__file__).resolve().parents[1]
    consumers = (
        "app/counsel.py",
        "app/counsel_candidates.py",
        "app/counsel_rules.py",
        "app/counsel_specialists.py",
        "app/counsel_nudge.py",
    )
    violations: list[str] = []
    for relative in consumers:
        source = (root / relative).read_text()
        if re.search(r"SELECT[^\n]*(?:activities|lift_sets)", source):
            violations.append(f"{relative}: direct training SQL")
        if re.search(r"game\.(?:modality_history|last_weight)\s*\(", source):
            violations.append(f"{relative}: raw game history helper")
    assert violations == [], violations


def request_training_reads_are_consolidated() -> None:
    new_profile("request-count", nudge=True)
    activity("count-run", "Run", 5, 30)
    history_calls = 0
    assembly_calls = 0
    original_history = game.modality_history
    original_assemble = counsel_context.assemble

    def counted_history(*args, **kwargs):
        nonlocal history_calls
        history_calls += 1
        return original_history(*args, **kwargs)

    def counted_assemble(*args, **kwargs):
        nonlocal assembly_calls
        assembly_calls += 1
        return original_assemble(*args, **kwargs)

    game.modality_history = counted_history
    counsel_context.assemble = counted_assemble
    try:
        offered = client.get("/api/offers/running")
        assert offered.status_code == 200
        chosen = offered.json()["offers"][0]
        assert client.get("/api/state").status_code == 200
        accepted = client.post(
            "/api/quests/accept",
            json={"giver": "running", "option_key": chosen["option_key"]},
        )
        assert accepted.status_code == 200
    finally:
        game.modality_history = original_history
        counsel_context.assemble = original_assemble
    assert history_calls == 0, {"raw_modality_history_calls": history_calls}
    assert assembly_calls == 3, {"context_assemblies": assembly_calls}


failures: list[str] = []
for label, scenario in (
    ("unchanged valid-row behavior is characterized", unchanged_characterization),
    ("zero duration cannot change endurance recency", zero_duration_does_not_change_endurance_recency),
    ("ineligible activities cannot affect any consumer", ineligible_activities_change_nothing),
    ("logged lift movements own Iron context", logged_movements_own_iron_context),
    ("Council consumers contain no raw training reads", council_consumers_do_not_own_raw_training_reads),
    ("public requests do not fan out raw history reads", request_training_reads_are_consolidated),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL CONTEXT PASSED")

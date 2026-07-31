import json
from datetime import timedelta

from counsel_giver_test_support import NOW, client, db, game, new_profile


def weekly_plan(slots_by_day):
    return {
        day: list(slots_by_day.get(day, []))
        for day in game.COUNSEL_SCHEDULE_DAYS
    }


def save_plan(slots_by_day):
    response = client.post(
        "/api/settings",
        json={"counsel_schedule": weekly_plan(slots_by_day)},
    )
    assert response.status_code == 200, response.json()


def seed_attributed_quest(mode, status, completed_at, optional):
    accepted_at = NOW.isoformat(timespec="seconds")
    cursor = db.q(
        "INSERT INTO quests "
        "(giver, kind, title, details, status, accepted_at, completed_at) "
        "VALUES ('endurance', 'run_easy', 'A measured road', ?, ?, ?, ?)",
        (json.dumps({}), status, accepted_at, completed_at),
    )
    quest_id = cursor.lastrowid
    assert quest_id is not None
    db.q(
        "INSERT INTO counsel_attributions "
        "(quest_id, mode, accepted_at, offered_option_keys, chosen_option_key, optional) "
        "VALUES (?, ?, ?, '[\"run:easy\"]', 'run:easy', ?)",
        (quest_id, mode, accepted_at, optional),
    )
    db.commit()


def adherence():
    response = client.get("/api/state")
    assert response.status_code == 200, response.json()
    return response.json()["counsel_schedule_adherence"]


def elapsed_required_slots_and_completions() -> None:
    new_profile("adherence-three-of-four")
    save_plan({
        day: [{"modality": "run", "tier": "easy", "optional": False}]
        for day in ("monday", "tuesday", "wednesday", "thursday")
    })
    for days_ago in (4, 3, 2):
        seed_attributed_quest(
            "schedule",
            "done",
            (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"),
            False,
        )
    assert adherence() == {"done": 3, "planned": 4}


def optional_and_future_slots_do_not_count() -> None:
    new_profile("adherence-optional-future")
    save_plan({
        "monday": [{"modality": "run", "tier": "easy", "optional": False}],
        "tuesday": [{"modality": "run", "tier": "easy", "optional": True}],
        "saturday": [{"modality": "run", "tier": "long", "optional": False}],
        "sunday": [{"modality": "rest", "optional": False}],
    })
    seed_attributed_quest(
        "schedule",
        "done",
        (NOW - timedelta(days=4)).isoformat(timespec="seconds"),
        False,
    )
    seed_attributed_quest(
        "schedule",
        "done",
        (NOW - timedelta(days=3)).isoformat(timespec="seconds"),
        True,
    )
    assert adherence() == {"done": 1, "planned": 1}


def only_current_week_schedule_completions_count() -> None:
    new_profile("adherence-poor-week")
    save_plan({
        day: [{"modality": "run", "tier": "easy", "optional": False}]
        for day in ("monday", "tuesday", "wednesday", "thursday", "friday")
    })
    seed_attributed_quest("schedule", "done", NOW.isoformat(timespec="seconds"), False)
    seed_attributed_quest("schedule", "broken", NOW.isoformat(timespec="seconds"), False)
    seed_attributed_quest("counsel", "done", NOW.isoformat(timespec="seconds"), None)
    seed_attributed_quest("self", "done", NOW.isoformat(timespec="seconds"), None)
    seed_attributed_quest(
        "schedule",
        "done",
        (NOW - timedelta(days=7)).isoformat(timespec="seconds"),
        False,
    )
    assert adherence() == {"done": 1, "planned": 5}


def legacy_null_is_required() -> None:
    new_profile("adherence-legacy-null")
    save_plan({
        "monday": [{"modality": "run", "tier": "easy", "optional": False}],
    })
    seed_attributed_quest(
        "schedule",
        "done",
        (NOW - timedelta(days=4)).isoformat(timespec="seconds"),
        None,
    )
    assert adherence() == {"done": 1, "planned": 1}


def empty_and_future_only_plans_are_silent() -> None:
    new_profile("adherence-no-plan")
    assert adherence() is None

    new_profile("adherence-future-only")
    save_plan({
        "saturday": [{"modality": "run", "tier": "long", "optional": False}],
    })
    assert adherence() is None


failures: list[str] = []
for label, scenario in (
    ("three of four", elapsed_required_slots_and_completions),
    ("optional and future slots", optional_and_future_slots_do_not_count),
    ("current-week schedule completions", only_current_week_schedule_completions_count),
    ("legacy null", legacy_null_is_required),
    ("silent empty states", empty_and_future_only_plans_are_silent),
):
    try:
        scenario()
        print(f"  ok  {label}")
    except (AssertionError, KeyError, TypeError, ValueError) as error:
        failures.append(f"{label}: {type(error).__name__}: {error}")
        print(f"  RED {label}: {type(error).__name__}: {error}")

assert not failures, "\n".join(failures)
print("COUNSEL SCHEDULE ADHERENCE PASSED")

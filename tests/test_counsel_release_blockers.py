from datetime import timedelta

from counsel_giver_test_support import (
    NOW,
    counsel,
    client,
    db,
    new_profile,
    offers,
    seed_activity,
    write_fresh_sync,
)


def lower_body_gate_is_targeted() -> None:
    # Given: the exact five/six-set lower-body boundary with fresh wellness.
    # When: Considered builds lower- and non-lower-body hard paths. Then: only
    # the lower-body hard path is removed at six sets.
    new_profile("lower-body-gate")
    write_fresh_sync()
    for _ in range(5):
        db.q(
            "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
            (NOW.isoformat(timespec="seconds"), "Back Squat", 82.5, 5),
        )
    db.commit()
    five_sets = offers("kettlebell")[0]
    assert five_sets.intensity == "hard"

    db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
        (NOW.isoformat(timespec="seconds"), "Back Squat", 82.5, 5),
    )
    seed_activity("Swim", 1, 45)
    db.commit()
    six_sets = offers("kettlebell")[0]
    non_lower_body = offers("running")[0]
    assert six_sets.intensity != "hard"
    assert non_lower_body.modality == "swim"
    assert non_lower_body.intensity == "hard"


def mixed_iron_gate_uses_all_routine_targets() -> None:
    # Given: upper-body history whose routine also contains a lower-body lift,
    # with fresh wellness and the same five/six-set boundary.
    new_profile("mixed-iron-gate")
    write_fresh_sync()
    older = (NOW - timedelta(hours=1)).isoformat(timespec="seconds")
    for _ in range(5):
        db.q(
            "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
            (older, "Kettlebell Deadlift", 24.0, 8),
        )
    for exercise in ("Turkish Get-Up", "Kettlebell Floor Press", "Kettlebell Row"):
        db.q(
            "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
            (NOW.isoformat(timespec="seconds"), exercise, 24.0, 8),
        )
    db.commit()

    five_set = client.get("/api/offers/kettlebell").json()["offers"][0]
    assert five_set["intensity"] == "hard"
    assert five_set["focus"][:3] == ["back", "arms", "chest"]
    assert [row["exercise"] for row in five_set["routine"]] == [
        "Kettlebell Row",
        "Kettlebell Floor Press",
        "Turkish Get-Up",
        "Kettlebell Deadlift",
    ]
    assert any(
        set(row["groups"]) & {"legs", "posterior"}
        for row in five_set["routine"]
    )

    db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
        (older, "Kettlebell Deadlift", 24.0, 8),
    )
    db.commit()
    six_set = client.get("/api/offers/kettlebell").json()["offers"][0]
    assert six_set["intensity"] != "hard"


def provenance_tracks_sizing_rows() -> None:
    # Given: three positive-duration intervals rows on D1-D3. When: Fenn forms
    # a path. Then: its target and disclosure are personalized from that run
    # history.
    new_profile("activity-provenance")
    write_fresh_sync()
    for number, days_ago in enumerate((3, 2, 1), 1):
        db.q(
            "INSERT INTO activities (id, source, start, type, name, moving_time) "
            "VALUES (?,?,?,?,?,?)",
            (
                f"intervals-run-{number}",
                "intervals.icu",
                (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"),
                "Run",
                f"Intervals run {number}",
                40 * 60,
            ),
        )
    db.commit()

    first_response = client.get("/api/offers/running")
    assert first_response.status_code == 200
    first = first_response.json()["offers"][0]
    assert first["sizing"] == "personalized"
    assert first["target_minutes"] == 35
    assert first["source"]["activity_source"] == "intervals.icu"
    assert first["source"]["activity_as_of"] == "2026-07-23"

    # Given: a newer zero-duration manual row that is not admissible for
    # sizing. When: the same board is read. Then: target and provenance stay
    # pinned to the three positive-duration intervals rows.
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time) "
        "VALUES (?,?,?,?,?,?)",
        (
            "manual-run-zero",
            "manual",
            NOW.isoformat(timespec="seconds"),
            "Run",
            "Manual run marker",
            0,
        ),
    )
    db.commit()
    second_response = client.get("/api/offers/running")
    assert second_response.status_code == 200
    second = second_response.json()["offers"][0]
    assert (second["sizing"], second["target_minutes"]) == ("personalized", 35)
    assert second["source"]["activity_source"] == "intervals.icu"
    assert second["source"]["activity_as_of"] == "2026-07-23"


def disclosure_uses_candidate_provenance_and_one_snapshot() -> None:
    # Given: an unlinked profile whose only training record is a manual lift.
    # When: Grunhilda forms a path. Then: its disclosure names the local ledger,
    # never intervals.icu.
    new_profile("manual-provenance")
    db.q(
        "INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
        (NOW.isoformat(timespec="seconds"), "Back Squat", 82.5, 5),
    )
    db.commit()
    manual = offers("kettlebell")[0]
    assert manual.source.provider == "Iron Vale lift ledger"
    assert manual.source.activity_source == "Iron Vale lift ledger"

    # Given: a sync status that changes after its first read. When: one board
    # request is built. Then: selection and disclosure both use the first
    # immutable snapshot, so the card cannot mix missing and fresh states.
    new_profile("single-snapshot")
    today = NOW.date().isoformat()
    missing = {
        "revision": 1,
        "activity": {"revision": 1},
        "wellness": {"revision": 1, "freshness": "missing"},
    }
    fresh = {
        "revision": 2,
        "activity": {
            "revision": 2,
            "newest_observation_date": today,
        },
        "wellness": {
            "revision": 2,
            "succeeded_at": NOW.isoformat(timespec="seconds"),
            "newest_observation_date": today,
            "field_as_of": {"hrv": today, "resting_hr": today},
            "freshness": "fresh",
        },
    }
    snapshots = [missing, fresh]
    reads: list[int] = []
    original_sync_status = counsel._sync_status

    def changing_sync_status():
        index = min(len(reads), len(snapshots) - 1)
        reads.append(index)
        return snapshots[index]

    counsel._sync_status = changing_sync_status
    try:
        selected = counsel.giver_options("running")[0]
    finally:
        counsel._sync_status = original_sync_status
    source = selected["source"]
    assert len(reads) == 1
    assert selected["intensity"] != "hard"
    assert source["wellness_freshness"] == "missing"
    assert source["wellness_as_of"] is None


lower_body_gate_is_targeted()
mixed_iron_gate_uses_all_routine_targets()
provenance_tracks_sizing_rows()
disclosure_uses_candidate_provenance_and_one_snapshot()
print("COUNSEL RELEASE BLOCKERS PASSED")

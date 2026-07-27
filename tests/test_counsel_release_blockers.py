from counsel_giver_test_support import (
    NOW,
    counsel,
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
disclosure_uses_candidate_provenance_and_one_snapshot()
print("COUNSEL RELEASE BLOCKERS PASSED")

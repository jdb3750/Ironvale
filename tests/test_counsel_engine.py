import atexit
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-counsel-engine-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import db, game, intervals, quests, syncing  # noqa: E402


NOW = datetime(2026, 7, 23, 12, tzinfo=timezone.utc)
game.now = lambda: NOW


def ok(label, condition):
    assert condition, f"COUNSEL ENGINE FAIL: {label}"
    print(f"  ok  {label}")


def reset_profile(name):
    db.set_profile(os.path.join(SCRATCH, f"{name}.db"))
    db.kv_set("settings", {"timezone": "UTC", "ambition": 2})


def seed_activity(activity_id, days_ago, activity_type, minutes):
    db.q(
        "INSERT INTO activities (id, source, start, type, name, moving_time) VALUES (?,?,?,?,?,?)",
        (
            activity_id,
            "intervals.icu",
            (NOW - timedelta(days=days_ago)).isoformat(timespec="seconds"),
            activity_type,
            activity_id,
            minutes * 60,
        ),
    )


def write_sync_status(hrv_as_of, resting_as_of, succeeded_at=None):
    db.kv_set(
        "sync_status",
        {
            "revision": 4,
            "activity": {"revision": 2},
            "wellness": {
                "revision": 2,
                "succeeded_at": succeeded_at or NOW.isoformat(timespec="seconds"),
                "newest_observation_date": max(hrv_as_of, resting_as_of),
                "field_as_of": {"hrv": hrv_as_of, "resting_hr": resting_as_of},
            },
        },
    )


reset_profile("candidate")

# Given: identical candidate inputs. When: the builder runs twice. Then: its
# deterministic candidates and payloads are identical.
history = quests.CandidateHistory(session_count=2, median_minutes=47.0, p80_minutes=55.0)
first = quests.build_endurance_candidates("run", history, 1.0)
second = quests.build_endurance_candidates("run", history, 1.0)
ok("candidate order is repeatable", first == second)
ok("two-session endurance is a generic starter",
   all(candidate.payload["sizing"] == "generic_starter" for candidate in first))
ok("two-session endurance carries the cold-start reason",
   all("cold_start" in candidate.payload["reason_codes"] for candidate in first))

# Given: an established modality. When: it reaches three sessions. Then: the
# builder no longer presents generic starter sizing.
established = quests.build_endurance_candidates(
    "run", quests.CandidateHistory(session_count=3, median_minutes=47.0, p80_minutes=55.0), 1.0
)
ok("three sessions enable personalized endurance sizing",
   all(candidate.payload["sizing"] == "personalized" for candidate in established))

# Given: Iron routines using different implements. When: candidates are built.
# Then: their keys retain routine identity and zero history never invents weight.
zero_iron = quests.LiftCandidateContext(
    giver="kettlebell", style="volume", focus=("legs", "posterior"),
    exercises=("Goblet Squat", "Kettlebell Swing"), weights=(None, None), iron_session_count=0,
)
logged_iron = quests.LiftCandidateContext(
    giver="kettlebell", style="volume", focus=("legs", "posterior"),
    exercises=("Back Squat", "Deadlift"), weights=(82.5, 110.0), iron_session_count=1,
)
zero_candidate = quests.build_lift_candidate(zero_iron)
logged_candidate = quests.build_lift_candidate(logged_iron)
ok("zero Iron history remains explicit", zero_candidate.payload["reason_codes"] == ["no_iron_history"])
ok("zero Iron history has no fabricated working weight",
   all(row["suggest_weight"] is None for row in zero_candidate.payload["routine"]))
ok("first Iron session keeps logged working weight",
   logged_candidate.payload["routine"][0]["suggest_weight"] == 82.5)
ok("Iron candidate keys distinguish routines", zero_candidate.candidate_key != logged_candidate.candidate_key)

# Given: normal per-field provider metadata. When: status is read. Then: the
# sync contract preserves individual as-of dates rather than flattening them.
today = NOW.date().isoformat()
write_sync_status(today, today)
status = syncing.get_sync_status()
ok("sync status has wellness field metadata",
   status["wellness"]["field_as_of"]["hrv"] == today and status["wellness"]["field_as_of"]["resting_hr"] == today)
ok("sync status reports fresh wellness", status["wellness"]["freshness"] == "fresh")
ok("intervals status retains stream revisions", intervals.get_sync_status()["revision"] == 4)

from app import counsel  # noqa: E402

reset_profile("sync-flight")
db.kv_set("settings", {"timezone": "UTC", "ambition": 2, "intervals_athlete_id": "test-athlete", "intervals_api_key": "test-key"})
original_get = intervals._get


def synced_payload(path, _params, _athlete, _key):
    if path.endswith("/activities"):
        return [{"id": "sync-run", "start_date_local": today + "T06:00:00+00:00", "type": "Run", "name": "sync run", "moving_time": 1800}]
    return [{"id": today, "hrv": 61.0, "restingHR": 49.0, "ctl": 42.0, "atl": 40.0}]


intervals._get = synced_payload
try:
    intervals.sync(days=1)
finally:
    intervals._get = original_get
synced_status = intervals.get_sync_status()
ok("sync records activity as-of metadata", synced_status["activity"]["field_as_of"]["moving_time"] == today)
ok("sync records wellness as-of metadata", synced_status["wellness"]["field_as_of"]["hrv"] == today and synced_status["wellness"]["field_as_of"]["resting_hr"] == today)

# Given: the six-set lower-body boundary. When: current rules are evaluated.
# Then: five sets do not activate it and six sets do.
for number in range(5):
    db.q("INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
         (NOW.isoformat(timespec="seconds"), "Goblet Squat", 24, 10))
db.commit()
five_set_rules = counsel.rule_state(NOW)
ok("five lower-body sets do not trip the gate", "recent_lower_body_six_sets" not in five_set_rules.reason_codes)
db.q("INSERT INTO lift_sets (ts, exercise, weight, reps) VALUES (?,?,?,?)",
     (NOW.isoformat(timespec="seconds"), "Goblet Squat", 24, 10))
db.commit()
six_set_rules = counsel.rule_state(NOW)
ok("six lower-body sets trip the gate", "recent_lower_body_six_sets" in six_set_rules.reason_codes)

# Given: stale provider metadata. When: rules are evaluated. Then: hard work is
# safely suppressed rather than treating stale wellness as current.
stale_day = (NOW.date() - timedelta(days=3)).isoformat()
write_sync_status(stale_day, stale_day, (NOW - timedelta(hours=49)).isoformat(timespec="seconds"))
stale_rules = counsel.rule_state(NOW)
ok("stale wellness suppresses hard selection", stale_rules.suppresses_hard and "wellness_data_stale" in stale_rules.reason_codes)

# Given: one stale wellness field. When: rules are evaluated. Then: mixed
# provenance is conservative rather than quietly treating the fresh field as enough.
write_sync_status(today, stale_day)
mixed_rules = counsel.rule_state(NOW)
ok("mixed wellness suppresses hard selection", mixed_rules.suppresses_hard and "wellness_data_mixed" in mixed_rules.reason_codes)

db.kv_set("sync_status", {"revision": 5, "wellness": {"succeeded_at": "not-a-date", "field_as_of": {"hrv": 3, "resting_hr": []}}})
malformed_rules = counsel.rule_state(NOW)
ok("malformed wellness metadata suppresses safely", malformed_rules.suppresses_hard and "wellness_data_missing" in malformed_rules.reason_codes)

# Given: a fresh adverse HRV and resting-heart-rate trend. When: rules are
# evaluated. Then: the combined trend suppresses hard selection with both reasons.
reset_profile("trend")
for offset in range(14, 0, -1):
    observed_on = (NOW.date() - timedelta(days=offset)).isoformat()
    db.q("INSERT INTO wellness (date, hrv, resting_hr) VALUES (?,?,?)", (observed_on, 60.0, 50.0))
db.q("INSERT INTO wellness (date, hrv, resting_hr) VALUES (?,?,?)", (today, 40.0, 70.0))
db.commit()
write_sync_status(today, today)
trend_rules = counsel.rule_state(NOW)
ok("combined adverse trend suppresses hard selection",
   trend_rules.suppresses_hard and {"wellness_trend_low_hrv", "wellness_trend_high_resting_hr", "hard_suppressed_wellness_trend"}.issubset(trend_rules.reason_codes))

# Given: separate routed profiles. When: each reads source disclosure. Then: no
# profile's wellness as-of leaks into another profile.
reset_profile("profile-a")
write_sync_status(today, today)
profile_a = counsel.source_disclosure(counsel.rule_state(NOW))
reset_profile("profile-b")
older = (NOW.date() - timedelta(days=1)).isoformat()
write_sync_status(older, older)
profile_b = counsel.source_disclosure(counsel.rule_state(NOW))
ok("source disclosure is profile-isolated", profile_a["wellness_as_of"] != profile_b["wellness_as_of"])

print("COUNSEL ENGINE PASSED")

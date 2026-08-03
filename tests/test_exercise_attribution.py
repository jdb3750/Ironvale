import atexit
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCRATCH = tempfile.mkdtemp(prefix="iron-vale-exercise-attribution-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import exercises, game  # noqa: E402
import app.imported_exercises as imported_exercises  # noqa: E402
from app.main import app  # noqa: E402


NOW = datetime(2026, 7, 31, 12, tzinfo=timezone.utc)
game.now = lambda: NOW
client = TestClient(app)


def ok(label: str, condition: bool) -> None:
    assert condition, f"EXERCISE ATTRIBUTION FAIL: {label}"
    print(f"  ok  {label}")


def stats_payload():
    response = client.get("/api/stats")
    ok("muscle ledger remains available", response.status_code == 200)
    return response.json()


def stats():
    return stats_payload()["muscles"]


def per_muscle_stats():
    return stats_payload()["per_muscle"]


def log_set(exercise: str) -> None:
    response = client.post(
        "/api/lifts",
        json={"exercise": exercise, "weight": 0, "reps": 10},
    )
    ok(f"ledger accepts {exercise}", response.status_code == 200)


client.get("/api/state")
selected = client.post("/api/profiles/select", json={"slug": "main"})
ok("scratch main profile selected", selected.status_code == 200)

# Given: an off-catalog strength movement. When: it is logged through the
# lifting ledger. Then: the player-visible muscle ledger credits its fold.
ok("posterior starts untrained", stats()["posterior"]["days_since"] == 999)
log_set("  Seated  Band HAMSTRING Curl  ")
ok("off-catalog strength work refreshes posterior", stats()["posterior"]["days_since"] == 0)

# Given: an imported stretching movement. When: it is logged through the same
# ledger. Then: the catalog retains its source data without awarding training
# credit to the heatmap.
ok("legs start untrained", stats()["legs"]["days_since"] == 999)
quadriceps_before_stretch = per_muscle_stats()["quadriceps"]
log_set("All Fours Quad Stretch")
ok("stretching work does not refresh legs", stats()["legs"]["days_since"] == 999)
ok(
    "stretching work does not refresh a source muscle",
    per_muscle_stats()["quadriceps"] == quadriceps_before_stretch,
)

catalog = imported_exercises
stretch = catalog.find("All Fours Quad Stretch")
ok(
    "stretching row remains available with its source category and muscles",
    stretch is not None
    and stretch.category == "stretching"
    and stretch.muscles == ("quadriceps",),
)

# Given: an imported spelling collides with a sworn catalog movement. When:
# attribution is requested. Then: the hand-authored groups keep precedence.
ok(
    "hand-authored groups win over the imported fold",
    exercises.groups_for("Dumbbell Bench Press") == ["chest", "arms"],
)

# Given: a hand-authored name with no groups. When: attribution resolves it.
# Then: hand-authored precedence still blocks the imported fallback.
manual_key = imported_exercises.normalize_name("Dumbbell Bench Press")
original_manual_groups = exercises._MANUAL_GROUPS[manual_key]
exercises._MANUAL_GROUPS[manual_key] = []
try:
    ok("empty hand-authored groups still win", exercises.groups_for("Dumbbell Bench Press") == [])
finally:
    exercises._MANUAL_GROUPS[manual_key] = original_manual_groups

# Given: an unknown movement. When: it is attributed. Then: the ledger remains
# honest rather than guessing a muscle group.
ok("unknown movement remains ungrouped", exercises.groups_for("Moon-Calf Press") == [])

# Given: sworn, aliased, imported, and unknown names. When: source-muscle
# attribution resolves them. Then: it follows the same merged-catalog
# precedence and returns immutable empty values for unknown work.
ok(
    "Vale-only authored muscles resolve",
    exercises.muscles_for("Kettlebell Floor Press")
    == (("chest",), ("triceps", "shoulders")),
)
ok(
    "sworn alias muscles inherit from the source row",
    exercises.muscles_for("Pull-Up")
    == (("lats",), ("biceps", "middle back")),
)
ok(
    "imported muscles resolve directly",
    exercises.muscles_for("  seated HEAD harness neck resistance ")
    == (("neck",), ()),
)
ok("unknown movement remains muscle-free", exercises.muscles_for("Moon-Calf Press") == ((), ()))

# Given: a neck-only lift whose seven-group fold is deliberately empty. When:
# it is logged. Then: neck receives per-muscle credit while the established
# seven-group recency output remains byte-for-byte equal.
groups_before_neck = game.muscle_recency()
ok("neck starts untrained", per_muscle_stats()["neck"]["days_since"] == 999)
log_set("Seated Head Harness Neck Resistance")
neck_stats = per_muscle_stats()["neck"]
ok(
    "neck-only work refreshes neck as primary",
    neck_stats == {"days_since": 0, "sets_14d": 1, "role": "primary"},
)
ok("neck-only work leaves group recency unchanged", game.muscle_recency() == groups_before_neck)

# Given: one lift with a primary muscle and secondary muscles. When: it is
# logged. Then: the per-muscle recency distinguishes the two lit states.
log_set("Kettlebell Floor Press")
floor_press_stats = per_muscle_stats()
ok("primary work is marked primary", floor_press_stats["chest"]["role"] == "primary")
ok("secondary work is marked secondary", floor_press_stats["triceps"]["role"] == "secondary")

# Given: a malformed persisted source file. When: the app state boots. Then:
# the catalog degrades to no imported rows instead of failing the game boot.
source_path = catalog.SOURCE_PATH
bad_source = Path(SCRATCH) / "malformed-exercises.json"
bad_source.write_text("{not json", encoding="utf-8")
catalog.SOURCE_PATH = bad_source
catalog.clear_cache()
try:
    malformed_state = client.get("/api/state")
    ok("malformed source does not break game state", malformed_state.status_code == 200)
    ok("malformed source exposes no imported attribution", exercises.groups_for("Seated Band Hamstring Curl") == [])
finally:
    catalog.SOURCE_PATH = source_path
    catalog.clear_cache()

# Given: one source record has an unknown muscle. When: the cached local
# catalog loads. Then: its other, valid movements still reach the player.
partial_source = Path(SCRATCH) / "one-bad-exercise.json"
partial_payload = json.loads(source_path.read_text(encoding="utf-8"))
partial_payload[0]["primaryMuscles"] = ["review-only muscle"]
partial_source.write_text(json.dumps(partial_payload), encoding="utf-8")
catalog.SOURCE_PATH = partial_source
catalog.clear_cache()
try:
    ok(
        "good imported rows survive one unknown muscle",
        exercises.groups_for("Barbell Hip Thrust") == ["posterior", "legs"],
    )
    partial_state = client.get("/api/state")
    ok("catalog status remains available", partial_state.status_code == 200)
    partial_status = partial_state.json()["imported_exercise_catalog"]
    ok(
        "catalog status records the skipped unknown-muscle row",
        partial_status == {
            "loaded_rows": 872,
            "skipped_rows": 1,
            "skipped_by_reason": {"unknown muscle": 1},
            "source_error": None,
        },
    )
finally:
    catalog.SOURCE_PATH = source_path
    catalog.clear_cache()



# Given: a caller mutates the list groups_for handed back. When: attribution is
# asked again. Then: the sworn catalog is untouched — _MANUAL_GROUPS holds the
# very lists inside EXERCISES, so returning one directly would let any caller
# corrupt a sworn entry for the life of the process.
sworn_groups = exercises.groups_for("Back Squat")
sworn_groups.append("corrupted")
ok(
    "a mutated result cannot corrupt the sworn catalog",
    exercises.groups_for("Back Squat") == ["legs", "posterior"]
    and "corrupted" not in exercises.EXERCISES["Back Squat"]["groups"],
)
imported_groups = exercises.groups_for("Barbell Hip Thrust")
imported_groups.append("corrupted")
ok(
    "a mutated result cannot corrupt the imported fold",
    "corrupted" not in exercises.groups_for("Barbell Hip Thrust"),
)

print("EXERCISE ATTRIBUTION PASSED")

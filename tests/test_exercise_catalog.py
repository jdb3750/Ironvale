import atexit
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path


SCRATCH = tempfile.mkdtemp(prefix="iron-vale-exercise-catalog-")
atexit.register(shutil.rmtree, SCRATCH, ignore_errors=True)
os.environ["DATA_DIR"] = SCRATCH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from app import exercises  # noqa: E402
import app.imported_exercises as imported_exercises  # noqa: E402
from app.main import app  # noqa: E402


client = TestClient(app)

EXPECTED_LIST_KEYS = {
    "aliases",
    "category",
    "equipment",
    "force",
    "groups",
    "how",
    "id",
    "level",
    "mechanic",
    "name",
    "primaryMuscles",
    "scheme",
    "secondaryMuscles",
}

EXPECTED_DETAIL_KEYS = EXPECTED_LIST_KEYS | {"instructions"}

APPROVED_ALIASES = {
    "Farmer Carry": "Farmer's Walk",
    "Back Squat": "Barbell Squat",
    "Pull-Up": "Pullups",
    "Push-Up": "Pushups",
    "Deadlift": "Barbell Deadlift",
    "Bench Press": "Barbell Bench Press - Medium Grip",
    "Dip": "Parallel Bar Dip",
    "Barbell Row": "Bent Over Barbell Row",
    "Dumbbell Curl": "Dumbbell Bicep Curl",
    "Overhead Press": "Barbell Shoulder Press",
    "Bulgarian Split Squat": "Suspended Split Squat",
    "Turkish Get-Up": "Kettlebell Turkish Get-Up (Lunge style)",
}

VALE_ONLY_CLASSIFICATIONS = {
    "Kettlebell Swing": {"primaryMuscles": ["hamstrings"], "secondaryMuscles": ["glutes", "lower back", "calves", "shoulders"], "force": "pull", "level": "intermediate", "mechanic": "compound", "category": "strength"},
    "Kettlebell Clean & Press": {"primaryMuscles": ["shoulders"], "secondaryMuscles": ["triceps", "traps", "quadriceps", "glutes", "hamstrings", "lower back", "abdominals", "calves", "middle back"], "force": "push", "level": "intermediate", "mechanic": "compound", "category": "strength"},
    "Kettlebell Snatch": {"primaryMuscles": ["shoulders"], "secondaryMuscles": ["hamstrings", "glutes", "lower back", "traps", "calves", "triceps"], "force": "pull", "level": "expert", "mechanic": "compound", "category": "strength"},
    "Kettlebell Row": {"primaryMuscles": ["middle back"], "secondaryMuscles": ["biceps", "lats"], "force": "pull", "level": "beginner", "mechanic": "compound", "category": "strength"},
    "Kettlebell Floor Press": {"primaryMuscles": ["chest"], "secondaryMuscles": ["triceps", "shoulders"], "force": "push", "level": "beginner", "mechanic": "compound", "category": "strength"},
    "Kettlebell Halo": {"primaryMuscles": ["shoulders"], "secondaryMuscles": [], "force": "push", "level": "beginner", "mechanic": "isolation", "category": "strength"},
    "Kettlebell Lunge": {"primaryMuscles": ["quadriceps"], "secondaryMuscles": ["glutes", "hamstrings", "calves"], "force": "push", "level": "beginner", "mechanic": "compound", "category": "strength"},
    "Kettlebell Deadlift": {"primaryMuscles": ["hamstrings"], "secondaryMuscles": ["glutes", "lower back", "quadriceps", "calves", "abdominals", "middle back"], "force": "pull", "level": "beginner", "mechanic": "compound", "category": "strength"},
}

VALE_ONLY_IDS = {
    "Kettlebell Swing": "Kettlebell_Swing",
    "Kettlebell Clean & Press": "Kettlebell_Clean_&_Press",
    "Kettlebell Snatch": "Kettlebell_Snatch",
    "Kettlebell Row": "Kettlebell_Row",
    "Kettlebell Floor Press": "Kettlebell_Floor_Press",
    "Kettlebell Halo": "Kettlebell_Halo",
    "Kettlebell Lunge": "Kettlebell_Lunge",
    "Kettlebell Deadlift": "Kettlebell_Deadlift",
}

IMPORTED_FORCE_OVERRIDES = {
    "Farmer's Walk": "loaded carry", "Rickshaw Carry": "loaded carry",
    "Yoke Walk": "loaded carry", "Conan's Wheel": "loaded carry",
    "Band Assisted Pull-Up": "pull", "Incline Inner Biceps Curl": "pull",
    "Internal Rotation with Band": "pull", "Push-Up Wide": "push",
    "Smith Machine Decline Press": "push", "Single Dumbbell Raise": "push",
    "Inchworm": "static", "Lying Prone Quadriceps": "static",
}

def ok(label: str, condition: bool) -> None:
    assert condition, f"EXERCISE CATALOG FAIL: {label}"
    print(f"  ok  {label}")


def catalog_payload():
    response = client.get("/api/catalog")
    ok("catalog endpoint is available", response.status_code == 200)
    return response.json()


def legacy_payload():
    return {
        "exercises": [
            {
                "name": name,
                "unit": exercise["scheme"][0],
                "equipment": exercise["equipment"],
                "groups": exercise["groups"],
                "how": exercise["how"],
            }
            for name, exercise in exercises.EXERCISES.items()
        ]
    }


# Given: the established legacy Compendium endpoint. When: the new catalog is
# read. Then: the five existing consumers receive the exact original payload.
legacy_before = client.get("/api/exercises")
ok("legacy exercise endpoint is available", legacy_before.status_code == 200)
ok("legacy exercise payload matches its existing contract", legacy_before.json() == legacy_payload())
legacy_by_name = {row["name"]: row for row in legacy_before.json()["exercises"]}

payload = catalog_payload()
rows = payload["exercises"]
by_name = {row["name"]: row for row in rows}

# Given: the sworn and vendored catalogs. When: they are merged. Then: one
# renderer can consume every row because every key is present on every record.
ok("adapter retains every vendored source row", imported_exercises.status()["loaded_rows"] == 873)
ok(
    "catalog list records have one prose-free key set",
    {frozenset(row) for row in rows} == {frozenset(EXPECTED_LIST_KEYS)},
)
ok("catalog list omits instructions", all("instructions" not in row for row in rows))
ok("catalog omits the unused images field", all("images" not in row for row in rows))
ok("catalog has the expected approved merge count", len(rows) == 881)
ok("every catalog record has a category", all(row["category"] is not None for row in rows))
ok(
    "Vale-only movements are authored as strength",
    all(by_name[name]["category"] == "strength" for name in VALE_ONLY_CLASSIFICATIONS),
)
catalog_names = [row["name"] for row in rows]
ok(
    "catalog order is case-insensitive by name",
    catalog_names == sorted(catalog_names, key=str.casefold),
)
ok(
    "catalog has no duplicate normalized names",
    len({imported_exercises.normalize_name(row["name"]) for row in rows}) == len(rows),
)
ok("every catalog record has a stable id", all(row["id"] is not None for row in rows))
ok("catalog ids are unique", len({row["id"] for row in rows}) == len(rows))
ok(
    "Vale-only movements use the approved source-style ids",
    all(by_name[name]["id"] == exercise_id for name, exercise_id in VALE_ONLY_IDS.items()),
)

# Given: a sworn movement with no upstream prose and a fully imported movement.
# When: each detail route is read. Then: both return the uniform full record,
# with instructions explicit even when the source supplied none.
halo_detail_response = client.get("/api/catalog/Kettlebell_Halo")
ok("sworn catalog detail is available", halo_detail_response.status_code == 200)
halo_detail = halo_detail_response.json()
ok("catalog detail restores the full key set", set(halo_detail) == EXPECTED_DETAIL_KEYS)
ok(
    "Vale-only detail carries empty upstream instructions and sworn how",
    halo_detail["instructions"] == []
    and halo_detail["how"] == exercises.EXERCISES["Kettlebell Halo"]["how"],
)
conan_detail_response = client.get("/api/catalog/Conans_Wheel")
ok("imported catalog detail is available", conan_detail_response.status_code == 200)
conan_detail = conan_detail_response.json()
ok(
    "imported detail carries source instructions in the shared prose slot",
    conan_detail["name"] == "Conan's Wheel"
    and conan_detail["how"] is None
    and len(conan_detail["instructions"]) > 0,
)
missing_detail = client.get("/api/catalog/Not_In_The_Ledger")
ok("unknown catalog id returns 404", missing_detail.status_code == 404)
ok(
    "unknown catalog id has an in-world message",
    "Compendium" in missing_detail.json()["detail"],
)

# Given: a sworn movement with a matching vendored row. When: the sources are
# merged. Then: sworn coaching remains intact while imported classification is retained.
dumbbell_bench = by_name["Dumbbell Bench Press"]
ok(
    "sworn collision keeps its scheme and how",
    dumbbell_bench["scheme"] == ["reps", 8, 12]
    and dumbbell_bench["how"] == exercises.EXERCISES["Dumbbell Bench Press"]["how"],
)
ok(
    "sworn collision keeps imported classifications",
    dumbbell_bench["force"] is not None
    and dumbbell_bench["level"] is not None
    and dumbbell_bench["mechanic"] is not None
    and dumbbell_bench["primaryMuscles"],
)
ok(
    "only sworn records carry coaching fields",
    all(
        row["scheme"] is not None and row["how"] is not None
        if row["name"] in exercises.EXERCISES
        else row["scheme"] is None and row["how"] is None
        for row in rows
    ),
)
sworn_rows = [by_name[name] for name in exercises.EXERCISES]
ok(
    "all sworn movements have complete display classifications",
    all(
        row["primaryMuscles"]
        and row["force"] is not None
        and row["level"] is not None
        and row["mechanic"] is not None
        for row in sworn_rows
    ),
)
for sworn_name, expected in VALE_ONLY_CLASSIFICATIONS.items():
    merged = by_name[sworn_name]
    legacy = legacy_by_name[sworn_name]
    ok(
        f"{sworn_name} keeps authored display data and game mechanics",
        all(merged[field] == value for field, value in expected.items())
        and merged["groups"] == legacy["groups"]
        and merged["scheme"] == list(exercises.EXERCISES[sworn_name]["scheme"])
        and merged["how"] == legacy["how"],
    )
ok(
    "Kettlebell Halo preserves its intentionally empty secondary muscles",
    by_name["Kettlebell Halo"]["primaryMuscles"] == ["shoulders"]
    and by_name["Kettlebell Halo"]["secondaryMuscles"] == [],
)
for upstream_name, force in IMPORTED_FORCE_OVERRIDES.items():
    source = imported_exercises.find(upstream_name)
    ok(
        f"{upstream_name} receives its approved force overlay",
        source is not None and source.force == force,
    )
loaded_carry_names = {row["name"] for row in rows if row["force"] == "loaded carry"}
ok(
    "merged catalog exposes the four unique loaded carries",
    loaded_carry_names == {"Farmer Carry", "Rickshaw Carry", "Yoke Walk", "Conan's Wheel"},
)
null_force_rows = [row for row in rows if row["force"] is None]
ok(
    "only the intended null forces remain, including all cardio rows",
    len(null_force_rows) == 17
    and len([row for row in null_force_rows if row["category"] == "cardio"]) == 13,
)
ok("Farmer Carry inherits its loaded-carry force", by_name["Farmer Carry"]["force"] == "loaded carry")

for sworn_name, upstream_name in APPROVED_ALIASES.items():
    source = imported_exercises.find(upstream_name)
    merged = by_name[sworn_name]
    ok(
        f"approved {sworn_name} alias coalesces with source classifications",
        source is not None
        and upstream_name not in by_name
        and merged["aliases"] == [upstream_name]
        and merged["scheme"] == list(exercises.EXERCISES[sworn_name]["scheme"])
        and merged["how"] == exercises.EXERCISES[sworn_name]["how"]
        and merged["force"] == source.force
        and merged["level"] == source.level
        and merged["mechanic"] == source.mechanic
        and merged["primaryMuscles"] == list(source.primary_muscles)
        and merged["secondaryMuscles"] == list(source.secondary_muscles),
    )
ok(
    "manual display equipment uses the vendor vocabulary only in the merged catalog",
    by_name["Kettlebell Swing"]["equipment"] == "kettlebells"
    and by_name["Pull-Up"]["equipment"] == "body only"
    and exercises.EXERCISES["Kettlebell Swing"]["equipment"] == "kettlebell"
    and exercises.EXERCISES["Pull-Up"]["equipment"] == "bodyweight",
)
ok(
    "deliberately distinct kettlebell movements stay separate",
    all(
        name in by_name
        for name in (
            "Kettlebell Halo",
            "Kettlebell Deadlift",
            "Kettlebell Swing",
            "Kettlebell Turkish Get-Up (Squat style)",
        )
    ),
)

legacy_after = client.get("/api/exercises")
ok(
    "new catalog leaves the legacy exercise response byte-identical",
    legacy_after.content == legacy_before.content,
)

# Given: one source row lacks every optional display field. When: the adapter
# reads it. Then: that row remains usable and its unknown values are explicit.
source_path = imported_exercises.SOURCE_PATH
optional_source = Path(SCRATCH) / "optional-fields-missing.json"
optional_payload = json.loads(source_path.read_text(encoding="utf-8"))
optional_name = optional_payload[0]["name"]
for optional_field in ("equipment", "force", "level", "mechanic", "instructions"):
    optional_payload[0].pop(optional_field, None)
optional_source.write_text(json.dumps(optional_payload), encoding="utf-8")
imported_exercises.SOURCE_PATH = optional_source
imported_exercises.clear_cache()
try:
    optional_rows = {row["name"]: row for row in catalog_payload()["exercises"]}
    optional_row = optional_rows[optional_name]
    ok(
        "missing optional source fields keep the imported row usable",
        optional_row["equipment"] is None
        and optional_row["force"] is None
        and optional_row["level"] is None
        and optional_row["mechanic"] is None,
    )
    optional_detail = client.get(f"/api/catalog/{optional_row['id']}").json()
    ok("missing optional instructions stay explicit in detail", optional_detail["instructions"] == [])
finally:
    imported_exercises.SOURCE_PATH = source_path
    imported_exercises.clear_cache()

# Given: a malformed persisted source file. When: the state and catalog load.
# Then: imported rows degrade to none while the sworn catalog and game boot survive.
malformed_source = Path(SCRATCH) / "malformed-exercises.json"
malformed_source.write_text("{not json", encoding="utf-8")
imported_exercises.SOURCE_PATH = malformed_source
imported_exercises.clear_cache()
try:
    state = client.get("/api/state")
    malformed_rows = catalog_payload()["exercises"]
    ok("malformed source does not break state", state.status_code == 200)
    ok(
        "malformed source leaves only sworn catalog rows",
        len(malformed_rows) == len(exercises.EXERCISES)
        and {row["name"] for row in malformed_rows} == set(exercises.EXERCISES),
    )
finally:
    imported_exercises.SOURCE_PATH = source_path
    imported_exercises.clear_cache()



# Given: the app reads its imported catalog from a path outside app/ and
# static/. When: the container image is built. Then: that path is copied in,
# because a missing source degrades silently to sworn-only rather than erroring
# — which is exactly how it shipped broken to production once.
ROOT = Path(__file__).resolve().parents[1]
dockerfile = (ROOT / "Dockerfile").read_text(encoding="utf-8")
copied = [
    line.split()[1]
    for line in dockerfile.splitlines()
    if line.startswith("COPY ") and len(line.split()) >= 3
]
source_rel = imported_exercises.SOURCE_PATH.resolve().relative_to(ROOT)
ok(
    f"Dockerfile copies {source_rel.parts[0]}/ so the imported catalog exists in the container",
    any(source_rel.parts[0] == Path(c).parts[0] for c in copied),
)

print("EXERCISE CATALOG PASSED")

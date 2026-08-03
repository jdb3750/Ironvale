"""Exercise catalog with muscle-group mappings and how-to cues.
Used for quest generation, recency tracking, and the Compendium."""

from typing import Optional

from .imported_exercises import (
    FREE_EXERCISE_DB_MUSCLE_GROUPS,
    ImportedExercise,
    category_for,
    find as find_imported,
    groups_for as imported_groups_for,
    normalize_name,
    rows as imported_rows,
)

GROUPS = ["legs", "posterior", "chest", "back", "shoulders", "arms", "core"]
MUSCLES = tuple(FREE_EXERCISE_DB_MUSCLE_GROUPS)

# equipment: kettlebell / barbell / dumbbell / bodyweight
EXERCISES = {
    # ---- kettlebell ----
    "Kettlebell Swing": {
        "equipment": "kettlebell", "groups": ["posterior", "core"], "scheme": ("reps", 10, 20),
        "how": "Hinge at the hips, hike the bell back, then snap the hips forward to float it to chest height. Arms are ropes — all power comes from the hips.",
    },
    "Goblet Squat": {
        "equipment": "kettlebell", "groups": ["legs"], "scheme": ("reps", 8, 12),
        "how": "Hold the bell at your chest, elbows tucked. Sit down between your heels with a tall chest, then stand tall.",
    },
    "Kettlebell Clean & Press": {
        "equipment": "kettlebell", "groups": ["shoulders", "legs"], "scheme": ("reps", 5, 8),
        "how": "Clean the bell to the rack position without banging your forearm, brace, then press to lockout overhead. Lower with control.",
    },
    "Kettlebell Snatch": {
        "equipment": "kettlebell", "groups": ["posterior", "shoulders"], "scheme": ("reps", 6, 10),
        "how": "One motion: hike, hip snap, and punch through at the top so the bell lands softly overhead. It should float, never crash.",
    },
    "Turkish Get-Up": {
        "equipment": "kettlebell", "groups": ["core", "shoulders"], "scheme": ("reps", 2, 4),
        "how": "Floor to standing with the bell locked overhead, in stages: to the elbow, to the hand, bridge, sweep the leg, lunge, stand. Then reverse. Slow is correct.",
    },
    "Kettlebell Row": {
        "equipment": "kettlebell", "groups": ["back", "arms"], "scheme": ("reps", 8, 12),
        "how": "Hinge with a flat back and pull the bell to your hip. Squeeze the shoulder blade at the top; no shrugging or heaving.",
    },
    "Kettlebell Floor Press": {
        "equipment": "kettlebell", "groups": ["chest", "arms"], "scheme": ("reps", 8, 12),
        "how": "On your back, elbow at ~45 degrees, press the bell to lockout. Let the elbow rest on the floor a beat between reps.",
    },
    "Kettlebell Halo": {
        "equipment": "kettlebell", "groups": ["shoulders", "core"], "scheme": ("reps", 8, 12),
        "how": "Circle the bell slowly around your head at collar height, both directions. Ribs down; the trunk stays perfectly still.",
    },
    "Farmer Carry": {
        "equipment": "kettlebell", "groups": ["core", "back"], "scheme": ("steps", 30, 60),
        "how": "Pick up heavy bells, stand tall, and walk. Shoulders packed, no leaning. Continue until your grip files a complaint.",
    },
    "Kettlebell Lunge": {
        "equipment": "kettlebell", "groups": ["legs"], "scheme": ("reps", 6, 10),
        "how": "Bell at the chest or by your side. Take a long step, let the back knee kiss the floor, and drive up through the front heel.",
    },
    "Kettlebell Deadlift": {
        "equipment": "kettlebell", "groups": ["posterior", "legs"], "scheme": ("reps", 8, 12),
        "how": "Bell between the feet. Hinge with a flat back, grip, and push the floor away. Finish tall — the lockout is hips, not lean-back.",
    },
    # ---- barbell / dumbbell ----
    "Back Squat": {
        "equipment": "barbell", "groups": ["legs", "posterior"], "scheme": ("reps", 5, 8),
        "how": "Bar on the traps, big breath and brace, sit down to below parallel with knees tracking over toes, then drive up.",
    },
    "Deadlift": {
        "equipment": "barbell", "groups": ["posterior", "back"], "scheme": ("reps", 3, 6),
        "how": "Bar over midfoot. Hinge, flat back, wedge yourself in, and push the floor away. Lock out with the hips; never yank with the back.",
    },
    "Bench Press": {
        "equipment": "barbell", "groups": ["chest", "arms"], "scheme": ("reps", 5, 8),
        "how": "Shoulder blades pinned, feet planted. Lower the bar to mid-chest and press to lockout, wrists stacked over elbows.",
    },
    "Overhead Press": {
        "equipment": "barbell", "groups": ["shoulders", "arms"], "scheme": ("reps", 5, 8),
        "how": "Squeeze the glutes, brace hard, press the bar past your face and lock out overhead. If the legs help, it's a different exercise.",
    },
    "Barbell Row": {
        "equipment": "barbell", "groups": ["back", "arms"], "scheme": ("reps", 6, 10),
        "how": "Hinge to roughly 45 degrees and pull the bar to your lower ribs. Control the descent; momentum is lying about your strength.",
    },
    "Romanian Deadlift": {
        "equipment": "barbell", "groups": ["posterior"], "scheme": ("reps", 6, 10),
        "how": "From standing, push the hips back with soft knees until the hamstrings object, then stand. The bar never leaves your legs.",
    },
    "Dumbbell Curl": {
        "equipment": "dumbbell", "groups": ["arms"], "scheme": ("reps", 8, 12),
        "how": "Elbows pinned to your sides. Curl, squeeze, lower slowly. If you're swinging, the dumbbell is curling you.",
    },
    "Dumbbell Shoulder Press": {
        "equipment": "dumbbell", "groups": ["shoulders"], "scheme": ("reps", 8, 12),
        "how": "Dumbbells at the ears, press to lockout without flaring the ribs. Seated is stricter; standing is braver.",
    },
    "Dumbbell Bench Press": {
        "equipment": "dumbbell", "groups": ["chest", "arms"], "scheme": ("reps", 8, 12),
        "how": "Like the barbell bench with a deeper stretch. Control the bottom and don't let the bells drift apart.",
    },
    # ---- bodyweight ----
    "Pull-Up": {
        "equipment": "bodyweight", "groups": ["back", "arms"], "scheme": ("reps", 4, 10),
        "how": "From a dead hang, pull until your chin clears the bar — chest up, elbows driving down. No swinging.",
    },
    "Push-Up": {
        "equipment": "bodyweight", "groups": ["chest", "arms"], "scheme": ("reps", 10, 20),
        "how": "Rigid plank, hands under shoulders. Chest to the floor and press away, elbows at ~45 degrees. Hips never sag.",
    },
    "Dip": {
        "equipment": "bodyweight", "groups": ["chest", "arms"], "scheme": ("reps", 5, 12),
        "how": "Support on the bars, lower until the shoulders dip below the elbows, press out. Lean forward for chest, stay upright for triceps.",
    },
    "Plank": {
        "equipment": "bodyweight", "groups": ["core"], "scheme": ("seconds", 30, 60),
        "how": "Forearms down, body one rigid line, glutes and ribs locked in. Breathe small. Shaking is the point.",
    },
    "Hanging Leg Raise": {
        "equipment": "bodyweight", "groups": ["core"], "scheme": ("reps", 6, 12),
        "how": "Hang from a bar, ribs down, and raise the legs (or knees) without swinging. Lower slower than you lifted.",
    },
    "Bulgarian Split Squat": {
        "equipment": "bodyweight", "groups": ["legs"], "scheme": ("reps", 8, 12),
        "how": "Rear foot up on a bench, drop the back knee straight down, drive up through the front heel. Cursed, and extremely effective.",
    },
}

KB_NAMES = [k for k, v in EXERCISES.items() if v["equipment"] == "kettlebell"]

_MANUAL_GROUPS = {
    normalize_name(name): exercise["groups"]
    for name, exercise in EXERCISES.items()
}
_MANUAL_NAMES = {normalize_name(name): name for name in EXERCISES}

_MANUAL_SOURCE_ALIASES = {
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

_VALE_ONLY_CATALOG_CLASSIFICATIONS = {
    "Kettlebell Swing": {
        "primaryMuscles": ["hamstrings"], "secondaryMuscles": ["glutes", "lower back", "calves", "shoulders"],
        "force": "pull", "level": "intermediate", "mechanic": "compound", "category": "strength",
    },
    "Kettlebell Clean & Press": {
        "primaryMuscles": ["shoulders"], "secondaryMuscles": ["triceps", "traps", "quadriceps", "glutes", "hamstrings", "lower back", "abdominals", "calves", "middle back"],
        "force": "push", "level": "intermediate", "mechanic": "compound", "category": "strength",
    },
    "Kettlebell Snatch": {
        "primaryMuscles": ["shoulders"], "secondaryMuscles": ["hamstrings", "glutes", "lower back", "traps", "calves", "triceps"],
        "force": "pull", "level": "expert", "mechanic": "compound", "category": "strength",
    },
    "Kettlebell Row": {
        "primaryMuscles": ["middle back"], "secondaryMuscles": ["biceps", "lats"],
        "force": "pull", "level": "beginner", "mechanic": "compound", "category": "strength",
    },
    "Kettlebell Floor Press": {
        "primaryMuscles": ["chest"], "secondaryMuscles": ["triceps", "shoulders"],
        "force": "push", "level": "beginner", "mechanic": "compound", "category": "strength",
    },
    "Kettlebell Halo": {
        "primaryMuscles": ["shoulders"], "secondaryMuscles": [],
        "force": "push", "level": "beginner", "mechanic": "isolation", "category": "strength",
    },
    "Kettlebell Lunge": {
        "primaryMuscles": ["quadriceps"], "secondaryMuscles": ["glutes", "hamstrings", "calves"],
        "force": "push", "level": "beginner", "mechanic": "compound", "category": "strength",
    },
    "Kettlebell Deadlift": {
        "primaryMuscles": ["hamstrings"], "secondaryMuscles": ["glutes", "lower back", "quadriceps", "calves", "abdominals", "middle back"],
        "force": "pull", "level": "beginner", "mechanic": "compound", "category": "strength",
    },
}

_VALE_ONLY_CATALOG_IDS = {
    "Kettlebell Swing": "Kettlebell_Swing",
    "Kettlebell Clean & Press": "Kettlebell_Clean_&_Press",
    "Kettlebell Snatch": "Kettlebell_Snatch",
    "Kettlebell Row": "Kettlebell_Row",
    "Kettlebell Floor Press": "Kettlebell_Floor_Press",
    "Kettlebell Halo": "Kettlebell_Halo",
    "Kettlebell Lunge": "Kettlebell_Lunge",
    "Kettlebell Deadlift": "Kettlebell_Deadlift",
}

_DISPLAY_EQUIPMENT = {
    "kettlebell": "kettlebells",
    "bodyweight": "body only",
}


def groups_for(exercise):
    # Copy: _MANUAL_GROUPS holds the very lists inside EXERCISES, so returning one
    # directly hands callers a live reference to the catalog. A single append by
    # any caller would corrupt the sworn entry for the life of the process.
    # imported_groups_for already builds a fresh list per call.
    manual_groups = _MANUAL_GROUPS.get(normalize_name(exercise))
    return list(manual_groups) if manual_groups is not None else imported_groups_for(exercise)


def imported_category_for(exercise):
    # Imported rows are attribution-only; quest generation must continue to
    # select solely from EXERCISES, never from the local imported catalog.
    if normalize_name(exercise) in _MANUAL_GROUPS:
        return None
    return category_for(exercise)


def _source_fields(imported: Optional[ImportedExercise]):
    if imported is None:
        return {
            "id": None,
            "aliases": [],
            "force": None,
            "level": None,
            "mechanic": None,
            "equipment": None,
            "primaryMuscles": [],
            "secondaryMuscles": [],
            "instructions": [],
            "category": None,
        }
    return {
        "id": imported.exercise_id,
        "aliases": [],
        "force": imported.force,
        "level": imported.level,
        "mechanic": imported.mechanic,
        "equipment": imported.equipment,
        "primaryMuscles": list(imported.primary_muscles),
        "secondaryMuscles": list(imported.secondary_muscles),
        "instructions": list(imported.instructions),
        "category": imported.category,
    }


def _manual_source_name(name):
    return _MANUAL_SOURCE_ALIASES.get(name, name)


def _manual_source_fields(name, imported: Optional[ImportedExercise]):
    record = _source_fields(imported)
    record.update(_VALE_ONLY_CATALOG_CLASSIFICATIONS.get(name, {}))
    return record


def muscles_for(exercise):
    manual_name = _MANUAL_NAMES.get(normalize_name(exercise))
    if manual_name is None:
        imported = find_imported(exercise)
        return (
            (imported.primary_muscles, imported.secondary_muscles)
            if imported is not None
            else ((), ())
        )
    imported = find_imported(_manual_source_name(manual_name))
    fields = _manual_source_fields(manual_name, imported)
    return tuple(fields["primaryMuscles"]), tuple(fields["secondaryMuscles"])


def _manual_catalog_record(name, exercise, imported: Optional[ImportedExercise], alias):
    record = _manual_source_fields(name, imported)
    record.update({
        "id": record["id"] or _VALE_ONLY_CATALOG_IDS.get(name),
        "name": name,
        "aliases": [alias] if alias else [],
        "equipment": _DISPLAY_EQUIPMENT.get(exercise["equipment"], exercise["equipment"]),
        "groups": list(exercise["groups"]),
        "scheme": list(exercise["scheme"]),
        "how": exercise["how"],
    })
    return record


def _imported_catalog_record(imported: ImportedExercise):
    record = _source_fields(imported)
    record.update({
        "name": imported.name,
        "groups": imported_groups_for(imported.name),
        "scheme": None,
        "how": None,
    })
    return record


def _full_catalog():
    imported_by_name = {normalize_name(imported.name): imported for imported in imported_rows()}
    merged = []
    for name, exercise in EXERCISES.items():
        alias = _MANUAL_SOURCE_ALIASES.get(name)
        imported = imported_by_name.pop(normalize_name(_manual_source_name(name)), None)
        merged.append(_manual_catalog_record(name, exercise, imported, alias))
    merged.extend(_imported_catalog_record(imported) for imported in imported_by_name.values())
    return sorted(merged, key=lambda record: record["name"].casefold())


def catalog():
    return [
        {key: value for key, value in record.items() if key != "instructions"}
        for record in _full_catalog()
    ]


def catalog_detail(exercise_id):
    return next(
        (record for record in _full_catalog() if record["id"] == exercise_id),
        None,
    )

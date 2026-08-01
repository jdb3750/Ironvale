import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Final, NamedTuple, Optional, Tuple


SOURCE_PATH = Path(__file__).resolve().parents[1] / "vendor/free-exercise-db/exercises.json"

FREE_EXERCISE_DB_MUSCLE_GROUPS: Final[Dict[str, Optional[str]]] = {
    "quadriceps": "legs",
    "calves": "legs",
    "adductors": "legs",
    "abductors": "legs",
    "hamstrings": "posterior",
    "glutes": "posterior",
    "lower back": "posterior",
    "chest": "chest",
    "lats": "back",
    "middle back": "back",
    "shoulders": "shoulders",
    "traps": "shoulders",
    "biceps": "arms",
    "triceps": "arms",
    "forearms": "arms",
    "abdominals": "core",
    "neck": None,
}

# Iron Vale adds "loaded carry" to the source Force enum: pull | push | static | loaded carry.
FREE_EXERCISE_DB_FORCE_OVERRIDES: Final[Dict[str, str]] = {
    "Farmer's Walk": "loaded carry",
    "Rickshaw Carry": "loaded carry",
    "Yoke Walk": "loaded carry",
    "Conan's Wheel": "loaded carry",
    "Band Assisted Pull-Up": "pull",
    "Incline Inner Biceps Curl": "pull",
    "Internal Rotation with Band": "pull",
    "Push-Up Wide": "push",
    "Smith Machine Decline Press": "push",
    "Single Dumbbell Raise": "push",
    "Inchworm": "static",
    "Lying Prone Quadriceps": "static",
}


class ImportedExercise(NamedTuple):
    name: str
    primary_muscles: Tuple[str, ...]
    secondary_muscles: Tuple[str, ...]
    muscles: Tuple[str, ...]
    category: str
    equipment: Optional[str]
    force: Optional[str]
    level: Optional[str]
    mechanic: Optional[str]
    instructions: Tuple[str, ...]
    exercise_id: Optional[str]


class ImportedCatalog(NamedTuple):
    rows: Dict[str, ImportedExercise]
    skipped_by_reason: Tuple[Tuple[str, int], ...]
    source_error: Optional[str]


def normalize_name(name) -> str:
    return " ".join(name.casefold().split()) if isinstance(name, str) else ""


def _muscles(value) -> Optional[Tuple[str, ...]]:
    if not isinstance(value, list) or not all(isinstance(muscle, str) for muscle in value):
        return None
    return tuple(value)


def _optional_string(value) -> Optional[str]:
    return value if isinstance(value, str) else None


def _instructions(value) -> Tuple[str, ...]:
    return tuple(value) if isinstance(value, list) and all(isinstance(step, str) for step in value) else ()


def _with_force_override(imported: ImportedExercise) -> ImportedExercise:
    force = FREE_EXERCISE_DB_FORCE_OVERRIDES.get(imported.name)
    return imported._replace(force=force) if force is not None else imported


def _adapt_free_exercise_db(record) -> Tuple[Optional[ImportedExercise], Optional[str]]:
    if not isinstance(record, dict):
        return None, "invalid record"
    name = record.get("name")
    category = record.get("category")
    primary = _muscles(record.get("primaryMuscles"))
    secondary = _muscles(record.get("secondaryMuscles"))
    if not isinstance(name, str) or not normalize_name(name):
        return None, "invalid record"
    if not isinstance(category, str) or primary is None or secondary is None:
        return None, "invalid record"
    muscles = tuple(dict.fromkeys(primary + secondary))
    unknown = tuple(muscle for muscle in muscles if muscle not in FREE_EXERCISE_DB_MUSCLE_GROUPS)
    if unknown:
        return None, "unknown muscle"
    imported = ImportedExercise(
        name=name,
        primary_muscles=primary,
        secondary_muscles=secondary,
        muscles=muscles,
        category=category,
        equipment=_optional_string(record.get("equipment")),
        force=_optional_string(record.get("force")),
        level=_optional_string(record.get("level")),
        mechanic=_optional_string(record.get("mechanic")),
        instructions=_instructions(record.get("instructions")),
        exercise_id=_optional_string(record.get("id")),
    )
    return _with_force_override(imported), None


@lru_cache(maxsize=None)
def _catalog(path: Path) -> ImportedCatalog:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except OSError:
        return ImportedCatalog({}, (), "source file unavailable")
    except UnicodeDecodeError:
        return ImportedCatalog({}, (), "source file is not UTF-8")
    except json.JSONDecodeError:
        return ImportedCatalog({}, (), "source file is not valid JSON")
    if not isinstance(payload, list):
        return ImportedCatalog({}, (), "source root is not a list")
    catalog = {}
    skipped_by_reason = {}
    for record in payload:
        imported, reason = _adapt_free_exercise_db(record)
        if imported is None:
            skipped_by_reason[reason] = skipped_by_reason.get(reason, 0) + 1
            continue
        key = normalize_name(imported.name)
        if key in catalog:
            skipped_by_reason["duplicate normalized name"] = (
                skipped_by_reason.get("duplicate normalized name", 0) + 1
            )
            continue
        catalog[key] = imported
    return ImportedCatalog(catalog, tuple(skipped_by_reason.items()), None)


def clear_cache() -> None:
    _catalog.cache_clear()


def find(name) -> Optional[ImportedExercise]:
    return _catalog(SOURCE_PATH).rows.get(normalize_name(name))


def rows() -> Tuple[ImportedExercise, ...]:
    return tuple(_catalog(SOURCE_PATH).rows.values())


def category_for(name) -> Optional[str]:
    imported = find(name)
    return imported.category if imported else None


def status():
    catalog = _catalog(SOURCE_PATH)
    skipped_by_reason = dict(catalog.skipped_by_reason)
    return {
        "loaded_rows": len(catalog.rows),
        "skipped_rows": sum(skipped_by_reason.values()),
        "skipped_by_reason": skipped_by_reason,
        "source_error": catalog.source_error,
    }


def _fold_muscles(muscles: Tuple[str, ...]) -> list[str]:
    # _adapt_free_exercise_db guarantees that every muscle is a fold-table key.
    # Keep the source's 17 muscles intact in storage; folding here preserves
    # the per-muscle data needed for the future body map without a re-import.
    return list(dict.fromkeys(
        group
        for muscle in muscles
        if (group := FREE_EXERCISE_DB_MUSCLE_GROUPS[muscle]) is not None
    ))


def groups_for(name) -> list[str]:
    imported = find(name)
    return _fold_muscles(imported.muscles) if imported else []

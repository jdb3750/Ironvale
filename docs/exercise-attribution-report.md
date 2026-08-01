# Exercise attribution catalog — Brief 2 report

## Source

Vendored once from `yuhonas/free-exercise-db` to
`vendor/free-exercise-db/exercises.json`, without reformatting.

| Check | Result |
| --- | --- |
| Records | 873 |
| SHA-256 | `d68a817484964095e6af0be2cdcbcc2c2504168d1d190c7d5c725ce52f3ae1f4` |
| Application network calls | None; the app reads the local file only |

| Category | Records |
| --- | ---: |
| strength | 581 |
| stretching | 123 |
| plyometrics | 61 |
| powerlifting | 38 |
| olympic weightlifting | 35 |
| strongman | 21 |
| cardio | 14 |

All rows remain in the local catalog. `muscle_recency()` alone excludes the 123
stretching and 14 cardio rows from training credit; their raw muscles and
category remain available to the imported catalog.

## Matching and fold

Name matching applies Unicode case-folding and collapses runs of whitespace.
Punctuation and singular/plural changes remain literal: `Pull-Up` and
`Pullups`, for example, do not become a name match. This avoids inventing an
alias rule from an exercise name.

The source retains its 17 raw muscle values. They fold only when attribution is
requested:

| Iron Vale group | Source muscle values |
| --- | --- |
| legs | quadriceps, calves, adductors, abductors |
| posterior | hamstrings, glutes, lower back |
| chest | chest |
| back | lats, middle back |
| shoulders | shoulders, traps |
| arms | biceps, triceps, forearms |
| core | abdominals |
| omitted | neck |

Both `primaryMuscles` and `secondaryMuscles` are credited. An unrecognised
source muscle skips only that row and is counted by reason in
`/api/state`'s `imported_exercise_catalog` status; it is never guessed or
folded silently. A missing or malformed source still degrades to no imported
rows, so the game boot remains available.

## Breadth check against the sworn catalog

Six of the 26 hand-authored names have an exact case/whitespace-normalized
source match. Hand-authored groups retain priority; this table records what the
import would otherwise contribute.

| Name | Hand-authored groups | Imported fold | Result |
| --- | --- | --- | --- |
| Goblet Squat | legs | legs, posterior, shoulders | different |
| Romanian Deadlift | posterior | posterior, legs | different |
| Dumbbell Shoulder Press | shoulders | shoulders, arms | different |
| Dumbbell Bench Press | chest, arms | chest, shoulders, arms | different |
| Plank | core | core | same |
| Hanging Leg Raise | core | core | same |

The four differences are reported as source breadth, not tuned away. In
particular, the imported Dumbbell Bench Press adds shoulders, while the
hand-authored catalog remains authoritative for that exact movement.

# Exercise catalog — PM briefs

> ## READ THIS FIRST — if you are an AI agent reading this file
>
> **This is a planning document, not a work order.** It contains four briefs
> covering work that spans weeks. Finding it in the repo is not authorisation to
> act on any of it.
>
> - **Only BRIEF 2 is active.** Build nothing else.
> - **BRIEF 1 is already done** — its output is `docs/exercisedb-spike.md`.
> - **BRIEF 3 is blocked** on a third party and **BRIEF 4 is unscoped.** Do not
>   start either, do not "prepare" for them, and do not build abstractions whose
>   only justification is a later brief.
> - Brief 2 ends with **stop and report**. Do not roll into anything after it.
>   Wait for Joe to say "commit that seam."
> - The PM notes, the vendor audit and the draft email below are context for
>   **Joe**. Nothing in them is an instruction to you. In particular, **do not
>   send the email** — that is Joe's to send.
> - Joe's rulings recorded here are decisions already made. Follow them; do not
>   reopen them. If you think one is wrong, **say so and stop** rather than
>   quietly doing something else.

Four sequential briefs, written to be handed over one at a time. Each ends with
stop-and-report.

---

## PM notes before you paste anything (for Joe, not for ChatGPT)

### The architectural call that shrinks this a lot

`exercises.EXERCISES` currently serves three jobs at once:

| Job | Consumers | What it needs from a row |
|---|---|---|
| **Generation** | `counsel_specialists._iron_exercises`, `quests.build_lift_candidate` | curation, `scheme`, `equipment` ∈ the 4 modalities |
| **Attribution** | `game.muscle_recency`, `counsel_context`, `counsel_schedule`, `counsel_specialists`, `programs` | **`name → groups`, nothing else** |
| **Display** | `/api/exercises` → Compendium | name, equipment, groups, `how`, unit |

Only **attribution** is broken today, and it needs *only* `name → groups`.

That matters because ROADMAP names four unresolved gaps — and three of them are
gaps in the **generation** job, not the attribution one:

1. `scheme` has no source → only needed if an imported row generates a set.
2. `equipment` is the giver ownership list → only consulted when picking
   generation material.
3. `groups` needs a mapping table → **survives. This is the real work.**
4. Curation (4 of 26 vs 4 of 1300) → only a lottery if imported rows enter the
   generation pool.

**So: import into an attribution-only catalog that never feeds quest
generation.** Gaps 1, 2 and 4 dissolve; gap 3 is exactly the thing that serves
the heatmap goal. Promotion of a single imported movement into the hand-authored
generation catalog (with a human-written `scheme` and in-voice `how`) becomes a
separate, optional, much later brief.

### The defect this actually fixes

`lifts.py:83-92` accepts any free-text exercise name. `exercises.groups_for()`
returns `[]` for anything outside the 26. So today every off-catalog movement Joe
logs — rings, sliders, bands, ab wheel, calf raises, step-ups, hip thrusts,
hamstring curls — contributes **zero** to `muscle_recency()`, the Muscle Ledger
and the body map, and shows no groups in custom routines (`programs.py:202`).
The heatmap isn't approximate for those movements; it's blind to them.

### Vendor finding — this changed the risk order

"ExerciseDB" is not one thing, and its ecosystem is visibly unsettled. Checked
2026-07-31:

- `github.com/ExerciseDB/exercisedb-api` — AGPL-3.0 code, RapidAPI-hosted, 11k+
  exercises, © DevWorx Consulting LLC, has a Terms of Use.
- `github.com/bryanprimus/exercisedb-api` — returns **HTTP 451** (the status
  GitHub serves for DMCA-takedown'd repos).
- `exercisedb-api.vercel.app` — returns **HTTP 402 Payment Required**.
- `github.com/bootstrapping-lab/exercisedb-api` — still up, one-click self-host,
  V1 open source, ~1500–5000 exercises depending on which line you read.

I observed those status codes directly; I'm not asserting *why* they're set.

Also: **the field shape differs between v1 and v2.** v1 is singular
(`bodyPart`, `target`, `equipment`), v2 is plural arrays (`bodyParts`,
`targetMuscles`, `equipments`, `exerciseId`). A mapping table written against
one does not work against the other.

ROADMAP says BYO-key removes the licensing question. That's right for
*redistribution* — but it doesn't make the vendor stable. So the briefs below
**decouple the heatmap fix from the live API**: Brief 2 imports from a JSON file
on disk and fixes the heatmap; Brief 3 adds the Settings connector as a *refresh*
path. If the vendor gets messier, you keep the win from Brief 2.

### Sequencing

| # | Brief | Ships |
|---|---|---|
| 1 | Spike — vendor + mapping table, no app code | a doc + a sample JSON |
| 2 | Attribution catalog + file import | **accurate heatmap** |
| 3 | Settings APIs connector (BYO key) | live refresh |
| 4 | Compendium surface / promotion | optional, later |

---

# BRIEF 1 — ExerciseDB spike (no app code) — **DONE 2026-07-31**

Output: `docs/exercisedb-spike.md` and `docs/exercisedb-sample.json`. Kept for
the record; **do not re-run it.** Original text follows.

> ## Task: ExerciseDB spike for Iron Vale
>
> You are working in the Iron Vale repo (`~/Code/iron-vale`). Read `AGENTS.md`
> first — it is canonical. Read the "ExerciseDB integration" entry in
> `ROADMAP.md` and read `app/exercises.py` in full before starting.
>
> **This is a spike. You are not building a feature. You will write no code
> under `app/` or `static/`.** The deliverable is a written report plus one
> sample data file. If you find yourself editing the app, you have
> misunderstood the task — stop and report instead.
>
> ### Why
>
> Iron Vale's exercise catalog is 26 hand-authored movements. Joe's real
> training week uses roughly a dozen the catalog lacks (rings, sliders, bands,
> ab wheel, calf raises, step-ups, hip thrusts, hamstring curls). Those log
> fine — `app/lifts.py` accepts free text — but `exercises.groups_for()`
> returns `[]` for them, so they contribute nothing to `game.muscle_recency()`
> and are invisible to the Muscle Ledger and body map. We want a larger
> reference catalog, chiefly so muscle attribution is accurate.
>
> ### What to produce
>
> Write `docs/exercisedb-spike.md` (create `docs/` if absent) and save one
> sample payload to `docs/exercisedb-sample.json`. Answer these, with evidence
> from a real fetched sample — not from documentation prose:
>
> **1. Which ExerciseDB, exactly?**
> The ecosystem is fragmented and partly unstable. As of 2026-07-31:
> `github.com/bryanprimus/exercisedb-api` returns HTTP 451;
> `exercisedb-api.vercel.app` returns HTTP 402; the RapidAPI-hosted
> `github.com/ExerciseDB/exercisedb-api` is AGPL-3.0 code with a separate Terms
> of Use and © DevWorx Consulting LLC; `github.com/bootstrapping-lab/exercisedb-api`
> is still reachable and self-hostable. Verify current state yourself. Report
> for each live candidate: auth model (direct key vs RapidAPI), free-tier
> limits, exercise count, whether a bulk/paginated export is possible, and
> whether a one-time fetch-and-cache is permitted by its terms. **Recommend one,
> and say what breaks if it disappears.**
>
> **2. What is the record shape?** v1 is singular (`bodyPart`, `target`,
> `equipment`); v2 is plural arrays (`bodyParts`, `targetMuscles`, `equipments`,
> `exerciseId`). Confirm which your recommended vendor serves. Paste two real
> records verbatim into the report.
>
> **3. The mapping table — this is the main deliverable.**
> Iron Vale has exactly seven groups (`exercises.GROUPS`): `legs`, `posterior`,
> `chest`, `back`, `shoulders`, `arms`, `core`. Enumerate **every distinct
> muscle/bodyPart value the vendor uses** and propose a fold onto those seven.
> Then report, with counts:
> - how many vendor values map cleanly to exactly one group,
> - how many are genuinely ambiguous (name them, don't average them),
> - how many map to nothing and what you'd do with them (cardio, stretching,
>   rehab, "waist", etc.),
> - what fraction of the total catalog the ambiguous ones represent.
> Sanity-check the fold against the existing 26: run our names through your
> proposed mapping where the vendor has a match, and report every case where it
> **disagrees with the hand-authored `groups`**. Disagreements are the finding —
> list them, don't reconcile them silently.
>
> **4. Do these dozen movements actually exist there?** rings (ring row, ring
> dip), sliders (slider hamstring curl, slider pike), band work, ab wheel
> rollout, calf raise, step-up, hip thrust, hamstring curl. For each: found or
> not, under what name, and what the vendor says its muscles are.
>
> **5. Cost of the fields we can't get.** The vendor supplies no rep
> prescription, so imported rows have no `scheme` — note that
> `quests.py:210` unpacks `EXERCISES[name]["scheme"]` for every generated set.
> The vendor's `instructions` are generic prose; our `how` is written in a
> specific in-world voice. Report roughly how much data volume image/GIF/video
> URLs represent and whether records are usable with those stripped.
>
> ### Explicitly out of scope — do NOT do these
>
> - Do not modify `app/exercises.py` or any other app file.
> - Do not add dependencies, or write an importer, migration, or endpoint.
> - Do not sign Joe up for anything, enter payment details, or accept terms.
>   If a candidate requires an account, **report that and stop** — Joe will do
>   it. Use free/unauthenticated sample endpoints for the sample fetch.
> - Do not download images, GIFs or videos.
> - Do not commit anything. Do not create a branch. Leave the work uncommitted
>   for Joe to review.
> - Do not propose expanding `GIVER_ARCHETYPES["strength"]["modalities"]`.
>   That tuple is the strength giver's ownership list, read by `main.py:266`
>   and `counsel_context_model.py:201`; changing it is a separate decision.
>
> ### Framing
>
> Iron Vale is a game. It does not diagnose, predict injury, prove its advice,
> or stand in for a professional. This catalog exists to make a pixel-art
> muscle heatmap less wrong and to give quests more variety. It is not a
> clinical reference. Do not build audit trails, provenance chains, tamper
> evidence, confidence scores or disclaimer prose — none of that is wanted.
>
> **If you find a surprise, report it rather than deciding.** A vendor that
> changed shape, a licence that forbids caching, a muscle vocabulary that
> doesn't fold cleanly — those are findings, and the report is where they go.
>
> When the report and sample file exist, **stop and report to Joe. Do not
> begin the import.**

---

# SPIKE OUTCOME — read before Brief 2 (updated 2026-07-31)

The spike landed (`docs/exercisedb-spike.md`). Its blocking finding is **verified**:
per AscendAPI's own [caching guide](https://docs.ascendapi.com/guides/caching),
"Caching of AscendAPI data is only permitted if your current plan explicitly
allows it," and persistent storage / bulk download requires contacting them.
This applies to free and paid plans alike. Iron Vale plainly qualifies under
their *eligibility* rules (non-commercial, self-hosted, community fitness
platform, attribution given) — but eligibility and storage rights are separate
clauses, and only the first is granted by default.

The spike's "no cache beyond one hour" came from the Terms page, which could not
be independently read. The caching guide is more generous (7 days+ for reference
lists); the gate is plan permission, not duration.

**Consequence: Brief 2 is now written source-agnostic.** An adapter normalizes
any source into one internal shape; the muscle fold is a per-source table. Ship
against the public-domain dataset now; add AscendAPI's adapter if permission
arrives, at which point the Settings connector (Brief 3) becomes meaningful as a
live refresh path.

Default source until permission lands: **[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)**,
Unlicense (public domain), 873 records, bundled `dist/exercises.json` (978 KB).
Verified 2026-07-31: 17 primary-muscle values, of which 14 fold cleanly onto
Iron Vale's seven, 2 are ambiguous (`lower back`, `traps` — the same two
ExerciseDB has), and 1 maps to nothing (`neck`, 8 records). `secondaryMuscles`
draws from the identical 17-value vocabulary, so it needs no extra mapping.
It also carries `mechanic`, `force`, `level` and `category`, which ExerciseDB
lacks and which are a defensible basis for the `scheme` gap later.

---

# BRIEF 2 — Attribution catalog + file import (the seam that pays)

Source-agnostic. Ready to paste.

> ## Task: make off-catalog exercises visible to the muscle heatmap
>
> Iron Vale repo. Read `AGENTS.md` first. Read `app/exercises.py`,
> `app/game.py:muscle_recency`, and `docs/exercisedb-spike.md`.
>
> ### The defect
>
> `app/lifts.py` accepts any free-text exercise name, but
> `exercises.groups_for()` returns `[]` for any name outside the 26 hand-authored
> entries. Every off-catalog movement therefore contributes nothing to
> `game.muscle_recency()`, so the Muscle Ledger and body map (`static/js/hall.js`,
> `bodyMapTag`) are blind to it, and custom routines show no groups
> (`programs.py:202`).
>
> ### The change — one seam only
>
> Add a **second, imported, attribution-only catalog** alongside the
> hand-authored one, and make `groups_for()` fall back to it.
>
> - Hand-authored `EXERCISES` stays exactly as it is and keeps priority. If a
>   name is in it, its `groups` win. Do not edit any of the 26 entries.
> - Imported rows carry **`name` plus the source's raw muscle values** (and
>   whatever key you need for lookup). No `scheme`, no `how`, no images.
>
> ### Store the 17 muscles, fold to 7 at the edge — do not fold at import
>
> The source's muscle vocabulary has **17 values**; Iron Vale's `exercises.GROUPS`
> has 7. **Persist the 17.** Fold to the 7 only at the consumer boundary, in one
> named function, so `groups_for()` and `muscle_recency()` behave exactly as they
> do today.
>
> Reason, so it does not get "simplified" later: Joe is hand-pixelling a body map
> that colours individual muscles. Folding at import is lossy in precisely the
> way that surface needs — `biceps`/`triceps`/`forearms` all collapse to `arms`,
> `quadriceps`/`calves`/`adductors`/`abductors` all collapse to `legs`. Storing
> the fold would force a re-import to get them back. **Write this as a comment at
> the boundary it protects.**
>
> Nothing in this brief may expose the 17 values to any consumer. Store them,
> fold them, stop.
>
> **Why a fold exists at all** (checked 2026-07-31, recorded so it is not
> re-litigated): the seven groups are almost entirely a *display* vocabulary.
> Nothing selects exercises by muscle group — the Council focus is by modality
> (`run`/`ride`/`swim`/`climb`/`strength`), and `target_groups` in
> `counsel_specialists.py` and `counsel_schedule.py` is a label on an offer, not
> a filter. The fold earns its keep in exactly two summarising consumers:
> `records.py:153`'s neglect warning (shows the 3 stalest groups past 10 days —
> at 17 values it would permanently read `neck`, `abductors`, `forearms`), and
> the offer label, which should say "targets legs, posterior" rather than naming
> five muscles. Do not widen the fold's job beyond those.
> - The app reads a **local JSON file on disk**. The file is fetched once, as a
>   setup step, and committed (see "Source and adapter" below). **The running app
>   must never make a network call for catalog data** — not per request, not at
>   boot, not on a schedule.
> - Cache/store it locally so it is not re-parsed per request.
> - Name matching must be case- and whitespace-insensitive, and you should
>   report — not silently invent — what you do about punctuation and plurals.
>
> ### Source and adapter
>
> Write the import behind a **small adapter** so the source is swappable: the
> adapter's job is `raw vendor record -> {name, groups}`, and the muscle fold is
> a per-source table. A second source must be addable without touching the
> lookup or its consumers. Do not build a plugin registry — one adapter, one
> table, one seam.
>
> Use **[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db)**
> (Unlicense / public domain, verified via GitHub licence metadata), file
> 873 records. Fetch **exactly** this URL and nothing else — do not follow links
> from it, and do not substitute a mirror:
>
> ```
> https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json
> ```
>
> Save it untouched to **`vendor/free-exercise-db/exercises.json`**. Iron Vale has
> no `dist/` directory and must not grow one, and the file must NOT go under
> `data/` — that path is gitignored and holds live player data.
>
> Before building, report the record count and the file's sha256. Expected 873
> records; the fold table below was derived from sha256
> `d68a817484964095e6af0be2cdcbcc2c2504168d1d190c7d5c725ce52f3ae1f4`. If yours
> differs, upstream has moved — **report the difference and stop**, rather than
> assuming the mapping still holds.
>
> **Store rich, expose narrow.** The vendored file stays in the repo verbatim as
> the source of record — do not hand-edit or reformat it. Derive
> the lookup the app reads (`name -> groups`, ~39 KB) from it. Do **not** adopt
> the vendor's record shape as Iron Vale's internal format, and do not author a
> bespoke general-purpose schema — the internal shape is exactly what today's
> consumers need and nothing more.
>
> Retain the source's `mechanic`, `force`, `level`, `category` and `equipment`
> in the vendored file (they are already there; just don't strip them). They are
> the likely basis for a future `scheme` default. **Nothing in this brief may
> read them.**
>
> The **written schema for the record shape** is
> [`wrkout/exercises.json` `types/exercise.d.ts`](https://github.com/wrkout/exercises.json/blob/master/types/exercise.d.ts)
> — the same 873-record, Unlicense lineage with the identical 17-value `Muscle`
> enum, but with a formal spec. Use it as the reference for field names and
> vocabulary; take the *data* from free-exercise-db's `dist/`, which is bundled
> and better maintained. (wrkout declares an `aliases` field — it is empty in
> every record sampled, so do not build on it.)
>
> Records carry `primaryMuscles[]` and `secondaryMuscles[]`, both drawn from the
> same 17-value vocabulary. **Credit both** — primary-only attribution is
> measurably thinner than the hand-authored catalog. Verified: `Pullups` is
> primary `lats`, secondary `biceps`+`middle back`, which folds to `back`+`arms`
> and reproduces our hand-authored Pull-Up exactly; primary-only would drop
> `arms`. The agreed fold:
>
> | Iron Vale group | Source muscle values |
> | --- | --- |
> | `legs` | `quadriceps`, `calves`, `adductors`, `abductors` |
> | `posterior` | `hamstrings`, `glutes`, `lower back` |
> | `chest` | `chest` |
> | `back` | `lats`, `middle back` |
> | `shoulders` | `shoulders`, `traps` |
> | `arms` | `biceps`, `triceps`, `forearms` |
> | `core` | `abdominals` |
> | *(omitted)* | `neck` |
>
> That is all 17 values accounted for. The fold is total — if the import ever
> meets a muscle value not in this table, it must **report it, not guess**.
>
> Joe's rulings, 2026-07-31: **`lower back` -> `posterior`** (erectors are
> posterior chain; `posterior` already holds hamstrings and glutes, and the
> hand-authored Deadlift and RDL both live there), **`traps` -> `shoulders`**.
> `neck` (8 records) maps to nothing; omit it from the fold.
> Both rulings are *display* decisions living in the fold function — storage keeps
> `lower back` and `traps` as themselves. Do not average a value across two groups,
> do not guess from the exercise name, and **do not assign a muscle to different
> groups depending on the exercise** — the fold is one fixed table, so the Ledger
> stays reproducible.
>
> ### Category: import everything, decide at the consumer
>
> **Import all 873 records. Do not filter by category at import.** Store each
> row's `category` alongside its name and raw muscle values.
>
> 137 records (16%) are `category: stretching` (123) or `cardio` (14) — e.g.
> "All Fours Quad Stretch", "Ankle Circles". These must not be dropped: the
> `stretching` rows are the only structured stretch content in the dataset, and
> the recovery archetype (Sage Elowen, `game.py:75`) already owns
> `("mobility", "stretch", "easy movement", "rest")`. Discarding them at import
> would throw away content for a giver that already exists.
>
> **But the exclusion still has to happen — at the consumer, not the import.**
> A stretch is not training, and crediting it would make the muscle chart less
> accurate, which is the opposite of the point. So: `muscle_recency()` must not
> award *training credit* for rows whose category is `stretching` or `cardio`.
> `strength`, `powerlifting`, `olympic weightlifting`, `plyometrics` and
> `strongman` all count.
>
> Make the non-training set one named constant consulted at that one boundary —
> not a condition scattered through the import or duplicated per consumer. Report
> the record counts per category after import.
>
> This is the same principle as the 17-muscle rule above: **do not destroy
> information at import; narrow it at the edge that needs it narrowed.**
>
> **Write the invariant in a comment at the boundary it protects:** imported
> rows are attribution-only and must never enter quest generation.
>
> ### Explicitly out of scope — do NOT do these
>
> - **Do not let imported rows reach quest generation.**
>   `counsel_specialists._iron_exercises` fills routines from
>   `EXERCISES.items()` filtered by equipment. Four movements drawn from 26 is a
>   workout; four drawn from 1300 is a lottery. Imported rows must be invisible
>   to it.
> - Do not give imported rows a `scheme`, invented or defaulted.
> - Do not add values to `GIVER_ARCHETYPES["strength"]["modalities"]`.
> - Do not change `/api/exercises` or the Compendium — that's Brief 4.
> - **No network calls in application code**, no Settings UI, no new
>   dependencies. The one-time fetch of the source file is a setup step you
>   perform once at the shell; it must leave no fetching code behind in `app/`.
>   Live refresh is Brief 3, and Brief 3 is blocked.
> - Do not commit. Branch name if you need one: `feat/exercise-attribution`.
>
> ### Verification — required before you report
>
> - `.venv/bin/python tests/smoke.py` green before AND after (215 checks;
>   identical green is the acceptance bar).
> - Add tests that **assert player-observable outcomes, not artifacts.** A test
>   that checks a lookup returned a row proves the code ran. Assert instead:
>   log a set of an off-catalog movement that the import knows, then assert the
>   corresponding group's `days_since` in `muscle_recency()` **changed** — and
>   that a movement the import does *not* know still yields `[]` rather than
>   raising.
> - Test both sides of the boundary: a name in the hand-authored 26 whose
>   imported entry disagrees must still return the **hand-authored** groups.
> - **Assert the category boundary both ways.** Log a set of an imported
>   `strength` movement and assert its group's `days_since` changed. Log a set of
>   an imported `stretching` movement (e.g. "All Fours Quad Stretch") and assert
>   the corresponding group's `days_since` did **not** change — while also
>   asserting the row is still present in the imported catalog with its muscles
>   and category intact. Excluded from credit, not excluded from the data.
> - **Report the breadth check.** For every one of the 26 hand-authored names
>   that the import also knows, print hand-authored groups beside the imported
>   fold. Primary+secondary credit is expected to be slightly *broader* than
>   ours (`Dumbbell Bench Press` gains `shoulders`). Report the diff as a table;
>   do not tune the mapping to force agreement.
> - Persisted data is untrusted input: a malformed import file must degrade to
>   "no imported rows", never raise. `/api/state` returning 400 means the game
>   does not load.
> - Every test must stand alone. Verify with a single-test run.
>
> **If you find a surprise, report it rather than deciding.**
>
> Build → verify → **stop and report**. Wait for an explicit "commit that seam."

---

# BRIEFS A & B — merged catalog + classifications — **DONE 2026-08-01**

Supersedes Brief 4's "show imported rows in a distinct section". Joe ruled for a
**single consistent catalog** instead: one name per movement, one uniform record
shape, because two entries for the same lift under different names is worse than
either alone.

`GET /api/catalog` returns **881 records** (873 imported + 26 sworn − 6 exact-name
collisions − 12 aliases), every one carrying an identical key set. Assembled as a
**view at the API boundary** — `EXERCISES` itself is unchanged, so `scheme`, `how`
and the four-value `equipment` ownership model are untouched and there was no
migration against live ledger data.

**Do not change `/api/exercises`.** It has five frontend consumers and
`app/main.py:484` builds it by splatting every key of each `EXERCISES` entry
except `scheme` — so adding a field to those entries silently changes that
endpoint. This is why the authored classifications live in a separate mapping.
`static/js/giver.js:493` filters on `e.equipment === 'kettlebell'` and
`static/js/misc.js:722` builds a `<select>` of every name; both break if that
response grows.

### The alias table (Joe's rulings, 2026-08-01)

Sworn name always wins; the upstream name disappears from the catalog.

```
Farmer Carry -> Farmer's Walk              Deadlift       -> Barbell Deadlift
Back Squat   -> Barbell Squat              Bench Press    -> Barbell Bench Press - Medium Grip
Pull-Up      -> Pullups                    Dip            -> Parallel Bar Dip
Push-Up      -> Pushups                    Barbell Row    -> Bent Over Barbell Row
Dumbbell Curl-> Dumbbell Bicep Curl        Overhead Press -> Barbell Shoulder Press
Bulgarian Split Squat -> Suspended Split Squat
Turkish Get-Up        -> Kettlebell Turkish Get-Up (Lunge style)
```

**Deliberately NOT aliased — these are different movements, do not "fix" them:**

- `Kettlebell Halo` — upstream "Around The Worlds" is primary `chest`, a dumbbell
  fly. The Halo is shoulders/core. Name similarity is a trap.
- `Kettlebell Swing` — upstream has only the one-arm variant; ours is two-hand.
- `Kettlebell Deadlift` — upstream has only the one-legged variant.
- `Kettlebell Turkish Get-Up (Squat style)` — only the lunge variant is aliased.

Aliases are Joe's call, not a code decision. Report candidates; do not add them.

### `loaded carry` — a deliberate divergence from the source vocabulary

The source's `force` enum is `pull | push | static`. Iron Vale adds a fourth,
`loaded carry`, applied to 4 records (Farmer Carry/Farmer's Walk, Rickshaw Carry,
Yoke Walk, Conan's Wheel).

A carry is neither a push nor a pull, and `static` is **not** the escape hatch:
this dataset uses `static` for stretching and SMR — quad stretches, foam rolling —
so a loaded carry filed there would be worse than null. Upstream leaves all four
carries null, which is honest but unfilterable.

### The override boundary — read before extending anything

An in-memory overlay fills `force` on 12 imported records. The vendored file is
never modified; its sha256 is asserted in the tests.

It exists to **add a value the source vocabulary lacks** and to **fill omissions
where the answer is unambiguous** (`Band Assisted Pull-Up` → pull, `Push-Up Wide`
→ push, and six more). It is **not** for correcting the source's judgment.

**17 records keep a null `force` on purpose**: 13 cardio, where force genuinely
does not apply, plus `Balance Board`, `Carioca Quick Step`, `Linear Acceleration
Wall Drill` and `Moving Claw Series`, which are ambiguous and better left
unspecified than guessed. Any Compendium filter needs an "unspecified" bucket
regardless — `mechanic` has 87 nulls and `equipment` 77, most of them
categorically correct (a stretch has no mechanic).

### The eight authored kettlebell movements

18 of the 26 sworn entries inherit classifications from their aliased upstream
match. The other 8 have no upstream equivalent and were authored by Joe,
calibrated against the 53 upstream kettlebell records and cross-checked against
Fitbod. They live in a **separate mapping keyed by sworn name**, never in
`EXERCISES` (see the `/api/exercises` gotcha above).

Their muscles fold **broader** than their sworn `groups` in seven of eight cases.
That is expected and matches the merged 18 — `groups` stays Joe's curated coarse
label and keeps winning attribution; muscles drive the filter and the body map.

---

# BRIEF 3 — Settings APIs connector (BYO key)

**Blocked on AscendAPI granting persistent-storage/bulk rights** (see the email
below). Without that permission there is nothing legitimate for a connector to
cache, and the public-domain source needs no key — so this brief has no reason
to exist until they reply. If they say yes, it becomes the live-refresh path
Joe originally asked for, and Brief 2's adapter is where their source plugs in.

Sketch only — tighten once permission and auth model are known.

Shape, mirroring intervals.icu exactly:

- Credentials live in settings, same pattern as `intervals_athlete_id` /
  `intervals_api_key` (`game.py:341`, `main.py:292-305`). Note the existing
  convention: the key is only overwritten when the posted value is truthy, and
  `/api/state` exposes `bool(api_key)` — never the key itself (`main.py:183`).
- UI goes in the existing APIs tab, `static/js/misc.js:931`, beside the ravens
  panel. In-world voice, no emojis.
- **Fetch is an explicit button, not a scheduled sync.** The catalog is
  reference data; it does not change daily and must not join the 15-minute
  raven flight.
- On import: write to the same local store Brief 2 reads. Report counts —
  rows fetched, mapped, unmapped-and-skipped.
- Failure must be visible and in-world, following the durable error-status
  pattern in `syncing.py`.

Non-goals for that brief: no background scheduling, no images/GIFs, no
per-request fetching, no promotion UI, no expansion of the modalities tuple.

Remember safety rule 4: bump `?v=N` on every static asset URL in
`static/index.html`.

---

# BRIEF C — Compendium rebuild, list + detail — **DONE 2026-08-01**

Two-pane catalog over `/api/catalog`: scrollable list of names on the left, detail
on the right; mobile collapses to one column where the detail replaces the list.
Fetched lazily on first open — it must never join the boot sequence beside
`/api/state` and `/api/exercises`.

`/api/catalog` is the **list projection**: every field except `instructions`,
which is 77% of the payload and unread until someone clicks. 266 KB, 23 KB
gzipped. `/api/catalog/{id}` returns one full record. The 8 Vale-only movements
were given ids following the upstream convention, so `id` is total and unique
across all 881 and the frontend can route on it.

The list is **sorted alphabetically, case-insensitively, on the server** and shows
**names only**. Do not group or otherwise separate sworn movements from imported
ones — one undifferentiated list is the point. Sworn entries are visibly richer
when opened (a Vale prescription and Joe's `how`); that is a content difference,
not a structural one, and it is the only difference there should be.

### Do not virtualise, and do not put a canvas on a list row

Measured in a real browser against all 881 records, 2026-08-01:

| | flat, text only | flat + canvas per row | virtualised |
| --- | --- | --- | --- |
| initial render | **3.1 ms** | 20.7 ms | 0.3 ms |
| DOM nodes | 3,524 | 4,405 | 162 |
| per keystroke (filter + re-render) | **0.1–0.4 ms** | 0.7–2.6 ms | — |

Scrolling the full flat list: **zero dropped frames**, median 10 ms, worst 11.2 ms.
Windowing saves under 3 ms and costs a hand-rolled implementation — scroll
anchoring, variable row heights, jump-to-item, keyboard nav, find-in-page — in a
codebase with no framework and no bundler. A canvas per row is 7× the render cost;
the body map belongs in the detail pane where there is exactly one. Search needs
no debounce, no index and no incremental DOM: re-render the whole filtered list on
input.

### The gotcha that bites

**Never interpolate an exercise name into an `onclick` attribute.** Seven names
contain `'` or `&` — `Conan's Wheel`, `Child's Pose`, `Kettlebell Clean & Press`,
`Landmine 180's`, `Dancer's Stretch`, `Runner's Stretch`, `World's Greatest
Stretch`. HTML entities decode before JS parses, so the handler breaks. Pass an
index or id and look the record up in state. A browser test clicks an
apostrophe name specifically so this is caught by CI rather than by Joe.

`render()` wipes the DOM, so the fetched catalog and the selected id live in
module-level state, never in the DOM.

### Still to build

Search, filters and sort. Deferred deliberately: the filter UI has real decisions
in it — the "unspecified" buckets (29 null `force`, 87 null `mechanic`, 77 null
`equipment`, most of them categorically correct), whether muscle filters use the
17 source muscles or the 7 groups, and how filters combine. Easier to judge
against a working list than in the abstract.

---

# BRIEF 4 — Compendium surface / promotion (optional, much later)

Only if wanted. Two separable pieces:

- **Browse — SUPERSEDED.** This originally proposed showing imported rows in a
  distinct section. Joe ruled for one merged catalog instead; see BRIEFS A & B
  above. The remaining frontend work is a two-pane Compendium over
  `GET /api/catalog`: scrollable list on the left third, detail on the right two
  thirds, with search, filters and sort above. Mobile needs its own layout.
  `static/js/hall.js:305` currently renders a flat list grouped into four
  hand-titled equipment sections, which does not survive 881 records.
- **Per-muscle body map (Joe, hand-pixelled).** Planned 2026-07-31. Colours
  individual muscles rather than the seven broad areas. Brief 2 persists the 17
  source muscle values specifically so this needs no re-import — it reads them
  directly and never sees the 7-group fold.

  Two constraints found while scoping it:
  - The current figure is **12x20 per body** (`static/js/pixel.js:889`, front and
    back side by side at 26x20). Arms are 2px-wide columns (`aa`), legs 4px. Legs
    can be subdivided vertically across their 9 rows, but **biceps vs triceps on a
    2px arm is not renderable** — per-muscle regions need a materially larger
    figure, and `BODY_GROUPS` grows from 7 chars to ~17.
  - **17 is the ceiling** from this data lineage; both candidate datasets share
    the identical enum. No upper/lower pec, no long/short head distinctions.

- **Alternative sources as a content capability.** Decided 2026-07-31: if the
  873-record catalog proves thin, a second source arrives as a *content*
  capability, not an API one. ROADMAP §1 already names exercise libraries as the
  content type ("pure data. Declarative, inert, easy to validate") and says to
  design the `api` type last. Brief 2's adapter is that extension point in
  embryo — one source, done properly, per §1's "make one thing pluggable, well."
  Two constraints from §1's own non-goals: **do not build the registry first**,
  and **call it a library, not a market** — the word pulls toward publishing,
  accounts, hosting, versioning and moderation, which is real work for an
  audience of one.

- **Promote**: a flow where Joe moves one imported movement into the
  hand-authored catalog by writing its `scheme` and its `how` cue himself. This
  is how the catalog grows without the voice degrading into vendor prose and
  without generation becoming a lottery. Deliberately manual and one-at-a-time.

---

# The AscendAPI email (for Joe to send — I have not sent anything)

Send via the contact route on <https://docs.ascendapi.com/guides/caching>. Keep
it short; you are an easy yes for them.

> **Subject:** Permission request — local cache of ExerciseDB V1 for a free, self-hosted, non-commercial project
>
> Hi,
>
> I maintain Iron Vale, a self-hosted fitness RPG I run for myself and a handful
> of friends. It is free, has no monetisation of any kind and never will, and is
> not a SaaS or commercial product — it matches the personal / community-driven
> use your free OSS V1 tier allows, and I am happy to credit AscendAPI visibly
> in the app.
>
> Your caching guide says persistent storage and bulk download need explicit
> permission, so I am asking rather than assuming.
>
> What I would like to do:
>
> - Fetch the V1 exercise catalog once, and refresh it occasionally.
> - Keep a stripped local copy of **exercise name, target muscles, secondary
>   muscles, body parts and equipment only**.
> - Discard all media — no GIFs, images or video, and no media URLs stored.
>
> The data would be used only to map exercise names to muscle groups for a
> pixel-art "muscles trained recently" display. It is never redistributed, never
> exposed through a public API, and never resold.
>
> Is that permissible on the free OSS tier, and if not, is there a tier or
> arrangement that would cover it?
>
> Thanks,
> Joe

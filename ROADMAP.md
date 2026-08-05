# Iron Vale — direction beyond the Council

`COUNCIL_REDESIGN.md` charters the Council. This file holds app-wide direction
that outlives it. **Nothing here is approved to build.** It exists so a decision
made in conversation is not rediscovered expensively later.

## 1. Capabilities and the plugin surface (the next big thing)

### The one-sentence idea

The app is a **base experience plus opt-in capabilities**. A capability declares
a **type**, and the type *is* the wiring contract — the host decides where it
mounts. A plugin labelled `api` adds its credentials to the Settings APIs tab; one
labelled `chart` wires into Maud's charts; one labelled `kettlebell` adds
routines. Enable what you want; **what is not enabled is not shown.**

### Why this is worth doing (the real problem it solves)

The app currently assumes intervals.icu is connected. There is exactly **one**
capability check in the whole frontend — `static/js/giver.js:451`, gating on
`S.state?.settings?.intervals_api_key`. Everything else renders regardless, so a player who
never connected anything gets chart furniture with no data in it and a Council
that reports `wellness_data_missing` forever.

That is the difference the model buys: today an absent integration is a permanent
**degraded state**; under this model it is an **honest one**. The app stops
implying it knows things it cannot know.

### Scope lives in the number of TYPES, not the number of plugins

Each type is a separate extension point with its own contract, and they differ
enormously in cost:

- **Content** (routines, exercise libraries, doctrines) — pure *data*.
  Declarative, inert, easy to validate. `programs.py` already does a version of
  this: built-in `PROGRAMS` beside user-authored custom routines resolved through
  one path. This contract is half-built already.
- **Chart** — display over a data contract. The plugin must declare what data it
  requires, which is where typing earns its keep.
- **API** — *code*, not a manifest: network calls, credentials, parsing, failure
  modes, sync scheduling. Design this LAST. Doing it first would define the whole
  abstraction around the hardest case.

### Recommended first step — do NOT start with the registry

Build **"capabilities can be off, and off means hidden"** as its own shippable
feature, with intervals.icu as the single capability. Not a plugin system — just
the honest statement that intervals is optional.

It has standalone value, it is small, and critically it forces an inventory of
every surface that silently assumes intervals. **That inventory is the map you
need before designing extension points, and it can only be produced by walking
the code.** The registry then becomes "more capabilities, declared rather than
hardcoded" — an increment rather than an architecture.

### A likely first capability: font packs

Raised 2026-07-29 — a player (including Joe) may dislike a font or need a more
legible one, so **typeface should be a user choice**, and it is a natural early
capability under this model.

**The constraint that shapes it:** Quanta-Strike's strikes are size-bound, and
12px Quanta-Strike is roughly the apparent size of 17–20px in a conventional
outline font. A font pack therefore cannot swap `font-family` alone — swap a
system font in at 12px and it renders microscopic. **Family and scale must travel
together as one swappable unit.**

Consequence, applied while the type system was being built rather than
retrofitted: the scale lives in **CSS custom properties**, not ~128 hardcoded
`font-size` declarations. A font pack sets the family and the scale tokens
together. This also closes the "no typography tokens" gap `DESIGN.md` §3 records.

A legibility-first pack (a conventional, larger, non-pixel face) is the obvious
second pack after the default, and it is the honest answer to accessibility
concerns that a fixed pixel font cannot serve on its own.

### Deliberate non-goals (for now)

- **It is not a marketplace yet, and should not be called one.** With one user, a
  marketplace is a plugin system wearing a shop skin. The word pulls toward
  publishing, accounts, hosting, versioning, moderation and trust — real work
  serving an audience of one. Until content comes from outside, it is a *library*;
  calling it a library keeps the scope honest. If contributors ever appear, cross
  that bridge then.
- **Do not "modularize everything."** Make one thing pluggable, well. Doing it
  once properly teaches what the abstraction needs; that knowledge is not
  available by designing up front. (This repo has form here: the first Council
  pass spent ~2,200 lines making advice *provable* rather than useful.)

### Ser Bram's next life

Bram retires from quest-giving in `COUNCIL_REDESIGN.md` §0c but keeps his
identity, sprite and title. The capability/plugin surface is a plausible second
life for him — the knight who stopped giving orders and started outfitting you —
as is an ExerciseDB-backed form/technique/muscle-group compendium. Both are
sketches. Neither is scoped.

## 2. Known app-wide follow-ups

- **DONE v0.25.0 — DB giver-key rename.** The backed-up, idempotent migration
  replaced `running`/`kettlebell`/`strength`/`mobility` with
  `endurance`/`strength`/`bram`/`recovery` before Scheduled mode could make the
  misleading namespace more expensive.
- **ExerciseDB integration — DECIDED 2026-07-31: pursue, but spike first.**
  Joe's written training week names roughly a dozen movements the 26-exercise
  catalog lacks (rings, sliders, bands, ab wheel, calf raises, step-ups, hip
  thrusts, hamstring curls). Custom routines tolerate off-catalog names, but those
  movements carry no groups, no equipment tag and no scheme — so muscle recency,
  focus targeting and the "within reach today" filter cannot see them.

  **Shape: bring-your-own-key, in the Settings APIs tab**, the same posture as
  intervals.icu. Iron Vale never redistributes the data; the player fetches into
  their own self-hosted instance with their own credentials, which removes the
  licensing question and makes this the first real instance of §1's capability
  model rather than a detour from it. Data must be cached locally after import,
  not fetched per request.

  **The first task is a SPIKE, not an import.** Four things are unresolved, and
  three of them are not obvious:

  1. **`scheme` has no source.** `EXERCISES[name]["scheme"]` is `(unit, low, high)`
     with unit in `reps|steps|seconds`, and `quests.py:210` unpacks it for every
     generated set. ExerciseDB carries no rep prescription. Every imported row needs
     one — defaulted by equipment or group, inferred, or authored. Biggest gap.
  2. **`equipment` is part of the ownership model, not a free tag.** The four values
     ARE `GIVER_ARCHETYPES["strength"]["modalities"]`; `main.py` derives the "within
     reach today" options from that tuple and `summarize_lifts` uses it to decide
     what counts as iron history. Adding `band` or `rings` changes giver ownership
     and the override UI, not just the catalog.
  3. **`groups` needs a mapping table.** ExerciseDB's muscle vocabulary must fold
     onto the seven in `exercises.GROUPS`. A silent mis-map degrades muscle recency
     and focus targeting without erroring.
  4. **Curation is currently a feature.** `_iron_exercises` fills routines from the
     catalog filtered by equipment. Coherent at 26 exercises; a lottery at ~1300
     unless something narrows it.

  Also note `how` (the coaching cue, present on all 26) is written in a specific
  in-world voice that imported instruction lists will not match, and any image URLs
  are an external dependency a self-hosted pixel-art app probably does not want.

  The spike should fetch a real sample, map it against `exercises.py`, and report
  what fits, what does not, and what each unresolved field would cost — before
  anyone estimates the import.

- ~~**Elevation for overlaid surfaces**~~ and ~~**Quanta-Strike font +
  type-scale pass**~~ — **BOTH SHIPPED, confirmed 2026-08-04.** `--surface-raised`
  is declared in `:root` (`style.css:49`) and consumed at `:578` and `:1158`, and
  the Quanta-Strike faces are loaded from `style.css:11` onward. `DESIGN.md` §1
  now documents them as implemented and records that **scanlines were removed**
  when the Quanta scale became the default, because they interfered with the
  smaller hand-drawn glyphs — a consequence neither proposal predicted and worth
  keeping in the record. These were queued here as PROPOSED with a "try it on one
  screen first" caveat; they shipped without the entries being closed. Found by
  the 2026-08-04 codebase review.

  Where these claims conflict, **the stylesheet plus `DESIGN.md`'s implementation
  sections are authoritative**; `ROADMAP.md` and `README.md` lag.

## 3. Sweep-up backlog

Known defects and cleanups, deliberately deferred to a single sweep **at the end
of the current phase** rather than being smuggled into feature seams. Add to this
list as things are found; do not let it become a wishlist — every entry should be
something verified, with the reason it matters.

**Standing policy.** Every bug, glitch, error or surprise gets written here **the
moment it is found**, even when it is not fixed in that seam — a report in a chat
window is not a record. **Dead code counts as a defect, not a curiosity:** junk
code is resolved so the codebase stays steady. Nothing on this list is "parked";
entries are open work with the removal path worked out.

**Defects (behaviour is wrong today)**

- ~~**Browser assertions intermittently read empty or truncated `innerText`.**~~
  **RESOLVED 2026-08-03.** The unidentified v0.30.3 and v0.33.0 flakes were
  eventually captured at two unrelated attached elements: Bram's `.npc-name`
  returned `''`, while Grunhilda's closed iron selector returned a complete
  prefix ending at `within reach today:` but omitted `any iron`. Waiting for
  visibility did not help. The common mechanism was a one-shot read of
  layout-dependent `innerText` while Chromium was still settling a heavy suite;
  the Compendium's 881-row renders made a pre-existing race easier to trigger.

  The 37 call sites were classified by what each assertion proves. The 33 content
  assertions now use `textContent`. Four assertions genuinely depend on rendered
  text: two verify CSS-transformed uppercase labels, one verifies an uppercase
  panel title, and Grunhilda's collapsed `<details>` must exclude hidden implement
  labels. Those four read through `settledInnerText()`, which polls for the same
  non-empty value twice. Full browser output remains captured before reading
  counts so any future failure keeps its name and actual value. The corrected
  suite then passed 63/63 on ten consecutive, separately captured full runs.
- **Town navigation can expose the previous town DOM for one assertion.** The
  2026-08-03 ten-run browser stress batch caught one run where
  `town keeps all four giver identities while Bram has no offer board` found zero
  `Visit Old Fenn` buttons at desktop instead of one. This happened before the
  test's text assertion and did not recur in the other nine captures, so it is a
  separate navigation/render race, not the `innerText` defect. It was recorded,
  not folded into that test-infrastructure fix.

  **Investigation, 2026-08-03: not reproduced.** Twenty more unchanged,
  separately captured full browser runs all passed 63/63. That rules out a
  deterministic defect and a shared-state dependency that reliably appears in
  the current canonical test order. It does not identify or eliminate a rarer
  render-wipe, navigation-completion or sprite-hydration race: at the observed
  one-in-twenty sighting rate, a clean twenty-run sample is plausible. No wait or
  assertion was changed without a demonstrated mechanism.

  **Seen again 2026-08-04.** During Pass B verification the browser suite failed
  on the first of five runs with `actual: 0, expected: 1` — the same 0-vs-1
  shape as the original sighting — then passed 63/63 on the four following runs.
  The failing test's *name* was not captured before the output scrolled, so this
  is a signature match, not a confirmed identity; do not record it as proof the
  Town test is the one that failed. What it does settle is that the race is
  still live after the `innerText` fix and is not rare enough to need twenty
  runs to see. Next sighting: capture `not ok <n> - <name>` before anything else.
- **A mid-day imported database can migrate without its own pre-migration
  snapshot.** `vault.ensure_snapshot_before_migration()` is per-UTC-day, so a
  legacy database imported *after* that day's snapshot already exists reuses it
  rather than sealing a fresh one. Both production saves were captured before
  their first mutation and normal profile creation writes the marker without
  migrating, so this only bites an out-of-band import. Narrow, but the whole point
  of that snapshot is being the rollback path.

- ~~**The workout logger's empty state still names a retired giver.**~~
  **RESOLVED — confirmed fixed 2026-08-04.** `static/js/giver.js:804` now reads
  "No strength quest in hand. Accept one from Grunhilda first." Third entry found
  stale by the 2026-08-04 codebase review; the fix shipped without the record
  being closed.
- ~~**The browser suite silently tests against a foreign server on its port.**~~
  **FIXED in v0.24.3.** Root cause was not stray processes: `AGENTS.md` documented
  **8322 for both** the human scratch preview and the browser suite, so the two
  collided by design whenever a preview was open for review — which is the normal
  working state. The suite now takes an OS-assigned ephemeral port and reads back
  what uvicorn bound; `IRON_VALE_BROWSER_PORT` remains for exact-port needs and
  refuses loudly when that port is occupied, since the caller named it on purpose.
- ~~**A browser-suite helper can report navigation complete before the DOM
  settles.**~~ **FIXED in v0.24.3.** Worse than first described: two of
  `openGiverBoard`'s three wait branches proved nothing about *which* giver had
  rendered — a sworn-quest title matches any giver holding a quest, and `nav()`
  sets route params synchronously while a portrait exists on every giver screen.
  The dialogue block now carries `data-giver`, and one identity check inside a
  finished render replaces all three branches.

- ~~**A weighted pull-up loses its load.**~~ **RESOLVED — confirmed fixed
  2026-08-04.** The prescribed fix is in the tree and was not recorded here when
  it landed. `counsel_specialists.py:68-70` now reads
  `context.latest_weight(name) or None` under a comment naming zero as the
  ledger's unloaded sentinel — suppression keys off a falsy weight, not the
  equipment tag, so a Pull-Up logged at 10 kg keeps its load. Found stale by the
  2026-08-04 codebase review; the entry, not the code, was the defect.
- ~~**`save_routine` accepts off-catalog exercise names.**~~ **RESOLVED as
  intended behaviour, 2026-07-29.** Traced every direct `EXERCISES[...]` index in
  app code: five sit in `quests.py`'s lift builder where the names come *from* the
  catalog, and one is the bodyweight-weight check — all fed catalog names, none
  reachable with user input. The only reader that ever saw a user-supplied name
  was the doctrine-equipment derivation, already hardened. So the permissive
  writer is a **feature**: it lets a player name a movement the catalog lacks (a
  sandbag, a ring variation). Validating on write would remove that to fix a crash
  that no longer exists. **The contract is: the writer accepts any name; readers
  must tolerate unknown ones.** Documented here rather than enforced in code.

- ~~**One non-finite distance can hang `/api/road` and exhaust memory.**~~
  **RESOLVED 2026-08-04** by review seam 3. Guarded at both ends: ingestion
  rejects non-numeric, boolean, negative, non-finite and scale-overflowing
  values with a 400, and the reader terminates independently because a writer
  guard does nothing for rows already stored. Corrupt distance degrades to
  `"unknown"` rather than clamping, since clamping would falsely grant progress
  and rewards. **New invariant that is not yet written down in code:
  `/api/road`'s `total_km` and `breakdown` values may now be the *string*
  `"unknown"` where a number used to be.** `hall.js:154` renders it fine and
  `:1022` survives only because JS coerces `"unknown"` to `NaN` and every
  comparison goes false, leaving the pilgrim drawn at the gate — benign, but
  accidental. Per `AGENTS.md`, name that at the boundary the next time
  `hall.js` is touched and spends a `?v=` bump anyway. Original finding:

- **One non-finite distance can hang `/api/road` and exhaust memory.** Found
  2026-08-04. `POST /api/activities/manual` (`main.py:457`) hands a raw JSON body
  straight to `intervals.add_manual_activity`, which stores
  `float(payload.get("km", 0) or 0) * 1000` with no finite-number boundary —
  `{"km": "inf"}` and `1e400` both land, and SQLite retains the value. `road.total_km()`
  then returns infinity, and `_landmarks_through()` (`road.py:91`) loops on
  `marks[-1]["km"] <= km + BEYOND_INTERVAL_KM * 2`, which is always true against
  infinity. It is not just a hang: the loop **appends a landmark every
  iteration**, so it grows without bound until the process dies. Reachable from
  outside the app, so fix the boundary at ingestion, not only at the reader.
- ~~**Malformed persisted rows turn `/api/state` into a 500.**~~ **RESOLVED
  2026-08-05** by review seam 4. All five shapes now degrade **in memory**
  without touching the stored row — corrupt state is evidence, and `vault.py`'s
  snapshot is the rollback path. A malformed character serves the default,
  a bad ambition falls back to Forge, malformed writ notices are skipped *and
  the cleanup write is suppressed* so corruption is never swept, non-mapping
  quest details become `{}`, and a non-numeric duration reports unknown minutes.
  Two gaps found during verification and closed in the same seam: the
  writ-notices `isinstance(lst, list)` guard had **no test** (its fixture was a
  dict, which the per-notice guard already rejected, so deleting the outer guard
  left the suite green), and `_quest_row` guarded `details` while leaving
  `rewards` decoding one line below it unguarded. Smoke 230 → 241. Original
  finding:

- **Malformed persisted rows turn `/api/state` into a 500.** Found 2026-08-04.
  `/api/state` is the boot endpoint and `main.py` registers a handler for
  `ValueError` only (`main.py:149`), so any other exception escapes as a 500 and
  the game does not load at all. Confirmed unguarded shapes: `game.get_char()`
  (`game.py:184`) calls `.setdefault` on whatever decoded, so a string-valued
  `character` raises `AttributeError`; `game.ambition_mult()` (`game.py:386`)
  does `min(3, s["ambition"])`, which raises `TypeError` on a string;
  `quests.writ_notices_pending()` (`quests.py:502`) iterates `lst` and indexes
  `n["ts"]`, so an object where a list belongs raises; quest detail decoding
  (`quests.py:527`) and `records._last_activity()` (`records.py:167`) likewise
  trust stored shapes, and text in `moving_time` propagates into arithmetic.
  This is the standing "persisted data is untrusted input" rule in `AGENTS.md`:
  malformed rows must degrade to unknown, never raise.
- **Degraded backend values reach a frontend that does not expect them.** Found
  2026-08-05. Seams 3 and 4 both chose to degrade rather than fail, which is
  right — but neither could touch `static/` under its own scope, so the frontend
  has never been told. Two known cases, and they should ship as one seam:
  - **`settings.ambition` — this one throws.** `misc.js:908` renders
    `${esc(amb[s.ambition].desc)}`. With a corrupt ambition, `amb["corrupt"]` is
    `undefined` and `.desc` raises a `TypeError` *while rendering Settings*. The
    seam 4 report described this as "may show no selected ambition"; that
    understates it — line 905's highlight silently fails, but 908 breaks the
    screen. The backend is right to keep serving the stored value; the frontend
    has to stop assuming it indexes.
  - **`/api/road`'s `total_km`** may now be the string `"unknown"` (see the road
    entry above). That one only survives by accident of JS coercion.

  Together these are the standing question the degrade strategy raises: **what
  contract does a degraded value have with its consumer?** Answer it once,
  in one frontend seam, rather than per-field.
- **A scheduled background flight raises `TypeError` when many corrupt rows are
  present at once.** Found 2026-08-05 during seam 4 verification, with every
  corrupt fixture seeded simultaneously. `/api/state` still returned 200 and the
  durable sync error surfaced, so boot is not affected. **Not investigated** —
  it was outside that seam and is recorded here rather than chased. Reproduce by
  seeding all five corrupt shapes together and watching the background task log.
- **A BLOB `activities.start` produces a garbage date rather than an error.**
  Found 2026-08-05 while scoping seam 4. `start` is `TEXT NOT NULL`
  (`db.py:74`), so it can never be `NULL` — but SQLite's TEXT affinity stores a
  BLOB unchanged, and `records._last_activity()` (`records.py:176`) then does
  `row["start"][:10]`, which on `bytes` returns `bytes` without raising. The
  result is a nonsense date flowing into the payload instead of a 500.
  **Different class from the other untrusted-input defects** — silent bad data,
  not a failed boot — so it was deliberately kept out of seam 4 rather than
  widening it. Low severity: nothing in the app writes a BLOB there today.
- **Unguided completions persist the wrong giver.** Found 2026-08-04.
  `grant_unguided_run_bonus` assigns per-category givers via `deed_giver()`
  (`quests.py:927`, defaulting to `wick`) and stores that on the candidate, but
  `_record_unguided_completion` (`quests.py:1011`) hardcodes `"endurance"` in the
  INSERT. Every unguided deed is therefore filed under Fenn regardless of what
  the player actually did — a WeightTraining deed queues as `strength` and
  persists as `endurance`. The mismatch is invisible in the queue, which is why
  it survived: check what the *claimed* quest recorded, not what was offered.
- **Reported by the 2026-08-04 review, NOT yet reproduced.** Recorded here so
  they are not lost, but neither has been independently verified and neither
  should be fixed before it is:
  - *Wellness interpretation may give contradictory guidance.* `records.insights()`
    (`records.py:86`) computes trends straight from raw rows, independently of
    `counsel_wellness` (`counsel_wellness.py:49`) and `counsel_rules`
    (`counsel_rules.py:31`). The report saw the Hall say a hard quest would land
    well while the Council suppressed hard work on identical data.
  - *The nudge may not consume only its captured Council context.*
    `counsel_nudge.daily_nudge()` (`counsel_nudge.py:91`) takes a qualified
    context and then re-reads settings for mode, charter and enablement, while
    `/api/state` reads settings separately. A concurrent settings change could
    produce a response whose settings and nudge describe different captures,
    against the one-snapshot invariant.

- **Routine forging can persist duplicates after a partial success.** Found
  2026-08-04. `G.saveCounselRoutine` (`misc.js:767`) POSTs `/routines`, then
  inside the same `try` refreshes `/programs` and writes the schedule slot. There
  is a `finally` but **no `catch`**, so if either post-POST step throws, the
  `finally` re-enables the save button while the exception skips
  `G.closeOverlay` — overlay open, draft intact, button live. Retrying POSTs
  again, and `programs.save_routine` (`programs.py:89`) always appends a fresh
  UUID, so the player gets two routines. The "one player activation creates at
  most one custom routine" comment above it guards simultaneous clicks only; it
  does not survive a retry after a committed POST. **Second failure mode from the
  same shape:** if `counselScheduleWriteSlot` is what throws, the routine exists
  but was never written into the weekly plan, so the player sees the forge
  "fail" while the routine silently exists.
- **Routine state goes stale across Settings and Doctrines.**  Found 2026-08-04.
  `counselSchedulePrograms` (`misc.js:240`) is module-level, loaded only when
  `null` (`SCREENS.settings`), and cleared only by the profile-reset hook. The
  doctrine screen creates, selects and deletes routines independently
  (`giver.js:485`) and never invalidates it. So: visit Settings once, change
  routines under Grunhilda, come back — Settings can hide routines that exist and
  offer routines that were deleted. Same root as the entry above: routine/program
  ownership is split across two editors with no shared owner for the state or its
  invalidation. **Fix the ownership, not the two symptoms.**
- **Two optimistic writes show state the server never accepted.** Found
  2026-08-04, same shape in both places:
  - `G.apStep` (`app.js:949`) mutates `S.state.character.appearance`, fires
    `api('/appearance')` unawaited with `.catch(() => {})`, and redraws. A failed
    write leaves the chosen look on screen across subsequent navigation while
    SQLite still holds the old one. Rapid clicking also sends concurrent writes
    whose completion order is never reconciled.
  - The Almanac (`hall.js:237`) sets `S.state.almanac_unread = false` and fires
    `/api/almanac/seen` with the same swallowed rejection. The Hall and Town
    badges go out even when the server still reports unread, and a later state
    refresh brings them back.

  The swallowed rejection is deliberate in *one* nearby case — the bare `fetch`
  for `/api/almanac` is commented as tolerating a stale backend — so do not
  "fix" this by making every call strict. The failure is that a *write* rejection
  is discarded, not that reads are tolerant.
- **Smoke counts an unconditional pass toward its 222.** Found 2026-08-04. When
  the first dungeon move starts combat, `tests/smoke.py:275` deletes the dungeon
  state with `db.kv_del("dungeon")` and calls `ok(..., True)` — a literal, so the
  check cannot fail. The comment claims killing the state "still exercises the
  exit paths"; it does not. Neither the retire request nor its exit behaviour
  runs, yet the result is counted in `SMOKE PASSED — 222 checks green`. The
  ordinary retire branch does run most of the time, which is exactly why this
  survived. Either drive flee-then-retire for real or drop the check — a count
  that includes an unconditional `True` makes the whole number less trustworthy.
- **Three named tests pass on empty output.** Found 2026-08-04. Each asserts
  `all(...)` over a generated candidate list without first proving the list is
  non-empty, so an empty result is a pass:
  `test_giver_archetypes.py:34` (giver ownership),
  `test_counsel_engine.py:81` (endurance cold-start sizing),
  `test_counsel_giver_loops.py:229` (giver-loop cold-start boundaries).
  Demonstrated by runtime mutation, not by reading: with `for_giver()` stubbed to
  return empty, `test_giver_archetypes.py` still printed `GIVER ARCHETYPES
  PASSED`; with `build_endurance_candidates()` stubbed empty, the whole of
  `test_counsel_engine.py` still printed `COUNSEL ENGINE PASSED`. Higher-level
  tests overlap some of this, so the *suite* is not blind — but these tests do
  not establish the claims their names make. Assert a count before asserting a
  property over a collection.
- **The Scheduled reservation fixture does not test Scheduled acceptance.** Found
  2026-08-04. `test_counsel_schedule_reservation.py` calls
  `counsel.validate_attribution` and `quests.create_quest_from_offer` directly.
  It never sets `counsel_mode` to scheduled, never obtains a scheduled offer, and
  never calls `/api/quests/accept` — yet its comment reads "When: Scheduled mode
  accepts it." It would pass unchanged if Scheduled acceptance were deleted
  outright. The real path is already covered at
  `test_counsel_scheduled_mode.py:195`, including required and optional
  attribution, so the honest move is to retire this fixture rather than repair
  it.
- **The 60-day qualification boundary has no test on either side.** Found
  2026-08-04. `ACTIVITY_LOOKBACK_DAYS` (`counsel_context_model.py:9`, value 60)
  feeds three consumers: activity qualification (`counsel_context.py:71`), lift
  recency (`counsel_context_model.py:197`) and `counsel_specialists.py:85`. No
  test places a row at 59, exactly 60, or 61 days; the nearest scenario
  (`test_counsel_context.py:181`) uses 1- and 9-day rows and exercises source,
  future timestamps and zero duration instead. So flipping any of those
  comparisons to strict would stay green.

  **Correction to the report that raised this:** it described the two sites as
  disagreeing — activities excluding rows strictly older than the cutoff while
  lifts include rows at it. They do not disagree. `local_time < cutoff → skip`
  and `occurred_at >= cutoff → keep` are the same rule written as complements,
  and both **include** the boundary. The coverage gap is real; the inconsistency
  is not. Do not "fix" a divergence here — add the boundary tests.

**Resolved stale declarations**

- **DONE v0.30.1 — Ser Bram's literals no longer call him a lifter.** Larger than
  the two entries first logged: the sweep found seven places two archetype changes
  behind. He gave iron until Phase 0 handed it to Grunhilda, then climbing until the
  collapse gave that to Fenn — but the code still queried his doctrine slot,
  measured his quests against lifting sets they could never accrue, filed them as
  weight training, paid them in strength, defaulted ownerless routines to him, and
  showed doctrine affordances on his retired board.

  **One reference stays on purpose:** `DEED_GIVER_BY_CATEGORY` still credits an
  *unsworn climb* to Bram. §0c retired him from setting tasks, not from noticing,
  and the flavour was already written for it. A comment marks it at the mapping and
  a test guards it — **do not "clean it up" in a future sweep.**

- **DONE v0.22.4 — Bram's registry entry is retired and owns no modalities.**
- **DONE v0.22.4 — Bram's title and subtitle both read "The Old Knight at
  Rest".**

**Dead code**

- ~~**The legacy offer path — REMOVE IT.**~~ **DONE — confirmed removed
  2026-08-04.** `get_offers`, `accept_offer`, `gen_lift_offers`,
  `gen_endurance_offers` and `gen_climb_offers` now return zero hits across
  `app/`, `static/js/` and `tests/`. The removal was carried out in full and the
  two warnings held: `gen_mobility_offers` survived and is still live
  (`counsel_specialists.py:227`), and `test_counsel_attribution.py:181` now
  proves the no-attribution invariant through unguided completion rather than
  `accept_offer`, exactly as prescribed. Recorded stale by the 2026-08-04
  codebase review — the work shipped without the entry being closed.

  **Nothing remains open from this entry.** The `attribution` tightening also
  shipped: `create_quest_from_offer` (`quests.py:543`) now requires
  `attribution: "Attribution"` with no default. *I recorded that remainder as
  still open on 2026-08-04 by carrying it forward from the old entry without
  checking the signature — Pass D caught it. Verify the code, not the previous
  bullet.*

- **Verified dead declarations.** Found 2026-08-04, each confirmed
  declaration-only across `app/`, `static/js/` and `tests/`:
  `counsel_wellness.qualified_recovery_days()` (`counsel_wellness.py:91`),
  `economy.buy()` (`economy.py:8`), `items.shop_stock()` (`items.py:99` — the
  other `shop_stock` hits are dungeon *dict keys*, not calls to it),
  `exercises.KB_NAMES` (`exercises.py:130`), `items.RARITY_ORDER`
  (`items.py:60`). The schema's `equipment` table (`db.py:94`) has neither a
  reader nor a writer. Unused parameters also remain in
  `colosseum._sim_fight(probs)`, `dungeon._rng(d)` and `intervals._get(athlete)`.

  Work out what each was protecting before deleting — `economy.py`'s shop path
  and `items.shop_stock()` are probably one story, not two.

  **`dungeon._rng` is no longer free — a test now depends on its signature.**
  Seam 1 made smoke's dungeon retire real, and the deterministic flee it needs
  monkeypatches `dungeon._rng` with `lambda _: random.Random(1)`
  (`tests/smoke.py`). Dropping the unused parameter breaks that patch and takes
  the whole smoke run with it. Change both together, or leave `_rng` alone.

- **Dead frontend declarations.** Found 2026-08-04. Zero matches across all
  `static/js/*.js` and `static/*.html` for these CSS surfaces: `.char-strip`
  (`style.css:352`), `.loc` (`:374`), `.ex-row` (`:445`), the old `.cal .day.q*`
  grid (`:864`), `.inv-*`/`.equip-*` (`:885`), the `.topbar` phone rules
  (`:1722`), `.logger-field-label`, and `.crank-action`. Also
  `REACTIONS.accept.bram` (`giver.js:36`), unreachable because Bram offers
  nothing and the server refuses new Bram acceptances.

  **The sprite claims need one more check before anyone deletes them.** The
  static `hero`, `bld_stall`, `bld_yard` and `bld_board` entries in `pixel.js`
  (from `:199`) have no *literal* references — current heroes go through
  `heroTag`/the customizable hero path, and Town buildings resolve through
  `art.js`'s `bld_waystone`/`bld_forge`/… set. But `SPRITES[key]` is looked up
  **dynamically** in `ranch.js:109`, `hall.js:994`, `pixel.js:716/1059/1077`, so
  grep alone does not prove a sprite is dead. Those dynamic keys come from
  monster icons, dungeon cell types, hat keys and Council modalities, none of
  which can produce these four — which is why the claim survives. Re-derive that
  before removing, and do not extend "no references" reasoning to any other
  sprite without it.

  **`G.dev` (`misc.js:1011`) is LIVE — do not delete it.** Confirmed with Joe
  2026-08-04: he calls it from the browser console, heavily while building the
  core game loop and testing pixel art, occasionally since. Being
  declaration-only in the tree is the *point* — the caller is a human at a
  console, so no static analysis will ever find one. The newer dev console
  calling `applyDevAction` directly does not supersede it; they are a UI and a
  manual entry point for the same actions. **Any future dead-code sweep will
  rediscover this and propose deleting it**, so when something next touches
  `misc.js` and spends a `?v=` bump anyway, add a comment at the declaration
  saying it is a console affordance with no in-tree caller by design.

**Legibility**

- ~~**Copy living in CSS.**~~ **DONE in v0.22.3** — the `within reach today:`
  lead-in moved from a `content:` rule into the `giver.js` template.
- **DONE v0.25.0 — `strength` no longer names Bram.** It remains a focus value
  and now maps to Grunhilda's matching giver key; Bram's permanent identity key
  is `bram`.
- **Quest-attribution atomicity is an unwritten structural dependency.** Found
  2026-08-04. `create_quest_from_offer` (`quests.py:543`) depends on
  `counsel_attribution.insert_attribution` (`counsel_attribution.py:110`)
  deliberately *not* committing, which is what lets a later failure roll back the
  quest and its attribution together. Every other DB helper commits, so the next
  person to make this one consistent with its neighbours dissolves the invariant
  and gets orphaned attribution rows with no error. Per `AGENTS.md`, name the
  invariant in a comment at the boundary it protects — this is the exact shape
  that cost five truthfulness defects when the Council was refactored.
- **Reachable Bram copy still calls him a lifter — the v0.30.1 sweep was
  incomplete.** Found 2026-08-04. That entry claimed seven literals and closed;
  these survived it, and they split into two different fixes:
  - **Live and wrong.** Bram's greeting pool (`giver.js:14`) offers "measured by
    what they can carry", "the barbell is a dragon", "heavy is the… deadlift",
    and his completion pool (`giver.js:42`) offers "the load was borne" and "even
    the barbell seems impressed". Legacy Bram climb quests remain deliberately
    playable and the Chromium legacy-quest scenario proves the route is reachable,
    so a player finishing an old wall oath is congratulated on barbells. These
    should speak to an old wall oath or a completed climb.
  - **Unsworn-climb attribution copy** (`town.js:27`) says "Iron moved is iron
    moved, writ or no writ." Bram now receives unsworn *climb* credit — the one
    reference §3 says stays on purpose — so the line should describe ground or
    wall gained, not iron.

  Note the standing warning still holds: `DEED_GIVER_BY_CATEGORY` crediting an
  unsworn climb to Bram is **correct and guarded by a test** — fix the prose, do
  not "clean up" the mapping.
- **Some rule-state test names claim more than the tests prove.** Found
  2026-08-04. `test_counsel_engine.py:159` asserts lower-body reason codes, and
  its wellness cases assert `suppresses_hard` plus reason codes — all artifacts
  of the rule having run, not outcomes a player would notice. Each would still
  pass if an offer consumer ignored the rule state entirely. This is **not** a
  suite-wide hole: the five/six-set offer outcome is covered at
  `test_counsel_release_blockers.py:16`, and missing or adverse wellness has
  observable offer assertions elsewhere. The defect is in what the names promise,
  so the cheap fix is renaming them to say they check rule state — reserve the
  outcome-shaped names for the tests that assert outcomes.
- ~~**The player- and agent-facing docs describe a game two redesigns old.**~~
  **RESOLVED 2026-08-04** by review seam 2 — all fourteen claims below corrected
  across `DOCTRINE.md`, `README.md`, `AGENTS.md`, `DESIGN.md` and `PLUGINS.md`,
  each anchored to the code that disproved it. Two judgement calls worth keeping:
  the readiness row was **not** deleted, because readiness genuinely is collected
  and persisted at sync (`intervals.py:27`, `:206`, `:212`) and only the *rule*
  is missing, so it now reads collected-and-unread; and "CRT scanline CSS" became
  "CRT vignette" rather than being dropped, because `style.css:108` does keep an
  edge vignette. Original finding, kept for the record:
  - **`README.md:8`** still gives Grunhilda kettlebells and Bram barbell,
    dumbbell, bodyweight and climbing, and **`:83`** has both honouring
    doctrines. The live roster (`game.py:57`, correctly summarised in
    `AGENTS.md:28`) is three offer-producing givers: Fenn takes endurance *and*
    climbing, Grunhilda takes all strength equipment *and* doctrines, Bram is
    retired.
  - **`README.md:32`** promises offers that "target the neglected" muscle
    groups. There is no neglected-muscle calculation: iron candidates pick recent
    exercises compatible with current equipment and derive focus from those
    movements (`counsel_specialists.py:45`).
  - **The paid reroll and the daily offer cache are gone** — `grep -rn reroll`
    over `app/` and `static/js/` returns **nothing**, and `/api/offers/{giver}`
    (`main.py:321`) takes a giver and nothing else, with no cache access. Still
    documented as live at `README.md:18` (gold sink), `README.md:36` (daily
    rotation, 10 gold to reroll), `AGENTS.md:281` (offers cache) and
    `AGENTS.md:301` (both the sink and the invalidate-on-sync rule). The
    surviving `offers:%` deletion is migration cleanup, not a live cache.
  - **`README.md:180`** still advertises "CRT scanline CSS." Zero `scanline`
    matches in `style.css`; `DESIGN.md:16` records the removal.
  - **`DOCTRINE.md:25`** lists a `readiness_1_5 <= 2` suppression threshold in a
    table headed "Constant (current value)". Readiness is stored at sync but
    `grep -rn readiness app/counsel*.py` returns **nothing** — no Council rule
    reads it, so that threshold does not exist in behaviour. **`:121`** puts
    `ACTIVITY_LOOKBACK_DAYS` in `counsel_context.py`; it is declared in
    `counsel_context_model.py:9`. **`:138`** calls focus filtering and equipment
    awareness open follow-ups; both shipped and have direct behavioural tests
    (`test_counsel_focus_filter.py`, `test_counsel_iron_equipment.py`).
  - **`DESIGN.md:235`** says `.btn` has no explicit `:focus-visible` rule and
    **`:310`** says tabs rely on browser defaults, but `style.css:230` carries an
    explicit gold `.btn:focus-visible` treatment. `DESIGN.md:567` requires
    visible focus on every control, so the component inventory is the stale half.

  **`DOCTRINE.md` is the urgent one.** `AGENTS.md` requires consulting it before
  changing any Council constant, so its drift is the most likely to be *acted
  on* — an agent reading a "current value" that no rule implements will go
  looking for the rule, or worse, restore it.
- **Pyright is configured but not provisioned.** Found 2026-08-04.
  `pyrightconfig.json` configures the checker, but it is declared in neither
  requirements file nor `package.json`, no local executable exists, and no doc
  gives a command to install or run it. It works through an editor or an ad-hoc
  `npx`, so a fresh checkout cannot reproduce a pinned type-check environment —
  and a config nobody can run is how a checker silently stops being a gate.
  Decide: pin it as dev tooling with a documented command, or delete the config.
- **Declarations that no longer match the code.** Found 2026-08-04.
  `records.py`'s module docstring (`records.py:1`) says everything in it reads,
  but `almanac_mark_seen()` (`records.py:589`) writes. `economy.py` still claims
  ownership of the town shop although its shop path is dead (see the dead-code
  entry above — same story, fix them together). Both are one-line corrections,
  but a docstring that lies about read-vs-write is how an accidental write gets
  added to a "read-only" module.

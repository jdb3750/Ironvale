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
capability check in the whole frontend — `static/js/giver.js:397`, gating on
whether an API key exists. Everything else renders regardless, so a player who
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

- **Elevation for overlaid surfaces** — floating menus, overlays and toasts should
  read as *closer to the viewer*: lighter, distinctly bordered, casting a shadow
  on what they cover. Today the topmost surface is the darkest on screen, and a
  menu is bordered exactly like an ordinary window. Full rationale and the
  tension it resolves are in `DESIGN.md` §7 ("PROPOSED — elevation for overlaid
  surfaces"). **Queued next after the dropdown width/wrap fix**, as a system-wide
  pass rather than a menu-only tweak.
- **Quanta-Strike font + type-scale pass** — a hand-drawn pixel font whose strikes
  are each sharp at exactly one size, which would force collapsing the stylesheet's
  17 text sizes onto about six. OFL-licensed, ships woff2, drops into the existing
  self-hosted font pattern. Analysis, the size mismatch, and the trial-first
  sequencing are in `DESIGN.md` §3 ("PROPOSED — Quanta-Strike"). **Try it on one
  screen before committing**; pair the full pass with the elevation work above,
  since both require re-walking every screen.

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

- **The browser suite flaked once, unidentified.** During the v0.30.3 run the
  canonical headless suite reported 47 pass / 1 fail, then passed 48/48 on four
  consecutive re-runs. The failing test's identity was not captured before the
  re-run, so there is nothing to point at — recorded anyway, because a suite that
  fails roughly one run in five without a name is exactly what erodes trust in a
  red result. If it recurs, capture the test name first and log it here before
  re-running.

  **It recurred during the v0.33.0 run, and the name was lost again.** 48 pass /
  1 fail on the run immediately after the `VERSION` bump, then 49/49 on two
  consecutive re-runs. The name was missed because the run was piped through
  `grep -E "^ℹ (tests|pass|fail)"`, which shows the counts and discards the
  failing test's identity — the summary lines are the only thing that survives.
  So the instruction above is not enough on its own: **capture the full output to
  a file, then read the counts from it**, e.g.
  `npm run test:browser > run.log 2>&1` before grepping. Two occurrences now, both
  unnamed, both a single failure that vanished on retry.
- **Headful screenshot mode hits `innerText` timing failures.** Observed during the
  v0.25.0 migration work: the optional headful capture mode failed twice on
  `innerText` reads while still producing valid captures, and the canonical
  headless suite passed 41/41. Same family as the `openGiverBoard` race fixed in
  v0.24.3 — a read that runs before the DOM settles. Low priority because the
  canonical path is headless, but it will keep producing noise that looks like a
  real failure.
- **A mid-day imported database can migrate without its own pre-migration
  snapshot.** `vault.ensure_snapshot_before_migration()` is per-UTC-day, so a
  legacy database imported *after* that day's snapshot already exists reuses it
  rather than sealing a fresh one. Both production saves were captured before
  their first mutation and normal profile creation writes the marker without
  migrating, so this only bites an out-of-band import. Narrow, but the whole point
  of that snapshot is being the rollback path.

- **The workout logger's empty state still names a retired giver.**
  `static/js/giver.js:758` reads "No quest in hand. Accept one from Grunhilda or
  Ser Bram first." Bram has offered nothing since v0.22.0, so the copy sends a
  player to a giver who cannot help them. A one-line fix, but it needs a `?v=`
  bump because it touches `static/`, so fold it into the next task that already
  changes a static asset rather than spending a bump on it alone.
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

- **A weighted pull-up loses its load.** `counsel_specialists._iron_exercises`
  suppresses the suggested weight for anything tagged `bodyweight`, because
  `lift_sets.weight` is `NOT NULL` and an unloaded rep stores `0.0` (which would
  render as "@ 0"). The rule cannot tell *unloaded* from *loaded*, so a Pull-Up
  logged at 10 kg offers no weight — and weighted pull-ups and dips are the
  natural progression once bodyweight reps get easy. Fix: suppress on a falsy
  weight, not on the equipment tag. *(Verified by probe.)*
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

- **The legacy offer path — REMOVE IT.** `get_offers`, `accept_offer`,
  `gen_lift_offers`, `gen_endurance_offers`, `gen_climb_offers` are reachable only
  from tests (verified caller-by-caller). **`gen_mobility_offers` is LIVE** and must
  never be deleted by association: mobility never got a `build_*_candidates`
  function, so `counsel_specialists.mobility` calls the legacy generator directly.

  *(I briefly argued for parking this because two suites reach through it. Joe
  overruled it — dead code is junk code, and steadiness beats convenience. He is
  right, and the removal is cleaner than I claimed.)*

  The two dependent suites both have honest live replacements:
  - `test_counsel_engine_baseline.py` characterizes the **legacy** generators'
    offer shapes and reward values. Repoint it at the Council path, which is what
    actually runs — better coverage than pinning dead output.
  - `test_counsel_attribution.py` uses `accept_offer` to prove a quest can exist
    with **no attribution row**. That invariant is NOT vacuous: it is live and
    exercised by `_record_unguided_completion` (`app/quests.py:1219`), which inserts
    an unguided-activity quest with no attribution every time a player trains
    without one. Repoint the test there.

  Also worth tightening once the dead caller is gone: `create_quest_from_offer`'s
  `attribution` parameter defaults to `None` only because `accept_offer` needed it.
  Afterwards `counsel.py` is the sole caller and always passes one.

**Legibility**

- ~~**Copy living in CSS.**~~ **DONE in v0.22.3** — the `within reach today:`
  lead-in moved from a `content:` rule into the `giver.js` template.
- **DONE v0.25.0 — `strength` no longer names Bram.** It remains a focus value
  and now maps to Grunhilda's matching giver key; Bram's permanent identity key
  is `bram`.

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

- **DB giver-key rename.** `kettlebell` names the Strength giver and `strength`
  names a retired giver who no longer offers anything. These are deliberate frozen
  misnomers (`COUNCIL_REDESIGN.md` §0b/§0c) because renaming means migrating live
  data on `main`. The three-giver collapse makes the case stronger, not weaker —
  but it is still its own carefully-scoped task.
- **ExerciseDB integration** — a larger exercise catalog with form cues and
  muscle-group targeting. Unverified: nobody has checked its licence, shape or
  fit against `exercises.py`. Needs a small spike before anyone estimates it.

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

- **The workout logger's empty state still names a retired giver.**
  `static/js/giver.js:758` reads "No quest in hand. Accept one from Grunhilda or
  Ser Bram first." Bram has offered nothing since v0.22.0, so the copy sends a
  player to a giver who cannot help them. A one-line fix, but it needs a `?v=`
  bump because it touches `static/`, so fold it into the next task that already
  changes a static asset rather than spending a bump on it alone.
- **The browser suite silently tests against a foreign server on its port.**
  `tests/frontend_browser.test.mjs` spawns its own uvicorn on 8322, but if
  something is already listening there it connects to that instead and produces a
  spray of unrelated failures with no hint of the cause. This cost three separate
  debugging detours in one day, each time from a leftover preview server. The
  suite should refuse to run — loudly — when 8322 is occupied by a process it did
  not start, rather than testing the wrong app.
- **A browser-suite helper can report navigation complete before the DOM
  settles.** Observed while adding retired-giver coverage: the helper's
  completion can race the render when screenshot writing shifts timing. Nothing
  fails today, but a helper that returns early produces intermittent failures
  that get blamed on whatever change happens to be in flight. Worth hardening
  before it costs someone a debugging session — this suite already burned one
  today through a port collision.

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

**Stale declarations (inert now, traps later)**

- **`GIVER_ARCHETYPES["strength"]` claims Bram owns climbing.** Full detail in
  `COUNCIL_REDESIGN.md` §0d. This is the same failure mode that orphaned every
  bodyweight movement, so it is the one I would clear first.
- **Bram's title contradicts his subtitle** — "the Unburdened" versus "The Old
  Knight at Rest". See §0d.

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
- **`strength` means two things.** In `COUNSEL_FOCUS_GIVERS` it is both a focus
  value (-> Grunhilda) and a giver key (Bram). Correct but hostile to read; it
  resolves itself with the DB key rename in §2.

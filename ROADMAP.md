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

## 3. Sweep-up backlog

Known defects and cleanups, deliberately deferred to a single sweep **at the end
of the current phase** rather than being smuggled into feature seams. Add to this
list as things are found; do not let it become a wishlist — every entry should be
something verified, with the reason it matters.

**Defects (behaviour is wrong today)**

- **A weighted pull-up loses its load.** `counsel_specialists._iron_exercises`
  suppresses the suggested weight for anything tagged `bodyweight`, because
  `lift_sets.weight` is `NOT NULL` and an unloaded rep stores `0.0` (which would
  render as "@ 0"). The rule cannot tell *unloaded* from *loaded*, so a Pull-Up
  logged at 10 kg offers no weight — and weighted pull-ups and dips are the
  natural progression once bodyweight reps get easy. Fix: suppress on a falsy
  weight, not on the equipment tag. *(Verified by probe.)*
- **`save_routine` accepts off-catalog exercise names.** `programs.py` stores any
  non-empty string as an exercise. The *readers* were hardened after this crashed
  Grunhilda's board with a `KeyError`, but the writer is still unvalidated, so new
  unreadable routines can still be created. Decide whether to validate on write or
  to keep tolerating them by contract — but decide, rather than leaving it
  accidental.

**Stale declarations (inert now, traps later)**

- **`GIVER_ARCHETYPES["strength"]` claims Bram owns climbing.** Full detail in
  `COUNCIL_REDESIGN.md` §0d. This is the same failure mode that orphaned every
  bodyweight movement, so it is the one I would clear first.
- **Bram's title contradicts his subtitle** — "the Unburdened" versus "The Old
  Knight at Rest". See §0d.

**Dead code**

- **The legacy offer path** — `get_offers`, `accept_offer`, `gen_lift_offers`,
  `gen_endurance_offers`, `gen_climb_offers` are reachable only from tests
  (verified caller-by-caller). **`gen_mobility_offers` is LIVE** and must not be
  deleted by association: mobility never got a `build_*_candidates` function, so
  `counsel_specialists.mobility` calls the legacy generator directly. Removing the
  dead five means rewriting the tests that reach through them.

**Legibility**

- **Copy living in CSS.** The lead-in string `within reach today: ` is a
  `content:` rule in `style.css` rather than the template — the only user-visible
  string in the codebase kept in the stylesheet.
- **`strength` means two things.** In `COUNSEL_FOCUS_GIVERS` it is both a focus
  value (-> Grunhilda) and a giver key (Bram). Correct but hostile to read; it
  resolves itself with the DB key rename in §2.

# Iron Vale — routine builder implementation plan

**Plan, not approved to build; each seam needs its own go-ahead** — the same
posture as `BUILDER.md`, which this document executes rather than replaces.
Where the two disagree, `BUILDER.md` wins except where §Corrections below
flags it as stale against the tree.

Written 2026-08-06 against `main` at v0.36.1. Tracked as issue #17.
Companion to `BUILDER.md` (the design) and `DOCTRINE.md` (where any training
constant this plan introduces must be entered in the same commit).

## Summary

Promote the routine builder from a button buried in Grunhilda's dialogue to
its own building on the town map, keep `BUILDER.md`'s earned-disclosure model
and seam order unchanged, seed newcomers through "start from a doctrine, then
customize" in the same editor veterans use, and answer "am I hitting the right
muscles" first with the live muscle map (wordless, at build time) and only
later with a talking Grunhilda (week level, counts and gaps, usually silent).
The one open training-constant question — what volume guidance a no-history
player sees — is recommended to be a clearly labelled game-design floor rather
than silence, with `DOCTRINE.md` entries for each number.

## The persona

Joe's own framing, near verbatim: he lifts, but he has never built his own
routine, and he feels lost about "am I doing the right thing / hitting the
right muscles." Not a beginner in the gym; a beginner at *programming*. That
is the person this feature serves first, and it implies three things:

1. **Guidance beats features.** Muscle coverage, balance across a week, and
   sensible defaults matter more than set-type taxonomies or percentage waves.
2. **The guidance must be trustworthy.** One wrong "you're neglecting X" on a
   correctly built push day and the mirror is dead (`BUILDER.md` §1). The
   answer to "am I hitting the right muscles" has to be *true*, which is why
   the routine view only describes and only the week view may say "missing."
3. **He should never have to declare himself a novice.** The interface earns
   depth from his data (`BUILDER.md` §3), so the same screen serves him today
   and in a year.

## Placement: a door on the town square

Today the builder is `SCREENS.doctrines` (`static/js/giver.js:485`), reached
only by visiting Grunhilda and finding the "DOCTRINES & ROUTINES" button on
her board (`static/js/giver.js:369`). That is exactly the "buried in menus"
problem Joe named: you have to already know the path.

**Recommendation: give routines their own building on the town map.** The town
scene is three flex rows of buildings built by the `bld()` helper
(`static/js/town.js:135`, rows at `:177-195`): givers on row one, Ledger
House / Hall / Bram's keep on row two, Menagerie / Crankwerk / Colosseum /
Undercroft on row three. Rows hold three or four buildings each, so there is
room for one more without layout surgery. The concrete change:

- Add one `bld(...)` call to the second row (`static/js/town.js:183-188`),
  in-world name to Joe's taste — "The Drill Yard" reads well next to
  Grunhilda's forge — with subtitle in the pattern of the others (e.g.
  "doctrines & your routines") and target `nav('doctrines',{giver:'strength'})`.
  The existing screen works unchanged; only the door is new.
- Building art: a PNG set under `static/art/poi/` mapped in `static/js/art.js`
  (`buildingTag`, `art.js:92`) like the other buildings, or a char-map sprite
  in `pixel.js` `SPRITES` as the cheap first version — `bld()` already falls
  back to `spriteTag` when no PNG mapping exists (`town.js:140`).
- Keep the button on Grunhilda's board too. Two doors, one room: the builder
  stays Grunhilda's domain in-world — she remains the voice, and `giver` stays
  in the routine payload (`app/programs.py:89` `save_routine`) — but you no
  longer need to walk through her dialogue to reach it.
- `?v=N` bump in `static/index.html` in the same commit, per `AGENTS.md`.

If in practice the second row crowds badly on phone (test at 8322 before
merging; `DESIGN.md` is binding), the fallback is the third row, and the
fallback after that is promoting the button to the top of Grunhilda's board
rather than nested below her offers. But the stated goal wins: one obvious
tap from the town, not a path you have to know.

### Accepted presentation for seams 1–2: the builder is a scene

Joe approved the scene-based v2 mockup on 2026-08-06 ("this looks really
solid… a great starting point"), in line with his standing no-button-piles
direction: place things in the world, don't stack controls. The presentation
contract this fixes:

- The builder screen is a **scene** — "the Drill Yard" in the town-scene
  idiom (sky, ground, standing sprites), not a form.
- The muscle dummy **is** the navigation: tap a dark muscle and a rack opens
  with the movements that meet it (seams 1–2). No group-key palette.
- The routine is a **physical ledger board** of iron plates hanging in the
  yard (seam 5's cards, staged as objects).
- The muscle-tap rack and all secondary panels **float over the scene**
  rather than reflowing it; the **forge is the routines entry point** (tap:
  strike a new board / draw one from the coals), replacing any
  +/new-routine button.
- **On phone, one dummy on a spinning plinth** (Joe, 2026-08-06): tap the
  plinth to turn it — instant, and it remembers its facing. Two guards are
  part of the contract so the spin never gates information: (1) the stage
  caption is generated from the same aggregation that lights the dummy and
  always counts the **whole body**, regardless of which side faces out; and
  (2) adding a movement that lights the hidden side **auto-turns the dummy**
  to show the glow. Desktop keeps the front/back pair. Any tap on the figure
  resolves to the nearest muscle, so the whole dummy is one honest target.

#### Vocabulary (codified 2026-08-06)

One metaphor per object; "forge" is never a save verb.

| object    | is / owns                  | verb(s)                                             |
| --------- | -------------------------- | --------------------------------------------------- |
| the forge | births routines            | **strike** (create a new board), **draw** (pull an old one from the coals) |
| the board | is the routine             | **hang** — hanging the board is saving it; the save button reads HANG THE BOARD |
| plates    | are the movements          | none to speak — they **wear** with logged sessions, capped at battle-worn |
| the dummy | mirrors the board          | none — it owns no verbs                             |
| weeks     | not part of the yard's metaphor | never forged, hung, or struck — the week view is a separate later surface |

Visual companion: `docs/mockups/routine-builder-scene.html` (screenshots
beside it in the same directory).

## What the research says

Nine apps surveyed (Hevy, Strong, Boostcamp, Fitbod, JuggernautAI, Alpha
Progression, Dr. Muscle, RP Hypertrophy, Liftosaur) plus the sets/frequency
literature. The findings that matter here, and what Iron Vale does with each:

**Placement convention — the builder is a first-class list, not a sub-menu.**
Hevy puts Routines directly on the workout tab with a template "Explore"
entry beside it (https://www.hevyapp.com/features/gym-routines/); Strong puts
"+ Template" on the start screen
(https://help.strongapp.io/article/105-about-templates). *Adopt* — that is
the town-building recommendation above, translated into Iron Vale's spatial
navigation.

**Templates-then-edit is the universal newcomer on-ramp.** Hevy ships 26
importable programs that become fully editable routines
(https://www.hevyapp.com/features/gym-workout-routines/); Alpha Progression's
wizard "outputs a starting point" into the same freeform editor experts use
(https://alphaprogression.com/en); Boostcamp's whole identity is following
famous programs (https://www.garagegymreviews.com/boostcamp-review). *Adopt,
without building anything new*: Iron Vale's built-in doctrines already are
the template library. The plan makes "start from a doctrine, then customize"
a first-class entry path — a button on each doctrine card that seeds the
routine editor with that doctrine's session — rather than a separate wizard.

**The card model is the genre's learned convention.** Hevy/Strong render a
routine as exercise cards with progressive disclosure behind a "…" menu
(https://www.hevyapp.com/features/exercise-programming-options/). *Adapt* —
`BUILDER.md` §6's block cards are this pattern, with Iron Vale's own
constraints: explicit ▲/▼ instead of drag (`DESIGN.md` §9 tap/keyboard
parity), tap-to-expand into the existing Workout Set Editor anatomy instead
of a hamburger menu, primary-muscle chip only.

**Liftosaur's build-time volume meter is the best guidance UI in the genre.**
Its planner shows sets per muscle with red/yellow/green against the published
10–20 sets/week range, hover revealing contributing exercises
(https://www.liftosaur.com/blog/posts/liftosaur-overview/). *Adapt, not
adopt.* The live per-muscle feedback idea is exactly seam 1's map — but
`BUILDER.md` §2c deliberately compares the player to their **own trailing
average**, not an external band, so the project never has to defend a
contested number and the meter can honestly say "below" as readily as
"above." The external heuristics survive only as candidates for the §7.1
no-history floor (see Open decisions).

**Fitbod's body heat map is the most-loved guidance feature surveyed**
(https://help.fitbod.me/hc/en-us/articles/360006269014-Muscle-Recovery) —
and it is a *recovery* map, not a balance score. *Already built*: Iron Vale's
17-muscle figure (`static/js/pixel.js:1048` `muscleMapTag`) plays this role
descriptively. Seam 1 feeds it routine contents; the Hall body tab already
feeds it recency (`static/js/hall.js:193`).

**Black-box guidance is the loudest complaint in the space.** JuggernautAI
hides the workout until you pay
(https://www.maaikebrinkhof.nl/juggernautai-app-review-part-1-sign-up/);
Fitbod's opaque picks and nonsense supersets draw sustained criticism
(https://justuseapp.com/en/app/1041517543/fitbod-workout-fitness-plans/reviews);
RP prescribes too few sets with no explanation
(https://physiquecollective.com/extras/rphypertrophyapp); Dr. Muscle's
science is praised while its interface is called "a research prototype"
(https://protokl.app/blog/dr-muscle-alternatives-2026). *Adopt the lesson
wholesale*: no auto-generation, no scores, every observation stated as a
count the player can check, every suggestion overridable, and the coach
silent by default. This is `BUILDER.md` §4 independently confirmed.

**Rejected outright**: the interview/generator model (Fitbod, Juggernaut,
Dr. Muscle — `BUILDER.md` §11 already bans "build a routine for me"),
Boostcamp's weeks-by-days spreadsheet as a builder canvas (Iron Vale's week
authoring is the Settings slot grid — see Corrections), drag-and-drop
organization, and set-type taxonomies as a launch feature (to-failure comes
later via §8a's sentinel; supersets via §8b's group letters).

**Evidence heuristics worth keeping on file** for §7.1: ~10–20 hard sets per
muscle per week (https://pubmed.ncbi.nlm.nih.gov/35291645/,
https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9302196/), each muscle ≥2×/week
(https://link.springer.com/article/10.1007/s40279-016-0543-8), pulling
volume at least equal to pushing
(https://bretcontreras.com/topic-of-the-week-4-pushing-and-pulling-ratios/).

## Dual audience: training wheels that are not a mode

**Adopt `BUILDER.md` §3 unchanged.** No modes, no self-classification. A
player with nothing sees templates, the palette, and the map; one routine
unlocks pattern coverage; two or more unlock the week rollup; a schedule or
logged history unlocks volume-vs-self and recency. Depth appears exactly as
fast as the player generates the data that makes it meaningful, and
disclosure never removes a surface already seen. This is the same
progressive disclosure Hevy and Strong do per-card, applied per-screen, and
it means Joe's "training wheels" are simply what the screen looks like on
day one — not a beginner mode he would resent by month three.

The newcomer entry path is templates-then-edit as above: doctrine cards grow
a "forge a copy" action that seeds the routine editor, so the first routine
is an edit, not a blank page.

### The coach

Joe floated a tiny coach character with a speech bubble. Evaluated honestly:
**yes — but it already exists in constrained form as `BUILDER.md` §4, and
the constraints are what make it survivable.**

- The first training wheel is not a talker. The live muscle map (seam 1)
  answers "am I hitting the right muscles" *wordlessly, at build time*,
  which is both faster and safer than prose.
- The talking coach is Grunhilda's `.insight` block, arriving at seam 6, at
  **week level only** — because a per-routine coach comment would fire on
  every correctly built split routine (`BUILDER.md` §1: a push day with no
  legs is not neglect, it is a push day) and would burn trust the first
  week. The research backs this hard: naggy, unexplained guidance is the
  single most common complaint across Fitbod, JuggernautAI, and RP.
- Her contract: counts and gaps only, one observation, priority-ordered,
  dismissible, silent by default, always paired with a verb ("forge a leg
  day" hands over a pre-seeded stack), never a score. `app/counsel_nudge.py`
  is the model, and the town already has the bubble machinery if her weekly
  observation should also appear at the forge (`static/js/town.js:523`
  `NUDGE_ANCHORS`, `:556` `showCounselNudgeIfDue`).
- **Accepted placement (Joe, 2026-08-06): she is pull-based.** Grunhilda is
  a small tappable portrait on the ledger board's upper-right corner; her
  reading opens on tap and is otherwise absent — you can simply ignore her.
  The Compendium's browse path is the matching small book glyph on the
  board's upper-left (both in the weight class of the app's ✕ close glyphs).
  The `BUILDER.md` §1 constraint applies inside her tapped reading too: the
  session part only *describes* ("meets the chest, shoulders, triceps —
  eleven sets"); any "missing" statement comes only from week-level data.

So: no new mascot, no persistent chatter. Grunhilda, rarely, saying one true
thing with a button attached.

## Seam-by-seam plan

`BUILDER.md` §5's order stands, with placement inserted as its own small seam
that can ship with or immediately after seam 1. On `BUILDER.md` §7.2 this
plan takes a position: **spec seams 1–3 as one arc — so the map's data flow
is built toward the week rollup rather than retrofitted — but ship seam 1
alone first.** Seam 1 alone delivers most of the value; the arc-level spec
just prevents the aggregation code being written twice.

Acceptance bar for every seam, per `AGENTS.md`: `.venv/bin/python
tests/smoke.py`, `npm run test:frontend`, `npm run test:browser`,
`.venv/bin/ruff check .` all green (quote the tools' own last lines), tests
asserting player-observable outcomes on both sides of each boundary,
verified on a port-8322 scratch `DATA_DIR`, `?v=N` and `VERSION` bumped in
the same commit as any JS/CSS change, and stop-and-report before the next
seam. Sizes are relative, never time.

**Seam A — placement (small).** The town door described above. Files:
`static/js/town.js` (one `bld()` entry), `static/js/art.js` or
`static/js/pixel.js` (building art), `static/index.html` (`?v` bump).
No backend. Player observes: a new building on the town square that opens
the doctrines-and-routines screen in one tap. Tests: browser test that the
building navigates to the screen; existing town tests stay green.

**Seam 1 — live map on the existing builder, plus honest unknowns
(medium).** Augment `SCREENS.doctrines` (`static/js/giver.js:485`) in place:
render `muscleMapTag` (`static/js/pixel.js:1048`) beside the add-row, lit by
set count aggregated from `RB.exercises` (`giver.js:482`) as the player
builds, and on each saved routine card. Muscle data comes client-side from
the catalog (`GET /api/catalog`, `app/main.py:491`, backed by
`exercises.muscles_for()`, `app/exercises.py:260`) — no new endpoint.
Off-catalog names get the visible "this movement is not in the book, so the
map cannot see it" state (`BUILDER.md` §8e), asserted in tests as visible,
not logged. Ship the templates-then-edit entry here too: "forge a copy" on
doctrine cards seeding `RB`. Player observes: the figure lights up as they
add exercises; a neutral per-routine line ("meets chest, shoulders,
triceps — eleven sets"); unknown movements declare themselves.

**Seam 2 — tap a muscle to find movements (small).** Make the map's muscles
tappable; a tap opens the movements that meet that muscle, reusing the
Compendium's muscle filtering (`static/js/hall.js:436`
`compendiumRecordMatches`, `COMP` state `:331`) — either navigating to the
Compendium pre-filtered or an inline list. Highest value-per-line item in
`BUILDER.md`. Player observes: dark hamstrings are a question the screen can
answer.

**Seam 3 — the week rollup (large; the real feature).** The first surface
allowed to say "missing." Recommended home: a week section on the same
promoted screen (the Drill Yard is now one tap away, and `BUILDER.md`
pins the rule, not the location — the Hall body tab stays recency-only).
Reads a sworn schedule when one exists (`app/counsel_schedule.py`; slot
shapes in `counsel_context.CounselScheduleSlot`) and falls back to the lift
ledger (`game.per_muscle_recency()`, `app/game.py:469`, already served in
`/api/stats`, `app/records.py:672`). Both sources are counting; neither
infers. Must carry the §8d one-liner that the map reads sets only, so runs
and rides are invisible to it. Backend: likely one thin read endpoint
aggregating per-muscle sets over the week; kv/JSON only, no migration.
Player observes: "nothing has met your hamstrings in nineteen days" — true,
at the only altitude where it is true.

**Seam 4 — movement patterns (medium).** Author the hinge/carry/unilateral
pattern taxonomy for the curated 26 in `app/exercises.py`; imported rows
stay honestly `unknown` (`BUILDER.md` §2b). Pattern chips join the routine
description and week rollup. Player observes: a fully lit map can still
show "you never hinge" — the neglect muscle coverage actively hides.

**Seam 5 — the editor (large).** Replace the add-row inside
`SCREENS.doctrines` with block cards: exercise, sets×reps, primary-muscle
chip only; ▲/▼ reorder, no drag; tap-to-expand into the Workout Set Editor
anatomy (`G.editSet`, `static/js/giver.js:985`); palette of seven latched
group buttons (`GROUPS`, `app/exercises.py:16`); curated 26 first, imported
behind "show all"; in-stack items disabled, not hidden. All per
`BUILDER.md` §6. Payload unchanged — the old and new builder write the
identical `{name, giver, exercises:[{exercise, sets, reps}]}` shape
(`app/programs.py:89`), which is the condition `BUILDER.md` §9 sets for the
old builder's survival.

**Seam 6 — volume vs. own average, and Grunhilda speaks (medium).** The
§2c self-comparison on the week rollup, plus the `.insight` block under the
§4 contract. Her surface is the accepted pull model above: the tapped
portrait on the ledger board — reading on tap only, session part
descriptive, "missing" clause week-level. Requires the §7.1 decision
(below); whichever way it goes, the `DOCTRINE.md` entry lands in the same
commit. Model: `app/counsel_nudge.py`.

**Seam 7 — progression for custom routines (small-to-medium).** Today
`programs._suggest` (`app/programs.py:158`) progresses built-ins via their
`inc` tables while custom routines replay `game.last_weight()`
(`app/game.py:523`) forever. Add an optional increment to the
`save_routine` payload and honor it in `build_program_offer` /
`build_scheduled_routine_offer` (`app/programs.py:177`, `:189`). A routine
that never says "add weight" is a checklist, not a training tool.

## Corrections to BUILDER.md

**§10's "There is no `SCREENS.schedule`" is stale.** A weekly schedule slot
editor already exists inside Settings: `counselScheduleEditorHTML`
(`static/js/misc.js:391`), the slot chooser (`:449` onward), and a save
action (`:419`), rendering a days-by-slots grid with sized/routine/open/rest
slots and even an adherence caption ("Sworn paths kept this week: X of Y",
`misc.js:394-397`). It is not a standalone screen, but authoring exists.
Two consequences:

1. Seam 3's week rollup can read a sworn schedule **now** — the "reads a
   schedule when one exists" branch is live on day one, not deferred.
2. The schedule-authoring seam `BUILDER.md` §10 anticipated is not "build
   from scratch" but "move or promote the Settings editor" if it should
   live nearer the routines screen at all — possibly nothing more than a
   link.

Related and worth naming: Settings also contains a second routine-forging
form (`G.saveCounselRoutine`, `static/js/misc.js:767`) with a known
dup-on-retry defect and a stale-cache coupling to the doctrines screen
(`counselSchedulePrograms`, `misc.js:240`; ROADMAP §3 — "fix the ownership,
not the two symptoms"). The tree already has two builders; this plan's
seams touch the canonical one, and the ownership fix is a follow-up that
should land before or with seam 5, not be quietly absorbed into it.

## Open decisions for Joe

Still genuinely open (1–4 below). The presentation questions from the v3
design critique were all decided by Joe on 2026-08-06 and are recorded as
RESOLVED after them.

1. **§7.1 — the no-history volume case: silence, or a labelled floor?**
   A player with no trailing average has nothing to be compared against.
   **Recommendation: the labelled floor.** The persona is exactly the
   no-history newcomer the floor is friendlier to, and the research
   heuristics are the natural candidates: 10–20 sets per muscle per week,
   each muscle ≥2×/week, pull at least matching push — each presented as a
   clearly labelled game-design floor ("the Vale's rule of thumb"), never a
   red mark, and each with its own cited `DOCTRINE.md` entry in the same
   commit. The floor retires from a player's view the moment their own
   trailing average exists.
2. **Does the old builder die?** `BUILDER.md` §9: it stays free only while
   payloads stay identical. Recommendation: keep it through seam 5's
   verification window, then delete it (and resolve the Settings
   routine-forge duplication in the same pass) rather than owning two data
   models the first time the new editor wants group letters or a to-failure
   sentinel.
3. **Where the week rollup lives.** This plan recommends the promoted
   routines screen (seam 3 above); the alternative is a Hall tab. Cheap to
   change before seam 3 is specced, expensive after.
4. **The Drill Yard's name and art.** In-world naming is Joe's call; the
   sprite-vs-PNG choice only gates how the building looks, not the seam.

### Resolved by Joe, 2026-08-06 (the v3 critique's questions)

1. **Time of day — RESOLVED: the yard inherits the town's clock and sky
   tilesets unchanged.** Same sky as the town, same 06:00/18:00/20:00 swaps
   — it's one village.
2. **First run — RESOLVED: austere.** Bare dark-wood dummy, empty board,
   the forge coals visibly the brightest thing on screen, and **no
   unprompted Grunhilda line** — she is a grunhilda-shaped button, a fully
   optional lifeline, never forced.
3. **Phone dummies — RESOLVED: one dummy on a spinning plinth** (tap the
   plinth to turn; instant; remembers facing), with the two spin guards now
   in the seam 1–2 presentation contract (whole-body caption; auto-turn on
   lighting the hidden side). Desktop keeps the pair.
4. **Grunhilda at rest — RESOLVED: tapped-only, with one honest tell.** A
   small ember glint on her portrait may indicate she holds a week-level
   reading; glints and other notification tells are **toggleable off in
   Settings** (the Settings surface itself is not part of this feature's
   mockups).
5. **Patina — RESOLVED: plates only, with an end state.** Plates take
   visible wear from logged sessions and the wear **caps at battle-worn**,
   so the most-worn plates read as your top exercises. Subtle, charming,
   never decrepit.
6. **Vocabulary — RESOLVED: codified, one metaphor per object** (see the
   Vocabulary table above). The forge births routines (strike/draw); the
   board is the routine and hanging it saves it (the save button reads
   HANG THE BOARD; "forge" never again appears as a save verb); plates wear;
   the dummy only mirrors and owns no verbs; weeks are never
   forged/hung/struck — the week view is a separate later surface.

## Out of scope

Inherited from `BUILDER.md` §11 in full, and restated because the
out-of-scope list does more work than the spec:

- No drag-and-drop (§6: explicit ▲/▼ with tap/keyboard parity instead).
- No nesting, circuits, C-blocks, or "repeat 3×" — a routine stays a flat
  list; supersets, when they come, are §8b's group letters, never structure.
- No routine quality score or balance percentage.
- No per-routine "too much of one muscle group" warnings — superseded by §1.
- No rest timers, no periodization, no "build a routine for me", no routine
  sharing between profiles.
- No new frameworks, libraries, or build steps (`DESIGN.md`).
- Nothing medical, audit-shaped, or disclaimer-shaped. Iron Vale is a game:
  it does not diagnose, predict injury, prove its advice, or stand in for a
  professional — say this non-goal out loud in every seam's brief.

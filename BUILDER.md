# Iron Vale — the routine builder

A routine builder that shows you what your routine actually does while you build
it, so you can tell whether you are neglecting something.

**Nothing here is approved to build.** Each seam needs its own explicit
go-ahead, built one at a time, verified, reported, and stopped — the same
discipline `AGENTS.md` requires of any other work. This document exists so the
design decisions are made once, in the open, rather than rediscovered inside an
implementation.

Tracked as issue #17. Designed 2026-08-04 against v0.36.1.

## 0. The reframe

The original sketch was "Scratch for workouts" — drag blocks together, watch a
little person light up. Worked through, the editor turns out to be the least
important part.

**The feature is the mirror, not the editor.** "Am I neglecting anything" is a
coverage question, and blocks do not answer coverage questions — feedback does.
So the builder stays a fast, boring list, and the investment goes into what it
shows back.

Scratch's actual value is three things: a palette of legal pieces, shape
constraining legality, and seeing the result immediately. Drag is only how
Scratch implements the second, and it is the expensive and least accessible
part — ScratchJr had to be redesigned for touch for exactly this reason. Take
the palette and the live feedback; get legality from structure instead of
physics.

## 1. The rule the whole thing rests on

> **The routine view only describes. Only the week view may say something is
> missing.**

A push day with no legs in it is not neglecting your legs — it is a push day.
A per-routine warning about "too much of one muscle group in a session" (the
original framing of the issue) fires on every correctly-built routine and is
wrong every time. Trust in the mirror dies the first week that happens.

- **Per-routine:** "this session meets the chest, shoulders and triceps. Eleven
  sets." Neutral, factual, never a complaint.
- **Week-level:** "nothing has met your hamstrings in nineteen days." That is
  the only altitude at which it is true.

This rule is the reason the feature is affordable. Everything expensive about
the original sketch came from trying to make a single routine self-assess.

## 2. What it shows

Four lenses over the same data, plus one navigation affordance.

### 2a. Muscle coverage

The existing figure — `muscleMapTag`, `MUSCLE_MAP_ROWS`, `MUSCLE_COLORS` in
`static/js/pixel.js` — lit by set count rather than binary primary/secondary.
Seventeen muscles, front and back. Already built; it needs aggregate input, not
a rewrite.

### 2b. Movement patterns

You can light the entire map and still never hinge, never carry, and never do
anything unilateral. Machine-only routines do this constantly. **Muscle coverage
actively hides the most common real neglect**, which is why this lens is not
optional decoration.

Patterns do not exist in `app/exercises.py`. Authoring them for the curated 26
is small; imported rows stay honestly `unknown`, the same posture §2e takes for
off-catalog names.

### 2c. Volume

Sets per muscle per period, compared against **the player's own trailing
average** — never an external guideline.

This is counting, not causal inference, so it carries none of the confound that
killed the counsel-outcome reflection (`COUNCIL_REDESIGN.md` §7b). It is also
strictly better than a generic figure for an experienced player, and unlike that
cut card it can say "below" as readily as "above." A metric that can only return
one answer is not measuring anything.

The sets-per-week literature has a wide and contested effective range. Comparing
the player to themselves sidesteps the need to defend a number at all. See §7.1
for the one case this does not cover.

### 2d. Recency

Days since a muscle was last met. The data already exists.

### 2e. Tap a muscle to find movements that meet it

Without this the map diagnoses and abandons you. It is the answer to "my
hamstrings are dark, now what," it turns the figure from a report into a
navigation surface, and the Compendium already has muscle filtering
(`static/js/hall.js`) to build on.

Probably the highest value-per-line item in the document.

## 3. Easy for a newcomer, real for a veteran

Not a mode, not a setting, and nobody self-classifies. **Depth is earned by what
the player has built:**

| They have | They see |
| --- | --- |
| Nothing yet | Templates, palette, the map |
| One routine | The map plus pattern coverage |
| Two or more | The week rollup appears |
| A schedule, or logged history | Volume vs. their own average; recency gaps |

The interface becomes more informative exactly as fast as the player generates
the data that makes it meaningful. This is the Considered → Choose-your-own →
Scheduled graduation path (`COUNCIL_REDESIGN.md` §7c) applied one layer down;
the lens is already the project's stated model for how judgment develops.

Disclosure is additive and never removes a surface the player has already seen.

## 4. Grunhilda's contract

A `.insight` block — the blue left-border counsel motif, per
`COUNCIL_REDESIGN.md` §3b — that speaks **only in counts and gaps**, one
observation at a time, priority-ordered, dismissible, and **allowed to be
silent**, which is most of the time. A coach who always talks is noise.

- **She states what is true of the player's data**, never a general claim about
  training. "Three of your five movements meet the shoulders; nothing meets the
  legs" is a fact. "Try a less-utilised group" is a prescription — it implies
  balanced routines are better, which is a training claim someone then has to
  defend, and any threshold for "under-worked" needs a `DOCTRINE.md` entry in
  the same commit.
- **She gets a verb.** An observation with no next move is nagging: "forge a leg
  day" hands over a pre-seeded stack.
- **No score.** "Routine balance: 72%" is §7b all over again.

`app/counsel_nudge.py` already produces a daily line and is the model to borrow
from.

## 5. Seams

Independently shippable; each is useful alone. The editor lands late — under §0
it is the least urgent piece, and by then the feedback will have taught us what
it should be.

| | Seam | Notes |
| --- | --- | --- |
| 1 | Live map on the **existing** builder + honest unknown-exercise state | start here |
| 2 | Tap-a-muscle → find movements (§2e) | small, disproportionate payoff |
| 3 | Week rollup — the first surface allowed to say "missing" | the real feature |
| 4 | Pattern coverage (§2b) | curated authored, imported honest-unknown |
| 5 | Palette + block cards replacing the add-row (§6) | the editor |
| 6 | Volume vs. own average (§2c); Grunhilda's block (§4) | needs the §7.1 call |
| 7 | Linear progression for custom routines (§8c) | |

Seam 1 alone delivers most of the value for a fraction of the work, which is the
strongest argument for the whole design: it degrades gracefully.

## 6. The editor, when we reach it

Replaces the current dropdown/two-number-boxes/ADD row in `SCREENS.doctrines`
(`static/js/giver.js`).

- **Block cards** carrying exercise, sets×reps, and **the primary muscle chip
  only.** Secondary muscles wrap badly and drown the card on imported exercises
  that list six.
- **Reorder by explicit ▲/▼**, disabled at the ends. **No drag.** `DESIGN.md` §9
  requires a direct tap and keyboard path with the same outcome for any
  essential drag interaction, so drag costs the pointer/touch/auto-scroll/
  cancel-restore work *and* the buttons duplicating it — and on phone the
  buttons are what gets used.
- **Tap to expand** into the 48px steppers the Workout Set Editor contract
  already defines. Reuse that anatomy; do not invent a second one.
- **The palette is seven latched group buttons**, not a dropdown — that is the
  "palette of legal pieces." Selection stays gold per §3b.
- **Curated 26 first, imported behind "show all."** This answers the "curation
  is a feature, a lottery at ~1300" problem in `ROADMAP.md` §2.
- **Already-in-the-stack renders disabled, not hidden.** Hiding it makes the
  palette feel like it is lying.

Movement patterns (§2b) would teach better than muscle groups as palette
categories, but the taxonomy does not exist yet. Groups cost zero new data;
treat patterns as a later refinement if groups prove wrong in practice.

## 7. Open decisions

1. **The no-history volume case.** A player with no trailing average has nothing
   to compare against. Silence, or a clearly-labelled game-design floor? Silence
   is safer; a floor is friendlier to exactly the newcomer this is for. Either
   answer needs a `DOCTRINE.md` entry in the same commit.
2. **Whether seam 1 ships alone** or seams 1–3 are specced as one arc, so the
   map is built toward the week rollup rather than retrofitted into it.

## 8. Data model notes

### 8a. To failure — affordable

A property of one exercise, not a structure. `programs.save_routine` clamps reps
to an integer 1–50 so it needs a sentinel; offer pricing sizes on
`total_sets × reps` so an unknown-rep set needs a rule. The logger already
accepts whatever reps get logged, so *recording* is nearly free — only
prescription is work.

Critically, **a failure set is still one set**, so set counting, the map and the
rollup are all unaffected.

### 8b. Supersets — use the cheap version

The obvious model nests exercises into groups. It changes the routine payload
shape, breaks every saved routine, and breaks the logger's flat `L.routine`
indexing. Do not.

Instead: **an optional group letter per exercise** (`A`, `A`, `B`). The list
stays flat, absent means ungrouped so existing routines still load, the logger
renders `A` cards adjacent, and nothing nests.

Worth knowing: `DESIGN.md`'s Workout Set Editor contract already says multiple
editors stay open "so a superset never requires reopening a card after every
set." The UI was designed anticipating supersets; only the data never got them.

### 8c. Progression for custom routines

`programs._suggest` does linear progression for built-in doctrines via their
`inc` table; custom routines call `lookup()` and hand back the last weight
forever. For "useful regardless of gym tenure" that is a hole — a routine that
never tells you to add weight is a checklist, not a training tool. Small
addition to the `save_routine` payload.

### 8d. The map reads sets, not activities

The figure is fed from the lift ledger, so runs and rides are invisible to it.
**The rollup must say so explicitly**, or it quietly implies the player's legs
did nothing for three weeks when the truth is that nothing *counted in sets* met
them. One line of copy; without it the feature misleads.

### 8e. Off-catalog exercises

`programs.save_routine` accepts any string as an exercise name, so a routine can
hold movements the catalog does not know. Those light nothing on the map, which
means a lopsided routine can look balanced. This needs an explicit "this
movement is not in the book, so the map cannot see it" state, not a blank body.

Per `AGENTS.md`, assert the player-observable outcome here: the unknown state is
*visible*, not merely logged.

## 9. The optional-builder toggle

Its real purpose is an escape hatch during the first weeks, not a permanent
product feature. It stays free **only** while the new builder writes the
identical `{name, giver, exercises:[{exercise, sets, reps}]}` payload. The day it
wants rest intervals or grouped supersets, there are two data models to
maintain. Plan to delete the old builder, or accept owning both.

## 10. Scheduled mode — inherited from "build weeks"

The week rollup (§5 seam 3) reads a sworn schedule when one exists and falls back
to the lift ledger when it does not. **Both sources are counting; neither infers
anything.**

Authoring a schedule is a separate seam from the builder, and an unusually cheap
one, because most of it already exists:

- `app/counsel_schedule.py` — slot resolution, `next_planned_slot`, routine
  drafts and sizing.
- `counsel_context.CounselScheduleSlot` — the slot type. Per
  `COUNCIL_REDESIGN.md` §5b-i a slot takes one of three shapes: **sized**
  (modality + tier), **routine** (a `programs.py` key, built-in or
  `custom:<id>`), or **open** (modality, or nothing at all), plus the `rest` and
  `optional` flags.
- `scheduled` is already a valid value in `game.COUNSEL_MODES`.
- `schedule` is already a valid mode in `counsel_attribution`, and the
  `counsel_attributions` CHECK constraint was widened to accept it ahead of
  time.

**What is missing is only the authoring UI.** There is no `SCREENS.schedule`, so
a player has no way to write a week down.

The "day variants for routines" ask from the original issue is already answered
by §5b-i's decision against pinned A/B sessions: a routine slot names the
routine and a doctrine keeps alternating through its own sessions via
`program_state`; two custom routines named for their halves express the same week
with no new mechanism.

Once authoring exists, the rollup gains plan adherence — "you planned five, you
did four" — which is the honest metric `COUNCIL_REDESIGN.md` §5b-i kept the
attribution tags for.

## 11. Non-goals

Iron Vale is a game. This feature does not diagnose, predict injury, prove its
advice, or stand in for a professional, and nothing here should grow audit
trails, tamper-evidence, or disclaimer prose. Say the non-goal out loud in every
brief.

Explicitly out of scope:

- **Drag-and-drop.** See §6.
- **Nesting, C-blocks, circuits, "repeat this 3×".** A routine is a flat list of
  (exercise, sets, reps); there is no branching and no state. Taking the Scratch
  metaphor as far as control flow turns this into a schema project touching
  `app/programs.py`, `app/quests.py` set generation, the logger, and
  `build_scheduled_routine_offer`.
- **Any routine quality score or balance percentage.**
- **Per-routine "too much of one muscle group" warnings.** Superseded by §1.
- **Rest timers, periodization, "build a routine for me", routine sharing
  between profiles.** Each defensible; together, a year.

## 12. Prior art already in the tree

- `muscleMapTag` / `MUSCLE_MAP_ROWS` / `MUSCLE_COLORS` — `static/js/pixel.js`.
- `exercises.muscles_for()` / `groups_for()` — `app/exercises.py`.
- `SCREENS.doctrines` — `static/js/giver.js`, the builder being replaced.
- `programs.save_routine` / `build_scheduled_routine_offer` — `app/programs.py`.
- `counsel_nudge.py` — Grunhilda's existing daily-line engine.
- Compendium muscle filtering — `static/js/hall.js`, the machinery behind §2e.

# The Drill Yard — semi-adversarial design pass (v3 mockup)

Reviewed: `docs/mockups/routine-builder-scene-phone.png`,
`docs/mockups/routine-builder-scene-desktop.png`,
`docs/mockups/routine-builder-scene.html`, against
`docs/routine-builder-plan.md`, `DESIGN.md`, `static/js/town.js`, and the
app's live aesthetic. Ground rules respected throughout: routine view only
describes; week view owns "missing"; no drag; no button piles; tap-first; no
scores, no per-routine warnings, no rest timers.

Verdict up front: the composition is right. The dummies centered, the ledger
as a physical board, floating panels that reflow nothing — the scene reads as
a place, not a collage, and the v3 re-composition solved v2's real problems.
What remains is a layer of honesty debt (tap targets, contract mismatches,
spec voice leaking into player copy) and three or four regions where the
whimsy is asserted in the margin notes but not yet earned in the pixels.

---

## A. What earns its place

- **The dummies as the muscle map.** First thing the eye hits on both frames
  after the logo, exactly as it should be: red chest and gold shoulders on
  the front figure, pink hamstrings on the back. Worked-glows-vs-dark-wood is
  legible at arm's length. The armor-stand post and crossbeam sell "object,"
  not "diagram." This is the feature.
- **The wood plate for Cable Fly.** Pale untreated wood among iron, dark ink
  on light grain, and the line "not in the book, the dummy cannot feel it" —
  the single best moment in the mock. Honest state rendered as material.
  Every future honest-unknown in the app should aspire to this.
- **The ledger as a hanging board.** Beam, chain links, wood-grain tile,
  rivet corners on each plate, the engraved nameplate. It reads as one built
  thing, and the plates read as parts of it.
- **The weapon rack's plaques.** Bronze-edged, name-forward, `meets:` lines
  in true muscle colors, Romanian Deadlift greyed "already on the ledger" —
  disabled-not-hidden done in-world, and truthful.
- **The 48px steppers on the fresh plate.** Honest phone targets,
  demonstrated at real size, with the fresh-forged orange glow marking the
  unlatched plate. Correct per DESIGN.md and charming besides.
- **The forge panel's copy.** "in the coals — draw it out", "a bare board,
  ready for plates" — the entry point speaks the world's language and the
  taken/available/new triad is instantly parseable.
- **The stage caption's voice.** "The dummy feels the chest, shoulders…"
  describes and never judges — the §1 contract audible in one sentence.

---

## B. Clutter → whimsical declutter

### B1. The instructional fine-print sediment (both frames, worst on phone)

Count the permanently visible instruction lines in one screen: the forge
sign's two-line subtitle; "tap the nameplate to re-engrave it" under the
board name; "sets alone light the dummy — runs and rides pass it by" under
the caption; "still hot from the forge — tap the plate to latch it…" in the
open plate; "the forged scroll writes the same {name, giver, exercises} the
old builder wrote" at the board foot; "tap the dark to close — the yard
never moves beneath it" in the forge panel; "the curated shelf first — the
full armory waits behind the book glyph on the board" in the rack. Seven
standing tooltips. Each is individually charming; together they are a
docent who never stops talking, and they are the main reason the board
region feels dense. Why it fails: hierarchy — fine print at 10px is
supposed to be rare enough to be noticed.

**Whimsical declutter — copy does the work of chrome, then leaves.** Three
moves, none of which strip detail:

1. Fold the transient ones into the moment they describe. "Still hot from
   the forge" belongs on the fresh plate *only while it glows* — when the
   glow latches, the line goes with it. "Tap the dark to close" can simply
   not exist; the dimmed scrim is the app's established close affordance.
2. Give the standing ones to Grunhilda. She is already the tap-for-a-reading
   corner. "Sets alone light the dummy — runs and rides pass it by" is a
   thing *she* should say inside her reading (it is her §8d one-liner), not
   a caption bolted under the dummies forever.
3. Delete the two lines that are spec notes wearing player clothes (see D3).

The test: at rest, the yard should carry at most two lines of fine print —
the forge sign's short subtitle and the board's nameplate hint — and the
nameplate hint could itself become a moment (the nameplate briefly shows a
chisel cursor on first visit, then never explains again).

### B2. The forge sign vs. the forge (phone, left horizon)

On the phone frame the sign ("the forge / strike a new routine, or draw an
old one from the coals") is a 200px-wide placard — wider than the forge,
taller than the anvil, and it overlaps the ground seam awkwardly. The
object is upstaged by its label; that is a form wearing a pixel costume,
the exact thing v2→v3 was killing. Why it fails: the scene grammar says
objects announce themselves by *being*, with a name underneath (compare
town buildings: name + five-word subtitle).

**Whimsical declutter:** shrink the sign to the town-plate pattern — "the
forge" + "strike or draw a routine" — and move the removed meaning into the
object: coals that pulse (the town already animates attention with the 1s
bob; a 2-frame ember flicker is the same budget), a thin pixel smoke wisp,
and a brighter glow when the yard is empty (see E2). The forge should read
as the warmest thing in the yard, because it is the door.

### B3. The phone sky (top of the yard frame)

~170px of near-empty navy gradient above low mountains, on the most
expensive screen in the app. On a 390px phone this is almost half a
viewport of atmosphere before the first interactive object. Why it fails:
dead zone — the eye falls through it, and the player scrolls past it every
single visit.

**Whimsical declutter (do not amputate it):** the sky is what makes the
yard a place, so keep sky — but make it *the town's* sky. Town already owns
the three time-of-day tilesets and swaps at 06:00/18:00/20:00; the yard
inheriting that clock costs no new system and makes the yard feel attached
to the same world (and quietly answers "is this a screen or a place").
Then trim the band ~40–60px on phone so the forge and dummies ride higher.
A raven crossing the sky on the sync tick would be pure profit, but the
clock sky alone earns the band. (Time-of-day is also E1 — Joe's call.)

### B4. The desktop dirt margins (either side of the board)

With the barrel and stones gone (v3 note), the desktop yard's lower half is
a wide board floating in ~90px of empty dotted dirt per side. It is not
cluttered — it is slightly barren, which is the failure mode Joe named as
equally bad. **Whimsical re-dressing, strictly non-tappable:** put the
yard's *evidence of use* back as set dressing that cannot be mistaken for
controls — a lean of spare iron plates against the board's leg, a rake, a
water pail, chalk half-worn on the dirt. Nothing glowing, nothing labeled,
nothing at plate-brightness: decorative things must sit below the tappable
brightness floor (see D1). This also seeds E5 (patina) if Joe wants the
yard to age.

### B5. The open-plate editor block (phone, Romanian Deadlift)

The expanded plate is tall: name row, scheme row, two 48px stepper rows,
plus a two-line caption. The steppers are non-negotiable (contract), the
caption is B1's problem. One genuinely free win: the SETS/REPS labels sit
in a 44px-wide dim column while the value floats mid-row — stamping the
labels *into* the plate (embossed letters, the way "sets × reps" already
sits inline on closed plates) would let the row read as one forged object
instead of a form row that wandered onto a plate.

---

## C. Feels unimportant → remove, or re-enchant?

### C1. The FRONT / BACK plinth labels — re-enchant, do not remove

At phone scale they are tiny gold-on-black chips; at desktop scale they are
barely legible. Tempting to delete — the silhouettes are self-evidently
front and back. But they are doing quiet work for the first-run player and
for accessibility (the two canvases need names anyway). Re-enchant: engrave
the words into the plinth stone itself (letters in the plinth's lighter
bevel tone) instead of floating chips. Same information, zero chrome, and
the plinth earns a second job.

### C2. The stage caption ("The dummy feels…") — keep, but make it exact

It looks like decoration; it is actually the §1 descriptive contract made
visible, and it must stay. But right now it is *wrong*: the mock lights
glutes warm (`LIT` includes `glutes: 'warm'`, and the pink glow is visible
on the back dummy) while the caption names only chest, shoulders, triceps,
hamstrings. The plan's own words: one wrong reading and the mirror is dead.
The caption must be generated from the same aggregation that lights the
dummy, muscle-for-muscle, or it will someday disagree with the pixels two
inches above it. Fix in mock: "…and now the hamstrings and glutes.
Fourteen sets."

### C3. The "the book" corner glyph — keep, give it one moment

A 24px book with a dim caption, upper-left of the board. Approved contract,
right weight class, and removal would be wrong — it is the by-name path for
the lifter who knows what they want. But as drawn it is the least
object-like thing in the yard: a floating sprite with a floating caption on
a wood board. Re-enchant cheaply: nail it down. A leather strap or a nail
head over the book's spine makes it *hang on the board* like everything
else hangs on something. Same 24px, same corner, now diegetic.

### C4. Grunhilda's bust — keep exactly this quiet, with one honest tell

Her corner presence is approved and correct — pull-based, ignorable. The
risk as drawn is the opposite of clutter: she reads as decoration, and the
grammar says nothing decorative may look tappable *and nothing tappable may
look decorative*. She needs the same at-rest affordance as other tappables
(the dim caption helps; hover-only color change does nothing on phone).
The one addition worth Joe's blessing (E4): when she actually holds a
week-level reading, a tiny ember glint on her portrait — still silent,
still ignorable, but the player learns her corner is alive. Without some
tell, seam 6 ships a feature most players will never discover.

### C5. The `v0.36.1 — mockup` / raven footer — keep

App chrome, not scene; it anchors the frame as the real shell. No action.

### C6. The desktop `hdr-streak` flame box — fine

Existing header furniture, not this feature's problem. Leave it.

---

## D. Coherence & honesty checks

### D1. Tap-target honesty on the dummy — the biggest problem in the mock

The premise is "the dummy IS the navigation," and the mock demonstrates a
precision tap: the bracketed box on the back dummy's hamstrings. Measure
it. Phone renders at scale 3 (half-map 102×192px). A single hamstring strip
is 4 map-pixels wide → **12px** on screen; the two-leg bounding box the
mock draws is ~45×33px. Neck, forearms, abductors, calves are worse.
DESIGN.md demands 44px targets for high-traffic actions and an explicit
tap path for precision interactions — and muscle-tap is not a garnish, it
is seam 2, the "highest value-per-line item in BUILDER.md."

The mockup as drawn is dishonest about this on phone, and quietly tight
even on desktop (16px strips). Two fixes that keep the whimsy:

- **Nearest-muscle resolution:** any tap on the dummy resolves to the
  closest muscle region (the whole figure is one big target; the map's own
  geometry does the disambiguation). Cheap, invisible, honest.
- **Or a magnify moment:** tapping the dummy anywhere swings open a large
  "study the dummy" close-up (same floating-panel idiom) where every muscle
  is comfortably tappable — the drill-yard equivalent of leaning in.

Either is fine; shipping the literal 12px strips is not. The mock should
demonstrate whichever is chosen, because right now the tap-box brackets
promise precision the phone cannot deliver.

### D2. The floating-panel grammar contradicts DESIGN.md §7

The forge panel opens **with a dim scrim but a neutral bevel**. The design
system is explicit: a surface that dims the world is an interruption and
takes the gold bevel; a surface that coexists keeps the neutral bevel and
no scrim. The weapon rack (desktop) gets it right — floats, neutral bevel,
no dim, world stays live. The forge panel has to pick: either it is an
interruption (keep the dim, take the gold bevel) or it is a coexisting
floater (neutral bevel, drop the dim). I lean interruption-with-gold —
choosing a routine is a mode change, and "tap the dark to close" already
treats it as one. Whichever way, the two panels must speak one grammar or
the player learns nothing from the dim.

### D3. Margin-note voice has leaked into the frame

Three lines inside the rendered screen are spec annotations wearing player
copy, and they materially damage the "everything feels well-thought-out"
goal because they read as debug text:

- Board foot: "the forged scroll writes the same **{name, giver,
  exercises}** the old builder wrote" — a payload shape, in braces, on a
  wooden board in a fantasy yard.
- Open plate: "…tap the plate to latch it; **the logger's own steppers**" —
  an implementation cross-reference.
- Rack foot: "…the full armory waits behind the **book glyph** on the
  board" — "glyph" is our word, not the world's. In-world it is just *the
  book on the board*.

These belong in the gutter tags, which exist for exactly this. The gutter
apparatus itself is fine — clearly outside the bezels, clearly a wall of
curator cards — but only if the frames stay clean of it.

### D4. The phone dock breaks the required contract

The mock's dock is BACK / TOWN / SETTINGS. DESIGN.md's compact-dock
contract is Back, Town, **Ravens**, Settings, in that order, 44px each.
A mockup this careful about 48px steppers should not under-draw the shell;
someone will build from the picture.

### D5. Neither frame shows the yard at rest — or empty

Phone demonstrates the forge panel open (dimmed yard, board name and first
plate hidden); desktop demonstrates the rack open. The state the player
inhabits 95% of the time — the undimmed yard, dummies lit, board hanging,
nothing floating — is never actually drawn, and the first-run empty yard
(no routine, all-dark dummy) has never been drawn in any round. For a
scene whose entire argument is "it feels like a place," the place itself
is the missing exhibit. Add a third small frame (phone, at rest) and treat
the empty yard as a designed moment, not a degenerate case (E2).
Related smaller dishonesty: the open forge panel covers the phone stage
caption entirely, so the phone frame never shows the descriptive line that
is one of the feature's core promises.

### D6. Sub-contract targets on real controls

- Plate reorder ▲/▼: `min-height:30px`, 38px wide. These are the
  builder's most-repeated controls after the steppers; on phone they
  should meet 44px (they have room — the plates are full-width).
- Corner glyphs (book, Grunhilda): ~32×40px including caption. As
  low-frequency controls they can plead WCAG's 24px exception, but the
  book is the whole browse path; give both corners a 44px invisible hit
  region even if the art stays 24px.

### D7. Helper-copy contrast uses the wrong token

`--dim` (#776f8e) is used for the forge sign's subtitle, the rack foot,
the board foot, and the glyph captions — on wood (#2b2013) it lands well
under AA for 10px text. DESIGN.md already legislated this: helper copy on
panels and raised surfaces uses `--dim-readable`. Mechanical fix, several
sites.

### D8. Small coherence nits

- The open rack on desktop partially overlaps the board's upper-right —
  i.e., it can sit on top of Grunhilda's corner. A floating panel
  swallowing the only other character in the yard is unfortunate; clamp
  the rack's float above the board or let it flip left.
- "Forge" now does triple duty: Grunhilda's town building is `bld_forge`,
  the yard object is "the forge," and the save button says "FORGE
  ROUTINE." The first two reconcile (the yard is *behind* her forge; the
  object is its back door — arguably lovely). The button is the odd one
  out: you are not at the forge when you press it, you are at the board.
  "HANG THE BOARD" or "LATCH THE LEDGER" would end the collision and give
  saving its own physical verb. (E6 — voice is Joe's.)
- The stage caption truth bug (C2) is also an honesty item: the mirror
  must never disagree with the dummy.

---

## E. Questions for the boss

1. **Does the Drill Yard keep the town's clock — time-of-day skies (and
   later, seasons)?** His call because it sets how much the yard is *part
   of the world* versus a room off it, and it spends the charm budget he
   is curating. Options: (a) inherit the town's three time-of-day tilesets
   unchanged — the yard is outdoors, same sky, same 06:00/18:00/20:00
   swaps; (b) a fixed perpetual dusk — the yard as its own moody pocket,
   cheapest and most controlled; (c) inherit the clock plus one yard-only
   touch (forge-glow reads stronger at night). My lean: (a), with (c)'s
   night-glow as a later gift — the town already owns the machinery, and
   sameness of sky is what makes it one village.

2. **What does the first-run yard look and feel like — the bare dummy
   moment?** His call because it is the newcomer's first thirty seconds
   and pure tone-setting: austere or warm. Options: (a) all-dark-wood
   dummy, bare board, forge coals burning visibly brighter than anything
   else — the yard itself points at the door; (b) same, plus Grunhilda's
   one-time unprompted line (the single exception to pull-only): "A bare
   board. Strike something at the forge and the dummy will start
   remembering."; (c) dusty/cobwebbed yard that visibly wakes up when the
   first routine is forged. My lean: (b) — one sentence, once, then she
   returns to silence forever; the empty state is exactly when a coach
   earns trust.

3. **On phone, do both dummies persist, or does one dummy turn?** His call
   because it trades scene grandeur against tap honesty: two dummies at
   scale 3 are the composition he approved, but they are also why muscle
   strips are 12px (D1). Options: (a) keep the pair and adopt
   nearest-muscle tap resolution; (b) one larger dummy with a tappable
   plinth that spins it front/back — roughly double the muscle target
   size, plus a small toy in the yard; (c) keep the pair, tap either dummy
   to open the magnified study view. My lean: (b) — the spin is whimsy
   that *is* the accessibility fix, and desktop keeps the pair.

4. **How loud is Grunhilda allowed to be at rest?** His call because
   "ignorable" was his ruling and only he knows where ignorable ends and
   invisible begins. Options: (a) exactly as mocked — static bust,
   caption, nothing else ever; (b) a small ember glint on her portrait
   only when she actually holds a week-level reading — still silent,
   never a bubble until tapped; (c) glint plus her portrait turning to
   face the board when a reading waits. My lean: (b) — without a tell,
   seam 6 will be built and never found.

5. **Should the yard wear its history — plates, board, and ground taking
   patina with use?** His call because it is pure sentiment-vs-cleanliness
   with zero functional stakes: the plates could show strike-notches or
   worn edges as a routine accumulates logged sessions, the dirt could
   show a worn path to the dummies, the board could darken with handling.
   Options: (a) no aging — the yard is always freshly kept; (b) plates
   only — each iron plate collects subtle wear from logged sessions, so a
   veteran's board *looks* veteran; (c) whole-yard patina including
   ground. My lean: (b) — it makes the ledger a record in its own material
   without inventing any new data, and it stops before the yard looks
   neglected.

6. **What is the save verb — and is the yard's forge officially the back
   of Grunhilda's smithy?** His call because it is naming and lore, the
   register he owns. The button currently says FORGE ROUTINE while the
   forge object stands elsewhere in the yard (D8). Options: (a) keep
   FORGE ROUTINE — accept "forge" as the yard's universal verb; (b) "HANG
   THE BOARD" — saving is hanging the finished ledger, the forge stays
   the place where routines are *born*; (c) "LATCH THE PLATES". And one
   line of lore in the title win could settle the geography forever:
   "Grunhilda's yard, out the back of her forge." My lean: (b), with the
   geography line — one metaphor per object, each object one job.

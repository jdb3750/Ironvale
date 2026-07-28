# Council redesign — implementation charter

> **For the implementing agent (Codex).** This supersedes the shape of the
> current `feat/council-training-adviser` branch. The *engine* that branch built
> is good and mostly survives; the *framing* around it changes. Read
> `DOCTRINE.md` for the science provenance — it is done, do not re-research it.
>
> **Read the Phasing section and §6 (Guardrails) before writing any code.** This
> work is split into phases with hard scope boundaries — do ONLY the phase your
> task names. When something is unspecified, STOP and ask — do not infer and
> build. Inferring-and-building is exactly what turned the last pass into 7,000
> lines of unrequested work.

## 0. The one-sentence reframe

The Council is **not a place** (a Hall destination). It is **how the existing
givers offer quests** when the player opts into it. Acceptance happens at the
givers, in town, with the characters. The Hall only *reflects* on how the
counsel has served the player.

Every decision below follows from that sentence.

## Phasing — READ FIRST

This work is **two phases plus a deferred backlog.** Do only the phase your task
names; each lands and verifies on its own before the next starts. (Splitting this
way is deliberate — smaller phases with their own checkpoints are easier to keep
bounded.)

- **Phase 0 — Archetype regroup (§0b).** Introduce the archetype/ownership config
  and reroute the quest generators to it. Prerequisite refactor; the reframe is
  built on top of it. **Do this first** — building the reframe on the old mapping
  would force a rework. Verifiable on its own: the existing giver boards reflect
  the new ownership, smoke green.
- **Phase 1 — The reframe (§1–§4b, §5).** Considered/choose-your-own modes,
  settings reorg + charter, attribution log, Hall reflection view, nudge cadence.
  Built on the Phase 0 config, and **ports the surviving engine** from the old
  `feat/council-training-adviser` branch (§4) — additive, not a removal pass.
  First step is a **port plan for approval** (§6), not a build.
- **Phase 2 — Scheduled mode (§5b).** NEXT UP, promoted out of deferred. The
  player-authored weekly plan. Prioritized because it fits how the app is actually
  used (see §7c) — and because plan adherence is the one honest counsel metric
  (§7b).
- **Deferred — tracked separately (§8).** Not this work: key rename, equipment
  awareness, new Skill-archetype content, Garmin-suggestion import.

## 0b. Givers as archetypes — the roster (Phase 0; the Council's spine)

A giver embodies a **KIND of effort (an archetype)**, not one workout. Four
archetypes, mapped onto the existing cast — **all four characters already exist
with sprites, so this is a reroute, not new content:**

| Archetype | Owns (modalities) | Giver | DB key (FROZEN) |
|---|---|---|---|
| **Endurance** | run, ride, swim | Old Fenn, the Wayfarer | `running` |
| **Iron** | barbell, dumbbell, kettlebell | Grunhilda, the Iron-Bell | `kettlebell` |
| **Skill / Bodyweight** | climbing, calisthenics, plyometrics, sprints | Ser Bram, **the Unburdened** | `strength` |
| **Recovery** | mobility, stretch, easy movement, rest | Sage Elowen, of the Willow | `mobility` |

- Grunhilda absorbs **all** iron (barbell + kettlebell); the old kettlebell/
  strength giver split is gone.
- Ser Bram becomes **the Unburdened** — carries no iron, only his own body; a
  foil to Grunhilda. Covers all bodyweight/skill/climbing. (Title is flavor only;
  retitle freely, nothing downstream depends on it.)
- New activities slot into an existing archetype (rowing → Endurance, rings →
  Skill) — the roster never grows past four.

**Not every listed modality has a generator yet — do NOT build new ones in Phase
0.** Today's built generators are endurance (run/ride/swim), climbing, and lifts.
So the Phase 0 regroup is really just: **move barbell/lift generation from Ser
Bram (`strength`) to Grunhilda (`kettlebell`), so Grunhilda produces all iron and
Bram keeps climbing**, plus the ownership config and the display/title updates.
Calisthenics/plyo/sprints are the Skill archetype's *declared domain* in the
config but are **deferred content (§8)** — the config names them; nobody builds
their generators now.

**CRITICAL — do NOT migrate live data.** The DB `giver` keys
(`running`/`kettlebell`/`strength`/`mobility`) are opaque IDs on the live
`quests` table (production history on `main`). **Do not rename them.** Instead add
**one archetype/ownership config** (giver key → archetype name, display, owned
modalities) as the single source of truth, and reroute the quest generators to
it. Consequence: two keys become **intentional legacy misnomers** — `kettlebell`
is the Iron giver and `strength` is the Skill giver. This is deliberate to avoid
migrating live data; the config is the source of truth and the player never sees
a key. Do NOT "fix" this by renaming keys or migrating the table. (A clean key
migration is a possible *future* opt-in, not Phase 1.)

**Focus is declared at the MODALITY level, not the archetype level.** The player
sets e.g. *primary: run; secondary: swim, climb, iron* — modalities, which roll
up to givers via the table above. So one giver (Fenn) can host both a primary
(run) and a secondary (swim) at once. When you visit a giver in Considered mode,
its one pick is the modality among the ones it owns that is most "due" for you
(cadence + recency), gated by wellness. **The whole Council engine — candidate
focuses, the nudge, the considered pick — operates over this archetype/ownership
config, not the old scattered modality→giver mapping.** This reorientation is the
core of Phase 1.

## 1. What the player experiences (decided)

**Three game-loop styles, chosen in Settings (see §3).** They form a deliberate
spectrum of *how much the player offloads the decision* — from brain-off to full
ownership:

- **Considered — DEFAULT (brain-off).** You walk up to a giver as always. That
  giver offers **exactly ONE considered pick for today — one option per giver, no
  handful** — sized from your own history, with hard options suppressed when your
  wellness signals strain, and a plain "why this path" plus source/as-of
  disclosure. You still choose *which* giver — that choice is the game. This is the
  maximum "turn my brain off, tell me the one sensible thing" mode.
- **Choose-your-own.** Each giver offers the same day's work at **three effort
  tiers — easy / medium / hard** — sized from history and ambition, and you pick
  your effort. This is lighter and more legible than a random handful. The
  distinction from Considered is deliberate: **Considered picks your effort for
  you and hides the hard option on a bad-wellness day; Choose-your-own lets you
  pick and only warns on the hard option on a bad day.** The more autonomy the
  player opts into, the more the game informs rather than restricts. Same sizing
  engine underneath both.
- **Scheduled — PHASE 2, DO NOT BUILD YET (see §5).** Listed here only so Phase 1
  doesn't foreclose it.

**Daily suggestion (optional overlay, on/off in Settings).** A dialogue box —
styled like the quest-complete box — that nudges the player toward a giver:
*"The council counsels a visit to Fenn today."* It is **not** a quest-acceptance
surface; it points, the player walks over. Reads the player's declared focus
(§3) plus recent behavior; wellness-first (low readiness → points at Elowen).
Philosophy (decided): **fill the neglected slot within the player's declared
set** — e.g. ran three days, no lifting → nudge toward the iron. "Space things
sensibly" is NOT a new subsystem — reuse the engine's existing recency logic (the
48h lower-body gate and hard-day suppression already encode "don't stack similar
or hard work"). **Never suggest a modality the player doesn't actually practice**
— including a declared-but-unstarted focus. (An earlier draft carried an
onboarding exception that would nudge a declared-but-never-done focus; that is
**superseded**. Until a modality has recorded practice, the giver boards' generic
starters own that road — the pointer stays quiet rather than nagging toward
something never done.)

**Nudge trigger rule (decided):** operate over the player's declared-focus
**modalities** (§0b), each with an **implicit cadence set by its rank** — primary
resurfaces on a tight cadence (~every 2 days), secondaries on a loose one (~every
4–5 days). Point at the modality most **overdue** against its own cadence; a
declared-but-never-done modality is NOT nudged at all (practiced-only; see above).
Then route to that modality's giver. If wellness signals strain, override to
Elowen — but only when recovery/mobility is itself practiced. This is what delivers "recommend all of my modalities across a week"
**without any weekly-target field** — the player only ranks primary vs secondary,
and the ranking *implies* the rhythm. Pure cadence + recency + wellness. The nudge
picks *which modality/giver*; that giver's considered pick then sizes the actual
intensity via the engine's existing suppression.

**No check-in.** "I feel bad today" is expressed by *choosing Elowen* (recovery),
not by filling a form. Objective strain (HRV / resting HR) still auto-suppresses
hard options underneath every mode. The `council_checkins` table is removed.

**No time-available input.** Players know their own time; they pick accordingly or
do unguided work. Removed.

## 2. Attribution + the Hall reflection view (decided)

**Tag every accepted quest at acceptance** with how it was chosen:
- `counsel` — a considered pick, or a quest taken after a daily suggestion.
- `self` — chosen from a handful in choose-your-own.
- `schedule` — Phase 2.

**The Hall reflects on "how has the counsel served me?"** — the *only*
Council-related thing that belongs in the Hall, because the Hall is a
stats/progress surface, not a quest surface. Scoped **strictly to `counsel`-tagged
quests that were accepted AND completed**, correlated with fitness movement
(existing CTL/ATL/HRV). Unguided work and `self` quests must NOT count — the
counsel only gets credit for what it actually advised and the player took.

**Placement (decided): Maud's insights in the Body tab — NOT a new tab.** A
dedicated Council tab would rebuild "Council = a place," the exact thing this
redesign removes, and the Hall already has 8 tabs. Maud already reads the body,
so surfacing this as her in-character observation ("the counsel's easy runs have
moved your fitness more than the hard ones lately") needs no new real estate.

**This is an OBSERVATION, never a mechanism (decided — important).** Do NOT build
any adaptive/per-player "learning" model that silently course-corrects future
recommendations. Reasons: the per-player dataset is tiny and confounded (noise-
fitting, not learning); it would be an un-inspectable black box, the opposite of
`DOCTRINE.md`'s traceability principle; and it rebuilds the self-reinforcement
loop the declared charter exists to prevent. The same data is welcome as an
honest, hedged observation Maud *shows* the player ("what we've noticed," small-n
caveat, appears only once there's enough data to say anything) — the player
decides what to do with it. The whole game's stance is **the system informs; the
player decides.** Course-correcting ML violates that stance; Maud's observation
upholds it. (A parallel "plan adherence" view for `schedule` quests is a Phase 2
possibility, not now.)

## 3. Settings reorganization + charter relocation (decided)

The in-game **Charter (primary focus + secondary focuses)** is KEPT, but moves
out of the Hall and into **Settings**, as ordinary configuration. It was never
confusing as a concept — only as jargon in the wrong room.

**Restructure Settings into sections (or tabs):**
- **Game** — name, ambition, units, weight unit, timezone, **game-loop style**,
  **focus**.
- **APIs** — intervals.icu credentials (athlete id + key). Structured so a future
  second data source has an obvious home. (Don't build a second source; just
  don't design it out.)
- **Dev** — dev mode and other developer toggles.

**Focus control behavior:**
- Lives under the game-loop style selector in the Game section.
- **Active** in Considered mode.
- **Grayed with a hint** (not hidden — hiding hurts discoverability) in the others:
  - Scheduled: *"Your schedule is your focus."*
  - Choose-your-own: *"You're choosing freely; focus guides the counsel."*

**KNOWN GAP (found in live review, Phase 1.1) — focus does not constrain a
giver's offer.** The reasoning below was written when one giver ≈ one modality.
The archetype regroup (§0b) broke it: Fenn now owns run/ride/swim, so walking to
his hut supplies *endurance*, not *run*. `counsel_candidates.py` has no reference
to the charter, so the modality is chosen purely by practiced-history recency — a
player whose focus is run/iron/climb is still offered swim because they swam once,
and in Choose-your-own all three tiers are that same unwanted modality. Fix
direction: when a charter is set, it filters the modalities a giver may offer
within its archetype (falling back to practiced-history when no charter exists, so
focus stays optional). See §8 for the related equipment case.

**Why focus stays optional (important — do not make it a required gate):** the
per-giver considered pick needs no focus, because the player supplies the
modality by walking to that hut. Focus feeds only the **daily-suggestion nudge**
(which of the four huts today). Without a focus set, the default still works;
the nudge just falls back to behavior/balance. Focus defines the *set and
priority*; recent behavior tracks the *fill* within it.

## 3b. UI design language (decided — applies to EVERY UI seam)

**Aesthetic (current):** match the game's existing retro button style — chunky,
bordered ("neobrutalist") — for now. It reads retro and is cheap, so it is the
working standard; keep every control consistent with it. A richer hand-drawn /
tactile pixel-button look (dimensional south-shine shading, round toggles, 9-slice
sprites) would feel great and is a documented FUTURE, game-wide polish (§8) — do
NOT build it now. The rule that binds today: do not introduce flat or foreign
control styles that clash with the existing chunky buttons.

Four color roles, each with exactly one meaning — never decorative. This is a
standing rule for every UI seam of the reframe (Settings, giver boards, Hall
reflection); when adding any text or control, assign it one role.

| Role | Meaning | Examples |
| --- | --- | --- |
| **Gold** | Interactive & structural chrome | buttons, inputs, dropdowns, panel/field borders, logo |
| **Blue** (`--blue` #6aa0c8) | The **informational voice of the counsel** | labels that name a control/section; reason codes; "why this path"; source/as-of disclosure; Maud's observation |
| **Green** | Active / live boolean state | ON toggles (daily pointer, sound), streak/health dots |
| **Muted** | Incidental fine print / sub-descriptions | the one-line helper under a label |

**The test:** if you *touch* it → gold; if it *tells you something* → blue; if
it's a *live on-state* → green; if it's *fine print* → muted.

- **Selection is gold, not blue.** A selected/current interactive element (chosen
  ambition, active tab) is brighter/filled gold — selection is an interactive
  state, so it stays in the gold family. Blue must mean exactly one thing
  (information), so it never doubles as "you are here."
- **Blue is the counsel's thread.** It is the same accent everywhere the game
  explains its thinking — settings labels → a giver's "why this path" → the Hall
  reflection — so the player learns to read blue as *"the counsel is informing
  me."* That is blue's job; give it no other.
- **Counsel-block motif:** a block where the counsel speaks (the Focus group, a
  giver's "why" panel, Maud's card) carries a thin **blue left-border accent**
  (the existing `.insight` pattern, `border-left: 3px solid var(--blue)`) — the
  recurring signature of a counsel block. Do NOT use a full blue outline box;
  borders are gold chrome. The blue is a left-edge accent marking meaning, not a
  frame.

**Restraint — the motif must stay rare.** Generic helper / onboarding prose (e.g.
"how the intervals.icu sync works") is **muted body text, never blue and never the
counsel-block motif.** Blue text is for short labels and counsel snippets, not
paragraphs; a wall of blue prose is both hard to read and dilutes the accent. The
blue-left-border motif marks *only* blocks where the counsel actually speaks — if
it appears on every helper block, it stops meaning anything. When unsure whether a
block earns blue, it doesn't: default to muted.

**Layout & component conventions (also binding on every UI seam):**
- **Center by default.** Buttons and button rows are horizontally centered unless
  a layout explicitly needs otherwise. Left-aligned controls read as stray against
  the rest of the UI.
- **Two toggle patterns, distinguished by color/state — both in the existing
  button style.** Match the game's current chunky buttons; the single/multi
  distinction comes from color, not a new shape:
  - **Single-select** (e.g. Ambition MEND/KEEP/FORGE/CONQUER): the existing gold
    buttons — selected = bright/filled gold, unselected = darker raised.
  - **Multi-select / on-off toggles** (secondary focuses, DAILY POINTER, SOUND,
    and any on/off toggle): treat it as a **light** — lit GREEN when on, and
    **unlit when off: a dark, panel-toned gray-blue near the background, NEVER
    gold.** Gold is reserved for action buttons and single-select; a toggle's off
    state must look unlit, not like a gold action button. Keep the full
    3D/pressable button treatment so "off" reads as an off toggle, not a disabled
    control — and keep the off label in a readable light tone, not dimmed. Not red
    (reads as "no/rejected"); an unchosen option is simply off. The unlit tone is a
    desaturated dark gray-blue, distinct from the saturated informational blue.
    Exception: a toggle with deliberate danger semantics (dev-mode ON = red) keeps
    that semantic color — danger overrides the light pattern.
  Forbidden: flat or thin-outline "chip" styles that clash with the existing
  buttons. Shape stays whatever the current buttons use (rounded-rect) — round
  pixel toggles belong to the future hand-drawn polish (§8), not now.

**When to show a bottom message (`toast`) — there is a logic, follow it:**
- **Confirm a commit.** When an action PERSISTS to the server (save name, set PIN,
  set ambition, choose loop, enable/silence the pointer, save/clear focus), toast
  a brief in-world confirmation — the write is invisible, so the toast is the proof
  it landed.
- **Report a refusal.** When an action is rejected (validation), toast why,
  in-world. Always.
- **Announce a kicked-off background action** ("Ravens away..." for a sync).
- **Do NOT toast purely local, immediately-visible changes** — toggling a focus
  chip before saving, muting sound (client-local), switching tabs. The visible
  change IS the feedback; a toast would be noise.
The test: *did it write to the server?* If yes, confirm it; if it's only local UI,
don't. All toasts use the in-world voice.

Consistency is enforced, not per-seam-rediscovered: every UI seam follows this
table, so blue never appears "in random places."

## 4. Port-and-build, NOT revise-and-remove (decided — read carefully)

**Branch reality:** Phase 0 was built on a fresh branch off `main`. The old
Council implementation — the surviving engine AND the cruft — lives only on the
unmerged `feat/council-training-adviser` branch. So Phase 1 does not *remove* the
cruft (it was never on this branch); it **ports the survivors and leaves the cruft
behind.** Additive, not surgical.

**PORT these survivors** from `feat/council-training-adviser`, stripped of the
framing below:
- History-based workout sizing — the `quests.py` candidate-extraction refactor
  (`build_endurance_candidates`, `build_climb_candidates`, `build_lift_candidate`,
  `CandidateHistory`, `QuestCandidate`, `LiftCandidateContext`). Verified
  behavior-preserving on the old branch.
- The HRV / wellness suppression rules (`_rule_state`, `_wellness_trend`,
  `_wellness_field_is_fresh` and their inputs, in `adviser.py`) — the conservative
  "don't offer hard work on a bad day" logic.
- Reason codes ("why this path") and source / as-of disclosure.
- Deterministic (non-random) selection.

These are tangled together with the cruft inside `adviser.py` (~1,382 lines), so
the **first Phase 1 deliverable is a port plan** (see §6), not a build.

**LEAVE BEHIND — do NOT port** (this is the cut cruft; on a clean branch that
simply means "never bring it over"):
- The **Hall Council tab / screen**. Acceptance lives at the givers.
- The **charter-in-Hall UI** — charter is a Settings control now (§3).
- The **check-in** and `council_checkins` table (§1).
- The **availability** field and its filtering (§1).
- The **cross-giver ranking as a quest surface** — only its reduced form survives,
  as the daily-suggestion nudge (§1).
- The **immutable snapshot machinery** (`council_snapshots`,
  `council_selection_events`, full-context rows, `RAISE(ABORT)` triggers) —
  replace with a **lean attribution record**: enough to power §2 (which quest,
  which mode, when, which option offered vs chosen), no re-serialized inputs, no
  immutability triggers.
- The **profile-auth changes** — out of scope for the reframe entirely.

## 4b. Cold start — personalize per modality, not per calendar (decided)

The threshold for "personalized sizing vs generic starter" is a **per-modality
session count**, NOT a global number of days. A week with 5 runs and 2 lifts is
good run data and almost no lift data — a day-based threshold can't tell those
apart; a per-modality count handles it natively (running personalizes, lifting
stays in starter mode, same week).

- **Endurance: ~3 sessions of that modality** in the lookback before personalized
  sizing (a median off 1–2 sessions is noise). The current branch already gates
  its long-run variant at `session_count >= 3` — stay consistent with that.
- **Below threshold:** a graceful generic starter ("still learning your running —
  here's a gentle one"), never an empty screen.
- **Strength is the exception:** useful from the **first** logged session — the
  movements come from what was logged and the working weight self-calibrates via
  `last_weight` + the doctrine's progression, so no 3-session median is needed.
- **Onboarding loop:** declared weights-focus + zero lifts logged → offer the
  generic Iron starter AND let the daily suggestion nudge toward lifting. The
  charter and §1's fill-the-gap logic combine to push the player toward the thing
  they declared but haven't started.

## 5. Progression note (decided, informs both phases)

- **Endurance stays a "mirror"** — targets scale off the player's own rolling
  history. This is deliberate and honest: `DOCTRINE.md` shows the literature gives
  no defensible progression *rate*, so we do not invent one.
- **Strength gets real progression via the existing `programs.py` doctrines**
  (linear progression already implemented). In Considered mode a strength giver's
  pick can advance via its doctrine; in Scheduled mode (Phase 2) a "strength A / B"
  day maps directly onto a doctrine's alternating sessions. Do not build a new
  progression system — reuse `programs.py`.

## 5b. PHASE 2 — Scheduled mode (the player-authored week)

The full-ownership end of the spectrum (§7c): the player plans, and the game
sizes, applies the wellness veto, drives strength progression, and tracks
adherence. Prioritized because it fits how the app is actually used, and because
plan adherence is the one honest counsel metric (§7b).

**It is NOT a new engine.** It is a third thing choosing today's slot, over the
same machinery Phase 1 built:

| Mode | Who picks today's slot |
| --- | --- |
| Considered | the giver picks; you pick the giver |
| Choose-your-own | you pick from the tiers |
| **Scheduled** | **your template picks** |

### The template
A weekly template of **slots**, e.g.:

```
Mon  short easy run        + optional iron
Tue  quality run
Wed  rest (or recovery)
Thu  iron A                + climb
Fri  easy run              + optional iron
Sat  long run
Sun  climb                 + iron B
```

- A slot is **modality-level** (`run`/`ride`/`swim`/`climb`/`iron`) — same
  vocabulary as focus (§0b), routed to givers by the archetype config.
- A slot carries an **effort tier** reusing Choose-your-own's own tier names per
  modality (endurance easy/steady/quality; iron volume/circuit/strength; climbing
  technique/volume/limit-session). The schedule simply *pre-picks* the tier the
  player would otherwise choose — no new sizing vocabulary.
- A slot may be **rest**, and may be marked **optional** (optional slots do not
  count against adherence).
- Multi-slot days work with no new mechanism: two slots seed two givers, using the
  existing one-active-quest-per-giver rule.
- **Iron A / B** maps onto a selected `programs.py` doctrine's alternating
  sessions — the calendar says *when*, the doctrine says *what*, with its real
  linear progression. Do not build a parallel progression system (§5).

### Plan proposes, body disposes (the feature, not a bug)
The wellness veto still applies. Tuesday says *quality*; HRV is low → the giver
offers the steadier version **and says why** ("your plan calls for quality today,
but your numbers are down — here's a steadier version"). The schedule and the
science visibly cooperating is the point. Considered still hides a suppressed hard
path; Scheduled *downgrades and explains*.

### Adherence — the honest metric
Tag schedule-originated acceptances `schedule` in `counsel_attributions`, then
report **plan adherence** ("you planned 5, you did 4"). That is *counting*, not
causal inference — it has none of §7b's confound, and it is the reason the
attribution tags were kept.

**SCHEMA — do this in PHASE 1 while it is still free.** `counsel_attributions`
today is `CHECK (mode IN ('counsel', 'self'))`. SQLite cannot alter a CHECK
constraint, and `CREATE TABLE IF NOT EXISTS` will not update databases that
already exist — so once Phase 1 ships, adding `'schedule'` needs a full table
rebuild. **Widen the CHECK to include `'schedule'` before Phase 1 merges** (the
value stays unused until Phase 2). Cheap now; a migration later.

### Settings
- `scheduled` becomes a third selectable value in `COUNSEL_MODES`.
- Focus **grays out** with the hint *"Your schedule is your focus"* (§3) — the
  calendar expresses priority concretely, so the abstract declaration is redundant.
- The daily pointer, when enabled in Scheduled mode, points at **what the plan
  already holds for today** (§1).

### Out of scope for Phase 2
Equipment awareness (§5c), the DB key rename, new Skill generators, Garmin import,
and any rebuild of the cut reflection (§7b).

## 5c. Future direction — equipment awareness (OUT OF SCOPE FOR THIS TASK)

Documented so the archetype config leaves room for it; **do not build now.** A
Settings equipment selection (what gear the player owns) would let a giver only
recommend viable modalities within its archetype — Grunhilda offers kettlebell
work to a kettlebell-only home gym, barbell work to someone with a rack. It
composes cleanly with §0b: **gear filters which of an archetype's modalities are
eligible.** Its own feature, its own settings surface, its own phase — not Phase 1.

## 6. Guardrails — READ BEFORE CODING

- **One phase per task.** Do only the phase your task names (see Phasing). Do NOT
  build Scheduled mode (§5b), equipment (§5c), the key rename, or new Skill
  content (§8) — all deferred.
- **The research is done.** It lives in `DOCTRINE.md`. Do **not** spawn research
  sub-agents, run web investigation, or launch multi-hour analysis sessions.
  Implement directly.
- **Commit per coherent piece**, and report at each checkpoint. One commit per
  seam, imperative subject, `?v=N` bump on any static change. Suggested seams:
  - *Phase 0:* (a) archetype/ownership config; (b) reroute lift generation
    Bram→Grunhilda + display/title updates.
  - *Phase 1:* FIRST produce a **port + seam plan** and STOP for approval (which
    survivors to port from `feat/council-training-adviser`, into which files; what
    to leave behind per §4; the seam breakdown). Only after approval, build —
    likely seams: (a) port the sizing + wellness engine (stripped of cruft);
    (b) settings reorg + charter at modality level; (c) giver considered-pick +
    choose-your-own modes; (d) lean attribution log; (e) Hall reflection view.
    Nothing to "remove" — this branch never had the old framing (§4).
- **When a decision is not specified here, STOP and ask.** Do not infer and build.
  Specifically: do not rename DB giver keys / migrate live data (§0b), do not add
  authentication changes, new audit machinery, new tables beyond the lean
  attribution record, or any second architecture. The last pass proved unrequested
  "hardening" is not free.
- **Reuse, don't reinvent:** existing givers, `programs.py` doctrines, the quest
  lifecycle, the `REACTIONS` flavor map, the quest-complete dialogue pattern.
- **Definition of done:**
  - *Phase 0:* giver boards reflect the new archetype ownership (Grunhilda = all
    iron, Bram = climbing); `tests/smoke.py` and frontend/browser suites green; no
    DB key renamed, no live data migrated.
  - *Phase 1:* the reframe is playable on the 8322 scratch setup; all suites green;
    the reframe is built from ported survivors with the cruft left behind (no Hall
    Council tab, check-in, snapshot tables, or auth reintroduced — §4); a
    `counsel`-tagged accept→complete shows in the Hall reflection view and a
    `self` one does not.
- **Do not touch `main`.** It auto-deploys. Branch, verify on 8322, report.

## 7. Implementation details (not design gaps)

The design decisions live in §1–§5. The items below are implementation detail —
reasonable choices are fine, but surface them at the relevant checkpoint rather
than expanding scope:
- Exact copy for Maud's insight and the "still learning" starter states.
- Exact visual form of the reflection (a hedged sentence is enough for v1; a chart
  can be a small follow-up).
- Minimum fields on the attribution record to power §2 without re-serializing full
  context (lean is the goal — see §4).

## 7b. CUT — the counsel-outcome reflection (do NOT rebuild)

The Hall/Maud "how has the counsel served me?" view (originally §2, Todo 6) was
built to spec, reviewed, and then **deliberately discarded.** Do not rebuild it,
and do not relocate it to the Almanac or Curator's Notes — the problem is the
claim, not the room.

**Why it was cut:** CTL/ATL/HRV move from *all* training. Counting "N completed
counsel quests in this 28-day window" and pairing it with "fitness +2.5" gives the
counsel visual credit for work it never prescribed — a counsel quest on day 1 and
day 25, with twenty ordinary runs between, produces a flattering number driven
entirely by the runs. The bias is **systematic, not random**: any active month
shows positive CTL movement, so the card can only ever say "yes." A metric that
cannot return a negative is not measuring anything.

A hedged disclaimer does not save it. The visual juxtaposition argues causation
while the caption denies it, and the visual wins. This is exactly the
"science-shaped numbers" failure `DOCTRINE.md` exists to prevent. Nor is it fixable
with better statistics at one-player scale: an honest version needs within-person
comparison of counsel-followed vs non-counsel periods, and the literature shows 8
RCTs at n=190 could not separate autoregulated from fixed prescription. One person
at ~3 quests/month cannot.

**What survives:** the `counsel_attributions` tags (Todo 3) stay. They are cheap,
they are honest provenance, and they are what an actually-defensible metric would
use later — **plan adherence** for Scheduled mode ("you planned 5 sessions, you did
4") is *counting*, not causal inference. No confound. That metric becomes possible
only once schedules exist.

**The Council's honest promise** was never "following me improves your fitness."
It is "here's one sensible thing today so you don't have to decide." That needs no
scoreboard.

## 7c. The three modes are a graduation path (design lens)

The loops are not merely preferences — they are a **progression** a player moves
through as their own judgment develops:

1. **Considered** — a beginner drowning in choice gets one sensible thing, and
   builds the habit without deciding.
2. **Choose-your-own** — judgment developing; the player picks effort, the engine
   still guards the floor.
3. **Scheduled** — graduated; the player plans, and the game sizes, vetoes, and
   tracks adherence.

Use this lens when weighing polish: Considered serves the newcomer, Scheduled
serves the player who has outgrown being told. Both are legitimate end states —
graduating out of Considered is a success, not churn.

## 8. Deferred — tracked separately (NOT this work)

Real work, intentionally out of both phases. Each can become its own task/issue:

- **DB giver-key rename.** The frozen keys (`kettlebell`=Iron, `strength`=Skill)
  are legacy misnomers (§0b). Renaming them to archetype names is worth doing for
  legibility, but it's a live-data migration on `main`'s `quests` table, so it's
  its own carefully-scoped task later — NOT Phase 0/1.
- **Scheduled mode** (§5b) — the player-authored weekly plan.
- **Equipment awareness** (§5c) — gear selection filtering eligible modalities.
- **New Skill-archetype content** — calisthenics / plyometrics / sprint quest
  generators so Ser Bram owns more than climbing. Until built, the config declares
  the domain but only climbing is live.
- **Equipment awareness — VALIDATED IN LIVE REVIEW, raise priority.** Originally
  §5c speculation; live use confirmed the need concretely: "if I want to lift today
  but can't reach the gym, I'd like to choose kettlebells or something I actually
  have at home." Gear should filter which modalities within an archetype are
  eligible, and a same-day override ("today I only have kettlebells") is the sharper
  version of the need than a static equipment list. Pairs naturally with the §3
  focus-filtering gap — both are "let me constrain what the giver may offer me."
- **Hand-drawn / tactile button polish.** A richer pixel-button look —
  dimensional south-shine shading, round toggles, drawn via 9-slice
  (`border-image`) sprite states — as a game-WIDE upgrade to every button, not
  Council-only. Feels great; it's a deliberate art pass for later. Until then the
  existing chunky button style is the standard (§3b).
- **Garmin daily-suggestion import (speculative).** Turning the watch's own daily
  suggested workout into a quest, so a player who already follows Garmin gets
  credit inside the game instead of choosing between the two. Plausible route:
  intervals.icu carries planned/calendar events, so a suggestion *may* arrive
  through the existing sync — but this is UNVERIFIED; it needs a small API spike
  before anyone estimates it. Do not assume it is feasible.
- **Nudge-effectiveness analytics.** Measuring the daily nudge's own influence
  (did pointing the player somewhere change what they did / how their fitness
  moved). In Phase 1 the nudge is a pure pointer that never affects attribution —
  a quest is tagged by the loop it was accepted in (Considered → `counsel`,
  Choose-your-own → `self`), full stop. Measuring the nudge separately is a clean
  later feature; do NOT entangle it with quest attribution.

---

*Provenance: this charter is the product of a design conversation. The science
behind any numbers is in `DOCTRINE.md`. Nothing here is approved to merge. Phase 0
(the archetype regroup) is the first buildable unit; Phase 1 (the reframe) follows
it. Build and verify on the test setup, then report — never on `main`.*

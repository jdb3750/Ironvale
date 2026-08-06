# Codebase health review — briefs

Authoritative source for the 2026-08 codebase review. Each pass below is a
**self-contained paste**; ChatGPT starts cold every time, so paste the whole
pass including the "Context" preamble, not just the task list.

**Read-only audit.** No pass authorises editing a file, and no finding gets
fixed as part of the review. Findings come back as a report, Joe and Claude
triage them into `ROADMAP.md` §3, and fixes are briefed separately as their own
seams.

**Run against a clean tree.** Commit or stash before starting so every
`file:line` anchor in the report points at something real.

---

## Shared preamble (paste at the top of every pass)

> **Context — read before anything else.**
>
> Iron Vale is a self-hosted fitness RPG: a FastAPI + SQLite backend with a
> vanilla-JS, pixel-art frontend, built for one player (its author), possibly
> released as FOSS later. It is a **game**. It does not diagnose, predict
> injury, prove its advice, or stand in for a professional. Do not propose
> audit trails, tamper-evidence, disclaimer copy, consent flows, or anything
> that treats it as a medical or safety-critical product.
>
> Rough shape: `app/` is ~9,000 lines of Python across ~34 modules; `static/js/`
> is ~8,700 lines of vanilla JS across 14 files, with no build step and no
> framework; `static/style.css` is ~2,900 lines; `tests/` is ~13,000 lines across
> 27 Python files plus Node DOM and headless-Chromium suites. Project conventions
> live in `AGENTS.md`; design rationale in `DESIGN.md`; direction and known
> defects in `ROADMAP.md`. **These figures are orientation, not ground truth — if
> what you count disagrees, report the real number and trust your count.**
>
> **This is a read-only audit.** Do not edit, create, or delete any file. Do not
> write patches, diffs, or "here's the fixed version" code blocks. Do not run
> `git` write commands. Reading files and running the read-only test/lint
> commands is fine and encouraged. Your deliverable is a report, nothing else.
>
> **If you find a surprise, report it rather than deciding.**
>
> Stop when the pass is done and report. Do not roll into the next pass.

---

## What counts as a finding

Every finding must be classifiable as exactly one of:

- **Defect** — behaviour is wrong today. Say what a player would observe.
- **Dead code** — unreachable, unused, or superseded. In this project dead code
  is treated as a defect, not a curiosity. Include what its tests (if any) were
  actually protecting, so the removal path is known.
- **Drift** — code and its documentation/comments/copy disagree. Say which side
  is stale.
- **Fragility** — correct today, but structured so that a plausible future
  change breaks it silently. Name the plausible change.

Every finding must carry:

1. `file:line` anchor (the real line, from the clean tree).
2. One sentence on what is wrong.
3. One sentence on **what breaks, and for whom**, if it stays.
4. The category above.

**Rank the findings**, most consequential first. **Cap each pass at 12
findings.** If you have more, the cap is the point — the ranking is the work,
and a 40-item dump is a wishlist, not a review. Note at the end how many you
dropped and roughly what they were.

## Out of scope — do not report these

- Style, formatting, and naming preferences. `ruff` runs on defaults and is
  green; that is the bar.
- Generic best-practice advice not tied to a specific line: "add type hints",
  "add CI", "increase coverage", "consider a framework", "add a linter config",
  "use dependency injection", "split large files" as an end in itself.
- New features, new capabilities, or product ideas of any kind.
- Dependency upgrades, unless a pinned version is causing an observable problem.
- Performance speculation without a measurement. This app serves one player on
  a home server; "this is O(n²)" is only a finding if you can say what n is in
  practice and why it matters at that size.
- Anything already listed in `ROADMAP.md` §3 (read it first). Re-reporting a
  known entry as a discovery wastes the pass. If you find that a §3 entry is
  **wrong, already fixed, or worse than recorded**, that IS worth reporting —
  say so explicitly and mark it as such.
- Test *quantity*. Whether a thing is tested at all matters (Pass C); how many
  tests exist does not.

---

## Pass A — Python application layer

*(paste the shared preamble, then this)*

Read `app/` in full. The larger modules are `quests.py` (1,113), `main.py`
(786), `records.py` (676), `dungeon.py` (628), `game.py` (522), and the
`counsel_*.py` family (~1,800 lines across 11 modules).

Look for, in priority order:

1. **Dead and unreachable code** — functions, branches, parameters, config keys
   and constants nothing calls or reads. Check the `counsel_*` family
   especially: it was refactored during the Council redesign and modules were
   split apart.
2. **Persisted data treated as trusted.** Malformed rows, non-finite floats and
   inadmissible dates must degrade to "unknown", never raise. `/api/state` is
   the boot endpoint — an unhandled exception there means the game does not
   load at all. Find the paths where a bad row in SQLite becomes a 500.
3. **Duplicated logic that has drifted.** Two places computing the same thing
   slightly differently is worse than either. Name both sites.
4. **Invariants enforced by structure but not written down.** Where a rule holds
   only because of the current call order or module boundary, and a refactor
   would dissolve it silently.
5. **Module boundaries that no longer describe the code** — a module whose name
   or docstring stopped matching what it contains.

Do not propose splitting a file merely because it is long.

**Verify before reporting.** These commands are read-only and safe:

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
```

Green means the last line reads `All checks passed!` and `SMOKE PASSED — N
checks green` respectively. If you claim a suite result, quote that last line.
A command that did not run is not a passing command.

---

## Pass B — Frontend

*(paste the shared preamble, then this)*

Read `static/js/` (14 files, ~8,700 lines; largest are `giver.js` 1,213,
`misc.js` 1,167, `app.js` 1,143, `hall.js` 1,117, `pixel.js` 1,103) and
`static/style.css` (~2,900 lines). There is no build step, no bundler and no
framework — that is deliberate, not an oversight, and "adopt a framework" is
not a finding.

**Dead-asset claims need more than grep.** `SPRITES[key]` is looked up
dynamically in several places (`ranch.js`, `hall.js`, `pixel.js`), so "no
references" does not by itself prove a sprite key is dead. Say what the dynamic
key sources are and why none of them can produce the key you are calling dead.
CSS classes can be assembled by string concatenation for the same reason.

Look for, in priority order:

1. **Copy that names retired or renamed things.** The game has retired givers,
   renamed DB keys and moved features; user-visible strings lag behind. Report
   the string and what it should say instead.
2. **Dead CSS and dead JS** — selectors matching nothing, handlers bound to
   elements that no longer render, feature flags with one branch.
3. **State that can desync** between what the server returns and what the DOM
   shows, especially across navigation between screens.
4. **`misc.js` specifically** — a name like that usually means it accumulated
   things that belong elsewhere. Say what is in it and where each part belongs,
   but only where the misplacement causes a real problem.
5. **The 17 text sizes in `style.css`.** These are already known and queued
   (see `DESIGN.md` §3); do not re-report the count. Only report if you find the
   sizing is actually inconsistent *within* one component.

---

## Pass C — Test suite honesty

*(paste the shared preamble, then this)*

Read `tests/` (27 Python files plus `tests/frontend_browser.test.mjs` and the
DOM harness). The project's two stated rules are:

- **Assert player-observable outcomes, not artifacts.** A test that checks a
  reason code, flag or label was *produced* proves the code ran, not that it
  worked. This has bitten before: the whole suite was green while a lower-body
  gate logged its reason and suppressed nothing.
- **Every test must stand alone.** The browser tests share one server and one
  `DATA_DIR`, so a test can lean on state an earlier test left behind — and then
  a subset run reports green while proving nothing.

Find and report:

1. **Tests that cannot fail** — assertions that would pass even if the feature
   under test were deleted or stubbed out. This is the highest-value finding in
   this pass; be specific about *why* it cannot fail.
2. **Tests that depend on another test's leftover state.** Where you suspect
   one, verify it: `node --test --test-name-pattern="<one test>"
   tests/frontend_browser.test.mjs` should pass in isolation.
3. **Behaviour with no coverage at either boundary** — rules with a threshold
   tested on one side only.
4. **Fixtures or helpers that have outlived their tests.**

Do not report missing tests for code you would not otherwise flag, and do not
propose a coverage tool or a coverage target.

---

## Pass D — Repo, tooling and docs drift

*(paste the shared preamble, then this)*

Read `AGENTS.md`, `README.md`, `DESIGN.md`, `DOCTRINE.md`, `ROADMAP.md`,
`Dockerfile`, `docker-compose.yml`, `requirements.txt`, `requirements-dev.txt`,
`package.json`, `pyrightconfig.json`, and the repo root generally.

Find and report:

1. **Docs that describe code that no longer exists that way** — file paths,
   function names, endpoint names, commands, and version claims that are stale.
   Quote the doc line and the current reality.
2. **Anything in `requirements.txt` that is dev tooling.** That file is the only
   one the Dockerfile installs; a linter has no business shipping to players.
   The reverse also counts: a runtime dependency that is only in the dev file.
3. **Untracked or stray files that should be tracked, ignored, or deleted** —
   check `.gitignore` against what is actually in the tree.
4. **Docs that contradict each other.** Where two files state a different rule
   for the same thing, name both and say which you believe is current.

---

## Reporting format

For each pass, return exactly this, and nothing else:

```
PASS <letter> — <name>
Commands run and their final lines: <quoted, or "none">

FINDINGS (ranked)
1. [Defect|Dead code|Drift|Fragility] path/to/file.py:123
   What: <one sentence>
   Cost: <what breaks, and for whom, if this stays>
...

DROPPED: <n> further items, roughly: <one line>

SURPRISES: <anything you did not expect, including anything that made you
want to change the brief. If none, say "none".>
```

Then stop and wait.

---

# Fix seams

The audit is complete (passes A–D, findings recorded in `ROADMAP.md` §3). What
follows are the **fix** briefs. Unlike the passes above, these change files —
each is scoped to one seam, and each ends with stop-and-report before anything
is committed.

**Order is deliberate.** Seam 1 comes first because `tests/smoke.py`'s 222
checks are the acceptance bar `AGENTS.md` sets for every refactor, and Pass C
proved that bar is partly unfalsifiable. Verifying any other fix against a
broken instrument proves nothing.

### Mutation testing: commit first, always

Several seams below require proving a test can fail — break the behaviour,
capture the failure, restore, re-run green. **Commit your work before you break
anything.**

`git checkout -- <file>` restores a file to `HEAD`, *not* to your work in
progress. Run it while your fix is uncommitted and it deletes the fix instead of
restoring it, silently, with `git status` afterwards looking exactly like a clean
restore. **Then re-run the full suite after restoring** — that is the only step
that can tell you which of the two happened.

This is not hypothetical. It cost a merge of `main` in a broken state during
seam 3: the fix commit contained only the test file, and the guards it was meant
to add were gone. The suite had been repaired specifically so it could catch
that, and it did — nobody ran it.

---

## Seam 1 — make the test suite able to fail

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes test files only.** Do not touch anything under `app/` or
> `static/`. If a fix appears to require an application change, that is a
> surprise — stop and report it rather than making the change.

Pass C found four ways this suite reports success without proving anything. Fix
all four.

**1. `tests/smoke.py:275` counts an unconditional pass.** When the first dungeon
move starts combat, the fallback branch calls `db.kv_del("dungeon")` and then
`ok(..., True)` — a literal, so the check cannot fail. Its comment claims
deleting the state "still exercises the exit paths"; it does not. Neither the
retire request nor its exit behaviour runs.

Either drive flee-then-retire for real, or delete the check. Both are
acceptable; a check that cannot fail is not. **If you delete it, the suite's
count changes from 222** — report the new number explicitly, because
`AGENTS.md` quotes `SMOKE PASSED — 222 checks green` as the acceptance line and
that document will need updating.

**2. Three tests pass on empty output.** Each asserts `all(...)` over a
generated list without proving the list is non-empty:

- `tests/test_giver_archetypes.py:34` — giver ownership
- `tests/test_counsel_engine.py:81` — endurance cold-start sizing
- `tests/test_counsel_giver_loops.py:229` — giver-loop cold-start boundaries

Assert an expected count before asserting a property over the collection. Do not
settle for `len(x) > 0` where you know the real number.

**3. `tests/test_counsel_schedule_reservation.py` does not test what it says.**
It calls `counsel.validate_attribution` and `quests.create_quest_from_offer`
directly — it never sets `counsel_mode` to scheduled, never obtains a scheduled
offer, and never calls `/api/quests/accept`, despite a comment reading "When:
Scheduled mode accepts it." It would pass unchanged if Scheduled acceptance were
deleted outright.

The real path is already covered at `tests/test_counsel_scheduled_mode.py:195`,
including required and optional attribution. **Retire the file** rather than
repairing it — but first confirm that claim yourself, and report what you find.
If `test_counsel_scheduled_mode.py` turns out not to cover it, say so and stop;
do not delete coverage on my say-so.

**4. The 60-day qualification boundary has no test.** `ACTIVITY_LOOKBACK_DAYS`
(`app/counsel_context_model.py:9`, value 60) has three consumers:
`app/counsel_context.py:71` (activity qualification),
`app/counsel_context_model.py:197` (lift recency) and
`app/counsel_specialists.py:85`. No test places a row at 59, exactly 60, or 61
days.

Add boundary coverage at all three ages for both the activity and lift paths.
**Both sites currently include the boundary** — `local_time < cutoff → skip` and
`occurred_at >= cutoff → keep` are the same rule written as complements. Pin the
behaviour that exists; do not "correct" either comparison.

### The acceptance bar for this seam

"Identical green" is the wrong criterion here — changing tests so they *can*
fail is the entire point, and a green run proves nothing about that.

**For every test you touch, demonstrate that it fails when the behaviour it
covers is broken.** Break the thing deliberately (stub the builder to return
empty, flip the comparison, remove the retire handler), capture the failure,
restore, and re-run green. Report both halves — the failure message and the
restored pass. A fix you cannot make fail on demand is not fixed.

Then run and quote the final line of each:

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
```

Also run every standalone script, since three of them are being edited:

```
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

### Out of scope for this seam

- **Any change under `app/` or `static/`.** Tests only.
- **Renaming the rule-state tests** whose names overstate what they assert
  (`test_counsel_engine.py:159` and its wellness cases). Recorded in §3 under
  Legibility; it is cosmetic and belongs with a later pass.
- **The browser suite's intermittent Town navigation failure.** Still open and
  still unexplained. If you see a browser run fail, **capture the
  `not ok <n> - <name>` line before anything else** and report it — that is the
  one piece of evidence the record is missing. Do not attempt a fix.
- Any other §3 entry. This seam is the instrument, not the repairs.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 2 — make the docs describe the game that exists

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes documentation only.** Do not touch anything under `app/`,
> `static/` or `tests/`. Every fix here is a *sentence*, not a code change. If a
> correction appears to require a code change, that is a surprise — stop and
> report it rather than making the change.

Pass D found stale claims in every tracked doc. The code is right and the prose
is wrong in every case below. Correct the prose.

**`DOCTRINE.md` first — it is the one most likely to be acted on.** `AGENTS.md`
requires consulting it before changing any Council constant, so an agent reading
a "current value" that no rule implements will go looking for the rule, or
restore it.

### The corrections

**`DOCTRINE.md`**

- **`:25`** lists a `readiness_1_5 <= 2` suppression threshold in a table headed
  "Constant (current value)". No Council rule reads readiness —
  `grep -rn readiness app/counsel*.py` returns nothing. **But readiness *is*
  stored during sync**, so this is not simply a deletion: the honest fix says the
  value is collected and currently unread. Decide which, do it, and say which you
  chose and why.
- **`:121`** puts `ACTIVITY_LOOKBACK_DAYS` in `counsel_context.py`. It is
  declared in `counsel_context_model.py:9` and re-exported.
- **`:138`** lists focus filtering and equipment awareness as open follow-ups.
  Both shipped, with behavioural tests in `tests/test_counsel_focus_filter.py`
  and `tests/test_counsel_iron_equipment.py`.

**`README.md`**

- **`:8`** and **`:83`** describe the old roster: kettlebells to Grunhilda,
  barbell/dumbbell/bodyweight/climbing to Bram, both honouring doctrines. Live
  roster is `game.py:57` — three offer-producing givers: Fenn takes endurance
  *and* climbing, Grunhilda takes all strength equipment *and* doctrines, Bram is
  retired. `AGENTS.md:28` already summarises this correctly; match it.
- **`:32`** promises offers that "target the neglected" muscle groups. No such
  calculation exists; iron candidates pick recent exercises compatible with
  current equipment and derive focus from those movements
  (`counsel_specialists.py:45`).
- **`:18`** and **`:38`** describe the paid reroll. It is gone —
  `grep -rn reroll app/ static/` returns nothing, and `/api/offers/{giver}`
  (`main.py:321`) takes a giver and nothing else.
- **`:180`** advertises "CRT scanline CSS". Zero `scanline` matches in
  `style.css`; `DESIGN.md:16` records that they were removed because they
  interfered with the smaller Quanta-Strike glyphs.

**`AGENTS.md`**

- **`:282`** lists "offers cache" among the kv store's contents.
- **`:303`** lists rerolls among the town gold sinks.
- **`:308`** states "Quest offers cache per day but are invalidated when a sync
  brings new data." Both halves are now false. The surviving `offers:%` deletion
  is migration cleanup, not a live cache.

**`DESIGN.md`**

- **`:235`** says `.btn` has no explicit `:focus-visible` rule and **`:310`** says
  tabs rely on browser defaults. `style.css:230` carries an explicit gold
  `.btn:focus-visible` treatment. `DESIGN.md:567` requires visible focus on every
  control, so **the component inventory is the stale half** — do not "fix" this
  by weakening `:567`.

**`PLUGINS.md`**

- **`:365`** says "Thirty-three test files." It is **31** as of this seam: 26
  `.py` plus 5 `.mjs`. (It was 32 when that line was written and seam 1 deleted
  one; the `.DS_Store` and `.pyc` in `tests/` are not test files.) Recount
  yourself rather than trusting this number.

### How to do it

**Verify every claim above against the code before you write the correction.**
Do not trust this brief — two of its earlier entries were wrong, and both were
caught by checking the tree. If a correction here is itself mistaken, that is the
most valuable thing you can report.

**Correct sentences. Do not improve documents.** No reorganising, no rewriting
for tone, no new sections, no "while I was in here" edits. Each doc has a
deliberate voice; match the surrounding prose and change the smallest span that
makes the statement true. A diff with unrelated reflowing in it will be sent
back.

**Two things that look like drift and are not — do not touch them:**

- `DEED_GIVER_BY_CATEGORY` crediting an *unsworn climb* to Ser Bram is
  **correct**, deliberate, commented and test-guarded. `ROADMAP.md` §3 says so
  explicitly. Bram retired from setting tasks, not from noticing.
- `README.md`'s bring-your-own-key framing for integrations is current, not
  aspirational.

### The acceptance bar for this seam

There is no test suite for prose, so the bar is different: **every corrected
sentence must cite the code that makes it true**, in your report, as
`file:line`. A correction you cannot anchor is a guess.

Then confirm you changed nothing else:

```
git diff --stat
```

Only `.md` files may appear. Run these anyway, to prove the tree is still sound:

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
```

Quote the final line of each.

### Out of scope for this seam

- **Any change under `app/`, `static/` or `tests/`.** Docs only.
- **`ROADMAP.md` itself.** Its §3 entry for this drift gets closed by Joe when
  the seam lands — leave it alone so the record shows the fix and the closure as
  separate acts.
- Any other §3 entry, and any doc claim not listed above. If you notice further
  drift, **report it, do not fix it** — it becomes its own entry.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 3 — bound the road against non-finite distance

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes `app/` and `tests/`.** It does **not** touch `static/`, so
> **no `?v=` bump is needed** — that rule applies only to static assets.

### The defect

`POST /api/activities/manual` (`app/main.py:457`) reads a raw JSON body and hands
it straight to `intervals.add_manual_activity` (`app/intervals.py:239`), which
writes:

```
int(float(payload.get("minutes", 0)) * 60),
float(payload.get("km", 0) or 0) * 1000,
```

Neither value is bounded. `{"km": "inf"}` and `{"km": 1e400}` both produce
infinity, SQLite retains it, and `road.total_km()` (`road.py:79`) then returns
infinity. `_landmarks_through()` (`road.py:91`) loops on:

```
while marks[-1]["km"] <= km + BEYOND_INTERVAL_KM * 2:
```

which is always true against infinity — and it **appends a landmark every
iteration**, so this is unbounded memory growth, not a hang you can wait out. Two
readers reach it: `road.state()` (`:112`) and `road.claim_next()` (`:141`).

`minutes` has the same exposure by a different route: `int(float("inf"))` raises
`OverflowError`, which is an unhandled 500 rather than a 400.

### What to fix

**Both ends. This is deliberate, not belt-and-braces.**

1. **At ingestion** — reject non-finite and otherwise nonsensical values rather
   than storing them. Follow the house convention: `raise ValueError("in-world
   message")` becomes a 400 that the frontend toasts automatically
   (`AGENTS.md` §Core conventions). Cover `km` *and* `minutes`, and consider
   negatives while you are there.
2. **At the reader** — `_landmarks_through` must terminate for any input,
   including values already sitting in the database. `AGENTS.md` states that
   persisted data is untrusted input and must degrade to unknown rather than
   raise. A guard at ingestion does nothing for a row written before this fix, or
   by a future writer.

**Decide the reader's degraded behaviour and say why.** A non-finite total could
clamp to the last authored landmark, or the road could report unknown. Pick one,
make it something a player could understand, and state your reasoning — do not
silently pick whichever is fewer lines.

### Tests

**The regression test for an infinite loop must not itself hang.** A naive test
that calls `road.state()` with a bad row will run until the process dies if the
fix regresses, which turns one failure into an unusable suite. Bound it — assert
against `_landmarks_through` directly with a value you know terminates, or put a
hard cap on the work done. **Say in your report how you bounded it.**

Cover at least:

- `POST /api/activities/manual` with `{"km": "inf"}`, `{"km": 1e400}` and a
  non-finite `minutes` — each rejected as a 400, nothing written to `activities`.
- A row containing a non-finite distance **written directly to SQLite**, then
  `/api/road` returning 200 with sane values. This is the case the ingestion
  guard cannot reach, and it is the one that matters most.
- Ordinary finite values still work end to end. A guard that rejects a real
  25 km run is worse than the defect.

### The acceptance bar

`tests/smoke.py` is the bar per `AGENTS.md`, and it now means something —
**identical green plus your new checks**, quoting the final line:

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
```

Plus every standalone script:

```
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

**And demonstrate the new tests can fail**, the same bar seam 1 was held to:
revert your guard, capture the failure, restore, re-run green. Report both
halves. A regression test you have not seen fail is not a regression test.

### Out of scope for this seam

- **Moving `add_manual_activity` to a provider-neutral `app/activities.py`.**
  `PLUGINS.md` §3c calls for this — it is the generic activity writer wearing a
  provider's name, with five callers unrelated to intervals.icu. That is real and
  unscheduled; the guard travels with the function when it moves. **Do not start
  it here.**
- **The other `/api/state` 500 shapes** (`game.get_char`, `ambition_mult`,
  `writ_notices_pending`, quest detail decoding, `records._last_activity`). Same
  untrusted-input theme, its own seam, deliberately not batched.
- **Any other §3 entry**, including the hardcoded `"endurance"` giver that lives
  a few lines from code you will be reading.
- **A validation framework.** No pydantic models for every endpoint, no shared
  validation layer. Two bounded values and one loop guard.
- **Cleaning up existing bad rows.** If you find any in a scratch DB, report it.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 4 — stop malformed rows from taking down the boot endpoint

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes `app/` and `tests/`.** It does **not** touch `static/`, so
> **no `?v=` bump is needed.** Re-read "Mutation testing: commit first, always"
> above before you break anything.

### The defect

`/api/state` is the boot endpoint — if it fails, the game does not load at all.
`app/main.py` registers a handler for `ValueError` only (`main.py:149`), so any
other exception escapes as a 500. Five sites on that path trust the shape of
whatever came out of SQLite:

1. **`game.get_char()` (`game.py:184`)** — `if not c:` only replaces *falsy*
   values, so a non-empty string passes, and `c.setdefault(...)` on line 189
   raises `AttributeError`.
2. **`game.ambition_mult()` (`game.py:386`)** — `min(3, s["ambition"])` raises
   `TypeError` on a string. A missing key raises `KeyError`; a float index into
   `AMBITION` raises `TypeError` too.
3. **`quests.writ_notices_pending()` (`quests.py:502`)** — iterates `lst` and
   indexes `n["ts"]`. An object where a list belongs iterates *keys*, so `n` is a
   string and indexing raises `TypeError`. A notice missing `ts` raises
   `KeyError`.
4. **`quests._quest_row()` (`quests.py:532`)** — `json.loads(r["details"])`
   succeeds for any valid JSON, so a stored `[]` decodes fine and then fails
   *downstream* where a mapping is expected. Note that `json.JSONDecodeError`
   subclasses `ValueError`, so genuinely malformed JSON already becomes a 400
   rather than a 500 — **still a game that does not load.** Do not treat 400 as
   success here.
5. **`records._last_activity()` (`records.py:167`)** —
   `(row["moving_time"] or 0) / 60` raises `TypeError` on stored text.
   `moving_time` is declared `INTEGER` with no `NOT NULL`, and SQLite's INTEGER
   affinity **keeps text it cannot convert**, so `'not a number'` really does
   land in that column. (`None` is fine — `(None or 0) / 60` is 0.)

   **`row["start"][:10]` is *not* a defect: `start` is `TEXT NOT NULL`
   (`db.py:74`) and has been since the initial commit, so it can never be
   `None`.** An earlier draft of this brief asked for a `start = NULL` fixture;
   that fixture is impossible and the claim was wrong. Do not write a guard for
   it.

### The rule, and the trap

`AGENTS.md`: **persisted data is untrusted input; malformed rows must degrade to
unknown, never raise.**

**Do not reach for `raise ValueError(...)` here.** Seam 3 established that as the
house convention and it was right *there* — that seam guarded **player input
arriving at a writer**, where rejecting is honest and the player can fix it. This
seam is the opposite direction: **data already in the database, arriving at a
reader.** Nobody can act on the rejection, and a `ValueError` on `/api/state` is
a 400 instead of a 500 — the same broken boot with a different number. Degrade
instead.

### The judgement call, and one hard constraint

Decide what "degraded" means at each site and say why. But:

**Do not silently overwrite a row you have decided is corrupt.** Two of these
sites already write back — `get_char()` calls `db.kv_set` and
`writ_notices_pending()` rewrites its list when the length changes. Serving a
safe default *in memory* is very different from persisting one over the player's
data. `vault.py`'s pre-migration snapshot is the rollback path, and an
overwrite destroys the evidence that anything was ever wrong. If you think a
write is genuinely the right call somewhere, **stop and report instead of doing
it.**

### Tests

Seed corrupt values **directly into SQLite / the kv store**, then assert
`/api/state` returns **200** with sane content. One case per shape above, at
minimum:

- `character` stored as a non-empty string
- `settings.ambition` stored as a string, and missing entirely
- `writ_notices` stored as an object rather than a list
- a quest whose `details` is valid JSON but not a mapping
- an activity with text in `moving_time`

**All five are constructible, and four need no raw SQL.** `kv.value` is
`TEXT NOT NULL` and `kv_get` does `json.loads` on it, so `db.kv_set("character",
"corrupt")` is enough to store a string where a mapping belongs — same for
`settings` and `writ_notices`. `quests.details` is `TEXT NOT NULL`, so `[]` goes
in as ordinary valid JSON. Only the `moving_time` case wants a direct insert.

**If a fixture turns out to be impossible, that is a finding, not an obstacle.**
Report it and stop, exactly as the `start = NULL` case was reported — a guard
against something the schema already prevents is dead code with a test
protecting it.

Plus: **ordinary data still works end to end.** A guard that flattens a healthy
character into a default is worse than the defect.

### The acceptance bar

Commit first, then mutation-test. For each guard you add, remove it, capture the
failure, restore, re-run. Report both halves.

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

Quote the final line of each. Smoke is currently **230 checks** — if your count
differs, say so explicitly, because `AGENTS.md` and `PLUGINS.md` both quote that
number and will need updating.

### Out of scope for this seam

- **The hardcoded `"endurance"` giver** in `_record_unguided_completion`
  (`quests.py:1011`). You will be reading nearby code. Leave it.
- **A validation framework.** No pydantic models for every endpoint, no shared
  schema layer, no decorator. Five sites, five guards.
- **Migrating or repairing existing rows.** Report anything you find.
- **`static/`.** If a degraded value would render badly, **report it** — the same
  way seam 3 surfaced that `total_km` can now be the string `"unknown"`. That
  note is in §3 awaiting a frontend seam; add to it rather than fixing it here.
- Any other §3 entry.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 5 — persist the giver the code actually computed

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes `app/` and `tests/`.** No `static/`, so no `?v=` bump.
> Re-read "Mutation testing: commit first, always" before you break anything.

### The defect

`grant_unguided_run_bonus` assigns a per-category giver via `deed_giver()`
(`quests.py:950`, backed by `DEED_GIVER_BY_CATEGORY` at `:912`) and stores it on
the candidate as `cand["giver"]`. Then `_record_unguided_completion`
(`quests.py:1033`) ignores it and writes the literal `"endurance"` into the
INSERT.

So every unguided deed is filed under Fenn regardless of what it was: a
WeightTraining deed queues as `strength` and persists as `endurance`. The
mismatch is invisible in the queue, which is why it survived — the *offered*
giver is right and only the *claimed* record is wrong.

The fix itself is one line: persist what the candidate carries. **The care is
all in what that changes downstream.**

### Compatibility decision — settled, do this

A first attempt at this seam stopped here, correctly. `cand["giver"]` would
raise `KeyError` on a legacy queued candidate: `unguided_pending()`
(`quests.py:1113`) calls `c.setdefault("giver", "endurance")` on the list it
just decoded, but `db.kv_get` runs `json.loads` on **every** call and returns a
fresh object, so that default is written to a throwaway and never persisted.
`claim_unguided_bonus()` re-reads the kv value and gets candidates with no
`giver` key at all. The comment calling that setdefault "load-bearing" is
wrong — **correct the comment while you are in there.** It is harmless today
only because the hardcode you are removing masks it.

**Use `cand.get("giver", "endurance")` at the recording boundary. Do not
migrate.** The default is *truthful*: candidates queued before per-giver
attribution really were all Fenn's. And the queue is transient —
`_sweep_stale_unguided_candidates` pays out and drops anything not dated today,
so a legacy candidate can only exist for under a day. Migrating a self-draining
queue would be live-data risk for nothing.

**The ordering underneath is a separate, pre-existing defect — do not fix it
here.** `claim_unguided_bonus` pops the candidate and persists that removal
(`:1128`) *before* `_apply_unguided_bonus` saves the character (`:1075`) and
records the quest row (`:1084`). Any exception in between leaves the player paid
with no quest row and no ledger event. Re-queuing is blocked by the same-day
`unguided_bonus_seen` key and the `start >= today` filter, so it is a lost
record rather than a double payout — but it is recorded in `ROADMAP.md` §3 as
its own entry. Your `.get()` default is what keeps this seam from *triggering*
it; it is not a fix for it.

### The ledger line is in scope — settled

`_apply_unguided_bonus` writes the Chronicle event three lines below the
recorder, and it hardcodes Fenn too (`quests.py:1087`):
`f"Fenn rewarded an unguided activity ..."`. The candidate's ceremony note is
already per-giver (`DEED_NOTES[giver]`, chosen at `:991`), so **after the
persistence fix the quest row and the ceremony would credit Grunhilda while the
Chronicle still credits Fenn** — a contradiction this seam would *create*.
Fix it here. Scope discipline exists to keep unrelated work out, not to force
shipping an inconsistency the change introduced. It is a Python f-string, not
`static/`, so no `?v=` bump.

**The obvious fix has a trap. `GIVERS` has no `wick` entry.** `deed_giver()`
returns `"wick"` for the `other` category and `DEED_NOTES` does have a `wick`
voice — but `GIVER_ARCHETYPES` (and therefore `GIVERS`) holds only `endurance`,
`strength`, `bram` and `recovery`. So `GIVERS[cand["giver"]]["name"]` raises
`KeyError` on an `other`-category deed — **inside the non-atomic claim path,
after the payout**, producing exactly the lost-record failure recorded in §3.

Look up the display name safely and give `wick` a name that suits the Ledger
House. Do not "fix" this by adding a `wick` entry to `GIVER_ARCHETYPES`: that
tuple is the equipment-ownership model, `OFFERABLE_GIVERS` and the doctrine
surface read it, and a scrivener does not own modalities. **If you think the
asymmetry should be resolved structurally, report it — do not do it here.**

### What this will change, and must be checked

`deed_giver()` can return `"bram"` (unsworn climbs, deliberate and test-guarded)
and `"wick"` (the `other` fallback). **Neither has ever appeared in
`quests.giver` for an unguided row before**, because the hardcode masked them.
Check every consumer tolerates them:

- **`counsel_schedule._accepted_today()` (`counsel_schedule.py:57`)** counts
  `WHERE giver=? AND substr(accepted_at,1,10)=?`, and unguided rows set
  `accepted_at` from the *activity's* start. So today an unguided WeightTraining
  deed inflates **Fenn's** accepted-today count; after the fix it will inflate
  **Grunhilda's**. That is a real behaviour change in Scheduled mode. Work out
  what it does to lane consumption and **report it before deciding** — there is
  a live question underneath (whether an unguided deed should advance *any*
  authored lane, given it was never accepted from a schedule) and that question
  is **not yours to settle in this seam**.
- **`quests.py:807`** grants stat gains by giver and has no `wick` branch.
  Confirm whether unguided completions reach it at all — `_unguided_stat_gains`
  looks like a separate path — and say which.
- **`main.py:330`**, and anything else reading a quest's giver.

### Historical rows

Every past unguided completion says `endurance`, right or wrong. The stored
`details` carries `activity_type` and `category`, so the true giver is
**reconstructible**.

**Do not migrate anything.** Live player data is safety rule 3 and needs Joe's
explicit sign-off, separately. Report how many rows are affected in a scratch DB
and confirm whether reconstruction is possible — that is the whole deliverable
on this point.

### Tests

- An unguided completion for each category persists the giver `deed_giver()`
  computes — at minimum a WeightTraining deed persisting `strength`, and a
  climb persisting `bram`.
- The offered/queued giver and the persisted giver **agree**. That equality is
  the actual invariant; assert it rather than asserting a literal, so the test
  survives a future taxonomy change.
- The existing unguided payout behaviour is unchanged: same XP, gold, vigor and
  stat gains as before.

### The acceptance bar

Commit first, then mutation-test: restore the hardcode, capture the failure,
restore the fix, re-run. Report both halves.

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

Quote the final line of each. Smoke is currently **241 checks** — if your count
differs, say so, because `AGENTS.md` and `PLUGINS.md` both quote it.

### Out of scope for this seam

- **Changing the giver taxonomy.** There is an unapproved idea in `ROADMAP.md`
  §2 about splitting Fenn and Grunhilda by *logging shape* (time-based versus
  set-based) rather than modality. This seam makes the persisted giver agree
  with `deed_giver()` so that idea would have **one** place to change instead of
  two. Do not start on it.
- **`DEED_GIVER_BY_CATEGORY`'s Bram entry.** Crediting an unsworn climb to Bram
  is correct, commented and test-guarded. After this fix it will start appearing
  in `quests.giver` — that is the entry working, not breaking.
- **Migrating historical rows.** Report only.
- Any other §3 entry, and `static/`.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 6 — make claiming an unguided deed atomic

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes `app/` and `tests/`.** No `static/`, so no `?v=` bump.
> Re-read "Mutation testing: commit first, always" before you break anything.

### The defect

`claim_unguided_bonus` (`quests.py:1123`) does this, in this order:

```
cand = cands.pop(idx)
db.kv_set("unguided_bonus_candidates", cands)   # commits the removal
rewards = _apply_unguided_bonus(cand)           # pays, then records
```

`db.kv_set` commits. `_apply_unguided_bonus` then saves the character
(`:1075`) and only afterwards writes the quest row and the ledger event
(`:1084`). **An exception anywhere in that window leaves the player paid, the
bubble gone, and no record that the deed ever happened.**

Re-queuing is blocked by the same-day `unguided_bonus_seen` key and the
`start >= today` filter, so nobody gets paid twice — the loss is the record,
and an activity that `_activity_already_rewarded` can no longer see.

### The trap — do not simply swap the lines

The removal is **deliberate** on one non-error path. When
`_apply_unguided_bonus` returns `None` — the activity got linked to a real quest
between queuing and the tap, so the quest already paid — the bubble must still
disappear and nothing must be granted. A naive "do the work first, then remove"
reorder resurrects that bubble every time.

So the correct states are:

| Outcome | Candidate removed? | Player paid? | Quest row + ledger? |
| --- | --- | --- | --- |
| Normal claim | yes | yes | yes |
| Already rewarded (`None`) | **yes** | no | no |
| Anything raises | **no** | no | no |

Get all three right. The third is the one that is wrong today.

### The idiom to follow — it already exists here

`create_quest_from_offer` (`quests.py:565`) is the house pattern: do every write
without committing, `db.commit()` once at the end, `db.rollback()` and re-raise
in an `except`. `db.rollback()` exists (`db.py:309`) and is used for exactly
this.

**`ROADMAP.md` §3 records that this atomicity contract is structural and
unwritten** — `create_quest_from_offer` depends on `insert_attribution`
deliberately *not* committing, and nothing says so at the boundary. You are
adding a second instance of the same contract. **Name the invariant in a comment
where you rely on it**, per `AGENTS.md`. That closes half of an existing §3 entry
as a side effect, which is a good reason to do it properly rather than with a
`try/finally` that papers over it.

### Tests

The failure is a *window*, so test the window — inject a failure between the
removal and the record, and assert the player is not left paid-with-no-record.
At minimum:

- Force `_record_unguided_completion` to raise, then assert **all three** of:
  the candidate is still claimable, the character's gold/XP are unchanged, and
  no `unguided_activity` quest row exists.
- The already-rewarded path still drops the bubble and pays nothing.
- An ordinary claim is unchanged — same XP, gold, vigor, stat gains, quest row
  and Chronicle entry as before.

### The acceptance bar

Commit first, then mutation-test: revert your ordering/transaction change,
capture the failure, restore, re-run. Report both halves.

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

Quote the final line of each. Smoke is currently **242 checks** — report any
change, because `AGENTS.md` and `PLUGINS.md` quote it.

### Out of scope for this seam

- **The routine-forging duplicate**, which has the same *shape* — a committed
  write followed by unguarded work — but **not the same fix.** `save_routine`
  (`programs.py:89`) mints `"r" + uuid4().hex[:8]` on every call and has nothing
  to deduplicate on, so making a retry safe needs a client-supplied idempotency
  key. That is frontend work and it belongs with the routine-ownership seam.
  *(An earlier plan of mine put both instances in this seam. That was wrong —
  the shape is shared, the remedy is not.)*
- **Whether an unguided deed should advance an authored Scheduled lane.** Open
  question in §3, nobody has decided it, and it is not decided here.
- **Backfilling historically misattributed rows.** Live data, needs its own
  sign-off.
- `static/`, and any other §3 entry.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 7 — a corrupt bonus candidate must not take down the boot endpoint

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes `app/` and `tests/`.** No `static/`, so no `?v=` bump.
> Re-read "Mutation testing: commit first, always" before you break anything.

### The defect

`/api/state` (`main.py:200`) calls `quests.unguided_pending()`, which runs
`_sweep_stale_unguided_candidates()` first. Neither treats the stored candidate
list as untrusted. **Reproduced against a scratch database:** a stale candidate
missing its keys raises `KeyError: 'stat_gains'` straight out of `/api/state` —
the game does not load.

This is a **gap in seam 4's coverage**, not new damage. That seam guarded five
persisted shapes on the boot path; `unguided_bonus_candidates` is another kv
value on the same path and was not among them. Same rule from `AGENTS.md`:
persisted data is untrusted input and must degrade, never raise.

There are **three** distinct failure points, and it is easy to fix one and think
you are done:

1. **The partition** — `[c for c in cands if c["date"] == t]`
   (`quests.py:1120`) raises on a candidate with no `date`, or on a non-mapping
   entry, *before* any payout is attempted.
2. **The payout** — `_apply_unguided_bonus` reads `cand["stat_gains"]`,
   `["xp"]`, `["gold"]`, `["vigor"]`, `["token"]`, `["drop"]`, `["note"]`,
   `["minutes"]` unguarded (`quests.py:1064` onward).
3. **The list itself** — `db.kv_get("unguided_bonus_candidates", [])` can return
   a non-list, and `unguided_pending()` then calls `.setdefault` on each entry,
   which raises on anything that is not a dict.

Seam 4's writ-notices guard is the precedent: it needed **both** an outer
"is this even a list" check and a per-entry check, and the outer one initially
shipped untested because the inner one masked it. Expect the same shape here.

### The fourth consumer — settled, and deliberately left failing

`grant_unguided_run_bonus()` (`quests.py:965`) also reads the queue, appends,
and writes it back (`:1012`). A first attempt at this seam stopped here,
correctly: guarding the readers leaves that **writer** able to fail on a corrupt
queue, and the four ways out all conflict with something.

**Seam 7 stays boot- and claim-safe. Leave the writer alone.** This is not
deferral — it is the right end state, for a reason worth understanding:

- **Boot failing locks the player out entirely.** There is nothing they can do
  and nothing to see. That must never happen.
- **Sync failing is already handled honestly.** `syncing.py:79` catches
  `Exception`, records a durable failure through `_record_failure`, and
  re-raises, so the player sees *"The ravens were lost before they finished
  their rounds"* and the app keeps running. A loud, surfaced, recoverable
  failure is the **correct** response to data the app cannot itself produce —
  nothing in Iron Vale ever writes a non-list here.

So the two rejected options, named so nobody re-opens them: treating the corrupt
value as an empty list and writing over it **destroys the preserved value**,
breaking this seam's own rule; quarantining to a second kv key adds a permanent
representation for a state that has never occurred. Both are speculative
generality bought with real complexity.

**Do not touch `grant_unguided_run_bonus` in this seam.** If your reader guards
change its behaviour incidentally, say so in your report.

### The judgement call — losing a payout is worse than leaking a row

A candidate is **player-visible state representing an unpaid reward**. Deleting
a malformed one silently costs the player something they earned.

**Recommended shape** — implement this unless you can argue better, and say why
either way:

- A single validity predicate, applied in one place.
- Invalid candidates are **skipped, not deleted**: they stay in storage, are
  never paid, and are **filtered out of what `unguided_pending()` returns**, so
  no bubble appears for a candidate that cannot be claimed.
- `claim_unguided_bonus` on an invalid candidate raises `ValueError` with an
  in-world message — a clean 400, not a 500.

Yes, that leaks a row that will never drain. **That is the right trade**: the
queue is otherwise self-draining, one stuck row costs nothing, and the
alternative destroys a reward. Do not add a cleanup that deletes them. Do not
log on every sweep either — this runs on every boot and would flood the ledger.

### Tests

- A **stale** malformed candidate: `/api/state` returns 200, and the candidate
  is still in storage afterwards.
- A **today** malformed candidate: `/api/state` returns 200 and the candidate
  does **not** appear in `unguided_pending`.
- Claiming a malformed candidate returns **400**, not 500.
- `unguided_bonus_candidates` stored as a non-list, and as a list containing a
  bare string: `/api/state` returns 200.
- **Valid candidates are completely unaffected** — still swept, still paid,
  still claimable, same XP/gold/vigor/stat gains. A guard that quietly
  disqualifies healthy candidates is worse than the crash.

### The acceptance bar

Commit first, then mutation-test **each** guard separately — the outer list
check, the per-candidate check, and the `unguided_pending` filter. Seam 6 shipped
a guard whose test could not fail because another guard masked it; do not repeat
that. Report each removal and its failure.

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

Quote the final line of each. Smoke is currently **248 checks** — report any
change, because `AGENTS.md` and `PLUGINS.md` quote it.

### Out of scope for this seam

- **Non-committing variants in `db.py`.** Seam 6 inlined `save_char` and
  `db.inv_add` because both commit; that duplication is recorded in §3 and is
  its own seam. Do not refactor it here.
- **The frontend.** If a degraded value would render badly, report it — §3
  already collects these for a frontend seam.
- **Backfilling misattributed rows**, and **whether an unguided deed should
  advance a Scheduled lane.** Both open, neither decided here.
- Any other §3 entry.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

---

## Seam 8 — teach the frontend what a degraded value looks like

*(paste the shared preamble from the top of this document, then this — but note
that the read-only rule does NOT apply here. This seam changes files.)*

> **This seam changes `static/`, and is the first one that does.** That means
> **you must bump `?v=N` on every static asset URL in `static/index.html`** —
> safety rule 4 in `AGENTS.md`. It is currently `?v=125`; take it to `?v=126`,
> and change **all** of them, not just the files you touched. Also changes
> `tests/`. Re-read "Mutation testing: commit first, always" before you break
> anything.

### Why this seam exists

Seams 3 and 4 both chose to **degrade rather than fail** when persisted data is
malformed — the right call, and it is why `/api/road` and `/api/state` no longer
die on a bad row. But neither seam could touch `static/` under its own scope, so
**the frontend was never told**. Two degraded values now reach it, and one of
them crashes a screen.

This seam answers the question those two left open, once: **what contract does a
degraded value have with its consumer?**

### The two cases

**1. `settings.ambition` — this one throws.** `misc.js:908` renders
`${esc(amb[s.ambition].desc)}`. The backend now (correctly) keeps serving the
stored value while using Forge's multiplier internally, so `s.ambition` can be a
string. `amb["corrupt"]` is `undefined`, and `.desc` raises a `TypeError`
**while rendering Settings** — the screen breaks. `:905`'s selected-state
highlight (`s.ambition === i`) fails silently, which is fine; `:908` is the
crash.

**2. `/api/road`'s `total_km` may be the string `"unknown"`.** `hall.js:154`
renders `${road.total_km} km`, which reads as "unknown km" — correct by luck,
but correct. `hall.js:1022` then does arithmetic: `km >= marks[i].km` and
friends. That survives **only** because JS coerces `"unknown"` to `NaN` and every
comparison goes false, leaving the pilgrim drawn at the gate. It does not crash,
and the result is even reasonable — but nothing anywhere says the value can be a
string, so the next person to touch that loop has no warning. `breakdown` values
can be `"unknown"` too.

### What to decide, and say why

**Pick one contract and apply it to both.** Roughly:

- The frontend treats any non-number as unknown at the point of use, through a
  named helper both call sites go through.
- The API sends a separate flag (`total_km_known: false`) and the frontend
  branches on that instead of sniffing types.
- Something else you can argue for.

**Do not just add two local `typeof` patches.** The point of the seam is that
there is *one* answer written down, so the third degraded value — and there will
be one — has somewhere to land. Whatever you choose, **say it in a comment at the
boundary**, per `AGENTS.md`.

If your answer requires an API change, **stop and report** rather than altering a
response shape unilaterally: `total_km` has two consumers and this brief does not
authorise a contract change.

### Tests

Frontend tests are Node, not Python. `tests/frontend_harness.mjs` builds a fake
DOM and the `*.test.mjs` files run modules inside it;
`tests/frontend_browser.test.mjs` drives headless Chromium. Put each test at the
lowest level that can actually fail:

- **Settings renders with a corrupt `ambition` and does not throw.** This is the
  one that matters — assert the screen renders, not that a helper returned
  something.
- **The Hall's road view renders with `total_km: "unknown"`** and shows no
  nonsense distance.
- **Healthy values are completely unaffected** — a real ambition still
  highlights its selected button and shows its description; a real `total_km`
  still positions the pilgrim between the right landmarks. A guard that makes
  every ambition render as unknown is worse than the crash.

### The acceptance bar

Commit first, then mutation-test **each guard separately** — two earlier seams
shipped a guard that another guard masked, and seam 7's per-guard bar is now
standing policy. Report each removal and its failure.

```
.venv/bin/ruff check .
.venv/bin/python tests/smoke.py
npm run test:frontend
npm run test:browser
for f in tests/test_*.py; do .venv/bin/python "$f" >/dev/null || echo "FAILED: $f"; done
```

Quote the final line of each. Smoke is currently **257 checks**; `AGENTS.md` and
`PLUGINS.md` quote that number, so report any change.

**Confirm the `?v=` bump landed on every asset URL.** A `static/` change without
it ships stale JS to players — the one failure mode no test catches.

### Out of scope for this seam

- **The Bram copy.** His greeting and completion pools still talk about barbells
  and deadlifts while only legacy climb quests reach them, and `town.js:27`
  credits an unsworn *climb* with "Iron moved is iron moved". Real, recorded in
  §3, and it is **voice work** — a different kind of judgement from this. Its own
  seam.
- **The dead CSS surfaces** and `REACTIONS.accept.bram`. They belong with the
  dead-code seam, which also has to work around `dungeon._rng`'s test dependency.
- **`G.dev`.** Confirmed live — Joe calls it from the browser console. §3 says
  do not delete it.
- **Routine ownership**, the `db.py` non-committing variants, and refusing an
  unmatched `activity_id`. All open, none of them this.
- Any other §3 entry.

Build → verify → **stop and report** → wait for an explicit "commit that seam."

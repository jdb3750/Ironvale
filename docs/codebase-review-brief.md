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

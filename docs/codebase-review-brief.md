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
> is ~7,700 lines of vanilla JS with no build step and no framework;
> `static/style.css` is ~2,900 lines; `tests/` is ~13,000 lines across 27 Python
> files plus Node DOM and headless-Chromium suites. Project conventions live in
> `AGENTS.md`; design rationale in `DESIGN.md`; direction and known defects in
> `ROADMAP.md`.
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

Read `static/js/` (11 files, ~7,700 lines; largest are `giver.js` 1,213,
`misc.js` 1,167, `app.js` 1,143, `hall.js` 1,117, `pixel.js` 1,103) and
`static/style.css` (~2,900 lines). There is no build step, no bundler and no
framework — that is deliberate, not an oversight, and "adopt a framework" is
not a finding.

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

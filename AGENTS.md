# Iron Vale — AI contributor guide

A self-hosted fitness RPG. FastAPI + SQLite backend, vanilla-JS pixel-art SPA
frontend. No framework, no bundler, no build step. Read this before changing
anything.

> **This file (`AGENTS.md`) is the canonical instructions for ANY model/tool.**
> `CLAUDE.md` is just a one-line pointer here (so Claude Code auto-loads it).
> Keep this file up to date; don't split guidance across both.

Deep architecture reference and operational playbooks now live in project
skills under `.opencode/skills/`, loaded on demand:

- `iron-vale-architecture` — per-module internals (game/dungeon/raid/colosseum/
  monsters/intervals/programs/items/exercises + frontend systems).
- `iron-vale-gotchas` — hard-won footguns (TestClient routing, CSS animations,
  intervals.icu API, raid dedup, PIN handling, server restart, etc.).
- `iron-vale-ops` — redeploy/restart procedure, full testing recipe,
  live-data correction playbook, opening PRs.

Six tracked design documents sit alongside this one:

- `DOCTRINE.md` — the science behind the Council's numbers. Every constant in the
  recommendation engine is either traced to a cited source or honestly labelled a
  game-design choice. **Read it before changing any training constant, and update
  it in the same commit** — a number that drifts from its rationale is how the
  science becomes a black box again.
- `COUNCIL_REDESIGN.md` — the Council's implementation charter: the archetype
  roster, the UI design language (§3b), what was deliberately cut and why (§7b),
  and the open follow-ups (§3, §8). Read §7b before rebuilding anything that
  correlates counsel with fitness outcomes. **§0c supersedes §0b's four-giver
  roster** — three givers offer quests; Bram is retired but never deleted.
- `ROADMAP.md` — app-wide direction beyond the Council: the capability/plugin
  surface and its deliberate non-goals. Nothing in it is approved to build; read
  it before proposing an architecture that would overlap it.
- `PLUGINS.md` — the plugin harness: the Phase 0 decisions that must be right
  before any of it is built (disk layout, manifest/`api_version`, the type
  vocabulary, registration, namespacing, restrictions, trust tiers) and a walked
  audit of every existing coupling that would have to change. Nothing in it is
  approved to build. It extends `ROADMAP.md` §1 and supersedes it on two points
  only — the dependency order (§4) and the font-pack prerequisite (§3a, which
  corrects a claim that is no longer true). **Read §2 before designing any
  extension point**, and §3c before touching activity ingestion.
- `BUILDER.md` — the routine builder (issue #17): the reframe from "Scratch for
  workouts" to a mirror that shows what a routine works, the four feedback
  lenses, the seam order, and the data-model notes for to-failure, supersets and
  custom-routine progression. Nothing in it is approved to build. **Read §1
  first** — the routine view only describes, and only the week view may say
  something is missing; a per-routine imbalance warning fires on every correctly
  built routine. §10 carries the Scheduled-mode inventory inherited from the old
  "build weeks" issue.
- `DESIGN.md` — the visual system as built in `static/style.css`, plus the
  responsive/smartphone interaction contract. Sections describing existing
  implementation are an extraction; sections labelled **required contract** are
  binding. **Read it before changing `style.css` or any responsive layout** — it
  also rules out adding a framework, native client, mobile API, or parallel
  component library.

This file holds only the always-true rules and quick-reference tables.

## CRITICAL SAFETY RULES

1. **`main` IS production.** The live game runs on Joe's server as a
   Portainer-managed Docker instance that tracks `origin/main` and
   auto-pulls roughly every 15 minutes — anything merged to `main` is in
   players' hands within minutes, with no human deploy step in between.
   Never merge unverified or half-done work; verify on the 8322 test setup
   first, then merge.
2. **Live player data lives on the server**, in the Docker instance's data
   volume — NOT in this repo's local `data/`. Local `data/` is a real
   historical copy of Joe's save (`ironvale.db`, `profiles.json`, one `.db`
   per friend) and contains real intervals.icu credentials: never wipe,
   seed, test against, or commit it. Never run test code with the default
   DATA_DIR. Test on **port 8322** with a scratch `DATA_DIR` — a launch
   config `iron-vale-test` exists for exactly this (update its DATA_DIR to
   a fresh scratch dir per session). A local uvicorn on 8321 is only a dev
   convenience now; nobody plays it.
3. If you must mutate live data (migration, backfill), it must happen
   against the server's data volume, additively, logged to the ledger
   (`db.log_event`) — and tell Joe exactly what changed. See skill
   `iron-vale-ops`.
4. **Bump the `?v=N` query on ALL static asset URLs in `static/index.html`
   whenever you change any JS/CSS file.** Browsers cache aggressively; a
   middleware sends `Cache-Control: no-cache` but the version bump is the
   guarantee.
5. **Never assume any profile — including `main` — is PINless, and never guess
   or brute-force a PIN.** If an authenticated flow needs exercising and the
   PIN isn't known, use read-only/unauthenticated endpoints or ask the human.

## Git workflow

The repo lives at `~/Code/iron-vale` on branch `main`, remote `origin` at
`https://github.com/jdb3750/Ironvale.git` (GitHub, HTTPS — **not SSH**).
`main` tracks `origin/main`. Push with plain `git push`/
`git push -u origin <branch>`; the `gh` CLI credential helper is already
configured (GitHub account `jdb3750`), no credential prompt needed. Reach for
`gh` — **not `tea`**, which speaks a different forge API and will not find this
repo. `.gitignore` already
excludes `data/` (the live save + credentials), `.venv/`, `__pycache__/`,
`*.pyc`, `.aider*`, `.DS_Store`. **Verify `git status` never lists anything
under `data/` before committing — those files contain Joe's real intervals.icu
credentials and personal training history. Never commit them.**

Golden rules:

1. **Commit or push ONLY when Joe explicitly asks.** Do the work, verify it,
   report it — then wait for "commit that" / "push it". Don't auto-commit.
2. **Never commit `data/`, secrets, or scratch DBs.** If `git status` shows
   them, stop and fix `.gitignore` first.
3. **Branch for anything non-trivial.** Feature/fix work goes on a branch off
   `main`: `feat/monster-ranch`, `fix/honor-completion`, `chore/agents-md`.
   Trivial doc/typo tweaks may go straight to `main`.
4. **One commit per coherent change** (mirrors the "pass" structure in Joe's
   memory). Subject line imperative and specific ("Add weekly Siege raid",
   not "updates"); put the *why* and any migrations/gotchas in the body.
5. **Static-asset commits must include the `?v=N` bump** in `static/index.html`
   (see safety rule 4) — otherwise players get stale JS/CSS.
6. **End AI-authored commits** with a trailer:
   `Co-Authored-By: <model> <noreply@anthropic.com>`.
7. **Merging to `main` deploys automatically** — the server's Docker
   instance pulls `origin/main` every ~15 minutes. There is no manual
   restart step, which is exactly why nothing unverified may reach `main`.

### Branch and release tag policy

Use short-lived, purpose-prefixed branches for non-trivial work:

- `feat/<scope>` - new player-facing behavior or content.
- `fix/<scope>` - bug fixes and issue-sized corrections.
- `refactor/<scope>` - structure-only changes with no intended behavior change.
- `perf/<scope>` - performance or hot-path work.
- `chore/<scope>` - docs, tooling, and repository maintenance.
- `hotfix/<scope>` - urgent production corrections.

Branch from `main`, keep the name specific to the work, merge only after
verification, then delete the local and remote branch. Do not use issue numbers
as the only name; `fix/menagerie-rarity` is useful, while `fix/40` is not.

Release tags are annotated SemVer tags on `VERSION` bumps — not tags for every
commit or branch. Tag the exact verified `main` commit after deployment, and
keep the tag equal to the root `VERSION` value: `v0.13.8`, `v0.14.0`, `v1.0.0`.
Push release tags explicitly to `origin`; never move or reuse an existing
release tag.

### Versioning

Semantic versioning `MAJOR.MINOR.PATCH`. The single source of truth is the
root `VERSION` file; the running app reads it at startup and shows it in the
footer, so it must always reflect what's actually deployed live.

Currently pre-1.0 (initial development) — per semver, MAJOR stays `0` and
breaking changes may land via a MINOR bump until the project reaches a stable
`1.0.0`.

- **MAJOR**: save-data-format-breaking changes requiring a migration, or a
  fundamental rewrite of a core system.
- **MINOR**: new features/content (quest types, screens, mechanics, givers,
  etc.) — backward compatible.
- **PATCH**: bug fixes, balance/tuning tweaks, copy corrections, refactors
  with no user-visible behavior change.
- **Docs/chore only** (editing `AGENTS.md`, restructuring skills): no bump.

Bump `VERSION` in the SAME commit as the change it corresponds to — never a
separate "bump version" commit (same spirit as the `?v=N` rule).

**Tagging every `VERSION` bump is mandatory — PATCH included.** `main`
auto-deploys, so every bump is a real release in players' hands, and the tag is
how anyone answers "what was live when?" later. Once the bumping commit is
verified and deployed, run `git tag -a vX.Y.Z -m "<summary>"` on that exact
commit, then push it explicitly: `git push origin vX.Y.Z` — a plain `git push`
does NOT push tags, and an unpushed tag helps nobody. Never move or reuse a
tag. Versions before `v0.20.0` are unevenly tagged; that history stands as-is
and is deliberately not backfilled.

See skill `iron-vale-ops` for the deployment model, testing recipe, and opening PRs.

If you ever find a stray non-project file in the tree (past example:
`hello_world.py`, `CODEX_CACHE.md` — leftover cruft from another tool, since
deleted), confirm with Joe before committing or deleting it rather than
assuming it's yours to remove.

## Architecture map

```
app/                     FastAPI backend (Python, stdlib sqlite3)
  main.py       App shell, auth + profile middleware, remaining HTTP routes, scheduler.
  db.py         SQLite layer; one DB file per profile, routed via contextvar —
                use db.q()/kv_*, never open sqlite directly.
  profiles.py   Adventurer roster: data/profiles.json maps slug -> db file + PIN hash.
  game.py       Shared core: character/settings, time, activity categories, training history.
  quests.py     Adaptive offers, quest lifecycle, Rest Writ, unguided bonuses, Wick claims.
  records.py    Hall read side: stats, wellness, calendar, keepsakes, almanac, chronicle.
  economy.py    Town shop purchases and the Crankwerk gacha.
  programs.py   Doctrines (Starting Strength etc.) + custom routines; linear progression.
  dungeon.py    Roguelike engine, Binding-of-Isaac rules: run-scoped gear/items/trinkets.
  intervals.py  intervals.icu sync (basic auth): activities + wellness.
  syncing.py    One complete manual/background sync flight and durable error status.
  sync_status.py Typed per-stream sync status: revision, per-field freshness, durable error.
  lifts.py      Lifting-ledger routes, validation, amendments, and day bounds.
  vault.py      Atomic daily realm snapshots with 14-day retention.
  monsters.py   Menagerie: DNA-seeded procedural monsters, packs, hats, buddy, capture.
  raid.py       The Siege: ONE weekly boss shared by ALL profiles (state in data/raid.json;
                shared realm config — the Siege Bell timezone — in data/realm.json).
  road.py       The Long Road: lifetime km -> pilgrimage landmarks (kv "road_claimed").
  colosseum.py  Betting mini-games (fight/race/pageant) vs. ephemeral rivals.
  items.py      Item catalog: dungeon gear/consumables/trinkets + Crankwerk cosmetics + packs.
  exercises.py  Exercise catalog with muscle groups + "how" form cues.
  imported_exercises.py Cached imported attribution: raw muscles, fold, and status.

  The Council — one cluster, governed by the "One qualified Council snapshot"
  invariant below. `main.py` enters it ONLY via counsel / counsel_nudge /
  counsel_adherence; nothing outside the cluster imports counsel_context or
  counsel_context_model, and that boundary is what keeps the snapshot single.
  counsel.py               Entry point: per-giver offers, option identity, acceptance.
  counsel_context.py       Assembles THE qualified snapshot, once, off one captured clock.
  counsel_context_model.py Snapshot types + admissibility constants (60-day activity
                           lookback, 6-set lower-body gate); history/lift summaries.
  counsel_candidates.py    Per-giver option drafts: endurance modality, Road, climb.
  counsel_specialists.py   Iron drafts (exercise + weight from lift history) and mobility.
  counsel_schedule.py      Scheduled mode: current/next planned slot, routine drafts, sizing.
  counsel_rules.py         Wellness trend/quantile rule state and the source disclosure.
  counsel_wellness.py      Admissible wellness rows, recovery days, per-field freshness.
  counsel_nudge.py         Daily nudge line from practice cadence per declared focus.
  counsel_options.py       Shared vocabulary: OptionDraft / TierMeta / OptionContext, reasons.
  counsel_adherence.py     Current-week schedule adherence (done vs planned).
  counsel_attribution.py   Which mode (counsel/self/schedule) a quest came from; validated.

static/                  Frontend (script tags, load order matters — see index.html)
  js/pixel.js   SPRITES: hand-authored char-map pixel sprites (p=palette, r=rows).
  js/art.js     Served PNG art manifests: NPC portraits, building art, and town tiles.
  js/audio.js   WebAudio synth SFX (SFX.click/coin/fanfare/squeak/...). No files.
  js/app.js     Core state/API/router/shell, profile UI, boot, delegated click SFX.
  js/ui.js      SCREENS registry, shared helpers, and modal builder.
  js/charts.js  Shared canvas chart primitives for Hall views.
  js/town.js    Town hub, live time-of-day scene, Fenn/willow bubbles, and Siege banner.
  js/giver.js   Giver/dialogue, quest, doctrine, logger, and Scrivener screens.
  js/hall.js    Hall stats, calendar, Tapestry, Road, Mantel, Compendium, Almanac.
  js/misc.js    Crankwerk and settings screens.
  js/dev-console.js Dev-mode command console and tab completion.
  js/ranch.js   Menagerie simulation (RAF loop): wander/graze/sleep/fetch, drag creatures.
  js/colosseum.js The Colosseum: bet UI + three canvas mini-animations (fight/race/pageant).
  js/dungeon.js Undercroft UI: gate, crawler map, combat, Pip shop, relic panel.
  style.css     All styling. Vignette, .win/.win-title bordered panels, pixel buttons.
  index.html    Script/style tags with ?v=N cache-buster. BUMP N ON EVERY CHANGE.
```

For deeper behavior of any specific module, load skill `iron-vale-architecture`.

## Core conventions

- **Screens**: `SCREENS.foo = async function () { $app().innerHTML = shell(html); }`.
  Navigate with `nav('foo', params)`; params in `S.params`. `shell()` adds the
  header (logo left, adventurer right) and footer (BACK above divider, then
  ravens/settings/sound). `render()` re-runs the current screen — cheap, but it
  wipes DOM; anything that must survive (ranch sim) needs its own state store.
- **Event handlers**: global functions on `G.*`, wired via inline `onclick`.
  **NEVER interpolate user-visible strings (quest titles, monster names) into
  onclick attributes** — HTML entities decode before JS parses, so apostrophes
  ("The Courier's Route") break the handler. Pass ids; look data up in state.
- **DB writes**: `db.q()` executes but does NOT auto-commit — call `db.commit()`
  after any INSERT/UPDATE/DELETE or the write is invisible to other connections
  (TestClient serves requests on another thread with its own connection, so
  un-committed test seeds silently vanish). `db.kv_set`/`kv_del`/`inv_add`
  commit internally.
- **Sprites**: add to SPRITES in pixel.js (palette chars + row strings), render
  with `spriteTag(key, px)`, then ensure `hydrateSprites(container)` runs.
  Monsters/heroes use data-attrs and are hydrated the same way.
- **Hand-drawn art**: add served PNG mappings in `static/js/art.js`, following
  `static/art/npcs/`, `static/art/poi/`, and `static/art/town/` conventions.
  Keep source files and palettes under `assets/`; use `image-rendering: pixelated`.
- **SFX**: `app.js` delegates neutral `SFX.click()` feedback for every enabled
  `button` element and any element with an inline `[onclick]` attribute. Keep
  distinct outcome sounds such as accept/coin/error/fanfare explicit. A
  JS-wired non-button element needs an explicit neutral `SFX.click()`. Add new
  synths in audio.js.
- **Voice**: all copy is in-world (ravens = sync, "strike from the record" =
  delete, prorated pay = 7 coins in 10). Keep it. No emojis anywhere — pixel
  sprites only.
- **Server errors**: `raise ValueError("in-world message")` → 400 → frontend
  `api()` toasts it automatically. Endpoints are thin; logic lives in modules.
- **kv store**: per-profile misc state (character, settings, dungeon run,
  buddy_id, resume_floor, pack_series). `db.kv_get/set/del`.
- **Two clocks**: personal time (`game.now()`/`today()`, calendars, quest
  days) follows the per-profile `settings.timezone`, auto-synced from the
  player's device at boot; Siege week math (`raid.siege_now()`/
  `week_start()`) follows the ONE shared realm bell in `data/realm.json`.
  Never mix the two — see skill `iron-vale-gotchas`.

## Data model quick reference

Tables (per profile DB): quests, activities, lift_sets, inventory (hats/decor/
packs only now), equipment (legacy, unused), ledger (event log), monsters
(name/dna/rarity/personality/born/source/hat), wellness, kv.

Character dict (kv "character"): name, level, xp, gold, tokens, vigor, stats
{str,end,con,spr}, streak {count,last,best}, deepest_floor, deaths,
quests_done, appearance {skin,hair,hair_color,shirt,pants}.

## Game-design invariants (don't break these)

- Vigor comes ONLY from completed quests; it gates the dungeon.
- Nothing material leaves the dungeon (gold banks on retire; gear/items/
  trinkets never do). Town gold sinks: Crankwerk cosmetics and packs.
- Auto-completion of quests happens only from SYNCED activities, never from
  logged-set counts (the player may still be mid-workout).
- Honor completions create a typed synthetic activity (so history/calendar/
  Road stay truthful).
- Every quest giver reacts in-dialog (REACTIONS) and congratulates completions
  of OTHER givers' quests only (thanked map in localStorage iv_lastq).
- **One qualified Council snapshot.** Every Council evaluation uses one
  immutable, request-scoped qualified context, assembled once with one captured
  clock. Selection, sizing, recency, gates, nudges, recovery and disclosure
  consume only that context. Consumers may narrow it for their modality but may
  never query raw training data or relax its admissibility rules. An activity
  excluded for invalid source, non-positive duration, lookback or future time
  cannot influence any Council conclusion. Wellness requires admissible dates and
  finite values; malformed persisted data degrades to unknown and must never stop
  `/api/state` loading. Several reads stitched together is NOT a snapshot — one
  clock, one capture. (Known scaling debt: the snapshot is assembled per request;
  revisit if profiles grow large. Do not weaken the invariant to optimise.)

## Briefing an agent (and yourself)

- **State non-goals with the goals.** For an AI, what a feature *sounds like*
  shapes what gets built as much as what you asked for. Iron Vale is a game: it
  does not diagnose, predict injury, prove its advice, or stand in for a
  professional. Say so — a feature that sounds medical or safety-critical
  attracts audit trails, tamper-evidence and disclaimer prose nobody asked for.
  (This is not hypothetical: the first Council pass spent ~2,200 lines of app
  code, a similar budget to what shipped, on making advice *provable* rather than
  useful.)
- **Scope to one seam, and say what NOT to do.** The out-of-scope list does more
  work than the spec. Require build → verify → **stop and report** → wait for an
  explicit "commit that seam." Never let one task roll into the next.
- **"If you find a surprise, report it rather than deciding."** That single line
  surfaced two real defects that would otherwise have been quietly resolved.
- **Name invariants in a comment at the boundary they protect.** Structure alone
  does not survive a port: the original Council assembled one qualified context,
  a refactor dissolved it, and five truthfulness defects followed because nothing
  wrote the rule down.

## Testing recipe

Test backend against a scratch `DATA_DIR` with TestClient (select a profile
cookie first); test frontend on port 8322 with a scratch `DATA_DIR` launch
config (`iron-vale-test`). See skill `iron-vale-ops` for the full recipe and
TestClient/profile-routing gotchas.

**Write tests that could fail.** Two rules, both learned the hard way:

- **Assert player-observable outcomes, not artifacts.** A test that checks a
  reason code, flag or label was produced proves the code ran, not that it
  worked — the entire browser and smoke suites were green while the lower-body
  gate logged its reason and suppressed nothing. Assert what the player would
  notice: the hard option is *absent*, the 6th set changes the offer, an unlinked
  profile is *not* told its data came from intervals.icu. Where a rule has a
  boundary, test both sides (5 sets AND 6). Behaviour preservation includes
  intermediate states, not just the final recommendation.
- **Every test must stand alone.** Browser tests share one server and one
  `DATA_DIR`, so it is easy to lean on state an earlier test left behind — and
  then a subset run reports green while proving nothing. Verify with
  `node --test --test-name-pattern="<one test>" tests/frontend_browser.test.mjs`.
- **Persisted data is untrusted input.** Malformed rows, non-finite values and
  inadmissible dates must degrade to unknown, never raise. `/api/state` is the
  boot endpoint; a 400 there means the game does not load.

**Regression net**: `.venv/bin/python tests/smoke.py` — 242 checks over every
read endpoint plus the quest/dungeon/gacha/scrivener lifecycles on a throwaway
scratch DB. Run it before AND after any refactor that moves code; identical
green is the acceptance bar. It must never point at the live `data/` dir (it
builds its own scratch and deletes it).

Frontend logic and browser regressions are repeatable too:
`npm run test:frontend` runs the DOM harness, while `npm run test:browser`
launches a scratch server on an OS-assigned ephemeral port and drives headless
Chromium through phone validation, profile/PIN switching, and sync-failure
visibility. Port 8322 remains the human scratch-preview port; set
`IRON_VALE_BROWSER_PORT` only when an exact test port is required. Run
`npm install && npx playwright install chromium` once on a new checkout.

**Lint**: `.venv/bin/ruff check .` — green means the last line reads `All
checks passed!`. Ruff is pinned in `requirements-dev.txt`; install it once per
checkout with `.venv/bin/pip install -r requirements-dev.txt`. Dev tooling is
deliberately kept OUT of `requirements.txt`, which is the only dependency file
the Dockerfile installs — a linter has no business shipping to players. There
is no ruff config in the repo, so it runs on its defaults; bumping the pin is
its own commit, since a newer Ruff enables new default rules and can redden a
clean tree without a line of app code changing.

**A command that did not run is not a passing command.** `.venv/` lives in the
main checkout only, so from a git worktree `.venv/bin/python` and
`.venv/bin/ruff` both fail with "no such file or directory" — use the main
checkout's absolute path (`~/Code/iron-vale/.venv/bin/...`). That error is the
easiest false green there is: it reads as environment noise rather than
failure. When reporting a suite, quote the tool's own last line — `SMOKE
PASSED — N checks green`, `All checks passed!`. If you cannot quote it, you
did not run it.

## Gotchas

See skill `iron-vale-gotchas` for hard-won footguns before touching
dungeon/ranch/intervals/raid/CSS-animation code or restarting the server.

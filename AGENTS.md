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

This file holds only the always-true rules and quick-reference tables.

## CRITICAL SAFETY RULES

1. **`data/` holds Joe's LIVE SAVE** (`ironvale.db`, `profiles.json`, plus one
   `.db` per friend profile). Never wipe, seed, or test against it. Never run
   test code with the default DATA_DIR.
2. **Port 8321 is the live game.** Joe plays it mid-session, including while
   you work. Never point 8321 at a test database. Test on **port 8322** with a
   scratch `DATA_DIR` — a launch config `iron-vale-test` exists in
   `~/Code/.claude/launch.json` for exactly this (update its DATA_DIR to a
   fresh scratch dir per session).
3. If you must mutate live data (migration, backfill), do it additively, log
   it to the ledger (`db.log_event`), and tell Joe exactly what changed.
4. **Bump the `?v=N` query on ALL static asset URLs in `static/index.html`
   whenever you change any JS/CSS file.** Browsers cache aggressively; a
   middleware sends `Cache-Control: no-cache` but the version bump is the
   guarantee.
5. **Never assume any profile — including `main` — is PINless, and never guess
   or brute-force a PIN.** If an authenticated flow needs exercising and the
   PIN isn't known, use read-only/unauthenticated endpoints or ask the human.

## Git workflow

The repo lives at `~/Code/iron-vale` on branch `main`, remote `origin` at
`git@codeberg.org:bonez/Ironvale.git` (Codeberg, SSH — **not GitHub, not
HTTPS**). `main` tracks `origin/main`. Push with plain `git push`/
`git push -u origin <branch>`; SSH auth is already configured (Joe's key is
on the Codeberg account), no credential prompt needed. `.gitignore` already
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
7. **After committing app code, redeploy**: restart uvicorn on 8321 so the
   running game picks it up.

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
separate "bump version" commit (same spirit as the `?v=N` rule). Tagging is
recommended but not mandatory: `git tag vX.Y.Z` on the bumping commit, for
easy reference. (The repo has zero tags today; start the habit.)

See skill `iron-vale-ops` for the exact redeploy/restart procedure and for opening PRs.

If you ever find a stray non-project file in the tree (past example:
`hello_world.py`, `CODEX_CACHE.md` — leftover cruft from another tool, since
deleted), confirm with Joe before committing or deleting it rather than
assuming it's yours to remove.

## Architecture map

```
app/                     FastAPI backend (Python, stdlib sqlite3)
  main.py       All HTTP endpoints, auth + profile middleware, 15-min auto-sync loop.
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
  monsters.py   Menagerie: DNA-seeded procedural monsters, packs, hats, buddy, capture.
  raid.py       The Siege: ONE weekly boss shared by ALL profiles (state in data/raid.json).
  road.py       The Long Road: lifetime km -> pilgrimage landmarks (kv "road_claimed").
  colosseum.py  Betting mini-games (fight/race/pageant) vs. ephemeral rivals.
  items.py      Item catalog: dungeon gear/consumables/trinkets + Crankwerk cosmetics + packs.
  exercises.py  Exercise catalog with muscle groups + "how" form cues.

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
  style.css     All styling. CRT scanlines, .win/.win-title bordered panels, pixel buttons.
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
  offers cache, buddy_id, resume_floor, pack_series). `db.kv_get/set/del`.

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
  trinkets never do). Town gold sinks: Crankwerk (cosmetics), packs, rerolls.
- Auto-completion of quests happens only from SYNCED activities, never from
  logged-set counts (the player may still be mid-workout).
- Honor completions create a typed synthetic activity (so history/calendar/
  Road stay truthful).
- Quest offers cache per day but are invalidated when a sync brings new data.
- Every quest giver reacts in-dialog (REACTIONS) and congratulates completions
  of OTHER givers' quests only (thanked map in localStorage iv_lastq).

## Testing recipe

Test backend against a scratch `DATA_DIR` with TestClient (select a profile
cookie first); test frontend on port 8322 with a scratch `DATA_DIR` launch
config (`iron-vale-test`). See skill `iron-vale-ops` for the full recipe and
TestClient/profile-routing gotchas.

**Regression net**: `.venv/bin/python tests/smoke.py` — 76 checks over every
read endpoint plus the quest/dungeon/gacha/scrivener lifecycles on a throwaway
scratch DB. Run it before AND after any refactor that moves code; identical
green is the acceptance bar. It must never point at the live `data/` dir (it
builds its own scratch and deletes it).

## Gotchas

See skill `iron-vale-gotchas` for hard-won footguns before touching
dungeon/ranch/intervals/raid/CSS-animation code or restarting the server.

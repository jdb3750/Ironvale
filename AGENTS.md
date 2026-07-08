# Iron Vale — AI contributor guide

A self-hosted fitness RPG. FastAPI + SQLite backend, vanilla-JS pixel-art SPA
frontend. No framework, no bundler, no build step. Read this before changing
anything.

> **This file (`AGENTS.md`) is the canonical instructions for ANY model/tool.**
> `CLAUDE.md` is just a one-line pointer here (so Claude Code auto-loads it).
> Keep this file up to date; don't split guidance across both.

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
7. **After committing app code, redeploy**: restart uvicorn on 8321
   (`kill $(lsof -ti :8321)` then relaunch) so the running game picks it up.

Typical loop:

```sh
git switch -c feat/<thing>            # branch off main
# ...edit, then verify on port 8322 with a scratch DATA_DIR (never 8321)...
git add -A                            # confirm `git status` excludes data/
git commit -m "<imperative subject>"  # body explains why + migrations
# ...when Joe says so: git push -u origin feat/<thing>
```

If you ever find a stray non-project file in the tree (past example:
`hello_world.py`, `CODEX_CACHE.md` — leftover cruft from another tool, since
deleted), confirm with Joe before committing or deleting it rather than
assuming it's yours to remove.

## Architecture map

```
app/                     FastAPI backend (Python, stdlib sqlite3)
  main.py       All HTTP endpoints, auth + profile middleware, 15-min auto-sync loop.
  db.py         SQLite layer. ONE DB FILE PER PROFILE, routed via contextvar —
                middleware sets it from the iv_profile cookie; the sync loop sets
                it per profile. Never open sqlite yourself; use db.q()/kv_*.
                Schema (executescript) + try/except ALTER migrations live in conn().
  profiles.py   Adventurer roster: data/profiles.json maps slug -> db file + PIN
                hash. 4-digit PIN required on create; legacy "main" may be pinless.
  game.py       Quest engine: offer generation (cached per giver per day in kv
                "offers:<giver>:<date>"), accept/complete/abandon, rewards, streaks,
                activity categorization (CATEGORIES), muscle recency, wellness
                insights, calendar payloads, Wick claims, auto_complete_ready().
  programs.py   Doctrines (Starting Strength etc.) + custom routines; linear
                progression suggestions; build_program_offer leads daily offers.
  dungeon.py    Roguelike engine, Binding-of-Isaac rules: run-scoped gear/items/
                trinkets, shop + relic pedestal generated on every floor, prices in
                loot gold, NOTHING persists to town except banked loot gold. Run
                state is a dict in kv "dungeon".
  intervals.py  intervals.icu sync (basic auth): activities + wellness. First sync
                ~400 days, then rolling 30. add_manual_activity() for honor/claims.
  monsters.py   Menagerie: DNA-seeded procedural monsters, packs (3/pack, numbered
                procedurally-named series), hats, buddy (kv "buddy_id"), capture.
                preview() builds a monster dict WITHOUT persisting — use this for
                any one-off/ephemeral creature (see colosseum.py) instead of _gen().
  raid.py       The Siege: ONE weekly boss shared by ALL profiles (state in
                data/raid.json beside profiles.json, NOT in any profile DB;
                all mutation under one threading.Lock). Spawns lazily on first
                touch of a new ISO week; name/dna/trophy seeded from the week
                key so every profile sees the same beast. HP = combined roster
                4-week avg weekly minutes x10 x0.85. Damage = activity minutes
                x10, applied per-profile from week-scoped activity scans with
                per-activity-id dedup (raid.json "counted"). apply_damage()
                is hooked into /api/sync, the background sync loop, AND lazy
                GET /api/raid (so honor/Wick deeds count immediately). Spoils
                (weekly trophy hat + pack + 2 tokens) claimed once per profile.
                Trophy hats are siege-exclusive: in items.py but NOT GACHA_POOL.
  colosseum.py  Betting mini-games (fight/race/pageant) vs. ephemeral rivals built
                from monsters.preview(). Field+odds cached in kv "colosseum:<kind>"
                between the preview GET and the enter POST so the bet resolves
                against what the player actually saw; cleared after each bet.
                Sims (round-by-round HP, per-tick race noise, judged scores) run
                for real server-side — the frontend only dramatizes the result.
  items.py      Item catalog: dungeon gear/consumables/trinkets (TRINKETS dict) +
                Krankwerk cosmetics (hats/decor) + monster packs. GACHA_POOL is
                cosmetics-only by design.
  exercises.py  Exercise catalog with muscle groups + "how" form cues.

static/                  Frontend (script tags, load order matters — see index.html)
  js/pixel.js   SPRITES: hand-authored char-map pixel sprites (p=palette, r=rows).
                Parametric generators: drawHero (appearance), genMonsterModel/
                drawMonster (DNA -> creature, mulberry32 PRNG), body maps.
                hydrateSprites() draws every canvas[data-sprite|data-hero|
                data-monster|data-bodymap] — call it after injecting HTML.
  js/audio.js   WebAudio synth SFX (SFX.click/coin/fanfare/squeak/...). No files.
  js/app.js     S (global state), api(), nav()/G.back() (history stack S.hist),
                render(), shell() = header() + content + footer(), showCeremony(),
                profile picker, appearance editor overlay, boot().
  js/screens.js Town screens as SCREENS.<name> functions; giver dialogs
                (GREETINGS/REACTIONS/CONGRATS), quest flows, Hall of Records tabs,
                calendar, Wick, Krankwerk lever, settings + dev panel.
  js/ranch.js   Menagerie simulation (RAF loop): wander/graze/sleep/fetch states,
                drag creatures (freak-out), in-pen hat panel with drag-drop +
                ground hats that creatures fetch, magnifying-glass lens (monLens),
                pack ripping. RANCH.saved preserves positions across re-renders;
                app.js render() nulls it when leaving the screen (intentional:
                herd "moves around" between visits).
  js/dungeon.js Undercroft UI: gate, crawler map, combat, Pip shop, relic panel.
  js/colosseum.js The Colosseum: bet UI + three canvas mini-animations (fight/
                race/pageant) that dramatize a result already decided server-side.
  style.css     All styling. CRT scanlines, .win/.win-title bordered panels,
                pixel buttons. Overlay titles are un-absoluted via
                `.overlay .win > .win-title` (don't regress this).
  index.html    Script/style tags with ?v=N cache-buster. BUMP N ON EVERY CHANGE.
```

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
- **Sprites**: add to SPRITES in pixel.js (palette chars + row strings), render
  with `spriteTag(key, px)`, then ensure `hydrateSprites(container)` runs.
  Monsters/heroes use data-attrs and are hydrated the same way.
- **SFX**: call `SFX.something()` on every interactive click/success/failure.
  Add new synths in audio.js.
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
  trinkets never do). Town gold sinks: Krankwerk (cosmetics), packs, rerolls.
- Auto-completion of quests happens only from SYNCED activities, never from
  logged-set counts (the player may still be mid-workout).
- Honor completions create a typed synthetic activity (so history/calendar/
  Road stay truthful).
- Quest offers cache per day but are invalidated when a sync brings new data.
- Every quest giver reacts in-dialog (REACTIONS) and congratulates completions
  of OTHER givers' quests only (thanked map in localStorage iv_lastq).

## Testing recipe

```sh
# backend, always against scratch:
DATA_DIR=/tmp/iv-scratch .venv/bin/python - <<'EOF'
from fastapi.testclient import TestClient
from app.main import app
c = TestClient(app)
c.post("/api/profiles/select", json={"slug": "main"})   # cookie needed first!
...
EOF

# frontend: start "iron-vale-test" (port 8322, scratch DATA_DIR), then drive
# the preview browser. Dev mode (Settings) seeds fake training/wellness/gold.
# After JS edits: bump ?v=N in index.html AND hard-navigate the preview page.
```

`node --check static/js/*.js` catches syntax errors cheaply. TestClient covers
API flows; the dungeon can be bot-walked with random moves (prior sessions did
exactly this to find Pip/relics).

## Gotchas learned the hard way

- TestClient + profiles: select a profile first or requests hit the default DB.
- `setPointerCapture` throws on synthetic pointers — always wrap in try/catch,
  and set grab state BEFORE calling it.
- Ranch: hat-fetch has a cooldown (`hatCd`) to prevent two monsters trading
  the same hats forever. Ground hats re-offer every ~4s to whoever is off
  cooldown. Keep both if you touch the fetch logic.
- The overlay `.win-title` CSS fix (static positioning inside overlays) exists
  because absolute titles clip inside scrollable overlays.
- The background sync loop iterates ALL profiles with `db.set_profile` — any
  new per-profile background work must do the same.
- Character/dungeon dicts are load-bearing JSON; when adding fields, use
  `.setdefault`/`.get` for saves created before the field existed.
- **Never use `window.prompt()`** — it's unreliable/blocked in embedded and
  automated contexts and doesn't match the pixel-art aesthetic. Build a small
  `.overlay` with an `<input>` and a button instead (see G.setPinPrompt,
  G.showCreate for the pattern). `confirm()` for yes/no is fine and used
  throughout; it's specifically the text-input `prompt()` that's banned.
- Buttons get sound for free: a single delegated `document` click listener
  (in app.js) plays `SFX.click()` for any `button` or `[onclick]` element.
  Don't bother adding `SFX.click()` to new handlers just for tap feedback —
  it's redundant. Do still add distinct sounds (accept/coin/error/fanfare)
  for outcomes that deserve more than a neutral blip.
  **Caveat**: the `[onclick]` selector only matches *inline HTML attributes*
  (`onclick="fn()"`), not JS-property-set handlers (`el.onclick = fn`). If
  you wire a click handler from JavaScript, the delegated sound won't fire;
  either use an inline attribute or call `SFX.click()` yourself.
- When testing multi-step canvas animations (Colosseum, Ranch) via the
  preview eval tool, reload the page between test runs rather than
  re-clicking the same trigger across separate eval calls — overlapping
  runs share module-level state (e.g. `COL.animating`) and will look broken
  when they're actually just colliding with a previous test's leftover
  in-flight animation.
- **CSS `animation` does not compose across selectors.** If two rules match
  the same element and both set `animation`, the later declaration wins
  outright — it doesn't merge the keyframe lists. Example: `.reward-line`
  had `animation: popin` (opacity 0→1), but `.levelup` on the same element
  set `animation: pulse` (text-shadow only). Result: the element never left
  opacity 0 and was functionally invisible. Fix: list both in one
  declaration (`.levelup { animation: popin ..., pulse ...; }`), or split
  animations across a wrapper/inner element so they never share a property.
- **Avoid the standalone `translate`/`scale` CSS properties** (i.e. not
  inside `transform`). They're newer and have inconsistent-enough browser
  support to cause visible "wrong position, then snaps to correct" flashes.
  Use `transform: translateX(-50%) scale(0.4)` instead of the standalone
  `translate`/`scale` properties. If you need two independent animations
  that both touch `transform`, split them into a wrapper + inner element
  (each animates its own `transform` solo) rather than fighting over one
  element's single `transform` stack.
- **Backend `.py` changes need a uvicorn restart.** Static JS/CSS/HTML are
  served fresh from disk on every request (so they update instantly), but
  Python modules are loaded once at startup. When testing the full stack
  against a running port-8322 server, restart uvicorn after any `.py` edit.
- **TestClient + profile DB routing**: the contextvar that `db.set_profile()`
  sets is scoped to the current asyncio task. A top-level
  `db.set_profile(path)` in a test script doesn't carry into TestClient
  requests (which run in their own tasks). For direct DB manipulation in
  tests, use `db.set_profile(db.DB_PATH)` (which resolves to the same
  `ironvale.db` that the middleware routes to for the "main" profile) rather
  than hardcoding a custom filename.
- **Wellness table has no per-row source tag.** The `wellness` table is a
  simple date-keyed ledger — `INSERT OR REPLACE` (or `ON CONFLICT(date) DO
  UPDATE`) with no guard. Dev mode's "seed 60d of fake training" silently
  overwrites any real `wellness` rows that share a date, and the "wipe fake
  training" dev action only clears `activities WHERE source='dev'` — it
  never touches the `wellness` table at all. If a profile has real intervals
  data and someone ever hits "seed" in dev mode, the wellness window is
  corrupted with no self-healing path (ordinary rolling syncs only go back
  30 days). Fingerprinting trick for post-hoc detection: dev-seed writes raw
  `random.uniform()` floats with long decimal tails (e.g. `77.0544878621`);
  real intervals.icu data is always cleanly rounded (e.g. `78.743`). Search
  for >6-digit fractional parts to find contaminated rows.
- **intervals.icu always reports weight in kg** regardless of the athlete's
  display preference there. The `weight_unit` setting in Iron Vale
  (`kg`/`lb`) is a lift-weight display label (manually-entered, so it
  matches whatever the player typed). But bodyweight charts in the Vitals
  tab are driven by synced wellness data, which is always metric no matter
  what. If the player sets `weight_unit=lb`, you must convert on the
  frontend — storage stays kg (single source of truth from the API).

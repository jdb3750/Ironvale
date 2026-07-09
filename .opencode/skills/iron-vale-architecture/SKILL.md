---
name: iron-vale-architecture
description: Deep reference for how Iron Vale's backend modules (game.py, dungeon.py, raid.py, colosseum.py, monsters.py, intervals.py, programs.py, items.py, exercises.py) and frontend systems (pixel.js, ranch.js, dungeon.js, colosseum.js, screens.js, app.js) actually work internally. Use before modifying or needing to understand any specific subsystem's mechanics (dungeon runs, raid boss math, colosseum sims, monster/ranch simulation, sprite rendering, quest offer generation, etc.) beyond the one-line summary in AGENTS.md.
---

# Iron Vale — architecture deep reference

This skill holds the full per-module mechanics that were trimmed out of the
one-line Architecture map in `AGENTS.md`. Load it before changing any specific
subsystem. The structure mirrors `AGENTS.md`'s map (backend modules, then
frontend files); every detail below is load-bearing.

## Backend (`app/`, FastAPI + stdlib sqlite3)

```
app/
  main.py        All HTTP endpoints, auth + profile middleware, 15-min auto-sync loop.
  db.py          SQLite layer. ONE DB FILE PER PROFILE, routed via contextvar —
                 middleware sets it from the iv_profile cookie; the sync loop sets
                 it per profile. Never open sqlite yourself; use db.q()/kv_*.
                 Schema (executescript) + try/except ALTER migrations live in conn().
  profiles.py    Adventurer roster: data/profiles.json maps slug -> db file + PIN
                 hash. 4-digit PIN required on create; legacy "main" may be pinless
                 — but NEVER assume any profile (main included) is pinless, and
                 never guess/brute-force a PIN (see iron-vale-gotchas).
  game.py        Quest engine: offer generation (cached per giver per day in kv
                 "offers:<giver>:<date>"), accept/complete/abandon, rewards, streaks,
                 activity categorization (CATEGORIES), muscle recency, wellness
                 insights, calendar payloads, Wick claims, auto_complete_ready().
  programs.py    Doctrines (Starting Strength etc.) + custom routines; linear
                 progression suggestions; build_program_offer leads daily offers.
  dungeon.py     Roguelike engine, Binding-of-Isaac rules: run-scoped gear/items/
                 trinkets, shop + relic pedestal generated on every floor, prices in
                 loot gold, NOTHING persists to town except banked loot gold. Run
                 state is a dict in kv "dungeon".
  intervals.py   intervals.icu sync (basic auth): activities + wellness. First sync
                 ~400 days, then rolling 30. add_manual_activity() for honor/claims.
  monsters.py    Menagerie: DNA-seeded procedural monsters, packs (3/pack, numbered
                 procedurally-named series), hats, buddy (kv "buddy_id"), capture.
                 preview() builds a monster dict WITHOUT persisting — use this for
                 any one-off/ephemeral creature (see colosseum.py) instead of _gen().
  raid.py        The Siege: ONE weekly boss shared by ALL profiles (state in
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
  colosseum.py   Betting mini-games (fight/race/pageant) vs. ephemeral rivals built
                 from monsters.preview(). Field+odds cached in kv "colosseum:<kind>"
                 between the preview GET and the enter POST so the bet resolves
                 against what the player actually saw; cleared after each bet.
                 Sims (round-by-round HP, per-tick race noise, judged scores) run
                 for real server-side — the frontend only dramatizes the result.
  items.py       Item catalog: dungeon gear/consumables/trinkets (TRINKETS dict) +
                 Krankwerk cosmetics (hats/decor) + monster packs. GACHA_POOL is
                 cosmetics-only by design.
  exercises.py   Exercise catalog with muscle groups + "how" form cues.
```

## Frontend (`static/`, script tags — load order matters, see index.html)

```
static/
  js/pixel.js    SPRITES: hand-authored char-map pixel sprites (p=palette, r=rows).
                 Parametric generators: drawHero (appearance), genMonsterModel/
                 drawMonster (DNA -> creature, mulberry32 PRNG), body maps.
                 hydrateSprites() draws every canvas[data-sprite|data-hero|
                 data-monster|data-bodymap] — call it after injecting HTML.
  js/audio.js    WebAudio synth SFX (SFX.click/coin/fanfare/squeak/...). No files.
  js/app.js      S (global state), api(), nav()/G.back() (history stack S.hist),
                 render(), shell() = header() + content + footer(), showCeremony(),
                 profile picker, appearance editor overlay, boot().
  js/screens.js  Town screens as SCREENS.<name> functions; giver dialogs
                 (GREETINGS/REACTIONS/CONGRATS), quest flows, Hall of Records tabs,
                 calendar, Wick, Krankwerk lever, settings + dev panel.
  js/ranch.js    Menagerie simulation (RAF loop): wander/graze/sleep/fetch states,
                 drag creatures (freak-out), in-pen hat panel with drag-drop +
                 ground hats that creatures fetch, magnifying-glass lens (monLens),
                 pack ripping. RANCH.saved preserves positions across re-renders;
                 app.js render() nulls it when leaving the screen (intentional:
                 herd "moves around" between visits).
  js/dungeon.js  Undercroft UI: gate, crawler map, combat, Pip shop, relic panel.
  js/colosseum.js The Colosseum: bet UI + three canvas mini-animations (fight/
                 race/pageant) that dramatize a result already decided server-side.
  style.css      All styling. CRT scanlines, .win/.win-title bordered panels,
                 pixel buttons. Overlay titles are un-absoluted via
                 `.overlay .win > .win-title` (don't regress this).
  index.html     Script/style tags with ?v=N cache-buster. BUMP N ON EVERY CHANGE.
```

---
name: iron-vale-gotchas
description: Hard-won footguns and edge cases discovered across past Iron Vale sessions — TestClient/profile DB routing, sprite pointer-capture, ranch hat-fetch cooldown, overlay CSS title positioning, background sync loop iteration, character/dungeon dict defaults, CSS animation composition and standalone transform properties, render()-wipe vs in-flight animations, the two-clock timezone model (profile tz vs Siege Bell), lsof/kill process-targeting, wellness data contamination, intervals.icu API quirks, raid damage dedup limitations, and PIN-handling rules. Use before touching dungeon.js/ranch.js/colosseum.js/pixel.js, intervals.py sync, raid.py damage logic, wellness data, CSS animations/canvas code, or any date/time bucketing — check here first so known mistakes aren't repeated.
---

# Iron Vale — gotchas learned the hard way

Every bullet below came from a real session where something broke in a
non-obvious way. Check the relevant group before touching that area.

## Testing & TestClient

- TestClient + profiles: select a profile first or requests hit the default DB.
- **TestClient + profile DB routing**: the contextvar that `db.set_profile()`
  sets is scoped to the current asyncio task. A top-level
  `db.set_profile(path)` in a test script doesn't carry into TestClient
  requests (which run in their own tasks). For direct DB manipulation in
  tests, use `db.set_profile(db.DB_PATH)` (which resolves to the same
  `ironvale.db` that the middleware routes to for the "main" profile) rather
  than hardcoding a custom filename.
- When testing multi-step canvas animations (Colosseum, Ranch) via the
  preview eval tool, reload the page between test runs rather than
  re-clicking the same trigger across separate eval calls — overlapping
  runs share module-level state (e.g. `COL.animating`) and will look broken
  when they're actually just colliding with a previous test's leftover
  in-flight animation.

## Frontend interactivity (sprites, sound, prompts)

- `setPointerCapture` throws on synthetic pointers — always wrap in try/catch,
  and set grab state BEFORE calling it.
- **Never use `window.prompt()`** — it's unreliable/blocked in embedded and
  automated contexts and doesn't match the pixel-art aesthetic. Build a small
  `.overlay` with an `<input>` and a button instead (see G.setPinPrompt,
  G.showCreate for the pattern). `confirm()` for yes/no is fine and used
  throughout; it's specifically the text-input `prompt()` that's banned.
- Buttons get sound for free: a single delegated `document` click listener
  (in app.js) plays `SFX.click()` for every `button` element and any element
  with an inline `[onclick]` attribute.
  Don't bother adding `SFX.click()` to new handlers just for tap feedback —
  it's redundant. Do still add distinct sounds (accept/coin/error/fanfare)
  for outcomes that deserve more than a neutral blip.
  **Caveat**: a JS-wired button still matches the `button` selector. A
  JS-wired non-button element has no inline `[onclick]` attribute, so it needs
  an explicit neutral `SFX.click()` when tap feedback is appropriate.

## Ranch simulation

- Ranch: hat-fetch has a cooldown (`hatCd`) to prevent two monsters trading
  the same hats forever. Ground hats re-offer every ~4s to whoever is off
  cooldown. Keep both if you touch the fetch logic.

## CSS & animations

- The overlay `.win-title` CSS fix (static positioning inside overlays) exists
  because absolute titles clip inside scrollable overlays.
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
- **render() wipes #app mid-animation.** Most button click handlers end in
  `nav()`/`render()`, which rebuilds `#app` via innerHTML — any CSS
  animation running ON the clicked element dies the instant the handler
  runs (it only appears to work when the click is held, because the handler
  fires on release). Press feedback that must outlive the click goes on a
  body-level element pinned to the control's rect — see the `.key-pop-ghost`
  pattern in app.js (spawned on pointerdown, self-removes on animationend
  with a setTimeout backstop). Binding the animation to `:active` is doubly
  wrong: it also cancels the moment the selector stops matching.

## Deploy & process management

- **Backend `.py` changes need a uvicorn restart** on the LOCAL test
  server. Static JS/CSS/HTML are served fresh from disk on every request
  (so they update instantly), but Python modules are loaded once at
  startup. When testing the full stack against a running port-8322 server,
  restart uvicorn after any `.py` edit. Production restarts itself — the
  server's Docker instance auto-pulls `origin/main` every ~15 min (see
  skill `iron-vale-ops`), so merging IS deploying.
- **`lsof -ti :<port>` can return multiple pids**, including unrelated
  processes that merely hold a stale/closed socket referencing the port
  (observed in a real session: an unrelated helper showed up alongside the
  actual uvicorn listener). `kill $(lsof -ti :8321)` blindly kills all of
  them and can take down the wrong process. Filter to the real listener:
  `lsof -iTCP:8321 -sTCP:LISTEN -t` (same for 8322 when restarting the test
  server).

## Time & timezones (the two-clock model)

- **There are exactly two clocks; never mix them.** Personal time —
  `game.now()`, `game.today()`, `utc_to_local_iso()`, calendars, quest
  days, activity bucketing — follows the per-profile `settings.timezone`,
  which the client auto-syncs from the device (`Intl` timezone) on every
  boot ("last device wins"). Siege week math — `raid.siege_now()`,
  `week_key()`, `week_start()` — follows the ONE shared realm bell stored
  in `data/realm.json` (default UTC, editable in Settings behind an
  in-world confirm). Using `game.now()` in siege-week logic re-splits the
  shared week per profile; using `siege_now()` for personal days puts a
  player's run on the wrong calendar day.
- **Activity `start` strings are local-offset ISO** (e.g.
  `2026-07-13T21:00:00-07:00`). String comparison against a boundary
  timestamp is unreliable across offsets — query a deliberately loose
  window (a bare `YYYY-MM-DD` lower bound sorts before any datetime on
  that date) and re-check each row with real tz-aware parsing. See
  `raid.apply_damage` for the canonical shape.
- **Changing the Siege Bell near a week boundary can re-key the current
  week** (the ISO year-week only shifts when the change moves a
  Monday-midnight across "now"). The settings UI warns via confirm;
  prefer changing the bell right after a boss dies.

## Background sync & JSON defaults

- The background sync loop iterates ALL profiles with `db.set_profile` — any
  new per-profile background work must do the same.
- Character/dungeon dicts are load-bearing JSON; when adding fields, use
  `.setdefault`/`.get` for saves created before the field existed.

## PIN handling

- **Never assume a profile is pinless — and never guess PINs.** Even `main`
  may carry a PIN now (the "legacy main may be pinless" note is a
  possibility, not a promise). If you need to exercise a live authenticated
  flow and don't have the PIN, either stick to read-only/unauthenticated
  endpoints (note: with only one profile, unauthenticated requests
  default-route to `main`'s DB) or ask Joe for the PIN. Brute-forcing or
  guessing is never acceptable.

## intervals.icu & wellness data

- **Wellness table has no per-row source tag, so dev writes are guarded.**
  Both "seed 60d of fake training" and "bad recovery" use `INSERT OR IGNORE`:
  they fill empty dates only and never overwrite existing wellness rows.
  "Wipe fake training" removes only `activities WHERE source='dev'`; it does
  not remove wellness added by either dev action. Real intervals.icu sync is
  intentionally authoritative and uses `ON CONFLICT(date) DO UPDATE` to
  overwrite matching dates. Keep this distinction intact: the dev guard was
  added after replacement-style seeding once corrupted live wellness data.
- **intervals.icu always reports weight in kg** regardless of the athlete's
  display preference there. The `weight_unit` setting in Iron Vale
  (`kg`/`lb`) is a lift-weight display label (manually-entered, so it
  matches whatever the player typed). But bodyweight charts in the Vitals
  tab are driven by synced wellness data, which is always metric no matter
  what. If the player sets `weight_unit=lb`, you must convert on the
  frontend — storage stays kg (single source of truth from the API).
- **intervals.icu: single-activity fetch needs the GLOBAL endpoint.**
  `GET /api/v1/activity/{id}` works; the obvious
  `/athlete/{athlete_id}/activities/{activity_id}` does NOT — intervals.icu
  silently ignores the trailing activity-id segment and returns the
  athlete's full activity list instead of erroring or filtering.
- **intervals.icu: custom fields are FLAT top-level keys** on the activity
  JSON object (e.g. Garmin-synced `ClimbTime`), NOT nested under
  `icu_custom_fields`/`custom_fields`/any wrapper.
- **intervals.icu: the list endpoint is NOT a trimmed summary.** The
  `/athlete/{athlete}/activities` route the regular sync already uses
  returns the SAME full rich payload per activity as the single-activity
  endpoint (~180 keys, all custom fields included). Reading a new custom
  field into the sync path never needs extra per-activity API calls — it's
  already in the payload `sync()` receives.

## Raid damage dedup & data integrity

- **Raid damage dedup has no self-heal.** The per-activity-id set in
  `data/raid.json` "counted" records only THAT an activity was counted, not
  the field values used (e.g. `moving_time`). If an activity's duration is
  corrected after the fact (re-sync with different data, manual DB edit),
  previously-applied raid damage does NOT recompute — it stays wrong until
  someone notices and hand-edits `data/raid.json`. There is currently no
  endpoint/tooling for reversing or adjusting already-applied raid damage;
  it requires a careful manual JSON edit under the same care as any other
  live-data mutation (per CRITICAL SAFETY RULES: additive, log to
  `db.log_event`, tell Joe exactly what changed).

## The Council's defect family: claiming more than the data supports

Almost every Council defect has been the same shape — code asserting knowledge it
had not verified against the underlying data. Real examples, all shipped-then-caught:

- an availability answer collected and stored but never read by any rule;
- specific barbell movements named from a generic `WeightTraining` activity, with
  no logged lift behind them;
- `provider: intervals.icu` hardcoded, so a profile training on hand-logged lifts
  was told its data came from a service it never linked;
- a lower-body gate that recorded its reason code while nothing acted on it;
- an iron routine whose *declared focus* omitted legs while its actual exercises
  loaded them, hiding leg work from that gate;
- recency counting zero-duration rows that sizing had already discarded;
- future-dated and unparseable wellness rows manufacturing a Rest Writ;
- a wellness field reported "fresh" with no finite value behind it.

**When reviewing anything that advises the player, ask of every assertion: does
the data actually support this claim?** Not "does it run" — "is it true." The
structural defence is the one qualified Council snapshot (see AGENTS.md
"Game-design invariants"); the human defence is this question.

A useful tell: if a value is derived from a *label* (a declared focus, a
hardcoded constant, a requested group) rather than from the underlying facts, it
will drift from the facts eventually.

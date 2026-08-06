# Iron Vale — the plugin harness

`ROADMAP.md` §1 records the decision that the app should become a base
experience plus opt-in capabilities. This file is the next layer down: the
decisions that must be right *before* any of it is built, and a walked audit of
what in the current codebase would have to change to support it.

**Nothing here is approved to build.** Every phase needs its own explicit
go-ahead, built one seam at a time, verified, reported, and stopped — the same
discipline `AGENTS.md` requires of any other work. This document exists so the
irreversible decisions are made once, in the open, rather than discovered
halfway through an implementation.

**Relationship to `ROADMAP.md` §1.** That section stands as the origin and the
rationale — why capabilities are worth doing, why the type count is the real
scope, why this is not called a marketplace yet. This file supersedes it on two
points only: the recommended first step (§4 below reorders it) and the font-pack
prerequisite (§3a corrects it). Read §1 first; it is shorter and it explains
why.

## 0. Two things worth stating up front

**The best case is not "many plugins."** It is that Iron Vale decomposes into a
shell — character, ledger, town, quests, ceremony, economy, time — and a domain
layer that happens to be fitness. Every seam that makes Garmin swappable is
structurally the same seam that would make fitness itself swappable. That is an
emergent property to be aware of while designing, **not a goal to chase**, and
nothing in this document should be built in order to reach it.

**The value is the harness, not the plugins.** Iron Vale does not have to build
the features. It has to make it possible for someone else to. A plugin harness
that produces one upstreamed chart has paid for itself in a way that
"customization" never could.

## 1. The shape of the idea

### 1a. Spine and leaves

Everything here is either **spine** or **leaf**. The spine is small and becomes
expensive to change the moment anything depends on it: disk layout, manifest,
versioning, registration, namespacing, restrictions. The leaves are the
harnesses themselves — numerous, independent, and cheap once the spine exists.

The failure mode is building an impressive leaf first (providers, most likely)
and discovering the spine underneath it afterward.

**The acceptance criterion for the whole design: once the spine exists, adding a
new harness must never require touching the spine.** If it does, the spine is
wrong, and it gets fixed *then* — while there are still zero third-party plugins
and breaking things is free.

### 1b. Plugins write against internal interfaces, not a sanctioned subset

The instinct is to design a narrow, safe, curated plugin API. That instinct is
wrong here, because a plugin written against a special plugin-API can never be
upstreamed without a rewrite — it arrives as something to port, so it does not
get ported.

If a plugin registers against the same interfaces core code uses, a good
third-party contribution is **already a patch**. That is the difference between
accepting contributions in principle and having a pathway that actually flows.

The cost is no abstraction boundary to hide behind during refactors. That cost
is accepted deliberately; see the breakage policy in §2h.

## 2. Phase 0 — the decisions

These are the decisions that force a rebuild if made wrong. All are cheap now
and expensive after the first stranger ships a plugin.

### 2a. Disk layout and discovery

Plugins live at `data/plugins/<id>/`, inside the Docker volume beside the live
save. Consequences, all deliberate:

- They are **player data**, not repo content — subject to safety rule 2, never
  committed, never seeded, never tested against with the default `DATA_DIR`.
- They are covered by the Vault's snapshots (`vault.py` requires a change for
  this — see §3e).
- A plugin is a directory, discovered by presence. There is no install database
  to fall out of sync with the filesystem.

Layout inside a plugin directory:

```
data/plugins/<id>/
  plugin.json      the manifest (§2b)
  content/*.json   declarative data, schema-validated
  static/          browser JS/CSS/art, served under /plugins/<id>/
  server/          Python, tier 2 only
```

### 2b. Manifest and `api_version`

Every plugin declares the harness API it was written against.

**Without this field on day one, nothing can ever be broken safely.** It is the
highest-leverage line in the system.

```json
{
  "id": "manual-ledger",
  "name": "The Manual Ledger",
  "version": "1.0.0",
  "api_version": 1,
  "tier": 0,
  "types": ["provider"],
  "requires": [],
  "author": "...",
  "source": "https://github.com/..."
}
```

The loader must treat a manifest as **untrusted input**, in the same sense
`AGENTS.md` requires of persisted data: malformed manifests, unknown fields, and
future `api_version` values degrade to a disabled plugin with a named reason,
never to an exception. `/api/state` is the boot endpoint; a plugin directory
must never be able to stop the game loading.

### 2c. The type vocabulary — including types not built for years

Name all of them now. Reserving a name costs nothing; a collision later costs a
migration.

| Type | What it extends | Status |
| --- | --- | --- |
| `content` | Declarative data: routines, doctrines, exercises, items, cosmetics, dialogue | first harness |
| `provider` | Activity/wellness ingress | needs §3c |
| `chart` | A view over declared capability fields | needs §2f |
| `screen` | A registered `SCREENS` entry | near-free |
| `town-slot` | A building in the square | needs §3d |
| `council-rule` | `(QualifiedContext) -> [OptionDraft]` | near-free |
| `minigame` | Undercroft-shaped or Colosseum-shaped | contract exists as prose |
| `portal` | A road out of the Vale | trivial once `town-slot` exists |
| `theme` | Palette tokens | near-free (see §3a) |
| `font` | Family + scale tokens as one unit | near-free (see §3a) |
| `sfx` | WebAudio synth kits | near-free |
| `locale` | The in-world voice in another language | needs §3e |
| `generator` | Procedural grammars (monsters, landmarks, bosses) | unscoped |

**A plugin declaring a type this version has no harness for must load, report
that it needs a harness this version lacks, and not crash.** That single rule is
what lets the index list plugins ahead of the code, and it is why the vocabulary
is fixed before the harnesses exist.

### 2d. The registration idiom

`PLUGINS.register({...})` on both sides. Never direct assignment to `G.*`,
`SCREENS`, `SPRITES`, or any other global.

Registration checks for collisions and refuses, loudly and by name. The
frontend is one flat namespace across fourteen files (§3e) — without this, a
plugin can silently clobber core and the symptom appears somewhere unrelated.

Free today, permanent tomorrow.

### 2e. State namespacing

Plugin state lives in the per-profile kv store under `plugin:<id>:*`, through
the existing `db.kv_get`/`kv_set`/`kv_del`.

**Plugins do not get tables.** Not in the first API version. kv-only makes
uninstall tractable (one prefix scan), rides the existing migration machinery,
and keeps `db.SCHEMA` a single readable string. This is a restriction that can
be relaxed on evidence; see §2g.

Orphan policy: disabling a plugin leaves its state untouched. Uninstalling
prompts, and the removal is logged to the ledger like any other mutation.

### 2f. The capability field vocabulary

These names become public API for providers and charts *simultaneously* — a
provider declares what it supplies, a chart declares what it requires, and the
host renders on the intersection. Neither knows about the other.

The vocabulary derives from what the schema already carries
(`intervals.ACTIVITY_FIELDS` and `WELLNESS_FIELDS`):

- Activity: `start`, `type`, `name`, `moving_time`, `distance`, `load`, `avg_hr`
- Wellness: `hrv`, `resting_hr`, `vo2max`, `weight`, `sleep_secs`, `ctl`,
  `atl`, `readiness`

**`ctl` and `atl` are intervals' training-load model.** Garmin, Whoop and Oura
do not produce them. This is exactly the case the capability declaration exists
to handle honestly, and it is the reason the vocabulary cannot simply be "the
columns of the wellness table."

Open decision, and it belongs in this phase because both providers and charts
depend on it: **fixed superset columns plus capability declaration, or an
`extras` JSON column.** Recommend the fixed superset — it keeps queries
readable and forces new fields through a deliberate migration, which is the
existing culture.

### 2g. What a plugin may not do

**The asymmetry that matters: loosening a restriction later is trivial; adding
one later breaks every existing plugin. So start restrictive and relax on
evidence.**

Opening position:

1. **No minting.** A plugin may not add gold, XP, vigor or tokens. It may
   *observe* state and *request* player-legible actions (offer a quest, which
   pays through the normal path). This keeps the ledger truthful, which is
   already a stated value — honor completions create a real synthetic activity
   precisely so history, calendar and Road stay honest.
2. **No direct sqlite.** `db.q`/`kv_*` only, and only within its namespace.
3. **No CSS injection.** The host owns chrome. A `theme` or `font` plugin sets
   declared tokens; it does not ship a stylesheet.
4. **No writes outside its namespace**, and no reads of another plugin's state
   without that plugin declaring it shared.

Two of these will probably be relaxed. None of them could be added later.

**Restriction 1 is currently unenforceable** — there is no chokepoint to enforce
it at. See §3e.

### 2h. Versioning and breakage policy

Pre-1.0, **the API moves.** Plugins pin an `api_version`; incompatible ones
disable loudly with a named reason; the changelog says what moved.

Obsidian froze its API and spent a decade serving compatibility. For an audience
of dozens, on a `main` that auto-deploys within ~15 minutes with no human step,
"we will break you, here is exactly how" is honest, cheap, and the only policy
compatible with §1b's decision that plugins write against internal interfaces.

The corollary is a hard requirement, not a nicety: **an incompatible plugin must
disable visibly, never silently.** A player whose town quietly lost a building
has no way to discover why.

### 2i. Trust tiers

There is no sandbox and there should not be one. Iron Vale is self-hosted; the
player already trusts a Docker image. What is needed is a **label**.

- **Tier 0 — content.** JSON, schema-validated, cannot execute. Safe from
  anywhere.
- **Tier 1 — client code.** Runs in the player's browser with the player's own
  API access. Cannot reach credentials directly. Trust on install.
- **Tier 2 — server code.** Python in the FastAPI process, holding credentials,
  writing to the profile DB. **The same trust level as a `docker-compose.yml`
  from a stranger** — a bar every self-hoster already understands. Install by
  explicit URL with review. Never one-click.

The tier is displayed wherever a plugin is displayed.

## 3. The audit — what exists today

Walked 2026-08-04 against v0.36.1.

### 3a. Correction to `ROADMAP.md` §1: the type-scale work is done

`ROADMAP.md` records font packs as blocked on moving the scale out of "~128
hardcoded `font-size` declarations" into custom properties.

Measured today: **144 `font-size` declarations in `static/style.css`, all 144
through `var()`, zero hardcoded px, and zero inline `font-size` in any JS
file.** The full token set is in `style.css:45` (`--font-fine|body|title|form|
display`, `--type-fine|body|title|form`, and four display sizes).

**Font packs and theme packs are now among the cheapest harnesses on the board,
not the most expensive.** Plan accordingly.

### 3b. Already plugin-shaped — no rewrite needed

- `static/js/ui.js:4` — `SCREENS` is a real registry; screens self-register.
- `static/js/art.js:27` — `PORTRAIT_ART`/`BUILDING_ART` already do
  additive-with-fallback: an NPC with no art falls back to a char-map sprite.
  That is exactly the semantic a plugin asset needs.
- `app/programs.py` — built-in `PROGRAMS` resolved beside kv-stored custom
  routines through one path. The content contract is half-built already.
- `activities.source` exists and is populated on every row.
- `app/counsel_options.py:17` — `OptionDraft` is a clean `NamedTuple` value
  type, which is what makes a `council-rule` harness nearly free.
- `db.log_event` is a working append-only event ledger — the basis of any
  future event bus.
- `app/db.py:189` — migration machinery is mature: marker-keyed,
  snapshot-before-migrate, additive, with a documented collision invariant.
- `app/vault.py` globs `*.db`, so new profile databases are snapshotted with no
  change.

### 3c. The deep coupling — provider identity is hardcoded in SQL

Three queries filter on the literal string `source='intervals.icu'`:

- `app/counsel_context.py:58` — **the qualified snapshot's activity query**
- `app/quests.py:684` — quest completion matching
- `app/quests.py:951` — the unguided bonus

The first is the whole problem. **A provider plugin could sync perfectly and be
invisible to every Council recommendation, every quest completion and every
bonus** — silently, with no error, the rows sitting in the table unseen.

This must become a set of trusted sources (or a `source_kind` column) before any
provider harness is credible. It is also the strongest argument for treating
capability honesty and the provider harness as one piece of work rather than
two.

Related and equally structural: **`intervals.add_manual_activity`
(`app/intervals.py:239`) is the generic activity writer wearing a provider's
name.** Its callers are `app/main.py:460`, `:626`, `:670`, `app/quests.py:771`
and `:854` — honor completions, manual logs and dev routes, none of which have
anything to do with intervals.icu. It has to move to a provider-neutral
`app/activities.py`, or every plugin that wants to write an activity will
`import intervals`.

### 3d. Contained refactors

- **`wellness` has fixed columns** (`app/db.py` `SCHEMA`). See §2f — the
  superset-versus-`extras` decision is load-bearing for providers and charts
  both.
- **`for_giver` dispatch is a dict literal inside a function.**
  `app/counsel_candidates.py:199` defines it; `:207` is the `builder = {...}`
  keyed on `game.GIVER_ARCHETYPES[giver]["archetype"]`. Turning that into a
  registry is roughly twenty lines and unlocks the highest-value harness in the
  app.
- **`app/game.py` is a constants monolith.** `GIVER_ARCHETYPES` (`:57`),
  `CATEGORIES`, `RUN_TYPES`, `CLAIM_TYPES`, `AMBITION`, `COUNSEL_FOCUSES`,
  `COUNSEL_FOCUS_GIVERS`, `COUNSEL_SCHEDULE_TIERS` — imported by a dozen
  modules. These are not inert: `ROADMAP.md` already documents that
  `GIVER_ARCHETYPES[...]["modalities"]` *is* the equipment ownership model, so
  adding a giver or a modality is a cross-cutting edit today.
- **Settings is flat with a hardcoded whitelist.** `app/main.py:293` accepts
  exactly `("ambition", "units", "weight_unit", "intervals_athlete_id",
  "dev_mode")`; defaults are per-key `setdefault` calls in
  `app/game.py:338`. **A plugin cannot add a setting.** Needs namespacing plus a
  descriptor registry.
- **Town layout is three hardcoded rows** — `static/js/town.js:177`, `:183`,
  `:190`.
- **`static/index.html` has fourteen hand-versioned script tags.** Plugin
  scripts cannot be added without a manifest endpoint that `app.js` reads at
  boot and injects from, using per-plugin content hashes. This also solves
  plugin cache-busting correctly and permanently, which the hand-bumped `?v=N`
  rule cannot do.
- **Fifty-seven routes, all module-level decorators** in `app/main.py`. Plugin
  routes need router inclusion plus `/api/plugins/<id>/...` namespacing.

### 3e. Cross-cutting jobs

- **No currency chokepoint exists.** Fourteen direct mutation sites:
  `app/colosseum.py:157`, `app/dungeon.py:232` and `:610`, `app/road.py:146-147`,
  `app/raid.py:344`, `app/quests.py:803`, `:806`, `:850`, `:1047`, `:1050`,
  `app/main.py:598` and `:601`. Only `app/game.py:374` (`apply_xp`) is a
  function. **§2g restriction 1 cannot be enforced until a single `game.grant()`
  path exists.** Worth doing regardless — it is also where the ledger entry
  belongs.
- **The frontend is one flat namespace.** Roughly 123 `G.*` assignments across
  fourteen files, plus about sixty top-level `const` catalogs, no module system,
  load-order dependent. This is what makes §2d's registration idiom mandatory
  rather than stylistic.
- **Voice is embedded in code — roughly thirty catalogs.** `GREETINGS`,
  `REACTIONS`, `CONGRATS`, `RETIRED_GIVER_LINES`, `DEED_BUBBLES`, the six
  `*_FLAVOR` tables, `DEED_NOTES`, `REST_WRIT_BLURBS`,
  `UNGUIDED_TITLE_FLAVOR`, `ALMANAC_CAT_PROSE`, `BOSS_FIRST`/`BOSS_EPITHET`,
  `DESC_ORIGIN`/`TRAIT`/`THREAT`, `SYL_A`/`SYL_B`, `PERSONALITIES`,
  `LANDMARKS`, `BEYOND_*`. Dialogue packs and `locale` need this extracted. It
  is purely mechanical, large, and **a prerequisite for nothing else** — so it
  can wait indefinitely.
- **`app/vault.py:26` — `SHARED_JSON` is a three-tuple.** Plugin realm-state
  files would not be snapshotted. A two-line fix, but it is the rollback path.

### 3f. Test and infrastructure implications

Thirty-one test files: twenty-six Python and five MJS. `tests/smoke.py` (248
checks) is the regression bar for every refactor above; identical green is the
acceptance criterion, per `AGENTS.md`.

Three specific hazards:

- **Browser tests share one server and one `DATA_DIR`**, so plugin fixtures need
  explicit isolation or they leak across tests — the exact failure mode
  `AGENTS.md` already warns about under "every test must stand alone."
- **Once plugins can load, "default state" changes meaning for every existing
  test.** The loader needs a hard off switch the suites set.
- `tests/test_giver_archetypes.py` and `tests/test_bram_stale_literals.py` pin
  the current giver model; the `game.py` decomposition touches both.

## 4. Dependency order

This reorders `ROADMAP.md` §1's "do not start with the registry" advice without
contradicting its reasoning. That advice was right that the capability inventory
can only be produced by walking the code — §3 is that walk. What it could not
know is that two extractions block nearly everything else.

**Must happen before anything is designed around them:**

1. **`app/activities.py` extraction plus a trusted-source set** (§3c) — unblocks
   every provider, and fixes a silent-invisibility bug class in the process.
2. **A single `game.grant()` chokepoint** (§3e) — makes §2g enforceable at all.

**Then, in any order that suits the appetite:**

3. The wellness column decision (§2f) — unblocks providers and charts.
4. A settings descriptor registry (§3d) — unblocks any plugin with
   configuration.
5. The manifest endpoint plus `PLUGINS.register()` (§2d, §3d) — unblocks every
   frontend harness.
6. The `for_giver` registry (§3d) — cheap, high value; a good early win.
7. The `game.py` decomposition (§3d) — largest, most deferrable.

Everything not on this list is genuinely additive and can be built whenever
someone wants it.

**The first shippable step is still not a plugin system.** It is the inert
spine: discovery, manifest validation, `api_version` checking, an `/api/plugins`
status endpoint, and fixture-based tests including a malformed manifest and a
future-versioned one. Zero player-visible change, identical smoke green. That is
the whole irreversible surface, and it is small.

## 5. Non-goals

- **Not a marketplace, and still not called one.** `ROADMAP.md` §1's reasoning
  stands unchanged. When an index exists it is a JSON file in a GitHub repo —
  id, URL, version, type, tier, hash — with contribution by pull request. No
  accounts, no hosting, no moderation queue, no uptime obligation.
- **Do not modularize everything.** The one deliberate exception to
  `ROADMAP.md`'s version of this rule: **core should ship at least one whole
  subsystem through a harness**, because a seam only stays real if breaking it
  breaks the game. The Undercroft is the natural candidate — its entire contract
  is already three lines of prose (consumes `ENTER_COST` vigor, banks
  `loot_gold` on retire, nothing material leaves).
- **No sandbox.** See §2i. Labels, not walls.
- **No sanctioned-subset plugin API.** See §1b.
- **This is a game.** It does not diagnose, predict injury, prove its advice, or
  stand in for a professional — and neither does anything a plugin adds. A
  harness that sounds like an integration platform will attract audit trails and
  tamper-evidence nobody asked for. Say the non-goal out loud in every brief.

## 6. The acceptance test

**A stranger ships a working plugin from the documentation alone, without asking
a single question.**

If that happens once, the harness is real. If it never happens, no number of
extension points made it real.

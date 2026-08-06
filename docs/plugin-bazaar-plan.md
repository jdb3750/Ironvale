# The Plugin Bazaar — an end-to-end plan

**Status: for review. Nothing in this document is approved to build.** Every
phase below needs its own explicit go-ahead, built one seam at a time, verified,
reported, and stopped — the same discipline `AGENTS.md` requires of everything
else. This document extends `PLUGINS.md`, which remains the layer of record for
the Phase 0 decisions (disk layout, manifest, `api_version`, type vocabulary,
registration, namespacing, restrictions, trust tiers). Where this plan diverges
from `PLUGINS.md`, the divergence is stated explicitly in §2 — nothing is
contradicted silently.

What this document adds that `PLUGINS.md` deliberately withheld: the idealistic
end state. `PLUGINS.md` is the audit and the spine; this is what the ecosystem
looks like when the spine is load-bearing and the leaves have grown — how a
ware gets written, packaged, discovered, installed, updated, and retired, and
what the player sees at every step. The organizing principle throughout is
**deep customizability**: every layer of the game a player might want to make
their own should have a rung they can reach, from recoloring the town to
replacing a subsystem, and each rung should be zero-config to start.

One framing sentence to keep in view the whole way down, from `PLUGINS.md` §0:
the value is the harness, not the plugins. Iron Vale has one player today. The
bazaar is not a bet on a crowd arriving; it is the shape the game's own
extensibility takes so that when a second author appears — Joe in six months, a
friend, a stranger — the pathway already flows. And it is a game. It does not
diagnose, predict injury, prove its advice, or stand in for a professional, and
neither does anything a ware adds. No audit trails, no disclaimers, no consent
flows, no tamper-evidence — a harness that sounds like an integration platform
attracts all four, and this one must not.

---

## 1. The vision, walked once end to end

A player opens the town and finds a new corner of it: the Bazaar, a market
screen in the same pixel register as everything else. Stalls line the square,
one per kind of ware — the Dyer's Tent hung with cloth swatches (themes), the
Scrivener's Stall stacked with bound doctrines (program packs), the Tinker's
Bench of oddities (behavior plugins), the Bellmaker's Cart of chimes and bells
(sound kits). Browsing costs nothing and executes nothing: every stall
renders from manifest metadata alone. A ware's page shows what it is, who made it, what it
asks of the player in plain language, and a single action. When a new version
of an installed ware appears in the index, a raven brings word, the same way
ravens already carry sync news.

Behind that screen there is almost nothing: a JSON index file in a public
GitHub repository, one entry per ware pointing at an author's repo and its
releases; a small client in the game that fetches the index, compares versions,
and downloads release assets into `data/plugins/<id>/`; and the loader
`PLUGINS.md` §4 already specifies. No accounts, no server, no moderation queue,
no uptime obligation. GitHub is the CDN, the index is a phone book, and the
game is the storefront.

Authoring is the other half of the vision. A non-programmer copies a JSON file,
edits color hex codes, and has a theme. A tinkerer copies the template repo,
runs one scaffold command, and has a loading, registered, do-nothing plugin
with a green smoke run against a scratch `DATA_DIR`. A stranger reads the docs
and ships a working ware without asking a single question — `PLUGINS.md` §6's
acceptance test, unchanged, and still the bar this entire plan is measured
against.

## 2. Divergences from PLUGINS.md, stated out loud

This plan keeps every Phase 0 decision: `data/plugins/<id>/` layout (§2a),
mandatory `api_version` and untrusted manifests (§2b), the reserved type
vocabulary (§2c), collision-checked `PLUGINS.register()` (§2d), kv-only state
under `plugin:<id>:*` (§2e), the capability field vocabulary (§2f), the
start-restrictive restrictions (§2g), break-loudly versioning (§2h), and
labeled trust tiers with no sandbox (§2i). Three points diverge deliberately:

**The index gets a face and a name.** `PLUGINS.md` §5 says "not a marketplace,
and still not called one," and its reasoning — no accounts, no hosting, no
moderation queue, no uptime obligation — stands untouched here; the mechanism
is exactly the JSON-file-in-a-repo it describes. The divergence is
presentational: this plan gives the index an in-game screen and an in-world
identity (the Bazaar) rather than leaving it a settings page. The rationale is
the customizability principle itself: discovery is part of the player
experience, and a market square in the game world keeps the whole thing a game
rather than a store bolted onto one. If "bazaar" still smells too much like
"marketplace," the fallback is the same screen under a humbler sign — a
peddler's cart that visits the square — but the screen should exist.

**CSS snippets get a rung.** §2g restriction 3 says no CSS injection — themes
set declared tokens, never ship stylesheets. This plan keeps that rule for
everything distributed through the Bazaar, and adds one thing beneath it: a
local snippets folder (`data/snippets/*.css`), toggleable per file in settings,
off by default, never indexed, never distributed. The ecosystem research is
unambiguous that Obsidian's snippet tier is the single cheapest on-ramp to
customization that exists anywhere, and it is where theme authors are born. The
restriction's purpose — the host owns chrome, wares cannot wreck the aesthetic
for other players of the ware — is preserved, because snippets are personal
tinkering on the player's own box, not wares. A snippet that breaks layout
breaks it for the person who wrote it, who can toggle it off.

**"Content pack" names a trust tier, not a type.** §2c's type table is kept
verbatim — `theme`, `font`, and `sfx` stay top-level reserved types, and
reserved-but-unbuilt types still load and report rather than crash. What this
plan adds is a grouping across that table: "content pack" (§5a) means any
tier-0, data-only ware, whatever its declared type — a `theme` token map, a
`font` pack, an `sfx` parameter set, or `content` proper (program doctrines,
item cosmetics, title packs, market stall inventories). The divergence is
that the Bazaar and this plan organize by that trust boundary, while the type
vocabulary itself is untouched.

## 3. Prerequisites: two extractions before anything else

`PLUGINS.md` §4 orders these first and the architecture map confirms both are
still open. They are not plugin work; they are debts the plugin system would
otherwise inherit as load-bearing bugs, and each is worth doing on its own
merits.

**The provider-neutral activities module.** Three queries filter on the literal
string `source='intervals.icu'`: the Council's qualified snapshot at
`app/counsel_context.py:58`, honor-completion reconciliation at
`app/quests.py:706`, and the unguided bonus at `app/quests.py:973`. The first
is the whole problem: a second provider could sync flawlessly and be invisible
to every Council recommendation, every quest completion, and every bonus —
silently, rows sitting in the table unseen. Related and equally structural,
`intervals.add_manual_activity` (`app/intervals.py:255`) is the generic
activity writer wearing one provider's name; its callers — `app/main.py:460`,
`:626`, `:670` and `app/quests.py:793`, `:876` — are honor completions, manual
logs, and dev routes, none of which have anything to do with intervals.icu. The
extraction: a provider-neutral `app/activities.py` owning the writer and a
trusted-source set (or `source_kind` column) that those three queries consult,
so "counts toward the game" is a property a source declares rather than a
string three files happen to agree on.

**The `game.grant()` chokepoint.** Fourteen sites mutate currency directly —
`app/colosseum.py:154` and `:157`, `app/dungeon.py:232` and `:610`,
`app/road.py:155-156`, `app/raid.py:344`, five sites in `app/quests.py`
(`:825`, `:828`, `:872`, `:1070`, `:1073`), and the dev grants at
`app/main.py:598` and `:601`. Only
`apply_xp` (`app/game.py:379`) is a function. §2g restriction 1 — no minting —
is currently unenforceable because there is nothing to enforce it at. A single
`game.grant()` that every one of those sites routes through is where the
restriction lives, where the ledger entry belongs, and incidentally where any
future economy tuning gets a single dial. Until it exists, "plugins may not
mint currency" is a sentence, not a property.

Both refactors are behavior-preserving and land against the existing
regression bar: `tests/smoke.py` green before and after, identical.

## 4. Packaging: a ware is a directory

Kept exactly as `PLUGINS.md` §2a-b specifies, because the research validates
it from three independent directions. Obsidian's runtime format is a folder in
the vault containing `manifest.json` plus plain JS and CSS — the app never
builds anything, which is precisely the property a no-build host needs.
Factorio's `info.json` proves a small manifest with a host-version field and a
dependency list carries a ten-thousand-mod ecosystem. WebExtensions prove that
manifest-plus-plain-files needs no toolchain at all.

So: `data/plugins/<id>/` inside the Docker volume, beside the live save.
Plugins are player data — never committed to the repo, never touched by a
merge to `main`, covered by the Vault's snapshots once `vault.SHARED_JSON`
(`app/vault.py:26`) learns about them (see §10, phase 1). This is also the
answer to the deployment question: **`main` auto-deploys to production every
fifteen minutes with no human step, and plugin code living in the data volume
means the plugin ecosystem adds zero risk to that pipeline.** A broken ware
cannot make a merge more dangerous, because no ware is ever in a merge.

Inside a ware:

```
data/plugins/<id>/
  plugin.json      manifest: id, name, version, api_version, tier, types,
                   requires, author, source, permissions
  content/*.json   declarative data, schema-validated by the host
  static/          browser JS/CSS/art, served under /plugins/<id>/
  server/          Python, tier 2 only
```

The manifest is untrusted input in the `AGENTS.md` sense: malformed fields,
unknown types, future `api_version` values all degrade to a disabled ware with
a named reason, never an exception, because `/api/state` must never fail to
boot the game (`app/main.py:166-207` is the boot endpoint and its
never-400 rule is already doctrine). The one addition this plan makes to the
§2b manifest sketch is a `permissions` list of plain declarative strings —
`"network"`, `"reads:wellness"`, `"routes"` — borrowed from WebExtensions'
install-time disclosure. The research's honest finding is that these strings
are surfaced, not enforced, at tiers 1 and 2; they are still worth having
because the Bazaar's ware pages render them to the player before install, and
because a declared-but-unused permission is a review smell a human can catch
in the index PR.

## 5. Two tiers of ware, Factorio-shaped

Factorio's deepest structural idea is the data-stage/control-stage split:
content mods build a declarative prototype database and never touch runtime
code; behavior mods handle events against an API. Minecraft arrived at the
same split from the other direction — official datapacks (pure JSON, sandboxed
by construction, survive game updates) beside unofficial code mods (break
every release). The lesson is that the two kinds of author barely overlap, and
serving the first kind well costs almost nothing.

### 5a. Content packs — pure data, zero trust

A content pack is `plugin.json` plus `content/*.json` plus optional art under
`static/`. No code. The host schema-validates every file, merges what
validates, and disables the pack with a named reason when something does not.
Because a content pack cannot execute, it is installable from anywhere with no
trust ceremony — tier 0 in `PLUGINS.md` §2i's labels, and the tier where most
wares should live. What content packs can carry, in rough order of how much
harness each needs:

- **Themes** — a JSON map of the `:root` design tokens (`static/style.css:45`:
  colors, edges, panel tones). The host applies tokens; no stylesheet ships.
- **Font packs** — family plus scale as one unit, over the completed token
  work (`PLUGINS.md` §3a: all 144 `font-size` declarations already route
  through `var()`, zero hardcoded px). Among the cheapest harnesses.
- **Sound kits** — parameter sets for the WebAudio synths in
  `static/js/audio.js`, which already builds every sound from oscillator
  parameters rather than files. A sound kit is numbers, not audio.
- **Program doctrines** — new training programs beside the built-in `PROGRAMS`
  dict (`app/programs.py:12`), riding the same resolution path kv-stored
  custom routines already use (`schedule_routine_keys`, `programs.py:63`).
  The declarative contract is half-built today.
- **Title packs, cosmetics, stall inventories** — additions to the catalog
  dicts in `app/items.py`, namespaced `plugin-id:thing` Factorio-style so
  removal orphans cleanly instead of colliding.
- **Sprite and art packs** — entries for the additive-with-fallback manifests
  (`static/js/art.js:27`), which already express exactly the semantic a plugin
  asset needs: PNG if present, char-map sprite if not.
- **Quest and dialogue packs** — the end state, gated on the voice-catalog
  extraction `PLUGINS.md` §3e sizes as large, mechanical, and a prerequisite
  for nothing else. Deferred accordingly.

Content packs are where the deep-customizability principle earns its keep:
they are authorable by someone who has never programmed, they cannot break the
game (validation rejects, never crashes), and they survive API-version bumps
far better than code, exactly as Minecraft datapacks survive updates that
kill code mods.

### 5b. Behavior plugins — code, trusted on install

Tier 1 is client JavaScript: files under `static/`, loaded by the boot
manifest (§7), registering through `PLUGINS.register()` against the same
registries core uses — a new screen in `SCREENS` (`static/js/ui.js:4`), a
chart, eventually a town building. Tier 2 is server Python: a `server/`
package exposing an `APIRouter` the host mounts under `/api/plugins/<id>/`,
riding the one router-inclusion pattern that already exists —
`app.include_router(lifts.router)` at `app/main.py:16`, with
`lifts.router = APIRouter(prefix="/api")` at `app/lifts.py:13` as the model.
Tier 2 is where providers, council rules, and minigames live, because that is
where the data and the clock live.

Both tiers write against internal interfaces, not a sanctioned subset —
`PLUGINS.md` §1b's decision, kept. A good ware is already a patch, which is
what makes upstreaming a real pathway instead of a principle. The price is the
§2h breakage policy, also kept: pre-1.0 the API moves, wares pin
`api_version`, incompatible wares disable loudly with a named reason, and the
changelog says what moved. Obsidian froze its API and spent a decade serving
compatibility; for an audience of dozens on an auto-deploying `main`, "we will
break you, here is exactly how" is the only honest offer.

### 5c. Why there is no sandbox, in one paragraph

Figma is the cautionary tale the research documents in detail: iframes were
too slow for document access, a Realms-shim sandbox on the main thread was
built and then partially walked back after security researchers broke it, and
the shipped design costs every plugin an async postMessage marshalling layer
between its logic and its UI. That price bought something Figma needs —
untrusted code in a multi-tenant SaaS touching shared documents — and Iron
Vale does not have that problem. The threat model here is Obsidian's and
Factorio's and Home Assistant's: a player installing code on their own
machine, which they already do every time they pull a Docker image. All three
of those ecosystems ship no sandbox, say so plainly, and thrive. What replaces
the sandbox is the label (§2i's tiers, displayed wherever a ware is
displayed), the disclosure (manifest permissions on the ware's page), the
default (installed wares start disabled, Obsidian-style), and — the one real
boundary — the restrictions a small API surface can actually enforce
server-side once `game.grant()` exists: Factorio's "sandbox via small API
rather than via VM," the cheapest effective trick in the whole survey.

## 6. Contribution points: what the host renders without running ware code

VS Code's `contributes` block is the pattern: the manifest declares what a
plugin adds, and the host renders menus, settings pages, and UI slots from
that JSON alone — plugin code runs only when invoked. This is what lets the
Bazaar browse a thousand wares without executing one, and it is what makes a
disabled ware legible: the town shows the shuttered stall, not a blank hole.
Iron Vale's contribution points, each mapped to the seam that hosts it:

- **Screens** — a manifest entry naming the screen key; the JS registers the
  implementation into `SCREENS` via `PLUGINS.register()`. The registry at
  `ui.js:4` already works this way for core; the harness is collision
  checking plus the manifest declaration.
- **Council option givers** — `(QualifiedContext) -> [OptionDraft]` against
  the clean value type at `app/counsel_options.py:17`. The dispatch point is
  the dict literal inside `for_giver` (`app/counsel_candidates.py:199`, the
  `builder = {...}` at `:207`) — the architecture map sizes the registry
  refactor at roughly twenty lines, unlocking the highest-value harness in
  the app. Council-rule wares must consume only the qualified snapshot; the
  One-Snapshot invariant binds them exactly as it binds core.
- **Sprites and art** — manifest-declared additions to `PORTRAIT_ART` /
  `BUILDING_ART` (`art.js:27`) and `SPRITES` (`pixel.js`), with the existing
  fallback semantic; registration replaces today's direct assignment.
- **Program templates** — content-pack doctrines resolved beside custom
  routines through the one existing path (`programs.py:63`).
- **Settings** — the descriptor registry `PLUGINS.md` §3d calls for,
  replacing the hardcoded five-key whitelist at `app/main.py:293`. VS Code
  and Raycast both auto-generate settings UI from a declared schema; Iron
  Vale does the same into the existing settings screen, namespaced per ware.
- **Theme and font tokens** — declared token maps over `style.css:45`.
- **Town slots** — deferred: the square is three hardcoded rows
  (`static/js/town.js:177-190`) and earns its registry only when a ware
  actually wants a building. Reserved in the vocabulary, unbuilt.

The rule that holds the set together, from `PLUGINS.md` §1a: once the spine
exists, adding a new contribution point must never require touching the spine.
Each point above is a leaf; if one demands a spine change, the spine is wrong
and gets fixed while breaking things is still free.

## 7. Boot and loading

The frontend today is fourteen hand-versioned script tags in
`static/index.html`, cache-busted by a `?v=N` that `AGENTS.md` safety rule 4
requires bumping on every JS/CSS change. That scheme cannot serve ware scripts
— a player installing a ware must not edit `index.html`, and hand-bumping
cannot version files the repo has never seen. The replacement, per
`PLUGINS.md` §3d: a boot manifest endpoint. `app.js` fetches
`/api/plugins/boot` early in `boot()` (`app.js:1099`), receives the list of
enabled wares' scripts and stylesheets each carrying a per-file content hash
(`/plugins/<id>/main.js?h=<sha256-prefix>`), and injects tags in declared
order. Content hashes solve ware cache-busting correctly and permanently — a
changed file is a changed URL — and the same mechanism can eventually retire
the hand-bumped `?v=N` for core assets too, though that migration is its own
decision and not part of this plan.

Ware scripts land in the same flat global namespace as everything else —
roughly 123 `G.*` assignments across fourteen files is the standing hazard —
which is why `PLUGINS.register()` is mandatory rather than stylistic: never
direct assignment to `G.*`, `SCREENS`, or `SPRITES`; every registration
collision-checked and refused loudly by name, on both the JS and Python sides.
The Obsidian lesson worth copying alongside it is the auto-cleanup lifecycle:
everything registered through the plugin handle is torn down when the ware is
disabled, so disable-enable works without a restart and no ware needs to write
teardown code to be a good citizen.

Two operational requirements. First, from `PLUGINS.md` §3f: the loader has a
hard off-switch (an env var the test suites set), because once wares can
load, "default state" changes meaning for every existing test — the browser
suite shares one server and one `DATA_DIR`, and ware fixtures must not leak
across tests. Second, from `PLUGINS.md` §2b: a ware directory must never stop
the game loading —
discovery failures, manifest failures, and load failures all degrade to a
disabled ware with a named reason surfaced in `/api/plugins` and in the
Bazaar's own stall.

## 8. The Bazaar: distribution with zero infrastructure

### 8a. The index

One public GitHub repository holds the catalog: a single JSON file (or one
small JSON file per ware, which diffs better in PRs), each entry carrying id,
name, author, description, types, tier, declared permissions, source repo URL,
and minimum `api_version`. Listing is a pull request; the release artifacts
live in the author's own repo as GitHub Releases whose tag matches the
manifest version. This is Obsidian's `community-plugins.json` and HACS's
default catalog, the twice-proven pattern for exactly this situation: a FOSS
self-hosted app with no budget and no server. GitHub is the CDN; the index is
a phone book; there is nothing to keep up.

The in-game client fetches the index and release metadata with the discipline
HACS learned the hard way: cache aggressively, use conditional requests and
`raw.githubusercontent.com`, back off on rate limits, and treat index
unavailability as "the market is quiet today," never as an error that touches
the game loop. Install downloads release assets into `data/plugins/<id>/`;
update compares release tags against installed versions; uninstall removes the
directory, prompts about the kv namespace, and logs the removal to the ledger
(`db.log_event`, `app/db.py:360`) like any other mutation.

The escape hatch is BRAT's: install-from-URL. A player pastes any GitHub repo
URL and the client installs from its releases directly, no index listing
required — beta wares, private wares, one-off personal wares. Tiered trust
falls out naturally: the curated index for the cautious, the raw URL for the
brave, and the tier label displayed identically in both paths. Tier 2 wares
are never one-click from either path — explicit URL, explicit confirmation,
the docker-compose-from-a-stranger bar §2i sets.

### 8b. The market screen

Player-facing, therefore in-world, end to end. The Bazaar is a screen reached
from the town — stalls grouped by ware type, browsable while offline from the
cached index. Copy in the register the game already speaks:

- The screen: **"The Bazaar"** — "Traders from beyond the Vale spread their
  wares."
- A stall: one ware type — "The Dyer's Tent" (themes), "The Scrivener's
  Stall" (doctrines and programs), "The Tinker's Bench" (behavior wares),
  "The Bellmaker's Cart" (sound kits).
- A ware's page: name, author ("crafted by"), description, tier shown as
  plain speech — tier 0: "Cloth and ink. This ware cannot act on its own.";
  tier 1: "A charm. It will act within your hall, with your leave."; tier 2:
  "A hired hand. It will work your ledgers and speak with the ravens. Take
  only from traders you trust."
- Permissions, rendered before install: "This ware asks to: read your
  wellness ledger; send ravens beyond the Vale" — WebExtensions' honest
  human-readable strings, in the Vale's voice.
- Install: "Take it home." Installed-but-disabled: "Stored in your pack."
  Enable: "Set it out." Disable: "Pack it away." Uninstall: "Return the
  ware" — with "its ledger entries will be struck from the record" when the
  player elects to clear the kv namespace.
- An incompatible or broken ware: "This ware was made for another season of
  the Vale. The trader must mend it." — the §2h break-loudly rule, worn as
  copy. Never a silent absence.

Everything on this screen renders from manifests and the index — no ware code
executes at browse time, which is what makes browsing safe at every tier and
is the direct payoff of §6's declarative contribution points.

### 8c. Ravens carry word

Sync already speaks through ravens ("The ravens returned: N new deeds",
`app/intervals.py:234`; failures are "the ravens were lost"). Ware updates
join the same postal service: the background loop's index refresh compares
release tags, and when an installed ware has a newer compatible release, the
raven's news includes "A raven brings word of new wares at the Bazaar."
Updating remains a deliberate act on the ware's page — no silent auto-update,
because tier 1 and 2 wares are trusted per version, and because a player whose
game changed overnight without their hand on it has lost something this game
cares about. A ware whose new release requires a newer `api_version` than the
running game shows as "made for a coming season" rather than updating into a
loud disable.

### 8d. The ladder of deep customizability

The principle, made concrete as rungs, each zero-config to start and each a
natural step to the next:

1. **A CSS snippet** — one file in `data/snippets/`, toggled in settings.
   One file, no manifest, personal only (§2's second divergence).
2. **A theme or font pack** — the snippet author graduates: the same taste,
   expressed as a token map with a manifest, now shareable through the index.
3. **A content pack** — JSON that adds things: a doctrine, a title pack, a
   stall inventory, a sprite set. Still no code, still tier 0.
4. **A behavior ware** — JS against the registries, then Python behind
   `/api/plugins/<id>/`. The full harness.

Obsidian's ecosystem demonstrates that the bottom rungs feed the top: theme
authors become plugin authors because the first rung asks so little. The
ladder is also the honest scope statement — most players who customize will
never leave rungs 1-3, and the system should be excellent there even if rung 4
stays sparsely populated for years.

## 9. Community mechanics — idealistic, and honest about scale

Iron Vale has one player. The mechanics below are chosen because they cost
almost nothing to stand up, degrade gracefully to an audience of one, and are
exactly what the proven small-ecosystem playbooks (Obsidian's catalog, HACS's
checks, Factorio's migrations) run at scale — so nothing needs redesigning if
an audience arrives.

**Review is a pull request.** Listing in the index means a PR against the
index repo; CI validates the manifest schema, checks the release exists and
its tag matches the version, and lints the entry; a human — Joe — skims the
source, since listed wares are open source by requirement, as Obsidian and
Raycast both mandate. The monorepo-review and signing-infrastructure patterns
from the research are explicitly rejected: both solve scale and identity
problems this ecosystem does not have, and each demands operational effort a
side project cannot sustain.

**The template repo and the scaffold.** A `plugin-template` repository holding
a working tier 1 ware — manifest, one registered screen, one setting, a
release workflow — plus a `plugin new` scaffold (a small script in the
template, not the game) that stamps id and author into a fresh copy. Raycast's
lesson is that authoring DX is the growth engine of an ecosystem, not an
afterthought; this is the smallest version of that investment.

**The smoke harness.** Ware authors get the same regression net core enjoys: a
documented recipe for running the game against a scratch `DATA_DIR` with their
ware installed, plus a fixture helper the test suite itself uses (a ware
directory built in a temp `DATA_DIR`, exercised through `TestClient`). The
existing scratch-dir discipline (`tests/smoke.py` builds and deletes its own,
never touching live data) extends unchanged; the loader off-switch (§7) keeps
ware fixtures out of every suite that did not ask for them.

**Save compatibility discipline.** Factorio takes this most seriously of
anyone surveyed and the transferable subset is small: ware-created IDs are
namespaced (`plugin-id:thing`) so nothing collides; the profile DB records
which wares have touched it (a kv entry per ware, version-stamped); a removed
ware's kv state and namespaced catalog entries are orphaned or quarantined,
never deleted without the player's word; and a ware that changes its own data
shape ships a migration keyed the way core already keys them — the
marker-and-snapshot idiom at `app/db.py:189-253` is the model, and Vault
snapshots before migration are already the rollback path.

## 10. The roadmap, seam by seam

Ordered by dependency, shipped one seam at a time, each verified and stopped
before the next begins. Every phase names what a player observes when it lands
and what it deliberately excludes. No time estimates — seams land when they
land.

**Phase 0 — the two extractions (§3).** `app/activities.py` with a
trusted-source set; `game.grant()` swallowing all fourteen mutation sites.
Player observes: nothing. Smoke identical before and after. Excludes: any
plugin-named code at all — these are refactors the codebase deserves
regardless.

**Phase 1 — the inert spine.** Exactly `PLUGINS.md` §4's first shippable
step: discovery of `data/plugins/`, manifest validation, `api_version`
checking, the `/api/plugins` status endpoint, the loader off-switch,
fixture-based tests including a malformed manifest and a future-versioned one.
Plus the two-line `vault.SHARED_JSON` fix so ware realm files snapshot. Player
observes: nothing — zero visible change, identical smoke green. Excludes:
loading any ware code or content; the spine ships inert and proves itself
harmless first.

**Phase 2 — content packs and the token wares.** Schema validation and merge
for the cheap tier-0 types: themes, font packs, sound kits, program
doctrines, title packs; the local snippets folder. Player observes: drop a
theme folder into `data/plugins/`, restart nothing, see the Vale in new
colors; a new doctrine appears beside Starting Strength. Excludes: any
executing ware code; any distribution — packs arrive by hand-copying a folder,
which is enough to prove the tier.

**Phase 3 — the boot manifest and tier 1.** The `/api/plugins/boot` endpoint
with per-file content hashes, injection in `boot()`, `PLUGINS.register()` on
both sides with collision refusal, the auto-cleanup lifecycle, and the first
two frontend harnesses: `screen` and sprite/art registration. Player
observes: a ware can add a whole new screen to the Vale, reached like any
other. Excludes: server-side ware code; settings; town slots.

**Phase 4 — tier 2 and the deep harnesses.** Namespaced ware routers under
`/api/plugins/<id>/` via the `lifts.router` pattern; the settings descriptor
registry replacing the `main.py:293` whitelist; the `for_giver` registry and
with it the `council-rule` harness; the wellness-column decision (§2f's open
superset-versus-extras question must be settled here at the latest) and then
the `provider` harness over Phase 0's trusted-source set. Player observes: a
ware can bring a new counselor's voice to the Council, a new data source's
deeds to the ledger, its own page to settings. Excludes: minigame and
town-slot harnesses; locale; anything requiring the voice-catalog extraction.

**Phase 5 — the Bazaar.** The index repo with CI checks; the in-game client
(index fetch, install, update, uninstall, tier and permission display); the
market screen with its stalls; ravens carrying update word; install-from-URL.
Player observes: the Bazaar opens in the town — browse, take a ware home, set
it out, and later a raven brings word of new wares. Excludes: ratings,
download counts, accounts, auto-update, any server-side anything.

**Phase 6 — community tooling.** The template repo, the `plugin new`
scaffold, the ware author's smoke recipe and fixture helper, authoring docs
written against `PLUGINS.md` §6's bar. Player observes: nothing in-game; a
would-be author observes that the path from idea to installed ware is a
short sitting. Excludes: everything until someone other than Joe wants it —
this phase exists to be ready, not to be busy.

Deliberately unscheduled: the voice-catalog extraction (large, mechanical,
prerequisite for nothing — `PLUGINS.md` §3e says it can wait indefinitely,
and dialogue packs and `locale` wait with it), the `game.py` decomposition
(largest, most deferrable), town slots, minigames, and the question of
shipping the Undercroft through its own harness (§11).

## 11. Open questions for Joe

**The tier 2 trust boundary on a box that auto-pulls production.** A tier 2
ware is Python in the FastAPI process, on the same machine that holds real
credentials and auto-deploys `main` every fifteen minutes. §2i's
docker-compose-from-a-stranger framing is honest, but is it enough for this
particular box, or should tier 2 initially be personal-authorship only —
installable, but never listed in the index until the project has a second
maintainer or the server topology changes? The plan works either way; the
index CI can enforce whichever answer you pick.

**Index visibility before FOSS.** Iron Vale's repo is private today. Does the
index repo launch private alongside it (wares by and for you and friends,
same GitHub auth the game already uses), or does the index wait for the FOSS
decision entirely, with phases 2-4 served by hand-copied folders and
install-from-URL? Phase 5 is the only phase the answer moves.

**Multi-profile enablement.** Is a ware enabled per profile or realm-wide?
Content packs and themes feel per-profile (one adventurer's Vale looks
different from another's); tier 2 wares with background behavior (a provider
syncing on the loop in `app/main.py:38-56`) are realm-wide by nature. The
clean answer may be: installation is realm-wide, enablement is per-profile
where the type allows it — but where the type boundary sits needs deciding
before phase 2, because content merge is per-profile state.

**The wellness columns.** §2f's open decision — fixed superset columns versus
an `extras` JSON column — blocks the provider and chart harnesses and is
easiest to settle before phase 4 starts. `PLUGINS.md` recommends the superset;
this plan has no reason to disagree, but it is not settled until you settle it.

**When does the Bazaar screen open?** A market with one stall and three wares
— all authored by you — is either charming (a quiet market that fills as the
Vale grows) or embarrassing (an empty mall). Ship the screen in phase 5
regardless, or hold it until some threshold of wares exists and let
install-from-URL carry early adopters?

**The Undercroft as the proof.** `PLUGINS.md` §5 argues core should ship at
least one whole subsystem through a harness, because a seam only stays real if
breaking it breaks the game, and names the Undercroft (contract already three
lines: costs vigor to enter, banks gold on retire, nothing material leaves).
That work is not in this plan's phases — it is a minigame-harness proof that
would slot after phase 4. Does it earn a phase of its own, or wait for the
first external minigame author to force the seam honest?

**Snippet scope.** Does the snippets rung (§2's divergence) ship in phase 2 as
proposed, or does it violate the spirit of restriction 3 enough that themes
should stay the floor? The cost of shipping it is a folder scan and a settings
toggle; the cost of not shipping it is the cheapest authoring on-ramp the
research found.

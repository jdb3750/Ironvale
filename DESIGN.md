# Iron Vale Design System

This document records the visual system currently implemented in
`static/style.css` and the responsive interaction contract approved for the
smartphone experience. Sections describing existing implementation are an
extraction; sections labeled **required contract** govern the upcoming shared
web-app changes. The contract adds no framework, native client, mobile API, or
parallel component library.

## 1. Atmosphere & Identity

Iron Vale feels like an old-school DOS role-playing game viewed through a CRT:
dark, compact, tactile, and ceremonial without becoming ornamental. Its
signature is the tonal pixel window: near-black surfaces separated by hard
gold or muted borders, offset block shadows, bitmap typography, and a fixed
vignette layer. Scanlines were removed when the Quanta-Strike scale became the
default because they interfered with the smaller hand-drawn glyphs. Bright gold
marks important language and action;
other hues carry status, rarity, and game meaning.

## 2. Color

### Palette

There is one dark theme. These are the 29 color custom properties currently
declared in `:root`; typography tokens are documented in §3. The stylesheet
also contains raw, one-off colors that have not yet been promoted to tokens.

| Role | Token | Value | Current use |
| --- | --- | --- | --- |
| Page ground | `--bg` | `#0a0a12` | Page background, window title cutouts, inverse action text |
| Primary panel | `--panel` | `#121220` | Windows and major contained surfaces |
| Secondary panel | `--panel2` | `#191928` | Buttons, cards, rows, secondary contained surfaces |
| Raised surface | `--surface-raised` | `#24243b` | Floating menus, modal windows, toasts, and bubbles |
| Quiet edge | `--edge` | `#3a3450` | Passive dividers, frames, rows, and scroller borders |
| Lit edge | `--edge-lit` | `#5a526b` | Top and left edges of raised surfaces |
| Shaded edge | `--edge-shade` | `#211f33` | Right and bottom edges of raised surfaces |
| Primary text | `--ink` | `#d8cfa8` | Body copy and form text |
| Muted text | `--dim` | `#776f8e` | Labels, metadata, disabled-looking copy |
| Readable muted text | `--dim-readable` | `#958ca8` | Small helper copy and enabled muted controls on panels |
| Gold accent | `--gold` | `#c9a24b` | Standard borders, controls, active fills |
| Bright gold | `--gold-bright` | `#f0d080` | Titles, selected emphasis, important values |
| Danger structure | `--red` | `#c85050` | Danger borders and fills, hostile emphasis, and large display text |
| Readable danger text | `--danger-ink` | `#dc7a72` | Small danger text on raised surfaces, hard-path warning text, and HARD chips |
| Success | `--green` | `#7ab55c` | Success, completed states, restorative status |
| Information | `--blue` | `#6aa0c8` | Informational and category emphasis |
| Progress | `--purple` | `#a06ac8` | XP and reward emphasis |
| Common rarity | `--rarity-common` | `#b8b8b8` | Common item/monster rarity |
| Uncommon rarity | `--rarity-uncommon` | `#7ab55c` | Uncommon item/monster rarity |
| Rare rarity | `--rarity-rare` | `#6aa0c8` | Rare item/monster rarity |
| Legendary rarity | `--rarity-legendary` | `#e0a030` | Legendary item/monster rarity and glow |
| Running activity | `--activity-run` | `#7ab55c` | Run stitches, calendar marks, and sequencer glyphs |
| Riding activity | `--activity-ride` | `#6aa0c8` | Ride stitches, calendar marks, and sequencer glyphs |
| Climbing activity | `--activity-climb` | `#e07030` | Climb stitches, calendar marks, and sequencer glyphs |
| Strength activity | `--activity-strength` | `#c85050` | Strength stitches, calendar marks, and sequencer glyphs |
| Mobility activity | `--activity-mobility` | `#a06ac8` | Mobility/rest stitches, calendar marks, and sequencer glyphs |
| Walking activity | `--activity-walk` | `#5cb5a5` | Walk and hike stitches and calendar marks |
| Swimming activity | `--activity-swim` | `#4a90d0` | Swim stitches, calendar marks, and sequencer glyphs |
| Other activity | `--activity-other` | `#9a9aa8` | Uncategorized stitches and calendar marks |

### Usage Rules

- Use `--bg`, `--panel`, and `--panel2` as the core tonal hierarchy.
  `--surface-raised` is lighter than that hierarchy because it represents
  content physically floating above it.
- `--edge` names the existing quiet structural border without changing its
  value. Raised surfaces start with `--edge-lit` and `--edge-shade` for a
  neutral top-left bevel; their tone and cast shadow, not gold, communicate
  depth. A dimming backdrop may override that edge with the existing gold
  bevel to signal interruption.
- Use `--ink` for readable copy and `--dim` for supporting information.
  Small helper copy and enabled muted controls use `--dim-readable` so their
  supporting role remains distinct without falling below the AA contrast target.
- Gold remains structural on ordinary windows and interactive controls;
  `--gold-bright` carries titles, selection, and stronger emphasis. Passive
  raised chrome is neutral so gold remains legible as an interactive state
  within it.
- Red, green, blue, and purple already have game semantics. Rarity tokens are
  aliases by meaning even when their values match a status hue.
- Activity tokens are semantic aliases shared by the Hall tapestry, calendar
  marks, and weekly sequencer. Their repeated values intentionally preserve one
  category language across those surfaces.
- The former counsel-only warning value is now the general `--danger-ink`
  token. This deliberately revises its original narrow scope so small danger
  copy remains readable on both `--panel2` and raised surfaces. `--red`
  remains unchanged for borders, fills, controls, and large display text.
- Raw colors remain common in scene art, gradients, specialized panels, and
  secondary borders. That inconsistency is current implementation debt; do not
  infer additional global tokens from it without updating the CSS contract.

## 3. Typography

### Font Families

| Family | Source | Current role |
| --- | --- | --- |
| `quanta-strike-10` | `/static/fonts/quanta-strike-10-regular.woff2` | Fine print |
| `quanta-strike-12` | `/static/fonts/quanta-strike-12-regular.woff2` and `quanta-strike-12-bold.woff2` | Body copy, tags, helper text, and buttons |
| `quanta-strike-14` | `/static/fonts/quanta-strike-14-regular.woff2` | Titles, NPC dialogue, and workout titles |
| `quanta-strike-16` | `/static/fonts/quanta-strike-16-regular.woff2` | Form inputs and selects |
| `PressStart` | `/static/fonts/pressstart.woff2` | `.pixel-title`, `.ceremony h2`, and `.youdied` |

VT323 remains vendored as a legacy asset but is not part of the active default
scale. Font smoothing is disabled on the body to retain the pixel character.

### Implemented Scale

Quanta-Strike is a family of hand-drawn, size-bound strikes. Each role therefore
has both a family token and a size token; a future font pack must replace the
pair together so a conventional outline font is not rendered at a microscopic
Quanta size.

| Role | Family token | Size token | Weight |
| --- | --- | --- | --- |
| Fine print | `--font-fine` | `--type-fine: 10px` | Regular |
| Body copy, tags, helper and muted text | `--font-body` | `--type-body: 12px` | Regular |
| Buttons | `--font-body` | `--type-body: 12px` | Bold |
| Titles, NPC dialogue and workout titles | `--font-title` | `--type-title: 14px` | Regular |
| Form inputs and selects | `--font-form` | `--type-form: 16px` | Regular |

Every active Quanta declaration uses one of these four exact strikes. There is
no fluid type or intermediate size because rendering a strike away from its
native pixel size is blurry by design. `.btn.small` and `.btn.big` change
padding and geometry, not type size.

PressStart is a conventional outline pixel font, not a size-bound strike. It
therefore has its own display family and scale, independent of the Quanta
tokens; changing a Quanta font pack must never resize these display roles.

| PressStart role | Family token | Size token |
| --- | --- | --- |
| Standard logo and display title | `--font-display` | `--type-display-title: 26px` |
| Login and adventurer gates | `--font-display` | `--type-display-gate: 22px` |
| Quest-complete ceremony heading | `--font-display` | `--type-display-ceremony: 18px` |
| Defeat display | `--font-display` | `--type-display-death: 26px` |

## 4. Spacing & Layout

### Base Rhythm

The visual rhythm is based on **4px**. The CSS does not declare spacing custom
properties, so these are observed values rather than new tokens.

| Multiple | Value | Repeated current use |
| --- | --- | --- |
| 1 | `4px` | Tight margins, table cells, small button padding |
| 2 | `8px` | Compact panel/control padding and gaps |
| 3 | `12px` | Dialog/card horizontal padding, large button vertical padding |
| 4 | `16px` | Standard overlay padding, standard button horizontal padding |
| 5 | `20px` | Empty-state and roomy content padding |
| 6 | `24px` | Large button horizontal padding |

Existing `6px`, `10px`, and `14px` values sit between the 4px steps and are
used frequently in legacy layouts. They are current exceptions and should not
be silently normalized during unrelated work.

### Container And Responsive Rules

- Main content is centered in `#app` at a maximum width of **880px**.
- Desktop app padding is `10px 10px 80px`; at `max-width: 560px` it becomes
  `6px 6px 60px`.
- The header condenses progressively: the full streak box becomes a compact
  resource-line indicator at `max-width: 900px`, then the brand and character
  rows center and hide the tagline/xp bar at `max-width: 719px`.
- Hall navigation uses four paired group columns above `860px`, two group
  columns from `720px` through `860px`, and one group per row below `720px`.
  Each group retains two destination buttons across.
- Layouts use flex and grid locally rather than a global column system.
- Reusable groups wrap when space runs out. Pixel-art canvases and served PNG
  art use `image-rendering: pixelated`.
- The Town is a layered scene: repeating sky and ground tiles sit behind fixed
  3x building art, with the same building row structure preserved on mobile.
  Below `480px`, rows use a deterministic two-column grid and center an odd
  trailing building.
- The mobile rules tighten the app shell and stack the generic NPC row
  vertically; the tokenized type scale does not change between breakpoints.

### Required Responsive Contract

- There is one document, one screen registry, and one set of domain functions.
  Responsive rules may change layout, density, disclosure, and navigation
  presentation; they must not create separate mobile screen functions, API
  routes, workout rules, or saved state.
- `max-width: 719px` is the compact phone-shell breakpoint. It covers the
  required 320px, 375px, and 430px phone widths while leaving the existing
  768px/tablet and 1280px desktop compositions outside compact dock mode.
  Narrow refinements may use `max-width: 430px` or the existing 359px/560px
  boundaries, but they may not change behavior or content ownership.
- The app shell uses dynamic viewport units (`dvh`) where viewport height is
  part of the layout. At every width, the document must have no horizontal
  page overflow. Essential content may wrap or stack; clipping or
  `overflow-x: hidden` is not a substitute for fitting it.
- At the phone breakpoint, reserve bottom space for the compact dock plus
  `env(safe-area-inset-bottom)`. Horizontal shell padding accounts for
  `env(safe-area-inset-left)` and `env(safe-area-inset-right)`; the header
  accounts for `env(safe-area-inset-top)` in standalone display mode.
- The phone layout follows a one-handed priority order: current requirement,
  current value/progress, and primary action first; supporting lore, complete
  rules, and history use progressive disclosure below or behind an explicit
  labeled control. Progressive disclosure may shorten the initial path but
  never hide a requirement, reward/cost, validation error, or destructive
  consequence.
- The desktop shell at 720px and above keeps the existing header, centered
  880px content window, document footer, Town tableau, Hall arrangement, and
  feature-specific wide compositions. Shared semantic, focus, target, and
  mutation fixes are allowed; phone density or a fixed dock is not.

## 5. Components

### Pixel Window (`.win`)

- **Structure:** `.win` optionally contains a direct child `.win-title` and
  arbitrary content. `.win.tight` is the compact variant.
- **Appearance:** `--panel` surface, `2px` `--gold` border, hard concentric
  rings, an offset block shadow, and a title cut out against `--bg`.
- **Spacing:** `14px` padding and vertical margin with a `4px` outer side
  margin; tight windows use `8px 10px`.
- **States:** default only. It has no hover, active, focus, disabled, loading,
  empty, or error behavior of its own; content supplies those states.
- **Overlay adaptation:** inside `.overlay`, the title becomes static so it
  remains visible within the scrollable window.

### Pixel Button (`.btn`)

- **Structure:** text control with shared `.btn`; variants are `.small`,
  `.wide`, `.big`, `.danger`, and `.green`. `.wide` fills its containing
  panel without changing the standard control size; `.big` is both larger and
  full-width.
- **Appearance:** Quanta Strike 12 Bold, uppercase, `--panel2` fill, gold
  border and text, and a hard offset shadow.
- **States:** default uses the base appearance; hover fills gold and inverts
  text; active translates `2px` in both axes and shortens the shadow; disabled
  uses `0.4` opacity and a not-allowed cursor. Danger and green variants use
  their semantic hue for border, text, and hover fill.
- **Focus:** no explicit `.btn:focus` or `.btn:focus-visible` rule exists, so
  keyboard focus relies on the browser default. This is a known inconsistency.
- **Loading / empty / error:** no generic loading or empty state exists. Error
  meaning is expressed by `.danger`; callers own loading and empty behavior.

### Pixel Select (`.pixel-select`, `.hat-picker`)

- **Structure:** a native `details`/`summary` disclosure contains the existing
  chunky option buttons and a hidden value input where the caller needs form
  compatibility. Contextual prose such as Grunhilda's day constraint stays in
  ordinary DOM text outside the clickable summary. The Menagerie hat picker
  shares the same menu-row language.
- **Layout:** the menu floats above ordinary page content and never changes
  document flow. It opens below when the list fits, flips above when the lower
  viewport edge or compact phone dock would cover it, and scrolls within a
  `230px` maximum block size. Its inline size is at least the trigger width and
  expands to its widest option, then shifts within an eight-pixel viewport
  boundary when that content-sized panel would cross an edge.
- **Layering:** floating menus sit above ordinary page surfaces but below the
  compact dock, overlays, and toasts. An overlay scroll window clips absolute
  descendants, so any future select placed inside one must retain the shared
  overlay-boundary clamp or portal its menu outside the scroll owner.
- **Dismissal:** only one picker may be open at a time. Outside activation and
  Escape close it; Escape restores focus to the summary. Events within the
  picker, including scrollbar interaction, remain owned by the picker.
- **States:** summary default, hover, pressed, focus, open, and disabled states
  reuse the pixel-button contract. Options preserve their selected, hover, and
  `menuitemradio` semantics; floating changes placement only.
- **Contextual prose:** a lead-in and its compact trigger form one unbreakable
  phrase. The phrase may wrap as a unit, but the lead-in never ends one line
  while its current value starts another.

### Scrollable Surfaces

- **Scope:** menus (`.pixel-select-menu`, `.hat-picker-menu`), `.dlog`,
  `.dev-console-output`, overlay windows, and the document share the scrollbar
  treatment. The document retains its stable gutter.
- **Appearance:** Firefox uses `scrollbar-width: thin` and
  `scrollbar-color`; Chromium/WebKit use the matching pseudo-elements. Both
  render a square `--gold` thumb on a `--panel2` track, with no rounded corners
  or new palette values.

### NPC Portrait And Dialogue (`.npc-head`, `.dialog`)

- **Structure:** a flex `.npc-head` containing a pixelated portrait image (with
  a char-map canvas fallback) and a flexible `.dialog`; `.npc-name` labels the
  speaker. `.cursor-blink` adds the typewriter cursor. Portrait files are
  declared in `static/js/art.js` under `static/art/npcs/`.
- **Appearance:** portrait and black dialogue field use hard borders; the
  speaker name and cursor use bright gold.
- **States:** default dialogue uses Quanta Strike 14 Regular and has a `64px`
  minimum height, which also preserves an empty or not-yet-typed state. Typing
  adds the blinking cursor. There are no hover, active, focus, disabled,
  loading, or error states on the container.
- **Responsive:** the generic row stacks and centers below `560px`.

### Town Scene (`.town-scene`, `.bld`)

- **Structure:** `.town-scene` layers the three time-of-day sky/ground tile
  pairs behind three `.trow` groups of clickable `.bld` locations. PNG
  portraits, houses, landmarks, and town tiles are mapped by `static/js/art.js`;
  char-map sprites remain the fallback for unmapped buildings.
- **States:** the scene follows the local wall clock at 06:00, 18:00, and
  20:00 boundaries. Dev mode can pin day, sunset, or night and return to auto.
  When auto is active, Town schedules one refresh for the next boundary rather
  than polling.
- **Responsive:** below `480px`, each row becomes two columns and an odd final
  location spans the row and centers beneath its neighbors.

### Tabs (`.tabs`, `.tabs .btn`)

- **Structure:** wrapping flex container of `.btn` controls.
- **States:** default, hover, active, focus, and disabled inherit the button
  contract. `.active` fills gold and inverts text. `.tab-glow` adds a pulsing
  bright-gold border and `.tab-glow-dot` for unread attention.
- **Focus:** remains the browser default because the stylesheet has no explicit
  tab focus rule. Loading and empty tab states are not defined.

### Overlay (`.overlay`)

- **Structure:** fixed full-viewport flex layer containing a `.win`.
- **Appearance:** near-opaque dark scrim, `16px` viewport padding, centered
  window capped at `480px` wide and `90vh` high with vertical scrolling.
- **States:** presence is the open state; absence is the closed state. Empty,
  hover, active, focus, disabled, and loading states are delegated to contained
  content. `.toast.err` is the existing transient error treatment, separate
  from overlays.

### Raven Sync Status

- **Structure:** one shared live-region renderer appears in the document footer
  and the Settings raven panel. It reports the last successful flight or the
  latest durable per-profile failure without exposing credentials.
- **States:** routine and never-synced copy use muted text. A failed scheduled
  or manual flight uses the existing danger color, includes the failure time
  and last safe return when known, and remains visible until a complete flight
  succeeds.

### Hall Grouped Navigation

- **Structure:** `.hall-nav` contains four `.hall-nav-group` columns. Each group
  contains a two-column `.hall-nav-buttons` grid of shared `.btn.small`
  destinations: Body/Vitals, The Road/The Iron, Calendar/Chronicle, and
  Compendium/Almanac. The navigation sits below Maud's standard `.npc-head`
  and `.dialog` block, so the Hall follows the same portrait and dialogue
  structure as the other NPC screens.
- **Layout:** groups are equal-width desktop columns, become two columns from
  `720px` through `860px`, and stack one group per row below `720px`. Every
  phone row therefore presents two destination buttons across. Buttons fill
  their tracks, wrap when needed, use the 12px Bold button token, and keep at
  least `44px` of height without horizontal overflow.
- **Appearance:** grouped buttons reuse the shared pixel-button surface and
  the Hall keeps the same square windows, gold borders, and semantic status
  colors as the rest of the interface. Maud renders at the standard `128px`
  portrait size and receives a distinct in-world reading for each destination.
- **States:** destination default, hover, active, focus, and unread states use
  the shared `.btn` contract plus `.hall-nav .btn.active`,
  `.hall-nav .btn:focus-visible`, and `.hall-nav .btn.tab-glow`. The Almanac
  unread state adds a bright-gold pulsing border and dot. Empty data states are
  rendered by each Hall destination; stale optional endpoints degrade to the
  available base view.

### Compendium Parsing Search

- **Structure:** one labeled search bar sits inside the Movements pane directly
  above its scrolling list. Parsed catalog terms appear as removable chips
  beneath the bar beside the result count. A `?` disclosure opens a raised
  vocabulary reference grouped by muscle group, muscle, equipment, category,
  level, force, and mechanic; its buttons only append text to the search string
  and hold no selected or apply state.
- **Behavior:** the search string is the filter source of truth. Catalog-derived
  vocabulary is matched longest-first as exact terms; unmatched text remains a
  case-insensitive name substring. Values OR within one dimension and AND across
  dimensions. Removing a parsed chip quotes that term in the search string so it
  becomes literal name text rather than disappearing. Source-muscle matching is
  primary-only by default; a pressed Include Secondary control appears only for
  a source-muscle term. Null catalog values remain in ordinary/name results
  but are not filter tokens. Filtering rebuilds all text rows while an open
  detail remains intact.
- **Appearance:** the input uses the shared black form field. Chips, the `?`
  control, and the conditional secondary control reuse the square `--panel2`,
  `--edge`, gold-interaction, Quanta 12 language. The vocabulary is a neutral
  raised surface with the standard hard shadow and readable-muted headings.
  Empty results retain the list frame and answer in Maud's voice.
- **Accessibility and responsive:** list rows are ordinary buttons; only the
  open movement carries `aria-current="true"`, never `aria-pressed`. The search
  and controls keep 44px phone targets, chips and reference values wrap before
  overflow, and the compact control no longer delays the first movement below a
  shelf of options. The existing one-pane phone list/detail handoff and the two
  named list/detail scroll owners remain unchanged.

### Counsel Guidance Surface And Settings Tabs

- **Purpose:** this is the reusable presentation language for training guidance
  in Settings and giver boards only. The proposed Hall/Maud counsel-outcome
  reflection was permanently cut under `COUNCIL_REDESIGN.md §7b`: general
  CTL/ATL/HRV movement cannot truthfully be attributed to a few counsel quests.
  Do not rebuild or relocate that reflection, infer Body outcomes from it, or
  use it as a selector feedback loop. This surface carries information and
  hierarchy only; it does not imply a new route, saved record, or Council
  feature.
- **Four semantic colors:** gold is interactive and structural chrome; blue is
  the counsel's informational voice in short labels and explanatory snippets;
  green is a live/on boolean state; muted is fine print, helper copy, and
  generic onboarding prose. Selection is always gold, never blue.
- **Structure:** `.counsel-surface` wraps the live screen content.
  `.counsel-help` and `.counsel-label` provide muted help text and compact blue
  field labels. `.counsel-block` marks only a block where the counsel speaks
  with a three-pixel blue left rail. Generic prose uses `.settings-helper`
  without an information rail.
- **Appearance:** all pieces stay within the existing tonal pixel-window
  system. They use `--panel2` for the contained surface, `--dim-readable` for
  small helper prose and enabled muted controls, `--blue` for labels and the
  counsel rail, gold for actions and single-select choices, and green only for
  live/on boolean state. They add no raw feature color, soft radius, or
  floating-card shadow.
- **Settings tabs:** `.settings-tabs` composes the existing
  `.hall-nav-buttons` grid with three semantic tab buttons. Exactly one panel
  is present at a time; the selected tab is exposed with `aria-selected` and
  a filled-gold interactive state. Adding a future Settings area means adding one
  tab descriptor and its keyed panel, not another navigation implementation.
- **States:** tab default, hover, pressed, focus-visible, and selected states
  reuse `.btn`. Guidance controls retain their ordinary enabled behavior.
  Secondary focuses, the daily pointer, and sound are raised on/off toggles:
  the current primary is excluded from secondary focuses, on is green-lit, and
  off is an unlit panel-toned gray-blue with readable text. Danger toggles keep
  their danger color when enabled. Disabled focus guidance dims its controls
  while keeping the explanatory help readable; labels and control roles remain
  visible so the retained charter is understandable.
- **Responsive:** the tab grid remains three equal tracks at phone, tablet,
  and desktop widths because the labels are short. Guidance copy wraps
  anywhere, controls wrap without horizontal page overflow, and phone targets
  keep the shared 44px minimum.

### Compact Phone Dock — required contract

- **Structure:** the shared shell renders one navigation model. At
  `max-width: 719px` CSS presents it as a fixed bottom `nav` containing Back,
  Town, Ravens, and Settings in that order. Sound moves inside Settings on
  phone. At 720px and above, the same actions retain the existing document
  footer presentation, including Sound.
- **Targets:** each dock action owns at least a 44x44 CSS-pixel hit region and
  an accessible name. The active/current destination is exposed visually and
  semantically; unavailable Back remains a stable disabled item rather than
  shifting the other actions.
- **Safe area:** the dock pads its controls above
  `env(safe-area-inset-bottom)` and spans between the left/right safe-area
  insets. Main content bottom padding is at least dock block-size plus the
  bottom inset, so no action or final row can sit underneath it.
- **Keyboard:** when a text or numeric field is focused and `visualViewport`
  shows the software keyboard has reduced usable height, the dock collapses
  out of the input path. The focused field, its inline error, and the relevant
  submit action remain visible. The dock returns without moving the user to a
  different route or resetting scroll.
- **States:** default, current, hover where supported, pressed, explicit
  `:focus-visible`, disabled, and safe loading behavior. A dock action fires
  once per intentional activation and never creates a duplicate history entry
  for the already-current route.

### Workout Set Editor — required contract

- **Shared ownership:** the active strength-quest logger is one shared screen
  backed by the same lift API and quest/domain functions on phone and desktop.
  Responsive CSS may stack its controls, but there is no mobile logger copy,
  mobile-only payload, or duplicate set-mutation function.
- **Open state:** on entry, the first incomplete exercise opens by default.
  Any other exercise can be opened independently and multiple editors stay
  open, so a superset never requires reopening a card after every set.
- **Anatomy:** each open exercise has a weight row and a count row. Both offer
  direct numeric entry plus decrement/increment controls; the count label and
  formatting use the server-returned unit (`reps`, `seconds`, or `steps`). A
  bodyweight seconds exercise stores weight 0 without demanding weight entry;
  weighted steps retains both weight and integer steps.
- **Touch and typing:** repeated decrement/increment controls are at least
  48x48 CSS pixels; direct inputs and the Log Set action are at least 44px
  high. Numeric input text uses the 16px Regular form token, supports an
  appropriate input mode, selects predictably, and remains visible above the
  keyboard.
- **Validation:** blank, malformed, negative, fractional where an integer is
  required, or non-finite values show a specific inline error and send zero
  requests. A valid activation sends exactly one request while the action is
  guarded as pending. A failed request preserves the entered values and offers
  an unambiguous retry.
- **In-place responsibility:** weight/count adjustments, editor expansion,
  pending state, validation, successful progress, and the recent-set row are
  local state/DOM updates. They must not call the app-root `render()`, refetch
  the recent list, replace `#app`, close another superset editor, or reset
  scroll. The shared mutation helper consumes the exact created lift returned
  by the API, updates the matching exercise/count/history row, and retains its
  stable backend id for edit/delete/undo.
- **Root-replacement responsibility:** full root rendering is reserved for a
  route transition, initial route hydration, profile switch, or a domain-level
  state transition that truly changes screens (for example, leaving the
  logger after quest completion). An async result first checks the current
  route token; a response from an abandoned screen cannot replace the current
  root, open completion UI, or mutate a new screen. Any same-route root
  replacement invalidates callbacks begun against the detached root and
  cancels route-owned RAF, timers, and cleanup work before the DOM is replaced.
  Successful mutations reconcile their returned shared state only
  while the originating profile generation is current. Full-state refreshes
  obey the same profile-generation boundary, and profile switches invalidate
  all outstanding route tokens; resource values repaint in place without
  wiping destination-screen input.
- **Correction:** edit, delete, and undo target the exact stable lift id, not
  the newest-looking row. Local lists, progress, Scrivener, and Hall formatting
  preserve the persisted `reps`/`seconds`/`steps` meaning after active quest
  state is gone.
- **Desktop:** the 1280px logger retains its compact horizontal rows and
  multi-card density. It uses the same direct-entry fields, validation,
  one-request guard, local mutation helper, exact-id correction, and unit
  semantics; only the responsive arrangement differs.

### Progressive Action Panel — required contract

- Used for phone quest offers, giver dialogue, and the Undercroft gate where
  flavor or long rules currently push the primary action below the fold.
- The primary view always shows title, requirement/cost, reward/outcome, live
  eligibility, and action. Secondary lore and complete rules follow in a
  native disclosure control with a semantic expanded state.
- Desktop keeps the existing fully composed content where it already fits.
  The disclosure is a presentation rule around the same source content, not a
  second abbreviated mobile copy string.

## 6. Motion & Interaction

Motion is brief, stateful, and deliberately game-like. Existing timings are
component-specific rather than tokenized:

| Motion | Timing | Purpose |
| --- | --- | --- |
| Button press | immediate transform | Simulates a depressed pixel control |
| Typewriter cursor | `0.8s` infinite blink | Indicates dialogue still typing |
| Attention marker | `1s` alternate bob | Marks an actionable town location |
| Unread tab | `1.4s ease-in-out` infinite | Calls attention to new Almanac content |
| Ceremony reward | `0.3s` forwards | Reveals reward text with scale and opacity |
| Level-up pulse | `0.7s` alternate | Sustains ceremonial emphasis after reveal |
| HP width | `0.25s` transition | Shows combat health change |
| Flash wipe / card reveal | `0.5s` | Marks a gacha reveal transition |
| Town time-of-day refresh | one-shot at `06:00`, `18:00`, or `20:00` | Keeps the scene aligned with the local clock |

Most motion uses `transform`, `opacity`, or visual effects; the HP bar
transitions width as an existing exception. The responsive pass adds the
reduced-motion and focus-visible behavior required below while preserving the
normal-motion presentation.

### Required Motion Contract

- CSS supplies a global `@media (prefers-reduced-motion: reduce)` path. It
  removes non-essential looping/bobbing/blinking/reveal animation and shortens
  non-essential transitions without hiding state, content, focus, or outcome.
- JavaScript reads the same preference through one shared helper. Typewriter
  text resolves immediately; Crankwerk, Dungeon, Colosseum, Menagerie/Ranch,
  pack reveal, and other RAF/timer sequences reach the same final state without
  prolonged animation. Reduced motion changes presentation timing only, never
  odds, rewards, combat results, navigation, or persisted data.
- The no-preference path keeps the existing game-like motion and outcomes.
  Runtime preference changes apply to the next/current cancellable sequence
  without leaving stale timers, RAF callbacks, body classes, or overlays.
- Every interactive control has a visible `:focus-visible` treatment that
  works against the dark CRT surface. Hover cannot be the only indication of
  interactivity; pressed feedback remains brief and meaningful.

## 7. Depth & Surface

The strategy is **borders plus tonal pixel windows**. `--bg`, `--panel`, and
`--panel2` create the ordinary hierarchy. Two-pixel borders and inset rings
separate contained surfaces; hard offset shadows express physical elevation
without introducing soft or blurred light. Black fields are used for dialogue,
charts, portrait frames, and dungeon surfaces. The fixed vignette sits above
the interface without intercepting input.

Specialized scenes and reward moments use gradients, glows, and raw colors,
but shared windows and controls remain square-edged and border-led. The mix of
tokenized core surfaces with raw feature colors is an existing inconsistency;
it may be consolidated only as a separate, explicitly approved change.

### Raised surfaces

A surface drawn on top of other content is physically closer to the viewer.
Every floating picker menu, modal window, toast, and deed/counsel bubble uses
the shared `--surface-raised` background, which is perceptibly lighter than
`--panel2`. These surfaces cast the same unblurred `4px 4px 0` southeast shadow
onto the content beneath them.

The light source is consistently top-left. Every raised surface starts with
`--edge-lit` on the top and left and `--edge-shade` on the right and bottom.
This neutral bevel distinguishes elevation without spending the accent on a
passive container. Menus omit the edge attached to their trigger, including
when they flip upward, but retain the same bevel and shadow direction.

Elevation and interruption are separate axes. A surface that dims the world
behind it blocks interaction and demands a response, so it additionally takes
the existing dimensional gold bevel: gold marks interruption, not elevation.
A surface that floats over otherwise-live content keeps the neutral bevel
because it coexists with the page rather than claiming the player's attention.

Inset picker rows rest on `--edge`. Hover, keyboard focus, and selection return
their border and marker to gold, so the accent identifies interaction and the
current value rather than merely outlining the menu.

Readable muted helper copy on a raised surface uses `--dim-readable`. Small
danger copy uses `--danger-ink`, while `--red` remains the structural danger
color for borders, fills, and large display text. Elevation never changes the
semantic meaning of gold, blue, green, or red.

## 8. Navigation and History Contract

- `nav(screen, params)` remains the one screen-navigation function and owns
  both application state and browser history. A user-initiated forward
  navigation pushes one serializable route entry; replacement is reserved for
  boot, invalid-state recovery, or canonicalization.
- Browser/OS Back and edge-swipe are first-class. `popstate` restores the
  previous Iron Vale route and parameters without pushing another entry. The
  visible Back control requests the same history transition when one exists;
  it uses the app fallback only when there is no usable in-app history entry.
- Back never loops between duplicate entries, leaves a route-owned overlay
  stranded on the destination, or reopens a dismissed overlay. Route
  restoration may rehydrate a screen but cannot resurrect stale async work
  from the route being left.
- Overlays are transient state owned by the current route and never create or
  consume browser-history entries. Any route transition, including Back,
  removes the outgoing route's overlays before restoring the destination.
  Explicit Close dismisses only the overlay and does not change history.
- Town is the stable home destination. Selecting Town from the compact dock
  must not grow an unbounded series of identical Town entries. Back at the
  initial entry is disabled or follows normal browser ownership; the app does
  not trap the user with synthetic history.

## 9. Accessibility and Adaptive Constraints

- Target WCAG 2.2 AA. On phone, every high-traffic action has a 44x44 CSS-pixel
  target. Repeated workout steppers use 48x48. Where a low-frequency control
  cannot reach 44px, it must still satisfy WCAG's 24x24 minimum and spacing
  exception; this is not permitted for the dock, logger, primary actions,
  correction controls, or essential direct alternatives to drag/precision.
- Use semantic buttons, links, form controls, and disclosure elements where
  possible. Custom scenic targets expose the correct role, accessible name,
  keyboard activation, current/selected/expanded/disabled state, and a visible
  `:focus-visible` ring. Visual pixel labels do not replace programmatic names.
- Viewport metadata must permit user zoom: `width=device-width,
  initial-scale=1` with no `maximum-scale` and no `user-scalable=no`. At 200%
  zoom and 320px width, essential content and actions remain reachable with no
  document-level horizontal overflow.
- Form inputs and selects use `--font-form` with `--type-form: 16px` in every
  display mode, preventing involuntary focus zoom without a browser-only media
  exception. The visual keyboard is handled through focus plus
  `visualViewport`, not a guessed device height. Scrolling a field/action into
  view must respect the compact header, dock state, and safe-area insets.
- Top, bottom, left, and right `safe-area` insets are layout inputs, not device
  assumptions. Browser and standalone display modes must both keep the header,
  dock, overlays, controls, and final content clear of cutouts/home indicators.
- Loading preserves control geometry and exposes busy state; disabled controls
  remain perceivable; errors are inline, specific, and focusable/announced
  when appropriate; empty states explain the next available action. Pending
  mutations cannot be activated twice.
- Essential drag or precision interactions in Town-adjacent game surfaces
  also have a direct tap and keyboard path with the same outcome. Pointer
  cancel, navigation away, and backend rejection restore a coherent state.
- Color continues to carry the world semantics defined in Section 2, but text,
  shape, label, or state supplies a non-color cue. Pixel type may not reduce
  critical control/error readability below the AA contract.

## 10. Shared-App Architecture Contract

- Iron Vale remains one vanilla-JavaScript SPA and one FastAPI application.
  Phone and desktop share database records, API schemas, validation, quest
  logic, unit rules, screen registry, route state, mutation helpers, and base
  render functions. A fix to shared functionality must affect both platforms.
- Responsive presentation belongs in shared markup plus media queries and
  narrowly scoped adaptive wiring (dock visibility, disclosure, keyboard
  clearance). Do not create `mobile/` and `desktop/` modules, duplicate screen
  registries, parallel API endpoints, user-agent branches, or two versions of
  a mutation/domain function.
- A shared component may expose one state and one action model with two CSS
  arrangements. Conditional markup is allowed only for presentation elements
  whose existence is mode-specific, such as the compact dock versus desktop
  footer; both must invoke the same named navigation actions.
- Server-returned ids, units, and server-local dates are authoritative.
  Responsive code never derives a different domain value or date because it
  runs on a phone.
- Phone-only improvements must transfer to the base game when they are
  behavioral or accessibility fixes: exact created-lift responses, stable-id
  correction, validation, history semantics, focus handling, reduced-motion
  outcomes, and local logger mutation are shared. Only layout/density/dock
  presentation changes at the phone breakpoint.

## 11. Desktop Preservation and Review Scenarios

At 1280x900, Town remains a wide illustrated village, Hall retains its broad
portrait/navigation composition, Undercroft keeps the full rule/action panel,
Menagerie keeps the wide grazing field, Colosseum keeps its centered contest
and arena, and Crankwerk keeps its compact ceremonial composition. The compact
dock is absent and the existing document footer remains. No phone rule removes
desktop information or capability.

The contract is unambiguous only if each representative decision resolves as
follows:

1. A backend lift-validation or created-record fix is implemented once and is
   consumed by both phone and desktop.
2. A logger adjustment or successful mutation uses one shared local helper;
   neither layout refetches/replaces `#app` for per-set work.
3. At 375px, Back/Town/Ravens/Settings appear in the safe-area-aware compact
   dock; at 1280px they use the existing footer and no dock is rendered.
4. Browser Back closes an overlay first, then restores the preceding route
   without a duplicate push or stale async repaint.
5. Opening the keyboard hides/collapses the phone dock only as needed and
   leaves the focused direct-entry field, error, and Log Set action reachable.
6. A 44px primary target and 48px repeated stepper remain operable at 320px
   and 200% zoom without hidden horizontal overflow.
7. With reduced motion, animation-dependent screens reach the same final
   result immediately or through a minimal transition; with no preference,
   the existing playful motion still runs.

### Accepted design debt

- Raw feature colors and intermediate legacy spacing values remain documented
  extraction debt. This smartphone scope does not normalize them.
- Real home-screen installation on the deployed production origin remains a
  deployment-time verification item. Manifest/icon metadata may be added, but
  this contract makes no offline, service-worker, or background-sync claim.
- No new accessibility or persona-blocking debt is accepted by this contract.
  Any implementation exception must be recorded here with affected users,
  exact location, rationale, owner, and exit condition before sign-off.

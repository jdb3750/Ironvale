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
scanline-and-vignette layer. Bright gold marks important language and action;
other hues carry status, rarity, and game meaning.

## 2. Color

### Palette

There is one dark theme. These are all 15 custom properties currently declared
in `:root`; the stylesheet also contains raw, one-off colors that have not yet
been promoted to tokens.

| Role | Token | Value | Current use |
| --- | --- | --- | --- |
| Page ground | `--bg` | `#0a0a12` | Page background, window title cutouts, inverse action text |
| Primary panel | `--panel` | `#121220` | Windows, toasts, major contained surfaces |
| Secondary panel | `--panel2` | `#191928` | Buttons, cards, rows, secondary contained surfaces |
| Primary text | `--ink` | `#d8cfa8` | Body copy and form text |
| Muted text | `--dim` | `#776f8e` | Labels, metadata, disabled-looking copy |
| Gold accent | `--gold` | `#c9a24b` | Standard borders, controls, active fills |
| Bright gold | `--gold-bright` | `#f0d080` | Titles, selected emphasis, important values |
| Danger | `--red` | `#c85050` | Errors, danger controls, hostile/status emphasis |
| Success | `--green` | `#7ab55c` | Success, completed states, restorative status |
| Information | `--blue` | `#6aa0c8` | Informational and category emphasis |
| Progress | `--purple` | `#a06ac8` | XP and reward emphasis |
| Common rarity | `--rarity-common` | `#b8b8b8` | Common item/monster rarity |
| Uncommon rarity | `--rarity-uncommon` | `#7ab55c` | Uncommon item/monster rarity |
| Rare rarity | `--rarity-rare` | `#6aa0c8` | Rare item/monster rarity |
| Legendary rarity | `--rarity-legendary` | `#e0a030` | Legendary item/monster rarity and glow |

### Usage Rules

- Use `--bg`, `--panel`, and `--panel2` as the core tonal hierarchy.
- Use `--ink` for readable copy and `--dim` for supporting information.
- Gold is both structural and interactive: `--gold` outlines ordinary windows
  and controls; `--gold-bright` carries titles and stronger emphasis.
- Red, green, blue, and purple already have game semantics. Rarity tokens are
  aliases by meaning even when their values match a status hue.
- Raw colors remain common in scene art, gradients, specialized panels, and
  secondary borders. That inconsistency is current implementation debt; do not
  infer additional global tokens from it without updating the CSS contract.

## 3. Typography

### Font Families

| Family | Source | Stack | Current role |
| --- | --- | --- | --- |
| `VT323` | `/static/fonts/vt323.woff2` | `'VT323', 'Courier New', monospace` on `body`; `'VT323', monospace` on controls | Default interface, body copy, labels, buttons, inputs |
| `PressStart` | `/static/fonts/pressstart.woff2` | `'PressStart', monospace` | `.pixel-title`, ceremony headings, and high-impact game messages |

The project intentionally uses only these two local font families. Font
smoothing is disabled on the body to retain the pixel character.

### Implemented Scale

The stylesheet has no typography tokens or formal heading scale. The stable
anchors are:

| Level | Size | Weight / line height | Current use |
| --- | --- | --- | --- |
| Body | `20px` | normal / `1.35` | Default desktop interface text |
| Body, mobile | `19px` | normal / inherited | Body at `max-width: 560px` |
| Standard control | `20px` | normal / inherited | `.btn` and form controls |
| Small control | `17px` | normal / inherited | `.btn.small` |
| Large control | `24px` | normal / inherited | `.btn.big` |
| Window title | `20px` | normal / inherited | `.win-title`, uppercase |
| NPC dialogue | `21px` | normal / inherited | `.dialog` |
| Ceremony title | `18px` | normal / inherited | `.ceremony h2` in `PressStart` |

Headings reset to normal weight. Uppercase labels and controls generally use
`1px` letter spacing; `.pixel-title` uses `2px`. Many feature-specific sizes
from `12px` upward exist outside this small shared scale. That variation is an
observed inconsistency, not a recommendation to add more sizes.

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
- The mobile rules reduce type slightly, tighten the app shell, and stack the
  generic NPC row vertically.

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
- **Appearance:** `VT323`, uppercase, `--panel2` fill, gold border and text,
  and a hard offset shadow.
- **States:** default uses the base appearance; hover fills gold and inverts
  text; active translates `2px` in both axes and shortens the shadow; disabled
  uses `0.4` opacity and a not-allowed cursor. Danger and green variants use
  their semantic hue for border, text, and hover fill.
- **Focus:** no explicit `.btn:focus` or `.btn:focus-visible` rule exists, so
  keyboard focus relies on the browser default. This is a known inconsistency.
- **Loading / empty / error:** no generic loading or empty state exists. Error
  meaning is expressed by `.danger`; callers own loading and empty behavior.

### NPC Portrait And Dialogue (`.npc-head`, `.dialog`)

- **Structure:** a flex `.npc-head` containing a pixelated portrait image (with
  a char-map canvas fallback) and a flexible `.dialog`; `.npc-name` labels the
  speaker. `.cursor-blink` adds the typewriter cursor. Portrait files are
  declared in `static/js/art.js` under `static/art/npcs/`.
- **Appearance:** portrait and black dialogue field use hard borders; the
  speaker name and cursor use bright gold.
- **States:** default dialogue has a `64px` minimum height, which also preserves
  an empty or not-yet-typed state. Typing adds the blinking cursor. There are no
  hover, active, focus, disabled, loading, or error states on the container.
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
  their tracks, wrap when needed, use the `19px` mobile body scale, and keep at
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
  high. Numeric input text is at least 16px (the existing 20px control type is
  preferred), supports an appropriate input mode, selects predictably, and
  remains visible above the keyboard.
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
`--panel2` create the primary hierarchy. Two-pixel borders, inset rings, and
hard offset shadows separate interactive and elevated surfaces; shadows read
as pixel construction rather than soft physical elevation. Black fields are
used for dialogue, charts, portrait frames, and dungeon surfaces. The fixed CRT
overlay adds scanlines and a vignette above the interface without intercepting
input.

Specialized scenes and reward moments use gradients, glows, and raw colors,
but shared windows and controls remain square-edged and border-led. The mix of
tokenized core surfaces with raw feature colors is an existing inconsistency;
it may be consolidated only as a separate, explicitly approved change.

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
- Form text stays at least 16px to avoid involuntary focus zoom. The visual
  keyboard is handled through focus plus `visualViewport`, not a guessed
  device height. Scrolling a field/action into view must respect the compact
  header, dock state, and safe-area insets.
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
  shape, label, or state supplies a non-color cue. CRT scanlines and pixel type
  may not reduce critical control/error readability below the AA contract.

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

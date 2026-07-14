# Iron Vale Design System

This document records the visual system currently implemented in
`static/style.css`. It is an extraction, not a redesign: existing exceptions
are observations, and this document does not create new CSS tokens or a
component library.

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
- Hall navigation uses four paired columns above `860px`, two columns at or
  below `860px`, and tighter button spacing/font size at `max-width: 359px`.
- Layouts use flex and grid locally rather than a global column system.
- Reusable groups wrap when space runs out. Pixel-art canvases and served PNG
  art use `image-rendering: pixelated`.
- The Town is a layered scene: repeating sky and ground tiles sit behind fixed
  3x building art, with the same building row structure preserved on mobile.
  Below `480px`, rows use a deterministic two-column grid and center an odd
  trailing building.
- The mobile rules reduce type slightly, tighten the app shell, and stack the
  generic NPC row vertically.

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
  `.big`, `.danger`, and `.green`.
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
- **Layout:** groups are equal-width desktop columns and become two columns at
  `max-width: 860px`. Buttons fill their tracks, use one-line labels, and keep
  at least `44px` of height on small screens. Hall navigation uses `13px`
  buttons at `max-width: 560px` and `11px` buttons below `360px` to preserve
  readable targets without horizontal overflow.
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
transitions width as an existing exception. The stylesheet does not currently
define `prefers-reduced-motion` handling, and most interactive controls do not
have explicit focus-visible styling. Both are observed accessibility debt, not
changes made by this extraction.

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

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
- Desktop app padding is `10px 10px 80px`; at the sole global breakpoint it
  becomes `6px 6px 60px`.
- The mobile breakpoint is exactly **`max-width: 560px`**.
- Layouts use flex and grid locally rather than a global column system.
- Reusable groups wrap when space runs out. Pixel-art canvases use
  `image-rendering: pixelated`.
- The mobile rules reduce type slightly, tighten the app shell, use a two-column
  town grid, and stack the generic NPC row vertically.

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

- **Structure:** a flex `.npc-head` containing a pixelated portrait canvas and
  a flexible `.dialog`; `.npc-name` labels the speaker. `.cursor-blink` adds
  the typewriter cursor.
- **Appearance:** portrait and black dialogue field use hard borders; the
  speaker name and cursor use bright gold.
- **States:** default dialogue has a `64px` minimum height, which also preserves
  an empty or not-yet-typed state. Typing adds the blinking cursor. There are no
  hover, active, focus, disabled, loading, or error states on the container.
- **Responsive:** the generic row stacks and centers below `560px`.

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
  has a `.hall-nav-label` and a two-column `.hall-nav-buttons` grid of shared
  `.btn.small` destinations. The adjacent `.hall-curator` window contains the
  horizontal `.hall-curator-row`, a `.hall-curator-portrait` rendered at
  exactly `72px` square, flexible `.hall-curator-dialog`, optional
  `.hall-insights`, and native `.hall-insight-more` disclosure. The portrait
  class narrowly overrides `portraitTag()`'s inline `64px` width and height
  with `!important`; no other portrait is affected.
- **Layout:** the four navigation groups are equal-width desktop columns and
  become two equal columns at `max-width: 560px`. Paired destination tracks use
  `minmax(0, 1fr)`. Mobile destinations are at least `44px` tall and keep each
  destination name on one line; Hall-only type tightens to `13px`, then `11px`
  below `360px`, so labels do not break inside words or widen their group.
  The curator remains a compact horizontal row at every width, overriding the
  generic mobile `.npc-head` stack only for `.npc-head.hall-curator-row`.
  Below `360px`, Maud's full typed reading yields to a concise contextual form
  of the same reading: Almanac keeps Almanac-specific copy, while every other
  destination keeps the archive reading. The primary insight remains visible,
  and additional observations remain reachable through the native details
  disclosure. Hall-scoped type, margins, and disclosure spacing tighten to keep
  the selected content visible by `568px` at a `320px` viewport without removing
  content or functionality. Her identity, exact `72px` portrait, all eight Hall
  destinations, single-line labels, and `44px` mobile targets remain present.
  During Hall renders, `#app.hall-screen` corrects the loading-only inline
  `padding-top: 120px` to the Hall shell's top padding: `12px` on desktop and
  `6px` at `max-width: 560px`. Only the top edge is overridden, so the existing
  horizontal and bottom app padding remain unchanged; every non-Hall render
  removes the class.
- **Appearance:** group labels use muted text and tokenized gold rules. Buttons,
  portrait, dialogue, and insight status retain the existing pixel components
  and semantic token colors. Hall spacing follows the `4px` rhythm and all
  surfaces retain square corners.
- **States:** destination default, hover, active, disabled, and unread states
  continue to use `.btn`, `.btn:disabled`, and Hall-scoped
  `.hall-nav .btn.active` / `.hall-nav .btn.tab-glow` rules equivalent to the
  shared tab states. Active destinations fill gold with inverted text; unread
  destinations establish positioning for the dot and use the bright-gold
  pulsing border. Hall destination buttons and the insight summary add a
  visible bright-gold `:focus-visible` outline. The disclosure summary is
  bright gold and its supporting observations remain muted; absent insights
  emit no insight block. Loading and navigation error states remain
  caller-owned.

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

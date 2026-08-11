# Identity direction

The chrome becomes drawn art. The border kit is the foundation; everything else
either sits on it or waits for it. This document exists so the drawing can start
without a follow-up question — sections 2 and 3 are the two specs that block a
pixel editor, and the rest is scope.

Joe has ruled that this project thread is the source of truth for the visual
identity work, so this document governs where it and any other spec disagree.

## 0. What else is on the branch, and why

Everything that described a rejected direction has been deleted. What is left
under `docs/mockups/identity/` is here because the settled direction still reads
it:

- **`border-kit.html`** — the implementer's reference for the tile numbers, the
  generator and the nine-layer background rule. Nearly every coordinate and hex
  value in section 2 is a citation into it.
- **`detail-pass.html`** and **`raven-sheet.png`** — the adopted iconography of
  section 4, and the only raven frames that exist anywhere (see section 4).
- **`type-wordmark.html`** and **`wordmark-sheet.png`** — the drawn lettering
  Joe is redrawing from: the wordmark, the fixed screen titles and the
  illuminated capitals. Section 5 measures its glyphs.
- **`material-chrome.html`** — kept for three of its ten sections and no more.
  **00, "The lamp, and the rule it makes"**, which fixes the light source for
  everything drawn here (`material-chrome.html:97-102`). **01–03**, "Bolted
  iron", "Hung oak" and "Set stone", for their panel *textures* only — the
  `.plate`, `.board` and `.slab` backgrounds and the ashlar wall that section 3
  triages, which Joe redraws as pixel textures. And **04, "The title, five
  ways"**, the title variants he is also redrawing — with one exception inside
  it: the wax-sealed **parchment** strip is not a surviving variant
  (`material-chrome.html:280`, `:725`, `:965`), because parchment is cut
  including as a title label, per the table below. Sections 05–09 — the
  per-material key sets, nesting, the side-by-side, the phone case and the cost
  count — are cut, as is the plate/board/slab *construction* those textures sit
  in.

There are no page captures on the branch. The mockups are self-contained,
dependency-free HTML with no build step: open the file.

## 1. What was decided

| Option | Verdict | What carries forward |
| --- | --- | --- |
| The Modular Border Kit | **Adopt** | All of it, as the foundation. Nine 8×8 tiles per material, four materials, material assigned by permanence and consequence. Section 2. |
| The Detail Pass | **Partial** | Raven, bell, bolts/nails, panel title, streak flame, toasts, quill. Candle parked on a real implementation problem. Moth cut. Section 4. |
| Material Chrome | **Partial** | Two things: the textured panel backdrops (redrawn as pixel textures, not the painterly ones in the mockup), and some title variants (redrawn). The plate/board/slab construction, the ashlar wall, the octagonal fasteners and the per-material key sets are all dropped. Section 3. |
| Type, Titles & Wordmark | **Partial** | The hand-drawn paragraph work — illuminated capitals and ornamented copy. Drawn display and panel titles keep the idea and lose the execution. Section 5. |
| Scroll & Parchment | **Cut** | Nothing. Not settings, not as a vellum material in the kit, not as a title label, not anywhere. Everything describing it has been deleted from the branch; the only place it is named again is section 0, to rule out the one title variant that used it. |
| Palette Studies | **Hold** | Nothing now. Gold gets restricted to the touchable and the earned, but that restriction rides in on the border work. |

The palette hold has one condition that would revive it: the border kit shipping
and gold *still* reading as exhausting. That is the only evidence that a palette
pass was the right instrument rather than a symptom fix, and it cannot be
gathered before seam 1 lands.

### What the palette study measured, and which of it the hold keeps

Holding the pass does not discard what it measured. Four findings survive,
because each is a fact about `static/style.css` rather than an argument for a
retheme, and three of them bear on work in this document.

**Gold does fourteen jobs.** `--gold` or `--gold-bright` paints the wordmark,
the panel border, the panel outer ring, the panel title, every quest title,
every key face bevel, every key label, every stat label, every table header,
every building plate, the XP bar fill, the coin count, the moderate chip and the
doctrine chip. An eye cannot rank fourteen equally bright things, so it stops
trying, and a screen where nothing is emphasised looks like a screen where
nobody decided anything. This is the whole reason the pass was **held** rather
than cut: the finding is right, and the border kit is the instrument that spends
the saving, so gold's restriction rides in on section 2 rather than on a `:root`
edit.

**Most of the colour is not tokenised.** `static/style.css` is 2,889 lines and
carries **276 literal hex colours across 131 distinct values**. Most of those
values are typed in place rather than tokenised, which is why an edit to `:root`
alone repaints about two-thirds of a screen. The worst offenders by occurrence
count:

| literal | uses | what it is |
| --- | --- | --- |
| `#4a3d20` | **25** | the universal muted-gold hairline — header rule, footer rule, offer and dialog borders, the town-scene frame, the mantel shelf, tab strips, the stat-bar track, building plates |
| `#3a2c10` | **11** | two unrelated jobs in one literal: the floor shadow under every key (`static/style.css:179`) and the `.pixel-title` text-shadow (`:132`) |
| `#7a5f28` / `#6b5426` / `#52401c` | **8 each** | key bevels, and the `.win` outer ring (`static/style.css:140`) — the second-most identity-carrying line on the screen, and a literal |
| `#12100a` | **6** | pressed and latched key faces |
| `#22203a` | **5** | table and chronicle row dividers; the one cool literal in an otherwise warm set |

Nothing in this document needs the tokenisation done first — the kit brings its
own values, and section 2d explains why it is bound to almost none of them — but
anyone who edits chrome colour outside the kit will meet it.

**`#e07030` is two unrelated things with no token joining them.** It is
`--activity-climb` (`static/style.css:69`) and, separately, the streak flame,
written as a bare literal at `static/style.css:304` and `:365`, again on the
climb chip at `:431`, and inline in `static/js/town.js:279` and
`static/js/app.js:751`. Section 4 replaces that flame with a sprite; whoever
does it should know that moving the value also moves the calendar dot legend,
which is exactly where nobody would look for the regression.

**The dark surfaces are not a hierarchy, and `--dim` is under the bar.** `--dim`
`#776f8e` (`static/style.css:54`) on `--panel2` `#191928` (`:48`) measures
**3.67:1**, and 3.93:1 on `--panel` (`:47`) — both under 4.5, on hand-drawn
glyphs that are one pixel wide in places. And the surface ramp collapses twice:
`--bg` `#0a0a12` (`:46`) sits at L\* 2.94, `--panel` at 6.01 and `--panel2` at
9.44, so the gaps are ΔL\* 3.07 and 3.43 and **three of the four dark surfaces
read as one surface at arm's length**. Only `--surface-raised` `#24243b` (`:49`,
L\* 15.24) is clearly separate. Worth carrying into section 3: some of what
reads as flat is not the gold at all, it is three near-identical darks
pretending to be a hierarchy, and the backdrop texture is being drawn onto that
ground.

---

## 2. The tile authoring spec

### 2a. The grid

Three numbers get confused with each other, so state all three:

- **8×8 native pixels** is the tile — the thing you draw (`docs/mockups/identity/border-kit.html:446`, `const T = 8`).
- **24×24** is the sheet — nine tiles in a 3×3 arrangement, which is only a layout convenience for viewing them together (`border-kit.html:247`, `:681`).
- **16 CSS pixels** is the rendered rail thickness on `.win`, because the panel sets an integer scale of 2: `--u: calc(8px * var(--s))` and `background-size: var(--u) var(--u)` (`border-kit.html:68-77`).

So: draw at 8, view at 24, and it lands at 16 on a desktop panel and 8 on a
toast. There is no 24×24 nine-slice and there is no 16px source tile. Any earlier
summary that said both was describing the sheet and the render as if they were
the same measurement.

The nine slots, each an 8×8 canvas:

| Slot | Repeat | Anchored to | Notes |
| --- | --- | --- | --- |
| `tl` `tr` `bl` `br` | none | its own corner | painted **first** in the CSS layer list, so corners cover the rails running under them (`border-kit.html:73-76`) |
| `t` | `repeat-x` | left top | the top rail |
| `b` | `repeat-x` | left bottom | not the same tile as `t` — the chamfer stays outside and the shade stays in the well |
| `l` | `repeat-y` | left top | |
| `r` | `repeat-y` | right top | not the same tile as `l`, for the same reason |
| `c` | `repeat` | left top | the fill |

Content is held off the rails by padding, not by a border: `calc(var(--u) + 7px)`
vertical, `calc(var(--u) + 9px)` horizontal (`border-kit.html:71`) — 23px and 25px
at scale 2. There is no `border` property involved at all.

Scale rules already settled: `.win` and raised surfaces at `--s:2`; menus,
toasts, bubbles and tooltips at `--s:1`; rows, dividers, cards and chips keep
their existing 2px bevel and are not tiles at all (`border-kit.html:426-429`).
Nesting always steps the scale down by one (`:975`). Below roughly 40px of
content the kit stops entirely — that surface is a chip, not a panel (`:1015-1017`).

### 2b. What you actually author

You do not draw nine tiles per material. You draw a **band profile**, a **corner
stamp** and a short list of **rail marks**, and the generator expands them
(`border-kit.html:525-560`).

| Input | Size | What it is |
| --- | --- | --- |
| `profile` | 8 hex values | read outer→inner: rim, chamfer, four face rows, inner shade, inner rim (`border-kit.html:232-233`) |
| `fill` + `fleck` | 2 hex values | the centre tile: flat fill with exactly two fleck pixels, at (2,5) and (6,1) (`:534-535`) |
| `catch` + `seam` | 2 hex values | corners only — the catch light and the mitre diagonal |
| `stamp` | **3×3** char grid + 2–3 colours | the corner ornament (`:457`, iron is `['oRo','RRs','oss']`) |
| `marks` | a handful of `{band, at, color}` | the 1–2px rail texture (`:459-461`) |

That is about twelve hex values and nine stamp cells per material — the mockup's
own estimate is roughly forty hand-placed pixels each (`border-kit.html:267-268`).

*Correction worth knowing before you draw:* the comment above the material data
calls the stamp a "4x4 corner ornament" (`border-kit.html:449`). It is not. Every
shipped stamp is three rows of three characters, and the generator reads
`N = m.stamp.length` and places it at offset (2,2) (`:544`, `:551-555`). Draw 3×3.
A 4×4 stamp would run into the mitre seam and the rim.

The generation rule, in one line:

> `px(r,c) = profile[ min(distance from (r,c) to each OUTER edge of the tile) ]`

For a corner that is the minimum of two distances; for a rail, the distance to
its one outward edge (`border-kit.html:509-514`). Concentric bands are what makes
it a frame, and it is why grain always runs *along* a rail, the way a plank is
actually cut. Then, on corners only: a mitre seam down the diagonal at
d = 2…6 (`:546-550`), the 3×3 stamp mirrored per corner (`:551-555`), and one
catch-light pixel at (1,1), mirrored (`:556-557`). Then, on rails only: the marks,
where `band` counts inward from the outer edge and `at` runs along the rail
(`:518-523`, `:537-539`).

Paint order on a corner is itself a design decision, not an implementation
detail. The stamp lands *after* the seam, so it covers the seam at d = 2, 3, 4
and the seam survives at d = 5, 6 — running out from under the ornament and
dying at the inner rim. That is a peg, a rivet or a grommet driven straight
through the joint rather than set beside it. The catch light lands last and
always wins; marks never touch a corner at all.

### 2c. The seam rule

This is the constraint that makes the kit never show a join, and it is verifiable
from the generator rather than asserted.

Because `tl(r,c) = P[min(r,c)]`, column 7 of `tl` evaluates to `P[min(r,7)] = P[r]`
— which is exactly the top rail, whose every column is `P[r]`. The same identity
holds on all four corners in both directions. So:

| Corner | This edge must equal | That rail's profile |
| --- | --- | --- |
| `tl`, `bl` | column 7 | the top / bottom rail, row for row |
| `tr`, `br` | column 0 | the top / bottom rail, row for row |
| `tl`, `tr` | row 7 | the left / right rail, column for column |
| `bl`, `br` | row 0 | the left / right rail, column for column |

And row 0 / column 0 of every tile is `P[0]`, the rim, which is `--bg` — that is
what keeps panels floating on the same void.

Which collapses to one drawing rule:

> **Every hand-placed pixel lives inside rows 1–6 and columns 1–6.** Rows and
> columns 0 and 7 belong to the generator.

The stamp (rows/cols 2–4), the mitre seam (d = 2…6) and the catch light (1,1) all
obey it by construction. That is the entire reason the kit is seamless, and it is
the one rule that is expensive to discover late.

Rail marks are the deliberate exception. A mark at `at:[0]` or `at:[7]` sits
exactly where one rail tile abuts the next, so it reads as a plate join or a
stitch rather than a break — iron uses `at:[0]` for the plate seam
(`border-kit.html:459`) and canvas uses `at:[6,7]` for its lacing (`:500`).

The exception has a limit, and it is about halves rather than positions. A
periodic *line* at position 0 survives being cut, because a line has no halves.
A motif with a left half at position 7 and a right half at position 0 gets sawn
apart at arbitrary panel widths. So anything with a silhouette — a rivet, a peg,
a chisel peck — stays whole and inside one tile.

### 2d. Colour: what is actually constrained

**One factual correction before you pick colours.** The mockup claims every value
in the kit comes from `assets/palettes/town_palette.png` or `base.png`, or is an
existing token (`border-kit.html:402-404`). It does not. Both palette files are
16×2 PNGs holding 18 distinct colours each, and none of the kit's greys or browns
appear in either — those two files are the *sprite art* palettes for NPCs,
buildings and town tiles (`static/js/art.js:8-26`), and the UI chrome has always
run on its own token family in `static/style.css:45-88`, which contains no browns
at all and no greys between `#3a3450` and `#5a526b`.

So you are **not** bound to `base.png` or `town_palette.png` for chrome tiles.
What the app genuinely constrains:

| Constraint | Value | Why |
| --- | --- | --- |
| `profile[0]` must be `--bg` | `#0a0a12` (`static/style.css:46`) | panels float on the void; the rim *is* the void |
| `fill` stays in the panel family | near `--panel` `#121220` / `--panel2` `#191928` | 12px body text sits on it |
| Gold stays off the rails | `--gold` `#c9a24b`, `--gold-bright` `#f0d080` | restricting gold to the touchable and the earned is what the border work buys |

Everything between those is open. Twelve values per material plus two or three
stamp values — call it fifteen — and nothing outside the kit needs to agree with
them.

One structural agreement inside the profile is worth keeping even though nothing
enforces it: in all four shipped materials **band 5 equals band 3**. The face
darkens toward band 4 and comes back, so the rail reads as a chamfered face
viewed straight on rather than as a one-way ramp. Break that symmetry and the
rail starts to look lit from one side, which fights the fixed lamp.

### 2e. How a drawn tile reaches the app

Two paths exist, and they are not equally good for this.

**Row strings in `static/js/pixel.js`.** `SPRITES` is a map of `{p, r}` — palette
chars and row strings, `.` transparent (`static/js/pixel.js:2`). `drawSprite()`
paints one into a canvas at an integer scale (`:1058-1074`), `spriteTag()` emits
the canvas (`:1076-1082`), `hydrateSprites()` finds and fills them (`:1084`).

**A served PNG in `static/art/`, registered in `static/js/art.js`.** That is how
portraits (`art.js:27`) and building art (`art.js:79`) work.

**Recommendation: row strings, for the tiles.** Four reasons:

1. The minimal authoring unit is not an image. It is twelve hex values, a 3×3
   stamp and a mark list. Exporting nine PNGs per material throws the generator
   away and turns a one-value edit into thirty-six file rewrites.
2. Cache. `static/index.html` carries `?v=N` on every JS and CSS URL, and bumping
   it is a hard project rule (`AGENTS.md`, safety rule 4) — a tile edited in
   `pixel.js` reaches players on the next bump. Art PNGs are served from bare
   `/static/art/...` paths with no version query (`static/js/art.js:102`), so a
   redrawn PNG can serve stale from a browser cache indefinitely. For chrome that
   appears on every screen, that is the wrong failure mode.
3. Nine tiles × four materials is 36 extra HTTP requests for 8×8 files, against
   zero.
4. It reuses the pipeline that already renders every monster, including the
   `--sprite-tint` hook (`pixel.js:1064`).

One bridge is needed: `spriteTag()` produces a `<canvas>` element, and the kit
needs a CSS `background-image`. The mockup already solves it — rasterize each
tile to an offscreen canvas and take `toDataURL()` into nine custom properties
(`border-kit.html:563-593`). Same data, one extra function.

The exact shape of the addition — a new sibling to `SPRITES` in `pixel.js`,
leaving `SPRITES` untouched:

```js
const BORDER_KITS = {
  iron: {
    profile: ['#0a0a12','#7d8091','#585b65','#484a53','#3f414a','#484a53','#26262f','#0a0a12'],
    fill: '#14141f', fleck: '#1c1c2b',
    catch: '#9ea1b2', seam: '#303239',
    stamp: { p: { o:'#71747f', R:'#adb0be', s:'#2b2d35' }, r: ['oRo','RRs','oss'] },
    marks: [
      { band:[1,2,3,4,5,6], at:[0],   color:'#33333f' },
      { band:[3,4],         at:[3,4], color:'#8e91a0' },
      { band:[5],           at:[3,4], color:'#2e3038' },
    ],
  },
  // oak, stone, canvas
};
```

plus `buildKitTiles(mat)` returning the nine 8×8 colour grids, and `kitVars(mat)`
returning the nine `--tl`…`--fc` data-URI strings, set once per material at boot.
Both are `border-kit.html:525-560` and `:563-593` transcribed.

The backdrop texture in section 3 flips this recommendation — see there.

`border-image` is not an option, and this was measured rather than assumed. It
is the justification for the whole nine-layer approach, so it is recorded in
full.

**The method.** Chromium 141, tiles rendered, the page screenshotted, the
screenshot's pixels read back and run-length counted across the top rail. A rail
counts as exact when every source pixel became a run of identical length
(`border-kit.html:336-339`). All four repeat modes were tested; none is
pixel-exact across device pixel ratios (`:341-354`).

| mode | DPR 1 | DPR 2 | DPR 3 | what goes wrong |
| --- | --- | --- | --- | --- |
| `repeat` | exact only at **even** widths | **always exact** | exact only at **even** widths | the tiling is *centred* in the run, so an odd remainder puts the phase on a half pixel and every tile in the rail jitters 1px |
| `round` | never exact | never exact | never exact | rescales the tile to fit a whole number of repeats — a non-integer scale, so source pixels become blocks of 1 and 2 |
| `stretch` | never exact | never exact | never exact | a source pixel became a 25px smear at width 200 |
| `space` | never exact | never exact | never exact | inserts gaps between tiles; the rail develops holes |

Nine origin-anchored `background-repeat` layers measured exact at DPR 1, 2 and 3
at every width tried, unconditionally, because background phase anchors to the
element origin instead of being centred (`:361-365`).

**The trap is the DPR 2 column.** It rescues `repeat` completely, because the
half-CSS-pixel centring offset lands on a whole device pixel. So `border-image`
looks perfect on every modern phone and in every screenshot, and is quietly
wrong on a 1× desktop monitor at **odd** panel widths — a failure that is
invisible to whoever builds it (`:355-359`). That is why this is written down
rather than left as a preference.

Where the drawing itself lives, per repo convention: editor sources
(`.aseprite`, `.pxo`), palette swatches and superseded drafts go under
`assets/`, mirroring the same subject folders as `static/art/`, and are never
served (`static/js/art.js:23-26`). Draw in an indexed colour mode — it makes an
off-palette pixel impossible rather than merely discouraged, which is what the
band check in 2f tests for.

### 2f. Drawing checklist

**What makes a tile work at 1×**

- The profile has to read as a ramp in *value*, not in hue. Squint at the eight
  swatches: rim dark, chamfer light, face mid, inner shade dark. If two adjacent
  bands share a value the chamfer disappears and the rail goes flat.
- A rail must be quiet. It repeats 68 times across an 1,100px panel
  (`border-kit.html:989`). Anything with a silhouette becomes a stripe pattern.
  Marks are 1–2 pixels, once per 8.
- A corner may be a specific object, because it appears once per panel per corner
  (`border-kit.html:302-304`). That is where the detail budget goes.
- The lamp is fixed: one source, upper-left, 45°, never moves. Highlights on top
  and left faces, occlusion falling down and right. Every step hard — 1px or 2px,
  blur 0, no ramps (`material-chrome.html:97-102`).
- Fleck the fill sparsely: two pixels per 8×8 tile. More and a large panel
  shimmers under body text.

**What breaks it**

- Any hand-placed pixel in row 0, row 7, column 0 or column 7 of a corner. That
  is the seam.
- A stamp larger than 3×3 or offset off (2,2): it collides with the mitre seam or
  the rim.
- Gold in a rail. It re-spends the thing the kit is meant to save.
- Ornament below 40px of content. Handle it by stopping, not shrinking.

**Three mechanical checks, before transcribing anything**

- **Bands.** Cover the marks, the stamp, the catch and the seam. Every remaining
  pixel must be exactly `P[min(distance to each outer edge)]` — no dithering, no
  in-between values, no colour that is not one of the eight.
- **Rail periodicity.** Strip the marks from `t` and `b` and every *column* must
  be identical; strip them from `l` and `r` and every *row* must be. A rail tile
  that fails this will not tile.
- **The corner joins the rail.** Read `tl`'s rightmost column top to bottom, and
  its bottom row left to right: both must be `P[0]` through `P[7]` in order,
  mirrored for the other three corners. This is 2c's seam rule stated as a test.

**The one-pixel-tall-feature trap**

With an 8-value profile on an 8px rail, each band is exactly one pixel tall. A
horizontal feature one pixel tall therefore has no room for both a lit lip and a
shadow wall — there is nowhere to put them. So any incised or bevelled rule
inside a rail (a groove, a plank join, a mortar course) has to *borrow* its relief
from the bands either side: darken **one** row and let the band above serve as the
lit lip and the band below as the shadow wall. Never draw three rows for a 1px
feature.

If a feature genuinely needs its own lip and wall, it is a 3px feature and it does
not fit in an 8px rail — and scaling to `--s:2` does not help, because that gives
you 16 device pixels but still only 8 source rows. Move it to a corner, or draw it
as one pixel, or do not draw it.

**Widths to test at**

A rail whose length is not a whole multiple of the tile gets its last tile
clipped where the corner starts (`border-kit.html:419-422`). This is a reading,
not a bug: on stone it is a closer stone, on canvas a cut hem. But it is only a
good reading if you draw for it.

Because `t` is anchored `left top` and repeats rightward, the clip always eats the
**right-hand** end of the last tile. A mark at position 0 always survives; a mark
at position 7 is the one that can vanish. Canvas's lacing at `at:[6,7]`
(`border-kit.html:500`) is the one that will visibly lose a stitch — either accept
that or move it inward.

Test at: **390** (the phone width the study is drawn against, `border-kit.html:323-328`
— 24 whole 16px tiles plus 6px, so the clip is 6px), **360** (the narrowest phone
worth caring about), **1100** (a full-width desktop panel), and one deliberately
awkward number like **347** so the clip lands somewhere ugly. Then repeat the set
at `--s:1` against multiples of 8, since toasts and tooltips run there.

---

## 3. The backdrop texture spec

This is the second thing to draw, and it is a different problem from a border
tile: it repeats on **both** axes, it must not resolve into a visible grid at
panel size, and it sits behind body text, so it has a hard contrast ceiling that
a rail does not.

**What is being replaced.** The panel textures in the material-chrome study, and
it is worth knowing which of them were already right. The study's own rule was
"all steps are hard: 1px or 2px, blur 0, no gradient ramps"
(`material-chrome.html:101`) — the failure is not ramps, it is *angle*:

| Texture | Verdict | Why |
| --- | --- | --- |
| Oak `.board` (`material-chrome.html:172-175`) | **already pixel-stepped** | all three layers are `180deg`/`90deg`, axis-aligned, hard stops on integer pixels. What ruins it is the `transform: rotate(-0.35deg)` on the same element (`:170`), which resamples the whole board and blurs every one of those crisp lines. |
| Iron `.plate` (`:129-132`) | **half painterly** | the `180deg` layer is crisp; the `45deg` and `-45deg` hatch layers are antialiased along their diagonals. |
| Stone `.slab` (`:228-231`) | **fully painterly** | `29deg` and `-61deg` with 7px and 9px periods — arbitrary angles guarantee subpixel edges that never land on the grid. |
| The ashlar wall (`:218-223`, built at `:1473`) | **already pixel-stepped** | real elements with inset box-shadows, deliberately built that way to stay crisp. |

So one was crisp and got rotated, one was half crisp, one was never crisp. That is
the whole of the painterly problem.

**The spec.**

| Property | Value | Reason |
| --- | --- | --- |
| Tile size | **32×32 native** | 8×8 repeats ~37 times across a 300px panel and shows its diagonal immediately; 64×64 costs four times the drawing for detail the eye cannot resolve behind 12px glyphs. 32 gives ~9 repeats across a phone panel and ~24 across a desktop one. |
| Render scale | **always 1×** | the frame scales with `--s`; the ground does not. A backdrop rendered at 2× has half as many texture cells across a panel and the repeat becomes legible. `background-size: 32px 32px`, full stop. |
| Values | **3, maximum 4** | one base at `--panel` `#121220`, one a hair darker, one a hair lighter, and at most one accent used on fewer than 1 pixel in 40. |
| Contrast ceiling | every texture pixel within roughly ±6% relative luminance of `--panel` | it sits behind 10px and 12px glyphs (`static/style.css:80-82`, `--type-fine` and `--type-body`). Sanity check: if any texture pixel is closer in value to `--ink` `#d8cfa8` than to `--panel`, it is too bright. |
| Steps | hard only, **dither instead of ramp** | where you want a transition, use a 50% checker between two adjacent values or a Bayer 4×4. A dither is made of the same hard pixels as everything else and survives `image-rendering: pixelated`; a ramp does not. |
| Feature size | no feature touching more than ~6 of the 32 pixels in any row | longer runs resolve into stripes once the tile repeats. |

**Seamlessness.** Column 31 has to sit next to column 0 and row 31 next to row 0
with no visible line. Author it in wrap-around/tiled mode, then verify by tiling
it 4×4 into a 128×128 field. The two failure modes are a hard seam line and an
*emergent diagonal* — one over-bright pixel repeating at a fixed offset reads as a
drawn diagonal across the whole panel, and it is invisible in a single tile.

**Test at panel size, not swatch size.** A 32×32 tile at 8× looks like a drawing;
a 780×400 field of it at 1× is what a player sees. Put real content on it — a
`.win` body at 12px with a `.rule` and a table — and check three things: the 10px
fine text is still readable; no diagonal appears when you unfocus your eyes; and
the texture survives a second panel's `6px 6px` cast shadow (`static/style.css:140`)
overlapping it.

**How it reaches the app.** Here the recommendation flips from section 2e: a
32×32 texture is a genuine drawing rather than a parameter set, so it goes in as a
served PNG under `static/art/ui/`, registered in `static/js/art.js` alongside the
existing manifests. One caveat that follows from `art.js:102` building bare
`/static/...` paths with no version query: version the *filename*
(`panel_weave_v1.png` → `_v2`) rather than editing a file in place, or a redraw
will serve stale from browser caches.

---

## 4. The icon list, ranked and scoped

| Icon | Replaces | Sprite | Frames | Containment |
| --- | --- | --- | --- | --- |
| **Raven** | the `SEND RAVENS` key in the footer | **16×14**, rendered at 48px (3×) with a 60×52 tap target (`detail-pass.html:1597`, `:143`) | 9 — perch, blink, turn, ruffle, ready, launch ×2, news, lost | widest of the set: every screen's footer. Also fixes a real gap — phones currently have no send-ravens control at all (`detail-pass.html:882`) |
| **Bolts / nails** | nothing; adds to `.win` (`static/style.css:137`) | **4×4** | 3 variants, rotated so no two corners match | most contained thing here. Gate to `.win` only (`detail-pass.html:512`) |
| **Panel title** | `.win > .win-title`'s `--bg` cutout (`static/style.css:145-147`) | no sprite — CSS | — | one rule plus a margin bump, `14px 4px` → `16px 4px`, or titles clip the panel above (`detail-pass.html:546-548`) |
| **Bell + sacking** | the `SOUND: ON` / `SOUND: OFF` key label | **14×14** | 4 — still, ring-left, ring-right, muffled | one control; the key, its travel and its latched state are untouched |
| **Streak flame** | the `flamewob` CSS tween (`static/style.css:313`, keyframes `:1268`) | **10×10** | 4; frame 1 *is* the shipped `icon_flame`, pixel for pixel | header only, purely additive. Retires the last piece of sub-pixel tweened motion in an app that is otherwise all `steps(1, end)` |
| **Toast scrap + tack** | `.toast` (`static/style.css:951`) | tack **6×6**; the scrap is a `clip-path` polygon | 1 | one component. `.err` keeps `--danger-ink` on the same scrap |
| **Quill** | the block caret in `typewrite()`, called from `giver.js:386` and `:1195` | **6×9** | 2 | one function |
| **Candle** | a duration meter that does not exist yet | **8×14** plus the flame | 5 | parked — see below |
| ~~Moth~~ | — | 8×6 | 2 | **cut** |

**Two facts behind the raven's rank, both checked against the repo.** First,
*there is no raven drawn anywhere in it.* `static/js/pixel.js` has no raven
entry, `assets/` holds only `palettes/` and `templates/`, and nothing under
`static/art/` matches the name. Ravens are the game's oldest metaphor and they
exist only as copy, in `app.js`, `town.js`, `giver.js` and `misc.js`. The frames
in `detail-pass.html` are the only raven the project has ever had, which is why
`raven-sheet.png` is kept. Second, *there is no way to send one from a phone.*
`static/js/app.js:483` is the plain `SEND RAVENS` key, and
`static/style.css:2674` sets `.footer-btns { display: none; }` inside the
`@media (max-width: 719px)` block that opens at `:2570`, so the whole footer row
is hidden at 719px and below. The only remaining path is Settings → APIs → Save
& Send Ravens (`static/js/misc.js:942`), which also rewrites the athlete
credentials — while the status line goes on telling the player when the ravens
last flew. That is a defect rather than a taste question, and adopting the raven
is what fixes it.

Ordering, if it helps: nails first (an afternoon, and every panel stops being a
rectangle), then the raven (most work, biggest payoff, fixes a defect), then the
title, bell and flame. Toast and quill after. The only shortlist item Joe did not
name and did not rule out is the notched scrollbar (`detail-pass.html:894-895`) —
pure CSS, no sprite, cheap whenever. The wax seal here — the seal sprite gating
genuinely destructive actions, not the parchment title strip ruled out in
section 0 — and the drawn empty states were already self-held in the mockup and
stay held.

### The candle is parked

Joe likes the concept and it stays on the list. Nothing in the app is the right
clock for it today, so it is parked rather than scoped — there is no work to
sequence here yet, and it should not be drawn against a duration invented to
justify it.

The engineering point that parks it: a burn-down needs a real duration with a
known start, a known end, and a fraction the app can read at any moment, and the
Everbright Torch the mockup names (`detail-pass.html:824`) is a consumable with
`effect: {"reveal": True}` (`app/items.py:13`) — a one-shot reveal that fires
once and is gone, with no duration to map onto. Two durations that do exist are
the Siege week (`raid.week_start()` at `app/raid.py:149` and `week_key()` at
`:139`) and the Rest Writ's single calendar day (`writ_day` fixed at acceptance,
`resolve_rest_writs()` completing it when `today() > writ_day`,
`app/quests.py:471-493`). Either could carry a candle if one later turns out to
want one; neither is being recommended now.

The mockup's own caveat stands and is a second reason to leave it parked: the
app's existing meters — the XP bar, the ten vigor pips — are read at a glance,
and a candle is worse at that (`detail-pass.html:820-825`). Five frames over a
week is a step every 1.4 days, which is coarse. If it ships, it probably wants a
wax pool that grows continuously beneath a stepped stub, so the coarse part is
the stub and the fine part is the pool.

---

## 5. The drawn-title execution fix

### The diagnosis

Drawn lettering carries no text. `title_hall` is a 117×16 bitmap of the words
(`type-wordmark.html:991`), not glyphs the app can compose. So a title that
interpolates — `Joe, Level 22`, `The Courier's Route`, a monster's name, a routine
the player named — **cannot be drawn at all**, because the string does not exist
until runtime. That is not a quality problem, it is a category problem, and a
large share of the game's panel titles are data.

The second half is economics. A wordmark is read once. A `.win-title` treatment
repeats on thirty panels and gets read thirty times, and every pixel spent making
the letter *look* carved is a pixel spent making it slower to parse. Ornament
earns its cost where reading happens once and ceremonially; it charges rent
everywhere else.

| Drawn lettering earns it | Drawn lettering does not |
| --- | --- |
| The wordmark | `.win-title` — the string that both repeats most and varies most |
| Screen titles that never change (THE HALL, THE TOWN, THE UNDERCROFT) | Anything interpolating a name, count or date |
| Illuminated drop caps (`type-wordmark.html:541-543`) | Tab labels, chips, buttons |
| Ceremony and death copy | Anything under 10px, which is the hard floor for anything drawn (`type-wordmark.html:813`) |

Which means the panel title's answer is not a drawn one at all. It is the strap or
the carve — both CSS applied to live text, both of which keep interpolation
working. That is the same conclusion the detail pass reached from the other
direction (`detail-pass.html:521-551`).

### The critique of the actual glyphs

Measured off the row strings in `type-wordmark.html:991`, not eyeballed.

**The four-value family** (`markA`, `title_hall`, `title_town`, the numerals).
Every vertical stem is literally `H F I S`: one column `#f0d080`, one `#c9a24b`,
one `#3a2c10`, one `#6b5426`.

- *Stem weight.* The stroke measures 4px but only two columns are lit, so the
  letter reads at about half the weight it occupies, and the `#3a2c10` column
  reads as a gap between the letter and its own shade rather than as part of the
  stroke. There is no flat face anywhere in the letterform — every column is a
  different value — and a letter with no face gives the eye nothing to lock onto
  at speed. **Fix:** give the face 2px of one value, keep highlight and shade at
  1px each, and either drop the fourth value or restrict it to terminals.
- *Spacing.* In `title_hall` the glyphs are 12–15px wide, the sidebearings are
  **3px**, and the H's counter is **5px**. A counter wider than the sidebearing
  inverts the relationship that makes words look like words — `HALL` reads as four
  verticals with the wrong gaps between them. Word space is 12px, which is fine.
  **Fix:** sidebearings to 5–6, or counters to 3–4. Hold one of the two constant
  across the whole set.

**The three-value carved family** (`title_mantel`, `title_writ`,
`title_doctrines`, `title_omens`, `title_ledger`). Stems are `K M L`: `#0a0806`,
`#6b5426`, `#f0d080`.

- *The carve is right; the surface is wrong.* `K` is `#0a0806`, which is **darker
  than `--bg` `#0a0a12`** (`static/style.css:46`). In the panel title's current
  position — floating over the void — the shadow wall of every stroke vanishes,
  and what is left is a 1px bright hairline attached to nothing. A carved letter
  needs something to be carved into. This is the single biggest reason the
  execution reads badly, and it is also the strongest argument for the textured
  backdrop: the carve starts working the moment there is a surface behind it.
- *The strokes are too heavy for the cap height.* 3px stems at 13px cap height,
  and the counters do not keep up: the **H's counter is 2px**, the N's is 3px, the
  M's is 5px. So the colour of the line is wildly uneven — M reads open, H reads
  as a solid blob — and the H's counter (2) is half its own sidebearing (4), which
  is backwards. At 13px a 3px stem wants a 4px counter minimum. **Fix:** either
  drop the stem to 2px (`K L`, no mid) or raise the cap height to 16px and keep
  the 3px stem.
- *The `A` follows three different rules at once.* Its diagonals are 2px (`K L`)
  where every vertical is 3px (`K M L`), so they carry no face colour and read
  lighter than their neighbours. Its apex counter is **1px** at row 2, which will
  close up under any resampling. And its crossbar's interior is `K K K` — dark —
  where every other stroke's interior is `M`. Pick one and apply it to all three.

**Common to both families.** `title_hall` is a *raised* letter (lit top and left,
shaded bottom and right) and `title_mantel` is an *incised* one (dark upper-left
wall, lit lower-right lip). Both are correct for a lamp at upper-left 45°
(`material-chrome.html:97-102`), so they do not contradict each other — but
shipping both means the player learns two title languages for no gain. Pick the
rule and hold it: **raised for what is fixed onto a thing, incised for what is cut
into it, nothing else.**

**What needs no fix.** The illuminated capitals — 24×24, a struck 2px double
border, a field, a plant ornament and a capital inside
(`type-wordmark.html:541-543`) — are the part that works. They are read once, at
the head of a paragraph, exactly where ornament is paid for. Their stated limits
hold: at least three lines of copy beside one or drop it entirely
(`type-wordmark.html:610-614`), and nothing drawn below 10px.

### One rule with no user, and two files with no rule

Not a drawing problem, but it is the state of the type shelf and it should not
be lost. `quanta-strike-18-regular.woff2` (8,840 B) and
`quanta-strike-20-regular.woff2` (9,792 B) both sit committed in `static/fonts/`
and are named nowhere: `static/style.css` declares `@font-face` for the 10, 12,
12-bold, 14 and 16 strikes only, and a repo-wide search for `quanta-strike-18`
or `-20` outside the mockups returns nothing. The reverse is true of
`vt323.woff2`, which has an `@font-face` at `static/style.css:2-5` and is
applied to nothing at all — `DESIGN.md:103` already records it as a legacy asset
outside the active default. So two committed strikes are unreachable type sizes,
and one loaded face has no user. Anything ceremonial that wants to be set rather
than drawn already has the bytes for it on disk.

---

## 6. Where this meets "places, not menus"

If some menu entries become scenery objects you click in a scene, then a click is
a transition from *being in a place* to *being handed a thing*. The frame kit is
the thing. Three consequences follow.

**The material rule survives, but it re-anchors — and improves.** Today the rule
is "material follows permanence and consequence, never screen or feature"
(`border-kit.html:292-296`). In a places world, permanence and consequence are
properties of the **object you clicked**, not of the screen you routed to. The
gate is stone because the gate is stone. Clicking Pip's stall hands you canvas
because the stall is canvas. That is strictly better than the current version: the
material stops being a taxonomy somebody has to assign consistently and becomes a
fact about an object, which is what will keep it consistent as scenes get built by
different passes months apart.

**Different menus for different occasions falls out for free.** A material is
twelve hex values and a 3×3 stamp. A fifth or sixth set — brass for a betting
board, something colder for whatever the Vale gets in winter — is an afternoon
each, not a design system. The vocabulary extends in exactly the direction the
places thread wants, without anything downstream changing.

**Genuine menus stay genuine menus.** Not everything becomes a place. Settings is
a menu: it gets the border kit as its chrome plus a textured backdrop behind it,
and no scene owes it anything.

**The boundary, so the two threads do not collide.** The places thread owns the
scenes — what is drawn where, what is clickable, how a click reads as walking up
to a thing. This document owns the chrome a click hands you — the frame, its
material, its backdrop, its title. The seam between them is one call: a scene
names a **material** and a **title** when it opens a panel, and nothing else
crosses. If the places thread ever finds itself needing to specify what a panel
*looks* like, that is the signal the boundary has slipped.

---

## 7. Seams, in order

**1 — The tile grid and the four materials, on `.win` only.** Build
`BORDER_KITS`, the generator and the nine-layer background rule; apply it to
`.win` at `--s:2` and to nothing else. This is the foundation, and it settles the
two things that are expensive to get wrong later: the 8px grid and the seam rule.

**2 — The chrome audit at `--s:1`.** Menus, toasts, bubbles and tooltips take the
kit at half scale; rows, dividers, cards and chips keep their 2px bevel and are
not touched. This is where roughly thirty panel-ish classes get triaged
(`border-kit.html:426-429`), and it needs seam 1 shipped so the triage is judged
against real tiles rather than a mockup — the audit will surface three or four
surfaces that are neither a panel nor a chip, and those need a real frame in front
of them to decide.

**3 — The backdrop texture.** One 32×32 tile, applied behind the kit. It comes
after 1 and 2 because it has to be judged against the frame sitting on it and the
type sitting on it, and because it is what makes the carved title in seam 4
possible at all.

**4 — The title, then the icons.** The strap or the carve on `.win-title` (CSS on
live text, so interpolation keeps working), then the named icons in their own
order: nails, raven, bell, flame, toast, quill. Each is independent of the others,
and none blocks anything — which is exactly why they go last.

**Brief seam 1 first.** It unblocks 2, 3 and the title, and it is the only one
where a wrong decision is expensive to undo. A tile drawn on the wrong grid gets
redrawn; a nail on the wrong panel is a one-line change.

### What seam 1 obliges in `DESIGN.md`

`DESIGN.md` is binding on `static/style.css`, and two of its sections describe a
`.win` that the kit replaces. Both need amending **in the same change that ships
seam 1**, and neither should be amended before it. Flagging it here so it is not
discovered late; nothing in this document edits either one.

**`DESIGN.md` §5, "Pixel Window (`.win`)"** specifies the appearance as "`--panel` surface,
`2px` `--gold` border, hard concentric rings, an offset block shadow, and a title
cut out against `--bg`" (`DESIGN.md:214-215`) and the spacing as "`14px` padding
and vertical margin with a `4px` outer side margin" (`:216-217`). Clause by
clause against the kit:

| `DESIGN.md` §5 clause | what the kit does |
| --- | --- |
| `--panel` surface | the `c` fill tile, per material |
| `2px` `--gold` border | no `border` property at all; nine painted background layers |
| hard concentric rings (`static/style.css:140`) | band 0 does the ring's job, inside the tile |
| title cut out against `--bg` (`static/style.css:145-153`) | a plaque nailed to the rail — same span, same text, new rule (`border-kit.html:386-388`) |
| `14px` padding | `calc(var(--u) + 7px) calc(var(--u) + 9px)` (`border-kit.html:789`) |
| offset block shadow | survives, moved onto the 8px grid |

**`DESIGN.md` §7, "Depth & Surface"** states the strategy as "borders plus tonal
pixel windows" (`DESIGN.md:573-575`) and makes the `--edge-lit` / `--edge-shade`
neutral bevel the marker of every raised surface (`:593-597`). A kit surface has
neither a two-pixel border nor a neutral bevel — it has a material. That
section's raised-surface contract is where the two systems have to agree on
which surfaces are which.

**One measurement to settle before drawing anything that depends on it.**
`static/style.css:140` casts `6px 6px 0 rgba(0,0,0,0.5)`. The mockup's shipping
CSS block says `8px 8px 0 rgba(0,0,0,0.55)`, so panel and shadow sit on one 8px
grid (`border-kit.html:802`). The mockup's own live `.p9` rule uses
`calc(3px * var(--s))` at alpha `.55`, which is 6px at `--s:2`
(`border-kit.html:78`). The mockup disagrees with itself; pick one. Nothing in
section 2 depends on the answer, but section 3's shadow-overlap test should use
whichever value wins.

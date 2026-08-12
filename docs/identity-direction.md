# Identity direction

The chrome becomes drawn art. The border kit is the foundation; everything else
either sits on it or waits for it. This document exists so the drawing can start
without a follow-up question — section 2 is the spec that blocks a pixel editor,
section 3 is the half of it that sits behind body text, and the rest is scope.

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
- **`material-chrome.html`** — Joe's ruling is that the border kit trumps it, so
  what is left is one constraint and one idea. The constraint is **00, "The lamp,
  and the rule it makes"**, which fixes the light source for everything drawn here
  (`material-chrome.html:97-102`) and is cited throughout section 2. The idea is
  **04, "The title, five ways"** — the title variants, which are still the one
  part of the study he likes, and which he is redrawing. The panel textures in
  **01–03** are no longer a deliverable of their own; they survive as the nearest
  prior art for what the kit's fill tile paints, and section 3 triages them in
  that role. Everything else is cut: the plate/board/slab construction, the ashlar
  wall as a built surface, the per-material key sets, nesting, the side-by-side,
  the phone case and the cost count. The wax-sealed **parchment** title strip
  (`material-chrome.html:280`, `:725`, `:965`) is not a surviving variant either,
  because parchment is cut — including as a title label, per the table in
  section 1.

There are no page captures on the branch. The mockups are self-contained,
dependency-free HTML with no build step: open the file.

## 1. What was decided

| Option | Verdict | What carries forward |
| --- | --- | --- |
| The Modular Border Kit | **Adopt** | All of it, as the foundation, and it now absorbs the interior of the box as well: the centre tile is the material background, not a flat fill behind one. Nine 8×8 tiles per material; four materials with the meanings rewritten (2g); a possible fifth for the Siege. Sections 2 and 3. |
| The Detail Pass | **Partial** | Adopted: raven, bell, hanging title panel, streak flame, toast scrap, notched scrollbar, quill. Rewritten into something better: the wax seal. Dropped: corner nails, made redundant by the kit's own corners, and the ribbon on the tab. Held: candle, moth. Left undecided: the drawn empty states. Section 4. |
| Material Chrome | **Partial** | The title variants, and nothing else — "border kit trumps everything else." The lamp rule (`material-chrome.html:97-102`) survives as a constraint rather than as a design, and the panel textures survive only as reference for the fill tile. Section 3. |
| Type, Titles & Wordmark | **Adopt, with work** | The wordmark, the fixed screen titles, "stop shouting" and the illuminated capitals. All of it needs hand-pixel tightening for readability, settled placement, and a set of rules for which face is used where — rules that do not exist yet. Section 5. |
| Scroll & Parchment | **Cut** | Nothing. Not settings, not as a vellum material in the kit, not as a title label, not anywhere. Everything describing it has been deleted from the branch. Beyond the correction below, it is named again in two places only: section 0, to rule out the one title variant that used it, and 2g, where the contrast figures the study measured survive as the evidence behind section 3's dark-ground ruling. |
| Palette Studies | **Hold** | Nothing now. Gold gets restricted to the touchable and the earned, but that restriction rides in on the border work. |

One correction, so nobody reopens it: a draft of this document briefly listed
parchment as the fourth kit material, on a wording slip — the fourth material is
**canvas** (2g), and parchment stays cut.

### One ruling that reversed

This one read the other way in an earlier version of this document. It is
recorded as a reversal rather than quietly rewritten, because anyone who saw the
first ruling needs to know it changed, and because the cut should not be
re-applied by someone working from the old text.

**The moth is held, not cut.** This document marked it cut, following the
mockup's own ranking (`detail-pass.html:844-853`, which ranks it last and says to
cut it first). Joe now wants it kept while he thinks about a future for it — a
little butterfly or a moth appearing on screen now and then. Held is not adopted:
it is not scoped, it is not sequenced, and it is not in the seam list. It sits in
the background of the thinking, which is exactly where he put it.

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
pretending to be a hierarchy, and the fill tile is being drawn onto that ground.

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
| `fill` + `fleck` | 2 hex values *today* | the centre tile: flat fill with exactly two fleck pixels, at (2,5) and (6,1) (`:534-535`). This is the one input that outgrows its row — the centre tile is the interior ground of the box, and section 3 is its real spec |
| `catch` + `seam` | 2 hex values | corners only — the catch light and the mitre diagonal |
| `stamp` | **3×3** char grid + 2–3 colours | the corner ornament (`:457`, iron is `['oRo','RRs','oss']`) |
| `marks` | a handful of `{band, at, color}` | the 1–2px rail texture (`:459-461`) |

That is about twelve hex values and nine stamp cells per material — the mockup's
own estimate is roughly forty hand-placed pixels each (`border-kit.html:267-268`).
That estimate is still right for the *frame*. It is no longer right for the whole
material, because the fill is now a drawn ground rather than two hex values; see
section 3.

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

This now covers the interior ground too. Section 3 used to flip the recommendation
for it; the merge un-flips it, and all nine tiles take the same path.

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
  shimmers under body text. Treat that as the floor rather than the spec — once
  the fill is the interior ground it has to satisfy section 3, which is a harder
  brief than "two flecks" and points the same way.

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

### 2g. What each material means, and what its ornament is

The kit's own rule is "material follows permanence and consequence, never screen
or feature" (`border-kit.html:292-296`), and four `why` strings implement it in
the data (`:463`, `:476`, `:490`, `:504`). The rule survives, and so do the four
materials. What is rewritten is the readings under it.

| Material | What it means | Where that lands |
| --- | --- | --- |
| **Iron** | where things are built, manufactured, ventured | the Forge, the Undercroft, the Colosseum — a workshop, not a threat |
| **Oak** | showing listings and advertising wares — a daily specials board at a cafe | shops, offers, anything on sale for now |
| **Stone** | things that last or stand with time, carved rather than written | Settings, and any "about" surface that states the doctrines or the methodology |
| **Canvas** | pitched for the day and struck at dusk — and so a quick note, an entry from somewhere, the feel of filling out a check | short entries and quick records; market stalls, the Crankwerk, the Menagerie, toasts |

**"Anything that can hurt you" is gone.** It was iron's `why`
(`border-kit.html:463`) and Joe rejected it by name: it does not sound like this
game. Iron is where work happens.

**Canvas is the mockup's own reading, sharpened rather than replaced.** The
mockup already has it as "anything pitched for the day and struck at dusk"
(`border-kit.html:504`), with market stalls and toasts in its domain (`:503`).
Joe's reading — a quick note, an entry from somewhere, the feel of filling out a
check — is the same thought taken from the writer's end instead of the
stall-holder's: both are about the temporary and the immediate, the thing put up
now and not meant to outlast the day. The row above is deliberately both at once,
because a material that means only "temporary" says nothing about what goes
*inside* it, and a material that means only "a quick note" loses the market
stalls the mockup already assigned to it.

**Canvas is dark, like the other three — and this is the measurement that
settled it.** "The feel of filling out a check" invites a light field, because
a surface you write on reads lightest, and that reading is the one thing canvas
gives up by being dark (section 3 rules every material's fill dark and subtle).
It gives it up for a measured reason. The deleted scroll study took the
measurement on a vellum field, as an argument about a whole theme; that argument
is gone, but the numbers are still numbers, and they are why the ruling went the
way it did. Read out of
`docs/mockups/identity/scroll-parchment.html` at commit `0eb18bd` — the file is
gone from this branch and is not being restored, so the figures are recorded here
instead. Every bare `:n` in this entry is a line in that file at that commit:

| On the vellum field `#d8cfa8` (`:118`) | Measured | The study's replacement |
| --- | --- | --- |
| `--gold #c9a24b` | **about 1.5:1** (`:1325-1326`) | `--gilt #8a6a1e` at ~4.4:1 (`:1326-1327`, `:128`) |
| `--green #7ab55c` | **2.1:1** (`:1341`) | `--leaf #3d6a2a` (`:129`) |
| `--blue #6aa0c8` | **2.4:1** (`:1342`) | `--lake #2f5a7a` (`:130`) |

The field colour is not an invention. `#d8cfa8` is the app's own `--ink`
(`static/style.css:53`), which is why the study's own comment on that token calls
the field "identical to `--ink`". Read those figures as a bill rather than a
warning: gold at 1.5:1 is not dim, it is illegible, and every gold-accented
thing that landed inside a pale panel — a title, a key label, a stat label —
would have needed a darker twin or would have had to stay out. That is what a
light canvas would have cost, and it is the cost the dark ruling declines.
Nobody is drawing a pale ground, so this is history rather than a hazard to
watch for.

**A possible fifth: the Siege.** The Siege either keeps the ominous red borders it
has now, or it gets a border built for it from scratch — Joe's words are
"grotesque and creepy", something harrowing rather than a heavier iron. This is an
open direction, not a decision. If it is taken it is a fifth tile set to draw, on
the same twelve-values-and-a-stamp budget as the others, and it is the one place
in the kit where the brief is to be unpleasant on purpose.

**Ornament can go much further than the 3×3 stamp.** What ships is deliberately
minimal — a driven rivet, a pale peg, a chisel peck, a punched grommet
(`border-kit.html:861-864`). Joe wants the vocabulary pushed:

| Material | Ornament to try |
| --- | --- |
| Oak | vines crawling along the rail |
| Stone | chips knocked out of the edges |
| Iron | patches soldered onto the plate |
| Any | little bugs |

All of it still obeys 2c. A silhouette — a bug, a chip, a soldered patch — stays
whole inside one tile, or an arbitrary panel width saws it in half. The vine is
the interesting case, because a vine is precisely the motif that wants to run
*between* tiles: it has to be drawn either as a periodic line, which has no halves
and survives being cut, or as a corner object, which is drawn once. A creeper that
crosses the tile boundary as a creature will not survive the repeat.

**The hanging signage is the part Joe singled out.** The plaque — the title as its
own miniature kit box at `--s:1`, nailed over the top rail rather than notched
into it (`border-kit.html:84-95`) — is the detail he called out as really fun, and
he named the three the mockup hangs: Doctrines of Grunhilda (`:971`), The Long
Road (`:987`), The Descent (`:999`). The detail pass reached the same conclusion
from the other direction (section 4). Titles hang; that one is settled.

---

## 3. The interior ground, which is now the fill tile

**This used to be a separate spec. It is not one any more, and that is the
largest structural consequence of Joe's note on the fill.**

His observation is that the centre tile can be the material background of the
interior of the box, not merely something flat behind it. Checked against the
mockup, that is already literally true. `--fc` is the last entry in the nine-layer
`background-image` list, which makes it the **bottom** layer; it is the one layer
set to `repeat` on both axes, positioned `left top`, and it is painted across the
whole element box with the eight frame layers over the top of it
(`border-kit.html:73-77`). There is no second surface underneath waiting for a
backdrop texture. The backdrop *is* `--fc`.

So the two are one piece of work, not two. A separate 32×32 backdrop tile would be
a second tiled layer painting exactly the pixels the fill layer already paints, at
a different period, per material — two grounds beating against each other for no
gain. Section 7's seam list is updated to match: the backdrop is no longer its own
seam, it is part of seam 1, and the drawing budget in 2b grows accordingly.

**What does not merge, and has to be settled before drawing.** The old backdrop
spec pinned two numbers that the fill layer contradicts:

| The old spec said | The fill layer does | Consequence |
| --- | --- | --- |
| tile is 32×32 native | the fill tile is 8×8 like the other eight (`border-kit.html:446`) | an 8×8 ground repeats every 16px at `--s:2` and every 8px at `--s:1` — a far tighter period than any texture survives without reading as a grid |
| render always at 1× | `background-size: var(--u) var(--u)` is a single value applied to all nine layers (`border-kit.html:77`), so the ground scales with the frame | the ground gets *coarser* exactly where the panel is largest, which is backwards |

Both are fixable by one edit rather than a redesign: `background-size` takes a
per-layer list, so the eight frame layers keep `var(--u) var(--u)` and `--fc` takes
its own value. That is the entire mechanical cost of the merge, and it is a CSS
change, not a drawing one.

Which size wins is a real choice and it is deliberately left open. **8×8 at `--u`**
keeps the kit uniform — nine tiles, one authoring path, one scale — at the cost of
a repeat period so short that little but noise survives it. **32×32 at a fixed 1×**
buys a ground that can carry a weave, a grain, or a course of stone without
collapsing into a check, at the cost of the fill tile no longer being the same kind
of object as the other eight. The texture work wants the second; the generator
wants the first. Draw one of each at panel size before deciding.

**The ground is dark, for all four materials.** This was a fork in an earlier
version of this document, attached to canvas. It is not one any more, and it was
resolved wider than it was asked. In Joe's words:
*"honestly i think the tiles for all of them should be dark, and mostly subtle. so
you can tell that the tile retains the texture of the border, but not so much that
it's jarring or we'd have to rework our texts/colors in order for everything to
work."*

Iron, oak, stone and canvas: every fill tile is dark. There is no light variant
of any material and no per-material exception — the reading canvas gives up by
being dark is priced in 2g, and the price was worth paying.

**The two-sided constraint, which is the thing to hold while drawing.** "Dark and
subtle" is the ruling; the drawing instruction underneath it is that the fill has
to do two things that pull against each other. It must be recognisably **the same
material as its own rails** — the same palette family and the same mark
vocabulary, so a stone panel's interior reads as stone and an oak one reads as
oak, rather than as generic noise with a frame around it. And it must sit **far
enough below the rails in contrast** that it never competes with the body text
lying on top of it. Same material, much quieter. Both failure modes are real and
they are opposite: a ground the eye can name while reading a table is too loud,
and a ground that could be swapped between two materials without anyone noticing
has stopped being the material at all.

**What "mostly subtle" is in numbers.** The measurable version of the ruling is
already in this section and does not need reopening: every texture pixel within
roughly ±6% relative luminance of `--panel`, three values and at most four, and
dither rather than ramp. Those figures predate the ruling and are unchanged by it
— they are what it means, stated so a tile can be checked rather than argued
about. See the constraints table below.

**One conflict this closes.** 2d requires the fill to stay in the panel family,
near `--panel` `#121220` or `--panel2` `#191928`, because 12px body text sits on
it, and a light canvas tile would have broken that constraint the moment it was
drawn. With dark settled for all four, that rule and the material reading agree,
and there is nothing left to reconcile.

**It also changes the stakes of the size question above, without deciding it.** A
low-contrast ground shows its repeat period far less than a high-contrast one:
what makes a short period resolve into a visible grid is a pixel bright enough to
be tracked from one repeat to the next, and that ceiling caps how bright any
pixel may be. So the coarse-repeat risk that made **8×8 at `--u`** the worrying
option drops substantially. It does not vanish — an emergent diagonal is a
pattern rather than a brightness, and 16px is still 16px — and nothing here
picks a size. Draw one of each, as above.

Everything below is the drawing brief for that tile. None of it changed when the
seam merged — it repeats on **both** axes, it must not resolve into a visible grid
at panel size, and it sits behind body text, so it has a hard contrast ceiling that
a rail does not.

**What it is drawn against.** The panel textures in the material-chrome study.
They are no longer a deliverable of their own — Joe's ruling is that the kit
trumps them — but they are the only prior art for what a material's interior looks
like, and it is worth knowing which of them were already right. The study's own rule was
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

**The drawing constraints.** These are unchanged by the merge and they now attach
to the fill tile whichever size it ends up being. The two rows that used to head
this table — tile size and render scale — are the open question above, and the
numbers behind them are worth keeping in front of you while you decide: an 8×8
ground repeats about 37 times across a 300px panel and shows its diagonal
immediately, 32×32 gives about 9 repeats across a phone panel and 24 across a
desktop one, and 64×64 costs four times the drawing for detail the eye cannot
resolve behind 12px glyphs.

| Property | Value | Reason |
| --- | --- | --- |
| Values | **3, maximum 4** | one base in the panel family, one a hair darker, one a hair lighter, and at most one accent used on fewer than 1 pixel in 40. The base is dark for every material, canvas included, so there is no inverted form of this rule; an accent is still checked against the ceiling below rather than against the material. |
| Contrast ceiling | every texture pixel within roughly ±6% relative luminance of `--panel` | it sits behind 10px and 12px glyphs (`static/style.css:80-82`, `--type-fine` and `--type-body`). Sanity check: if any texture pixel is closer in value to `--ink` `#d8cfa8` than to `--panel`, it is too bright. |
| Steps | hard only, **dither instead of ramp** | where you want a transition, use a 50% checker between two adjacent values or a Bayer 4×4. A dither is made of the same hard pixels as everything else and survives `image-rendering: pixelated`; a ramp does not. |
| Feature size | no feature longer than about a fifth of the tile in any row — ~6 pixels at 32×32 | longer runs resolve into stripes once the tile repeats. |

**Seamlessness, on both axes.** The last column has to sit next to column 0 and
the last row next to row 0 with no visible line. Author it in wrap-around/tiled
mode, then verify by tiling it 4×4. This is a *different* rule from 2c, and the
difference is worth being clear about, because 2c reads like it governs all nine
tiles. It does not govern this one. 2c reserves rows and columns 0 and 7 for the
generator so that a corner meets its rails without a join — but the fill layer is
painted **underneath** all eight frame layers, so its outermost pixels are covered
by the rails wherever the panel ends. The fill tile never meets a rail edge-to-edge;
it only ever meets copies of itself. Its edges are therefore free of 2c and are
instead the hardest part of the drawing. The two failure modes are a hard seam
line and an
*emergent diagonal* — one over-bright pixel repeating at a fixed offset reads as a
drawn diagonal across the whole panel, and it is invisible in a single tile.

**Test at panel size, not swatch size.** A tile at 8× looks like a drawing; a
780×400 field of it at 1× is what a player sees. Put real content on it — a `.win`
body at 12px with a `.rule` and a table, inside the actual frame — and check three
things: the 10px fine text is still readable; no diagonal appears when you unfocus
your eyes; and the texture survives a second panel's `6px 6px` cast shadow
(`static/style.css:140`) overlapping it.

**How it reaches the app.** The old recommendation here was a served PNG, on the
argument that a 32×32 texture is a genuine drawing rather than a parameter set.
That argument dies with the merge. The fill tile is one of the nine layers the kit
already rasterizes to a data URI through `kitVars()` (`border-kit.html:563-593`),
so it reaches the app on exactly the path section 2e recommends for everything
else, and it inherits the cache behaviour that made row strings the right answer
there — a `?v=N` bump in `static/index.html` ships it, where a bare
`/static/art/...` PNG can serve stale indefinitely (`static/js/art.js:102`). One
material's ground is a bigger blob of source than one material's profile, and that
is the only thing that changes.

---

## 4. The icon list, ranked and scoped

| Icon | Verdict | Replaces | Sprite | Frames | Containment |
| --- | --- | --- | --- | --- | --- |
| **Raven** | **Adopt** — "excellent" | the `SEND RAVENS` key in the footer | **16×14**, rendered at 48px (3×) with a 60×52 tap target (`detail-pass.html:1597`, `:143`) | 9 — perch, blink, turn, ruffle, ready, launch ×2, news, lost | widest of the set: every screen's footer. Also fixes a real gap — phones currently have no send-ravens control at all (`detail-pass.html:882`) |
| **Bell + sacking** | **Adopt** — "excellent" | the `SOUND: ON` / `SOUND: OFF` key label | **14×14** | 4 — still, ring-left, ring-right, muffled | one control; the key, its travel and its latched state are untouched |
| **Panel title** | **Adopt, hanging** | `.win > .win-title`'s `--bg` cutout (`static/style.css:145-147`) | no sprite — CSS | — | it hangs over the rail as the kit's plaque does (`border-kit.html:84-95`), not as a cutout. One rule plus a margin bump, `14px 4px` → `16px 4px`, or titles clip the panel above (`detail-pass.html:546-548`) |
| **Streak flame** | **Adopt** — "much better" | the `flamewob` CSS tween (`static/style.css:313`, keyframes `:1268`) | **10×10** | 4; frame 1 *is* the shipped `icon_flame`, pixel for pixel | header only, purely additive. Retires the last piece of sub-pixel tweened motion in an app that is otherwise all `steps(1, end)` |
| **Notched scrollbar** | **Adopt** | the shared scrollbar treatment (`static/style.css:971-1014`) | none — CSS only | — | `::-webkit-scrollbar` only; Firefox keeps `scrollbar-width: thin` and is no worse off (`detail-pass.html:744-746`) |
| **Quill** | **Adopt** | the block caret in `typewrite()`, called from `giver.js:386` and `:1195` | **6×9** | 2 | one function |
| **Toast scrap + tack** | **Adopt, shape open** | `.toast` (`static/style.css:951`) | tack **6×6**; the scrap is a `clip-path` polygon | 1 | one component. `.err` keeps `--danger-ink` on the same scrap. Whether it stays its own drawing or becomes a canvas kit box is open — see below |
| **Wax seal** | **Adopt, rewritten** | `confirmModal()` (`detail-pass.html:655`, sprite `:1251-1252`) | **12×12** | 4 — whole, two cracking, broken | not decoration on a dialog any more; the dialog becomes a letter. See below |
| **Empty states** | **Neither** — "take it or leave it" | the muted-text empties (`detail-pass.html:760`) | drawn, one per screen | — | many screens, one line each. Neither in nor out; no work is sequenced against it |
| **Candle** | **Hold** | a duration meter that does not exist yet | **8×14** plus the flame | 5 | held, with a candidate clock — see below |
| **Moth** | **Hold** | nothing; it is idle life (`detail-pass.html:844-853`) | 8×6 | 2 | held in the background while a future is thought about. Not scoped |
| ~~Bolts / nails~~ | **Drop** — redundant | nothing; would add to `.win` (`static/style.css:137`) | 4×4 | 3 | the kit already drives an object through every corner (`border-kit.html:302-304`); a separate nail is a second object in the same 8px |
| ~~Ribbon on the tab~~ | **Drop** | nothing; it would mark the active tab (`detail-pass.html:692-700`) | **5×12** (`:1468`) | 1 | the tab you are on is already clear enough. Joe would reconsider if the tabs stopped being buttons |

**The two drops, in his words.** The corner nails "can be ignored because it's
solved by the corner nails of the border kits" — the kit's stamp *is* the nail, so
the standalone one was solving a problem the foundation removes. The ribbon he
called a cool idea and turned down anyway, on the grounds that the current tab
reads clearly as it is; the condition he attached is worth keeping, because it may
come true — if the tab strip ever stops being a row of buttons, the ribbon comes
back into play.

**On the scrollbar, one caveat he raised himself.** It does not appear on his Mac.
That is overlay scrollbars, not a defect in the treatment: macOS hides the track
entirely until a scroll is in progress, so a drawn track has nothing to draw on
most of the time. The mockup anticipated it and shows the two tracks at 3× side by
side for exactly this reason (`detail-pass.html:236`, `:738-741`). Adopted on the
understanding that its author may never see it on his own machine.

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

Ordering, if it helps: the scrollbar first, because it is pure CSS and costs an
afternoon, then the raven (most work, biggest payoff, fixes a defect), then the
title, bell and flame. Toast, quill and the letter after. The nails have left the
order entirely, which is the one real change to it — they used to lead.

### The seal is now the whole box

Joe's rewrite of this is much stronger than the mockup's and it replaces it
outright. The mockup gates a destructive action by putting a seal sprite on a
`BREAK THE SEAL` button inside an otherwise ordinary confirm dialog
(`detail-pass.html:674`). Joe's version: **the confirm box stops being a dialog
and becomes a letter.** It arrives sealed. There is a back arrow that cancels, and
there is the wax, and clicking the wax breaks it and opens the letter.

That is a different interaction, not a dressed-up one. The mockup's version puts
ornament on a control that already existed; Joe's makes the ornament *be* the
control, and it turns confirmation into a small physical act with an obvious way
out. It also fits the kit rather than sitting on top of it — a sealed letter is a
box with a material, which is what section 2 already knows how to build, and the
four sprite frames (`detail-pass.html:1251-1252`) describe the wax breaking, which
is now the transition into the opened state rather than a button's press
animation.

Two things that need deciding when it is drawn, neither of them settled here: what
the letter is made of, which is a question for 2g's four and probably wants
canvas; and where the boundary of "destructive enough to be sealed" sits, which
is the same question the mockup was worrying about at `detail-pass.html:680-681`
when it said the seal becomes noise everywhere and should be gated on
`danger: true` alone.

### The toast question is open

The toast scrap is adopted; what it *is* is not settled. Three readings are live
and Joe named all three. It can stay its own drawing, the tacked scrap of
`detail-pass.html`'s section 06. It can merge with canvas — a toast is a quick
note from somewhere, pitched and struck, which is canvas's meaning almost word for
word (2g). Or, in his own framing, it might "just be another type of border kitted
object", in which case toasts stop being a special component and become a small
panel at `--s:1` like menus and tooltips already are (2a).

The third reading is the one that would simplify the most, and it is worth noting
that the kit already runs at `--s:1` for toasts (`border-kit.html:426-429`) and
that canvas already carries toasts in its domain (`border-kit.html:503`), which
is what makes the second and third readings so close together. Nothing is
decided. Whoever draws it should pick
deliberately rather than by default, because the merge changes what `.err` means:
a scrap with `--danger-ink` is a variant, but a kit box in a different material is
a different object.

### The candle is held, and it now has a candidate clock

Joe likes the concept and it stays on the list. Nothing in the app is the right
clock for it today, so it is held rather than scoped — there is no work to
sequence here yet, and it should not be drawn against a duration invented to
justify it.

**What changed is that he named the duration it wants.** Not a quest and not a
week: a workout timer. Tracking a circuit, timing your sets — anything where the
player is watching a span of seconds or minutes elapse. No such feature exists, so
this does not make the candle scopeable. It does mean the candle should not be
retrofitted onto one of the durations below out of impatience; it is waiting for a
timer, and if a timer is ever introduced the candle is the thing that should
render it.

The engineering point that holds it: a burn-down needs a real duration with a
known start, a known end, and a fraction the app can read at any moment, and the
Everbright Torch the mockup names (`detail-pass.html:824`) is a consumable with
`effect: {"reveal": True}` (`app/items.py:13`) — a one-shot reveal that fires
once and is gone, with no duration to map onto. Two durations that do exist are
the Siege week (`raid.week_start()` at `app/raid.py:149` and `week_key()` at
`:139`) and the Rest Writ's single calendar day (`writ_day` fixed at acceptance,
`resolve_rest_writs()` completing it when `today() > writ_day`,
`app/quests.py:471-493`). Either could carry a candle if one later turns out to
want one; neither is being recommended now.

The mockup's own caveat stands and is a second reason to leave it held: the
app's existing meters — the XP bar, the ten vigor pips — are read at a glance,
and a candle is worse at that (`detail-pass.html:820-825`). Five frames over a
week is a step every 1.4 days, which is coarse. If it ships, it probably wants a
wax pool that grows continuously beneath a stepped stub, so the coarse part is
the stub and the fine part is the pool. Note that a set timer largely dissolves
this objection — over three minutes rather than seven days, five frames is a step
every thirty-six seconds, and glance-reading a timer is what a burning candle is
actually good at.

---

## 5. Type, and the drawn-title execution fix

### The verdict, and the three things it is waiting on

The type study is adopted. Joe's word is "great" — and then three pieces of work
that have to happen before any of it is right, none of which is a redesign.

**It needs hand-pixeling.** The glyphs are close but not tight, and tightening
them by hand is what makes them readable rather than merely drawn. The measured
critique below is exactly that work, written down: it says which pixel in which
stem is doing the wrong job.

**Placement has to be nailed down.** Where a drawn title sits relative to its
panel, its rail and its plaque is not settled anywhere, and the kit changes the
answer — a title that hangs over a 16px rail (section 4) is not positioned the way
a title notched into a 2px border was.

**There are no rules for which face goes where, and there need to be.** This is
the gap. `static/style.css` declares five strikes and applies them by habit rather
than by role; the study's own "stop shouting" section is the closest thing to a
role model and it only covers casing. An explicit table — this face at this size
for this kind of string — does not exist yet, and every other decision in this
section is downstream of it.

**"Stop shouting" is adopted.** The app currently applies
`text-transform: uppercase` and `letter-spacing: 1px` to titles, buttons, chips,
labels, tabs and section heads alike (`type-wordmark.html:474-477`), which strips
the ascenders and descenders that carry most of a word's shape and makes every
string sound like the same person shouting. Roles become different objects, not
one object at different sizes. Know the bill before starting: turning the property
off does not produce mixed case, it produces whatever case the string was written
in, and the sweep is a hand pass across `giver.js`, `hall.js`, `town.js`,
`misc.js`, `ranch.js`, `colosseum.js` and `dungeon.js` where every string has to be
read in place — "SWORN" is a chip and stays, "THE OMENS" is a heading and goes
(`type-wordmark.html:929-935`). There is no safe automatic version.

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
  execution reads badly, and it is also the strongest argument for a drawn fill
  tile: the carve starts working the moment there is a surface behind it — which,
  after the merge in section 3, is the moment seam 1 ships rather than a seam
  later.
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

**What the glyph critique does not touch.** The illuminated capitals — 24×24, a
struck 2px double border, a field, a plant ornament and a capital inside
(`type-wordmark.html:541-543`) — are the part that works as drawing, and Joe likes
them, ornaments included. They are read once, at the head of a paragraph, exactly
where ornament is paid for. Their stated limits hold: at least three lines of copy
beside one or drop it entirely (`type-wordmark.html:610-614`), and nothing drawn
below 10px.

Two things about them are still open, and both are his. **They need to sit more
naturally inline.** A 24×24 block dropped beside 12px copy currently reads as a
capital parked next to a paragraph rather than one the paragraph is set around;
that is a positioning and baseline problem, not a drawing one, and it belongs with
the placement work above. **And they need to be used more selectively.** The limit
in the mockup is a floor — three lines of copy — not a policy. A capital on every
paragraph that clears the floor is a page of capitals, and the thing that makes
one ceremonial is that the next one is a long way away. Which paragraphs get one
is part of the missing rules for which face goes where.

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

**The material rule survives, but it re-anchors — and improves.** The rule is
"material follows permanence and consequence, never screen or feature"
(`border-kit.html:292-296`), and 2g rewrites what each material means under it. In
a places world, those meanings are properties of the **object you clicked**, not
of the screen you routed to. The gate is stone because the gate is stone. Clicking
a stall hands you oak because a stall is where wares are advertised. That is
strictly better than the current version: the material stops being a taxonomy
somebody has to assign consistently and becomes a fact about an object, which is
what will keep it consistent as scenes get built by different passes months apart.

**Different menus for different occasions falls out for free.** A material is
twelve hex values, a 3×3 stamp and a ground. A fifth set — the Siege's own
harrowing border (2g) — and any sixth after it, brass for a betting board or
something colder for whatever the Vale gets in winter, are an afternoon each plus
a texture, not a design system. The vocabulary extends in exactly the direction
the places thread wants, without anything downstream changing.

**Genuine menus stay genuine menus.** Not everything becomes a place. Settings is
a menu, and by 2g it is stone: it gets the border kit as its chrome, ground
included, and no scene owes it anything.

**The boundary, so the two threads do not collide.** The places thread owns the
scenes — what is drawn where, what is clickable, how a click reads as walking up
to a thing. This document owns the chrome a click hands you — the frame, its
material, its ground, its title. The seam between them is one call: a scene
names a **material** and a **title** when it opens a panel, and nothing else
crosses. If the places thread ever finds itself needing to specify what a panel
*looks* like, that is the signal the boundary has slipped.

---

## 7. Seams, in order

This list is one seam shorter than it was. The backdrop texture used to be seam 3;
section 3 explains why it is not a separate piece of work any more, and it has
been folded into seam 1.

**1 — The tile grid and the four materials, frame *and* ground, on `.win` only.**
Build `BORDER_KITS`, the generator and the nine-layer background rule; apply it to
`.win` at `--s:2` and to nothing else. This is the foundation, and it settles the
things that are expensive to get wrong later: the 8px grid, the seam rule, and now
the fill tile — its size, its render scale, and the `background-size` split that
lets the ground stop scaling with the frame. It is a bigger seam than it was, and
that is the honest consequence of the fill insight rather than a reason to split
it back apart: a frame shipped over a flat fill would have to be re-judged the
moment the ground arrived underneath it.

**2 — The chrome audit at `--s:1`.** Menus, toasts, bubbles and tooltips take the
kit at half scale; rows, dividers, cards and chips keep their 2px bevel and are
not touched. This is where roughly thirty panel-ish classes get triaged
(`border-kit.html:426-429`), and it needs seam 1 shipped so the triage is judged
against real tiles rather than a mockup — the audit will surface three or four
surfaces that are neither a panel nor a chip, and those need a real frame in front
of them to decide. The open toast question (section 4) resolves here or not at
all, because "is a toast a kit object?" is exactly what this audit asks.

**3 — The title, then the icons.** The strap or the carve on `.win-title` (CSS on
live text, so interpolation keeps working), hung as a plaque rather than notched,
then the named icons in their own order: scrollbar, raven, bell, flame, toast,
quill, letter. Each is independent of the others, and none blocks anything — which
is exactly why they go last. The carve is no longer waiting on a separate backdrop
seam; the surface it needs arrives with seam 1.

**Brief seam 1 first.** It unblocks 2 and the title, and it is the only one where
a wrong decision is expensive to undo. A tile drawn on the wrong grid gets
redrawn; a scrollbar on the wrong track is a one-line change.

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

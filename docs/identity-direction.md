# Identity direction

The chrome becomes drawn art. The border kit is the foundation; everything else
either sits on it or waits for it. This document exists so the drawing can start
without a follow-up question — sections 2 and 3 are the two specs that block a
pixel editor, and the rest is scope.

Joe has ruled that this project thread is the source of truth for the visual
identity work, so this document governs where it and any other spec disagree.

## 1. What was decided

| Option | Verdict | What carries forward |
| --- | --- | --- |
| The Modular Border Kit | **Adopt** | All of it, as the foundation. Nine 8×8 tiles per material, four materials, material assigned by permanence and consequence. Section 2. |
| The Detail Pass | **Partial** | Raven, bell, bolts/nails, panel title, streak flame, toasts, quill. Candle held on a real implementation problem. Moth cut. Section 4. |
| Material Chrome | **Partial** | Two things: the textured panel backdrops (redrawn as pixel textures, not the painterly ones in the mockup), and some title variants (redrawn). The plate/board/slab construction, the ashlar wall, the octagonal fasteners and the per-material key sets are all dropped. Section 3. |
| Type, Titles & Wordmark | **Partial** | The hand-drawn paragraph work — illuminated capitals and ornamented copy. Drawn display and panel titles keep the idea and lose the execution. Section 5. |
| Scroll & Parchment | **Cut** | Nothing. Not settings, not as a vellum material in the kit, not as a title label, not anywhere. It does not appear again in this document. |
| Palette Studies | **Hold** | Nothing now. Gold gets restricted to the touchable and the earned, but that restriction rides in on the border work. |

The palette hold has one condition that would revive it: the border kit shipping
and gold *still* reading as exhausting. That is the only evidence that a palette
pass was the right instrument rather than a symptom fix, and it cannot be
gathered before seam 1 lands.

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

`border-image` is not an option, and this was measured rather than assumed. No
repeat mode is pixel-exact across device pixel ratios: `repeat` is exact only at
even widths at DPR 1 and 3, `round` rescales the tile to a non-integer scale,
`stretch` smears a source pixel into a 25px block at width 200, and `space`
develops holes (`border-kit.html:341-354`). Nine origin-anchored
`background-repeat` layers were exact at DPR 1, 2 and 3 at every width tried,
unconditionally (`:361-365`). The trap in the measurement is that DPR 2 rescues
`border-image` completely, so it looks perfect on every modern phone and quietly
wrong on a 1× desktop monitor — invisible to whoever builds it (`:355-359`).

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
| **Candle** | a duration meter that does not exist yet | **8×14** plus the flame | 5 | held — see below |
| ~~Moth~~ | — | 8×6 | 2 | **cut** |

Ordering, if it helps: nails first (an afternoon, and every panel stops being a
rectangle), then the raven (most work, biggest payoff, fixes a defect), then the
title, bell and flame. Toast and quill after. The only shortlist item Joe did not
name and did not rule out is the notched scrollbar (`detail-pass.html:894-895`) —
pure CSS, no sprite, cheap whenever. The wax seal and the drawn empty states were
already self-held in the mockup and stay held.

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

> **Superseded in part.** Joe has ruled that the project thread this work was
> done in is the source of truth for the visual identity, which makes
> [`identity-direction.md`](identity-direction.md) the governing document
> wherever the two disagree. They disagree on two points. **Vellum** is not a
> material: parchment is cut entirely and does not return in any form, in the
> kit or out of it, so the Vellum sections below do not describe work to be
> done. And the **authoring model** here — hand-drawing 36 tiles per material —
> is superseded by the band-profile-plus-stamp model, in which a colour band
> profile, a 3x3 corner stamp and a few rail marks are authored per material and
> the 36 tiles are generated from them. The rest of this document remains useful
> reference.

# Border kit tile spec

Checked 2026-08-11. Nothing here is built. This is an authoring spec for
hand-drawn tiles that would replace the generated ones in
[the border kit mockup](mockups/identity/border-kit.html), which draws all 36 of
its tiles at page load from four sets of inputs. No application, stylesheet or
sprite file is changed by this document. Every hex value, coordinate and rule
below was read out of `docs/mockups/identity/border-kit.html`,
`static/style.css` and `static/js/pixel.js` rather than restated from the
mockup's prose.

The deliverable this spec describes is **four materials by nine slots, 36 tiles
of 8x8 pixels**, drawn by hand and transcribed into `static/js/pixel.js` in the
same `{p, r}` format every monster and NPC already uses.

---

## What you are drawing

**One tile is 8x8 pixels.** Not 32x32. The mockup fixes this at
`border-kit.html:446` (`const T = 8`) and every band, mark and stamp coordinate
in this document is an index into that 8x8 grid, rows and columns both counted
0-7 from the top-left.

**One material is a 24x24 sheet:** nine 8x8 tiles in a 3x3 arrangement
(`border-kit.html:247`, `:679`). Four materials means four sheets and 36 tiles
total.

**Chrome thickness is an integer scale, not a bigger tile.** The panel rule sets
`--s` and derives `--u: calc(8px * var(--s))`, and every background layer is
sized `var(--u) var(--u)` (`border-kit.html:68-69` and `:786-787`,
`:801`). So:

- `--s: 1` renders each tile at 8x8 CSS pixels: **8px of chrome**.
- `--s: 2` renders each tile at 16x16 CSS pixels: **16px of chrome**.

There is no fractional scale and never will be — a non-integer scale turns one
source pixel into blocks of one and two screen pixels, which is exactly the
failure documented for `border-image: round` at `border-kit.html:347-349`.

**Which surface gets which scale.** The mockup's own triage
(`border-kit.html:425-429`, and the shipping CSS at `:808-809`):

| surface | scale | chrome |
| --- | --- | --- |
| `.win` and the raised surfaces | `--s: 2` | 16px |
| menus, toasts, bubbles, tooltips | `--s: 1` | 8px |
| rows, dividers, cards, chips | no kit | keep the existing 2px bevel |

Nesting steps the scale down by one: a panel inside a panel drops to `--s: 1`,
because two 16px rails inside two 16px rails is 64px of chrome across the pair
(`border-kit.html:973-975`).

**The floor: about 40px of content.** Below that the kit stops rather than
shrinks. At `--s: 1` a grommet is four screen pixels of ring around four pixels
of hole, and a `+3` badge would be 16px of chrome around 10px of text — the
frame stops being a frame and becomes noise (`border-kit.html:432`,
`:1013-1017`). Anything under the floor is a chip, not a panel, and keeps the
existing 2px bevel from `static/style.css`. Do not draw a smaller tile for it.

---

## The nine slots

The keys are the generator's own: `tl`, `t`, `tr`, `l`, `c`, `r`, `bl`, `b`,
`br` (`border-kit.html:515`, `:710`). They are laid into the 24x24 sheet in the
order given at `border-kit.html:681`, which is the natural nine-slice reading
order:

```
            columns 0-7      columns 8-15     columns 16-23
          +----------------+----------------+----------------+
 rows     |       tl       |       t        |       tr       |
 0-7      |  corner        |  top rail      |  corner        |
          |                |  repeats ->    |                |
          +----------------+----------------+----------------+
 rows     |       l        |       c        |       r        |
 8-15     |  left rail     |  fill          |  right rail    |
          |  repeats v     |  repeats both  |  repeats v     |
          +----------------+----------------+----------------+
 rows     |       bl       |       b        |       br       |
 16-23    |  corner        |  bottom rail   |  corner        |
          |                |  repeats ->    |                |
          +----------------+----------------+----------------+
```

**Which slot repeats along which axis.** From the shipping
`background-repeat` list at `border-kit.html:796-797`: the four corners are
`no-repeat`, `t` and `b` are `repeat-x`, `l` and `r` are `repeat-y`, and `c` is
`repeat`.

**`t` is not `b`, and `l` is not `r`.** The chamfer stays on the outside and the
shade stays in the well, so the frame reads as a real chamfered ring viewed
straight on rather than as a lit object with a confused sun
(`border-kit.html:252-255`). Four rail tiles, drawn four times, not two tiles
flipped.

**What each slot owns.**

- **The four corners own the corner furniture** and nothing else: the mitre
  seam, the 3x3 stamp, and the catch light. They carry no rail marks at all —
  the mark loop at `border-kit.html:537` runs over `EDGES` only.
- **The four rails own the marks.** Rivets, grain, course joints, lacing: every
  repeating motif lives on a rail tile and nowhere else.
- **`c` owns the fill.** It is an **opaque** tile in every material — `m.fill`
  everywhere with exactly two flecks of `m.fleck`, at row 2 column 5 and row 6
  column 1 (`border-kit.html:534-535`). It is not transparent, it is not a hole,
  and it is what stops a large panel reading dead flat. It has no bands, no
  marks and no stamp.

---

## The rule that makes a tile

**Colour comes from distance to the outside.** A pixel's colour is
`P[min(distance to each outer edge of the tile)]`, where `P` is the material's
eight-entry band profile read outer to inner. That is the whole frame, and it is
one line of code — `BANDFN` at `border-kit.html:509-514`:

| slot | which edges are "outer" | band index at (r, c) |
| --- | --- | --- |
| `t` | the top | `r` |
| `b` | the bottom | `7 - r` |
| `l` | the left | `c` |
| `r` | the right | `7 - c` |
| `tl` | top and left | `min(r, c)` |
| `tr` | top and right | `min(r, 7 - c)` |
| `bl` | bottom and left | `min(7 - r, c)` |
| `br` | bottom and right | `min(7 - r, 7 - c)` |

Two consequences worth drawing to, not merely obeying. Concentric bands are what
a frame actually is. And because a rail's band index depends on one coordinate
only, **grain always runs along the rail** — the way a plank is cut, not
across it (`border-kit.html:234-236`).

**Rail marks repeat along the rail axis.** A mark is authored once, as
`{band, at, color}`, and `markCell` at `border-kit.html:518-523` places it on
all four rails: `band` counts inward from the outer edge, `at` is the position
running along the rail.

| rail | (row, column) for band `b` at position `p` |
| --- | --- |
| `t` | `(b, p)` |
| `b` | `(7 - b, p)` |
| `l` | `(p, b)` |
| `r` | `(p, 7 - b)` |

So one mark authored as "band 3, position 4" is a rivet on the top rail at
(3, 4), on the bottom rail at (4, 4), on the left rail at (4, 3) and on the
right rail at (4, 4). Draw the mark once, in `t` orientation; the other three
rails are the same mark rotated into the frame.

**Where two rails meet: the mitre seam.** On every corner tile, `m.seam` is
painted down the diagonal at `d = 2..6` — that is (2,2) through (6,6) on `tl`,
mirrored per corner (`border-kit.html:547-550`). This is the join line two
mitred pieces would actually make.

**The catch light.** One pixel of `m.catch` at (1, 1) on `tl`, mirrored per
corner: (1, 6) on `tr`, (6, 1) on `bl`, (6, 6) on `br`
(`border-kit.html:556-557`). It sits on band 1, the chamfer, because a chamfer
catches more light at a corner than it does along a run.

**The stamp is driven through the seam.** The 3x3 corner stamp is painted at
offset (2, 2) — rows 2-4, columns 2-4 — mirrored per corner
(`border-kit.html:551-555`). It is painted *after* the seam, so it covers the
seam at `d = 2, 3, 4` and the seam survives at `d = 5, 6`, running out of the
ornament and into the inner corner. That is the point: the ornament is driven
straight through the joint, which is what a peg, a rivet and a grommet are for.

Note for anyone reading the source: the comment at `border-kit.html:449` calls
the stamp a "4x4 corner ornament". It is not. All four `stamp` arrays are three
rows of three characters and the code takes its size from
`N = m.stamp.length` (`border-kit.html:543`). **3x3 is correct**; the comment is
stale.

**Paint order, which decides what you see.** Bands first, then rail marks on the
rails, then on corners: seam, then stamp, then catch light last. The catch light
always wins; the stamp always beats the seam; marks never touch a corner.

---

## How to check a tile

Run these against a finished tile before transcribing it. Every one of them is
mechanical.

1. **Band check.** Cover the marks, stamp, catch and seam. Every remaining pixel
   must be exactly `P[min(distance to each outer edge)]` from the table above.
   No dithering, no in-between values, no colour that is not one of the eight.
2. **Rail periodicity.** On `t` and `b`, strip the marks and **every column must
   be identical** — the band index depends on the row alone. On `l` and `r`,
   every row must be identical. If a rail tile fails this, it will not tile.
3. **Corner joins the rail.** Read the `tl` tile's **rightmost column** top to
   bottom: it must equal `P[0]` through `P[7]` in order. Read the `tl` tile's
   **bottom row** left to right: same sequence. Mirror for the other three
   corners. This is what makes the corner's bands continue into the rail's bands
   with no step. (Verified on iron: both read `#0a0a12`, `#7d8091`, `#585b65`,
   `#484a53`, `#3f414a`, `#484a53`, `#26262f`, `#0a0a12`.)
4. **The rim is unbroken.** Band 0 and band 7 are both `#0a0a12` in all four
   materials and nothing may be drawn into them. Every rail mark must sit in
   bands 1-6; all four materials' marks already do.
5. **The mitre reaches the inside.** After the stamp is placed, the seam must
   still be visible at `d = 5` and `d = 6`, so the joint runs out of the
   ornament and dies at the inner rim rather than stopping under the stamp.
6. **The catch light is on the chamfer.** It sits at (1, 1) and only at (1, 1),
   which is band 1. One pixel. Not two, not a gradient.
7. **No motif straddles the rail's tile boundary.** A repeating rail tile is cut
   wherever the corner starts (see the phase note below), so a motif with a left
   half at position 7 and a right half at position 0 will be sawn in half at
   arbitrary panel widths. A periodic *line* at position 0 — iron's plate
   seam, stone's course joint — is fine, because a line has no halves. A
   rivet is not: keep it whole, inside one tile, away from positions 0 and 7.
8. **No motif in the band nearest the corner along a rail.** Anything in the
   rail's first or last position competes with the corner's stamp for the same
   few pixels and reads as damage rather than as detail.

---

## The four materials

Each material is **eight colours plus one 3x3 stamp plus a set of rail marks**
— about forty hand-placed pixels — and the nine tiles follow from those. The
eight colours are the band profile, read outer to inner:

| band | role |
| --- | --- |
| 0 | rim |
| 1 | chamfer |
| 2 | face row 1 |
| 3 | face row 2 |
| 4 | face row 3 |
| 5 | face row 4 |
| 6 | inner shade |
| 7 | inner rim |

**Band 0 and band 7 are `#0a0a12` in all four materials**, which is `--bg` at
`static/style.css:46`. The rim is literally the background colour, so a panel
still floats on the same void it floats on today and the kit does not introduce
a new outer edge colour (`border-kit.html:402-404`). Do not "improve" this.

**Band 5 equals band 3 in all four materials.** The face darkens toward band 4
and comes back, so the rail reads as a chamfered face rather than a one-way
ramp. Keep that symmetry if you redraw a profile.

Rail-mark coordinates below are given in `t` orientation — row = band,
column = position. The other three rails follow `markCell` automatically.

### Iron — riveted plate

`border-kit.html:452-464`. Domain: **the Forge, the Undercroft, the Colosseum,
the Siege** — anything that can hurt you.

| band | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hex | `#0a0a12` | `#7d8091` | `#585b65` | `#484a53` | `#3f414a` | `#484a53` | `#26262f` | `#0a0a12` |
| role | rim | chamfer | face 1 | face 2 | face 3 | face 4 | inner shade | inner rim |

| element | value | placement |
| --- | --- | --- |
| fill | `#14141f` | every pixel of `c` |
| fleck | `#1c1c2b` | `c` at (2, 5) and (6, 1) |
| catch | `#9ea1b2` | (1, 1), mirrored per corner |
| seam | `#303239` | diagonal `d = 2..6`, mirrored per corner |
| stamp palette | `o: #71747f`, `R: #adb0be`, `s: #2b2d35` | rows 2-4, columns 2-4 |
| stamp rows | `oRo` / `RRs` / `oss` | a driven rivet, domed and lit from the north-west |
| mark 1 | `#33333f`, bands 1-6, position 0 | `t` column 0, rows 1-6 — the plate seam |
| mark 2 | `#8e91a0`, bands 3-4, positions 3-4 | `t` rows 3-4, columns 3-4 — the rivet head |
| mark 3 | `#2e3038`, band 5, positions 3-4 | `t` row 5, columns 3-4 — the rivet's shadow |

### Oak — pegged joint

`border-kit.html:465-477`. Domain: **the Hall of Records, Doctrines, the
Scrivener, the Almanac** — anything written down and kept.

| band | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hex | `#0a0a12` | `#8c6a3e` | `#6f5230` | `#5a4126` | `#4e381f` | `#5a4126` | `#2c1f11` | `#0a0a12` |
| role | rim | chamfer | face 1 | face 2 | face 3 | face 4 | inner shade | inner rim |

| element | value | placement |
| --- | --- | --- |
| fill | `#17121e` | every pixel of `c` |
| fleck | `#1e1826` | `c` at (2, 5) and (6, 1) |
| catch | `#a97f4b` | (1, 1), mirrored per corner |
| seam | `#33240f` | diagonal `d = 2..6`, mirrored per corner |
| stamp palette | `P: #ab8541`, `p: #5c451f` | rows 2-4, columns 2-4 |
| stamp rows | `PPp` / `PPp` / `ppp` | a pale peg through a mitred joint |
| mark 1 | `#3f2c18`, bands 3-4, position 5 | `t` rows 3-4, column 5 — dark grain |
| mark 2 | `#7d5c36`, band 2, positions 1, 2, 6 | `t` row 2, columns 1, 2 and 6 — light grain |
| mark 3 | `#4a341c`, band 5, position 3 | `t` row 5, column 3 |

Oak's marks are the only set with no full-height line: the grain is broken and
irregular along the rail, which is what stops a long oak rail reading as a
striped ribbon.

### Stone — coursed ashlar

`border-kit.html:478-491`. Domain: **the Undercroft gate, the Vault, the Long
Road, Settings** — anything that does not move.

| band | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hex | `#0a0a12` | `#7a7468` | `#5c584e` | `#4a4740` | `#413e38` | `#4a4740` | `#232219` | `#0a0a12` |
| role | rim | chamfer | face 1 | face 2 | face 3 | face 4 | inner shade | inner rim |

| element | value | placement |
| --- | --- | --- |
| fill | `#15151c` | every pixel of `c` |
| fleck | `#1c1c24` | `c` at (2, 5) and (6, 1) |
| catch | `#918a7b` | (1, 1), mirrored per corner |
| seam | `#2b2924` | diagonal `d = 2..6`, mirrored per corner |
| stamp palette | `C: #918a7b`, `d: #2f2d27` | rows 2-4, columns 2-4 |
| stamp rows | `ddd` / `dCd` / `ddd` | a chisel peck, struck square into the quoin |
| mark 1 | `#1c1a15`, bands 1-6, position 0 | `t` column 0, rows 1-6 — the course joint |
| mark 2 | `#666256`, band 3, position 3 | `t` row 3, column 3 — a lit chip |
| mark 3 | `#37342e`, band 4, position 6 | `t` row 4, column 6 — pitting |
| mark 4 | `#37342e`, band 2, position 4 | `t` row 2, column 4 — pitting |

Stone is the only material with four marks; the two pits are the same colour at
two positions on purpose, so the pitting reads as texture rather than as a
pattern.

### Vellum — grommet and lacing

`border-kit.html:492-505`. Domain: **the Crankwerk, the Menagerie, market
stalls, toasts** — anything pitched for the day and struck at dusk.

**On the name.** This is the option's `canvas` material, renamed. Joe's ruling
is that the scrapped scroll-parchment direction returns as a single in-kit
material rather than a second half of the design system, and this is that
material's slot. Nothing about the drawing changes: the band profile, fill,
fleck, catch, seam, 3x3 stamp, rail marks and domain assignment below are the
option's `canvas` values unchanged. Reverting to `canvas` is a one-word change
in one place.

| band | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hex | `#0a0a12` | `#a99c70` | `#847a52` | `#6b6342` | `#5f583b` | `#6b6342` | `#2f2c1c` | `#0a0a12` |
| role | rim | chamfer | face 1 | face 2 | face 3 | face 4 | inner shade | inner rim |

| element | value | placement |
| --- | --- | --- |
| fill | `#171420` | every pixel of `c` |
| fleck | `#1f1b28` | `c` at (2, 5) and (6, 1) |
| catch | `#c4b784` | (1, 1), mirrored per corner |
| seam | `#3c3826` | diagonal `d = 2..6`, mirrored per corner |
| stamp palette | `G: #8c8fae`, `h: #0f0e14` | rows 2-4, columns 2-4 |
| stamp rows | `GGG` / `GhG` / `GGG` | an iron grommet, punched through the hem |
| mark 1 | `#d8cfa8`, band 1, positions 2, 3 | `t` row 1, columns 2-3 — lacing |
| mark 2 | `#d8cfa8`, band 1, positions 6, 7 | `t` row 1, columns 6-7 — lacing |
| mark 3 | `#4a4430`, band 6, position 0 | `t` row 6, column 0 |
| mark 4 | `#7c7350`, bands 3-4, position 0 | `t` rows 3-4, column 0 |

The lacing colour `#d8cfa8` is `--ink` at `static/style.css:53` — the same
value the app writes every word in. Under the vellum name that is no longer a
coincidence worth hiding.

Note that mark 2 sits at positions 6 and 7, which brushes check 7 above: it is a
two-pixel dash, not a motif with halves, so it survives being cut. Keep it that
way if you redraw it.

---

## Which art pipeline to use

**Draw in a pixel editor, transcribe to row strings, ship in
`static/js/pixel.js`.** The tiles are not PNGs and there is no export step.

**The format.** `static/js/pixel.js:1-2` opens: "Hand-authored pixel sprites.
Each: palette map + row strings. `'.'` = transparent." Every entry in `SPRITES`
is `{ p, r }` — `p` maps a single character to a hex string, `r` is an array
of row strings, one character per pixel. `drawSprite`
(`static/js/pixel.js:1058-1074`) reads the width from `r[0].length`, derives an
integer `scale` from the canvas width, and fills one rect per pixel;
`spriteTag` (`:1076-1082`) emits the canvas; `hydrateSprites` (`:1084-1103`)
draws every `canvas[data-sprite]` under a root after render. A kit tile is just
another sprite on that path — no new renderer, no new loader.

**Sprite key naming: `kit_<material>_<tile>`.** `kit_iron_tl`, `kit_iron_t`,
`kit_oak_c`, `kit_vellum_br`, and so on — 36 keys. This is the mockup's own
naming at `border-kit.html:776`.

**The transcription rule**, exactly:

- One character per pixel. Eight characters per row, eight rows per tile.
- `.` means transparent. Kit tiles use it nowhere — every pixel of all 36
  tiles is opaque, including `c`. `.` matters only for the overlay ornaments
  (`border-kit.html:623-644`), which are a separate, later job.
- Every other character is a key in `p`, and `p` maps it to a `#rrggbb` string.
- Characters are arbitrary; pick mnemonic ones. The mockup's own generator hands
  out `a`, `b`, `c`... in first-appearance order
  (`border-kit.html:727-737`), which is fine for machine output and worse for a
  human diff.

A worked example, generated by running the mockup's own `buildTiles` and
`toSpriteData` over the iron inputs:

```js
kit_iron_tl: {
  p: { a: '#0a0a12', b: '#9ea1b2', c: '#7d8091', d: '#71747f', e: '#adb0be',
       f: '#585b65', g: '#2b2d35', h: '#484a53', i: '#3f414a', j: '#303239',
       k: '#26262f' },
  r: [
    'aaaaaaaa',   // band 0 — rim
    'abcccccc',   // b at (1,1) is the catch light
    'acdedfff',   // d/e/g from here down are the stamp, rows 2-4 cols 2-4
    'aceeghhh',
    'acdggiii',
    'acfhijhh',   // j at (5,5) is the mitre seam surviving the stamp
    'acfhihjk',   // j at (6,6)
    'acfhihka',
  ],
},
kit_iron_t: {
  p: { a: '#0a0a12', b: '#33333f', c: '#7d8091', d: '#585b65', e: '#484a53',
       f: '#8e91a0', g: '#3f414a', h: '#2e3038', i: '#26262f' },
  r: [
    'aaaaaaaa',   // band 0 — rim
    'bccccccc',   // b at column 0 is the plate seam, bands 1-6
    'bddddddd',
    'beeffeee',   // f is the rivet head
    'bggffggg',
    'beehheee',   // h is the rivet's shadow
    'biiiiiii',
    'aaaaaaaa',   // band 7 — inner rim
  ],
},
```

**Drawing them.** Any pixel editor with an indexed palette works. Aseprite fits
well: one 8x8 canvas per tile, **Indexed** colour mode, one palette per material
loaded from the eight profile entries plus that material's fill, fleck, catch,
seam and stamp colours. Indexed mode is the point — it makes an off-palette
pixel impossible rather than merely discouraged, which is what checks 1 and 4
above are testing for. Per repo convention, editor sources (`.aseprite`,
`.pxo`), palette swatches and superseded drafts live under `assets/` and are
never served (`static/js/art.js:23-27`).

**The shipping shape the option proposes.** Rather than 36 pasted tiles, the
mockup proposes shipping the inputs and generating the tiles at boot the way
monsters are generated from DNA (`border-kit.html:266-269`, `:749-764`):

```js
// static/js/pixel.js
const BORDER_KITS = {
  iron: {
    profile: ['#0a0a12', '#7d8091', ...],   // outer -> inner
    fill: '#14141f', fleck: '#1c1c2b',
    catch: '#9ea1b2', seam: '#303239',      // corner only
    stamp: { p: { o: '#71747f', R: '#adb0be', s: '#2b2d35' },
             r: ['oRo', 'RRs', 'oss'] },
    marks: [{'band':[1,2,3,4,5,6],'at':[0],'color':'#33333f'}, ...],
  },
  // oak, stone, vellum
};
```

Both forms are legitimate and they are not exclusive: draw the 36 tiles, then
decide whether the repo stores the tiles or stores the inputs and rebuilds them.
If the hand-drawn tiles ever diverge from what the rule produces — and they
should be allowed to — the expanded `{p, r}` form is the one that can hold the
divergence, and `BORDER_KITS` becomes documentation rather than a source.

**The alternative, and why not.** The obvious other option is served PNGs under
`static/art/`, loaded the way portraits and building art are
(`static/js/art.js:1-27`). Rejected, for three reasons that are about this repo
rather than about PNGs:

1. `static/art/` is organised by *subject* into exactly three buckets —
   `npcs/<subject>/`, `poi/<subject>/` and `town/` (`static/js/art.js:8-20`) —
   for 32x32 portraits and building elevations. A 8x8 chrome tile is not a
   subject and has no bucket. Today the directory holds 49 files and **not one
   tile PNG**.
2. It would add 36 files, 36 requests or a sheet-slicing step, and a second
   fallback path, to hold roughly 40 hand-placed pixels per material.
3. The `{p, r}` path already exists, already renders at integer scale with
   `image-rendering: pixelated`, and is what every monster in the game uses. The
   kit costs zero new renderer code on it (`border-kit.html:408-409`).

**Bump the cache-buster.** `static/index.html` carries `?v=125` on every static
asset URL today (`static/index.html:11-33`), and `AGENTS.md:82` and `:116`
require the bump in the same commit as the static change. Adding tiles to
`pixel.js` is a static change.

---

## The tiling phase, and why not `border-image`

**The kit is nine CSS background layers on one element, not `border-image`.**
This is measured, not preferred. The mockup's method: Chromium 141, tiles
rendered, page screenshotted, the screenshot's pixels read back and run-length
counted across the top rail; a rail is exact when every source pixel became a
run of identical length (`border-kit.html:336-339`).

| repeat mode | DPR 1 | DPR 2 | DPR 3 | what goes wrong |
| --- | --- | --- | --- | --- |
| `repeat` | exact only at even widths | always exact | exact only at even widths | the tiling is *centred* in the run, so an odd remainder puts the phase on a half pixel and every tile in the rail jitters 1px |
| `round` | never exact | never exact | never exact | rescales the tile to fit a whole number of repeats -> non-integer scale -> source pixels become blocks of 1 and 2 |
| `stretch` | no | no | no | a source pixel became a 25px smear at width 200 |
| `space` | never exact | never exact | never exact | inserts gaps between tiles; the rail develops holes |

Reproduced from `border-kit.html:342-354`. The trap is at
`border-kit.html:355-359`: DPR 2 saves `repeat` completely, because the
half-CSS-pixel centring offset lands on a whole device pixel. So `border-image`
looks perfect on every modern phone and in every screenshot, and is quietly
wrong on a 1x desktop monitor at odd panel widths — invisible to whoever
builds it.

**Background layers anchor phase to the element origin** instead of centring it,
and measured exact at DPR 1, 2 and 3 at every width tried, with no conditions
(`border-kit.html:361-365`). The shipping rule (`border-kit.html:783-809`):
nine `background-image` layers with the four corners listed *first*, because the
first background layer paints on top, so corners cover the rails running
underneath; `background-repeat` of four `no-repeat`, two `repeat-x`, two
`repeat-y` and one `repeat`; `background-size: var(--u) var(--u)`; no `border`
property at all, with `padding` holding content off the painted rails.

**The phase does not meet the corner, and that is left alone.** When a panel's
width is not a multiple of `--u`, the last rail tile is clipped where the corner
starts. On stone this reads as a closer stone, on vellum as a cut hem
(`border-kit.html:420-422`). The option calls it **a reading, not a fix**, and
this spec carries that forward: do not draw a tile that tries to solve it, and
do not accept a proposal to snap panel widths to `--u` in order to hide it.
Check 7 above exists so that the clip lands somewhere harmless.

---

## What this contradicts

**`DESIGN.md` section 5, "Pixel Window (`.win`)", is replaced clause by
clause.** `DESIGN.md:214-215` currently specifies the appearance as "`--panel`
surface, `2px` `--gold` border, hard concentric rings, an offset block shadow,
and a title cut out against `--bg`", and `DESIGN.md:216-217` the spacing as
"`14px` padding and vertical margin with a `4px` outer side margin". Against the
kit:

| `DESIGN.md` §5 clause | what the kit does |
| --- | --- |
| `--panel` surface | the `c` fill tile, per material |
| `2px` `--gold` border | no `border` property at all; nine painted background layers |
| hard concentric rings (`static/style.css:140`, `0 0 0 2px var(--bg), 0 0 0 4px #6b5426`) | band 0 does the ring's job inside the tile |
| title cut out against `--bg` (`static/style.css:145-153`, `top: -14px`) | a plaque nailed to the rail; same span, same text, new rule (`border-kit.html:386-388`) |
| `14px` padding | `calc(var(--u) + 7px) calc(var(--u) + 9px)` (`border-kit.html:789`) |
| offset block shadow | survives, moved onto the 8px grid |

**`DESIGN.md` section 7, "Depth & Surface", needs the same amendment.** It
states the strategy as "borders plus tonal pixel windows" and that "Two-pixel
borders and inset rings separate contained surfaces" (`DESIGN.md:573-575`), and
it makes the `--edge-lit` / `--edge-shade` neutral bevel the marker of every
raised surface (`DESIGN.md:593-597`). A kit surface has neither a two-pixel
border nor a neutral bevel — it has a material. The two systems then have to
agree on which surfaces are which, and section 7's raised-surface contract is
where that agreement has to be written down.

**This is a flag, not a change.** No `DESIGN.md` clause is edited by this
document. Both sections need amending in the same change that ships the kit, and
neither should be amended before it.

One measurement to settle when the kit ships: `static/style.css:140` casts
`6px 6px 0 rgba(0,0,0,0.5)`, the mockup's shipping CSS block says
`8px 8px 0 rgba(0,0,0,0.55)` (`border-kit.html:802`) so the panel and its shadow
sit on one 8px grid, and the mockup's own live `.p9` rule uses
`calc(3px * var(--s))` with alpha `.55` (`border-kit.html:78`), which is 6px at
`--s: 2`. The mockup disagrees with itself; pick one before drawing anything
that depends on it. Nothing in this spec does.

---

## Out of scope

Iconography and hand-drawn lettering are later phases; this spec covers the 36
chrome tiles and nothing else. The overlay ornaments — the hanging nail, the
wax run, the rope lashing, the knocked-off corner, the torn hem
(`border-kit.html:623-644`) — are also a separate job, drawn against finished
tiles rather than alongside them.

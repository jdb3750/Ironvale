/* ---- hand-drawn portrait art (32x32 PNGs, served from static/art/) ----
   Talking-portrait pipeline: each entry has a mouth-closed and mouth-open
   frame; typewrite() flaps between them while a line is being typed. This
   is purely ADDITIVE — an NPC with no entry here transparently falls back
   to their existing char-map SPRITES entry via spriteTag, so drawing one
   NPC's art never requires touching any other NPC's rendering.

   Art file convention (applies to portraits, building art below, and the
   town tiles): static/art/ splits into three buckets —
     npcs/<subject>/  a character: portrait[_open_mouth].png, and if they
                       have a house, <subject>_house_<variant>.png (a
                       "house" is wherever that NPC resides, even when the
                       in-game building label doesn't use their name — e.g.
                       Wick's is "The Ledger House", Hesk's the Undercroft)
     poi/<subject>/    a resident-less landmark: <subject>_<variant>.png,
                       no _house_ infix since it isn't one (Crankwerk,
                       Menagerie, Colosseum)
     town/             environment tiles, not a "subject" at all
   Every PNG is named <stem>[_<variant>].png with day/sunset/night (when
   applicable) always a trailing suffix — never a prefix — so one
   subject's whole file family sorts together. No dimensions in filenames
   (they drift when art is redrawn at a new resolution; the code is the
   source of truth for scale). Everything else — Pixelorama/Aseprite
   sources (.pxo/.aseprite), palette swatches, character templates,
   superseded drafts — lives in assets/<subject>/ instead, mirroring the
   same subject folders, and is never served. */
const PORTRAIT_ART = {
  fenn:      { closed: 'art/npcs/old_fenn/old_fenn_portrait.png', open: 'art/npcs/old_fenn/old_fenn_portrait_open_mouth.png', size: 32 },
  grunhilda: { closed: 'art/npcs/grunhilda/grunhilda_portrait.png', open: 'art/npcs/grunhilda/grunhilda_portrait_open_mouth.png', size: 32 },
  bram:      { closed: 'art/npcs/ser_bram/ser_bram_portrait.png', open: 'art/npcs/ser_bram/ser_bram_portrait_open_mouth.png', size: 32 },
  elowen:    { closed: 'art/npcs/sage_elowen/sage_elowen_portrait.png', open: 'art/npcs/sage_elowen/sage_elowen_portrait_open_mouth.png', size: 32 },
  maud:      { closed: 'art/npcs/maud/maud_portrait.png', open: 'art/npcs/maud/maud_portrait_open_mouth.png', size: 32 },
  wick:      { closed: 'art/npcs/wick/wick_portrait.png', open: 'art/npcs/wick/wick_portrait_open_mouth.png', size: 32 },
  // no open-mouth frame yet — both point at the same still so a mid-typewrite
  // mouth-flap can't 404; swap `open` in once a second frame exists.
  hesk:      { closed: 'art/npcs/hesk/hesk_portrait.png', open: 'art/npcs/hesk/hesk_portrait.png', size: 32 },
};

function portraitTag(key, px) {
  const art = PORTRAIT_ART[key];
  if (!art) return spriteTag(key, px);  // no hand-drawn art yet — char-map fallback
  const scale = Math.max(1, Math.round(px / art.size));
  const size = art.size * scale;
  return `<img class="portrait-art" data-portrait="${key}" data-mouth="closed" alt=""
    src="/static/${art.closed}" width="${size}" height="${size}"
    style="width:${size}px;height:${size}px;image-rendering:pixelated">`;
}

/* ---- hand-drawn building art (served from static/art/) ----
   Same additive-fallback pattern as portraits: a building with no entry
   here (or no variant for the current time-of-day) transparently falls
   back to its char-map SPRITES entry via spriteTag() in bld(). Rendered
   at a FIXED 3x scale to match the sky/ground tiles' pixel density (see
   .town-scene in style.css) — the px argument callers pass to bld() only
   sizes the char-map fallback, never real art, so drawing one building
   never requires recalculating anyone else's placement math. day is
   required per entry; sunset/night are optional and fall back to day
   until drawn. */
/* House-art naming convention: static/art/<folder>/<folder>_house_day.png,
   <folder>_house_sunset.png, <folder>_house_night.png — all 40x34. Variant
   is always a trailing suffix (matching <folder>_portrait[_open_mouth].png
   above) so one subject's whole file family sorts together instead of
   scattering across day/night/sunset-prefixed neighbors. */
/* bucket = 'npcs' (an NPC's house — subject folder holds portrait + house_*)
   or 'poi' (a resident-less landmark — subject folder holds only day/sunset/
   night, no _house_ infix since it isn't one). */
function buildingArt(bucket, subject, asset, w = 40, h = 34) {
  const stem = asset ? `${subject}_${asset}` : subject;
  return {
    day: `art/${bucket}/${subject}/${stem}_day.png`,
    sunset: `art/${bucket}/${subject}/${stem}_sunset.png`,
    night: `art/${bucket}/${subject}/${stem}_night.png`,
    w, h,
  };
}
const houseArt = (subject, w, h) => buildingArt('npcs', subject, 'house', w, h);
const poiArt = (subject, w, h) => buildingArt('poi', subject, null, w, h);

const BUILDING_ART = {
  bld_waystone: houseArt('old_fenn'),
  bld_forge: houseArt('grunhilda'),
  bld_keep: houseArt('ser_bram'),
  bld_willow: houseArt('sage_elowen'),
  bld_ledger: houseArt('wick'),
  bld_hall: houseArt('maud'),
  bld_gate: houseArt('hesk'),
  crank: poiArt('crankwerk'),
  bld_colosseum: poiArt('colosseum'),
  bld_ranch: poiArt('menagerie'),
};

function buildingTag(key, tod) {
  const art = BUILDING_ART[key];
  const src = art && (art[tod] || art.day);
  if (!src) return null;
  const w = art.w * 3, h = art.h * 3;
  // houseArt() always guesses all three variant paths from the naming
  // convention, whether those files exist yet or not (day usually lands
  // before sunset/night) — onerror swaps to the day art instead of
  // showing a broken image if a guessed variant 404s.
  const dayFallback = `/static/${art.day}`;
  return `<img class="bld-art" src="/static/${src}" width="${w}" height="${h}"
    style="width:${w}px;height:${h}px;image-rendering:pixelated" alt=""
    onerror="if(this.src!=='${dayFallback}'){this.onerror=null;this.src='${dayFallback}';}">`;
}

/* the one portrait rendered on the current screen, if it has hand-drawn art
   (screens render at most one npc-head at a time, so a plain query suffices) */
function npcPortraitEl() {
  return document.querySelector('img[data-portrait]');
}

function setPortraitMouth(el, open) {
  if (!el) return;
  const art = PORTRAIT_ART[el.dataset.portrait];
  if (!art) return;
  const want = open ? 'open' : 'closed';
  if (el.dataset.mouth === want) return;
  el.dataset.mouth = want;
  el.src = `/static/${art[want]}`;
}

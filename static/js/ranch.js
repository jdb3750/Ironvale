/* The Menagerie: Chao-garden pen. Creatures wander, graze, sleep, and trade
   hats. Sim state survives re-renders (RANCH.saved) and randomizes on each
   fresh visit so the herd feels like it lived while you were gone. Hat
   operations never re-render — they act on the live simulation. */

const RANCH = { mons: [], hats: {}, decors: [], packs: 0, saved: null, groundHats: [] };

SCREENS.ranch = async function () {
  const d = await api('/monsters');
  const inv = (await api('/inventory')).items;
  RANCH.mons = d.monsters;
  RANCH.hats = {};
  inv.filter(i => i.type === 'hat').forEach(h => RANCH.hats[h.id] = h.qty);
  RANCH.decors = inv.filter(i => i.type === 'decor');
  RANCH.packs = d.packs_owned;

  $app().innerHTML = shell(`
    <div class="win"><span class="win-title">The Menagerie (${d.monsters.length})</span>
      <div class="ranch-box">
        <canvas class="ranch" id="ranch-cv" width="640" height="300"></canvas>
        <div class="pen-ui">
          <button class="pen-btn" id="pen-hats-btn">HATS</button>
          <div class="pen-panel" id="pen-panel" style="display:none"></div>
        </div>
        ${!d.monsters.length ? '<div class="ranch-empty">The pen stands empty. Rip a pack, or subdue a creature in the Undercroft.</div>' : ''}
      </div>
      <div class="muted center" style="font-size:16px;margin-top:4px">tap a creature to meet it &middot; drag one to relocate it (they hate this)
        &middot; drag a hat onto a head, or drop it on the grass and see who claims it</div>
      <div class="center" style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn green" onclick="G.ripPack()">RIP A PACK ${RANCH.packs > 0 ? `(${RANCH.packs} owned)` : `(${spriteTag('icon_coin', 14)}${d.pack_cost})`}</button>
      </div>
      <div class="muted center" style="font-size:15px;margin-top:6px">now dropping: <span class="r-uncommon">${esc(d.series)}</span>
        &middot; ${d.series_days_left === 1 ? 'ends today' : `ends in ${d.series_days_left} days`} — limited monthly run</div>
    </div>
    ${d.monsters.length ? `<div class="win"><span class="win-title">The Herd</span>
      <div class="mon-grid">${d.monsters.map(m => `
        <div class="mon-tile ${m.boss ? 'boss' : ''}" data-mid="${m.id}" onclick="G.monLens(${m.id})">
          <div style="display:flex;justify-content:center">${critterTag(m, 48)}</div>
          <div class="mn r-${m.rarity}">${esc(m.name)}${S.state.buddy && S.state.buddy.id === m.id ? ' <span style="color:#e05070">&#9829;</span>' : ''}</div>
        </div>`).join('')}</div>
    </div>` : ''}
  `);
  startRanch(d.monsters);
};

function drawSpriteCtx(ctx, key, x, y, scale) {
  const s = SPRITES[key];
  if (!s) return;
  s.r.forEach((rowStr, ry) => [...rowStr].forEach((ch, rx) => {
    const col = s.p[ch];
    if (!col) return;
    ctx.fillStyle = col;
    ctx.fillRect(x + rx * scale, y + ry * scale, scale, scale);
  }));
}

function startRanch(mons) {
  const cv = document.getElementById('ranch-cv');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const GROUND = 60;
  const SCALE = 3;
  RANCH.groundHats = RANCH.groundHats.filter(g => !g.done);

  // pre-render grass background + owned decorations
  const bg = document.createElement('canvas');
  bg.width = W; bg.height = H;
  const bctx = bg.getContext('2d');
  const brnd = mulberry32(0xC0FFEE);
  bctx.fillStyle = '#24331e'; bctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#1c2a18'; bctx.fillRect(0, 0, W, GROUND - 8);
  for (let i = 0; i < 220; i++) {
    const x = brnd() * W, y = GROUND + brnd() * (H - GROUND);
    bctx.fillStyle = brnd() < 0.85 ? '#2e4226' : (brnd() < 0.6 ? '#c8b050' : '#a05878');
    bctx.fillRect(x, y, 3, brnd() < 0.5 ? 3 : 5);
  }
  bctx.fillStyle = '#4a3a24';
  for (let x = 0; x < W; x += 26) { bctx.fillRect(x, GROUND - 14, 6, 14); }
  bctx.fillRect(0, GROUND - 16, W, 4);
  RANCH.decors.forEach((dec, i) => {
    const drnd = mulberry32(0xDEC0 + i * 7);
    drawSpriteCtx(bctx, dec.sprite, 30 + drnd() * (W - 80), GROUND + 8 + drnd() * (H - GROUND - 50), 4);
  });

  // build actors: restore saved sim state, or wake fresh in random arrangements
  const saved = RANCH.saved || {};
  const fresh = !RANCH.saved;
  const modelFor = (m) => m.boss ? genBossModel(m.dna) : genMonsterModel(m.dna, m.rarity);
  const actors = mons.map((m, i) => {
    const s = saved[m.id];
    if (s) return { ...s, m, model: modelFor(m), emote: null, emoteT: 0 };
    const states = ['wander', 'wander', 'graze', 'sleep'];
    return {
      m, model: modelFor(m),
      x: 10 + Math.random() * (W - 12 * SCALE - 20),
      y: GROUND + 4 + Math.random() * (H - GROUND - 12 * SCALE - 8),
      dir: Math.random() < 0.5 ? 1 : -1, vx: 0.22 + Math.random() * 0.2,
      state: fresh ? states[Math.floor(Math.random() * states.length)] : 'wander',
      timer: 40 + Math.random() * 220, blink: 0, bob: Math.floor(Math.random() * 500),
      emote: null, emoteT: 0, dazedT: 0, target: null,
    };
  });
  RANCH.actors = actors;

  let raf;
  let grabbed = null;
  let downAt = null;
  let hovered = null;

  function assignFetcher(ghat) {
    if (ghat.claimed || ghat.done) return;
    // recently-crowned creatures are content (hatCd) — this breaks the two
    // monsters endlessly trading the same pair of hats
    const free = actors.filter(a => a !== grabbed && a.state !== 'fetch' && !a.dazedT && !(a.hatCd > 0) && !a.posing);
    if (!free.length) return;   // everyone's content; the hat waits in the grass
    const pool = free.filter(a => !a.m.hat).length ? free.filter(a => !a.m.hat) : free;
    const nearest = pool.reduce((best, a) => {
      const da = Math.hypot(a.x - ghat.x, a.y - ghat.y);
      return !best || da < best.d ? { a, d: da } : best;
    }, null);
    nearest.a.state = 'fetch';
    nearest.a.target = ghat;
    ghat.claimed = true;
  }

  function updateHerdTile(m) {
    const tile = document.querySelector(`.mon-tile[data-mid="${m.id}"] canvas`);
    if (!tile) return;
    tile.outerHTML = critterTag(m, 48);
    hydrateSprites(document.querySelector(`.mon-tile[data-mid="${m.id}"]`));
  }

  function crownLocal(actor, hatId) {
    const old = actor.m.hat;
    actor.m.hat = hatId;
    actor.emote = 'heart'; actor.emoteT = 80;
    actor.hatCd = 1500;   // ~25s of hat contentment
    SFX.accept();
    api(`/monsters/${actor.m.id}/hat`, { method: 'POST', body: { hat_id: hatId } }).catch(() => {});
    updateHerdTile(actor.m);
    if (old) {
      // the old hat tumbles to the grass; someone will want it
      const ghat = { hat: old, x: Math.min(W - 30, actor.x + 30), y: actor.y + 20, claimed: false };
      RANCH.groundHats.push(ghat);
      setTimeout(() => assignFetcher(ghat), 1200);
    }
  }

  /* ---- hat panel (lives inside the pen, top right) ---- */
  const panel = document.getElementById('pen-panel');
  const hatsBtn = document.getElementById('pen-hats-btn');

  function renderHatPanel() {
    const owned = Object.entries(RANCH.hats).filter(([, q]) => q > 0);
    panel.innerHTML = owned.length
      ? `<div class="muted" style="font-size:14px;margin-bottom:4px">drag onto a creature, or onto the grass</div>
         <div class="pen-hats">${owned.map(([id, q]) => {
          const it = (S.itemsCatalog || {})[id] || { sprite: id, name: id };
          return `<span class="hat-slot" data-hat="${id}" title="${esc(it.name)}">${spriteTag(it.sprite, 26)}<span class="qty">&times;${q}</span></span>`;
        }).join('')}</div>`
      : '<div class="muted" style="font-size:14px">no hats in the box — crank the Krankwerk</div>';
    hydrateSprites(panel);
  }

  hatsBtn.onclick = () => {
    SFX.click();
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    if (!open) renderHatPanel();
  };

  // hat dragging from the panel
  let hatDrag = null; // {hat, ghost}
  panel.addEventListener('pointerdown', (e) => {
    const slot = e.target.closest('.hat-slot');
    if (!slot) return;
    e.preventDefault();
    const hat = slot.dataset.hat;
    const it = (S.itemsCatalog || {})[hat] || { sprite: hat };
    const ghost = document.createElement('div');
    ghost.className = 'hat-ghost';
    ghost.innerHTML = spriteTag(it.sprite, 32);
    document.body.appendChild(ghost);
    hydrateSprites(ghost);
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    hatDrag = { hat, ghost };
    SFX.click();
  });
  const onDocMove = (e) => {
    if (!hatDrag) return;
    hatDrag.ghost.style.left = e.clientX + 'px';
    hatDrag.ghost.style.top = e.clientY + 'px';
  };
  const onDocUp = (e) => {
    if (!hatDrag) return;
    const { hat, ghost } = hatDrag;
    hatDrag = null;
    ghost.remove();
    const rect = cv.getBoundingClientRect();
    const inPen = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (!inPen) return;  // dropped outside: back in the box, no harm done
    const p = {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
    RANCH.hats[hat]--;
    const hit = hitTest(p);
    if (hit) {
      crownLocal(hit, hat);
      toast('Crowned. Devastating.');
    } else {
      const ghat = { hat, x: Math.max(4, Math.min(W - 30, p.x - 12)), y: Math.max(GROUND, Math.min(H - 24, p.y - 8)), claimed: false };
      RANCH.groundHats.push(ghat);
      SFX.coin();
      setTimeout(() => assignFetcher(ghat), 700 + Math.random() * 900);
    }
    if (panel.style.display !== 'none') renderHatPanel();
  };
  document.addEventListener('pointermove', onDocMove);
  document.addEventListener('pointerup', onDocUp);

  /* ---- simulation ---- */
  let reassignT = 0;
  function tick() {
    // unclaimed hats on the grass get re-offered as cooldowns expire
    if (++reassignT % 240 === 0) {
      RANCH.groundHats.filter(g => !g.claimed && !g.done).forEach(assignFetcher);
    }
    actors.forEach((a, i) => {
      a.bob++;
      if (a.hatCd > 0) a.hatCd--;
      a.blink = (a.bob % 180) < 6;
      if (a.posing) return;   // held still under the magnifying glass
      if (a === grabbed) {
        a.dir = (Math.floor(a.bob / 3) % 2) ? 1 : -1;   // FREAK OUT
        if (a.bob % 14 === 0) SFX.squeak();
        return;
      }
      if (a.dazedT > 0) { a.dazedT--; return; }
      if (a === hovered) { return; }   // frozen mid-inspection — still bobs/blinks above
      if (a.state === 'fetch' && a.target) {
        const g = a.target;
        if (g.done) { a.state = 'wander'; a.target = null; }
        else {
          const dx = g.x + 8 - (a.x + 6 * SCALE), dy = g.y - (a.y + 6 * SCALE);
          const dist = Math.hypot(dx, dy);
          if (dist < 12) {
            g.done = true;
            RANCH.groundHats = RANCH.groundHats.filter(x => x !== g);
            a.state = 'wander'; a.target = null;
            crownLocal(a, g.hat);
          } else {
            a.dir = dx > 0 ? 1 : -1;
            a.x += (dx / dist) * 0.9;
            a.y += (dy / dist) * 0.9;
          }
        }
      } else {
        a.timer--;
        if (a.timer <= 0) {
          const roll = Math.random();
          a.state = roll < 0.45 ? 'wander' : roll < 0.8 ? 'graze' : 'sleep';
          if (a.state === 'wander') a.dir = Math.random() < 0.5 ? -1 : 1;
          a.timer = 90 + Math.random() * 200;
        }
        if (a.state === 'wander') {
          a.x += a.vx * a.dir;
          if (a.x < 6) { a.x = 6; a.dir = 1; }
          if (a.x > W - 12 * SCALE - 6) { a.x = W - 12 * SCALE - 6; a.dir = -1; }
          if (Math.random() < 0.004) a.y += Math.random() < 0.5 ? -6 : 6;
        }
      }
      a.y = Math.max(GROUND + 4, Math.min(H - 12 * SCALE, a.y));
      if (a.emoteT > 0) a.emoteT--;
      else if (Math.random() < 0.002) {
        const other = actors.find((b, j) => j !== i && b !== grabbed && Math.abs(b.x - a.x) < 46 && Math.abs(b.y - a.y) < 30);
        if (other) {
          a.emote = Math.random() < 0.7 ? 'heart' : 'spark'; a.emoteT = 70;
          other.emote = a.emote; other.emoteT = 70;
          a.dir = other.x > a.x ? 1 : -1; other.dir = -a.dir;
        }
      }
      if (a.state === 'graze' && a.emoteT <= 0 && Math.random() < 0.01) { a.emote = 'nom'; a.emoteT = 40; }
    });

    ctx.drawImage(bg, 0, 0);
    RANCH.groundHats.forEach(g => drawSpriteCtx(ctx, ((S.itemsCatalog || {})[g.hat] || { sprite: g.hat }).sprite, g.x, g.y, 2));
    const buddyId = S.state.buddy ? S.state.buddy.id : null;
    actors.slice().sort((p, q) => (p === grabbed ? 1e9 : p.y) - (q === grabbed ? -1e9 : q.y)).forEach(a => {
      const isGrab = a === grabbed;
      const isHover = a === hovered && !isGrab && !a.posing;
      const jx = isGrab ? Math.sin(a.bob * 1.4) * 2 : 0;
      const bobY = a.state === 'sleep' && !isGrab ? 2 : Math.sin(a.bob / (isGrab ? 3 : 12)) * 2;
      const grazeY = a.state === 'graze' && !isGrab ? 3 : 0;
      const dScale = isHover ? SCALE * 1.2 : SCALE;
      const grow = (12 * dScale - 12 * SCALE) / 2;   // grow from its center, not its corner
      const bx = Math.round(a.x + jx - grow), by = Math.round(a.y + bobY + grazeY - grow);
      const blinking = a.blink || (a.state === 'sleep' && !isGrab);
      if (a.m.boss) drawBoss(ctx, a.model, dScale, bx, by, a.dir < 0, blinking);
      else drawMonster(ctx, a.model, dScale, bx, by, a.dir < 0, blinking, a.m.hat || null);
      if (isHover) {
        const label = a.m.name;
        ctx.font = 'bold 13px monospace';
        const tw = ctx.measureText(label).width;
        const tx = a.x + 6 * SCALE - tw / 2, ty = a.y - 10 - grow;
        ctx.fillStyle = 'rgba(16,16,28,0.8)';
        ctx.fillRect(tx - 3, ty - 11, tw + 6, 14);
        ctx.fillStyle = '#f0d080';
        ctx.fillText(label, tx, ty);
      }
      if (a.m.id === buddyId) {
        const pulse = 1 + Math.sin(a.bob / 10) * 0.5;
        ctx.fillStyle = '#e05070';
        ctx.fillRect(a.x + 6 * SCALE - 4, a.y - 12 - pulse, 4, 4);
        ctx.fillRect(a.x + 6 * SCALE + 1, a.y - 12 - pulse, 4, 4);
        ctx.fillRect(a.x + 6 * SCALE - 2, a.y - 9 - pulse, 7, 4);
      }
      if (isGrab) {
        ctx.fillStyle = '#f0d060'; ctx.font = 'bold 16px monospace';
        ctx.fillText('!', a.x + 12 * SCALE + 2, a.y - 4);
        ctx.fillText('!', a.x - 8, a.y - 8);
      } else if (a.dazedT > 0) {
        ctx.fillStyle = '#8a8fa5'; ctx.font = '14px monospace';
        ctx.fillText('?', a.x + 12 * SCALE - 2, a.y - 4);
      } else if (a.state === 'sleep') {
        ctx.fillStyle = '#8a8fa5'; ctx.font = '13px monospace';
        ctx.fillText('z', a.x + 12 * SCALE - 4, a.y - 4 - (a.bob % 40) / 8);
      }
      if (a.emoteT > 0 && a.emote && !isGrab) {
        const ey = a.y - 10 - (70 - a.emoteT) / 6;
        if (a.emote === 'heart') { ctx.fillStyle = '#e05070'; ctx.fillRect(a.x + 12, ey, 4, 4); ctx.fillRect(a.x + 18, ey, 4, 4); ctx.fillRect(a.x + 14, ey + 3, 6, 5); }
        else if (a.emote === 'spark') { ctx.fillStyle = '#f0d060'; ctx.fillRect(a.x + 14, ey, 3, 3); ctx.fillRect(a.x + 20, ey + 4, 3, 3); }
        else { ctx.fillStyle = '#8ac05e'; ctx.fillRect(a.x + 14, a.y + 12 * SCALE - 4, 3, 3); }
      }
    });
    raf = requestAnimationFrame(tick);
  }
  tick();
  window.__stopRanch = () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('pointermove', onDocMove);
    document.removeEventListener('pointerup', onDocUp);
    if (hatDrag) { hatDrag.ghost.remove(); hatDrag = null; }
    // remember the herd's arrangement so in-page updates don't teleport anyone
    RANCH.saved = {};
    actors.forEach(a => {
      RANCH.saved[a.m.id] = {
        x: a.x, y: a.y, dir: a.dir, vx: a.vx, state: a.state === 'fetch' ? 'wander' : a.state,
        timer: a.timer, bob: a.bob, blink: 0, dazedT: 0, target: null,
      };
    });
  };

  const toPen = (e) => {
    const rect = cv.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (W / rect.width),
      y: (e.clientY - rect.top) * (H / rect.height),
    };
  };
  const hitTest = (p) => actors.slice().reverse().find(a =>
    p.x >= a.x - 4 && p.x <= a.x + 12 * SCALE + 4 && p.y >= a.y - 6 && p.y <= a.y + 12 * SCALE + 4);

  cv.addEventListener('pointerdown', (e) => {
    const p = toPen(e);
    const hit = hitTest(p);
    // clicking empty grass while a card is open just closes it; clicking another
    // creature closes the old card and opens the new one (handled on drop -> monLens)
    if (!hit) { if (document.querySelector('.lens-layer')) G.closeLens(); return; }
    downAt = { x: p.x, y: p.y, actor: hit };   // a tap is just a tap — no panic yet
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers */ }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = toPen(e);
    if (downAt && !grabbed && Math.hypot(p.x - downAt.x, p.y - downAt.y) > 8) {
      grabbed = downAt.actor;                  // NOW it panics
      if (grabbed.state === 'fetch' && grabbed.target) grabbed.target.claimed = false;
      hovered = null;
      SFX.squeak();
    }
    if (grabbed) {
      grabbed.x = Math.max(4, Math.min(W - 12 * SCALE - 4, p.x - 6 * SCALE));
      grabbed.y = Math.max(GROUND - 20, Math.min(H - 12 * SCALE, p.y - 6 * SCALE));
      return;
    }
    hovered = hitTest(p) || null;
  });
  cv.addEventListener('pointerleave', () => { hovered = null; });
  const drop = (e) => {
    if (grabbed) {
      const a = grabbed;
      grabbed = null;
      a.y = Math.max(GROUND + 4, a.y);
      a.dazedT = 60;
      a.state = 'wander';
      a.target = null;
      SFX.hurt();
    } else if (downAt) {
      G.monLens(downAt.actor.m.id);
    }
    downAt = null;
  };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', () => { grabbed = null; downAt = null; });
}

/* ---- magnifying-glass inspection: a lens over the creature + an info
   dialog docked beside it, on whichever side of the pen has room ---- */

G.closeLens = () => {
  const layer = document.querySelector('.lens-layer');
  if (!layer) return;
  const a = (RANCH.actors || []).find(x => x.posing);
  if (a) { a.posing = false; a.state = 'wander'; a.timer = 60; }
  layer.remove();
};

G.monLens = (id) => {
  G.closeLens();
  const actor = (RANCH.actors || []).find(a => a.m.id === id);
  const m = RANCH.mons.find(x => x.id === id);
  const cv = document.getElementById('ranch-cv');
  if (!m || !actor || !cv) return;
  SFX.click();
  actor.posing = true;

  const box = cv.closest('.ranch-box');
  const brect = box.getBoundingClientRect();
  const crect = cv.getBoundingClientRect();
  const sx = crect.width / cv.width, sy = crect.height / cv.height;
  const offX = crect.left - brect.left, offY = crect.top - brect.top;
  const L = 150, R = L / 2;
  // lens centered on the creature, clamped fully inside the pen
  let cx = offX + (actor.x + 18) * sx;
  let cy = offY + (actor.y + 18) * sy;
  cx = Math.max(R + 6, Math.min(brect.width - R - 6, cx));
  cy = Math.max(R + 24, Math.min(brect.height - R - 30, cy));
  const rightSide = cx < brect.width / 2;   // dock the dialog where there's room

  const isBuddy = S.state.buddy && S.state.buddy.id === id;
  const hatName = m.hat && S.itemsCatalog && S.itemsCatalog[m.hat] ? S.itemsCatalog[m.hat].name : null;
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  const BOXW = 190, BOXH_EST = 190;
  let boxLeft = rightSide ? cx + R + 14 : cx - R - 14 - BOXW;
  boxLeft = Math.max(6, Math.min(brect.width - BOXW - 6, boxLeft));
  let boxTop = cy - BOXH_EST / 2;
  boxTop = Math.max(6, Math.min(brect.height - BOXH_EST - 6, boxTop));

  const layer = document.createElement('div');
  layer.className = 'lens-layer';
  // clicking the glass or any non-button part of the card closes it; the action
  // buttons stop the click from bubbling so they act instead of just closing
  layer.innerHTML = `
    <div class="lens" style="left:${Math.round(cx - R)}px;top:${Math.round(cy - R)}px;width:${L}px;height:${L}px" onclick="G.closeLens()">
      <div class="lens-inner-wrap"><div class="lens-inner">${critterTag(m, 104)}</div></div>
    </div>
    <div class="lens-box" style="left:${Math.round(boxLeft)}px;top:${Math.round(boxTop)}px;width:${BOXW}px" onclick="G.closeLens()">
      <button class="lens-box-close" onclick="event.stopPropagation();G.closeLens()">&#10005;</button>
      <div class="lens-box-name r-${m.rarity}">${esc(m.name)}${isBuddy ? ' <span style="color:#e05070">&#9829;</span>' : ''}</div>
      <div class="muted" style="text-transform:uppercase;font-size:13px">${m.rarity}</div>
      <div class="lens-box-info">
        <span style="color:var(--blue)">${esc(m.personality)}</span>
        ${hatName ? `<br>wearing <span style="color:var(--gold-bright)">${esc(hatName)}</span>` : ''}
        <br><span class="muted">${esc(m.source)}</span>
        <br><span class="muted">joined ${m.born.slice(0, 10)}</span>
      </div>
      <div class="lens-box-btns">
        <button class="btn small ${isBuddy ? '' : 'green'}" onclick="event.stopPropagation();G.toggleBuddy(${id})">${isBuddy ? 'UNBUDDY' : '&#9829; MAKE BUDDY'}</button>
        ${m.hat ? `<button class="btn small" onclick="event.stopPropagation();G.doffHat(${id})">DOFF HAT</button>` : ''}
        <button class="btn small danger" onclick="event.stopPropagation();G.setFree(${id})">SET FREE</button>
      </div>
    </div>`;
  box.appendChild(layer);
  hydrateSprites(layer);
};

G.toggleBuddy = async (id) => {
  const r = await api(`/monsters/${id}/buddy`, { method: 'POST' });
  S.state.buddy = r.buddy;
  SFX.accept();
  G.closeLens();
  toast(r.buddy ? `${r.buddy.name} trots along beside you now.` : 'You walk alone again. It watches you go.');
  render();
};

G.doffHat = async (id) => {
  await api(`/monsters/${id}/hat`, { method: 'POST', body: { hat_id: null } });
  const m = RANCH.mons.find(x => x.id === id);
  if (m) {
    RANCH.hats[m.hat] = (RANCH.hats[m.hat] || 0) + 1;
    const actor = (RANCH.actors || []).find(a => a.m.id === id);
    if (actor) { actor.m.hat = null; actor.hatCd = 1500; }
    m.hat = null;
    const tile = document.querySelector(`.mon-tile[data-mid="${id}"] canvas`);
    if (tile) {
      tile.outerHTML = critterTag(m, 48);
      hydrateSprites(document.querySelector(`.mon-tile[data-mid="${id}"]`));
    }
  }
  G.closeLens();
  toast('Hat returned to the box.');
};

G.setFree = async (id) => {
  const m = RANCH.mons.find(x => x.id === id);
  const name = m ? m.name : 'it';
  if (!confirm(`Set ${name} free? It will look back once, then be gone.`)) return;
  await api(`/monsters/${id}`, { method: 'DELETE' });
  if (S.state.buddy && S.state.buddy.id === id) S.state.buddy = null;
  G.closeLens();
  SFX.stairs();
  toast(`${name} bounds off toward the hills.`);
  render();
};

G.ripPack = async () => {
  let r;
  try {
    r = await api('/monsters/rip', { method: 'POST' });
  } catch (e) { return; }
  await refreshState();
  SFX.crank();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="win pack-stage">
    <div class="r-uncommon" style="font-size:20px">${esc(r.series)}</div>
    <div class="muted">something scrabbles inside...</div>
    <div class="pack-wrap" id="pack-wrap" style="margin:14px 0">${spriteTag('pack', 120)}</div>
    <div style="color:var(--gold-bright)" id="pack-prompt">TAP THE PACK TO RIP IT OPEN</div>
    <div class="pack-cards" id="pack-cards"></div>
    <div style="margin-top:12px;display:none" id="pack-done"><button class="btn big" onclick="this.closest('.overlay').remove();render()">TO THE PEN</button></div>
  </div>`;
  document.body.appendChild(ov);
  hydrateSprites(ov);
  const wrap = ov.querySelector('#pack-wrap');
  wrap.onclick = () => {
    if (wrap.classList.contains('ripping')) return;
    wrap.classList.add('ripping');
    SFX.hit();
    const prompt = ov.querySelector('#pack-prompt');
    prompt.textContent = '...';
    setTimeout(() => { wrap.style.display = 'none'; prompt.style.display = 'none'; }, 460);
    const cards = ov.querySelector('#pack-cards');
    r.monsters.forEach((m, i) => {
      setTimeout(() => {
        cards.insertAdjacentHTML('beforeend', `
          <div class="pack-card r-${m.rarity}">
            <div style="display:flex;justify-content:center">${monsterTag(m.dna, m.rarity, 60)}</div>
            <div class="pc-name r-${m.rarity}">${esc(m.name)}</div>
            <div class="muted" style="font-size:13px">${esc(m.personality)}</div>
          </div>`);
        hydrateSprites(cards);
        SFX.reveal(m.rarity);
        if (m.rarity === 'legendary') {
          document.body.classList.add('megashake');
          setTimeout(() => document.body.classList.remove('megashake'), 700);
        }
        if (i === r.monsters.length - 1) ov.querySelector('#pack-done').style.display = 'block';
      }, 500 + i * 650);
    });
  };
};

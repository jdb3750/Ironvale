/* The Menagerie: Chao-garden pen. Creatures wander, graze, sleep, and trade
   hats. Sim state survives re-renders (RANCH.saved) and randomizes on each
   fresh visit so the herd feels like it lived while you were gone. Hat
   operations never re-render — they act on the live simulation. */

const RANCH = {
  mons: [], hats: {}, decors: [], packs: 0, saved: null, groundHats: [],
  actors: [], hatPending: new Set(), packPending: false, packTimers: new Set(),
  packOverlay: null, packRequest: null, packMotionCleanup: null, redraw: null, renderHatPanel: null,
  offerGroundHat: null, fullscreen: false,
};

function resetRanchState() {
  if (window.__stopRanch) {
    window.__stopRanch();
    window.__stopRanch = null;
  }
  cancelRanchPack();
  RANCH.mons = [];
  RANCH.hats = {};
  RANCH.decors = [];
  RANCH.packs = 0;
  RANCH.saved = null;
  RANCH.groundHats = [];
  RANCH.actors = [];
  RANCH.hatPending.clear();
  RANCH.packPending = false;
  RANCH.packRequest = null;
  RANCH.redraw = null;
  RANCH.renderHatPanel = null;
  RANCH.offerGroundHat = null;
  RANCH.fullscreen = false;
}
RESETS.push(resetRanchState);

SCREENS.ranch = async function () {
  const token = captureRouteToken();
  const [d, inventory] = await Promise.all([api('/monsters'), api('/inventory')]);
  if (!isRouteTokenCurrent(token)) return;
  const inv = inventory.items;
  RANCH.mons = d.monsters;
  RANCH.hats = {};
  inv.filter(i => i.type === 'hat').forEach(h => RANCH.hats[h.id] = h.qty);
  RANCH.groundHats.filter(groundHat => !groundHat.done).forEach(groundHat => {
    RANCH.hats[groundHat.hat] = Math.max(0, (RANCH.hats[groundHat.hat] || 0) - 1);
  });
  RANCH.decors = inv.filter(i => i.type === 'decor');
  RANCH.packs = d.packs_owned;

  // On a compact phone the inline pen is look-don't-touch (page scrolling
  // fights creature drags); stepping inside opens a fullscreen pen where
  // pointer play works properly. The pen-ui must exist in BOTH modes —
  // startRanch binds handlers to it unconditionally — so the preview only
  // hides it with CSS.
  const phonePen = isCompactPhone();
  const fullPen = phonePen && RANCH.fullscreen && d.monsters.length > 0;
  const inertPen = phonePen && !fullPen;

  $app().innerHTML = shell(`
    <div class="win"><span class="win-title">The Menagerie (${d.monsters.length})</span>
      <div class="ranch-box${fullPen ? ' pen-full' : ''}${inertPen ? ' pen-inert' : ''}"${inertPen && d.monsters.length ? ' onclick="G.openPen()"' : ''}>
        <canvas class="ranch" id="ranch-cv" width="640" height="300"></canvas>
        <div class="pen-ui">
          <button type="button" class="pen-btn" id="pen-hats-btn" aria-expanded="false" aria-controls="pen-panel">HATS</button>
          <div class="pen-panel" id="pen-panel" style="display:none"></div>
        </div>
        ${fullPen ? '<button type="button" class="pen-btn pen-leave" onclick="event.stopPropagation();G.closePen()">&larr; LEAVE THE PEN</button>' : ''}
        ${inertPen && d.monsters.length ? `<div class="pen-visit">
          <button type="button" class="control-reset pen-visit-label ranch-action" onclick="event.stopPropagation();G.openPen()">ENTER THE PEN</button>
        </div>` : ''}
        ${!d.monsters.length ? '<div class="ranch-empty">The pen stands empty. Rip a pack, or subdue a creature in the Undercroft.</div>' : ''}
      </div>
      <div class="muted center" style="font-family: var(--font-body); font-size: var(--type-body);margin-top:4px">${inertPen
        ? 'step inside to meet the herd, drag creatures about, and hand out hats'
        : `tap a creature to meet it &middot; drag one to relocate it (they hate this)
        &middot; drag a hat onto a head, or drop it on the grass and see who claims it`}</div>
      <div class="center" style="margin-top:10px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button type="button" class="btn wide green btn-fit ranch-action" onclick="G.ripPack()">RIP A PACK ${RANCH.packs > 0 ? `(${RANCH.packs} owned)` : `(${spriteTag('icon_coin', 14)}${d.pack_cost})`}</button>
      </div>
      <div class="muted center" style="font-family: var(--font-body); font-size: var(--type-body);margin-top:6px">now dropping: <span class="r-uncommon">${esc(d.series)}</span>
        &middot; ${d.series_days_left === 1 ? 'ends today' : `ends in ${d.series_days_left} days`} — limited monthly run</div>
    </div>
    ${d.monsters.length ? `<div class="win"><span class="win-title">The Herd</span>
      <div class="mon-grid">${d.monsters.map(m => `
        <button type="button" class="mon-tile ${m.boss ? 'boss' : 'r-' + m.rarity}" data-mid="${m.id}" style="font:inherit;color:inherit;border-radius:0;appearance:none" aria-label="Meet ${esc(m.name)}" onclick="G.monLens(${m.id})">
          <div style="display:flex;justify-content:center">${critterTag(m, 48)}</div>
          <div class="mn r-${m.rarity}">${esc(m.name)}${S.state.buddy && S.state.buddy.id === m.id ? ' <span style="color:#e05070">&#9829;</span>' : ''}</div>
        </button>`).join('')}</div>
    </div>` : ''}
  `);
  if (fullPen) {
    // the fixed pen ends where the dock begins, and the canvas's logical
    // grid must match the box's portrait aspect BEFORE startRanch reads it
    const box = document.querySelector('.ranch-box.pen-full');
    const dock = document.querySelector('.phone-dock');
    if (dock) box.style.bottom = dock.offsetHeight + 'px';
    const rect = box.getBoundingClientRect();
    const cv = document.getElementById('ranch-cv');
    cv.width = 360;
    cv.height = Math.max(240, Math.round(360 * (rect.height / Math.max(1, rect.width))));
  }
  startRanch(d.monsters);
};

G.openPen = () => { RANCH.fullscreen = true; render(); };
G.closePen = () => { RANCH.fullscreen = false; render(); };

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

function updateRanchHerdTile(monster) {
  const root = document.querySelector(`.mon-tile[data-mid="${monster.id}"]`);
  const tile = root && root.querySelector('canvas');
  if (!tile) return;
  tile.outerHTML = critterTag(monster, 48);
  hydrateSprites(root);
}

async function setRanchHat(id, hatId, options = {}) {
  if (RANCH.hatPending.has(id)) return false;
  const monster = RANCH.mons.find(candidate => candidate.id === id);
  if (!monster) return false;

  const actor = (RANCH.actors || []).find(candidate => candidate.m.id === id);
  const oldHat = monster.hat || null;
  const routeToken = captureRouteToken();
  RANCH.hatPending.add(id);
  try {
    await api(`/monsters/${id}/hat`, { method: 'POST', body: { hat_id: hatId } });
  } catch (error) {
    return false;
  } finally {
    RANCH.hatPending.delete(id);
  }

  if (!isRouteTokenCurrent(routeToken) || S.screen !== 'ranch') {
    RANCH.groundHats = [];
    RANCH.saved = null;
    return false;
  }

  if (hatId && options.source !== 'ground') {
    RANCH.hats[hatId] = Math.max(0, (RANCH.hats[hatId] || 0) - 1);
  }
  if (oldHat) {
    if (options.tumbleOld && actor) {
      const groundHat = {
        hat: oldHat,
        x: Math.min(610, actor.x + 30),
        y: actor.y + 20,
        claimed: false,
      };
      RANCH.groundHats.push(groundHat);
      if (RANCH.offerGroundHat) RANCH.offerGroundHat(groundHat, 1200);
    } else {
      RANCH.hats[oldHat] = (RANCH.hats[oldHat] || 0) + 1;
    }
  }

  monster.hat = hatId;
  if (actor) {
    actor.m.hat = hatId;
    actor.emote = 'heart';
    actor.emoteT = 80;
    actor.hatCd = 1500;
  }
  SFX.accept();
  updateRanchHerdTile(monster);
  if (RANCH.renderHatPanel) RANCH.renderHatPanel();
  if (RANCH.redraw) RANCH.redraw();
  return true;
}

function cancelRanchPack(removeOverlay = true) {
  if (RANCH.packMotionCleanup) RANCH.packMotionCleanup();
  RANCH.packMotionCleanup = null;
  RANCH.packTimers.forEach(timer => clearTimeout(timer));
  RANCH.packTimers.clear();
  document.body.classList.remove('megashake');
  if (removeOverlay && RANCH.packOverlay && RANCH.packOverlay.isConnected) {
    removeRouteOverlay(RANCH.packOverlay, { force: true, restoreFocus: false });
  }
  RANCH.packOverlay = null;
}

function scheduleRanchPack(callback, delay, routeToken, overlay) {
  const timer = setTimeout(() => {
    RANCH.packTimers.delete(timer);
    if (!isRouteTokenCurrent(routeToken) || !overlay.isConnected) return;
    callback();
  }, delay);
  RANCH.packTimers.add(timer);
}

function bindRanchPackMotion(settlePack) {
  if (RANCH.packMotionCleanup) RANCH.packMotionCleanup();
  RANCH.packMotionCleanup = onReducedMotionRequested(settlePack);
}

function ranchPackCard(monster, reducedMotion = false) {
  return `<div class="pack-card r-${monster.rarity}"${reducedMotion ? ' style="animation:none"' : ''}>
    <div style="display:flex;justify-content:center">${monsterTag(monster.dna, monster.rarity, 60)}</div>
    <div class="pc-name r-${monster.rarity}">${esc(monster.name)}</div>
    <div class="muted" style="font-family: var(--font-fine); font-size: var(--type-fine)">${esc(monster.personality)}</div>
  </div>`;
}

function startRanch(mons) {
  const cv = document.getElementById('ranch-cv');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const GROUND = 60;
  const SCALE = 3;
  RANCH.groundHats = RANCH.groundHats.filter(g => !g.done);
  RANCH.groundHats.forEach(groundHat => {
    groundHat.claimed = false;
    groundHat.pending = false;
  });

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
    // clamp restored spots to THIS pen's bounds — the phone's preview and
    // fullscreen pens have different geometries, and a sleeper never
    // re-clamps on its own (only wanderers hit the walls)
    if (s) return {
      ...s, m, model: modelFor(m), emote: null, emoteT: 0,
      x: Math.max(6, Math.min(W - 12 * SCALE - 6, s.x)),
      y: Math.max(GROUND + 4, Math.min(H - 12 * SCALE, s.y)),
    };
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

  const ranchRouteToken = captureRouteToken();
  const simTimers = new Set();
  let running = true;
  let raf = null;
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

  function offerGroundHat(groundHat, delay) {
    if (prefersReducedMotion()) return;
    const timer = setTimeout(() => {
      simTimers.delete(timer);
      if (!running || !isRouteTokenCurrent(ranchRouteToken)) return;
      assignFetcher(groundHat);
    }, delay);
    simTimers.add(timer);
  }
  RANCH.offerGroundHat = offerGroundHat;

  async function claimGroundHat(actor, groundHat) {
    if (groundHat.pending) return;
    groundHat.pending = true;
    const crowned = await setRanchHat(actor.m.id, groundHat.hat, {
      source: 'ground',
      tumbleOld: true,
    });
    if (!running || !isRouteTokenCurrent(ranchRouteToken)) return;
    groundHat.pending = false;
    if (crowned) {
      groundHat.done = true;
      RANCH.groundHats = RANCH.groundHats.filter(candidate => candidate !== groundHat);
    } else {
      groundHat.claimed = false;
    }
    actor.state = 'wander';
    actor.target = null;
    if (RANCH.redraw) RANCH.redraw();
  }

  /* ---- hat panel (lives inside the pen, top right) ---- */
  const panel = document.getElementById('pen-panel');
  const hatsBtn = document.getElementById('pen-hats-btn');

  function renderHatPanel() {
    const owned = Object.entries(RANCH.hats).filter(([, q]) => q > 0);
    panel.innerHTML = owned.length
      ? `<div class="muted" style="font-family: var(--font-fine); font-size: var(--type-fine);margin-bottom:4px">drag onto a creature, or onto the grass</div>
         <div class="pen-hats">${owned.map(([id, q]) => {
          const it = (S.itemsCatalog || {})[id] || { sprite: id, name: id };
          return `<button type="button" class="hat-slot" data-hat="${id}" style="font:inherit;color:inherit;border-radius:0;appearance:none" title="${esc(it.name)}" aria-label="Drag ${esc(it.name)}, ${q} owned">${spriteTag(it.sprite, 26)}<span class="qty">&times;${q}</span></button>`;
        }).join('')}</div>`
      : '<div class="muted" style="font-family: var(--font-fine); font-size: var(--type-fine)">no hats in the box — crank the Crankwerk</div>';
    hydrateSprites(panel);
  }
  RANCH.renderHatPanel = renderHatPanel;

  hatsBtn.onclick = () => {
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : 'block';
    hatsBtn.setAttribute('aria-expanded', String(!open));
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
  const onDocUp = async (e) => {
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
    const hit = hitTest(p);
    if (hit) {
      if (await setRanchHat(hit.m.id, hat, { source: 'box', tumbleOld: true })) {
        toast('Crowned. Devastating.');
      }
    } else {
      RANCH.hats[hat]--;
      const ghat = { hat, x: Math.max(4, Math.min(W - 30, p.x - 12)), y: Math.max(GROUND, Math.min(H - 24, p.y - 8)), claimed: false };
      RANCH.groundHats.push(ghat);
      SFX.coin();
      offerGroundHat(ghat, 700 + Math.random() * 900);
      if (RANCH.redraw) RANCH.redraw();
    }
    if (panel.style.display !== 'none') renderHatPanel();
  };
  document.addEventListener('pointermove', onDocMove);
  document.addEventListener('pointerup', onDocUp);

  /* ---- simulation ---- */
  let reassignT = 0;
  function advanceSimulation() {
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
            claimGroundHat(a, g);
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
  }

  function drawFrame() {
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
  }
  RANCH.redraw = drawFrame;

  function tick() {
    if (!running || prefersReducedMotion()) {
      raf = null;
      return;
    }
    advanceSimulation();
    drawFrame();
    raf = requestAnimationFrame(tick);
  }

  const motionQuery = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncRanchMotion = () => {
    if (prefersReducedMotion()) {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      drawFrame();
    } else if (running && raf === null) {
      tick();
    }
  };
  if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', syncRanchMotion);
  if (prefersReducedMotion()) drawFrame();
  else tick();

  window.__stopRanch = () => {
    running = false;
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    simTimers.forEach(timer => clearTimeout(timer));
    simTimers.clear();
    if (motionQuery && motionQuery.removeEventListener) motionQuery.removeEventListener('change', syncRanchMotion);
    document.removeEventListener('pointermove', onDocMove);
    document.removeEventListener('pointerup', onDocUp);
    if (hatDrag) { hatDrag.ghost.remove(); hatDrag = null; }
    cancelRanchPack();
    RANCH.packRequest = null;
    RANCH.packPending = false;
    RANCH.redraw = null;
    RANCH.renderHatPanel = null;
    RANCH.offerGroundHat = null;
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
    if (!hit) {
      // a hat lying in the grass can be taken back into the box with a tap —
      // otherwise a drop nobody fetches (reduced motion, content herd) sits forever
      const ghat = RANCH.groundHats.find(g => !g.pending && !g.done
        && p.x >= g.x - 6 && p.x <= g.x + 26 && p.y >= g.y - 6 && p.y <= g.y + 22);
      if (ghat) {
        ghat.done = true;   // any fetcher mid-walk shrugs and wanders off
        RANCH.groundHats = RANCH.groundHats.filter(g => g !== ghat);
        RANCH.hats[ghat.hat] = (RANCH.hats[ghat.hat] || 0) + 1;
        if (panel.style.display !== 'none') renderHatPanel();
        SFX.coin();
        toast('Back in the hat box.');
        if (RANCH.redraw) RANCH.redraw();
        return;
      }
      // clicking empty grass while a card is open just closes it; clicking another
      // creature closes the old card and opens the new one (handled on drop -> monLens)
      if (document.querySelector('.lens-layer')) G.closeLens();
      return;
    }
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
      if (prefersReducedMotion()) drawFrame();
      return;
    }
    hovered = hitTest(p) || null;
    if (prefersReducedMotion()) drawFrame();
  });
  cv.addEventListener('pointerleave', () => {
    hovered = null;
    if (prefersReducedMotion()) drawFrame();
  });
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
    if (prefersReducedMotion()) drawFrame();
  };
  cv.addEventListener('pointerup', drop);
  cv.addEventListener('pointercancel', () => {
    grabbed = null;
    downAt = null;
    if (prefersReducedMotion()) drawFrame();
  });
}

/* ---- magnifying-glass inspection: a lens over the creature + an info
   dialog docked beside it, on whichever side of the pen has room ---- */

G.closeLens = () => {
  // Phone details live in a standard overlay; the desktop lens is a layer.
  document.querySelectorAll('.overlay[data-ranch-info]').forEach(o =>
    removeRouteOverlay(o, { force: true, restoreFocus: false }));
  const layer = document.querySelector('.lens-layer');
  const a = (RANCH.actors || []).find(x => x.posing);
  if (a) { a.posing = false; a.state = 'wander'; a.timer = 60; }
  if (layer) layer.remove();
  if ((layer || a) && RANCH.redraw) RANCH.redraw();
};

function openRanchLens(id, playSound) {
  // Tapping the creature (or its herd card) a second time dismisses its details.
  const wasOpen = document.querySelector(`.lens-layer[data-mid="${id}"], .overlay[data-ranch-info][data-mid="${id}"]`);
  G.closeLens();
  if (playSound && wasOpen) return;
  const actor = (RANCH.actors || []).find(a => a.m.id === id);
  const m = RANCH.mons.find(x => x.id === id);
  const cv = document.getElementById('ranch-cv');
  if (!m || !actor || !cv) return;
  if (playSound) SFX.click();

  const isBuddy = S.state.buddy && S.state.buddy.id === id;
  const hatName = m.hat && S.itemsCatalog && S.itemsCatalog[m.hat] ? S.itemsCatalog[m.hat].name : null;
  const ownedHats = Object.entries(RANCH.hats).filter(([, quantity]) => quantity > 0);
  const inner = `
      <div class="lens-box-name r-${m.rarity}">${esc(m.name)}${isBuddy ? ' <span style="color:#e05070">&#9829;</span>' : ''}</div>
      <div class="muted" style="text-transform:uppercase;font-family: var(--font-fine); font-size: var(--type-fine)">${m.rarity}</div>
      <div class="lens-box-info">
        <span style="color:var(--blue)">${esc(m.personality)}</span>
        ${hatName ? `<br>wearing <span style="color:var(--gold-bright)">${esc(hatName)}</span>` : ''}
        <br><span class="muted">${esc(m.source)}</span>
        <br><span class="muted">joined ${m.born.slice(0, 10)}</span>
      </div>
      <div class="lens-box-btns">
        ${ownedHats.length ? `<details class="hat-picker">
            <summary class="btn small hat-picker-summary">PUT ON A HAT</summary>
            <div class="hat-picker-menu" role="menu" aria-label="Hats for ${esc(m.name)}">
              ${ownedHats.map(([hatId, quantity]) => {
                const item = (S.itemsCatalog || {})[hatId] || { name: hatId };
                return `<button type="button" class="btn small hat-option ranch-action" role="menuitem" onclick="G.equipHat(${id},'${esc(hatId)}')">${esc(item.name)} <span class="muted">&times;${quantity}</span></button>`;
              }).join('')}
            </div>
          </details>`
          : '<div class="muted">No hats wait in the box.</div>'}
        <button type="button" class="btn small ${isBuddy ? '' : 'green'}" onclick="G.toggleBuddy(${id})">${isBuddy ? 'UNBUDDY' : '&#9829; MAKE BUDDY'}</button>
        ${m.hat ? `<button type="button" class="btn small ranch-action" data-hat-monster="${id}" onclick="G.doffHat(${id})">DOFF HAT</button>` : ''}
        <button type="button" class="btn small danger" onclick="G.setFree(${id})">SET FREE</button>
      </div>`;

  // Phone: the pen is far too short to hold the floating dialog, so the
  // creature's details open as a standard centered overlay instead of a
  // lens box that would cover the creature it describes.
  if (window.matchMedia('(max-width: 719px)').matches) {
    const ov = showModal(`<div class="win center ranch-info-win">
      <button type="button" class="lens-box-close" aria-label="Close details for ${esc(m.name)}" onclick="G.closeLens()">&#10005;</button>
      <div style="margin:2px 0 4px">${critterTag(m, 96)}</div>
      ${inner}
    </div>`);
    ov.dataset.ranchInfo = '1';
    ov.dataset.mid = id;
    return;
  }

  actor.posing = true;
  if (RANCH.redraw) RANCH.redraw();

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
  box.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });

  const BOXW = 190, BOXH_EST = ownedHats.length ? 265 : 210;
  let boxLeft = rightSide ? cx + R + 14 : cx - R - 14 - BOXW;
  boxLeft = Math.max(6, Math.min(brect.width - BOXW - 6, boxLeft));
  let boxTop = cy - BOXH_EST / 2;
  boxTop = Math.max(6, Math.min(brect.height - BOXH_EST - 6, boxTop));

  const layer = document.createElement('div');
  layer.className = 'lens-layer';
  layer.dataset.mid = id;
  layer.innerHTML = `
    <button type="button" class="lens control-reset illustrated-control" aria-label="Close details for ${esc(m.name)}" style="left:${Math.round(cx - R)}px;top:${Math.round(cy - R)}px;width:${L}px;height:${L}px" onclick="G.closeLens()">
      <div class="lens-inner-wrap"><div class="lens-inner">${critterTag(m, 104)}</div></div>
    </button>
    <div class="lens-box" style="left:${Math.round(boxLeft)}px;top:${Math.round(boxTop)}px;width:${BOXW}px">
      <button type="button" class="lens-box-close" aria-label="Close details for ${esc(m.name)}" onclick="G.closeLens()">&#10005;</button>
      ${inner}
    </div>`;
  box.appendChild(layer);
  hydrateSprites(layer);
}

G.monLens = id => openRanchLens(id, true);

G.equipHat = async (id, hatId) => {
  const crowned = await setRanchHat(id, hatId, { source: 'box' });
  if (!crowned) return;
  toast('Crowned. Devastating.');
  openRanchLens(id, false);
  // the details rebuild closes the menu — reopen it so trying on the next
  // hat is one tap away (the menu was open to make this pick at all)
  const picker = document.querySelector(`.lens-layer[data-mid="${id}"] .hat-picker, .overlay[data-ranch-info][data-mid="${id}"] .hat-picker`);
  if (picker) picker.open = true;
};

G.toggleBuddy = async (id) => {
  const token = captureRouteToken();
  const r = await api(`/monsters/${id}/buddy`, { method: 'POST' });
  if (!isRouteTokenCurrent(token)) return;
  S.state.buddy = r.buddy;
  SFX.accept();
  G.closeLens();
  toast(r.buddy ? `${r.buddy.name} trots along beside you now.` : 'You walk alone again. It watches you go.');
  render();
};

G.doffHat = async (id) => {
  if (!await setRanchHat(id, null, { source: 'box' })) return;
  G.closeLens();
  toast('Hat returned to the box.');
};

G.setFree = async (id) => {
  const m = RANCH.mons.find(x => x.id === id);
  const name = m ? m.name : 'it';
  if (!await confirmModal(`Set ${name} free? It will look back once, then be gone.`,
      { title: 'Set it free?', okLabel: 'SET FREE', danger: true })) return;
  const token = captureRouteToken();
  await api(`/monsters/${id}`, { method: 'DELETE' });
  if (!isRouteTokenCurrent(token)) return;
  if (S.state.buddy && S.state.buddy.id === id) S.state.buddy = null;
  G.closeLens();
  SFX.stairs();
  toast(`${name} bounds off toward the hills.`);
  render();
};

G.ripPack = async () => {
  if (RANCH.packPending) return;
  const routeToken = captureRouteToken();
  const request = { routeToken };
  RANCH.packPending = true;
  RANCH.packRequest = request;
  let result;
  try {
    result = await api('/monsters/rip', { method: 'POST' });
    if (!isRouteTokenCurrent(routeToken)) return;
    await refreshState();
    if (!isRouteTokenCurrent(routeToken)) return;
  } catch (error) {
    return;
  } finally {
    if (RANCH.packRequest === request) {
      RANCH.packRequest = null;
      RANCH.packPending = false;
    }
  }

  cancelRanchPack();
  SFX.crank();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="win pack-stage">
    <div class="r-uncommon" style="font-family: var(--font-body); font-size: var(--type-body)">${esc(result.series)}</div>
    <div class="muted">something scrabbles inside...</div>
    <button type="button" class="pack-wrap ranch-action control-reset illustrated-control" id="pack-wrap" style="margin:14px 0" aria-label="Rip open the monster pack">${spriteTag('pack', 120)}</button>
    <div style="color:var(--gold-bright)" id="pack-prompt">TAP THE PACK TO RIP IT OPEN</div>
    <div class="pack-cards" id="pack-cards"></div>
    <div style="margin-top:12px;display:none" id="pack-done"><button type="button" class="btn big">TO THE PEN</button></div>
  </div>`;
  if (!isRouteTokenCurrent(routeToken)) return;
  document.body.appendChild(ov);
  ov.dataset.escapeClose = 'false';
  prepareOverlay(ov);
  RANCH.packOverlay = ov;
  hydrateSprites(ov);
  const wrap = ov.querySelector('#pack-wrap');
  const prompt = ov.querySelector('#pack-prompt');
  const cards = ov.querySelector('#pack-cards');
  const done = ov.querySelector('#pack-done');
  let opened = false;
  let revealed = 0;

  done.querySelector('button').onclick = () => {
    if (!isRouteTokenCurrent(routeToken) || !ov.isConnected) return;
    cancelRanchPack(false);
    G.closeOverlay(ov, render);
  };

  wrap.onclick = () => {
    if (opened || !isRouteTokenCurrent(routeToken) || !ov.isConnected) return;
    opened = true;
    const reducedMotion = prefersReducedMotion();
    const settlePack = () => {
      if (!isRouteTokenCurrent(routeToken) || !ov.isConnected) return;
      RANCH.packTimers.forEach(timer => clearTimeout(timer));
      RANCH.packTimers.clear();
      document.body.classList.remove('megashake');
      wrap.style.animation = 'none';
      wrap.style.display = 'none';
      prompt.style.display = 'none';
      cards.innerHTML = result.monsters.map(monster => ranchPackCard(monster, true)).join('');
      hydrateSprites(cards);
      result.monsters.slice(revealed).forEach(monster => SFX.reveal(monster.rarity));
      revealed = result.monsters.length;
      done.style.display = 'block';
      if (RANCH.packMotionCleanup) RANCH.packMotionCleanup();
      RANCH.packMotionCleanup = null;
    };
    if (reducedMotion) {
      settlePack();
      return;
    }

    bindRanchPackMotion(settlePack);
    wrap.classList.add('ripping');
    SFX.hit();
    prompt.textContent = '...';
    scheduleRanchPack(() => {
      wrap.style.display = 'none';
      prompt.style.display = 'none';
    }, 460, routeToken, ov);
    result.monsters.forEach((monster, index) => {
      scheduleRanchPack(() => {
        cards.insertAdjacentHTML('beforeend', ranchPackCard(monster));
        hydrateSprites(cards);
        SFX.reveal(monster.rarity);
        revealed = Math.max(revealed, index + 1);
        if (monster.rarity === 'legendary') {
          document.body.classList.add('megashake');
          scheduleRanchPack(() => document.body.classList.remove('megashake'), 700, routeToken, ov);
        }
        if (index === result.monsters.length - 1) {
          done.style.display = 'block';
          if (RANCH.packMotionCleanup) RANCH.packMotionCleanup();
          RANCH.packMotionCleanup = null;
        }
      }, 500 + index * 650, routeToken, ov);
    });
  };
};

/* The Crankwerk gacha machine and the Settings scroll. */
/* ================= CRANKWERK (pull the lever!) ================= */

let crankPay = null;
let crankBusy = false;
let crankWork = null;
RESETS.push(() => {
  if (crankWork) crankWork.cancel();
  crankPay = null;
  crankBusy = false;
  crankWork = null;
});

SCREENS.crank = function () {
  const c = S.state.character;
  if (crankPay === null) crankPay = c.tokens > 0 ? 'token' : 'gold';
  if (crankPay === 'token' && c.tokens < 1) crankPay = 'gold';
  const canPay = crankPay === 'token' ? c.tokens >= 1 : c.gold >= 35;
  const canPull = canPay && !crankBusy;
  $app().innerHTML = shell(`
    <div class="win crank">
      <div class="pixel-title" style="margin-bottom:8px">THE CRANKWERK</div>
      <div class="muted">It vends delights for the Menagerie: hats, finery, whole packs of creatures.<br>
        <b style="color:var(--gold-bright)">Grip the lever. Pull it all the way down.</b></div>
      <div class="crank-stage">
        <div class="crank-machine" id="crank-m" style="margin:14px 0">${spriteTag('crank', 176)}<div class="capsule" id="crank-cap"></div></div>
        <button type="button" class="lever snap control-reset" id="lever"
          aria-label="Pull the Crankwerk lever" aria-disabled="${!canPull}">
          <span class="track"></span>
          <span class="knob" id="lever-knob">PULL</span>
        </button>
      </div>
      <div class="crank-pay" style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn small ${crankPay === 'token' ? 'pay-active' : ''}" data-crank-pay style="min-width:0" ${c.tokens < 1 || crankBusy ? 'disabled' : ''}
          onclick="crankPay='token';render()">${spriteTag('icon_token', 14)} TOKEN (${c.tokens})</button>
        <button class="btn small ${crankPay === 'gold' ? 'pay-active' : ''}" data-crank-pay style="min-width:0" ${c.gold < 35 || crankBusy ? 'disabled' : ''}
          onclick="crankPay='gold';render()">${spriteTag('icon_coin', 14)} 35 GOLD</button>
      </div>
      ${!canPay ? '<div class="muted" style="margin-top:6px">the machine wants a token or 35 gold</div>' : ''}
      <div class="muted" style="margin-top:10px;font-family: var(--font-body); font-size: var(--type-body)">
        odds: <span class="r-common">common</span> &middot; <span class="r-uncommon">uncommon</span> &middot; <span class="r-rare">rare</span> &middot; <span class="r-legendary">LEGENDARY</span>
      </div>
    </div>
  `);
  initLever(canPull);
};

function initLever(enabled) {
  const lever = document.getElementById('lever');
  const knob = document.getElementById('lever-knob');
  if (!lever) return;
  const MAX = 140;
  let dragging = false, moved = false, suppressClick = false;
  let startY = 0, prog = 0, lastTick = 0, fired = false;

  const setKnob = (p) => { knob.style.top = Math.round(p * MAX) + 'px'; };
  const fire = () => {
    if (!enabled) { SFX.error(); return; }
    if (fired || crankBusy) return;
    fired = true;
    lever.setAttribute('aria-disabled', 'true');
    setKnob(1);
    document.querySelectorAll('[data-crank-pay]').forEach(button => { button.disabled = true; });
    G.crank(crankPay === 'token');
  };

  lever.addEventListener('pointerdown', (e) => {
    if (!enabled || fired) { SFX.error(); return; }
    dragging = true; moved = false; startY = e.clientY - prog * MAX;
    lever.classList.remove('snap');
    try { lever.setPointerCapture(e.pointerId); } catch (error) {}
  });
  lever.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    if (Math.abs(e.clientY - startY) > 3) moved = true;
    prog = Math.max(0, Math.min(1, (e.clientY - startY) / MAX));
    setKnob(prog);
    const tick = Math.floor(prog * 8);
    if (tick !== lastTick) { lastTick = tick; SFX.click(); }
  });
  const release = (commit, event) => {
    if (!dragging) return;
    dragging = false;
    try { lever.releasePointerCapture(event.pointerId); } catch (error) {}
    lever.classList.add('snap');
    if (commit && prog >= 0.92) {
      suppressClick = true;
      setKnob(1);
      fire();
    } else {
      suppressClick = commit && moved;
      prog = 0; setKnob(0);
    }
  };
  lever.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    fire();
  });
  lever.addEventListener('pointerup', event => release(true, event));
  lever.addEventListener('pointercancel', event => release(false, event));
}

function sparkleBurst(x, y, color, token, n = 14) {
  if (!isRouteTokenCurrent(token)) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('div');
    s.className = 'sparkle';
    s.style.background = color;
    s.style.left = x + 'px'; s.style.top = y + 'px';
    document.body.appendChild(s);
    const ang = Math.random() * Math.PI * 2, dist = 50 + Math.random() * 110;
    requestAnimationFrame(() => {
      if (!isRouteTokenCurrent(token)) { s.remove(); return; }
      s.style.transform = `translate(${Math.cos(ang) * dist}px, ${Math.sin(ang) * dist - 30}px) rotate(${Math.random() * 360}deg)`;
      s.style.opacity = '0';
    });
    setTimeout(() => s.remove(), 1000);
  }
}

function showCrankResult(r, token, animated) {
  if (!isRouteTokenCurrent(token)) return;
  const rare = r.item.rarity;
  const rcolor = { common: '#b8b8b8', uncommon: '#7ab55c', rare: '#6aa0c8', legendary: '#e0a030' }[rare];
  if (animated) {
    const flash = document.createElement('div');
    flash.className = 'flashwipe';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 550);
    if (rare === 'legendary' || rare === 'rare') {
      document.body.classList.add('megashake');
      setTimeout(() => document.body.classList.remove('megashake'), 800);
    }
  }
  SFX.reveal(rare);
  const isWearable = r.item.type === 'hat';
  const ov = showModal(`<div class="win ceremony gacha-card ${rare === 'legendary' ? 'legendary-glow' : ''}">
    <div class="muted">the capsule cracks open...</div>
    <div style="margin:12px auto;display:flex;justify-content:center">${spriteTag(r.item.sprite, 96)}</div>
    <div class="r-${rare}" style="font-family: var(--font-title); font-size: var(--type-title)">${esc(r.item.name)}</div>
    <div class="muted" style="text-transform:uppercase;font-family: var(--font-body); font-size: var(--type-body)">${rare} ${r.item.type}</div>
    <p style="margin-top:8px">${esc(r.item.desc)}</p>
    <div style="margin-top:14px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${isWearable || r.item.type === 'pack' || r.item.type === 'decor' ? `<button class="btn big" style="width:auto" onclick="G.closeOverlay(this.closest('.overlay'),()=>nav('ranch'))">TO THE MENAGERIE</button>` : ''}
      <button class="btn" onclick="G.closeOverlay(this.closest('.overlay'),render)">TAKE IT</button>
    </div>
  </div>`, { backdropClose: false });
  if (!animated) return;
  const rect = ov.querySelector('.gacha-card').getBoundingClientRect();
  sparkleBurst(rect.left + rect.width / 2, rect.top + 60, rcolor, token, rare === 'legendary' ? 30 : 14);
}

function clearCrankEffects() {
  const machine = document.getElementById('crank-m');
  if (machine) machine.classList.remove('crank-shake');
  document.body.classList.remove('megashake');
  document.querySelectorAll('.flashwipe, .sparkle').forEach(element => element.remove());
}

G.crank = async (useToken) => {
  if (crankBusy) return;
  crankBusy = true;
  const token = captureRouteToken();
  const profileToken = captureProfileToken();
  let r;
  try {
    r = await api('/gacha', { method: 'POST', body: { use_token: useToken } });
  } catch (e) {
    crankBusy = false;
    if (isRouteTokenCurrent(token)) render();
    return;
  }
  if (!reconcileMutationState({ character: r.character }, profileToken)) {
    crankBusy = false;
    return;
  }

  if (!isRouteTokenCurrent(token)) {
    await refreshState().catch(() => null);
    crankBusy = false;
    if (S.screen === 'crank') render();
    return;
  }

  if (prefersReducedMotion()) {
    try { await refreshState(); } catch (e) { crankBusy = false; return; }
    crankBusy = false;
    if (isRouteTokenCurrent(token)) showCrankResult(r, token, false);
    else if (S.screen === 'crank') render();
    return;
  }

  const m = document.getElementById('crank-m');
  if (!m) {
    crankBusy = false;
    if (S.screen === 'crank') render();
    return;
  }
  const routeWork = createRouteWork(token);
  crankWork = routeWork;
  let settled = false;
  const reconcile = async (showResult, animated) => {
    if (settled) return;
    settled = true;
    routeWork.cancel();
    if (crankWork === routeWork) crankWork = null;
    clearCrankEffects();
    try { await refreshState(); } catch (e) {}
    crankBusy = false;
    if (showResult && isRouteTokenCurrent(token)) showCrankResult(r, token, animated);
    else if (S.screen === 'crank') render();
  };
  routeWork.addCleanup(() => {
    if (settled) return;
    settled = true;
    if (crankWork === routeWork) crankWork = null;
    clearCrankEffects();
    refreshState().catch(() => null).finally(() => {
      crankBusy = false;
      if (S.screen === 'crank') render();
    });
  });
  routeWork.addCleanup(onReducedMotionRequested(() => {
    if (routeWork.active) reconcile(true, false);
  }));
  m.classList.add('crank-shake');
  SFX.crank();
  routeWork.timeout(() => {
    const cap = document.getElementById('crank-cap');
    if (cap) cap.classList.add('drop');
    SFX.coin();
  }, 900);
  routeWork.timeout(() => reconcile(true, true), 1900);
};

/* ================= SETTINGS ================= */

let settingsTab = 'game';
let counselScheduleDraft = null;
let counselSchedulePrograms = null;
let counselRoutineDraft = null;
let counselRoutineSaving = false;
let counselScheduleChooser = null;
const SETTINGS_TABS = Object.freeze([
  { id: 'game', label: 'GAME' },
  { id: 'apis', label: 'APIS' },
  { id: 'dev', label: 'DEV' },
]);

RESETS.push(() => {
  settingsTab = 'game';
  counselScheduleDraft = null;
  counselSchedulePrograms = null;
  counselRoutineDraft = null;
  counselRoutineSaving = false;
  counselScheduleChooser = null;
});

G.setSettingsTab = (id) => {
  if (!SETTINGS_TABS.some(tab => tab.id === id) || settingsTab === id) return;
  settingsTab = id;
  render();
  document.getElementById(`settings-tab-${id}`)?.focus({ preventScroll: true });
};

function copyCounselSchedule(schedule) {
  const days = S.state.counsel_schedule_options.days;
  return Object.fromEntries(days.map(day => [
    day,
    Array.isArray(schedule?.[day])
      ? schedule[day].map(slot => ({ ...slot }))
      : [],
  ]));
}

function counselScheduleConfig(modality) {
  return S.state.counsel_schedule_options.modalities
    .find(option => option.value === modality);
}

function counselScheduleRoutineOptions() {
  const builtIns = (counselSchedulePrograms?.programs || []).map(program => ({
    value: program.key,
    label: program.name,
  }));
  const custom = (counselSchedulePrograms?.routines || []).map(routine => ({
    value: `custom:${routine.id}`,
    label: routine.name,
  }));
  return [...builtIns, ...custom];
}

function ensureCounselScheduleDraft() {
  if (counselScheduleDraft === null) {
    counselScheduleDraft = copyCounselSchedule(
      S.state.settings.counsel_schedule,
    );
  }
  return counselScheduleDraft;
}

function counselScheduleSlotShape(slot) {
  if (slot.routine) return 'routine';
  if (slot.tier) return 'sized';
  return 'open';
}

function counselScheduleSlotLabel(slot) {
  if (slot.routine) {
    const routine = counselScheduleRoutineOptions()
      .find(option => option.value === slot.routine);
    return `${routine?.label || slot.routine}${slot.optional ? ' · optional' : ''}`;
  }
  if (!slot.modality) return `open${slot.optional ? ' · optional' : ''}`;
  const effort = slot.tier ? ` · ${slot.tier}` : '';
  const optional = slot.optional ? ' · optional' : '';
  return `${slot.modality}${effort}${optional}`;
}

function counselScheduleDisplayName(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const COUNSEL_SCHEDULE_SPRITES = Object.freeze({
  run: 'schedule_run',
  ride: 'schedule_ride',
  swim: 'schedule_swim',
  climb: 'schedule_climb',
  strength: 'schedule_strength',
  rest: 'schedule_rest',
});

const COUNSEL_SCHEDULE_TIER_MARKS = Object.freeze({
  easy: 'E',
  steady: 'S',
  quality: 'Q',
  long: 'L',
  technique: 'T',
  volume: 'V',
  'limit-session': 'L',
  circuit: 'C',
  strength: 'S',
});

function counselScheduleSlotMark(slot) {
  if (slot.routine) return 'R';
  if (slot.tier) return COUNSEL_SCHEDULE_TIER_MARKS[slot.tier] || slot.tier.charAt(0).toUpperCase();
  if (slot.modality === 'rest') return 'R';
  return '?';
}

function counselScheduleSlotSprite(slot) {
  if (slot.routine) return COUNSEL_SCHEDULE_SPRITES.strength;
  return COUNSEL_SCHEDULE_SPRITES[slot.modality] || null;
}

function counselScheduleColorModality(slot) {
  if (slot.routine) return 'strength';
  return slot.modality === 'rest' ? 'mobility' : slot.modality;
}

function counselScheduleCellHTML(day, row, slot, addable) {
  const dayName = counselScheduleDisplayName(day);
  if (!slot && addable) {
    return `<button type="button" class="btn small counsel-schedule-cell counsel-schedule-cell-empty"
      data-schedule-cell="${day}-${row}" data-schedule-slot-shape="empty"
      aria-label="${dayName} slot ${row + 1}: add a path"
      onclick="G.openCounselScheduleChooser('${day}',${row})">+</button>`;
  }
  if (!slot) {
    return `<span class="counsel-schedule-cell-gap" data-schedule-gap="${day}-${row}" aria-hidden="true"></span>`;
  }
  const shape = counselScheduleSlotShape(slot);
  const modality = counselScheduleColorModality(slot);
  const sprite = counselScheduleSlotSprite(slot);
  const glyph = sprite
    ? spriteTag(sprite, 24)
    : '<span class="counsel-schedule-any-path" data-schedule-any-path aria-hidden="true">◆</span>';
  const optional = slot.optional
    ? '<span class="counsel-schedule-optional-mark" data-schedule-optional-mark aria-hidden="true">O</span>'
    : '';
  return `<button type="button" class="btn small counsel-schedule-cell counsel-schedule-cell-filled"
    data-schedule-cell="${day}-${row}" data-schedule-slot-shape="${shape}" data-schedule-modality="${modality || ''}"
    aria-label="${dayName} slot ${row + 1}: ${esc(counselScheduleSlotLabel(slot))}"
    onclick="G.openCounselScheduleChooser('${day}',${row})">
      ${optional}${glyph}
      <span class="counsel-schedule-tier-mark" data-schedule-tier-mark aria-hidden="true">${counselScheduleSlotMark(slot)}</span>
    </button>`;
}

function counselScheduleEditorHTML() {
  const schedule = ensureCounselScheduleDraft();
  const config = S.state.counsel_schedule_options;
  const rowCount = Math.max(...config.days.map(day => schedule[day].length), 0) + 1;
  return `<fieldset id="counsel-schedule" class="counsel-schedule">
    <legend>Weekly template</legend>
    <div class="counsel-schedule-grid" aria-label="Weekly counsel plan">
      <div class="counsel-schedule-grid-head">
        <span aria-hidden="true"></span>
        ${config.days.map(day => `<span class="counsel-schedule-day-heading" data-schedule-day-heading>${day.slice(0, 3).toUpperCase()}</span>`).join('')}
      </div>
      ${Array.from({ length: rowCount }, (_, row) => `
        <div class="counsel-schedule-grid-row" data-schedule-row="${row}">
          <span class="counsel-schedule-row-heading" aria-label="Slot ${row + 1}">${row + 1}</span>
          ${config.days.map(day => counselScheduleCellHTML(
            day,
            row,
            schedule[day][row],
            row === schedule[day].length,
          )).join('')}
        </div>
      `).join('')}
    </div>
    <button type="button" class="btn small counsel-schedule-save" onclick="G.saveCounselSchedule()">SAVE WEEKLY PLAN</button>
  </fieldset>`;
}

function refreshCounselScheduleEditor(day, index) {
  const editor = document.getElementById('counsel-schedule');
  if (!editor) return;
  editor.outerHTML = counselScheduleEditorHTML();
  const nextEditor = document.getElementById('counsel-schedule');
  hydrateSprites(nextEditor);
  requestAnimationFrame(() => {
    nextEditor?.querySelector(
      `[data-schedule-cell="${day}-${index}"]`,
    )?.focus({ preventScroll: true });
  });
}

function counselScheduleWriteSlot(day, index, next) {
  const schedule = ensureCounselScheduleDraft();
  const slots = schedule[day];
  if (!slots) return null;
  const target = Math.min(index, slots.length);
  if (target === slots.length) {
    slots.push(next);
  } else {
    slots[target] = next;
  }
  return target;
}

function counselScheduleChooserCategory(slot) {
  if (slot?.routine || slot?.modality === 'strength') return 'strength';
  if (slot?.modality === 'rest') return 'recovery';
  if (slot?.modality) return 'endurance';
  return null;
}

function counselScheduleChoiceButton(label, handler, active = false) {
  return `<button type="button" class="btn small counsel-schedule-choice ${active ? 'active' : ''}"
    data-schedule-choice aria-pressed="${active}" onclick="${handler}">${esc(label)}</button>`;
}

function counselScheduleChooserStepHTML(state, slot) {
  const category = state.category || counselScheduleChooserCategory(slot);
  if (state.step === 'modality') {
    const modalities = ['run', 'ride', 'swim', 'climb'];
    return `<span class="counsel-schedule-label">Choose the endurance path</span>
      <div class="counsel-schedule-chooser-choices">
        ${modalities.map(modality => counselScheduleChoiceButton(
          counselScheduleDisplayName(modality),
          `G.chooseCounselScheduleModality('${modality}')`,
          slot?.modality === modality,
        )).join('')}
      </div>`;
  }
  if (state.step === 'effort') {
    const tiers = counselScheduleConfig(state.modality)?.tiers || [];
    return `<span class="counsel-schedule-label">Choose the effort</span>
      <div class="counsel-schedule-chooser-choices">
        ${tiers.map(tier => counselScheduleChoiceButton(
          counselScheduleDisplayName(tier),
          `G.chooseCounselScheduleTier('${tier}')`,
          slot?.modality === state.modality && slot?.tier === tier,
        )).join('')}
        ${counselScheduleChoiceButton(
          'Let the counsel choose',
          'G.chooseCounselScheduleTier(null)',
          slot?.modality === state.modality && !slot?.tier && !slot?.routine,
        )}
      </div>`;
  }
  if (state.step === 'strength') {
    const routines = counselScheduleRoutineOptions();
    return `<span class="counsel-schedule-label">Choose the strength work</span>
      <div class="counsel-schedule-chooser-choices">
        ${routines.map(routine => counselScheduleChoiceButton(
          routine.label,
          `G.chooseCounselScheduleRoutine('${routine.value}')`,
          slot?.routine === routine.value,
        )).join('')}
        ${counselScheduleChoiceButton(
          'Create a new routine',
          'G.forgeCounselScheduleRoutine()',
        )}
        ${counselScheduleChoiceButton(
          'Let the counsel choose',
          'G.chooseCounselScheduleRoutine(null)',
          slot?.modality === 'strength' && !slot?.tier && !slot?.routine,
        )}
      </div>`;
  }
  if (state.step === 'recovery') {
    return `<span class="counsel-schedule-label">Choose the recovery path</span>
      <div class="counsel-schedule-chooser-choices">
        ${counselScheduleChoiceButton(
          'Rest',
          'G.chooseCounselScheduleRest()',
          slot?.modality === 'rest',
        )}
      </div>`;
  }
  return `<span class="counsel-schedule-label">Choose a path</span>
    <div class="counsel-schedule-chooser-choices">
      ${counselScheduleChoiceButton('Endurance', "G.chooseCounselScheduleCategory('endurance')", category === 'endurance')}
      ${counselScheduleChoiceButton('Strength', "G.chooseCounselScheduleCategory('strength')", category === 'strength')}
      ${counselScheduleChoiceButton('Recovery', "G.chooseCounselScheduleCategory('recovery')", category === 'recovery')}
    </div>`;
}

function paintCounselScheduleChooser(focusSelector = '[data-schedule-choice]') {
  const state = counselScheduleChooser;
  if (!state?.overlay?.isConnected) return;
  const slot = ensureCounselScheduleDraft()[state.day]?.[state.index];
  const win = state.overlay.querySelector('.counsel-schedule-chooser');
  if (!win) return;
  const current = slot
    ? `<div class="counsel-schedule-current" data-schedule-current>Current: ${esc(counselScheduleSlotLabel(slot))}</div>`
    : '<div class="counsel-schedule-current" data-schedule-current>No path written yet.</div>';
  const back = state.step === 'root'
    ? ''
    : '<button type="button" class="btn small" onclick="G.backCounselScheduleChooser()">BACK</button>';
  const filledActions = slot
    ? `<button type="button" class="btn small toggle ${slot.optional ? 'green' : ''}"
          data-schedule-optional
          aria-pressed="${slot.optional}" aria-label="Optional: ${slot.optional ? 'on' : 'off'}"
          onclick="G.toggleCounselScheduleChooserOptional()">OPTIONAL: ${slot.optional ? 'ON' : 'OFF'}</button>
       <button type="button" class="btn small danger" aria-label="Remove slot"
          onclick="G.removeCounselScheduleChooserSlot()">REMOVE</button>`
    : '';
  win.innerHTML = `
    <span class="win-title">${state.day.slice(0, 3).toUpperCase()} · SLOT ${state.index + 1}</span>
    ${current}
    ${counselScheduleChooserStepHTML(state, slot)}
    <div class="counsel-schedule-chooser-actions">${back}${filledActions}</div>
    <button type="button" class="lens-box-close"
      aria-label="Close chooser" onclick="G.closeCounselScheduleChooser()">&#10005;</button>`;
  hydrateSprites(win);
  requestAnimationFrame(() => {
    win.querySelector(focusSelector)?.focus({ preventScroll: true });
  });
}

G.openCounselScheduleChooser = (day, index) => {
  const slots = ensureCounselScheduleDraft()[day];
  if (!slots) return;
  const target = Math.min(index, slots.length);
  // Slot-editor invariant: + creates the open draft before first paint, so
  // optional and removal controls always describe state that already exists.
  if (target === slots.length) {
    counselScheduleWriteSlot(day, target, { optional: false });
  }
  const overlay = showModal(
    '<div class="win counsel-surface counsel-schedule-chooser"></div>',
    { backdropClose: false },
  );
  counselScheduleChooser = {
    day,
    index: target,
    step: 'root',
    category: counselScheduleChooserCategory(slots[target]),
    modality: slots[target]?.modality || null,
    overlay,
  };
  overlay.addEventListener('click', event => {
    if (event.target === overlay) G.closeCounselScheduleChooser();
  });
  overlay.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    G.closeCounselScheduleChooser();
  });
  paintCounselScheduleChooser();
};

G.closeCounselScheduleChooser = () => {
  const state = counselScheduleChooser;
  if (!state) return;
  counselScheduleChooser = null;
  G.closeOverlay(state.overlay, () => {
    refreshCounselScheduleEditor(state.day, state.index);
  });
};

G.chooseCounselScheduleCategory = (category) => {
  if (!counselScheduleChooser || !['endurance', 'strength', 'recovery'].includes(category)) return;
  counselScheduleChooser.category = category;
  counselScheduleChooser.step = category === 'endurance' ? 'modality' : category;
  paintCounselScheduleChooser();
};

G.chooseCounselScheduleModality = (modality) => {
  if (!counselScheduleChooser || !['run', 'ride', 'swim', 'climb'].includes(modality)) return;
  counselScheduleChooser.modality = modality;
  counselScheduleChooser.step = 'effort';
  paintCounselScheduleChooser();
};

function finishCounselScheduleChooser(slot) {
  const state = counselScheduleChooser;
  if (!state) return;
  state.index = counselScheduleWriteSlot(state.day, state.index, slot);
  counselScheduleChooser = null;
  G.closeOverlay(state.overlay, () => {
    refreshCounselScheduleEditor(state.day, state.index);
  });
}

G.chooseCounselScheduleTier = (tier) => {
  const state = counselScheduleChooser;
  if (!state?.modality) return;
  const tiers = counselScheduleConfig(state.modality)?.tiers || [];
  if (tier !== null && !tiers.includes(tier)) return;
  const current = ensureCounselScheduleDraft()[state.day]?.[state.index];
  const optional = current?.optional || false;
  finishCounselScheduleChooser(tier
    ? { modality: state.modality, tier, optional }
    : { modality: state.modality, optional });
};

G.chooseCounselScheduleRoutine = (routine) => {
  const state = counselScheduleChooser;
  if (!state) return;
  if (routine !== null && !counselScheduleRoutineOptions().some(option => option.value === routine)) return;
  const current = ensureCounselScheduleDraft()[state.day]?.[state.index];
  const optional = current?.optional || false;
  finishCounselScheduleChooser(routine
    ? { routine, optional }
    : { modality: 'strength', optional });
};

G.chooseCounselScheduleRest = () => {
  const state = counselScheduleChooser;
  if (!state) return;
  const current = ensureCounselScheduleDraft()[state.day]?.[state.index];
  finishCounselScheduleChooser({
    modality: 'rest',
    optional: current?.optional || false,
  });
};

G.backCounselScheduleChooser = () => {
  const state = counselScheduleChooser;
  if (!state || state.step === 'root') return;
  state.step = state.step === 'effort' ? 'modality' : 'root';
  paintCounselScheduleChooser();
};

G.toggleCounselScheduleChooserOptional = () => {
  const state = counselScheduleChooser;
  const slot = state ? ensureCounselScheduleDraft()[state.day]?.[state.index] : null;
  if (!slot) return;
  slot.optional = !slot.optional;
  paintCounselScheduleChooser('[data-schedule-optional]');
};

G.removeCounselScheduleChooserSlot = () => {
  const state = counselScheduleChooser;
  const slots = state ? ensureCounselScheduleDraft()[state.day] : null;
  if (!slots?.[state.index]) return;
  slots.splice(state.index, 1);
  counselScheduleChooser = null;
  G.closeOverlay(state.overlay, () => {
    refreshCounselScheduleEditor(
      state.day,
      Math.min(state.index, slots.length),
    );
  });
};

G.forgeCounselScheduleRoutine = () => {
  const state = counselScheduleChooser;
  if (!state) return;
  const current = ensureCounselScheduleDraft()[state.day]?.[state.index];
  const target = {
    day: state.day,
    index: state.index,
    optional: current?.optional || false,
  };
  counselScheduleChooser = null;
  G.closeOverlay(state.overlay, () => {
    G.openCounselRoutineBuilder(
      target.day,
      target.index,
      target.optional,
    );
  });
};

function paintCounselRoutineDraft() {
  const list = document.getElementById('schedule-routine-list');
  if (!list || !counselRoutineDraft) return;
  list.innerHTML = counselRoutineDraft.exercises.map((exercise, index) => `
    <div class="counsel-schedule-routine-row">
      <span><b>${esc(exercise.exercise)}</b> ${exercise.sets}&times;${exercise.reps}</span>
      <button type="button" class="btn small danger" aria-label="Remove ${esc(exercise.exercise)}" onclick="G.removeCounselRoutineExercise(${index})">REMOVE</button>
    </div>
  `).join('') || '<div class="counsel-help">No movements written yet.</div>';
}

G.openCounselRoutineBuilder = (day, index, optional = false) => {
  counselRoutineDraft = { day, index, optional, exercises: [] };
  counselRoutineSaving = false;
  const exerciseOptions = S.exercises.map(exercise => (
    `<option value="${esc(exercise.name)}">${esc(exercise.name)}</option>`
  )).join('');
  const overlay = showModal(`<div class="win counsel-surface counsel-schedule-routine-builder">
    <span class="win-title">Forge a routine</span>
    <div class="counsel-help">Write the work once; this weekly slot will call for it by name.</div>
    <div class="formrow"><label for="schedule-routine-name">routine name</label><input type="text" id="schedule-routine-name" placeholder="e.g. Rings and sliders"></div>
    <div class="formrow"><label for="schedule-routine-exercise">movement</label><select id="schedule-routine-exercise">${exerciseOptions}</select></div>
    <div class="counsel-schedule-routine-measure">
      <label class="counsel-label">sets <input type="number" id="schedule-routine-sets" min="1" max="12" value="3"></label>
      <span class="muted">&times;</span>
      <label class="counsel-label">reps <input type="number" id="schedule-routine-reps" min="1" max="50" value="8"></label>
      <button type="button" class="btn small" onclick="G.addCounselRoutineExercise()">ADD</button>
    </div>
    <div id="schedule-routine-list" class="counsel-schedule-routine-list"></div>
    <div class="confirm-actions">
      <button type="button" class="btn" id="schedule-routine-save" onclick="G.saveCounselRoutine()">FORGE ROUTINE</button>
      <button type="button" class="btn small" onclick="G.closeOverlay(this.closest('.overlay'))">NEVER MIND</button>
    </div>
  </div>`);
  paintCounselRoutineDraft();
  overlay.querySelector('#schedule-routine-name')?.focus();
};

G.addCounselRoutineExercise = () => {
  if (!counselRoutineDraft) return;
  const exercise = document.getElementById('schedule-routine-exercise')?.value;
  const sets = Number.parseInt(document.getElementById('schedule-routine-sets')?.value, 10);
  const reps = Number.parseInt(document.getElementById('schedule-routine-reps')?.value, 10);
  if (!exercise) return;
  counselRoutineDraft.exercises.push({
    exercise,
    sets: Number.isFinite(sets) ? sets : 3,
    reps: Number.isFinite(reps) ? reps : 8,
  });
  SFX.click();
  paintCounselRoutineDraft();
};

G.removeCounselRoutineExercise = (index) => {
  if (!counselRoutineDraft?.exercises[index]) return;
  counselRoutineDraft.exercises.splice(index, 1);
  paintCounselRoutineDraft();
};

G.saveCounselRoutine = async () => {
  if (!counselRoutineDraft || counselRoutineSaving) return;
  const name = document.getElementById('schedule-routine-name')?.value.trim();
  if (!name || !counselRoutineDraft.exercises.length) {
    toast(name ? 'Write at least one movement.' : 'Name the routine.', true);
    return;
  }
  // Mutation invariant: one player activation creates at most one custom routine.
  counselRoutineSaving = true;
  const saveButton = document.getElementById('schedule-routine-save');
  const overlay = saveButton?.closest('.overlay');
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.setAttribute('aria-busy', 'true');
  }
  overlay?.setAttribute('aria-busy', 'true');
  const target = { day: counselRoutineDraft.day, index: counselRoutineDraft.index };
  try {
    const response = await api('/routines', {
      method: 'POST',
      body: {
        name,
        giver: 'strength',
        exercises: counselRoutineDraft.exercises,
      },
    });
    counselSchedulePrograms = await api('/programs');
    counselScheduleWriteSlot(target.day, target.index, {
      routine: `custom:${response.routine.id}`,
      optional: counselRoutineDraft.optional,
    });
  } finally {
    counselRoutineSaving = false;
    if (saveButton?.isConnected) {
      saveButton.disabled = false;
      saveButton.removeAttribute('aria-busy');
    }
    overlay?.removeAttribute('aria-busy');
  }
  counselRoutineDraft = null;
  SFX.fanfare();
  toast('Routine forged into the weekly plan.');
  G.closeOverlay(overlay, () => {
    refreshCounselScheduleEditor(
      target.day,
      target.index,
    );
  });
};

SCREENS.settings = async function () {
  const token = captureRouteToken();
  if (counselSchedulePrograms === null) {
    const programsPayload = await api('/programs');
    if (!isRouteTokenCurrent(token)) return;
    counselSchedulePrograms = programsPayload;
  }
  const s = S.state.settings;
  const c = S.state.character;
  const amb = S.state.ambition_levels;
  const charter = s.counsel_charter || { primary: '', secondary: [] };
  const secondary = charter.secondary || [];
  const selfDirected = s.counsel_mode === 'self';
  const focusDisabled = selfDirected || s.counsel_mode === 'scheduled';
  const siegeTz = S.state.siege_timezone || 'UTC';
  const siegeTzOptions = [
    { value: 'UTC', label: 'UTC' },
    { value: 'America/New_York', label: 'America/New_York' },
    { value: 'America/Chicago', label: 'America/Chicago' },
    { value: 'America/Denver', label: 'America/Denver' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles' },
    { value: 'Europe/London', label: 'Europe/London' },
    { value: 'Europe/Berlin', label: 'Europe/Berlin' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  ];
  if (siegeTz && !siegeTzOptions.some(o => o.value === siegeTz)) {
    siegeTzOptions.unshift({ value: siegeTz, label: siegeTz });
  }
  const weightOpts = [
    { value: 'kg', label: 'kg' },
    { value: 'lb', label: 'lb' },
  ];
  const unitOpts = [
    { value: 'km', label: 'km' },
    { value: 'mi', label: 'mi' },
  ];
  const loopOpts = [
    { value: 'considered', label: 'Considered' },
    { value: 'self', label: 'Choose-your-own' },
    { value: 'scheduled', label: 'Scheduled' },
  ];
  const focusOpts = [
    { value: 'run', label: 'Run' },
    { value: 'ride', label: 'Ride' },
    { value: 'swim', label: 'Swim' },
    { value: 'climb', label: 'Climb' },
    { value: 'strength', label: 'Strength' },
  ];
  const focusHint = s.counsel_mode === 'scheduled'
    ? 'Your schedule is your focus.'
    : selfDirected
      ? "You're choosing freely; focus guides the counsel."
      : 'Optional. Focus only guides the daily pointer; every giver remains available.';
  const settingsPanels = {
    game: `
    <section id="settings-panel-game" data-settings-section="game" role="tabpanel" aria-labelledby="settings-tab-game">
    <div class="win counsel-surface settings-surface"><span class="win-title" id="settings-game">Game</span>
      <div class="formrow"><label for="set-name">name</label>
        <div style="display:flex;gap:6px">
          <input type="text" id="set-name" value="${esc(c.name)}" style="flex:1" onkeydown="if(event.key==='Enter')G.saveName()">
          <button class="btn small" style="min-width:0" onclick="G.saveName()">SAVE NAME</button>
        </div>
      </div>
      <div class="muted" style="font-family: var(--font-body); font-size: var(--type-body);margin:6px 0">to change your look, tap your portrait at the top of any page</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">
        <button class="btn small" style="min-width:0" onclick="G.setPinPrompt()">SET / CHANGE PIN</button>
        <button class="btn small" style="min-width:0" onclick="G.switchProfile()">SWITCH ADVENTURER</button>
      </div>
      <hr class="rule">
      <div class="formrow">
        <button type="button" class="btn wide btn-fit toggle ${SFX.muted ? '' : 'green'}" data-sound-btn data-settings-sound onclick="G.mute()">${SFX.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
      </div>
      <div class="formrow">
        <span class="counsel-label">road unit</span>
        ${pixelSelect('set-units', unitOpts, s.units, 'road unit', 'saveUnits')}
      </div>
      <div class="formrow">
        <span class="counsel-label">weight unit</span>
        ${pixelSelect('set-wu', weightOpts, s.weight_unit, 'weight unit', 'saveWeightUnit')}
      </div>
      <div class="formrow">
        <span class="counsel-label">siege bell timezone</span>
        ${pixelSelect('set-siege-tz', siegeTzOptions, siegeTz, 'siege timezone', 'saveSiegeTimezone')}
      </div>
      <div class="formrow"><span class="counsel-label">timezone</span><div>${esc(s.timezone || 'Automatic from this device')}</div></div>
      <hr class="rule">
      <span class="counsel-label">ambition</span>
      <div class="muted" style="margin-bottom:8px">how hard the quest-givers push you</div>
      ${amb.map((a, i) => `<button class="btn" style="margin:3px;${s.ambition === i ? 'background:var(--gold);color:var(--bg)' : ''}"
        onclick="G.setAmbition(${i})">
        ${esc(a.name)}</button>`).join('')}
      <div class="muted" style="margin-top:6px">${esc(amb[s.ambition].desc)}</div>
      <hr class="rule">
      <div class="formrow">
        <span class="counsel-label">game loop style</span>
        ${pixelSelect('set-counsel-mode', loopOpts, s.counsel_mode, 'game loop style', 'saveCounselMode')}
      </div>
      ${counselScheduleEditorHTML()}
      <button type="button" class="btn small toggle ${s.counsel_nudge_enabled ? 'green' : ''}" aria-pressed="${s.counsel_nudge_enabled ? 'true' : 'false'}" onclick="G.toggleCounselNudge()">DAILY POINTER: ${s.counsel_nudge_enabled ? 'ON' : 'OFF'}</button>
      <fieldset id="counsel-focus" class="counsel-focus counsel-block" aria-describedby="counsel-focus-hint" ${focusDisabled ? 'disabled' : ''}>
        <legend>Focus</legend>
        <span class="counsel-label">Primary focus</span>
        <div class="formrow">
          ${pixelSelect('set-counsel-primary', focusOpts, charter.primary, 'Primary focus (optional)', 'setCounselPrimaryDraft', 'Primary focus (optional)', focusDisabled)}
        </div>
        <span class="counsel-label">Secondary focuses (optional)</span>
        <div class="counsel-focus-choices" aria-label="Secondary focuses (optional)">
          ${focusOpts.map(focus => `<button type="button" class="btn toggle ${secondary.includes(focus.value) && focus.value !== charter.primary ? 'active' : ''}" data-counsel-secondary="${focus.value}" aria-pressed="${secondary.includes(focus.value) && focus.value !== charter.primary ? 'true' : 'false'}" onclick="G.toggleCounselSecondary('${focus.value}')" ${focus.value === charter.primary ? 'hidden' : ''} ${focusDisabled ? 'disabled' : ''}>${focus.label}</button>`).join('')}
        </div>
        <button type="button" class="btn small" style="margin-top:8px" onclick="G.saveCounselCharter()" ${focusDisabled ? 'disabled' : ''}>SAVE FOCUS</button>
        <div id="counsel-focus-hint" class="counsel-help">${focusHint}</div>
      </fieldset>
    </div>
    </section>`,
    apis: `
    <section id="settings-panel-apis" data-settings-section="apis" role="tabpanel" aria-labelledby="settings-tab-apis">
    <div class="win counsel-surface settings-surface"><span class="win-title" id="settings-apis">APIs</span>
      <div class="sync-status-panel">${syncStatusHTML(S.state)}</div>
      <div class="muted settings-helper">
        Runs, climbs, lifts and wellness sync from intervals.icu — which itself syncs from Garmin,
        Strava, Coros, etc. First sync fetches ~400 days; after that the ravens fly every 15 minutes
        and completed workouts turn in quests automatically.
        Athlete ID and API key: intervals.icu &rarr; <span class="counsel-path">Settings &rarr; Developer.</span></div>
      <div class="formrow"><label for="set-aid">athlete id (e.g. i12345)</label><input type="text" id="set-aid" value="${esc(s.intervals_athlete_id)}"></div>
      <div class="formrow"><label for="set-key">api key ${s.intervals_api_key ? '(saved — leave blank to keep)' : ''}</label><input type="password" id="set-key" placeholder="${s.intervals_api_key ? '••••••••' : ''}"></div>
      <button class="btn wide btn-fit" onclick="G.saveRavens()">SAVE &amp; SEND RAVENS</button>
    </div>
    </section>`,
    dev: `
    <section id="settings-panel-dev" data-settings-section="dev" role="tabpanel" aria-labelledby="settings-tab-dev">
    <div class="win counsel-surface settings-surface"><span class="win-title" id="settings-dev">Dev</span>
      <div class="muted settings-helper">for testing features without living an entire second life</div>
      <button class="btn ${s.dev_mode ? 'danger' : ''}" onclick="G.toggleDev(${s.dev_mode ? 'false' : 'true'})">
        ${s.dev_mode ? 'DISABLE DEV MODE' : 'ENABLE DEV MODE'}</button>
      ${s.dev_mode ? '<button class="btn wide btn-fit" style="margin-top:10px" onclick="G.openDevConsole()">OPEN DEV CONSOLE</button>' : ''}
    </div>
    </section>`,
  };
  const tabs = `<nav class="settings-tabs" aria-label="Settings sections">
    <div class="hall-nav-buttons" role="tablist">
      ${SETTINGS_TABS.map(tab => `<button type="button" id="settings-tab-${tab.id}" class="btn small ${settingsTab === tab.id ? 'active' : ''}" role="tab" aria-selected="${settingsTab === tab.id ? 'true' : 'false'}" aria-controls="settings-panel-${tab.id}" onclick="G.setSettingsTab('${tab.id}')">${tab.label}</button>`).join('')}
    </div>
  </nav>`;
  $app().innerHTML = shell(`${tabs}${settingsPanels[settingsTab]}`);
};

G.saveName = async () => {
  const token = captureRouteToken();
  const name = document.getElementById('set-name').value.trim();
  if (!name) { toast('An adventurer needs a name.', true); return; }
  await api('/settings', { method: 'POST', body: { name } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  SFX.accept();
  toast('Name saved.');
  render();
};

G.setPinPrompt = () => {
  showModal(`<div class="win center" style="max-width:320px">
    <span class="win-title">Set / Change PIN</span>
    <div class="muted" style="font-family: var(--font-body); font-size: var(--type-body);margin-bottom:8px">4 digits — keeps this adventurer's save locked to whoever knows it.</div>
    <input type="password" inputmode="numeric" maxlength="4" id="np-setpin" class="pin-input"
      placeholder="&#8226;&#8226;&#8226;&#8226;" onkeydown="if(event.key==='Enter')G.submitSetPin()">
    <div style="margin-top:10px;display:flex;gap:8px;justify-content:center">
      <button class="btn green" onclick="G.submitSetPin()">SAVE PIN</button>
      <button class="btn small" style="min-width:0" onclick="G.closeOverlay(this.closest('.overlay'))">cancel</button>
    </div>
  </div>`);
  document.getElementById('np-setpin').focus();
};

G.submitSetPin = async () => {
  const token = captureRouteToken();
  const pin = document.getElementById('np-setpin').value;
  try {
    await api('/profiles/pin', { method: 'POST', body: { pin } });
  } catch (e) { return; }
  if (!isRouteTokenCurrent(token)) return;
  G.closeOverlays(() => {
    SFX.accept();
    toast('PIN set. The roster keeper nods.');
  });
};

G.toggleDev = async (on) => {
  const token = captureRouteToken();
  await api('/settings', { method: 'POST', body: { dev_mode: on } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  toast(on ? 'Dev mode on. Reality is now negotiable.' : 'Dev mode off.');
  render();
};

G.dev = async (action) => {
  const token = captureRouteToken();
  await applyDevAction(action);
  if (!isRouteTokenCurrent(token)) return;
  toast('Done: ' + action);
  render();
};

G.setAmbition = async (i) => {
  const token = captureRouteToken();
  await api('/settings', { method: 'POST', body: { ambition: i } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  toast('Ambition set: ' + S.state.ambition_levels[i].name);
  render();
};

G.saveUnits = async (value) => {
  try {
    await api('/settings', { method: 'POST', body: { units: value } });
    if (S.state?.settings) S.state.settings.units = value;
    SFX.accept();
    toast('Road unit set.');
  } catch (e) { /* api already toast */ }
};

G.saveCounselMode = async (value) => {
  const token = captureRouteToken();
  await api('/settings', { method: 'POST', body: { counsel_mode: value } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  SFX.accept();
  toast({
    considered: 'Considered path chosen.',
    self: 'Choose-your-own path chosen.',
    scheduled: 'Weekly plan takes the reins.',
  }[value]);
  render();
};

G.saveCounselSchedule = async () => {
  const token = captureRouteToken();
  const counsel_schedule = copyCounselSchedule(
    ensureCounselScheduleDraft(),
  );
  await api('/settings', { method: 'POST', body: { counsel_schedule } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  counselScheduleDraft = copyCounselSchedule(
    S.state.settings.counsel_schedule,
  );
  SFX.accept();
  toast('Weekly counsel plan saved.');
  render();
};

G.toggleCounselNudge = async () => {
  const token = captureRouteToken();
  const enabled = !S.state.settings.counsel_nudge_enabled;
  await api('/settings', { method: 'POST', body: { counsel_nudge_enabled: enabled } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  SFX.accept();
  toast(enabled ? 'Daily pointer enabled.' : 'Daily pointer silenced.');
  render();
};

G.toggleCounselSecondary = (focus) => {
  const button = document.querySelector(`[data-counsel-secondary="${focus}"]`);
  const selected = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', String(!selected));
  button.classList.toggle('active', !selected);
};

G.setCounselPrimaryDraft = (focus) => {
  document.querySelectorAll('[data-counsel-secondary]').forEach(button => {
    const isPrimary = button.dataset.counselSecondary === focus;
    button.hidden = isPrimary;
    if (isPrimary) {
      button.setAttribute('aria-pressed', 'false');
      button.classList.remove('active');
    }
  });
};

G.saveCounselCharter = async () => {
  const token = captureRouteToken();
  const primary = document.getElementById('set-counsel-primary').value;
  const secondary = Array.from(document.querySelectorAll('[data-counsel-secondary]'))
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .map(button => button.dataset.counselSecondary);
  if (!primary && secondary.length) {
    toast('Choose a primary focus before naming a secondary.', true);
    return;
  }
  if (secondary.includes(primary)) {
    toast('A primary focus cannot also be secondary.', true);
    return;
  }
  const counsel_charter = primary ? { primary, secondary } : null;
  await api('/settings', { method: 'POST', body: { counsel_charter } });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  SFX.accept();
  toast(primary ? 'Focus charter saved.' : 'Focus charter cleared.');
  render();
};

G.saveRavens = async () => {
  const token = captureRouteToken();
  const body = {
    intervals_athlete_id: document.getElementById('set-aid').value,
  };
  const key = document.getElementById('set-key').value;
  if (key) body.intervals_api_key = key;
  await api('/settings', { method: 'POST', body });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  toast('Scrolls updated.');
  await G.syncNow();
  if (!isRouteTokenCurrent(token)) return;
  render();
};

G.saveWeightUnit = async (value) => {
  try {
    await api('/settings', { method: 'POST', body: { weight_unit: value } });
    if (S.state?.settings) S.state.settings.weight_unit = value;
    SFX.accept();
    toast('Weight unit set.');
  } catch (e) { /* api already toast */ }
};

G.saveSiegeTimezone = async (value) => {
  const token = captureRouteToken();
  const timezone = value || 'UTC';
  // The bell is realm-shared and the picker auto-saves; re-picking the
  // current value is a no-op, and an actual change gets an in-world
  // confirm so a browsing thumb can't re-forge everyone's siege week.
  if (timezone === (S.state.siege_timezone || 'UTC')) return;
  const ring = await confirmModal(
    'The Siege Bell rings for every adventurer in the realm, and re-hanging it mid-siege can re-forge the week. Ring it anyway?',
    { title: 'The Siege Bell', okLabel: 'RING IT', danger: true });
  if (!isRouteTokenCurrent(token)) return;
  if (!ring) {
    if (S.screen === 'settings') render();   // snap the picker label back
    return;
  }
  try {
    await api('/settings', { method: 'POST', body: { siege_timezone: timezone } });
    await refreshState();
    if (!isRouteTokenCurrent(token)) return;
    SFX.accept();
    toast('The siege bell is set.');
    if (S.screen === 'settings') render();
  } catch (e) { /* api already toast */ }
};

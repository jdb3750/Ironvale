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
      <div class="pixel-title" style="font-size: var(--type-title);margin-bottom:8px">THE CRANKWERK</div>
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
const SETTINGS_TABS = Object.freeze([
  { id: 'game', label: 'GAME' },
  { id: 'apis', label: 'APIS' },
  { id: 'dev', label: 'DEV' },
]);

RESETS.push(() => {
  settingsTab = 'game';
});

G.setSettingsTab = (id) => {
  if (!SETTINGS_TABS.some(tab => tab.id === id) || settingsTab === id) return;
  settingsTab = id;
  render();
  document.getElementById(`settings-tab-${id}`)?.focus({ preventScroll: true });
};

SCREENS.settings = function () {
  const s = S.state.settings;
  const c = S.state.character;
  const amb = S.state.ambition_levels;
  const charter = s.counsel_charter || { primary: '', secondary: [] };
  const secondary = charter.secondary || [];
  const selfDirected = s.counsel_mode === 'self';
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
  ];
  const focusOpts = [
    { value: 'run', label: 'Run' },
    { value: 'ride', label: 'Ride' },
    { value: 'swim', label: 'Swim' },
    { value: 'climb', label: 'Climb' },
    { value: 'strength', label: 'Strength' },
  ];
  const focusHint = selfDirected
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
      <button type="button" class="btn small toggle ${s.counsel_nudge_enabled ? 'green' : ''}" aria-pressed="${s.counsel_nudge_enabled ? 'true' : 'false'}" onclick="G.toggleCounselNudge()">DAILY POINTER: ${s.counsel_nudge_enabled ? 'ON' : 'OFF'}</button>
      <fieldset id="counsel-focus" class="counsel-focus counsel-block" aria-describedby="counsel-focus-hint" ${selfDirected ? 'disabled' : ''}>
        <legend>Focus</legend>
        <span class="counsel-label">Primary focus</span>
        <div class="formrow">
          ${pixelSelect('set-counsel-primary', focusOpts, charter.primary, 'Primary focus (optional)', 'setCounselPrimaryDraft', 'Primary focus (optional)', selfDirected)}
        </div>
        <span class="counsel-label">Secondary focuses (optional)</span>
        <div class="counsel-focus-choices" aria-label="Secondary focuses (optional)">
          ${focusOpts.map(focus => `<button type="button" class="btn toggle ${secondary.includes(focus.value) && focus.value !== charter.primary ? 'active' : ''}" data-counsel-secondary="${focus.value}" aria-pressed="${secondary.includes(focus.value) && focus.value !== charter.primary ? 'true' : 'false'}" onclick="G.toggleCounselSecondary('${focus.value}')" ${focus.value === charter.primary ? 'hidden' : ''} ${selfDirected ? 'disabled' : ''}>${focus.label}</button>`).join('')}
        </div>
        <button type="button" class="btn small" style="margin-top:8px" onclick="G.saveCounselCharter()" ${selfDirected ? 'disabled' : ''}>SAVE FOCUS</button>
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
  toast(value === 'considered' ? 'Considered path chosen.' : 'Choose-your-own path chosen.');
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

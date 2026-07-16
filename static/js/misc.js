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
      <div class="pixel-title" style="font-size:20px;margin-bottom:8px">THE CRANKWERK</div>
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
      <div class="muted" style="margin-top:10px;font-size:17px">
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
    <div class="r-${rare}" style="font-size:30px">${esc(r.item.name)}</div>
    <div class="muted" style="text-transform:uppercase;font-size:16px">${rare} ${r.item.type}</div>
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

SCREENS.settings = function () {
  const s = S.state.settings;
  const c = S.state.character;
  const amb = S.state.ambition_levels;
  $app().innerHTML = shell(`
    <section aria-labelledby="settings-common">
    <div class="win"><span class="win-title" id="settings-common">At Hand</span>
      <div class="formrow"><span class="muted" style="display:block;text-transform:uppercase;letter-spacing:1px">sound</span>
        <button type="button" class="btn wide" data-sound-btn onclick="G.mute()">${SFX.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
      </div>
      <hr class="rule">
      <div class="formrow"><span class="muted" style="display:block;text-transform:uppercase;letter-spacing:1px">ravens</span>
        <button type="button" class="btn wide" onclick="G.syncNow()">SEND RAVENS</button>
        <div class="muted" style="font-size:15px;margin-top:4px">sync new activities from intervals.icu</div>
      </div>
      <hr class="rule">
      <div class="formrow"><span class="muted" style="display:block;text-transform:uppercase;letter-spacing:1px">weights</span>
        ${pixelSelect('set-wu', [{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }], s.weight_unit, 'weight units')}</div>
      <button class="btn wide" onclick="G.saveSettings(false)">SAVE UNITS</button>
      <hr class="rule">
      <span class="muted" style="display:block;text-transform:uppercase;letter-spacing:1px">ambition</span>
      <div class="muted" style="margin-bottom:8px">how hard the quest-givers push you</div>
      ${amb.map((a, i) => `<button class="btn" style="margin:3px;${s.ambition === i ? 'background:var(--gold);color:var(--bg)' : ''}"
        onclick="G.setAmbition(${i})">
        ${esc(a.name)}</button>`).join('')}
      <div class="muted" style="margin-top:6px">${esc(amb[s.ambition].desc)}</div>
    </div>
    </section>
    <section aria-labelledby="settings-account">
    <div class="win"><span class="win-title" id="settings-account">Adventurer &amp; Account</span>
      <div class="formrow"><label for="set-name">name</label>
        <div style="display:flex;gap:6px">
          <input type="text" id="set-name" value="${esc(c.name)}" style="flex:1" onkeydown="if(event.key==='Enter')G.saveName()">
          <button class="btn small" style="min-width:0" onclick="G.saveName()">SAVE NAME</button>
        </div>
      </div>
      <div class="muted" style="font-size:16px;margin:6px 0">to change your look, tap your portrait at the top of any page</div>
      <hr class="rule">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn small" style="min-width:0" onclick="G.setPinPrompt()">SET / CHANGE PIN</button>
        <button class="btn small" style="min-width:0" onclick="G.switchProfile()">SWITCH ADVENTURER</button>
      </div>
    </div>
    </section>
    <section aria-labelledby="settings-ravens">
    <div class="win"><span class="win-title" id="settings-ravens">The Ravens (intervals.icu)</span>
      <div class="muted" style="font-size:17px;margin-bottom:8px">
        Runs, climbs, lifts and wellness sync from intervals.icu — which itself syncs from Garmin,
        Strava, Coros, etc. First sync fetches ~400 days; after that the ravens fly every 15 minutes
        and completed workouts turn in quests automatically.
        Athlete ID and API key: intervals.icu &rarr; Settings &rarr; Developer.</div>
      <div class="formrow"><label for="set-aid">athlete id (e.g. i12345)</label><input type="text" id="set-aid" value="${esc(s.intervals_athlete_id)}"></div>
      <div class="formrow"><label for="set-key">api key ${s.intervals_api_key ? '(saved — leave blank to keep)' : ''}</label><input type="password" id="set-key" placeholder="${s.intervals_api_key ? '••••••••' : ''}"></div>
      <button class="btn wide" onclick="G.saveSettings(true)">SAVE &amp; SEND RAVENS</button>
    </div>
    </section>
    <section aria-labelledby="settings-dev">
    <div class="win"><span class="win-title" id="settings-dev">Developer</span>
      <div class="muted" style="font-size:17px;margin-bottom:6px">for testing features without living an entire second life</div>
      <button class="btn ${s.dev_mode ? 'danger' : ''}" onclick="G.toggleDev(${s.dev_mode ? 'false' : 'true'})">
        ${s.dev_mode ? 'DISABLE DEV MODE' : 'ENABLE DEV MODE'}</button>
      ${s.dev_mode ? '<button class="btn wide" style="margin-top:10px" onclick="G.openDevConsole()">OPEN DEV CONSOLE</button>' : ''}
    </div>
    </section>
  `);
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
    <div class="muted" style="font-size:15px;margin-bottom:8px">4 digits — keeps this adventurer's save locked to whoever knows it.</div>
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

G.saveSettings = async (sync) => {
  const token = captureRouteToken();
  const body = {
    name: document.getElementById('set-name').value,
    intervals_athlete_id: document.getElementById('set-aid').value,
    weight_unit: document.getElementById('set-wu') ? document.getElementById('set-wu').value : undefined,
  };
  const key = document.getElementById('set-key').value;
  if (key) body.intervals_api_key = key;
  await api('/settings', { method: 'POST', body });
  await refreshState();
  if (!isRouteTokenCurrent(token)) return;
  toast('Scrolls updated.');
  if (sync) await G.syncNow();
  if (!isRouteTokenCurrent(token)) return;
  render();
};

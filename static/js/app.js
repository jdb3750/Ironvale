/* Iron Vale core: state store, API, router, shared UI. Screens live in screens.js / dungeon.js. */
const S = {
  state: null,        // /api/state payload
  screen: 'town',
  params: {},
  exercises: [],
  hist: [],           // back stack: [{screen, params}]
  fennQueue: [],       // unguided-run bonuses awaiting their speech-bubble moment
};

const $app = () => document.getElementById('app');

async function api(path, opts = {}) {
  const o = { headers: { 'Content-Type': 'application/json' }, ...opts };
  if (o.body && typeof o.body !== 'string') o.body = JSON.stringify(o.body);
  const r = await fetch('/api' + path, o);
  let j = {};
  try { j = await r.json(); } catch (e) { /* empty */ }
  if (r.status === 401) { renderLogin(); throw new Error('locked'); }
  if (!r.ok) {
    const msg = j.error || 'Something went wrong in the Vale.';
    toast(msg, true);
    SFX.error();
    throw new Error(msg);
  }
  return j;
}

async function refreshState() {
  S.state = await api('/state');
  queueFennBubbles(S.state.unguided_pending);
  S.writQueue = S.state.writ_notices || [];   // willow bubbles: same replace-not-append rule
  return S.state;
}

/* Old Fenn pays a bonus for runs done with no quest accepted, but only once
   his speech bubble is actually tapped (see render() below and
   showFennBubbleIfQueued/G.claimFennBubble in screens.js) — the reward is
   NOT applied server-side until that click (/api/unguided/claim). The
   server is the source of truth for what's still unclaimed today (it also
   silently auto-resolves anything left over from a previous day, with no
   bubble), so every refreshState() call REPLACES this queue outright
   rather than appending to it — otherwise a bubble that's just sitting
   there unclaimed would get piled into the queue again on every single
   refresh and stack up duplicates. */
function queueFennBubbles(list) {
  S.fennQueue = list || [];
}

function nav(screen, params = {}) {
  SFX.click();
  if (screen !== S.screen) {
    S.hist.push({ screen: S.screen, params: S.params });
    if (S.hist.length > 30) S.hist.shift();
    if (screen === 'town') S.hist = [];   // town is home; the trail resets
  }
  S.screen = screen;
  S.params = params;
  render();
  window.scrollTo(0, 0);
}

G = window.G || {};
G.back = () => {
  SFX.click();
  const prev = S.hist.pop() || { screen: 'town', params: {} };
  S.screen = prev.screen;
  S.params = { ...prev.params, react: undefined };
  render();
  window.scrollTo(0, 0);
};

function toast(msg, err = false) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* intervals.icu always reports bodyweight in kg regardless of the athlete's
   own display prefs there — convert to the player's chosen weight_unit at
   display time only; storage stays kg (single source of truth). */
function kgToLb(kg) { return kg * 2.2046226218; }

/* ---------- shared chrome ---------- */

function header() {
  const c = S.state.character;
  const xpn = S.state.xp_to_next;
  const pct = Math.min(100, Math.round(100 * c.xp / xpn));
  const vig = '&#9679;'.repeat(c.vigor) + '<span style="color:#333">' + '&#9679;'.repeat(Math.max(0, 10 - c.vigor)) + '</span>';
  const st = c.streak;
  const streakTip = st.count > 0
    ? `Day ${st.count} streak · best ${st.best || st.count} · ${st.count % 5 === 0 ? 'boon earned today — CON rose!' : `next CON boon in ${5 - (st.count % 5)} day(s)`}`
    : 'No streak burning. Complete any quest to light the flame.';
  return `<div class="hdr">
    <div class="hdr-brand" onclick="nav('town')">
      <div class="pixel-title" style="font-size:26px">IRON VALE</div>
      <div class="muted" style="font-size:16px">a village that pays in gold for sweat</div>
    </div>
    <div class="hdr-streak ${st.count > 0 ? '' : 'cold'}" title="${streakTip}">
      ${spriteTag('icon_flame', 26)}
      <span class="hs-count">${st.count}</span>
      <span class="hs-label">DAY${st.count === 1 ? '' : 'S'}</span>
    </div>
    <div class="hdr-char">
      <div class="hc-row">
        <span class="hero-btn" title="customize your look" onclick="G.editAppearance()">${heroTag(c.appearance || {}, 36)}</span>
        ${S.state.buddy ? `<span class="buddy-chip" title="${esc(S.state.buddy.name)}, your buddy (${esc(S.state.buddy.personality)})" onclick="nav('ranch')">${critterTag(S.state.buddy, 26)}</span>` : ''}
        <span><span style="color:var(--gold-bright)">${esc(c.name)}</span> <span class="muted">LV</span> ${c.level}</span>
        <span class="xpbar"><div style="width:${pct}%"></div></span>
      </div>
      <div class="hc-row hc-res">
        <span class="stat">${spriteTag('icon_coin', 15)} ${c.gold}</span>
        <span class="stat">${spriteTag('icon_token', 15)} ${c.tokens}</span>
        <span class="stat vigor">${vig}</span>
      </div>
    </div>
  </div>`;
}

function footer() {
  const st = S.state;
  return `${S.screen !== 'town' ? `<div class="backrow"><button class="btn small" onclick="G.back()">&larr; BACK</button></div>` : ''}
  <div class="footer">
    <div class="footer-btns">
      <button class="btn small" onclick="G.syncNow()">SEND RAVENS</button>
      <button class="btn small" onclick="nav('settings')">SETTINGS</button>
      <button class="btn small" data-sound-btn onclick="G.mute()">${SFX.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
    </div>
    <div class="muted" style="font-size:16px">
      ${st.last_sync ? 'ravens last flew ' + esc(st.last_sync.slice(0, 16).replace('T', ' ')) + ' &middot; they fly every 15 min' : 'no sync yet — link intervals.icu in Settings'}
    </div>
    ${st.version ? `<div class="muted" style="font-size:14px;margin-top:4px">v${esc(st.version)}</div>` : ''}
  </div>`;
}

function shell(inner) {
  return header() + inner + footer();
}

/* ---------- typewriter dialog ---------- */

let twTimer = null;
function typewrite(el, text, speed = 14) {
  clearInterval(twTimer);
  let i = 0;
  el.classList.add('cursor-blink');
  el.textContent = '';
  twTimer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) { clearInterval(twTimer); }
  }, speed);
}

/* ---------- reward ceremony ---------- */

function showCeremony(rewards, title) {
  SFX.fanfare();
  const STAT_NAMES = { str: 'Strength', end: 'Endurance', con: 'Constitution', spr: 'Spirit' };
  const lines = [];
  lines.push(`<div class="reward-line" style="color:var(--purple)">+${rewards.xp} XP</div>`);
  lines.push(`<div class="reward-line gold" style="color:var(--gold-bright)">&#9670; +${rewards.gold} gold</div>`);
  lines.push(`<div class="reward-line" style="color:var(--green)">+${rewards.vigor} vigor</div>`);
  const sg = Object.entries(rewards.stat_gains || {});
  if (sg.length) lines.push(`<div class="reward-line" style="color:var(--blue)">${sg.map(([k, v]) => `+${v} ${STAT_NAMES[k] || k.toUpperCase()}`).join(' &nbsp; ')}</div>`);
  if (rewards.token) lines.push(`<div class="reward-line" style="color:var(--blue)">&#9678; A brass token for the Krankwerk!</div>`);
  if (rewards.item) lines.push(`<div class="reward-line r-${rewards.item.rarity}" style="display:flex;align-items:center;justify-content:center;gap:8px">${spriteTag(rewards.item.sprite, 28)} ${esc(rewards.item.name)}</div>`);
  if (rewards.streak > 1) lines.push(`<div class="reward-line" style="color:#e07030">&#9650; ${rewards.streak}-DAY STREAK${rewards.streak_bonus ? ' — +1 Constitution!' : ''}</div>`);
  // track the level-up line's own index so its SFX plays exactly when IT
  // appears, not just whenever the sequence happens to end (the buddy line
  // below, when present, is always last and would otherwise steal the cue)
  let levelupIndex = -1;
  if (rewards.levels) {
    levelupIndex = lines.length;
    lines.push(`<div class="reward-line levelup">&#9733; LEVEL UP! You are now level ${rewards.level} &#9733;</div>`);
  }
  if (S.state && S.state.buddy) {
    const b = S.state.buddy;
    lines.push(`<div class="reward-line" style="display:flex;align-items:center;justify-content:center;gap:8px">
      ${monsterTag(b.dna, b.rarity, 30, b.hat)} <span class="muted" style="font-size:17px">${esc(b.name)} squeaks with pride.</span></div>`);
  }

  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="win ceremony">
    <h2>QUEST COMPLETE</h2>
    <div style="font-size:24px;color:var(--gold-bright);margin-bottom:10px">${esc(title)}</div>
    <div class="muted" style="margin-bottom:8px">${esc(rewards.note || '')}</div>
    <div id="cere-lines"></div>
    <div style="margin-top:16px"><button id="cere-glory" class="btn big" disabled>revealing...</button></div>
  </div>`;
  document.body.appendChild(ov);
  const box = ov.querySelector('#cere-lines');
  const glory = ov.querySelector('#cere-glory');
  // the GLORY button stays disabled until every line — especially a LEVEL UP
  // banner, which can land well after the first beat — has had its moment
  lines.forEach((html, i) => {
    setTimeout(() => {
      box.insertAdjacentHTML('beforeend', html);
      hydrateSprites(box);
      SFX.coin();
      if (i === levelupIndex) SFX.levelup();
      if (i === lines.length - 1) {
        glory.disabled = false;
        glory.textContent = 'GLORY!';
        glory.onclick = () => ov.remove();
      }
    }, 350 + i * 380);
  });
}

/* ---------- login ---------- */

function renderLogin() {
  $app().innerHTML = `
    <div style="max-width:380px;margin:80px auto">
      <div class="win center">
        <div class="pixel-title" style="font-size:22px;margin-bottom:14px">IRON VALE</div>
        <p class="muted">The gate is barred. Speak the word.</p>
        <div class="formrow"><input type="password" id="pw" placeholder="password" onkeydown="if(event.key==='Enter')G.login()"></div>
        <button class="btn big" onclick="G.login()">ENTER</button>
      </div>
    </div>`;
}

/* ---------- global handlers namespace ---------- */
window.G = window.G || {};

G.mute = () => {
  const m = SFX.toggleMute();
  document.querySelectorAll('[data-sound-btn]').forEach(b => {
    b.textContent = m ? 'SOUND: OFF' : 'SOUND: ON';
  });
};

G.login = async () => {
  const pw = document.getElementById('pw').value;
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
  if (r.ok) { await boot(); } else { toast('The gate does not open.', true); SFX.error(); }
};

/* ---------- render dispatch ---------- */

function render() {
  if (window.__stopRanch) { window.__stopRanch(); window.__stopRanch = null; }
  // leaving the pen: forget the arrangement, so the herd has "moved around" by the next visit
  if (typeof RANCH !== 'undefined' && S.screen !== 'ranch') RANCH.saved = null;
  const fn = SCREENS[S.screen] || SCREENS.town;
  Promise.resolve(fn()).then(() => {
    hydrateSprites();
    if (S.screen === 'town') { showFennBubbleIfQueued(); showWillowBubbleIfQueued(); }
  }).catch(e => console.error(e));
}

/* ---------- appearance editor (opens from your header sprite) ---------- */

G.editAppearance = () => {
  SFX.click();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'ap-overlay';
  ov.onclick = (e) => { if (e.target === ov) { ov.remove(); render(); } };
  ov.innerHTML = `<div class="win center" style="max-width:360px">
    <span class="win-title">Your Look</span>
    <div id="ap-ov-content"></div>
    <button class="btn big" style="margin-top:10px" onclick="this.closest('.overlay').remove();render()">DONE</button>
  </div>`;
  document.body.appendChild(ov);
  G.apRedraw();
};

G.apRedraw = () => {
  const box = document.getElementById('ap-ov-content');
  if (!box) return;
  const ap = S.state.character.appearance || { skin: 0, hair: 1, hair_color: 0, shirt: 2, pants: 0 };
  const row = (label, key, count) => `
    <div class="ap-row" style="justify-content:space-between;margin:6px 0">
      <span class="muted" style="font-size:16px;text-transform:uppercase">${label}</span>
      <span style="display:inline-flex;align-items:center;gap:8px">
        <button class="btn small" style="min-width:0" onclick="G.apStep('${key}',-1,${count})">&#9668;</button>
        <span class="muted" style="min-width:40px;text-align:center">${((ap[key] || 0) % count) + 1}/${count}</span>
        <button class="btn small" style="min-width:0" onclick="G.apStep('${key}',1,${count})">&#9658;</button>
      </span>
    </div>`;
  box.innerHTML = `
    <div class="ap-preview" style="display:inline-block;margin:8px 0">${heroTag(ap, 110)}</div>
    ${row('skin', 'skin', HERO_SKINS.length)}
    ${row('hair style', 'hair', HERO_HAIR_STYLES.length)}
    ${row('hair color', 'hair_color', HERO_HAIR_COLORS.length)}
    ${row('garb', 'shirt', HERO_SHIRTS.length)}
    ${row('legwear', 'pants', HERO_PANTS.length)}`;
  hydrateSprites(box);
};

G.apStep = (key, dir, count) => {
  const c = S.state.character;
  const ap = c.appearance || { skin: 0, hair: 1, hair_color: 0, shirt: 2, pants: 0 };
  ap[key] = ((ap[key] || 0) + dir + count) % count;
  c.appearance = ap;
  SFX.click();
  api('/appearance', { method: 'POST', body: ap }).catch(() => {});
  G.apRedraw();
};

/* ---------- adventurer profiles ---------- */

const PICKER = { profiles: [], open: null, creating: false };

function renderProfilePicker(profs) {
  if (profs) PICKER.profiles = profs;
  const card = (p) => {
    const open = PICKER.open === p.slug;
    const ap = p.appearance || { skin: 0, hair: 1, hair_color: 0, shirt: 2, pants: 0 };
    return `<div class="profile-card ${open ? 'open' : ''}" onclick="G.pickProfile('${p.slug}', ${p.has_pin})">
      <div class="profile-portrait">
        ${heroTag(ap, 56)}
        ${p.buddy ? `<span class="profile-buddy" title="${esc(p.buddy.name)}">${monsterTag(p.buddy.dna, p.buddy.rarity, 26, p.buddy.hat)}</span>` : ''}
      </div>
      <div style="color:var(--gold-bright);font-size:19px">${esc(p.name)}</div>
      ${p.level ? `<div class="muted" style="font-size:13px">LV ${p.level}</div>` : ''}
      ${p.has_pin && !open ? '<div class="muted" style="font-size:14px">&#128274; PIN</div>' : ''}
      ${open ? `<div onclick="event.stopPropagation()">
        <input type="password" inputmode="numeric" maxlength="4" id="pin-${p.slug}" class="pin-input" placeholder="&#8226;&#8226;&#8226;&#8226;"
          onkeydown="if(event.key==='Enter')G.submitPin('${p.slug}')">
        <button class="btn small green" style="min-width:0;margin-top:4px" onclick="G.submitPin('${p.slug}')">ENTER</button>
      </div>` : ''}
    </div>`;
  };
  $app().innerHTML = `
    <div style="max-width:560px;margin:60px auto">
      <div class="win center">
        <div class="pixel-title" style="font-size:26px;margin-bottom:4px">IRON VALE</div>
        <div class="muted" style="margin-bottom:14px">WHO GOES THERE?</div>
        <div class="profile-grid">
          ${PICKER.profiles.map(card).join('')}
          <div class="profile-card new" onclick="G.showCreate()">
            <div style="font-size:40px;color:var(--green)">+</div>
            <div class="muted" style="font-size:17px">NEW ADVENTURER</div>
          </div>
        </div>
        ${PICKER.creating ? `
        <div style="margin-top:14px;text-align:left;max-width:300px;margin-left:auto;margin-right:auto">
          <div class="formrow"><label>name</label><input type="text" id="np-name" maxlength="24" placeholder="e.g. Robin"></div>
          <div class="formrow"><label>4-digit pin</label><input type="password" inputmode="numeric" maxlength="4" id="np-pin" class="pin-input" placeholder="&#8226;&#8226;&#8226;&#8226;"
            onkeydown="if(event.key==='Enter')G.createProfile()"></div>
          <div class="center"><button class="btn green" onclick="G.createProfile()">BEGIN THE LEGEND</button></div>
        </div>` : ''}
        <div class="muted" style="font-size:15px;margin-top:14px">this device remembers you until you switch adventurers</div>
      </div>
    </div>`;
  hydrateSprites();
  const pinEl = document.querySelector('.pin-input');
  if (pinEl) pinEl.focus();
}

G.pickProfile = async (slug, hasPin) => {
  if (!hasPin) {
    try { await api('/profiles/select', { method: 'POST', body: { slug } }); } catch (e) { return; }
    SFX.accept();
    await boot();
    return;
  }
  if (PICKER.open !== slug) {
    PICKER.open = slug;
    SFX.click();
    renderProfilePicker();
  }
};

G.submitPin = async (slug) => {
  const pin = document.getElementById(`pin-${slug}`).value;
  try {
    await api('/profiles/select', { method: 'POST', body: { slug, pin } });
  } catch (e) { return; }
  SFX.accept();
  PICKER.open = null;
  await boot();
};

G.showCreate = () => {
  PICKER.creating = !PICKER.creating;
  PICKER.open = null;
  SFX.click();
  renderProfilePicker();
  const el = document.getElementById('np-name');
  if (el) el.focus();
};

G.createProfile = async () => {
  const name = document.getElementById('np-name').value;
  const pin = document.getElementById('np-pin').value;
  try {
    await api('/profiles', { method: 'POST', body: { name, pin } });
  } catch (e) { return; }
  SFX.fanfare();
  PICKER.creating = false;
  await boot();
};

G.switchProfile = async () => {
  SFX.click();
  await api('/profiles/logout', { method: 'POST' });
  S.screen = 'town'; S.params = {}; S.hist = [];
  PICKER.open = null; PICKER.creating = false;
  boot();
};

/* Every button (and anything else with an inline onclick) gets a baseline
   tap sound automatically — this is the one place that guarantees new UI
   never ships silent, instead of chasing missing SFX.click() calls one by one. */
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [onclick]');
  if (el && !el.disabled) SFX.click();
});

async function boot() {
  let prof;
  try {
    prof = await api('/profiles');
  } catch (e) {
    return; // login screen already shown on 401
  }
  if (!prof.current) {
    // no remembered adventurer on this device: the roster stands guard
    renderProfilePicker(prof.profiles);
    return;
  }
  try {
    await refreshState();
  } catch (e) {
    return;
  }
  try {
    S.exercises = (await api('/exercises')).exercises;
    S.itemsCatalog = (await api('/items')).items;
  } catch (e) { /* non-fatal */ }
  render();
}

document.addEventListener('DOMContentLoaded', boot);

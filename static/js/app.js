/* Iron Vale core: state store, API, router, shared UI. Screens live in the
   per-screen files (town.js, giver.js, hall.js, misc.js, dungeon.js, ...). */
const S = {
  state: null,        // /api/state payload
  screen: 'town',
  params: {},
  exercises: [],
  depth: 0,
  routeGeneration: 0,
  viewGeneration: 0,
  historyBusy: false,
  routeSession: '',
  profileGeneration: 0,
  pendingScrollToken: null,
  fennQueue: [],       // unguided-run bonuses awaiting their speech-bubble moment
};

const ROUTE_OWNER = 'iron-vale';
let routeSessionSequence = 0;
let historyResetResolve = null;

function nextRouteSession() {
  routeSessionSequence++;
  return `${Date.now().toString(36)}-${routeSessionSequence}`;
}

function routeParams(params = {}) {
  try {
    return JSON.parse(JSON.stringify(params || {}));
  } catch (e) {
    return {};
  }
}

function routeState(route, params, depth) {
  return {
    owner: ROUTE_OWNER,
    session: S.routeSession,
    route,
    params: routeParams(params),
    depth,
  };
}

function isRouteState(state, currentSession = true) {
  return !!state
    && state.owner === ROUTE_OWNER
    && typeof state.route === 'string'
    && Number.isInteger(state.depth)
    && state.depth >= 0
    && (!currentSession || state.session === S.routeSession);
}

function sameRoute(route, params) {
  return route === S.screen
    && JSON.stringify(routeParams(params)) === JSON.stringify(routeParams(S.params));
}

function captureRouteToken() {
  return `${S.profileGeneration}:${S.routeGeneration}:${S.viewGeneration}`;
}

function isRouteTokenCurrent(token) {
  return token === captureRouteToken();
}

function captureProfileToken() {
  return S.profileGeneration;
}

function isProfileTokenCurrent(token) {
  return token === S.profileGeneration;
}

const overlayFocus = new WeakMap();
let overlayLabelSequence = 0;

function overlayFocusable(overlay) {
  return [...overlay.querySelectorAll(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(element => {
    if (element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
    if (typeof getComputedStyle !== 'function') return true;
    for (let node = element; node && node !== overlay; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  });
}

function prepareOverlay(overlay) {
  if (!overlay) return overlay;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('tabindex', '-1');

  const title = overlay.querySelector('.win-title, h1, h2');
  if (title) {
    if (!title.id) title.id = `overlay-title-${++overlayLabelSequence}`;
    overlay.setAttribute('aria-labelledby', title.id);
  } else {
    overlay.setAttribute('aria-label', 'Iron Vale dialog');
  }

  overlayFocus.set(overlay, document.activeElement);
  const app = document.getElementById('app');
  if (app) app.inert = true;
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape' && overlay.dataset.escapeClose !== 'false') {
      event.preventDefault();
      closeRouteOverlay(overlay);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = overlayFocusable(overlay);
    if (!focusable.length) {
      event.preventDefault();
      overlay.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  requestAnimationFrame(() => {
    if (!overlay.isConnected) return;
    const [first] = overlayFocusable(overlay);
    (first || overlay).focus({ preventScroll: true });
  });
  return overlay;
}

function removeRouteOverlay(overlay, { force = false, restoreFocus = true } = {}) {
  if (!overlay || !overlay.isConnected) return false;
  if (!force && overlay.getAttribute('aria-busy') === 'true') return false;
  const previousFocus = overlayFocus.get(overlay);
  overlay.remove();
  overlayFocus.delete(overlay);
  if (!document.querySelectorAll('.overlay').length) {
    const app = document.getElementById('app');
    if (app) app.inert = false;
  }
  if (restoreFocus && previousFocus) {
    requestAnimationFrame(() => {
      if (previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    });
  }
  return true;
}

function closeRouteOverlay(overlay, continuation) {
  if (!removeRouteOverlay(overlay)) return;
  if (continuation) continuation();
}

function closeRouteOverlays(continuation) {
  const overlays = [...document.querySelectorAll('.overlay')];
  if (overlays.some(overlay => overlay.getAttribute('aria-busy') === 'true')) return;
  overlays.forEach(overlay => removeRouteOverlay(overlay, { restoreFocus: false }));
  if (continuation) continuation();
}

function clearRouteOverlays() {
  document.querySelectorAll('.overlay').forEach(overlay => {
    removeRouteOverlay(overlay, { force: true, restoreFocus: false });
  });
}

function stopRouteActivity() {
  if (window.__stopRanch) {
    window.__stopRanch();
    window.__stopRanch = null;
  }
  document.body.classList.remove('megashake');
  document.querySelectorAll('.flashwipe, .sparkle').forEach(element => element.remove());
}

function setHistoryBusy(busy) {
  S.historyBusy = busy;
  document.querySelectorAll('[data-route-back]').forEach(button => {
    button.disabled = busy || S.depth === 0;
  });
  document.querySelectorAll('[data-route-town]').forEach(button => {
    button.disabled = busy;
  });
}

function applyRoute(route, params, depth) {
  stopRouteActivity();
  clearRouteOverlays();
  resetFormFocusState();
  cancelAppRouteWork();

  S.screen = route;
  S.params = routeParams(params);
  S.depth = depth;
  S.routeGeneration++;
  S.pendingScrollToken = S.routeGeneration;
  setHistoryBusy(false);

  const root = $app();
  if (root) {
    root.setAttribute('aria-busy', 'true');
    root.style.visibility = 'hidden';
  }
  render();
  return S.routeGeneration;
}

function replaceTownRoute() {
  S.routeSession = nextRouteSession();
  history.replaceState(routeState('town', {}, 0), '', location.href);
  applyRoute('town', {}, 0);
}

function resetHistoryToTown() {
  const current = history.state;
  if (isRouteState(current, false) && current.depth > 0) {
    S.routeSession = nextRouteSession();
    setHistoryBusy(true);
    return new Promise(resolve => {
      historyResetResolve = resolve;
      history.go(-current.depth);
    });
  }
  replaceTownRoute();
  return Promise.resolve();
}

/* Screen files register a closure here to zero their module-level state
   (open tabs, half-built routines, dungeon log...) — boot() runs them all,
   so switching adventurers never leaks one profile's UI state into the next. */
const RESETS = [];

const $app = () => document.getElementById('app');

function repaintCharacterResources() {
  const c = S.state?.character;
  if (!c) return;
  const gold = document.getElementById('character-gold');
  const tokens = document.getElementById('character-tokens');
  const vigor = document.getElementById('character-vigor');
  if (gold) {
    gold.innerHTML = `${spriteTag('icon_coin', 15)} ${c.gold}`;
    hydrateSprites(gold);
  }
  if (tokens) {
    tokens.innerHTML = `${spriteTag('icon_token', 15)} ${c.tokens}`;
    hydrateSprites(tokens);
  }
  if (vigor) {
    vigor.innerHTML = '&#9679;'.repeat(c.vigor)
      + '<span style="color:#333">' + '&#9679;'.repeat(Math.max(0, 10 - c.vigor)) + '</span>';
  }
}

function reconcileMutationState(patch, profileToken) {
  if (!isProfileTokenCurrent(profileToken) || !S.state) return false;
  Object.assign(S.state, patch);
  if (patch.character) repaintCharacterResources();
  return true;
}

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
  const profileToken = captureProfileToken();
  const state = await api('/state');
  if (!isProfileTokenCurrent(profileToken)) return S.state;
  S.state = state;
  queueFennBubbles(state.unguided_pending);
  S.writQueue = state.writ_notices || [];   // willow bubbles: same replace-not-append rule
  return S.state;
}

function clientTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; }
  catch (e) { return ''; }
}

function localToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function syncClientTimezone() {
  const tz = clientTimeZone();
  if (!tz || !S.state?.settings) return;
  if (S.state.settings.timezone === tz) return;
  try {
    await api('/settings', { method: 'POST', body: { timezone: tz } });
    S.state.settings.timezone = tz;
  } catch (e) { /* non-fatal */ }
}

/* Old Fenn pays a bonus for runs done with no quest accepted, but only once
   his speech bubble is actually tapped (see render() below and
   showFennBubbleIfQueued/G.claimFennBubble in town.js) — the reward is
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
  if (S.historyBusy) return;

  const nextParams = routeParams(params);
  if (screen === 'town') {
    if (S.depth === 0) {
      if (!sameRoute('town', nextParams)) {
        history.replaceState(routeState('town', {}, 0), '', location.href);
        applyRoute('town', {}, 0);
      }
      return;
    }
    setHistoryBusy(true);
    history.go(-S.depth);
    return;
  }

  if (sameRoute(screen, nextParams)) return;
  if (!isRouteState(history.state)) {
    history.replaceState(routeState(S.screen, S.params, S.depth), '', location.href);
  }
  const depth = S.depth + 1;
  history.pushState(routeState(screen, nextParams, depth), '', location.href);
  applyRoute(screen, nextParams, depth);
}

G = window.G || {};
G.closeOverlay = closeRouteOverlay;
G.closeOverlays = closeRouteOverlays;
G.back = () => {
  SFX.click();
  if (S.historyBusy || S.depth === 0) return;
  setHistoryBusy(true);
  history.back();
};

window.addEventListener('popstate', event => {
  if (historyResetResolve) {
    const resolve = historyResetResolve;
    historyResetResolve = null;
    history.replaceState(routeState('town', {}, 0), '', location.href);
    applyRoute('town', {}, 0);
    resolve();
    return;
  }

  if (!isRouteState(event.state)) {
    setHistoryBusy(false);
    return;
  }
  applyRoute(event.state.route, event.state.params, event.state.depth);
});

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

function characterNameTag(name) {
  const value = String(name || '');
  const glyphs = [...value];
  const pairedCjk = glyphs.length >= 8 && /^[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+$/.test(value);
  const text = pairedCjk
    ? Array.from({ length: Math.ceil(glyphs.length / 2) }, (_, index) => esc(glyphs.slice(index * 2, index * 2 + 2).join(''))).join('<wbr>')
    : esc(value);
  return `<span class="character-name${pairedCjk ? ' paired-cjk' : ''}">${text}</span>`;
}

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
    <button type="button" class="hdr-brand control-reset illustrated-control" aria-label="Return to Town" onclick="nav('town')">
      <div class="pixel-title" style="font-size:26px">IRON VALE</div>
      <div class="muted" style="font-size:16px">a village that pays in gold for sweat</div>
    </button>
    <div class="hdr-streak ${st.count > 0 ? '' : 'cold'}" title="${streakTip}">
      ${spriteTag('icon_flame', 26)}
      <span class="hs-count">${st.count}</span>
      <span class="hs-label">DAY${st.count === 1 ? '' : 'S'}</span>
    </div>
    <div class="hdr-char">
      <div class="hc-row">
        <button type="button" class="hero-btn control-reset illustrated-control" title="customize your look" aria-label="Customize your look" onclick="G.editAppearance()">${heroTag(c.appearance || {}, 36)}</button>
        ${S.state.buddy ? `<button type="button" class="buddy-chip control-reset illustrated-control" title="${esc(S.state.buddy.name)}, your buddy (${esc(S.state.buddy.personality)})" aria-label="Visit ${esc(S.state.buddy.name)} in the Menagerie" onclick="nav('ranch')">${critterTag(S.state.buddy, 26)}</button>` : ''}
        <span>${characterNameTag(c.name)} <span class="muted">LV</span> ${c.level}</span>
        <span class="xpbar"><div style="width:${pct}%"></div></span>
      </div>
      <div class="hc-row hc-res">
        ${st.count > 0 ? `<span class="stat streak streak-mini" title="${streakTip}">${spriteTag('icon_flame', 15)} ${st.count}</span>` : ''}
        <span class="stat" id="character-gold">${spriteTag('icon_coin', 15)} ${c.gold}</span>
        <span class="stat" id="character-tokens">${spriteTag('icon_token', 15)} ${c.tokens}</span>
        <span class="stat vigor" id="character-vigor">${vig}</span>
      </div>
    </div>
  </div>`;
}

function footer() {
  const st = S.state;
  const canGoBack = S.depth > 0 && !S.historyBusy;
  const current = route => S.screen === route ? ' aria-current="page"' : '';
  return `${S.screen !== 'town' ? `<div class="backrow"><button type="button" class="btn small" data-route-back onclick="G.back()" ${canGoBack ? '' : 'disabled'}>&larr; BACK</button></div>` : ''}
  <div class="footer">
    <div class="footer-btns">
      <button type="button" class="btn small" onclick="G.syncNow()">SEND RAVENS</button>
      <button type="button" class="btn small"${current('settings')} onclick="nav('settings')">SETTINGS</button>
      <button type="button" class="btn small" data-sound-btn onclick="G.mute()">${SFX.muted ? 'SOUND: OFF' : 'SOUND: ON'}</button>
    </div>
    <div class="muted" style="font-size:16px">
      ${st.last_sync ? 'ravens last flew ' + esc(st.last_sync.slice(0, 16).replace('T', ' ')) + ' &middot; they fly every 15 min' : 'no sync yet — link intervals.icu in Settings'}
    </div>
    ${st.version ? `<div class="muted" style="font-size:14px;margin-top:4px">v${esc(st.version)}</div>` : ''}
  </div>
  <nav class="phone-dock" aria-label="Iron Vale commands">
    <button type="button" class="dock-action" data-route-back onclick="G.back()" ${canGoBack ? '' : 'disabled'} aria-label="Back">&larr;<span>BACK</span></button>
    <button type="button" class="dock-action" data-route-town${current('town')} onclick="nav('town')" ${S.historyBusy ? 'disabled' : ''} aria-label="Town"><span>TOWN</span></button>
    <button type="button" class="dock-action"${current('settings')} onclick="nav('settings')" aria-label="Settings"><span>SETTINGS</span></button>
  </nav>`;
}

function shell(inner) {
  return header() + inner + footer();
}

const formFocusPairs = new WeakMap();
let activeFormControl = null;
let formFocusFrame = null;

function isCompactPhone() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 719px)').matches);
}

function isFormFocusControl(element) {
  return element instanceof Element && element.matches(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), select, textarea, [contenteditable="true"]'
  );
}

function bindFormFocusPair(field, action) {
  const fieldElement = typeof field === 'string' ? document.querySelector(field) : field;
  const actionElement = typeof action === 'string' ? document.querySelector(action) : action;
  if (!fieldElement || !actionElement) return () => {};
  formFocusPairs.set(fieldElement, actionElement);
  return () => formFocusPairs.delete(fieldElement);
}

function keepFormFocusVisible() {
  formFocusFrame = null;
  const field = activeFormControl;
  if (!field || !field.isConnected || !isCompactPhone()) return;

  const companion = formFocusPairs.get(field);
  const elements = [field];
  if (companion && companion.isConnected) elements.push(companion);
  const rects = elements.map(element => element.getBoundingClientRect());
  const viewport = window.visualViewport;
  const viewportTop = (viewport ? viewport.offsetTop : 0) + 12;
  const viewportBottom = (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 12;
  let top = Math.min(...rects.map(rect => rect.top));
  let bottom = Math.max(...rects.map(rect => rect.bottom));

  if (bottom - top > viewportBottom - viewportTop) {
    const fieldRect = rects[0];
    top = fieldRect.top;
    bottom = fieldRect.bottom;
  }

  let delta = 0;
  if (bottom > viewportBottom) delta = bottom - viewportBottom;
  if (top - delta < viewportTop) delta = top - viewportTop;
  if (Math.abs(delta) > 2) window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
}

function scheduleFormFocusVisibility() {
  if (formFocusFrame !== null) cancelAnimationFrame(formFocusFrame);
  formFocusFrame = requestAnimationFrame(keepFormFocusVisible);
}

function resetFormFocusState() {
  activeFormControl = null;
  document.body.classList.remove('dock-collapsed');
  if (formFocusFrame !== null) cancelAnimationFrame(formFocusFrame);
  formFocusFrame = null;
}

function handleFormFocus(element) {
  if (!isFormFocusControl(element) || !isCompactPhone()) return;
  activeFormControl = element;
  const viewport = window.visualViewport;
  document.body.classList.toggle(
    'dock-collapsed',
    !!viewport && viewport.height < window.innerHeight - 1
  );
  scheduleFormFocusVisibility();
}

function syncFormFocusState(element = document.activeElement) {
  if (isFormFocusControl(element) && isCompactPhone()) {
    handleFormFocus(element);
  } else {
    resetFormFocusState();
  }
}

document.addEventListener('focus', event => syncFormFocusState(event.target), true);
document.addEventListener('blur', () => {
  requestAnimationFrame(() => {
    syncFormFocusState();
  });
}, true);

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => syncFormFocusState());
  window.visualViewport.addEventListener('scroll', () => syncFormFocusState());
}

/* ---------- typewriter dialog ---------- */

let twTimer = null;
let stopTypewriterMotionWatch = () => {};
const appRouteTimers = new Set();
const appRouteWork = new Set();
const reducedMotionListeners = new Set();
let reducedMotionMedia = null;

function getReducedMotionMedia() {
  if (!reducedMotionMedia && window.matchMedia) {
    reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
    const notify = event => {
      if (!event.matches) return;
      [...reducedMotionListeners].forEach(listener => listener());
    };
    if (reducedMotionMedia.addEventListener) reducedMotionMedia.addEventListener('change', notify);
    else if (reducedMotionMedia.addListener) reducedMotionMedia.addListener(notify);
  }
  return reducedMotionMedia;
}

function prefersReducedMotion() {
  return !!getReducedMotionMedia()?.matches;
}

function onReducedMotionRequested(callback) {
  getReducedMotionMedia();
  reducedMotionListeners.add(callback);
  return () => reducedMotionListeners.delete(callback);
}

function createRouteWork(token = captureRouteToken()) {
  let active = true;
  const timers = new Set();
  const frames = new Set();
  const cleanups = new Set();
  const work = {
    get active() { return active && isRouteTokenCurrent(token); },
    timeout(callback, delay) {
      if (!active) return null;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (work.active) callback();
      }, delay);
      timers.add(timer);
      return timer;
    },
    frame(callback) {
      if (!active) return null;
      let frame = null;
      frame = requestAnimationFrame(timestamp => {
        if (frame !== null) frames.delete(frame);
        if (work.active) callback(timestamp);
      });
      if (frame !== null) frames.add(frame);
      return frame;
    },
    addCleanup(callback) {
      if (!active) {
        callback();
        return () => {};
      }
      cleanups.add(callback);
      return () => cleanups.delete(callback);
    },
    cancel() {
      if (!active) return;
      active = false;
      timers.forEach(timer => clearTimeout(timer));
      frames.forEach(frame => cancelAnimationFrame(frame));
      timers.clear();
      frames.clear();
      [...cleanups].forEach(cleanup => cleanup());
      cleanups.clear();
      appRouteWork.delete(work);
    },
  };
  appRouteWork.add(work);
  return work;
}

function cancelAppRouteWork() {
  clearInterval(twTimer);
  twTimer = null;
  stopTypewriterMotionWatch();
  stopTypewriterMotionWatch = () => {};
  appRouteTimers.forEach(timer => clearTimeout(timer));
  appRouteTimers.clear();
  [...appRouteWork].forEach(work => work.cancel());
}

function typewrite(el, text, speed = 14, portraitEl = null) {
  clearInterval(twTimer);
  twTimer = null;
  stopTypewriterMotionWatch();
  stopTypewriterMotionWatch = () => {};
  const token = captureRouteToken();
  if (!el || !isRouteTokenCurrent(token)) return;
  let i = 0, tick = 0;
  setPortraitMouth(portraitEl, false);
  if (prefersReducedMotion()) {
    el.classList.remove('cursor-blink');
    el.textContent = text;
    return;
  }
  el.classList.add('cursor-blink');
  el.textContent = '';
  const timer = setInterval(() => {
    if (!isRouteTokenCurrent(token) || !el.isConnected) {
      clearInterval(timer);
      if (twTimer === timer) twTimer = null;
      setPortraitMouth(portraitEl, false);
      return;
    }
    i += 2;
    tick++;
    el.textContent = text.slice(0, i);
    // flap roughly every ~130ms (independent of the reveal rate) — reads as
    // talking rather than nervous twitching; always ends mouth-closed
    setPortraitMouth(portraitEl, Math.floor(tick / 9) % 2 === 0);
    if (i >= text.length) {
      clearInterval(timer);
      if (twTimer === timer) twTimer = null;
      stopTypewriterMotionWatch();
      stopTypewriterMotionWatch = () => {};
      setPortraitMouth(portraitEl, false);
    }
  }, speed);
  twTimer = timer;
  stopTypewriterMotionWatch = onReducedMotionRequested(() => {
    if (!isRouteTokenCurrent(token) || !el.isConnected) return;
    clearInterval(timer);
    if (twTimer === timer) twTimer = null;
    el.classList.remove('cursor-blink');
    el.textContent = text;
    setPortraitMouth(portraitEl, false);
    stopTypewriterMotionWatch();
    stopTypewriterMotionWatch = () => {};
  });
}

/* ---------- reward ceremony ---------- */

function showCeremony(rewards, title, routeToken = captureRouteToken()) {
  if (!isRouteTokenCurrent(routeToken)) return;
  SFX.fanfare();
  const STAT_NAMES = { str: 'Strength', end: 'Endurance', con: 'Constitution', spr: 'Spirit' };
  const lines = [];
  lines.push(`<div class="reward-line" style="color:var(--purple)">+${rewards.xp} XP</div>`);
  lines.push(`<div class="reward-line gold" style="color:var(--gold-bright)">&#9670; +${rewards.gold} gold</div>`);
  lines.push(`<div class="reward-line" style="color:var(--green)">+${rewards.vigor} vigor</div>`);
  const sg = Object.entries(rewards.stat_gains || {});
  if (sg.length) lines.push(`<div class="reward-line" style="color:var(--blue)">${sg.map(([k, v]) => `+${v} ${STAT_NAMES[k] || k.toUpperCase()}`).join(' &nbsp; ')}</div>`);
  if (rewards.token) lines.push(`<div class="reward-line" style="color:var(--blue)">&#9678; A brass token for the Crankwerk!</div>`);
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
  ov.dataset.escapeClose = 'false';
  prepareOverlay(ov);
  const box = ov.querySelector('#cere-lines');
  const glory = ov.querySelector('#cere-glory');
  const revealed = new Set();
  let ceremonyWork = null;
  const revealLine = (html, i) => {
    if (!isRouteTokenCurrent(routeToken) || !ov.isConnected) return false;
    if (revealed.has(i)) return true;
    revealed.add(i);
    box.insertAdjacentHTML('beforeend', html);
    hydrateSprites(box);
    SFX.coin();
    if (i === levelupIndex) SFX.levelup();
    if (i === lines.length - 1) {
      glory.disabled = false;
      glory.textContent = 'GLORY!';
      ov.dataset.escapeClose = 'true';
      glory.onclick = () => G.closeOverlay(ov);
      if (ceremonyWork) ceremonyWork.cancel();
    }
    return true;
  };
  if (prefersReducedMotion()) {
    lines.forEach(revealLine);
    return;
  }
  // the GLORY button stays disabled until every line — especially a LEVEL UP
  // banner, which can land well after the first beat — has had its moment
  ceremonyWork = createRouteWork(routeToken);
  ceremonyWork.addCleanup(onReducedMotionRequested(() => {
    if (!ceremonyWork.active) return;
    lines.forEach(revealLine);
    ceremonyWork.cancel();
  }));
  lines.forEach((html, i) => ceremonyWork.timeout(() => revealLine(html, i), 350 + i * 380));
}

/* ---------- login ---------- */

function renderLogin() {
  const root = $app();
  root.classList.add('booting');
  root.style.visibility = '';
  root.removeAttribute('aria-busy');
  root.innerHTML = `
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

let queuedRender = null;
let renderLoop = null;

async function drainRenderQueue() {
  while (queuedRender) {
    const request = queuedRender;
    queuedRender = null;
    stopRouteActivity();
    if (typeof RANCH !== 'undefined' && request.screen !== 'ranch') RANCH.saved = null;
    const root = $app();
    root.classList.remove('booting');
    const fn = SCREENS[request.screen] || SCREENS.town;
    let failed = false;
    try {
      await fn();
    } catch (error) {
      failed = true;
      if (isRouteTokenCurrent(request.token)) console.error(error);
    }
    if (!isRouteTokenCurrent(request.token)) continue;

    if (!failed) {
      hydrateSprites();
      if (request.screen === 'town') {
        showFennBubbleIfQueued();
        showWillowBubbleIfQueued();
      }
    }
    root.style.visibility = '';
    root.removeAttribute('aria-busy');
    setHistoryBusy(false);
    if (S.pendingScrollToken === request.token) {
      S.pendingScrollToken = null;
      window.scrollTo(0, 0);
    }
  }
}

function render() {
  // A same-route root replacement detaches canvases just as surely as
  // navigation does. Settle/cancel route-owned work before replacing it.
  S.viewGeneration++;
  cancelAppRouteWork();
  const renderToken = captureRouteToken();
  if (S.pendingScrollToken !== null) S.pendingScrollToken = renderToken;
  queuedRender = { token: renderToken, screen: S.screen };
  if (!renderLoop) {
    renderLoop = drainRenderQueue().finally(() => {
      renderLoop = null;
      if (queuedRender) render();
    });
  }
  return renderLoop;
}

/* ---------- appearance editor (opens from your header sprite) ---------- */

G.editAppearance = () => {
  SFX.click();
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.id = 'ap-overlay';
  ov.onclick = (e) => { if (e.target === ov) G.closeOverlay(ov, render); };
  ov.innerHTML = `<div class="win center" style="max-width:360px">
    <span class="win-title">Your Look</span>
    <div id="ap-ov-content"></div>
    <button class="btn big" style="margin-top:10px" onclick="G.closeOverlay(this.closest('.overlay'),render)">DONE</button>
  </div>`;
  document.body.appendChild(ov);
  ov.dataset.escapeClose = 'true';
  prepareOverlay(ov);
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
  const root = $app();
  root.classList.add('booting');
  root.style.visibility = '';
  root.removeAttribute('aria-busy');
  if (profs) PICKER.profiles = profs;
  const card = (p) => {
    const open = PICKER.open === p.slug;
    const ap = p.appearance || { skin: 0, hair: 1, hair_color: 0, shirt: 2, pants: 0 };
    const selectAttrs = open ? `role="group" aria-label="${esc(p.name)} profile PIN entry"` :
      `role="button" tabindex="0" aria-label="Play as ${esc(p.name)}" onclick="G.pickProfile('${p.slug}', ${p.has_pin})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();G.pickProfile('${p.slug}', ${p.has_pin})}"`;
    return `<div class="profile-card ${open ? 'open' : ''}" ${selectAttrs}>
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
  root.innerHTML = `
    <div style="max-width:560px;margin:60px auto">
      <div class="win center">
        <div class="pixel-title" style="font-size:26px;margin-bottom:4px">IRON VALE</div>
        <div class="muted" style="margin-bottom:14px">WHO GOES THERE?</div>
        <div class="profile-grid">
          ${PICKER.profiles.map(card).join('')}
          <div class="profile-card new" role="button" tabindex="0" aria-label="Create a new adventurer" onclick="G.showCreate()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();G.showCreate()}">
            <div style="font-size:40px;color:var(--green)">+</div>
            <div class="muted" style="font-size:17px">NEW ADVENTURER</div>
          </div>
        </div>
        ${PICKER.creating ? `
        <div style="margin-top:14px;text-align:left;max-width:300px;margin-left:auto;margin-right:auto">
          <div class="formrow"><label>name</label><input type="text" id="np-name" maxlength="24" placeholder="e.g. Robin"></div>
          <div class="formrow"><label>4-digit pin</label><input type="password" inputmode="numeric" maxlength="4" id="np-pin" class="pin-input" placeholder="&#8226;&#8226;&#8226;&#8226;"
            onkeydown="if(event.key==='Enter')G.createProfile()"></div>
          <div class="center"><button class="btn wide green" onclick="G.createProfile()">BEGIN THE LEGEND</button></div>
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
  if (S.depth > 0) await resetHistoryToTown();
  await api('/profiles/logout', { method: 'POST' });
  PICKER.open = null; PICKER.creating = false;
  await boot();
};

/* Every button (and anything else with an inline onclick) gets a baseline
   tap sound automatically — this is the one place that guarantees new UI
   never ships silent, instead of chasing missing SFX.click() calls one by one. */
document.addEventListener('click', (e) => {
  const el = e.target.closest('button, [onclick]');
  if (el && !el.disabled) SFX.click();
});

/* The key-click pop is a GHOST: a body-level, fixed-position flash pinned
   to the key's rect. It cannot ride the button itself — most clicks call
   render(), which wipes #app and the animating element with it (that's why
   an on-element animation only survived while the click was held). The
   ghost lives outside #app, so it always plays its full 180ms. */
document.addEventListener('pointerdown', (e) => {
  if (!(e.target instanceof Element)) return;
  const key = e.target.closest('.btn, .dock-action');
  if (!key || key.disabled || prefersReducedMotion()) return;
  const r = key.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'key-pop-ghost';
  ghost.style.left = r.left + 'px';
  ghost.style.top = r.top + 'px';
  ghost.style.width = r.width + 'px';
  ghost.style.height = r.height + 'px';
  document.body.appendChild(ghost);
  ghost.addEventListener('animationend', () => ghost.remove());
  setTimeout(() => ghost.remove(), 400);   // belt and braces
});

let bootGeneration = 0;

async function boot() {
  const thisBoot = ++bootGeneration;
  S.profileGeneration++;
  RESETS.forEach(r => r());
  let prof;
  try {
    prof = await api('/profiles');
  } catch (e) {
    return; // login screen already shown on 401
  }
  if (thisBoot !== bootGeneration) return;
  if (!prof.current) {
    stopRouteActivity();
    clearRouteOverlays();
    resetFormFocusState();
    cancelAppRouteWork();
    S.routeSession = nextRouteSession();
    S.screen = 'town';
    S.params = {};
    S.depth = 0;
    S.routeGeneration++;
    S.pendingScrollToken = null;
    history.replaceState(routeState('town', {}, 0), '', location.href);
    renderProfilePicker(prof.profiles);
    return;
  }
  try {
    await refreshState();
  } catch (e) {
    return;
  }
  if (thisBoot !== bootGeneration) return;
  await syncClientTimezone();
  if (thisBoot !== bootGeneration) return;
  try {
    S.exercises = (await api('/exercises')).exercises;
    if (thisBoot !== bootGeneration) return;
    S.itemsCatalog = (await api('/items')).items;
  } catch (e) { /* non-fatal */ }
  if (thisBoot !== bootGeneration) return;
  await resetHistoryToTown();
}

document.addEventListener('DOMContentLoaded', boot);

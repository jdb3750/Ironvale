import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);

class FakeElement {
  constructor(document) {
    this.ownerDocument = document;
    this.className = '';
    this.dataset = {};
    this.isConnected = false;
    this.onclick = null;
    this.innerHTML = '';
    this.hidden = false;
    this.attributes = new Map();
    this.listeners = new Map();
  }

  remove() {
    this.isConnected = false;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

function createHarness() {
  const popstateListeners = [];
  const elements = [];
  const motionMedia = {
    matches: false,
    listeners: [],
    addEventListener(type, listener) {
      if (type === 'change') this.listeners.push(listener);
    },
    addListener(listener) {
      this.listeners.push(listener);
    },
    set(matches) {
      this.matches = matches;
      for (const listener of [...this.listeners]) listener({ matches });
    },
  };
  const document = {
    activeElement: null,
    body: {
      classList: { add() {}, remove() {} },
      appendChild(element) {
        element.isConnected = true;
        elements.push(element);
        return element;
      },
    },
    addEventListener() {},
    createElement() {
      return new FakeElement(document);
    },
    getElementById() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.overlay') {
        return elements.filter(element => element.isConnected && element.className === 'overlay');
      }
      return [];
    },
  };

  const history = {
    entries: [],
    index: -1,
    get length() {
      return this.entries.length;
    },
    get state() {
      return this.entries[this.index] ?? null;
    },
    replaceState(state) {
      if (this.index < 0) {
        this.entries.push(state);
        this.index = 0;
      } else {
        this.entries[this.index] = state;
      }
    },
    pushState(state) {
      this.entries.splice(this.index + 1);
      this.entries.push(state);
      this.index = this.entries.length - 1;
    },
    back() {
      this.go(-1);
    },
    go(delta) {
      const next = this.index + delta;
      if (next < 0 || next >= this.entries.length) return;
      this.index = next;
      for (const listener of popstateListeners) listener({ state: this.state });
    },
  };

  const window = {
    G: {},
    addEventListener(type, listener) {
      if (type === 'popstate') popstateListeners.push(listener);
    },
    matchMedia() {
      return motionMedia;
    },
    scrollTo() {},
  };
  const silentSfx = new Proxy({}, { get: () => () => {} });
  const context = vm.createContext({
    AbortController,
    URLSearchParams,
    cancelAnimationFrame() {},
    clearInterval,
    clearTimeout,
    console,
    confirm: () => true,
    document,
    fetch: async () => ({ json: async () => ({}), ok: true, status: 200 }),
    history,
    location: { href: 'http://iron-vale.test/' },
    requestAnimationFrame: callback => callback(0),
    setTimeout,
    SFX: silentSfx,
    window,
  });
  context.globalThis = context;
  window.document = document;
  window.history = history;
  window.location = context.location;

  vm.runInContext(readFileSync(new URL('static/js/app.js', root), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('static/js/ui.js', root), 'utf8'), context);
  vm.runInContext(`
    hydrateSprites = () => {};
    globalThis.__appRender = render;
    render = () => { globalThis.__renders = (globalThis.__renders || 0) + 1; };
    S.routeSession = 'test-session';
    S.screen = 'town';
    S.params = {};
    S.depth = 0;
    history.replaceState(routeState('town', {}, 0), '', location.href);
    history.pushState(routeState('stats', {}, 1), '', location.href);
    S.screen = 'stats';
    S.params = {};
    S.depth = 1;
  `, context);

  return { context, document, history, motionMedia };
}

test('browser Back leaves a nested route and route cleanup removes its overlay', () => {
  const { context, document, history } = createHarness();
  vm.runInContext(`showModal('<div>day detail</div>')`, context);

  assert.equal(document.querySelectorAll('.overlay').length, 1);
  assert.equal(history.state.route, 'stats');
  assert.equal(history.length, 2);

  history.back();

  assert.equal(document.querySelectorAll('.overlay').length, 0);
  assert.equal(vm.runInContext('S.screen', context), 'town');
  assert.equal(history.state.route, 'town');
});

test('explicit overlay close does not create or consume a route entry', () => {
  const { context, document, history } = createHarness();
  const overlay = vm.runInContext(`showModal('<div>day detail</div>')`, context);
  const lengthBeforeClose = history.length;

  context.overlayUnderTest = overlay;
  vm.runInContext(`G.closeOverlay(overlayUnderTest)`, context);

  assert.equal(document.querySelectorAll('.overlay').length, 0);
  assert.equal(vm.runInContext('S.screen', context), 'stats');
  assert.equal(history.state.route, 'stats');
  assert.equal(history.length, lengthBeforeClose);

  history.back();
  assert.equal(vm.runInContext('S.screen', context), 'town');
});

test('route transition cancels route-owned timers and runs cleanup', async () => {
  const { context } = createHarness();
  vm.runInContext(`
    globalThis.__routeTimerFired = 0;
    globalThis.__routeCleanupRan = 0;
    globalThis.__routeWork = createRouteWork();
    globalThis.__routeWork.timeout(() => { globalThis.__routeTimerFired++; }, 10);
    globalThis.__routeWork.addCleanup(() => { globalThis.__routeCleanupRan++; });
    applyRoute('town', {}, 0);
  `, context);

  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(vm.runInContext('globalThis.__routeTimerFired', context), 0);
  assert.equal(vm.runInContext('globalThis.__routeCleanupRan', context), 1);
});

test('same-route root replacement cancels detached route work', async () => {
  const { context, document } = createHarness();
  const rootElement = {
    classList: { remove() {} },
    style: {},
    removeAttribute() {},
  };
  document.getElementById = id => id === 'app' ? rootElement : null;
  vm.runInContext(`
    SCREENS.stats = async () => {};
    globalThis.__sameRouteCleanup = 0;
    globalThis.__sameRouteWork = createRouteWork();
    globalThis.__sameRouteWork.addCleanup(() => { globalThis.__sameRouteCleanup++; });
  `, context);

  await vm.runInContext(`globalThis.__appRender()`, context);
  assert.equal(vm.runInContext('globalThis.__sameRouteCleanup', context), 1);
  assert.equal(vm.runInContext('globalThis.__sameRouteWork.active', context), false);
});

test('same-route root replacement invalidates callbacks begun against the old root', async () => {
  const { context, document } = createHarness();
  const rootElement = {
    classList: { remove() {} },
    style: {},
    removeAttribute() {},
  };
  document.getElementById = id => id === 'app' ? rootElement : null;
  vm.runInContext(`
    SCREENS.stats = async () => {};
    globalThis.__oldRootToken = captureRouteToken();
  `, context);

  await vm.runInContext(`globalThis.__appRender()`, context);
  assert.equal(vm.runInContext('isRouteTokenCurrent(globalThis.__oldRootToken)', context), false);
});

test('runtime reduced-motion request settles current route work once', () => {
  const { context, motionMedia } = createHarness();
  vm.runInContext(`
    globalThis.__motionSettled = 0;
    globalThis.__motionWork = createRouteWork();
    globalThis.__motionWork.addCleanup(onReducedMotionRequested(() => {
      globalThis.__motionSettled++;
      globalThis.__motionWork.cancel();
    }));
  `, context);

  motionMedia.set(true);
  motionMedia.set(true);
  assert.equal(vm.runInContext('globalThis.__motionSettled', context), 1);
  assert.equal(vm.runInContext('globalThis.__motionWork.active', context), false);
});

test('Colosseum controls cannot rerender or switch contests during a wager', () => {
  const { context } = createHarness();
  vm.runInContext(readFileSync(new URL('static/js/colosseum.js', root), 'utf8'), context);
  vm.runInContext(`
    COL.field = { contestants: [{}, {}], min_bet: 5, max_bet: 50, gold: 50 };
    COL.animating = true;
    globalThis.__renders = 0;
    G.colKind('race');
    G.colPick(1);
    G.colWager(5);
  `, context);

  assert.equal(vm.runInContext('COL.kind', context), 'fight');
  assert.equal(vm.runInContext('COL.picked', context), 0);
  assert.equal(vm.runInContext('COL.wager', context), 20);
  assert.equal(vm.runInContext('globalThis.__renders', context), 0);
});

test('Dungeon capture and Ranch pack consumers subscribe to live reduced motion', async () => {
  const { context, document, motionMedia } = createHarness();
  vm.runInContext(`
    S.state = { character: {} };
    monsterTag = () => '';
    api = async () => ({
      captured: { dna: 1, name: 'Testling', personality: 'steady', rarity: 'common' },
      log: [], state: {}, stats: {}, theme: {},
    });
  `, context);
  vm.runInContext(readFileSync(new URL('static/js/dungeon.js', root), 'utf8'), context);
  vm.runInContext(`renderDungeon = () => {};`, context);
  await vm.runInContext(`runDungeonAction({ action: 'attack' }, captureRouteToken())`, context);
  assert.equal(document.querySelectorAll('.overlay').length, 0);

  motionMedia.set(true);
  assert.equal(document.querySelectorAll('.overlay').length, 1);

  vm.runInContext(readFileSync(new URL('static/js/ranch.js', root), 'utf8'), context);
  vm.runInContext(`
    globalThis.__packSettled = 0;
    bindRanchPackMotion(() => { globalThis.__packSettled++; });
  `, context);
  motionMedia.set(false);
  motionMedia.set(true);
  assert.equal(vm.runInContext('globalThis.__packSettled', context), 1);
  vm.runInContext(`cancelRanchPack(false)`, context);
});

test('abandoned Dungeon entry reconciles only the originating profile', async () => {
  const { context } = createHarness();
  vm.runInContext(`
    S.state = { character: { vigor: 10, gold: 0, tokens: 0 } };
    S.profileGeneration = 4;
    renderDungeon = () => { globalThis.__dungeonRendered = true; };
    api = async () => {
      S.routeGeneration++;
      return {
        character: { vigor: 8, gold: 0, tokens: 0 },
        state: { log: [] },
        stats: { max_hp: 1 },
        theme: {},
      };
    };
  `, context);
  vm.runInContext(readFileSync(new URL('static/js/dungeon.js', root), 'utf8'), context);

  await vm.runInContext(`G.enterDungeon()`, context);
  assert.equal(vm.runInContext('S.state.character.vigor', context), 8);
  assert.equal(vm.runInContext('S.state.dungeon_active', context), true);
  assert.equal(vm.runInContext('globalThis.__dungeonRendered || false', context), false);

  vm.runInContext(`
    S.state.character = { vigor: 7, gold: 0, tokens: 0 };
    api = async () => {
      S.profileGeneration++;
      return {
        character: { vigor: 5, gold: 0, tokens: 0 },
        state: { log: [] },
        stats: {},
        theme: {},
      };
    };
  `, context);
  await vm.runInContext(`G.enterDungeon()`, context);
  assert.equal(vm.runInContext('S.state.character.vigor', context), 7);
});

test('state refresh cannot overwrite a newly selected profile', async () => {
  const { context } = createHarness();
  vm.runInContext(`
    S.profileGeneration = 7;
    S.state = { character: { name: 'First' } };
    S.fennQueue = ['first'];
    S.writQueue = ['first'];
    globalThis.__stateResponse = null;
    api = () => new Promise(resolve => { globalThis.__stateResponse = resolve; });
  `, context);

  const pending = vm.runInContext(`refreshState()`, context);
  vm.runInContext(`
    S.profileGeneration = 8;
    S.state = { character: { name: 'Second' } };
    S.fennQueue = ['second'];
    S.writQueue = ['second'];
    globalThis.__stateResponse({
      character: { name: 'First stale' },
      unguided_pending: ['stale'],
      writ_notices: ['stale'],
    });
  `, context);
  await pending;

  assert.equal(vm.runInContext('S.state.character.name', context), 'Second');
  assert.equal(vm.runInContext('JSON.stringify(S.fennQueue)', context), '["second"]');
  assert.equal(vm.runInContext('JSON.stringify(S.writQueue)', context), '["second"]');
  assert.equal(vm.runInContext(`isRouteTokenCurrent('7:0:0')`, context), false);
});

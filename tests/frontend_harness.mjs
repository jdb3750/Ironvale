import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export const root = new URL('../', import.meta.url);

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

export function createHarness() {
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

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { createHarness, root } from './frontend_harness.mjs';

function screenRoot() {
  return {
    classList: { add() {}, remove() {} },
    innerHTML: '',
    removeAttribute() {},
    style: {},
  };
}

async function renderSettings(ambition) {
  const harness = createHarness();
  const appRoot = screenRoot();
  harness.document.getElementById = id => id === 'app' ? appRoot : null;
  vm.runInContext(readFileSync(new URL('static/js/misc.js', root), 'utf8'), harness.context);
  harness.context.__settingsState = {
    ambition_levels: [
      { name: 'Quiet', desc: 'The Vale asks only a little.' },
      { name: 'Bold', desc: 'The Vale asks for a steady push.' },
    ],
    character: { name: 'Tester' },
    settings: {
      ambition,
      counsel_charter: { primary: '', secondary: [] },
      counsel_mode: 'considered',
      counsel_nudge_enabled: true,
      dev_mode: false,
      intervals_api_key: '',
      intervals_athlete_id: '',
      timezone: 'UTC',
      units: 'km',
      weight_unit: 'kg',
    },
    siege_timezone: 'UTC',
  };
  vm.runInContext(`
    S.state = globalThis.__settingsState;
    counselSchedulePrograms = [];
    counselScheduleEditorHTML = () => '';
    shell = html => html;
  `, harness.context);

  await vm.runInContext('SCREENS.settings()', harness.context);
  return appRoot.innerHTML;
}

function roadCanvas() {
  const drawingContext = {
    fillRect() {},
    fillStyle: '',
    fillText() {},
    font: '',
    globalAlpha: 1,
    textAlign: 'left',
  };
  return {
    getBoundingClientRect: () => ({ left: 0 }),
    getContext: () => drawingContext,
    height: 214,
    onclick: null,
    style: {},
    width: 0,
  };
}

async function renderRoad(totalKm, breakdown) {
  const harness = createHarness();
  const appRoot = screenRoot();
  const canvas = roadCanvas();
  const scroll = { clientWidth: 100, scrollLeft: 0 };
  harness.document.getElementById = id => ({
    app: appRoot,
    'road-map': canvas,
    'road-scroll': scroll,
  })[id] ?? null;
  vm.runInContext(readFileSync(new URL('static/js/hall.js', root), 'utf8'), harness.context);
  harness.context.__roadPayload = {
    breakdown,
    km_to_next: null,
    landmarks: [
      { claimed: true, icon: 'none', key: 'gate', km: 0, name: 'Vale Gate', reached: true },
      { claimed: false, icon: 'none', key: 'field', km: 10, name: 'First Field', reached: false },
    ],
    total_km: totalKm,
    unclaimed: 0,
  };
  harness.context.__statsPayload = {
    character: {},
    recent_activities: [],
    run_summary: { median: 0, n: 0, weekly_min: 0 },
    weeks: [],
  };
  vm.runInContext(`
    S.state = { character: { appearance: {} }, settings: { weight_unit: 'kg' } };
    SPRITES = {};
    statsTab = 'deeds';
    api = async () => globalThis.__statsPayload;
    fetch = async () => ({ ok: true, json: async () => globalThis.__roadPayload });
    shell = html => html;
    portraitTag = () => '';
    npcPortraitEl = () => null;
    typewrite = () => {};
    drawBars = () => {};
    mulberry32 = () => () => 0.5;
    drawHero = (ctx, appearance, scale, x, y) => {
      globalThis.__heroPosition = { x, y };
    };
  `, harness.context);

  await vm.runInContext('SCREENS.stats()', harness.context);
  return {
    heroPosition: harness.context.__heroPosition,
    html: appRoot.innerHTML,
    scrollLeft: scroll.scrollLeft,
  };
}

function createScrivenerHarness(kind, minutes) {
  const harness = createHarness();
  const fields = {
    'cl-kind': { value: kind },
    'cl-min': { value: minutes },
    'cl-note': { value: '' },
  };
  harness.document.getElementById = id => fields[id] ?? null;
  vm.runInContext(`
    globalThis.__claimRequests = 0;
    globalThis.__claimToasts = 0;
    api = async () => { globalThis.__claimRequests++; return {}; };
    toast = () => { globalThis.__claimToasts++; };
  `, harness.context);
  vm.runInContext(readFileSync(new URL('static/js/giver.js', root), 'utf8'), harness.context);
  return harness;
}

test('Scrivener does not submit when no deed type is selected', async () => {
  const { context } = createScrivenerHarness('', '30');

  await vm.runInContext('G.claim()', context);

  assert.equal(vm.runInContext('globalThis.__claimRequests', context), 0);
  assert.equal(vm.runInContext('globalThis.__claimToasts', context), 1);
});

test('Scrivener does not submit when duration is blank', async () => {
  const { context } = createScrivenerHarness('run', '');

  await vm.runInContext('G.claim()', context);

  assert.equal(vm.runInContext('globalThis.__claimRequests', context), 0);
  assert.equal(vm.runInContext('globalThis.__claimToasts', context), 1);
});

test('sync status exposes a safe persistent failure as a live region', () => {
  const { context } = createHarness();
  const html = vm.runInContext(`syncStatusHTML({
    last_sync: '2026-07-18T08:00:00-07:00',
    last_sync_error: {
      at: '2026-07-18T08:15:00-07:00',
      message: 'Could not reach intervals.icu',
    },
  })`, context);

  assert.match(html, /class="sync-status-error"/);
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /Could not reach intervals\.icu/);
});

test('Settings renders a corrupt ambition as unknown instead of throwing', async () => {
  const html = await renderSettings('corrupt');
  const numericStringHtml = await renderSettings('1');

  assert.match(html, /quest-givers cannot read your ambition/i);
  assert.doesNotMatch(html, /background:var\(--gold\);color:var\(--bg\)/);
  assert.match(numericStringHtml, /quest-givers cannot read your ambition/i);
  assert.doesNotMatch(numericStringHtml, /The Vale asks for a steady push\./);
});

test('Settings keeps a healthy ambition selected with its description', async () => {
  const html = await renderSettings(1);

  assert.match(html, /style="margin:3px;background:var\(--gold\);color:var\(--bg\)"\s+onclick="G\.setAmbition\(1\)"/);
  assert.match(html, /The Vale asks for a steady push\./);
});

test('The Road renders a degraded distance without nonsense output', async () => {
  const rendered = await renderRoad('unknown', {
    ride: 'unknown',
    run: 'unknown',
    swim: 'unknown',
    walk: 'unknown',
  });

  assert.match(rendered.html, /distance unknown/i);
  assert.doesNotMatch(rendered.html, /unknown km|NaN|undefined/);
  assert.match(rendered.html, /run unknown.*walk unknown.*swim unknown.*ride unknown/);
  assert.equal(rendered.heroPosition.x, 58);
});

test('The Road positions a healthy distance between its bracketing landmarks', async () => {
  const rendered = await renderRoad(5, { ride: 0, run: 5, swim: 0, walk: 0 });

  assert.match(rendered.html, />5 km<\/b> from the Vale Gate/);
  assert.equal(rendered.heroPosition.x, 128);
  assert.equal(rendered.scrollLeft, 90);
});

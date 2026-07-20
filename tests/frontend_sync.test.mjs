import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { createHarness, root } from './frontend_harness.mjs';

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

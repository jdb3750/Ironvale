import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { createHarness, root } from './frontend_harness.mjs';

// Seam 13: the server now refuses a claim for an activity_id it can't find
// in the queue (a stale bubble left over after the overnight sweep already
// paid it, say) instead of silently paying a different deed. G.claimFennBubble
// removes the bubble from the DOM before it even knows whether the claim will
// succeed, so a bare refusal would strand the player: bubble gone, toast
// shown, and the real pending deed invisible until some unrelated refresh.
// These tests exercise the real static/js/town.js source (loaded into the
// harness the same way every other frontend test loads its subject file) so
// a regression in the real handler — not a reimplementation of it — is what
// makes them fail.

function loadTown(context) {
  vm.runInContext(readFileSync(new URL('static/js/town.js', root), 'utf8'), context);
}

function stateWithPending(pending) {
  return {
    unguided_pending: pending,
    writ_notices: [],
  };
}

test('a refused claim still refreshes state so a real pending bubble reappears', async () => {
  const { context } = createHarness();
  loadTown(context);

  const staleBubble = { activity_id: 'stale-activity', xp: 1, gold: 1, vigor: 1, title: 'stale deed', minutes: 10 };
  const realPending = { activity_id: 'real-activity', giver: 'endurance', xp: 5, gold: 5, vigor: 1, title: 'real deed', minutes: 20 };

  const calls = [];
  context.fetch = async (url, opts) => {
    calls.push({ url, body: opts && opts.body });
    if (calls.length === 1) {
      // The claim itself: the server refuses because the id is no longer
      // in the queue.
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: 'That deed already found its way home.' }),
      };
    }
    // The self-heal refresh: the server's real state, including a genuinely
    // pending deed the stale bubble had been hiding.
    return {
      ok: true,
      status: 200,
      json: async () => stateWithPending([realPending]),
    };
  };

  let ceremonyCalls = 0;
  vm.runInContext(`
    showCeremony = () => { globalThis.__ceremonyCalls = (globalThis.__ceremonyCalls || 0) + 1; };
    S.fennQueue = [${JSON.stringify(staleBubble)}];
  `, context);

  await vm.runInContext('G.claimFennBubble()', context);

  assert.equal(calls.length, 2, 'expected the claim call and a state-refresh call');
  assert.equal(calls[0].url, '/api/unguided/claim');
  assert.equal(calls[1].url, '/api/state');

  // Self-heal: the stale entry is gone and the real pending deed took its
  // place, because refreshState() ran despite the claim rejecting.
  assert.deepEqual(
    vm.runInContext('S.fennQueue', context),
    [realPending],
  );
  assert.equal(vm.runInContext('globalThis.__renders', context), 1, 're-render must run so the new bubble actually shows');
  ceremonyCalls = vm.runInContext('globalThis.__ceremonyCalls || 0', context);
  assert.equal(ceremonyCalls, 0, 'a refusal must never trigger the reward ceremony');
});

test('a successful claim still refreshes state and shows the ceremony', async () => {
  const { context } = createHarness();
  loadTown(context);

  const claimedBubble = { activity_id: 'claimed-activity', xp: 5, gold: 5, vigor: 1, title: 'claimed deed', minutes: 20 };
  const rewardPayload = { xp: 5, gold: 5, vigor: 1, quest_title: 'claimed deed' };

  const calls = [];
  context.fetch = async (url, opts) => {
    calls.push({ url, body: opts && opts.body });
    if (calls.length === 1) {
      return { ok: true, status: 200, json: async () => rewardPayload };
    }
    return { ok: true, status: 200, json: async () => stateWithPending([]) };
  };

  vm.runInContext(`
    globalThis.__ceremonyArgs = null;
    showCeremony = (rewards, title) => { globalThis.__ceremonyArgs = { rewards, title }; };
    S.fennQueue = [${JSON.stringify(claimedBubble)}];
  `, context);

  await vm.runInContext('G.claimFennBubble()', context);

  assert.equal(calls.length, 2);
  assert.deepEqual(vm.runInContext('S.fennQueue', context), []);
  assert.equal(vm.runInContext('globalThis.__renders', context), 1);
  const ceremonyArgs = vm.runInContext('globalThis.__ceremonyArgs', context);
  assert.ok(ceremonyArgs, 'a successful claim must still show the ceremony');
  assert.equal(ceremonyArgs.rewards.quest_title, 'claimed deed');
});

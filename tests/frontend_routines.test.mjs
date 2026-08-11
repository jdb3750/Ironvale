// Seam 10 — routine state has exactly one owner.
//
// Two things used to go wrong independently: forging a routine could persist
// a duplicate on retry (misc.js had a `finally` with no `catch`, so a failed
// step after the POST left the draft retryable but the retry re-minted a
// routine server-side), and the doctrine editor (giver.js) mutating routines
// never told the Council schedule editor (misc.js) its cached list was
// stale. Both symptoms shared one root: two editors owned the same
// programs/routines state with no shared owner or invalidation.
//
// The fix: app.js's `programsCache` is the one owner, read through
// `fetchPrograms()` and cleared through `invalidatePrograms()` by every
// mutation in either editor. Retry-safety for the create itself is a
// separate, deliberate piece: the frontend holds a `clientKey` for the life
// of a forge draft, and `programs.save_routine` (app/programs.py) returns the
// existing routine when it sees a repeated key instead of minting a new one.
//
// These tests exercise the real `G.saveCounselRoutine`, `G.rbSave`,
// `G.deleteRoutine` and `SCREENS.settings` — not stand-ins for them — against
// a small stateful double of `/api/programs` + `/api/routines` that mimics
// the server's client_key dedup, so a passing test means the real call sites
// actually behave this way, not merely that a helper returned something.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

import { createHarness, root } from './frontend_harness.mjs';

function loadRoutineEditors(context) {
  vm.runInContext(readFileSync(new URL('static/js/giver.js', root), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('static/js/misc.js', root), 'utf8'), context);
}

// A stateful double of the routine-related backend surface, including the
// server's client_key dedup (app/programs.py's save_routine) — so a retried
// POST with the same key is answered the way the real server answers it,
// rather than the test just asserting the client sent a key.
function createProgramsServer() {
  let routines = [];
  let nextId = 1;
  let failNextProgramsFetch = false;
  return {
    routineCount: () => routines.length,
    failNextProgramsFetch() { failNextProgramsFetch = true; },
    async api(path, opts = {}) {
      if (path === '/programs' && (!opts.method || opts.method === 'GET')) {
        if (failNextProgramsFetch) {
          failNextProgramsFetch = false;
          throw new Error('The ravens were lost before they finished their rounds.');
        }
        return { active: {}, programs: [], routines: routines.map(r => ({ ...r })) };
      }
      if (path === '/routines' && opts.method === 'POST') {
        // This stub stands in for api() itself (not for fetch()), so the
        // body arrives as the plain object the call sites pass — api()'s
        // own JSON.stringify never runs.
        const body = opts.body;
        const existing = body.client_key
          && routines.find(r => r.client_key === body.client_key);
        if (existing) return { routine: { ...existing } };
        const routine = {
          id: `r${nextId++}`,
          name: body.name,
          giver: body.giver,
          exercises: body.exercises,
          client_key: body.client_key || null,
        };
        routines.push(routine);
        return { routine: { ...routine } };
      }
      const del = /^\/routines\/(.+)$/.exec(path);
      if (del && opts.method === 'DELETE') {
        routines = routines.filter(r => r.id !== del[1]);
        return { ok: true };
      }
      throw new Error(`unstubbed api call: ${opts.method || 'GET'} ${path}`);
    },
  };
}

function installServer(context, server) {
  context.__server = server;
  vm.runInContext('api = (...args) => globalThis.__server.api(...args);', context);
}

function captureToasts(context) {
  vm.runInContext(`
    globalThis.__toasts = [];
    toast = (msg, err) => { globalThis.__toasts.push({ msg, err: !!err }); };
  `, context);
  return () => vm.runInContext('globalThis.__toasts', context);
}

function scheduleState() {
  return {
    counsel_schedule_options: {
      days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      modalities: [],
    },
    settings: { counsel_schedule: {} },
  };
}

function overlayStub() {
  return {
    getAttribute: () => null,
    isConnected: true,
    remove() {},
    removeAttribute() {},
    setAttribute() {},
  };
}

function saveButtonStub(overlay) {
  return {
    closest: () => overlay,
    disabled: false,
    isConnected: true,
    removeAttribute() {},
    setAttribute() {},
  };
}

// Directly seeds the module-level draft that G.openCounselRoutineBuilder
// would otherwise build via a modal — the modal machinery isn't what's
// under test here, the retry/ownership behaviour after it is.
function seedRoutineDraft(context, { clientKey, exercises }) {
  context.__draft = { clientKey, day: 'monday', exercises, index: 0, optional: false };
  vm.runInContext(`
    counselRoutineDraft = globalThis.__draft;
    counselRoutineSaving = false;
  `, context);
}

test('a forge whose /programs refresh fails, retried, produces exactly one routine', async () => {
  const { context, document } = createHarness();
  loadRoutineEditors(context);
  const server = createProgramsServer();
  installServer(context, server);
  const readToasts = captureToasts(context);
  const overlay = overlayStub();
  document.getElementById = id => ({
    'schedule-routine-name': { value: 'Sunrise Rows' },
    'schedule-routine-save': saveButtonStub(overlay),
  }[id] ?? null);
  context.__scheduleState = scheduleState();
  vm.runInContext('S.state = globalThis.__scheduleState;', context);
  seedRoutineDraft(context, {
    clientKey: 'draft-key-1',
    exercises: [{ exercise: 'Ring Row', reps: 8, sets: 3 }],
  });
  server.failNextProgramsFetch(); // the /programs refresh right after the POST fails once

  await vm.runInContext('G.saveCounselRoutine()', context);

  // The POST that ran before the failure created the routine server-side.
  assert.equal(server.routineCount(), 1, 'the POST that succeeded before the failure created exactly one routine');
  const firstToasts = readToasts();
  assert.ok(
    firstToasts.some(t => /weekly slot was not written/.test(t.msg)),
    'the player is told the forge is incomplete, not left to assume it failed entirely',
  );
  assert.ok(
    !firstToasts.some(t => /forged into the weekly plan/.test(t.msg)),
    'no false success message when the slot write never happened',
  );
  assert.notEqual(
    vm.runInContext('counselRoutineDraft', context),
    null,
    'the draft stays open so the player can retry',
  );

  // Retry the same draft (same clientKey) now that /programs will succeed.
  await vm.runInContext('G.saveCounselRoutine()', context);

  assert.equal(server.routineCount(), 1, 'retrying the same draft must not create a second routine — this is the duplicate-routine defect, fixed');
  const toastsAfterRetry = readToasts();
  assert.ok(
    toastsAfterRetry.some(t => /forged into the weekly plan/.test(t.msg)),
    'the retry, once it goes through, tells the player it succeeded',
  );
  assert.equal(vm.runInContext('counselRoutineDraft', context), null, 'the draft closes once the retry completes');
  assert.equal(
    vm.runInContext('counselScheduleDraft.monday[0].routine', context),
    'custom:r1',
    'the weekly slot ends up pointing at the one routine that exists',
  );
});

test('a forge whose slot write fails does not leave a routine the player cannot see', async () => {
  const { context, document } = createHarness();
  loadRoutineEditors(context);
  const server = createProgramsServer();
  installServer(context, server);
  const readToasts = captureToasts(context);
  const overlay = overlayStub();
  document.getElementById = id => ({
    'schedule-routine-name': { value: 'Sunrise Rows' },
    'schedule-routine-save': saveButtonStub(overlay),
  }[id] ?? null);
  context.__scheduleState = scheduleState();
  vm.runInContext('S.state = globalThis.__scheduleState;', context);
  seedRoutineDraft(context, {
    clientKey: 'draft-key-1',
    exercises: [{ exercise: 'Ring Row', reps: 8, sets: 3 }],
  });
  // The routine POST and the /programs refresh both succeed; only the local
  // write into the schedule draft fails, simulating the second failure mode
  // the brief calls out by name.
  vm.runInContext("counselScheduleWriteSlot = () => { throw new Error('simulated slot-write failure'); };", context);

  await vm.runInContext('G.saveCounselRoutine()', context);

  assert.equal(server.routineCount(), 1, 'the routine was created server-side despite the slot write failing');
  assert.ok(
    readToasts().some(t => /weekly slot was not written/.test(t.msg)),
    'the player is told the slot was not written',
  );
  const findableAfterFailure = vm.runInContext("counselScheduleChooserStepHTML({ step: 'strength' }, {})", context);
  assert.match(
    findableAfterFailure,
    /Sunrise Rows/,
    'the routine is visible elsewhere (e.g. the chooser) even though the forge did not finish — it is not silently lost',
  );
});

test('an ordinary forge (no failures) succeeds once and writes the schedule slot', async () => {
  const { context, document } = createHarness();
  loadRoutineEditors(context);
  const server = createProgramsServer();
  installServer(context, server);
  const readToasts = captureToasts(context);
  const overlay = overlayStub();
  document.getElementById = id => ({
    'schedule-routine-name': { value: 'Evening Circuit' },
    'schedule-routine-save': saveButtonStub(overlay),
  }[id] ?? null);
  context.__scheduleState = scheduleState();
  vm.runInContext('S.state = globalThis.__scheduleState;', context);
  seedRoutineDraft(context, {
    clientKey: 'draft-key-2',
    exercises: [{ exercise: 'Goblet Squat', reps: 10, sets: 3 }],
  });

  await vm.runInContext('G.saveCounselRoutine()', context);

  assert.equal(server.routineCount(), 1);
  assert.ok(readToasts().some(t => /forged into the weekly plan/.test(t.msg)));
  assert.equal(vm.runInContext('counselRoutineDraft', context), null);
  assert.equal(
    vm.runInContext('counselScheduleDraft.monday[0].routine', context),
    'custom:r1',
  );
});

test('a routine created in the doctrine editor becomes visible in Settings, and a deleted one stops being offered there', async () => {
  const { context, document } = createHarness();
  loadRoutineEditors(context);
  const server = createProgramsServer();
  installServer(context, server);
  vm.runInContext('confirmModal = async () => true;', context);

  const settingsState = {
    ambition_levels: [{ desc: 'A quiet vale.', name: 'Quiet' }],
    character: { name: 'Tester' },
    settings: {
      ambition: 0,
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
  const appRoot = { classList: { add() {}, remove() {} }, innerHTML: '', removeAttribute() {}, style: {} };
  document.getElementById = id => ({
    app: appRoot,
    'rb-name': { value: 'Push Day' },
  }[id] ?? null);
  context.__settingsState = settingsState;
  vm.runInContext(`
    S.state = globalThis.__settingsState;
    counselScheduleEditorHTML = () => '';
    shell = html => html;
  `, context);

  // Create the routine the way the doctrine editor (SCREENS.doctrines) does.
  vm.runInContext('RB.exercises = [{ exercise: "Pull-Up", reps: 6, sets: 4 }];', context);
  await vm.runInContext("G.rbSave('strength')", context);
  assert.equal(server.routineCount(), 1, 'creating under the doctrine editor persisted it');

  // "Opening Settings" — the real SCREENS.settings, which fetches through
  // the same shared cache the doctrine editor just invalidated.
  await vm.runInContext('SCREENS.settings()', context);
  const withRoutine = vm.runInContext("counselScheduleChooserStepHTML({ step: 'strength' }, {})", context);
  assert.match(withRoutine, /Push Day/, 'Settings shows the routine that was just created in the doctrine editor');

  // Burn it from the doctrine editor, then reopen Settings.
  await vm.runInContext("G.deleteRoutine('r1', 'strength')", context);
  assert.equal(server.routineCount(), 0, 'the doctrine editor deleted it');
  await vm.runInContext('SCREENS.settings()', context);
  const afterDelete = vm.runInContext("counselScheduleChooserStepHTML({ step: 'strength' }, {})", context);
  assert.doesNotMatch(afterDelete, /Push Day/, 'the deleted routine is no longer offered in Settings');
});

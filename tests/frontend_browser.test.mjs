import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

/* Two rules this file has been bitten by; keep them:
   1. EVERY test must stand alone. All tests share one scratch server and one
      DATA_DIR, so it is easy to lean on state an earlier test left behind —
      and then a subset run (--test-name-pattern) lies about what passes.
      Induce the state you assert on. Verify with:
        node --test --test-name-pattern="<one test>" tests/frontend_browser.test.mjs
   2. innerText vs textContent: innerText returns '' for an element that is not
      rendered or is display:none (collapsed, inactive tab). Use innerText when the
      claim really is "the user sees this" AND you have scrolled/opened it
      first; use textContent when you only mean "the element says this". */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER_PORT = Number(process.env.IRON_VALE_BROWSER_PORT || 8322);
const BASE_URL = `http://127.0.0.1:${BROWSER_PORT}`;
const EVIDENCE_DIR = process.env.IRON_VALE_VISUAL_QA_DIR;

let browser;
let dataDir;
let server;
let serverOutput = '';
let giverProfileSequence = 0;

const GIVER_BOARD_CASES = [
  {
    giver: 'running',
    stateName: 'fenn-running',
    identity: 'Old Fenn the Wayfarer',
    portrait: 'fenn',
    selfTiers: ['easy', 'steady', 'quality'],
    warnedTier: 'quality',
  },
  {
    giver: 'kettlebell',
    stateName: 'grunhilda-kettlebell',
    identity: 'Grunhilda Iron-Bell',
    portrait: 'grunhilda',
    selfTiers: ['volume', 'circuit', 'strength'],
    warnedTier: 'strength',
  },
  {
    giver: 'strength',
    stateName: 'ser-bram-strength',
    identity: 'Ser Bram the Unburdened',
    portrait: 'bram',
    selfTiers: ['technique', 'volume', 'limit-session'],
    warnedTier: 'limit-session',
  },
  {
    giver: 'mobility',
    stateName: 'elowen-mobility',
    identity: 'Sage Elowen of the Willow',
    portrait: 'elowen',
    selfTiers: ['restore', 'move', 'unwind'],
    warnedTier: null,
  },
];

const GIVER_VIEWPORTS = {
  phone: { width: 375, height: 812 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 900 },
};

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Scratch Iron Vale server exited early.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/api/profiles`);
      if (response.ok) return;
    } catch {
      // Uvicorn has not bound the port yet.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(
    `Scratch Iron Vale server did not start within 15 seconds.\n${serverOutput}`,
  );
}

async function openMainProfile(viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(`page error: ${error.message}`));
  page.on('requestfailed', request => {
    failures.push(`request failed: ${request.method()} ${request.url()}`);
  });
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: /Play as Adventurer/ }).click();
  await page.locator('.town-scene').waitFor();
  return { context, failures, page };
}

async function createGiverProfile(page, mode) {
  giverProfileSequence += 1;
  await page.evaluate(async ({ name, mode: counselMode }) => {
    await api('/profiles', {
      method: 'POST',
      body: { name, pin: '1234' },
    });
    await api('/settings', {
      method: 'POST',
      body: { timezone: 'UTC', counsel_mode: counselMode },
    });
    await refreshState();
  }, {
    name: `Giver Browser ${giverProfileSequence}`,
    mode,
  });
}

async function seedNudgeProfile(page, mode, activityId, daysAgo = 3) {
  await createGiverProfile(page, mode);
  const slug = await page.evaluate(async () => (await api('/profiles')).current);
  const start = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 19);
  const seed = spawnSync(
    path.join(ROOT, '.venv/bin/python'),
    ['-c', `
import sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
connection.execute(
    "INSERT INTO activities (id, source, start, type, name, moving_time) VALUES (?,?,?,?,?,?)",
    (sys.argv[2], "intervals.icu", sys.argv[3], "Run", "Road run", 1800),
)
connection.commit()
connection.close()
`, path.join(dataDir, `${slug}.db`), activityId, start],
    { encoding: 'utf8' },
  );
  assert.equal(seed.status, 0, `Nudge practice seed failed: ${seed.stderr || seed.stdout}`);
  await page.evaluate(async () => {
    await api('/settings', {
      method: 'POST',
      body: {
        counsel_nudge_enabled: true,
        counsel_charter: { primary: 'run', secondary: [] },
      },
    });
  });
  return slug;
}

async function installNudgeStorageFault(context, mode) {
  await context.addInitScript(storageMode => {
    const storage = window.localStorage;
    if (storageMode === 'null') {
      Storage.prototype.setItem.call(storage, 'iv_nudge', 'null');
    } else if (storageMode === 'invalid-json') {
      Storage.prototype.setItem.call(storage, 'iv_nudge', '{not-json');
    }
    const proxy = new Proxy(storage, {
      get(target, property) {
        if (property === 'iv_nudge' && storageMode === 'getter-throw') {
          throw new DOMException('Storage read denied', 'SecurityError');
        }
        if (property === 'getItem') {
          return key => {
            if (key === 'iv_nudge' && storageMode === 'getter-throw') {
              throw new DOMException('Storage read denied', 'SecurityError');
            }
            return Storage.prototype.getItem.call(target, key);
          };
        }
        if (property === 'setItem') {
          return (key, value) => {
            if (key === 'iv_nudge' && storageMode === 'setter-throw') {
              throw new DOMException('Storage write denied', 'QuotaExceededError');
            }
            return Storage.prototype.setItem.call(target, key, value);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
      set(target, property, value) {
        if (property === 'iv_nudge' && storageMode === 'setter-throw') {
          throw new DOMException('Storage write denied', 'QuotaExceededError');
        }
        Storage.prototype.setItem.call(target, String(property), String(value));
        return true;
      },
    });
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: proxy,
    });
  }, mode);
}

async function setCounselMode(page, mode) {
  await page.evaluate(async counselMode => {
    await api('/settings', {
      method: 'POST',
      body: { counsel_mode: counselMode },
    });
    await refreshState();
  }, mode);
}

async function openGiverBoard(page, giver) {
  await page.evaluate(async giverKey => {
    if (S.screen === 'giver' && S.params.giver === giverKey) {
      await render();
      return;
    }
    nav('giver', { giver: giverKey });
  }, giver);
  await page.waitForFunction(giverKey => (
    document.querySelector('.giver-offer-board')?.dataset.giver === giverKey
    || /Your Sworn (Quest|Writ)/.test(document.querySelector('.win-title')?.textContent || '')
  ), giver);
  await page.locator('.npc-head').waitFor();
  await page.waitForFunction(() => {
    const canvases = [
      ...document.querySelectorAll('.hdr canvas[data-hero], .hdr canvas[data-monster], .hdr canvas[data-boss]'),
    ];
    return canvases.length > 0 && canvases.every(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels.some((channel, index) => index % 4 === 3 && channel > 0);
    });
  });
}

async function readGiverResponsiveState(page) {
  return page.evaluate(() => {
    const wins = [...document.querySelectorAll('#app > .win')];
    const dialogue = document.querySelector('.npc-head')?.closest('.win') || null;
    const panel = wins.find(element => element !== dialogue) || null;
    const details = panel
      ? [...panel.querySelectorAll('.phone-disclosure.offer-lore')]
      : [];
    return {
      order: wins.map(element => element === dialogue ? 'dialogue' : element === panel ? 'panel' : 'other'),
      dialogueCount: document.querySelectorAll('.npc-head').length,
      panelCount: panel ? 1 : 0,
      detailsOpen: details.map(detail => detail.open),
      activeTitle: panel?.querySelector('.win-title')?.textContent || '',
    };
  });
}

async function waitForGiverResponsiveState(page, phone) {
  await page.waitForFunction(expectedPhone => {
    const wins = [...document.querySelectorAll('#app > .win')];
    const dialogue = document.querySelector('.npc-head')?.closest('.win') || null;
    const panel = wins.find(element => element !== dialogue) || null;
    if (!dialogue || !panel || wins.length !== 2) return false;
    const expectedOrder = expectedPhone ? [panel, dialogue] : [dialogue, panel];
    if (wins[0] !== expectedOrder[0] || wins[1] !== expectedOrder[1]) return false;
    return [...panel.querySelectorAll('.phone-disclosure.offer-lore')]
      .every(detail => detail.open === !expectedPhone);
  }, phone);
}

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'iron-vale-browser-'));
  if (EVIDENCE_DIR) await mkdir(EVIDENCE_DIR, { recursive: true });
  server = spawn(
    path.join(ROOT, '.venv/bin/uvicorn'),
    ['app.main:app', '--host', '127.0.0.1', '--port', String(BROWSER_PORT)],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        DATA_DIR: dataDir,
        // Nothing listens on port 9, so a linked sync fails fast and offline.
        INTERVALS_BASE_URL: 'http://127.0.0.1:9/api/v1',
        SYNC_INTERVAL_SECONDS: '86400',
      },
      stdio: 'pipe',
    },
  );
  server.stdout.on('data', chunk => {
    serverOutput += chunk;
  });
  server.stderr.on('data', chunk => {
    serverOutput += chunk;
  });
  await waitForServer();
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
});

test('phone Scrivener blocks incomplete deeds without a request or overflow', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await page.evaluate(() => nav('scrivener'));
    await page.locator('.deed-form').waitFor();
    let claimRequests = 0;
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/api/claim')) {
        claimRequests += 1;
      }
    });
    await page.getByRole('button', { name: 'SWEAR IT ON THE LEDGER' }).click();
    await page.locator('.toast.err').waitFor();
    assert.equal(claimRequests, 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('profile creation, logout, PIN selection, and town return work end to end', async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: /Play as Adventurer/ }).click();
  await page.locator('.town-scene').waitFor();
  await page.evaluate(() => nav('settings'));
  await page.getByRole('button', { name: 'SWITCH ADVENTURER' }).click();
  await page.getByRole('button', { name: 'Create a new adventurer' }).click();
  await page.locator('#np-name').fill('Browser Ranger');
  await page.locator('#np-pin').fill('2468');
  await page.getByRole('button', { name: 'BEGIN THE LEGEND' }).click();
  await page.locator('.town-scene').waitFor();
  await page.evaluate(() => nav('settings'));
  await page.getByRole('button', { name: 'SWITCH ADVENTURER' }).click();
  await page.getByRole('button', { name: 'Play as Browser Ranger' }).click();
  await page.locator('#pin-browser-ranger').fill('2468');
  await page.getByRole('button', { name: 'ENTER' }).click();
  await page.locator('.town-scene').waitFor();
  assert.match(await page.locator('.hdr-char').innerText(), /Browser Ranger/);
  await context.close();
});

test('a failed raven flight becomes a persistent visible status', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1024, height: 768 });
  try {
    // A linked profile whose flight dies on the wire (INTERVALS_BASE_URL
    // points at a dead port) must surface a persistent, credential-free status.
    await page.evaluate(() => api('/settings', {
      method: 'POST',
      body: { intervals_athlete_id: 'i-browser', intervals_api_key: 'raven-test-key' },
    }));
    await page.getByRole('button', { name: 'SEND RAVENS' }).click();
    const status = page.locator('.sync-status-error').first();
    await status.waitFor();
    assert.match(await status.innerText(), /ravens delayed since/i);
    assert.equal((await status.innerText()).includes('raven-test-key'), false);
    await page.evaluate(() => nav('settings'));
    await page.getByRole('tab', { name: 'APIS' }).click();
    await page.locator('.sync-status-panel .sync-status-error').waitFor();
    if (EVIDENCE_DIR) {
      await page.locator('.toast').waitFor({ state: 'detached' });
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'sync-settings-desktop.png'),
        fullPage: true,
      });
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('phone Settings keeps the persistent raven status within the viewport', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    // Induce the failed flight here rather than inheriting it from the test
    // above: each test must stand on its own, or running a subset lies.
    await page.evaluate(async () => {
      await api('/settings', {
        method: 'POST',
        body: { intervals_athlete_id: 'i-browser', intervals_api_key: 'raven-test-key' },
      });
      try {
        await api('/sync', { method: 'POST' });
      } catch (error) {
        // The dead-port flight is expected to fail; the status is the subject.
      }
      await refreshState();
    });
    await page.evaluate(() => nav('settings'));
    await page.getByRole('tab', { name: 'APIS' }).click();
    await page.locator('.sync-status-panel .sync-status-error').waitFor();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );
    if (EVIDENCE_DIR) {
      await page.locator('.sync-status-panel').scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'sync-settings-phone.png'),
      });
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Settings retains an optional focus charter across the two Phase 1 loops', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await page.evaluate(async () => {
      await api('/settings', {
        method: 'POST',
        body: { intervals_athlete_id: 'i-settings', intervals_api_key: 'masked-raven-key' },
      });
      await refreshState();
    });
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();
    const settingsTabs = page.getByRole('tab');
    assert.deepEqual(
      await settingsTabs.allTextContents(),
      ['GAME', 'APIS', 'DEV'],
    );
    assert.deepEqual(
      await page.locator('[data-settings-section]').evaluateAll(sections => sections.map(section => section.dataset.settingsSection)),
      ['game'],
    );
    assert.equal(await page.getByRole('tab', { name: 'GAME' }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByText('Primary focus', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Secondary focuses (optional)', { exact: true }).count(), 1);
    assert.equal(await page.locator('#counsel-focus').isDisabled(), false);
    assert.deepEqual(
      (await page.locator('.settings-surface .counsel-label').allTextContents())
        .map(text => text.trim().toUpperCase()),
      ['TIMEZONE', 'AMBITION', 'GAME LOOP STYLE', 'PRIMARY FOCUS', 'SECONDARY FOCUSES (OPTIONAL)'],
    );
    assert.deepEqual(
      await page.locator('.settings-surface .formrow > label, .settings-surface .counsel-label, .settings-surface legend')
        .evaluateAll(elements => [...new Set(elements.map(element => getComputedStyle(element).color))]),
      ['rgb(106, 160, 200)'],
    );
    assert.equal(
      await page.getByRole('tab', { name: 'GAME' }).evaluate(
        element => getComputedStyle(element).backgroundColor,
      ),
      'rgb(201, 162, 75)',
    );
    assert.deepEqual(
      await page.locator('#counsel-focus').evaluate(element => ({
        borderLeftColor: getComputedStyle(element).borderLeftColor,
        borderLeftWidth: getComputedStyle(element).borderLeftWidth,
        borderTopWidth: getComputedStyle(element).borderTopWidth,
      })),
      {
        borderLeftColor: 'rgb(106, 160, 200)',
        borderLeftWidth: '3px',
        borderTopWidth: '0px',
      },
    );
    assert.equal(
      await page.locator('[data-settings-sound]').evaluate(element => getComputedStyle(element).color),
      'rgb(122, 181, 92)',
    );
    const toggleColors = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.style.cssText = 'background:var(--panel2);color:var(--ink);border-color:var(--green)';
      document.body.append(probe);
      const style = getComputedStyle(probe);
      const colors = {
        green: style.borderTopColor,
        ink: style.color,
        panel2: style.backgroundColor,
      };
      probe.remove();
      return colors;
    });
    const toggleStyle = locator => locator.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
      };
    });
    const pointerOff = page.getByRole('button', { name: 'DAILY POINTER: OFF', exact: true });
    const toggleOffStyle = await toggleStyle(pointerOff);
    assert.equal(toggleOffStyle.backgroundColor, toggleColors.panel2);
    assert.equal(toggleOffStyle.color, toggleColors.ink);
    const soundOn = page.getByRole('button', { name: 'SOUND: ON', exact: true });
    await soundOn.click();
    const soundOff = page.getByRole('button', { name: 'SOUND: OFF', exact: true });
    await page.mouse.move(0, 0);
    assert.deepEqual(await toggleStyle(soundOff), toggleOffStyle);
    assert.deepEqual(
      await page.locator('[data-sound-btn]').evaluateAll(buttons => buttons.map(button => ({
        green: button.classList.contains('green'),
        toggle: button.classList.contains('toggle'),
      }))),
      [
        { green: false, toggle: true },
        { green: false, toggle: true },
      ],
    );
    assert.equal(await page.locator('.toast').count(), 0);
    await pointerOff.click();
    const pointerOn = page.getByRole('button', { name: 'DAILY POINTER: ON', exact: true });
    await pointerOn.waitFor();
    const toggleOnStyle = await toggleStyle(pointerOn);
    assert.equal(toggleOnStyle.color, toggleColors.green);

    await page.getByRole('tab', { name: 'APIS' }).click();
    await page.locator('#settings-apis').waitFor();
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'settings-tab-apis',
    );
    assert.match(
      await page.locator('#settings-panel-apis').innerText(),
      /intervals\.icu → Settings → Developer\./,
    );
    assert.equal(
      await page.locator('.counsel-path').evaluate(element => getComputedStyle(element).whiteSpace),
      'nowrap',
    );
    assert.deepEqual(
      await page.locator('.settings-helper').evaluate(element => ({
        borderLeftWidth: getComputedStyle(element).borderLeftWidth,
        color: getComputedStyle(element).color,
      })),
      { borderLeftWidth: '0px', color: 'rgb(149, 140, 168)' },
    );
    assert.deepEqual(
      await page.locator('[data-settings-section]').evaluateAll(sections => sections.map(section => section.dataset.settingsSection)),
      ['apis'],
    );
    assert.equal(await page.locator('#set-key').getAttribute('type'), 'password');
    assert.equal(await page.locator('#set-key').inputValue(), '');
    assert.equal(await page.locator('#set-key').getAttribute('placeholder'), '••••••••');
    assert.equal(
      await page.locator('.sync-status-panel').evaluate(
        element => getComputedStyle(element).textWrap,
      ),
      'balance',
    );

    await page.getByRole('tab', { name: 'DEV' }).click();
    await page.locator('#settings-dev').waitFor();
    assert.deepEqual(
      await page.locator('[data-settings-section]').evaluateAll(sections => sections.map(section => section.dataset.settingsSection)),
      ['dev'],
    );

    await page.getByRole('tab', { name: 'GAME' }).click();
    await page.locator('#settings-game').waitFor();

    await page.locator('#set-counsel-primary').locator('..').locator('summary').click();
    await page.getByRole('menuitemradio', { name: 'Run' }).click();
    assert.equal(await page.locator('[data-counsel-secondary="run"]').isHidden(), true);
    assert.equal(await page.locator('[data-counsel-secondary]:visible').count(), 4);
    assert.equal(await page.locator('[data-counsel-secondary="strength"]').getAttribute('aria-pressed'), 'false');
    assert.equal(
      await page.locator('[data-counsel-secondary="strength"]').evaluate(
        element => element.classList.contains('active'),
      ),
      false,
    );
    assert.deepEqual(
      await toggleStyle(page.locator('[data-counsel-secondary="strength"]')),
      toggleOffStyle,
    );
    assert.equal(
      await page.locator('.counsel-focus-choices').evaluate(
        element => getComputedStyle(element).justifyContent,
      ),
      'center',
    );
    await page.getByRole('button', { name: 'Strength' }).click();
    assert.deepEqual(
      await toggleStyle(page.locator('[data-counsel-secondary="strength"]')),
      toggleOnStyle,
    );
    const settingsBeforeSave = await page.locator('#settings-game').elementHandle();
    await page.getByRole('button', { name: 'SAVE FOCUS' }).click();
    await page.getByText('Focus charter saved.', { exact: true }).waitFor();
    await page.waitForFunction(previous => !previous.isConnected, settingsBeforeSave);
    await page.locator('#settings-game').waitFor();

    await page.locator('#set-counsel-mode').locator('..').locator('summary').click();
    await page.getByRole('menuitemradio', { name: 'Choose-your-own' }).click();
    await page.locator('#counsel-focus[disabled]').waitFor();
    assert.equal(await page.locator('#counsel-focus').getAttribute('disabled'), '');
    assert.equal(await page.locator('[data-counsel-secondary="run"]').isDisabled(), true);
    const primarySummary = page.locator('#set-counsel-primary').locator('..').locator('summary');
    assert.equal(await primarySummary.getAttribute('aria-disabled'), 'true');
    assert.equal(await primarySummary.getAttribute('tabindex'), '-1');
    assert.equal(
      await page.locator('#counsel-focus').evaluate(element => getComputedStyle(element).opacity),
      '1',
    );
    assert.equal(
      await page.getByText('Secondary focuses (optional)', { exact: true }).evaluate(
        element => getComputedStyle(element).opacity,
      ),
      '1',
    );
    assert.ok(
      Number(await page.locator('[data-counsel-secondary="run"]').evaluate(
        element => getComputedStyle(element).opacity,
      )) >= 0.6,
    );
    assert.equal(
      await page.locator('#counsel-focus-hint').evaluate(element => getComputedStyle(element).color),
      'rgb(149, 140, 168)',
    );
    assert.match(await page.locator('#counsel-focus-hint').innerText(), /choosing freely; focus guides the counsel/i);
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_charter),
      { primary: 'run', secondary: ['strength'] },
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('giver characterization preserves identity, active continuation, and refusal toast behavior', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    let acceptPayload = null;
    let acceptStatus = null;
    page.on('request', request => {
      if (request.method() === 'POST' && request.url().endsWith('/api/quests/accept')) {
        acceptPayload = request.postDataJSON();
      }
    });
    page.on('response', response => {
      if (response.request().method() === 'POST' && response.url().endsWith('/api/quests/accept')) {
        acceptStatus = response.status();
      }
    });

    await openGiverBoard(page, 'running');
    assert.match(await page.locator('.npc-name').innerText(), /Old Fenn the Wayfarer/);
    assert.equal(await page.locator('[data-portrait="fenn"]').count(), 1);
    assert.match(
      await page.locator('[data-portrait="fenn"]').getAttribute('src'),
      /old_fenn_portrait\.png$/,
    );
    assert.equal(await page.locator('.offer').count(), 1);

    await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).click();
    await page.getByText('Your Sworn Quest', { exact: true }).waitFor();
    assert.equal(acceptStatus, 200);
    assert.deepEqual(Object.keys(acceptPayload).sort(), ['giver', 'offer_id']);
    assert.equal(acceptPayload.giver, 'running');
    assert.equal(Number.isInteger(acceptPayload.offer_id), true);
    assert.equal(await page.evaluate(() => S.params.react), 'accept');
    assert.match(await page.locator('.npc-name').innerText(), /Old Fenn the Wayfarer/);
    assert.equal(await page.locator('[data-portrait="fenn"]').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).count(), 0);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.filter(quest => quest.giver === 'running').length;
      }),
      1,
    );
    assert.equal(await page.locator('.toast.err').count(), 0);

    await page.evaluate(async () => {
      try {
        await api('/quests/accept', {
          method: 'POST',
          body: { giver: 'running', offer_id: -1 },
        });
      } catch {
        // The shared api() helper owns the visible refusal toast.
      }
    });
    const refusal = page.locator('.toast.err');
    await refusal.waitFor();
    assert.match(await refusal.innerText(), /already carry a quest/i);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.filter(quest => quest.giver === 'running').length;
      }),
      1,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('giver counsel boards render deterministic one-or-three paths across responsive viewports', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  const matrix = [];
  try {
    await createGiverProfile(page, 'considered');
    for (const mode of ['considered', 'self']) {
      await setCounselMode(page, mode);
      for (const giverCase of GIVER_BOARD_CASES) {
        for (const [viewportName, viewport] of Object.entries(GIVER_VIEWPORTS)) {
          await page.setViewportSize(viewport);
          await openGiverBoard(page, giverCase.giver);

          const board = page.locator('.giver-offer-board');
          assert.equal(await board.count(), 1);
          assert.equal(await board.getAttribute('data-counsel-mode'), mode);
          assert.match(await page.locator('.npc-name').innerText(), new RegExp(giverCase.identity));
          assert.equal(
            await page.locator(`[data-portrait="${giverCase.portrait}"]`).count(),
            1,
          );

          const expectedCount = mode === 'considered' ? 1 : giverCase.selfTiers.length;
          const cards = page.locator('.counsel-path-card');
          assert.equal(await cards.count(), expectedCount);
          const tiers = (await page.locator('.counsel-tier-label').allTextContents())
            .map(value => value.trim().toLowerCase());
          if (mode === 'self') assert.deepEqual(tiers, giverCase.selfTiers);
          else assert.equal(tiers.length, 1);

          const firstOrder = await cards.evaluateAll(elements => (
            elements.map(element => element.dataset.offerId)
          ));
          await openGiverBoard(page, giverCase.giver);
          assert.deepEqual(
            await page.locator('.counsel-path-card').evaluateAll(elements => (
              elements.map(element => element.dataset.offerId)
            )),
            firstOrder,
          );

          const details = page.locator('.counsel-detail');
          assert.equal(await details.count(), expectedCount);
          assert.deepEqual(
            await details.evaluateAll(elements => elements.map(element => element.open)),
            Array(expectedCount).fill(viewportName !== 'phone'),
          );
          assert.equal(
            await page.locator('.counsel-detail > summary').evaluateAll(elements => (
              elements.every(element => /why this path/i.test(element.textContent))
            )),
            true,
          );
          assert.equal(
            await page.locator('.counsel-source').evaluateAll(elements => (
              elements.every((element) => {
                const provider = element.querySelector('span')?.textContent
                  ?.split(':', 2)[1]?.trim();
                return Boolean(provider && provider !== 'not recorded');
              })
            )),
            true,
          );
          assert.deepEqual(
            await page.locator('.giver-counsel-block').first().evaluate(element => ({
              borderLeftColor: getComputedStyle(element).borderLeftColor,
              borderLeftWidth: getComputedStyle(element).borderLeftWidth,
              borderTopWidth: getComputedStyle(element).borderTopWidth,
            })),
            {
              borderLeftColor: 'rgb(106, 160, 200)',
              borderLeftWidth: '3px',
              borderTopWidth: '0px',
            },
          );

          const warningTiers = (await page.locator(
            '.counsel-path-card.has-wellness-warning .counsel-tier-label',
          ).allTextContents()).map(value => value.trim().toLowerCase());
          assert.deepEqual(
            warningTiers,
            mode === 'self' && giverCase.warnedTier ? [giverCase.warnedTier] : [],
          );
          assert.equal(await page.locator('[onclick*="reroll"]').count(), 0);
          assert.equal(await page.getByText(/ask for different work/i).count(), 0);
          assert.equal(
            await page.locator('.giver-accept-row').evaluateAll(elements => (
              elements.every(element => getComputedStyle(element).justifyContent === 'center')
            )),
            true,
          );
          assert.equal(
            await page.locator('.giver-accept-row .btn').evaluateAll(elements => (
              elements.every(element => element.getBoundingClientRect().height >= 44)
            )),
            true,
          );
          assert.equal(
            await page.locator('.counsel-path-card').evaluateAll(elements => (
              elements.every(element => {
                const action = element.querySelector('.giver-accept-row');
                const disclosure = element.querySelector('.counsel-detail');
                return Boolean(
                  action
                  && disclosure
                  && (action.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING),
                );
              })
            )),
            true,
          );
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            true,
          );

          const state = `${mode}-${giverCase.stateName}`;
          const screenshotPath = EVIDENCE_DIR
            ? path.join(EVIDENCE_DIR, `${state}__${viewportName}.png`)
            : null;
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForFunction(() => window.scrollY === 0);
          if (screenshotPath) await page.screenshot({ path: screenshotPath });
          matrix.push({
            state,
            mode,
            giver: giverCase.giver,
            giverIdentity: giverCase.identity,
            portrait: giverCase.portrait,
            viewport: { name: viewportName, ...viewport },
            screenshot: screenshotPath,
            scrollY: await page.evaluate(() => window.scrollY),
            offerCount: expectedCount,
            tierLabels: tiers,
            detailsOpen: viewportName !== 'phone',
            warningTiers,
            rerollCount: 0,
            horizontalOverflow: false,
            acceptTargetsAtLeast44px: true,
          });
        }
      }
    }
    assert.equal(matrix.length, 24);
    await page.setViewportSize(GIVER_VIEWPORTS.phone);
    await openGiverBoard(page, 'running');
    const hardWarningCard = page.locator('.counsel-path-card.has-wellness-warning');
    await hardWarningCard.scrollIntoViewIfNeeded();
    assert.equal(
      (await hardWarningCard.locator('.counsel-tier-label').innerText()).toLowerCase(),
      'quality',
    );
    assert.match(
      await hardWarningCard.locator('.counsel-eligibility.warn').innerText(),
      /remains yours to choose/i,
    );
    assert.equal(await hardWarningCard.getByRole('button', { name: 'ACCEPT QUEST' }).isEnabled(), true);
    const hardWarningScreenshot = EVIDENCE_DIR
      ? path.join(EVIDENCE_DIR, 'self-hard-warning-phone.png')
      : null;
    if (hardWarningScreenshot) await page.screenshot({ path: hardWarningScreenshot });
    if (EVIDENCE_DIR) {
      await writeFile(
        path.join(EVIDENCE_DIR, 'giver-matrix-observables.json'),
        `${JSON.stringify({
          capturedAt: new Date().toISOString(),
          baseUrl: BASE_URL,
          dataDir,
          node: process.version,
          matrix,
          hardWarning: {
            state: 'self-fenn-running-quality',
            selectable: true,
            warningVisible: true,
            screenshot: hardWarningScreenshot,
          },
        }, null, 2)}\n`,
      );
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('counsel hard warning and HARD chip meet WCAG AA contrast at all target viewports', async () => {
  const { context, failures, page } = await openMainProfile(
    { width: 375, height: 812 },
    { reducedMotion: 'reduce' },
  );
  const viewports = [
    ['phone', { width: 375, height: 812 }],
    ['tablet', { width: 768, height: 1024 }],
    ['desktop', { width: 1440, height: 900 }],
  ];
  const phase = process.env.IRON_VALE_CONTRAST_PHASE || 'green';
  const observations = [];
  const parseRgb = value => {
    const channels = value.match(/rgba?\(([^)]+)\)/i)?.[1]
      ?.split(',')
      .slice(0, 3)
      .map(channel => Number.parseFloat(channel.trim()));
    assert.ok(channels?.length === 3 && channels.every(Number.isFinite), `Unexpected color: ${value}`);
    return channels;
  };
  const luminance = channels => channels
    .map(channel => channel / 255)
    .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const contrastRatio = (foreground, background) => {
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  };
  try {
    await createGiverProfile(page, 'self');
    for (const [viewportName, viewport] of viewports) {
      await page.setViewportSize(viewport);
      await openGiverBoard(page, 'running');
      const hardWarningCard = page.locator('.counsel-path-card.has-wellness-warning');
      await hardWarningCard.waitFor();
      await hardWarningCard.scrollIntoViewIfNeeded();
      const capture = await hardWarningCard.evaluate((card) => {
        const findOpaqueBackground = (element) => {
          let current = element;
          while (current) {
            const background = getComputedStyle(current).backgroundColor;
            if (!background.includes('rgba(0, 0, 0, 0)') && background !== 'transparent') {
              return background;
            }
            current = current.parentElement;
          }
          return getComputedStyle(document.body).backgroundColor;
        };
        const describe = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const background = findOpaqueBackground(element);
          return {
            text: element.textContent?.trim() || '',
            foreground: style.color,
            background,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          };
        };
        const warning = card.querySelector('.counsel-eligibility.warn');
        const chip = card.querySelector('.chip.hard');
        const tier = card.querySelector('.counsel-tier-label');
        const accept = card.querySelector('.giver-accept-row .btn');
        if (!warning || !chip || !tier || !accept) throw new Error('Hard-warning anatomy is incomplete');
        return {
          warning: describe(warning),
          chip: describe(chip),
          tier: tier.textContent?.trim() || '',
          accept: {
            text: accept.textContent?.trim() || '',
            rect: (() => {
              const rect = accept.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            })(),
          },
          card: {
            rect: (() => {
              const rect = card.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            })(),
          },
          overflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      observations.push({
        viewport: { name: viewportName, ...viewport },
        ...capture,
        assetVersion: await page.locator('link[rel="stylesheet"]').evaluate(element => (
          new URL(element.href).searchParams.get('v')
        )),
        warningRatio: contrastRatio(parseRgb(capture.warning.foreground), parseRgb(capture.warning.background)),
        chipRatio: contrastRatio(parseRgb(capture.chip.foreground), parseRgb(capture.chip.background)),
        screenshot: EVIDENCE_DIR ? path.join(EVIDENCE_DIR, `${phase}-${viewportName}.png`) : null,
      });
      if (EVIDENCE_DIR) {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, `${phase}-${viewportName}.png`) });
      }
    }
    if (EVIDENCE_DIR) {
      await writeFile(
        path.join(EVIDENCE_DIR, `${phase}-computed.json`),
        `${JSON.stringify({ capturedAt: new Date().toISOString(), phase, observations }, null, 2)}\n`,
      );
      const baselinePath = path.join(EVIDENCE_DIR, 'red-computed.json');
      if (phase === 'green') {
        try {
          const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
          assert.deepEqual(
            observations.map(item => ({
              viewport: item.viewport.name,
              tier: item.tier,
              warning: item.warning.text,
              chip: item.chip.text,
              accept: item.accept.text,
              card: { width: item.card.rect.width, height: item.card.rect.height },
              warningBox: { width: item.warning.rect.width, height: item.warning.rect.height },
              chipBox: { width: item.chip.rect.width, height: item.chip.rect.height },
              overflow: item.overflow,
            })),
            baseline.observations.map(item => ({
              viewport: item.viewport.name,
              tier: item.tier,
              warning: item.warning.text,
              chip: item.chip.text,
              accept: item.accept.text,
              card: { width: item.card.rect.width, height: item.card.rect.height },
              warningBox: { width: item.warning.rect.width, height: item.warning.rect.height },
              chipBox: { width: item.chip.rect.width, height: item.chip.rect.height },
              overflow: item.overflow,
            })),
          );
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
    }
    assert.ok(observations.every(item => item.warningRatio >= 4.5), JSON.stringify(observations, null, 2));
    assert.ok(observations.every(item => item.chipRatio >= 4.5), JSON.stringify(observations, null, 2));
    assert.ok(observations.every(item => item.assetVersion === '98'), JSON.stringify(observations, null, 2));
    assert.ok(observations.every(item => item.accept.rect.height >= 44), JSON.stringify(observations, null, 2));
    assert.ok(observations.every(item => !item.overflow), JSON.stringify(observations, null, 2));
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('an open giver board follows breakpoint changes without replacing its state', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  const observables = [];
  try {
    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'running');

    const capture = async (label, phone) => {
      await waitForGiverResponsiveState(page, phone);
      const state = await readGiverResponsiveState(page);
      assert.deepEqual(state.order, phone ? ['panel', 'dialogue'] : ['dialogue', 'panel']);
      assert.equal(state.dialogueCount, 1);
      assert.equal(state.panelCount, 1);
      assert.ok(state.detailsOpen.every(open => open === !phone));
      observables.push({ label, viewport: await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      })), state });
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `giver-resize-${label}.png`),
          fullPage: true,
        });
      }
      return state;
    };

    await capture('phone-initial', true);
    await page.setViewportSize(GIVER_VIEWPORTS.tablet);
    await capture('tablet', false);
    await page.setViewportSize({ width: 1440, height: 900 });
    await capture('desktop', false);
    await page.setViewportSize(GIVER_VIEWPORTS.phone);
    await capture('phone-return', true);

    await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).click();
    await page.getByText('Your Sworn Quest', { exact: true }).waitFor();
    const activePhone = await capture('active-phone', true);
    assert.match(activePhone.activeTitle, /Your Sworn Quest/);

    await page.setViewportSize(GIVER_VIEWPORTS.tablet);
    const activeTablet = await capture('active-tablet', false);
    assert.match(activeTablet.activeTitle, /Your Sworn Quest/);
    await page.setViewportSize(GIVER_VIEWPORTS.phone);
    const activePhoneReturn = await capture('active-phone-return', true);
    assert.match(activePhoneReturn.activeTitle, /Your Sworn Quest/);

    await page.evaluate(() => nav('town'));
    await page.locator('.town-scene').waitFor();
    await openGiverBoard(page, 'running');
    const afterNavigation = await readGiverResponsiveState(page);
    assert.equal(afterNavigation.dialogueCount, 1);
    assert.equal(afterNavigation.panelCount, 1);
    assert.match(afterNavigation.activeTitle, /Your Sworn Quest/);
    assert.deepEqual(afterNavigation.order, ['panel', 'dialogue']);
    assert.ok(afterNavigation.detailsOpen.every(open => open === false));

    if (EVIDENCE_DIR) {
      await writeFile(
        path.join(EVIDENCE_DIR, 'giver-resize-observables.json'),
        `${JSON.stringify({
          capturedAt: new Date().toISOString(),
          baseUrl: BASE_URL,
          dataDir,
          node: process.version,
          observables,
          afterNavigation,
        }, null, 2)}\n`,
      );
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('giver accept confirms its commit while stale or malformed options cannot fake success', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    let acceptStatuses = [];
    page.on('response', response => {
      if (response.request().method() === 'POST' && response.url().endsWith('/api/quests/accept')) {
        acceptStatuses.push(response.status());
      }
    });
    await openGiverBoard(page, 'running');
    await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).click();
    await page.getByText('Your Sworn Quest', { exact: true }).waitFor();
    const successToast = page.locator('.toast:not(.err)');
    await successToast.waitFor();
    assert.match(await successToast.innerText(), /oath is inked/i);
    assert.deepEqual(acceptStatuses, [200]);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.filter(quest => quest.giver === 'running').length;
      }),
      1,
    );
    if (EVIDENCE_DIR) {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'accept-continuation-phone.png'),
      });
    }

    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'running');
    const staleOfferId = Number(
      await page.locator('.counsel-path-card').first().getAttribute('data-offer-id'),
    );
    await setCounselMode(page, 'self');
    await page.evaluate(async offerId => {
      try {
        await api('/quests/accept', {
          method: 'POST',
          body: { giver: 'running', offer_id: offerId },
        });
      } catch {
        // The error toast is the player-visible refusal.
      }
    }, staleOfferId);
    await page.locator('.toast.err').waitFor();
    assert.match(await page.locator('.toast.err').innerText(), /offer has faded/i);
    assert.equal(await page.locator('.toast:not(.err)').count(), 0);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.length;
      }),
      0,
    );

    await page.evaluate(async () => {
      try {
        await api('/quests/accept', {
          method: 'POST',
          body: { giver: 'running', option_key: { malformed: true } },
        });
      } catch {
        // The error toast is the player-visible refusal.
      }
    });
    assert.match(await page.locator('.toast.err').innerText(), /offer key is not recognized/i);
    assert.equal(await page.locator('.toast:not(.err)').count(), 0);
    assert.deepEqual(acceptStatuses, [200, 400, 400]);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Undercroft uses map movement with a single inventory control', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await page.evaluate(() => nav('undercroft'));
    await page.getByRole('button', { name: /DESCEND/ }).click();
    await page.locator('.dmap').waitFor();
    assert.equal(await page.locator('.dpad').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'USE', exact: true }).count(), 0);
    assert.ok(await page.locator('button.dcell.adjacent').count() > 0);
    assert.equal(await page.locator('.dmap-hint').textContent(), 'tap a gold-edged neighboring room to move');

    await page.evaluate(() => {
      const cells = {};
      for (let y = 0; y < 6; y += 1) {
        for (let x = 0; x < 6; x += 1) {
          cells[`${x},${y}`] = { type: 'empty', seen: true, cleared: true };
        }
      }
      cells['0,0'] = { type: 'entrance', seen: true, cleared: true };
      renderDungeon({
        floor: 1, gear: { weapon: null, armor: null, charm: null },
        items: { bread: 1 }, trinkets: ['clover'], buff_atk: 0, buff_def: 0,
        loot_gold: 0, combat: null, seed: 1, log: [], hp: 18, cells,
        px: 0, py: 0, boss_floor: false, shop_stock: null, relic: null,
      }, { max_hp: 18, atk: 3, def: 1 }, { name: 'The Catacombs', accent: '#b8a888' });
    });
    await page.waitForTimeout(250);
    const items = page.getByRole('button', { name: 'ITEMS', exact: true });
    const inspect = page.getByRole('button', { name: 'inspect', exact: true });
    await items.waitFor();
    await inspect.waitFor();
    const [itemsBox, inspectBox] = await Promise.all([items.boundingBox(), inspect.boundingBox()]);
    assert.equal(itemsBox?.y, inspectBox?.y);
    assert.ok((inspectBox?.x ?? 0) > (itemsBox?.x ?? 0));
    for (const [label, viewport] of Object.entries({
      phone: { width: 375, height: 812 },
      tablet: { width: 768, height: 900 },
      desktop: { width: 1280, height: 900 },
    })) {
      await page.setViewportSize(viewport);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `undercroft-${label}.png`),
          fullPage: true,
        });
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('override paths: Iron doctrine and Rest Writ each render one path in both modes', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.desktop,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(async () => {
      await api('/programs/select', {
        method: 'POST',
        body: { giver: 'kettlebell', key: 'starting_strength' },
      });
      await refreshState();
    });
    for (const mode of ['considered', 'self']) {
      await setCounselMode(page, mode);
      await openGiverBoard(page, 'kettlebell');
      assert.equal(await page.locator('.counsel-path-card').count(), 1);
      assert.equal(await page.locator('.counsel-path-card .chip.program').count(), 1);
      assert.equal(await page.locator('.counsel-tier-label').count(), 1);
      if (EVIDENCE_DIR) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `override-doctrine-grunhilda-${mode}.png`),
        });
      }
    }

    await createGiverProfile(page, 'considered');
    const slug = await page.evaluate(async () => (await api('/profiles')).current);
    const now = new Date();
    const day = offset => new Date(now.getTime() - offset * 86_400_000).toISOString().slice(0, 10);
    const wellnessRows = [];
    for (let ago = 20; ago > 6; ago--) wellnessRows.push([day(ago), 60, 50]);
    for (let ago = 6; ago >= 0; ago--) wellnessRows.push([day(ago), 40, 56]);
    const syncStatus = {
      revision: 1,
      activity: { revision: 1, newest_observation_date: day(0), field_as_of: { moving_time: day(0) } },
      wellness: {
        revision: 1,
        succeeded_at: now.toISOString().slice(0, 19),
        newest_observation_date: day(0),
        field_as_of: { hrv: day(0), resting_hr: day(0) },
      },
    };
    const seed = spawnSync(
      path.join(ROOT, '.venv/bin/python'),
      ['-c', `
import json, sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
for observed, hrv, resting_hr in json.loads(sys.argv[2]):
    connection.execute(
        "INSERT OR REPLACE INTO wellness (date, hrv, resting_hr) VALUES (?, ?, ?)",
        (observed, hrv, resting_hr),
    )
connection.execute(
    "INSERT OR REPLACE INTO kv (key, value) VALUES ('sync_status', ?)",
    (sys.argv[3],),
)
connection.commit()
connection.close()
`, path.join(dataDir, `${slug}.db`), JSON.stringify(wellnessRows), JSON.stringify(syncStatus)],
      { encoding: 'utf8' },
    );
    assert.equal(seed.status, 0, `Rest Writ seed failed: ${seed.stderr || seed.stdout}`);

    for (const mode of ['considered', 'self']) {
      await setCounselMode(page, mode);
      await openGiverBoard(page, 'mobility');
      assert.equal(await page.locator('.counsel-path-card').count(), 1);
      assert.equal(await page.locator('.counsel-path-card.writ').count(), 1);
      assert.equal(await page.locator('.counsel-path-card .chip.rest').count(), 1);
      if (EVIDENCE_DIR) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `override-writ-elowen-${mode}.png`),
        });
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test("Grunhilda's iron selector is closed by default and hides implement choices", async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.desktop,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'kettlebell');

    const selector = page.locator('.iron-today-control .pixel-select');
    assert.equal(await selector.count(), 1);
    assert.equal(await selector.evaluate(element => element.open), false);
    assert.equal(
      await selector.locator('.pixel-select-summary').textContent(),
      'any iron',
    );
    assert.equal(
      await selector.locator('.pixel-select-summary').getAttribute('aria-label'),
      'Iron available today: any iron',
    );
    assert.equal(
      await selector.locator('.pixel-select-summary').evaluate(element => (
        getComputedStyle(element, '::before').content
      )),
      '"within reach today: "',
    );
    assert.deepEqual(
      await selector.locator('.pixel-select-summary').evaluate(element => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderTopStyle: style.borderTopStyle,
          boxShadow: style.boxShadow,
          textDecorationLine: style.textDecorationLine,
        };
      }),
      {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderTopStyle: 'none',
        boxShadow: 'none',
        textDecorationLine: 'underline',
      },
    );
    for (const equipment of ['barbell', 'dumbbell', 'kettlebell', 'bodyweight']) {
      assert.equal(
        await selector.locator(`.pixel-option[data-value="${equipment}"]`).isVisible(),
        false,
      );
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test("Grunhilda's collapsed iron selector shows today's active override", async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.desktop,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(async () => {
      const current = await api('/today');
      await api('/settings', {
        method: 'POST',
        body: {
          counsel_iron_today: {
            date: current.today,
            equipment: 'kettlebell',
          },
        },
      });
      await refreshState();
    });
    await openGiverBoard(page, 'kettlebell');

    const selector = page.locator('.iron-today-control .pixel-select');
    assert.equal(await selector.evaluate(element => element.open), false);
    assert.equal(
      await selector.locator('.pixel-select-summary').textContent(),
      'kettlebell',
    );
    assert.equal(
      await selector.locator('.pixel-select-summary').getAttribute('aria-label'),
      'Iron available today: kettlebell',
    );
    assert.equal(
      await selector.locator('.pixel-option[data-value="kettlebell"]').isVisible(),
      false,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test("Grunhilda's iron selector persists a pick and refreshes her offer", async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.desktop,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'kettlebell');
    assert.equal(
      await page.getByText('Grunhilda kept this path to the iron you named for today.').count(),
      0,
    );

    const selector = page.locator('.iron-today-control .pixel-select');
    await selector.locator('.pixel-select-summary').click();
    assert.equal(await selector.evaluate(element => element.open), true);
    const settingsWrite = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && response.url().endsWith('/api/settings')
    ));
    await selector.locator('.pixel-option[data-value="dumbbell"]').click();
    assert.equal((await settingsWrite).status(), 200);
    await page.waitForFunction(() => (
      document.querySelector('.iron-today-control .pixel-select-label')?.textContent === 'dumbbell'
      && S.state.settings?.counsel_iron_today?.equipment === 'dumbbell'
    ));

    const refreshedSelector = page.locator('.iron-today-control .pixel-select');
    assert.equal(await refreshedSelector.evaluate(element => element.open), false);
    assert.equal(
      await refreshedSelector.locator('.pixel-select-summary').textContent(),
      'dumbbell',
    );
    assert.equal(
      await refreshedSelector.locator('.pixel-select-summary').getAttribute('aria-label'),
      'Iron available today: dumbbell',
    );
    assert.equal(
      await page.getByText('Grunhilda kept this path to the iron you named for today.').count(),
      1,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('daily pointer bubbles on its giver building, once per local day, never blocking play', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await seedNudgeProfile(page, 'considered', 'nudge-browser-1');

    await page.reload();
    await page.locator('.town-scene').waitFor();
    const bubble = page.locator('.counsel-nudge-wrap');
    await bubble.waitFor();
    const follow = page.getByRole('button', {
      name: "Follow the council's counsel to Old Fenn",
      exact: true,
    });
    await follow.waitFor();

    // It is a bubble on Fenn's building, not an overlay: the town stays live.
    assert.equal(await page.locator('.overlay').count(), 0);
    assert.equal(
      await bubble.evaluate(element => element.closest('[id]')?.id),
      'bld-fenn',
    );
    assert.match(
      await bubble.evaluate(element => element.textContent),
      /The path is chosen/,
    );
    assert.deepEqual(
      await bubble.locator('.counsel-nudge').evaluate(element => ({
        borderLeftColor: getComputedStyle(element).borderLeftColor,
        borderLeftWidth: getComputedStyle(element).borderLeftWidth,
      })),
      { borderLeftColor: 'rgb(106, 160, 200)', borderLeftWidth: '3px' },
    );
    assert.deepEqual(
      await bubble
        .locator('.counsel-nudge-go .btn, .counsel-nudge-dismiss')
        .evaluateAll(elements => elements.map(element => getComputedStyle(element).color)),
      ['rgb(240, 208, 128)', 'rgb(240, 208, 128)'],
    );
    for (const [viewportName, viewport] of Object.entries(GIVER_VIEWPORTS)) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(() => (
        [...document.querySelectorAll('.counsel-nudge-go, .counsel-nudge-dismiss')]
          .every(element => element.getBoundingClientRect().height >= 44)
      ));
      await page.evaluate(() => window.scrollTo(0, 0));
      const controlSizes = await page
        .locator('.counsel-nudge-go, .counsel-nudge-dismiss')
        .evaluateAll(elements => elements.map(element => ({
          name: element.className,
          height: element.getBoundingClientRect().height,
        })));
      for (const control of controlSizes) {
        assert.ok(
          control.height >= 44,
          `${viewportName} ${control.name} measured ${control.height}px`,
        );
      }
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `nudge-considered-${viewportName}.png`),
        });
      }
    }
    await page.setViewportSize(GIVER_VIEWPORTS.phone);

    // Ignoring it costs nothing: another building is still reachable.
    await page.evaluate(() => nav('giver', { giver: 'mobility' }));
    await page.waitForFunction(() => (
      document.querySelector('.giver-offer-board')?.dataset.giver === 'mobility'
    ));
    await page.evaluate(() => nav('town'));
    await page.locator('.town-scene').waitFor();
    assert.equal(await page.locator('.counsel-nudge-wrap').count(), 0);
    await page.reload();
    await page.locator('.town-scene').waitFor();
    assert.equal(await page.locator('.counsel-nudge-wrap').count(), 0);

    // The same local day remains eligible for a different profile slug.
    await seedNudgeProfile(page, 'considered', 'nudge-browser-profile-2');
    await page.reload();
    await page.locator('.town-scene').waitFor();
    await page.locator('.counsel-nudge-wrap').waitFor();

    // A fresh profile in Choose-your-own speaks in its own, data-aware voice.
    await seedNudgeProfile(page, 'self', 'nudge-browser-self');
    await page.reload();
    await page.locator('.town-scene').waitFor();
    const selfBubble = page.locator('.counsel-nudge-wrap');
    await selfBubble.waitFor();
    const selfLine = await selfBubble.evaluate(element => element.textContent);
    assert.match(selfLine, /day/);
    assert.doesNotMatch(selfLine, /The path is chosen/);
    if (EVIDENCE_DIR) {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'nudge-self-phone.png') });
    }

    // It can be waved off in place, and dismissing writes nothing.
    await selfBubble.locator('.counsel-nudge-dismiss').click();
    await page.waitForFunction(() => document.querySelector('.counsel-nudge-wrap') === null);
    assert.equal(await page.locator('.town-scene').count(), 1);

    // Tapping the bubble itself is navigation, nothing more.
    await seedNudgeProfile(page, 'self', 'nudge-browser-follow');
    await page.reload();
    await page.locator('.town-scene').waitFor();
    await page.getByRole('button', {
      name: "Follow the council's counsel to Old Fenn",
      exact: true,
    }).click();
    await page.waitForFunction(() => (
      document.querySelector('.giver-offer-board')?.dataset.giver === 'running'
    ));
    assert.equal(await page.locator('.counsel-nudge-wrap').count(), 0);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('daily pointer storage fallbacks keep town visible and suppress same-session repeats', async () => {
  for (const mode of ['null', 'invalid-json', 'getter-throw', 'setter-throw']) {
    const { context, failures, page } = await openMainProfile(
      GIVER_VIEWPORTS.phone,
      { reducedMotion: 'reduce' },
    );
    try {
      await seedNudgeProfile(page, 'considered', `nudge-storage-${mode}`);
      await installNudgeStorageFault(context, mode);
      await page.reload();
      await page.waitForTimeout(250);
      assert.deepEqual(
        await page.locator('#app').evaluate(element => ({
          busy: element.getAttribute('aria-busy'),
          visibility: getComputedStyle(element).visibility,
        })),
        { busy: null, visibility: 'visible' },
      );
      await page.locator('.town-scene').waitFor();
      await page.locator('.counsel-nudge-wrap').waitFor();
      assert.equal(await page.locator('.counsel-nudge-wrap').count(), 1);

      await page.evaluate(() => nav('giver', { giver: 'mobility' }));
      await page.waitForFunction(() => (
        document.querySelector('.giver-offer-board')?.dataset.giver === 'mobility'
      ));
      await page.evaluate(() => nav('town'));
      await page.locator('.town-scene').waitFor();
      assert.equal(await page.locator('.counsel-nudge-wrap').count(), 0);
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test('boot refreshes counsel after synchronizing the profile timezone', async () => {
  const timezone = 'America/New_York';
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce', timezoneId: timezone },
  );
  const stateTimezones = [];
  try {
    await seedNudgeProfile(page, 'considered', 'nudge-timezone-refresh');
    page.on('response', async response => {
      if (response.url().endsWith('/api/state') && response.ok()) {
        stateTimezones.push((await response.json()).settings.timezone);
      }
    });

    await page.reload();
    await page.locator('.town-scene').waitFor();
    await page.waitForFunction(expected => (
      S.state?.settings?.timezone === expected
    ), timezone);
    assert.deepEqual(stateTimezones.slice(-2), ['UTC', timezone]);
    await page.locator('.counsel-nudge-wrap').waitFor();
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('daily pointer yields the building bubble to an existing writ notice', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await seedNudgeProfile(page, 'considered', 'nudge-writ-precedence');
    await page.evaluate(async () => {
      localStorage.removeItem('iv_nudge');
      await refreshState();
      S.writQueue = [{
        ts: new Date().toISOString(),
        type: 'broken',
        detail: 'Training',
        rewards: {},
      }];
      await render();
    });
    await page.locator('.willow-bubble-wrap').waitFor();
    assert.equal(await page.locator('.fenn-bubble-wrap').count(), 1);
    assert.equal(await page.locator('.counsel-nudge-wrap').count(), 0);

    await page.evaluate(async () => {
      S.writQueue = [];
      await render();
    });
    await page.locator('.counsel-nudge-wrap').waitFor();
    assert.equal(await page.locator('.willow-bubble-wrap').count(), 0);
    assert.equal(await page.locator('.fenn-bubble-wrap').count(), 1);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('daily pointer yields the building bubble to an existing deed notice', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await seedNudgeProfile(page, 'considered', 'nudge-deed-precedence');
    await page.evaluate(async () => {
      await refreshState();
      S.fennQueue = [{
        activity_id: 'nudge-deed-precedence',
        giver: 'running',
        title: 'Road run',
        minutes: 30,
        xp: 10,
        gold: 5,
        vigor: 1,
      }];
      await render();
    });
    await page.locator('.fenn-bubble-wrap[data-activity-id]').waitFor();
    assert.equal(await page.locator('.fenn-bubble-wrap').count(), 1);
    assert.equal(await page.locator('.counsel-nudge-wrap').count(), 0);

    await page.evaluate(async () => {
      S.fennQueue = [];
      await render();
    });
    await page.locator('.counsel-nudge-wrap').waitFor();
    assert.equal(await page.locator('.fenn-bubble-wrap[data-activity-id]').count(), 0);
    assert.equal(await page.locator('.fenn-bubble-wrap').count(), 1);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

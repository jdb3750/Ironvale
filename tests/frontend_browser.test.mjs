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
    || (
      S.params.giver === giverKey
      && !S.state.offerable_givers.includes(giverKey)
      && document.querySelector('.npc-head')
    )
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
  browser = await chromium.launch({
    headless: !EVIDENCE_DIR,
  });
});

after(async () => {
  await browser?.close();
  if (server && server.exitCode === null) server.kill('SIGTERM');
  await rm(dataDir, { recursive: true, force: true });
});

test('global type tokens drive text roles without scanlines or focus zoom', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await page.evaluate(() => nav('settings'));
    const input = page.locator('#set-name');
    await input.waitFor();
    const scaleBeforeFocus = await page.evaluate(() => window.visualViewport?.scale || 1);
    await input.focus();
    const settingsStyles = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const read = selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return {
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
        };
      };
      return {
        tokens: {
          fine: root.getPropertyValue('--type-fine').trim(),
          body: root.getPropertyValue('--type-body').trim(),
          title: root.getPropertyValue('--type-title').trim(),
          form: root.getPropertyValue('--type-form').trim(),
        },
        body: read('body'),
        button: read('.settings-tabs .btn'),
        input: read('#set-name'),
        title: read('.win-title'),
        helper: read('.counsel-help'),
        overlay: getComputedStyle(document.body, '::after').backgroundImage,
      };
    });
    const scaleAfterFocus = await page.evaluate(() => window.visualViewport?.scale || 1);

    await openGiverBoard(page, 'kettlebell');
    const giverStyles = await page.evaluate(() => {
      const read = selector => {
        const style = getComputedStyle(document.querySelector(selector));
        return {
          family: style.fontFamily,
          size: style.fontSize,
          weight: style.fontWeight,
        };
      };
      return {
        dialogue: read('.dialog'),
        fine: read('.counsel-tier-label'),
        tag: read('.chip'),
      };
    });

    assert.deepEqual(settingsStyles.tokens, {
      fine: '10px',
      body: '12px',
      title: '14px',
      form: '16px',
    });
    assert.match(settingsStyles.body.family, /quanta-strike-12/);
    assert.equal(settingsStyles.body.size, '12px');
    assert.match(settingsStyles.button.family, /quanta-strike-12/);
    assert.equal(settingsStyles.button.size, '12px');
    assert.equal(settingsStyles.button.weight, '700');
    assert.match(settingsStyles.input.family, /quanta-strike-16/);
    assert.equal(settingsStyles.input.size, '16px');
    assert.equal(settingsStyles.input.weight, '400');
    assert.match(settingsStyles.title.family, /quanta-strike-14/);
    assert.equal(settingsStyles.title.size, '14px');
    assert.match(settingsStyles.helper.family, /quanta-strike-12/);
    assert.equal(settingsStyles.helper.size, '12px');
    assert.match(giverStyles.dialogue.family, /quanta-strike-14/);
    assert.equal(giverStyles.dialogue.size, '14px');
    assert.match(giverStyles.fine.family, /quanta-strike-10/);
    assert.equal(giverStyles.fine.size, '10px');
    assert.match(giverStyles.tag.family, /quanta-strike-12/);
    assert.equal(giverStyles.tag.size, '12px');
    assert.equal(giverStyles.tag.weight, '400');
    assert.doesNotMatch(settingsStyles.overlay, /repeating-linear-gradient/);
    assert.match(settingsStyles.overlay, /radial-gradient/);
    assert.equal(scaleAfterFocus, scaleBeforeFocus);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
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
      [
        'ROAD UNIT',
        'WEIGHT UNIT',
        'SIEGE BELL TIMEZONE',
        'TIMEZONE',
        'AMBITION',
        'GAME LOOP STYLE',
        'PRIMARY FOCUS',
        'SECONDARY FOCUSES (OPTIONAL)',
      ],
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

test('shared pixelSelect menus float without shifting content and still select', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();

    const selector = page.locator('#set-units').locator('..');
    const followingTop = () => selector.evaluate(element => (
      element.closest('.formrow').nextElementSibling.getBoundingClientRect().top
    ));
    const summaryWidth = await selector.locator('.pixel-select-summary')
      .evaluate(element => element.getBoundingClientRect().width);
    const beforeOpen = await followingTop();
    await selector.locator('.pixel-select-summary').click();
    assert.equal(await selector.evaluate(element => element.open), true);
    assert.equal(await followingTop(), beforeOpen);
    assert.equal(await selector.locator('.pixel-select-menu').isVisible(), true);
    assert.ok(
      Math.abs(
        await selector.locator('.pixel-select-menu')
          .evaluate(element => element.getBoundingClientRect().width)
        - summaryWidth,
      ) <= 1,
    );

    const settingsWrite = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && response.url().endsWith('/api/settings')
    ));
    await selector.locator('.pixel-option[data-value="mi"]').click();
    assert.equal((await settingsWrite).status(), 200);
    await page.waitForFunction(() => (
      document.querySelector('#set-units')?.value === 'mi'
      && document.querySelector('#set-units')?.closest('.pixel-select')
        ?.querySelector('.pixel-select-label')?.textContent === 'mi'
    ));
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('pixelSelect button summaries center their labels without changing Grunhilda’s inline trigger', async () => {
  const { context, failures, page } = await openMainProfile(GIVER_VIEWPORTS.phone);
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();

    const summary = page.locator('#set-units').locator('..').locator('.pixel-select-summary');
    const alignment = await summary.evaluate((element) => {
      const summaryRect = element.getBoundingClientRect();
      const labelRect = element.querySelector('.pixel-select-label').getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        alignItems: style.alignItems,
        below: summaryRect.bottom - labelRect.bottom,
        display: style.display,
        height: summaryRect.height,
        above: labelRect.top - summaryRect.top,
      };
    });
    assert.ok(alignment.height >= 44, JSON.stringify(alignment));
    assert.ok(Math.abs(alignment.above - alignment.below) <= 2, JSON.stringify(alignment));
    assert.deepEqual(
      { display: alignment.display, alignItems: alignment.alignItems },
      { display: 'flex', alignItems: 'center' },
    );

    await openGiverBoard(page, 'kettlebell');
    const inlineSummary = page.locator(
      '.iron-today-control .pixel-select-summary',
    );
    assert.deepEqual(
      await inlineSummary.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          borderTopWidth: style.borderTopWidth,
          boxShadow: style.boxShadow,
          display: style.display,
          textDecorationLine: style.textDecorationLine,
        };
      }),
      {
        backgroundColor: 'rgba(0, 0, 0, 0)',
        borderTopWidth: '0px',
        boxShadow: 'none',
        display: 'inline-block',
        textDecorationLine: 'underline',
      },
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Settings pixelSelect rows name the setting once and keep value-only options', async () => {
  const { context, failures, page } = await openMainProfile(GIVER_VIEWPORTS.phone);
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();

    const cases = [
      {
        id: 'set-units',
        ariaLabel: 'road unit',
        rowLabel: 'road unit',
        values: ['km', 'mi'],
      },
      {
        id: 'set-wu',
        ariaLabel: 'weight unit',
        rowLabel: 'weight unit',
        values: ['kg', 'lb'],
      },
      {
        id: 'set-siege-tz',
        ariaLabel: 'siege timezone',
        rowLabel: 'siege bell timezone',
        values: [
          'UTC',
          'America/New_York',
          'America/Chicago',
          'America/Denver',
          'America/Los_Angeles',
          'Europe/London',
          'Europe/Berlin',
          'Australia/Sydney',
        ],
      },
    ];
    for (const setting of cases) {
      const input = page.locator(`#${setting.id}`);
      const picker = input.locator('..');
      const row = input.locator('xpath=ancestor::div[contains(@class, "formrow")]');
      const label = row.locator('.counsel-label');
      assert.equal(await label.isVisible(), true);
      assert.equal((await label.innerText()).trim().toLowerCase(), setting.rowLabel);
      assert.equal(
        await label.evaluate(element => getComputedStyle(element).color),
        'rgb(106, 160, 200)',
      );
      assert.equal(
        await picker.locator('.pixel-select-summary').getAttribute('aria-label'),
        setting.ariaLabel,
      );
      assert.ok(
        setting.values.includes((await picker.locator('.pixel-select-label').textContent()).trim()),
      );
      assert.deepEqual(
        (await picker.locator('.pixel-option').allTextContents()).map(value => value.trim()),
        setting.values,
      );
    }
    if (EVIDENCE_DIR) {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'settings-selectors-phone.png'),
        fullPage: true,
      });
      await page.setViewportSize(GIVER_VIEWPORTS.desktop);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'settings-selectors-desktop.png'),
        fullPage: true,
      });
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('floating pickers close predictably without affecting ordinary disclosures', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();

    const roadPicker = page.locator('#set-units').locator('..');
    const weightPicker = page.locator('#set-wu').locator('..');
    const roadSummary = roadPicker.locator('.pixel-select-summary');
    const weightSummary = weightPicker.locator('.pixel-select-summary');

    await roadSummary.click();
    assert.equal(await roadPicker.evaluate(element => element.open), true);
    await page.locator('#settings-game').click();
    assert.equal(await roadPicker.evaluate(element => element.open), false);

    await roadSummary.click();
    await weightSummary.evaluate(element => element.click());
    assert.equal(
      await page.locator('.pixel-select[open], .hat-picker[open]').count(),
      1,
    );
    assert.equal(await roadPicker.evaluate(element => element.open), false);
    assert.equal(await weightPicker.evaluate(element => element.open), true);

    await page.keyboard.press('Escape');
    assert.equal(await weightPicker.evaluate(element => element.open), false);
    assert.equal(await weightSummary.evaluate(element => document.activeElement === element), true);

    await roadSummary.click();
    await roadSummary.click();
    assert.equal(await roadPicker.evaluate(element => element.open), false);

    const timezonePicker = page.locator('#set-siege-tz').locator('..');
    await timezonePicker.locator('.pixel-select-summary').click();
    const menu = timezonePicker.locator('.pixel-select-menu');
    await menu.click({ position: { x: 4, y: 4 } });
    assert.equal(await timezonePicker.evaluate(element => element.open), true);
    const menuBox = await menu.boundingBox();
    assert.ok(menuBox);
    const beforeScrollbarDrag = await menu.evaluate(element => element.scrollTop);
    await page.mouse.move(menuBox.x + menuBox.width - 6, menuBox.y + 40);
    await page.mouse.down();
    await page.mouse.move(
      menuBox.x + menuBox.width - 6,
      menuBox.y + menuBox.height - 30,
      { steps: 6 },
    );
    await page.mouse.up();
    assert.equal(await timezonePicker.evaluate(element => element.open), true);
    await page.mouse.move(menuBox.x + menuBox.width / 2, menuBox.y + menuBox.height / 2);
    await page.mouse.wheel(0, 160);
    await page.waitForFunction(
      previous => document.querySelector('#set-siege-tz')
        ?.closest('.pixel-select')
        ?.querySelector('.pixel-select-menu')?.scrollTop > previous,
      beforeScrollbarDrag,
    );
    assert.equal(await timezonePicker.evaluate(element => element.open), true);

    await openGiverBoard(page, 'kettlebell');
    const disclosure = page.locator('.phone-disclosure.offer-lore').first();
    await disclosure.locator('summary').click();
    assert.equal(await disclosure.evaluate(element => element.open), true);
    await page.locator('.npc-head').click();
    assert.equal(await disclosure.evaluate(element => element.open), true);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('every live pixel dropdown call site uses the shared floating menu', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();
    for (const id of [
      'set-units',
      'set-wu',
      'set-siege-tz',
      'set-counsel-mode',
      'set-counsel-primary',
    ]) {
      assert.equal(
        await page.locator(`#${id}`).locator('..').locator('.pixel-select-menu')
          .evaluate(element => getComputedStyle(element).position),
        'absolute',
      );
    }

    await page.evaluate(() => nav('doctrines', { giver: 'kettlebell' }));
    await page.locator('#rb-ex').waitFor({ state: 'attached' });
    assert.equal(
      await page.locator('#rb-ex').locator('..').locator('.pixel-select-menu')
        .evaluate(element => getComputedStyle(element).position),
      'absolute',
    );

    await page.evaluate(() => nav('scrivener'));
    await page.locator('#cl-kind').waitFor({ state: 'attached' });
    assert.equal(
      await page.locator('#cl-kind').locator('..').locator('.pixel-select-menu')
        .evaluate(element => getComputedStyle(element).position),
      'absolute',
    );

    await openGiverBoard(page, 'kettlebell');
    assert.equal(
      await page.locator('.iron-today-control .pixel-select-menu')
        .evaluate(element => getComputedStyle(element).position),
      'absolute',
    );

    await page.evaluate(async () => {
      await api('/settings', { method: 'POST', body: { dev_mode: true } });
      await api('/dev', { method: 'POST', body: { action: 'hats' } });
      await api('/dev', { method: 'POST', body: { action: 'packs' } });
      await api('/monsters/rip', { method: 'POST' });
      await refreshState();
      nav('ranch');
    });
    await page.locator('.mon-tile').first().waitFor();
    await page.waitForFunction(() => RANCH.actors.length > 0);
    await page.locator('.mon-tile').first().click();
    const hatPicker = page.locator('.overlay[data-ranch-info] .hat-picker');
    await hatPicker.waitFor();
    const followingTop = () => hatPicker.evaluate(element => (
      element.nextElementSibling.getBoundingClientRect().top
    ));
    const beforeOpen = await followingTop();
    await hatPicker.locator('.hat-picker-summary').click();
    assert.equal(await followingTop(), beforeOpen);
    assert.equal(await hatPicker.locator('.hat-picker-menu').isVisible(), true);
    assert.equal(
      await hatPicker.locator('.hat-picker-menu').evaluate(
        element => getComputedStyle(element).position,
      ),
      'absolute',
    );
    const hatWrite = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && /\/api\/monsters\/\d+\/hat$/.test(response.url())
    ));
    await hatPicker.locator('.hat-option').first().click();
    assert.equal((await hatWrite).status(), 200);
    await page.getByText('Crowned. Devastating.', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const picker = document.querySelector('.overlay[data-ranch-info] .hat-picker');
      const menu = picker?.querySelector('.hat-picker-menu');
      const win = picker?.closest('.overlay .win');
      if (!picker?.open || !menu || !win) return false;
      const menuRect = menu.getBoundingClientRect();
      const winRect = win.getBoundingClientRect();
      return menuRect.top >= winRect.top && menuRect.bottom <= winRect.bottom;
    });
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Menagerie hat-picker summary centers its label in the phone touch target', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(async () => {
      await api('/settings', { method: 'POST', body: { dev_mode: true } });
      await api('/dev', { method: 'POST', body: { action: 'hats' } });
      await api('/dev', { method: 'POST', body: { action: 'packs' } });
      await api('/monsters/rip', { method: 'POST' });
      await refreshState();
      nav('ranch');
    });
    await page.locator('.mon-tile').first().waitFor();
    await page.waitForFunction(() => RANCH.actors.length > 0);
    await page.locator('.mon-tile').first().click();

    const summary = page.locator('.overlay[data-ranch-info] .hat-picker-summary');
    await summary.waitFor();
    const geometry = await summary.evaluate(element => {
      const textNode = [...element.childNodes].find(node => (
        node.nodeType === Node.TEXT_NODE && node.textContent.trim()
      ));
      const range = document.createRange();
      range.selectNodeContents(textNode);
      const labelRect = range.getBoundingClientRect();
      const summaryRect = element.getBoundingClientRect();
      return {
        centerDelta: Math.abs(
          (labelRect.top + labelRect.bottom) / 2
          - (summaryRect.top + summaryRect.bottom) / 2
        ),
        summaryHeight: summaryRect.height,
      };
    });
    assert.ok(geometry.summaryHeight >= 44, JSON.stringify(geometry));
    assert.ok(geometry.centerDelta <= 2, JSON.stringify(geometry));
    if (EVIDENCE_DIR) {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'hat-picker-summary-phone.png'),
      });
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('raised surfaces share tone and shadow while only modal trim is gold', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  const viewports = [
    ['phone', { width: 375, height: 812 }],
    ['desktop', { width: 1280, height: 900 }],
  ];
  try {
    await createGiverProfile(page, 'considered');
    for (const [viewportName, viewport] of viewports) {
      await page.setViewportSize(viewport);
      await openGiverBoard(page, 'kettlebell');
      const selector = page.locator('.iron-today-control .pixel-select');
      const followingTop = () => page.locator('.counsel-path-card').first()
        .evaluate(element => element.getBoundingClientRect().top);
      const beforeOpen = await followingTop();
      await selector.locator('.pixel-select-summary').evaluate(summary => summary.click());
      await selector.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      assert.equal(await followingTop(), beforeOpen);
      if (EVIDENCE_DIR) {
        await page.waitForFunction(() => !document.querySelector('.key-pop-ghost'));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `elevation-menu-over-card-${viewportName}.png`),
        });
      }

      const elevation = await page.evaluate(() => {
        const tokenColor = (name) => {
          const probe = document.createElement('span');
          probe.style.backgroundColor = `var(${name})`;
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return color;
        };
        const describe = (element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            borderBottomColor: style.borderBottomColor,
            borderLeftColor: style.borderLeftColor,
            borderRightColor: style.borderRightColor,
            borderTopColor: style.borderTopColor,
            borderBottomWidth: style.borderBottomWidth,
            borderLeftWidth: style.borderLeftWidth,
            borderRightWidth: style.borderRightWidth,
            borderTopWidth: style.borderTopWidth,
            shadow: style.boxShadow,
          };
        };
        const bubble = document.createElement('div');
        bubble.className = 'fenn-bubble';
        bubble.textContent = 'A deed waits.';
        document.body.appendChild(bubble);
        const hatMenu = document.createElement('div');
        hatMenu.className = 'hat-picker-menu';
        document.body.appendChild(hatMenu);
        const overlay = showModal('<div class="win center" data-elevation-modal>A raised window.</div>');
        toast('A raised notice.');

        const neutralSurfaces = {
          bubble: describe(bubble),
          hatMenu: describe(hatMenu),
          menu: describe(document.querySelector('.iron-today-control .pixel-select-menu')),
          toast: describe(document.querySelector('.toast')),
        };
        const modal = describe(overlay.querySelector('[data-elevation-modal]'));
        const ordinary = describe(document.querySelector('#app .win'));
        bubble.remove();
        hatMenu.remove();
        overlay.remove();
        document.querySelector('.toast')?.remove();
        return {
          edgeLit: tokenColor('--edge-lit'),
          edgeShade: tokenColor('--edge-shade'),
          gold: tokenColor('--gold'),
          goldBright: tokenColor('--gold-bright'),
          ordinary,
          panel2: tokenColor('--panel2'),
          raised: tokenColor('--surface-raised'),
          modal,
          neutralSurfaces,
        };
      });
      const parseRgb = value => value.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number);
      const luminance = value => parseRgb(value)
        .map(channel => channel / 255)
        .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      assert.ok(elevation.raised && elevation.raised !== 'rgba(0, 0, 0, 0)', JSON.stringify(elevation));
      assert.ok(luminance(elevation.raised) > luminance(elevation.panel2), JSON.stringify(elevation));
      const shadows = new Set();
      const goldFamily = new Set([elevation.gold, elevation.goldBright]);
      for (const surface of [...Object.values(elevation.neutralSurfaces), elevation.modal]) {
        assert.equal(surface.background, elevation.raised, JSON.stringify(elevation));
        assert.match(surface.shadow, /4px 4px 0px/);
        shadows.add(surface.shadow);
      }
      for (const surface of Object.values(elevation.neutralSurfaces)) {
        assert.equal(surface.borderLeftColor, elevation.edgeLit, JSON.stringify(elevation));
        assert.equal(surface.borderRightColor, elevation.edgeShade, JSON.stringify(elevation));
        assert.equal(surface.borderBottomColor, elevation.edgeShade, JSON.stringify(elevation));
        if (Number.parseFloat(surface.borderTopWidth) > 0) {
          assert.equal(surface.borderTopColor, elevation.edgeLit, JSON.stringify(elevation));
        }
        const visibleBorders = [
          ['borderTopColor', 'borderTopWidth'],
          ['borderRightColor', 'borderRightWidth'],
          ['borderBottomColor', 'borderBottomWidth'],
          ['borderLeftColor', 'borderLeftWidth'],
        ].filter(([, width]) => Number.parseFloat(surface[width]) > 0)
          .map(([color]) => surface[color]);
        assert.ok(
          visibleBorders.every(color => !goldFamily.has(color)),
          JSON.stringify(elevation),
        );
      }
      assert.equal(shadows.size, 1, JSON.stringify(elevation));
      assert.deepEqual(
        [
          elevation.modal.borderTopColor,
          elevation.modal.borderRightColor,
          elevation.modal.borderBottomColor,
          elevation.modal.borderLeftColor,
        ],
        [
          elevation.goldBright,
          'rgb(122, 95, 40)',
          'rgb(82, 64, 28)',
          elevation.gold,
        ],
      );
      assert.notEqual(elevation.ordinary.background, elevation.raised);

      if (EVIDENCE_DIR) {
        await page.evaluate(() => {
          showCeremony({
            xp: 106,
            gold: 47,
            vigor: 2,
            note: 'The bell answers.',
          }, 'The Iron Communion');
        });
        await page.locator('#cere-glory:not([disabled])').waitFor();
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `modal-gold-ceremony-${viewportName}.png`),
        });
        await page.locator('#cere-glory').click();
        await page.evaluate(() => {
          void confirmModal('Forsake this path?', {
            title: 'Set the oath aside?',
            okLabel: 'FORSAKE IT',
            danger: true,
          });
        });
        await page.locator('.confirm-win').waitFor();
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `modal-gold-confirm-${viewportName}.png`),
        });
        await page.locator('[data-confirm-cancel]').click();
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('modal controls keep visible keyboard focus against gold trim', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await page.evaluate(() => {
      showModal(`<div class="win center" data-focus-modal>
        <div class="win-title">A CHOICE</div>
        <button class="btn small" type="button" data-modal-action>CONTINUE</button>
      </div>`);
    });
    const action = page.locator('[data-modal-action]');
    await action.waitFor();
    await page.keyboard.press('Tab');
    const focus = await action.evaluate(element => {
      const style = getComputedStyle(element);
      const modalStyle = getComputedStyle(element.closest('[data-focus-modal]'));
      const probe = document.createElement('span');
      probe.style.color = 'var(--gold-bright)';
      document.body.appendChild(probe);
      const goldBright = getComputedStyle(probe).color;
      probe.remove();
      return {
        active: document.activeElement === element,
        focusVisible: element.matches(':focus-visible'),
        modalBorder: modalStyle.borderTopColor,
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        shadow: style.boxShadow,
        goldBright,
      };
    });
    assert.equal(focus.active, true);
    assert.equal(focus.focusVisible, true);
    assert.equal(focus.modalBorder, focus.goldBright);
    assert.equal(focus.outlineColor, focus.goldBright);
    assert.notEqual(focus.outlineStyle, 'none');
    assert.ok(focus.outlineWidth >= 2, JSON.stringify(focus));
    assert.notEqual(focus.shadow, 'none');
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('picker option rows reserve gold for hover and selected state', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'kettlebell');
    const selector = page.locator('.iron-today-control .pixel-select');
    await selector.locator('.pixel-select-summary').evaluate(summary => summary.click());
    const optionChrome = async (locator) => locator.evaluate(element => {
      const tokenColor = (name) => {
        const probe = document.createElement('span');
        probe.style.color = `var(${name})`;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const style = getComputedStyle(element);
      return {
        border: style.borderTopColor,
        marker: getComputedStyle(element, '::before').color,
        edge: tokenColor('--edge'),
        gold: tokenColor('--gold'),
        goldBright: tokenColor('--gold-bright'),
      };
    });
    const resting = selector.locator('.pixel-option[data-value="barbell"]');
    const selected = selector.locator('.pixel-option.selected');
    const restingChrome = await optionChrome(resting);
    const selectedChrome = await optionChrome(selected);
    assert.equal(restingChrome.border, restingChrome.edge);
    assert.equal(restingChrome.marker, restingChrome.edge);
    assert.equal(selectedChrome.border, selectedChrome.goldBright);
    assert.equal(selectedChrome.marker, selectedChrome.goldBright);

    await resting.hover();
    const hoverChrome = await optionChrome(resting);
    assert.equal(hoverChrome.border, hoverChrome.gold);
    assert.equal(hoverChrome.marker, hoverChrome.gold);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('picker option rows and summaries keep visible keyboard focus', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'kettlebell');
    const selector = page.locator('.iron-today-control .pixel-select');
    const summary = selector.locator('.pixel-select-summary');
    await summary.evaluate(element => element.click());
    await summary.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const option = selector.locator('.pixel-option[data-value="barbell"]');
    const optionFocus = await option.evaluate(element => {
      const style = getComputedStyle(element);
      const probe = document.createElement('span');
      probe.style.color = 'var(--gold)';
      document.body.appendChild(probe);
      const gold = getComputedStyle(probe).color;
      probe.remove();
      return {
        active: document.activeElement === element,
        border: style.borderTopColor,
        focusVisible: element.matches(':focus-visible'),
        marker: getComputedStyle(element, '::before').color,
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        gold,
      };
    });
    assert.equal(optionFocus.active, true);
    assert.equal(optionFocus.focusVisible, true);
    assert.equal(optionFocus.border, optionFocus.gold);
    assert.equal(optionFocus.marker, optionFocus.gold);
    assert.notEqual(optionFocus.outlineStyle, 'none');
    assert.ok(optionFocus.outlineWidth >= 2, JSON.stringify(optionFocus));

    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    const summaryFocus = await summary.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        active: document.activeElement === element,
        focusVisible: element.matches(':focus-visible'),
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
      };
    });
    assert.equal(summaryFocus.active, true);
    assert.equal(summaryFocus.focusVisible, true);
    assert.notEqual(summaryFocus.outlineStyle, 'none');
    assert.ok(summaryFocus.outlineWidth >= 2, JSON.stringify(summaryFocus));
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('siege timezone menu flips above the phone dock and stays visible at every viewport', async () => {
  for (const [name, viewport] of Object.entries(GIVER_VIEWPORTS)) {
    const { context, failures, page } = await openMainProfile(viewport);
    try {
      await createGiverProfile(page, 'considered');
      await page.evaluate(() => nav('settings'));
      await page.locator('#settings-game').waitFor();
      const selector = page.locator('#set-siege-tz').locator('..');
      await selector.locator('.pixel-select-summary').evaluate(summary => {
        summary.scrollIntoView({ block: 'end' });
        const dock = document.querySelector('.phone-dock');
        const dockRect = dock?.getBoundingClientRect();
        const usableBottom = dockRect && dockRect.height > 0 ? dockRect.top : window.innerHeight;
        window.scrollBy(0, summary.getBoundingClientRect().bottom - usableBottom + 12);
      });
      const followingTop = () => selector.evaluate(element => (
        element.closest('.formrow').nextElementSibling.getBoundingClientRect().top
      ));
      const beforeOpen = await followingTop();
      await selector.locator('.pixel-select-summary').click();
      await selector.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      assert.equal(await followingTop(), beforeOpen);

      const geometry = await selector.evaluate(element => {
        const summary = element.querySelector('.pixel-select-summary').getBoundingClientRect();
        const menu = element.querySelector('.pixel-select-menu').getBoundingClientRect();
        const dock = document.querySelector('.phone-dock')?.getBoundingClientRect();
        const style = getComputedStyle(element.querySelector('.pixel-select-menu'));
        return {
          clientWidth: element.querySelector('.pixel-select-menu').clientWidth,
          dockTop: dock && dock.height > 0 ? dock.top : window.innerHeight,
          opensUp: element.classList.contains('picker-opens-up'),
          maxBlockSize: parseFloat(style.maxBlockSize),
          menuBottom: menu.bottom,
          menuTop: menu.top,
          overflowY: style.overflowY,
          scrollWidth: element.querySelector('.pixel-select-menu').scrollWidth,
          summaryTop: summary.top,
        };
      });
      if (name === 'phone') {
        assert.equal(geometry.opensUp, true, JSON.stringify(geometry));
        assert.ok(geometry.menuBottom <= geometry.summaryTop + 1);
      }
      assert.ok(geometry.menuTop >= 8);
      assert.ok(geometry.menuBottom <= geometry.dockTop);
      assert.ok(geometry.maxBlockSize <= 230);
      assert.equal(geometry.overflowY, 'auto');
      assert.ok(geometry.scrollWidth <= geometry.clientWidth, JSON.stringify(geometry));
      assert.equal(await selector.locator('.pixel-option').first().isVisible(), true);

      if (EVIDENCE_DIR) {
        const evidenceMenu = selector.locator('.pixel-select-menu');
        await evidenceMenu.evaluate(element => {
          element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) / 2);
        });
        await evidenceMenu.hover({ position: { x: 20, y: 20 } });
        await page.mouse.wheel(0, 40);
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `pixel-select-siege-timezone-${name}.png`),
        });
      }
      await selector.locator('.pixel-option.selected').click();
      assert.equal(await selector.evaluate(element => element.open), false);
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
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
    assert.equal(matrix.length, 18);
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

test('Fenn climb and Elowen offers share the approved tier-tag-title heading grid', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    const slug = await page.evaluate(async () => (await api('/profiles')).current);
    const seed = spawnSync(
      path.join(ROOT, '.venv/bin/python'),
      ['-c', `
import sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
connection.execute(
    "INSERT INTO activities (id, source, start, type, name, moving_time) VALUES (?,?,?,?,?,?)",
    ("browser-climb-heading", "intervals.icu", sys.argv[2], "Climbing", "Gym climbing", 3600),
)
connection.commit()
connection.close()
`, path.join(dataDir, `${slug}.db`), new Date(Date.now() - 86_400_000).toISOString().slice(0, 19)],
      { encoding: 'utf8' },
    );
    assert.equal(seed.status, 0, `Climb heading seed failed: ${seed.stderr || seed.stdout}`);
    await page.evaluate(async () => {
      await api('/settings', {
        method: 'POST',
        body: {
          counsel_charter: { primary: 'climb', secondary: [] },
        },
      });
      await refreshState();
    });

    for (const mode of ['considered', 'self']) {
      await setCounselMode(page, mode);
      for (const giver of ['running', 'mobility']) {
        await openGiverBoard(page, giver);
        await page.waitForFunction(() => (
          !renderLoop
          && !queuedRender
          && !document.getElementById('app')?.hasAttribute('aria-busy')
        ));
        const cards = page.locator('.counsel-path-card');
        assert.equal(await cards.count(), mode === 'considered' ? 1 : 3);

        if (giver === 'running') {
          const climbTiers = (await page.locator('.counsel-tier-label').allTextContents())
            .map(value => value.trim().toLowerCase());
          if (mode === 'self') {
            assert.deepEqual(climbTiers, ['technique', 'volume', 'limit-session']);
          } else {
            assert.equal(climbTiers.length, 1);
            assert.ok(['technique', 'volume', 'limit-session'].includes(climbTiers[0]));
          }
          assert.equal(
            await cards.locator('.chip.mod-climb').count(),
            mode === 'considered' ? 1 : 3,
          );
        }

        const headings = await cards.locator('.offer-heading').evaluateAll(elements => (
          elements.map((heading) => {
            const tier = heading.querySelector('.counsel-tier-row');
            const detail = heading.querySelector('.counsel-tier-detail');
            const title = heading.querySelector('.o-title');
            const tags = heading.querySelector('.offer-title-tags');
            const chip = tags.querySelector('.chip');
            const headingRect = heading.getBoundingClientRect();
            const tierRect = tier.getBoundingClientRect();
            const titleRect = title.getBoundingClientRect();
            const tagsRect = tags.getBoundingClientRect();
            const chipStyle = getComputedStyle(chip);
            return {
              chipMarginRight: chipStyle.marginRight,
              chipPaddingLeft: chipStyle.paddingLeft,
              chipPaddingRight: chipStyle.paddingRight,
              detailDisplay: getComputedStyle(detail).display,
              display: getComputedStyle(heading).display,
              tagsDisplay: getComputedStyle(tags).display,
              titleCenterDelta: Math.abs(
                (titleRect.left + titleRect.right) / 2
                  - (headingRect.left + headingRect.right) / 2,
              ),
              titleStartsBelowFirstRow: titleRect.top
                >= Math.max(tierRect.bottom, tagsRect.bottom) - 1,
              tierAndTagsShareLine: Math.max(tierRect.top, tagsRect.top)
                < Math.min(tierRect.bottom, tagsRect.bottom),
            };
          })
        ));
        assert.equal(
          headings.every(heading => (
            heading.display === 'grid'
            && heading.tagsDisplay === 'flex'
            && heading.detailDisplay === 'none'
            && heading.chipMarginRight === '0px'
            && heading.chipPaddingLeft === heading.chipPaddingRight
            && heading.tierAndTagsShareLine
            && heading.titleStartsBelowFirstRow
            && heading.titleCenterDelta <= 1
          )),
          true,
          JSON.stringify(headings),
        );
        if (EVIDENCE_DIR) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, `heading-grid-${mode}-${giver}-phone.png`),
          });
          await page.setViewportSize(GIVER_VIEWPORTS.desktop);
          await openGiverBoard(page, giver);
          await page.waitForFunction(() => (
            !renderLoop
            && !queuedRender
            && !document.getElementById('app')?.hasAttribute('aria-busy')
          ));
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, `heading-grid-${mode}-${giver}-desktop.png`),
          });
          await page.setViewportSize(GIVER_VIEWPORTS.phone);
        }
      }
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('town keeps all four giver identities while Bram has no offer board', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    for (const [viewportName, viewport] of Object.entries(GIVER_VIEWPORTS)) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => nav('town'));
      await page.locator('.town-scene').waitFor();
      for (const name of ['Old Fenn', 'Grunhilda', 'Ser Bram', 'Sage Elowen']) {
        assert.equal(
          await page.getByRole('button', { name: new RegExp(`Visit ${name}`) }).count(),
          1,
          `${name} is visible at ${viewportName}`,
        );
      }
      assert.match(
        await page.getByRole('button', { name: /Visit Ser Bram/ }).getAttribute('aria-label'),
        /The Old Knight at Rest/,
      );
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `three-giver-town-four-identities__${viewportName}.png`),
        });
      }

      await openGiverBoard(page, 'strength');
      assert.match(await page.locator('.npc-name').innerText(), /Ser Bram the Old Knight at Rest/);
      assert.match(await page.locator('#dlg').innerText(), /set no tasks now/i);
      assert.equal(await page.locator('.giver-offer-board').count(), 0);
      assert.equal(await page.locator('.giver-offer-panel').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).count(), 0);
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
      );
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `retired-ser-bram__${viewportName}.png`),
        });
      }
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
      const raised = await page.evaluate(() => {
        const tokenColor = (name) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${name})`;
          document.body.appendChild(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const overlay = showModal(`<div class="win" data-raised-contrast>
          <span data-tone="ink" style="color:var(--ink)">ink</span>
          <span data-tone="gold" style="color:var(--gold)">gold</span>
          <span data-tone="gold-bright" style="color:var(--gold-bright)">bright gold</span>
          <span data-tone="blue" style="color:var(--blue)">blue</span>
          <span data-tone="green" style="color:var(--green)">green</span>
          <span data-tone="danger" style="color:var(--danger-ink)">danger</span>
          <span data-tone="helper" class="muted">helper</span>
        </div>`);
        toast('The gate does not open.', true);
        const panel = overlay.querySelector('[data-raised-contrast]');
        const background = getComputedStyle(panel).backgroundColor;
        const tones = Object.fromEntries(
          [...panel.querySelectorAll('[data-tone]')].map(element => [
            element.dataset.tone,
            {
              background,
              foreground: getComputedStyle(element).color,
            },
          ]),
        );
        const toastElement = document.querySelector('.toast.err');
        const toastStyle = getComputedStyle(toastElement);
        const result = {
          dangerInk: tokenColor('--danger-ink'),
          dimReadable: tokenColor('--dim-readable'),
          red: tokenColor('--red'),
          tones,
          toast: {
            background: toastStyle.backgroundColor,
            borderTopColor: toastStyle.borderTopColor,
            foreground: toastStyle.color,
          },
        };
        overlay.remove();
        toastElement.remove();
        return result;
      });
      observations.push({
        viewport: { name: viewportName, ...viewport },
        ...capture,
        raised,
        raisedRatios: Object.fromEntries(
          Object.entries(raised.tones).map(([tone, colors]) => [
            tone,
            contrastRatio(parseRgb(colors.foreground), parseRgb(colors.background)),
          ]),
        ),
        toastRatio: contrastRatio(
          parseRgb(raised.toast.foreground),
          parseRgb(raised.toast.background),
        ),
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
    assert.ok(
      observations.every(item => Object.values(item.raisedRatios).every(ratio => ratio >= 4.5)),
      JSON.stringify(observations, null, 2),
    );
    assert.ok(observations.every(item => item.toastRatio >= 4.5), JSON.stringify(observations, null, 2));
    assert.ok(
      observations.every(item => item.raised.toast.foreground === item.raised.dangerInk),
      JSON.stringify(observations, null, 2),
    );
    assert.ok(
      observations.every(item => item.raised.toast.borderTopColor === item.raised.red),
      JSON.stringify(observations, null, 2),
    );
    assert.ok(
      observations.every(item => item.raised.tones.helper.foreground === item.raised.dimReadable),
      JSON.stringify(observations, null, 2),
    );
    assert.ok(observations.every(item => item.assetVersion === '108'), JSON.stringify(observations, null, 2));
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
      for (const viewportName of ['phone', 'desktop']) {
        await page.setViewportSize(GIVER_VIEWPORTS[viewportName]);
        await openGiverBoard(page, 'kettlebell');
        await page.waitForFunction(() => (
          !renderLoop
          && !queuedRender
          && !document.getElementById('app')?.hasAttribute('aria-busy')
        ));
        assert.equal(await page.locator('.counsel-path-card').count(), 1);
        assert.equal(await page.locator('.counsel-path-card .chip.program').count(), 1);
        assert.equal(await page.locator('.counsel-tier-label').count(), 1);
        assert.equal(
          await page.locator('.offer-heading').evaluate(
            element => getComputedStyle(element).display,
          ),
          'grid',
        );
        if (EVIDENCE_DIR) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(
              EVIDENCE_DIR,
              `override-doctrine-grunhilda-${mode}-${viewportName}.png`,
            ),
          });
        }
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
      for (const viewportName of ['phone', 'desktop']) {
        await page.setViewportSize(GIVER_VIEWPORTS[viewportName]);
        await openGiverBoard(page, 'mobility');
        await page.waitForFunction(() => (
          !renderLoop
          && !queuedRender
          && !document.getElementById('app')?.hasAttribute('aria-busy')
        ));
        assert.equal(await page.locator('.counsel-path-card').count(), 1);
        assert.equal(await page.locator('.counsel-path-card.writ').count(), 1);
        assert.equal(await page.locator('.counsel-path-card .chip.rest').count(), 1);
        assert.equal(
          await page.locator('.offer-heading').evaluate(
            element => getComputedStyle(element).display,
          ),
          'grid',
        );
        if (EVIDENCE_DIR) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: path.join(
              EVIDENCE_DIR,
              `override-writ-elowen-${mode}-${viewportName}.png`,
            ),
          });
        }
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

    const intro = page.locator('.giver-board-intro');
    const selector = page.locator('.iron-today-control .pixel-select');
    assert.equal(await selector.count(), 1);
    assert.equal(
      await intro.evaluate(element => element.innerText.replace(/\s+/g, ' ').trim()),
      'One eligible path, chosen from this giver’s work for today. within reach today: any iron',
    );
    assert.equal(
      await selector.evaluate(element => element.parentElement?.parentElement?.classList.contains('giver-board-intro')),
      true,
    );
    assert.equal(
      await page.locator('.iron-today-lead').textContent(),
      'within reach today: ',
    );
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
      'none',
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

test("Grunhilda's inline iron selector floats without displacing her offer", async () => {
  for (const name of ['phone', 'desktop']) {
    const { context, failures, page } = await openMainProfile(
      GIVER_VIEWPORTS[name],
      { reducedMotion: 'reduce' },
    );
    try {
      await createGiverProfile(page, 'considered');
      await openGiverBoard(page, 'kettlebell');

      const intro = page.locator('.giver-board-intro');
      const control = intro.locator('.iron-today-control');
      const selector = control.locator('.pixel-select');
      assert.equal(
        await control.evaluate(element => getComputedStyle(element).display),
        'inline',
      );
      assert.equal(
        await selector.evaluate(element => element.closest('.giver-board-intro') !== null),
        true,
      );
      const lineBoxes = await control.evaluate(element => {
        const leadText = element.querySelector('.iron-today-lead')?.firstChild;
        const valueText = element.querySelector('.pixel-select-label')?.firstChild;
        if (!leadText || !valueText) throw new Error('Iron phrase text is incomplete');
        const leadRange = document.createRange();
        const valueRange = document.createRange();
        leadRange.selectNodeContents(leadText);
        valueRange.selectNodeContents(valueText);
        const lead = leadRange.getBoundingClientRect();
        const value = valueRange.getBoundingClientRect();
        return {
          leadBottom: lead.bottom,
          leadTop: lead.top,
          valueBottom: value.bottom,
          valueTop: value.top,
        };
      });
      assert.ok(
        Math.max(lineBoxes.leadTop, lineBoxes.valueTop)
          < Math.min(lineBoxes.leadBottom, lineBoxes.valueBottom),
        JSON.stringify(lineBoxes),
      );

      const followingTop = () => page.locator('.counsel-path-card').first()
        .evaluate(element => element.getBoundingClientRect().top);
      const beforeOpen = await followingTop();
      await selector.locator('.pixel-select-summary').click();
      await selector.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
      assert.equal(await followingTop(), beforeOpen);
      assert.equal(await selector.locator('.pixel-select-menu').isVisible(), true);
      const geometry = await selector.evaluate(element => {
        const summary = element.querySelector('.pixel-select-summary').getBoundingClientRect();
        const menu = element.querySelector('.pixel-select-menu').getBoundingClientRect();
        return {
          menuBottom: menu.bottom,
          menuLeft: menu.left,
          menuPosition: getComputedStyle(element.querySelector('.pixel-select-menu')).position,
          menuRight: menu.right,
          menuTop: menu.top,
          summaryBottom: summary.bottom,
          summaryTop: summary.top,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        };
      });
      assert.equal(geometry.menuPosition, 'absolute');
      assert.ok(
        Math.min(
          Math.abs(geometry.menuTop - geometry.summaryBottom),
          Math.abs(geometry.menuBottom - geometry.summaryTop),
        ) <= 1,
        JSON.stringify(geometry),
      );
      assert.ok(geometry.menuTop >= 8, JSON.stringify(geometry));
      assert.ok(geometry.menuBottom <= geometry.viewportHeight, JSON.stringify(geometry));
      assert.ok(geometry.menuLeft >= 8, JSON.stringify(geometry));
      assert.ok(geometry.menuRight <= geometry.viewportWidth - 8, JSON.stringify(geometry));
      if (EVIDENCE_DIR) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `iron-selector-open-${name}.png`),
        });
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test("Grunhilda's floating menu renders every option label without clipping", async () => {
  for (const name of ['phone', 'desktop']) {
    const { context, failures, page } = await openMainProfile(
      GIVER_VIEWPORTS[name],
      { reducedMotion: 'reduce' },
    );
    try {
      await createGiverProfile(page, 'considered');
      await openGiverBoard(page, 'kettlebell');
      const selector = page.locator('.iron-today-control .pixel-select');
      await selector.locator('.pixel-select-summary').click();
      await selector.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));

      const menuGeometry = await selector.locator('.pixel-select-menu').evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          viewportWidth: window.innerWidth,
        };
      });
      assert.ok(menuGeometry.left >= 8, JSON.stringify(menuGeometry));
      assert.ok(menuGeometry.right <= menuGeometry.viewportWidth - 8, JSON.stringify(menuGeometry));

      const optionText = await selector.locator('.pixel-option').evaluateAll(options => (
        options.map(option => {
          const textNode = [...option.childNodes]
            .find(node => node.nodeType === Node.TEXT_NODE);
          if (!textNode) throw new Error('Pixel option has no text node');
          const range = document.createRange();
          range.selectNodeContents(textNode);
          const text = range.getBoundingClientRect();
          const button = option.getBoundingClientRect();
          return {
            clientWidth: option.clientWidth,
            label: textNode.textContent,
            optionLeft: button.left,
            optionRight: button.right,
            textLeft: text.left,
            textRight: text.right,
            textWidth: text.width,
          };
        })
      ));
      for (const option of optionText) {
        assert.ok(option.textWidth <= option.clientWidth, JSON.stringify(option));
        assert.ok(option.textLeft >= option.optionLeft, JSON.stringify(option));
        assert.ok(option.textRight <= option.optionRight, JSON.stringify(option));
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test("only Grunhilda's giver intro contains the iron selector", async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.desktop,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    for (const giver of ['running', 'mobility']) {
      await openGiverBoard(page, giver);
      const intro = page.locator('.giver-board-intro');
      assert.equal(
        await intro.evaluate(element => element.textContent.replace(/\s+/g, ' ').trim()),
        'One eligible path, chosen from this giver’s work for today.',
      );
      assert.equal(await intro.locator('.iron-today-control').count(), 0);
      assert.doesNotMatch(await intro.textContent(), /within reach today/i);
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('the page scrollbar uses the shared token-driven treatment', async () => {
  for (const name of ['phone', 'desktop']) {
    const { context, failures, page } = await openMainProfile(GIVER_VIEWPORTS[name]);
    try {
      await createGiverProfile(page, 'considered');
      await page.evaluate(() => nav('settings'));
      await page.locator('#settings-game').waitFor();
      const scrollbar = await page.evaluate(() => {
        const root = document.documentElement;
        const style = getComputedStyle(root);
        const thumb = getComputedStyle(root, '::-webkit-scrollbar-thumb');
        const track = getComputedStyle(root, '::-webkit-scrollbar-track');
        return {
          gold: style.getPropertyValue('--gold').trim(),
          gutter: style.scrollbarGutter,
          isScrollable: root.scrollHeight > window.innerHeight,
          panel2: style.getPropertyValue('--panel2').trim(),
          scrollbarColor: style.scrollbarColor,
          scrollbarWidth: style.scrollbarWidth,
          thumbBackground: thumb.backgroundColor,
          thumbRadius: thumb.borderRadius,
          trackBackground: track.backgroundColor,
        };
      });
      assert.equal(scrollbar.isScrollable, true);
      assert.equal(scrollbar.gutter, 'stable');
      assert.equal(scrollbar.scrollbarWidth, 'thin');
      assert.equal(scrollbar.scrollbarColor, 'rgb(201, 162, 75) rgb(25, 25, 40)');
      assert.equal(scrollbar.thumbBackground, 'rgb(201, 162, 75)');
      assert.equal(scrollbar.thumbRadius, '0px');
      assert.equal(scrollbar.trackBackground, 'rgb(25, 25, 40)');

      if (EVIDENCE_DIR) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `page-scrollbar-${name}.png`),
        });
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
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

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
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
      rendered or is display:none (collapsed, inactive tab). Use settledInnerText
      when the claim really is "the user sees this" AND you have scrolled/opened
      it first; use textContent when you only mean "the element says this". */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BROWSER_PORT_OVERRIDE = process.env.IRON_VALE_BROWSER_PORT;
const BROWSER_PORT = BROWSER_PORT_OVERRIDE === undefined
  ? 0
  : Number(BROWSER_PORT_OVERRIDE);
if (
  BROWSER_PORT_OVERRIDE !== undefined
  && (!Number.isInteger(BROWSER_PORT) || BROWSER_PORT < 1 || BROWSER_PORT > 65_535)
) {
  throw new Error(
    `IRON_VALE_BROWSER_PORT must be an integer from 1 to 65535; received ${BROWSER_PORT_OVERRIDE}.`,
  );
}
const EVIDENCE_DIR = process.env.IRON_VALE_VISUAL_QA_DIR;

// Server-ownership invariant: derive the target URL only from this child uvicorn's
// startup line; the default port 0 must never compete with the human preview.
let BASE_URL = '';
let browser;
let dataDir;
let server;
let serverOutput = '';
let giverProfileSequence = 0;

const GIVER_BOARD_CASES = [
  {
    giver: 'endurance',
    stateName: 'fenn-running',
    identity: 'Old Fenn the Wayfarer',
    portrait: 'fenn',
    selfTiers: ['easy', 'steady', 'quality'],
    warnedTier: 'quality',
  },
  {
    giver: 'strength',
    stateName: 'grunhilda-kettlebell',
    identity: 'Grunhilda Iron-Bell',
    portrait: 'grunhilda',
    selfTiers: ['volume', 'circuit', 'strength'],
    warnedTier: 'strength',
  },
  {
    giver: 'recovery',
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

async function settledInnerText(locator, { timeout = 2000 } = {}) {
  await locator.waitFor();
  let last = await locator.innerText();
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
    const next = await locator.innerText();
    if (next === last && next !== '') return next;
    last = next;
  }
  return last;
}

async function assertExplicitPortAvailable() {
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(
          `IRON_VALE_BROWSER_PORT=${BROWSER_PORT} is already in use. `
          + 'Unset it to let the suite claim an ephemeral port, or choose a free port.',
        ));
        return;
      }
      reject(error);
    });
    probe.listen(BROWSER_PORT, '127.0.0.1', () => probe.close(resolve));
  });
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Scratch Iron Vale server exited early.\n${serverOutput}`);
    }
    const portMatch = serverOutput.match(
      /Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/,
    );
    if (!portMatch) {
      await new Promise(resolve => setTimeout(resolve, 100));
      continue;
    }
    BASE_URL = `http://127.0.0.1:${portMatch[1]}`;
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

async function openMainProfileAt(baseUrl, viewport, options = {}) {
  const context = await browser.newContext({ viewport, ...options });
  const page = await context.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(`page error: ${error.message}`));
  page.on('requestfailed', request => {
    failures.push(`request failed: ${request.method()} ${request.url()}`);
  });
  await page.goto(baseUrl);
  await page.getByRole('button', { name: /Play as Adventurer/ }).click();
  await page.locator('.town-scene').waitFor();
  return { context, failures, page };
}

async function openMainProfile(viewport, options = {}) {
  return openMainProfileAt(BASE_URL, viewport, options);
}

async function startCatalogSourceServer(sourcePath) {
  const scratchDataDir = await mkdtemp(path.join(tmpdir(), 'iron-vale-catalog-browser-'));
  const processOutput = { text: '' };
  const process = spawn(
    path.join(ROOT, '.venv/bin/python'),
    ['-c', `
import sys
from pathlib import Path

import uvicorn
from app import imported_exercises

imported_exercises.SOURCE_PATH = Path(sys.argv[1])
imported_exercises.clear_cache()
uvicorn.run("app.main:app", host="127.0.0.1", port=0)
`, sourcePath],
    {
      cwd: ROOT,
      env: {
        ...globalThis.process.env,
        DATA_DIR: scratchDataDir,
        INTERVALS_BASE_URL: 'http://127.0.0.1:9/api/v1',
        SYNC_INTERVAL_SECONDS: '86400',
      },
      stdio: 'pipe',
    },
  );
  process.stdout.on('data', chunk => { processOutput.text += chunk; });
  process.stderr.on('data', chunk => { processOutput.text += chunk; });

  const deadline = Date.now() + 15_000;
  let baseUrl = '';
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Catalog source server exited early.\n${processOutput.text}`);
    }
    const portMatch = processOutput.text.match(/Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/);
    if (portMatch) {
      baseUrl = `http://127.0.0.1:${portMatch[1]}`;
      try {
        const response = await fetch(`${baseUrl}/api/profiles`);
        if (response.ok) break;
      } catch {
        // The process has announced its port but has not accepted requests yet.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!baseUrl) {
    process.kill('SIGTERM');
    await rm(scratchDataDir, { recursive: true, force: true });
    throw new Error(`Catalog source server did not start.\n${processOutput.text}`);
  }

  return {
    baseUrl,
    async close() {
      if (process.exitCode === null) {
        const exited = new Promise(resolve => process.once('exit', resolve));
        process.kill('SIGTERM');
        await exited;
      }
      await rm(scratchDataDir, { recursive: true, force: true });
    },
  };
}

async function openCompendium(page) {
  await page.evaluate(() => {
    statsTab = 'compendium';
    nav('stats');
  });
  await page.locator('[data-compendium-result-count]').waitFor();
}

async function compendiumResultCount(page) {
  return Number(await page.locator('[data-compendium-result-count]').getAttribute('data-count'));
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
    document.querySelector('#app:not([aria-busy]) .giver-dialogue')?.dataset.giver === giverKey
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
  if (BROWSER_PORT_OVERRIDE !== undefined) await assertExplicitPortAvailable();
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

test('browser harness targets the uvicorn process it launched', () => {
  const portMatch = serverOutput.match(
    /Uvicorn running on http:\/\/127\.0\.0\.1:(\d+)/,
  );
  assert.ok(portMatch, `Uvicorn did not report its bound port.\n${serverOutput}`);
  if (!process.env.IRON_VALE_BROWSER_PORT) assert.equal(BROWSER_PORT, 0);
  assert.equal(BASE_URL, `http://127.0.0.1:${portMatch[1]}`);
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
          displayTitle: root.getPropertyValue('--type-display-title').trim(),
          displayGate: root.getPropertyValue('--type-display-gate').trim(),
          displayCeremony: root.getPropertyValue('--type-display-ceremony').trim(),
          displayDeath: root.getPropertyValue('--type-display-death').trim(),
        },
        body: read('body'),
        button: read('.settings-tabs .btn'),
        input: read('#set-name'),
        title: read('.win-title'),
        logo: read('.hdr .pixel-title'),
        helper: read('.counsel-help'),
        overlay: getComputedStyle(document.body, '::after').backgroundImage,
        quantaSizes: [...document.querySelectorAll('*')]
          .map(element => getComputedStyle(element))
          .filter(style => style.fontFamily.includes('quanta-strike'))
          .map(style => style.fontSize)
          .filter((size, index, sizes) => sizes.indexOf(size) === index)
          .sort(),
      };
    });
    const scaleAfterFocus = await page.evaluate(() => window.visualViewport?.scale || 1);

    await openGiverBoard(page, 'strength');
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
      displayTitle: '26px',
      displayGate: '22px',
      displayCeremony: '18px',
      displayDeath: '26px',
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
    assert.match(settingsStyles.logo.family, /PressStart/);
    assert.equal(settingsStyles.logo.size, '26px');
    assert.match(settingsStyles.helper.family, /quanta-strike-12/);
    assert.equal(settingsStyles.helper.size, '12px');
    assert.equal(
      settingsStyles.quantaSizes.every(size => ['10px', '12px', '14px', '16px'].includes(size)),
      true,
      JSON.stringify(settingsStyles.quantaSizes),
    );
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

    const displayFixture = await page.evaluate(() => {
      const fixture = document.createElement('div');
      fixture.innerHTML = '<div class="ceremony"><h2>QUEST COMPLETE</h2></div><div class="youdied">YOU DIED</div>';
      document.body.appendChild(fixture);
      const describe = selector => {
        const style = getComputedStyle(fixture.querySelector(selector));
        return { family: style.fontFamily, size: style.fontSize };
      };
      const result = {
        ceremony: describe('.ceremony h2'),
        death: describe('.youdied'),
      };
      fixture.remove();
      return result;
    });
    assert.match(displayFixture.ceremony.family, /PressStart/);
    assert.equal(displayFixture.ceremony.size, '18px');
    assert.match(displayFixture.death.family, /PressStart/);
    assert.equal(displayFixture.death.size, '26px');

    const styleSource = await readFile(path.join(ROOT, 'static/style.css'), 'utf8');
    const displayRule = selector => {
      const start = styleSource.indexOf(`${selector} {`);
      return start < 0 ? '' : styleSource.slice(start, styleSource.indexOf('}', start) + 1);
    };
    assert.match(displayRule('.pixel-title'), /font-size:\s*var\(--type-display-title\)/);
    assert.match(displayRule('.ceremony h2'), /font-size:\s*var\(--type-display-ceremony\)/);
    assert.match(displayRule('.youdied'), /font-size:\s*var\(--type-display-death\)/);
    assert.doesNotMatch(displayRule('.pixel-title'), /--type-title/);
    assert.doesNotMatch(displayRule('.ceremony h2'), /--type-title/);
    assert.doesNotMatch(displayRule('.youdied'), /--type-title/);

    const gateContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    try {
      const gatePage = await gateContext.newPage();
      await gatePage.goto(BASE_URL);
      const gateLogo = await gatePage.locator('.pixel-title').evaluate(element => {
        const style = getComputedStyle(element);
        return { family: style.fontFamily, size: style.fontSize };
      });
      assert.match(gateLogo.family, /PressStart/);
      assert.equal(gateLogo.size, '22px');
    } finally {
      await gateContext.close();
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('weekly planner chooser opens a complete slot editor with a readable selected state', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  const contrastRatio = (foreground, background) => {
    const parse = value => value.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(Number);
    const luminance = value => parse(value)
      .map(channel => channel / 255)
      .map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const foregroundLuminance = luminance(foreground);
    const backgroundLuminance = luminance(background);
    return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05);
  };
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    const schedule = page.locator('#counsel-schedule');
    await schedule.waitFor();

    if (EVIDENCE_DIR) {
      await page.locator('.hdr-brand').screenshot({
        path: path.join(EVIDENCE_DIR, 'weekly-planner-logo-375.png'),
      });
    }

    await schedule.locator('[data-schedule-cell="monday-0"]').click();
    const chooser = page.locator('.counsel-schedule-chooser');
    const close = chooser.getByRole('button', { name: 'Close chooser', exact: true });
    await chooser.waitFor();
    assert.match(await chooser.locator('[data-schedule-current]').textContent(), /current:\s*open/i);
    assert.equal(await chooser.getByRole('button', { name: 'Optional: off', exact: true }).count(), 1);
    assert.equal(await chooser.getByRole('button', { name: 'Remove slot', exact: true }).count(), 1);
    assert.equal(await chooser.getByRole('button', { name: 'Endurance', exact: true }).count(), 1);
    assert.deepEqual(
      await page.evaluate(() => counselScheduleDraft.monday),
      [{ optional: false }],
    );
    const closeState = await chooser.evaluate(win => {
      const closeButton = win.querySelector('[aria-label="Close chooser"]');
      const title = win.querySelector('.win-title');
      const current = win.querySelector('[data-schedule-current]');
      const style = getComputedStyle(closeButton);
      const titleStyle = getComputedStyle(title);
      const root = getComputedStyle(document.documentElement);
      const resolveColor = token => {
        const probe = document.createElement('span');
        probe.style.color = token;
        document.body.appendChild(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      };
      const rect = closeButton.getBoundingClientRect();
      const chooserRect = win.getBoundingClientRect();
      const titleTextRange = document.createRange();
      titleTextRange.selectNodeContents(title);
      const titleTextRect = titleTextRange.getBoundingClientRect();
      return {
        usesSharedClose: closeButton.classList.contains('lens-box-close'),
        text: closeButton.textContent.trim(),
        position: style.position,
        top: style.top,
        right: style.right,
        borderStyle: style.borderTopStyle,
        color: style.color,
        dim: resolveColor(root.getPropertyValue('--dim')),
        titlePaddingLeft: titleStyle.paddingLeft,
        titlePaddingRight: titleStyle.paddingRight,
        titleTextAlign: titleStyle.textAlign,
        currentFollowsTitle: title.nextElementSibling === current,
        titleCenterDelta: Math.abs(
          (titleTextRect.left + titleTextRect.width / 2) - (chooserRect.left + chooserRect.width / 2),
        ),
        width: rect.width,
        height: rect.height,
      };
    });
    assert.equal(closeState.usesSharedClose, true);
    assert.equal(closeState.text, '✕');
    assert.equal(closeState.position, 'absolute');
    assert.equal(closeState.top, '4px');
    assert.equal(closeState.right, '6px');
    assert.equal(closeState.borderStyle, 'none');
    assert.equal(closeState.color, closeState.dim);
    assert.equal(closeState.titlePaddingLeft, closeState.titlePaddingRight);
    assert.notEqual(closeState.titlePaddingLeft, '0px');
    assert.equal(closeState.currentFollowsTitle, true);
    assert.ok(closeState.titleCenterDelta <= 1, JSON.stringify(closeState));
    assert.ok(closeState.width >= 44 && closeState.height >= 44, JSON.stringify(closeState));
    if (EVIDENCE_DIR) {
      await chooser.screenshot({
        path: path.join(EVIDENCE_DIR, 'weekly-planner-chooser-375.png'),
      });
    }

    await chooser.getByRole('button', { name: 'Endurance', exact: true }).click();
    await chooser.getByRole('button', { name: 'Run', exact: true }).click();
    await chooser.getByRole('button', { name: 'Easy', exact: true }).click();
    await schedule.locator('[data-schedule-cell="monday-0"]').click();
    const selected = chooser.getByRole('button', { name: 'Endurance', exact: true });
    const resting = await selected.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    await selected.hover();
    const hovered = await selected.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    assert.deepEqual(hovered, resting);
    assert.ok(contrastRatio(hovered.color, hovered.background) >= 4.5, JSON.stringify(hovered));
    if (EVIDENCE_DIR) {
      await chooser.screenshot({
        path: path.join(EVIDENCE_DIR, 'weekly-planner-selected-hover-375.png'),
      });
    }
    await close.click();

    await page.setViewportSize({ width: 1280, height: 900 });
    if (EVIDENCE_DIR) {
      await page.locator('.hdr-brand').screenshot({
        path: path.join(EVIDENCE_DIR, 'weekly-planner-logo-1280.png'),
      });
    }
    await schedule.locator('[data-schedule-cell="monday-0"]').click();
    await page.mouse.move(0, 0);
    if (EVIDENCE_DIR) {
      await chooser.screenshot({
        path: path.join(EVIDENCE_DIR, 'weekly-planner-chooser-1280.png'),
      });
    }
    await selected.hover();
    if (EVIDENCE_DIR) {
      await chooser.screenshot({
        path: path.join(EVIDENCE_DIR, 'weekly-planner-selected-hover-1280.png'),
      });
    }
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
    assert.deepEqual(
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
  assert.match(await page.locator('.hdr-char').textContent(), /Browser Ranger/);
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
    assert.match(await status.textContent(), /ravens delayed since/i);
    assert.equal((await status.textContent()).includes('raven-test-key'), false);
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

test('Settings retains a focus charter and disables it only when the active loop owns focus', async () => {
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
      await page.locator('#settings-panel-apis').textContent(),
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
    assert.match(await page.locator('#counsel-focus-hint').textContent(), /choosing freely; focus guides the counsel/i);
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_charter),
      { primary: 'run', secondary: ['strength'] },
    );

    await page.locator('#set-counsel-mode').locator('..').locator('summary').click();
    await page.getByRole('menuitemradio', { name: 'Scheduled' }).click();
    await page.getByText('Your schedule is your focus.', { exact: true }).waitFor();
    await page.locator('#counsel-focus[disabled]').waitFor();
    assert.equal(
      await page.locator('#counsel-focus-hint').textContent(),
      'Your schedule is your focus.',
    );

    await page.locator('#set-counsel-mode').locator('..').locator('summary').click();
    await page.getByRole('menuitemradio', { name: 'Considered' }).click();
    await page.locator('#counsel-focus:not([disabled])').waitFor();
    assert.match(
      await page.locator('#counsel-focus-hint').textContent(),
      /Optional\. Focus only guides the daily pointer/,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Settings authors the weekly counsel plan through the sequencer grid', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(() => nav('settings'));
    await page.locator('#settings-game').waitFor();

    const schedule = page.locator('#counsel-schedule');
    await schedule.waitFor();
    assert.equal(await schedule.evaluate(element => element.classList.contains('counsel-block')), false);
    assert.equal(
      await page.locator('#counsel-focus').evaluate(element => element.classList.contains('counsel-block')),
      true,
    );
    assert.deepEqual(
      await schedule.locator('[data-schedule-day-heading]').allTextContents(),
      ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
    );
    assert.equal(await schedule.locator('[data-schedule-row]').count(), 1);
    assert.equal(await schedule.locator('[data-schedule-cell]').count(), 7);
    assert.deepEqual(
      await schedule.locator('[data-schedule-cell]').allTextContents()
        .then(labels => labels.map(label => label.trim())),
      ['+', '+', '+', '+', '+', '+', '+'],
    );
    const emptyCellColors = await schedule.locator('[data-schedule-cell]').first().evaluate(element => {
      const style = getComputedStyle(element);
      const root = getComputedStyle(document.documentElement);
      const gold = [
        root.getPropertyValue('--gold').trim(),
        root.getPropertyValue('--gold-bright').trim(),
      ].map(color => {
        const probe = document.createElement('span');
        probe.style.color = color;
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      });
      return {
        background: style.backgroundColor,
        border: [
          style.borderTopColor,
          style.borderRightColor,
          style.borderBottomColor,
          style.borderLeftColor,
        ],
        color: style.color,
        gold,
        panel2: (() => {
          const probe = document.createElement('span');
          probe.style.color = root.getPropertyValue('--panel2');
          document.body.appendChild(probe);
          const resolved = getComputedStyle(probe).color;
          probe.remove();
          return resolved;
        })(),
      };
    });
    assert.equal(emptyCellColors.background, emptyCellColors.panel2);
    assert.equal(
      [emptyCellColors.background, emptyCellColors.color, ...emptyCellColors.border]
        .some(color => emptyCellColors.gold.includes(color)),
      false,
    );
    assert.deepEqual(
      await page.locator('#set-counsel-mode').locator('..').locator('[role="menuitemradio"]').allTextContents()
        .then(labels => labels.map(label => label.trim())),
      ['Considered', 'Choose-your-own', 'Scheduled'],
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );

    const initialMetrics = await schedule.locator('[data-schedule-cell]').evaluateAll(cells => ({
      sizes: cells.map(cell => {
        const rect = cell.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      noOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) <= document.documentElement.clientWidth,
      gridFits: cells[0].closest('.counsel-schedule-grid').scrollWidth
        <= cells[0].closest('.counsel-schedule-grid').clientWidth,
    }));
    assert.equal(initialMetrics.noOverflow, true);
    assert.equal(initialMetrics.gridFits, true);
    assert.equal(
      initialMetrics.sizes.every(size => size.width >= 44 && size.height >= 44),
      true,
      JSON.stringify(initialMetrics.sizes),
    );
    await page.setViewportSize({ width: 320, height: 812 });
    const narrowMetrics = await schedule.locator('[data-schedule-cell]').evaluateAll(cells => ({
      sizes: cells.map(cell => {
        const rect = cell.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
      cellsVisible: cells.every(cell => {
        const rect = cell.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= document.documentElement.clientWidth;
      }),
      firstCell: (() => {
        const rect = cells[0].getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      })(),
      lastCell: (() => {
        const rect = cells.at(-1).getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      })(),
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      noOverflow: Math.max(
        document.documentElement.scrollWidth,
        document.body.scrollWidth,
      ) <= document.documentElement.clientWidth,
      gridClientWidth: cells[0].closest('.counsel-schedule-grid').clientWidth,
      gridScrollWidth: cells[0].closest('.counsel-schedule-grid').scrollWidth,
      gridFits: cells[0].closest('.counsel-schedule-grid').scrollWidth
        <= cells[0].closest('.counsel-schedule-grid').clientWidth,
    }));
    assert.equal(narrowMetrics.noOverflow, true, JSON.stringify(narrowMetrics));
    assert.equal(narrowMetrics.gridFits, true, JSON.stringify(narrowMetrics));
    assert.equal(narrowMetrics.cellsVisible, true, JSON.stringify(narrowMetrics));
    assert.equal(
      narrowMetrics.sizes.every(size => size.width >= 44 && size.height >= 44),
      true,
      JSON.stringify(narrowMetrics.sizes),
    );
    await page.setViewportSize({ width: 375, height: 812 });
    if (EVIDENCE_DIR) {
      await writeFile(
        path.join(EVIDENCE_DIR, 'counsel-schedule-grid-metrics.json'),
        JSON.stringify({
          phone375: {
            viewport: { width: 375, height: 812 },
            cell: initialMetrics.sizes[0],
            documentFits: initialMetrics.noOverflow,
            gridFits: initialMetrics.gridFits,
          },
          phone320: {
            viewport: { width: 320, height: 812 },
            cell: narrowMetrics.sizes[0],
            documentFits: narrowMetrics.noOverflow,
            gridFits: narrowMetrics.gridFits,
          },
        }, null, 2),
      );
      await schedule.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-empty-375.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await schedule.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-empty-1280.png'),
      });
      await page.setViewportSize({ width: 768, height: 1024 });
      await schedule.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-empty-768.png'),
      });
      await page.setViewportSize({ width: 375, height: 812 });
    }

    const cell = (day, row) => schedule.locator(
      `[data-schedule-cell="${day}-${row}"]`,
    );
    const chooser = () => page.locator('.counsel-schedule-chooser');

    await cell('monday', 0).click();
    if (EVIDENCE_DIR) {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-chooser-root-375.png'),
      });
    }
    await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
    await chooser().getByRole('button', { name: 'Run', exact: true }).click();
    if (EVIDENCE_DIR) {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-chooser-effort-375.png'),
      });
    }
    await chooser().getByRole('button', { name: 'Easy', exact: true }).click();
    assert.equal(await page.locator('.toast').count(), 0);
    assert.equal(await schedule.locator('[data-schedule-row]').count(), 2);
    assert.deepEqual(
      await cell('monday', 0).evaluate(element => ({
        shape: element.dataset.scheduleSlotShape,
        modality: element.dataset.scheduleModality,
        sprite: element.querySelector('canvas')?.dataset.sprite,
        mark: element.querySelector('[data-schedule-tier-mark]')?.textContent,
      })),
      { shape: 'sized', modality: 'run', sprite: 'schedule_run', mark: 'E' },
    );
    const runGlyphColor = await cell('monday', 0).evaluate(element => {
      const canvas = element.querySelector('canvas');
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let first = null;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] === 0) continue;
        first = `rgb(${pixels[index]}, ${pixels[index + 1]}, ${pixels[index + 2]})`;
        break;
      }
      const token = getComputedStyle(document.documentElement)
        .getPropertyValue('--activity-run').trim();
      const probe = document.createElement('span');
      probe.style.color = token;
      document.body.appendChild(probe);
      const resolvedToken = getComputedStyle(probe).color;
      probe.remove();
      return { first, resolvedToken, token };
    });
    assert.notEqual(runGlyphColor.token, '');
    assert.equal(runGlyphColor.first, runGlyphColor.resolvedToken);

    await cell('monday', 1).click();
    await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
    await chooser().getByRole('button', { name: 'Climb', exact: true }).click();
    await chooser().getByRole('button', { name: 'Volume', exact: true }).click();
    assert.equal(await schedule.locator('[data-schedule-row]').count(), 3);
    assert.equal(await schedule.locator('[data-schedule-cell^="monday-"]').count(), 3);
    assert.equal(await schedule.locator('[data-schedule-cell^="friday-"]').count(), 1);
    assert.equal(await schedule.locator('[data-schedule-cell="friday-2"]').count(), 0);
    assert.equal(await schedule.locator('[data-schedule-gap="friday-2"]').count(), 1);
    assert.equal(await schedule.locator('[data-schedule-cell="monday-2"]').textContent(), '+');

    await cell('tuesday', 0).click();
    await chooser().getByRole('button', { name: 'Strength', exact: true }).click();
    await chooser().getByRole('button', { name: 'Starting Strength', exact: true }).click();
    assert.deepEqual(
      await cell('tuesday', 0).evaluate(element => ({
        shape: element.dataset.scheduleSlotShape,
        sprite: element.querySelector('canvas')?.dataset.sprite,
        mark: element.querySelector('[data-schedule-tier-mark]')?.textContent,
      })),
      { shape: 'routine', sprite: 'schedule_strength', mark: 'R' },
    );

    await cell('wednesday', 0).click();
    await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
    await chooser().getByRole('button', { name: 'Ride', exact: true }).click();
    assert.equal(
      await settledInnerText(chooser().locator('[data-schedule-choice]').last()),
      'LET THE COUNSEL CHOOSE',
    );
    await chooser().getByRole('button', { name: 'Let the counsel choose', exact: true }).click();
    assert.equal(await cell('wednesday', 0).getAttribute('data-schedule-slot-shape'), 'open');

    await cell('thursday', 0).click();
    await chooser().getByRole('button', { name: 'Close chooser', exact: true }).click();
    assert.equal(await cell('thursday', 0).getAttribute('data-schedule-slot-shape'), 'open');
    assert.equal(await cell('thursday', 0).locator('[data-schedule-any-path]').count(), 1);

    await cell('friday', 0).click();
    await chooser().getByRole('button', { name: 'Strength', exact: true }).click();
    await chooser().getByRole('button', { name: 'Create a new routine', exact: true }).click();
    assert.equal(await page.locator('.toast').count(), 0);

    assert.equal(
      await page.locator('.counsel-schedule-routine-builder label').evaluateAll(labels => (
        labels.every(label => getComputedStyle(label).color === 'rgb(106, 160, 200)')
      )),
      true,
    );
    assert.equal(
      await page.getByRole('button', { name: 'FORGE ROUTINE', exact: true }).evaluate(
        button => button.classList.contains('green'),
      ),
      false,
    );
    await page.locator('#schedule-routine-name').fill('Rings and sliders');
    await page.locator('#schedule-routine-exercise').selectOption({ label: 'Pull-Up' });
    await page.locator('#schedule-routine-sets').fill('4');
    await page.locator('#schedule-routine-reps').fill('6');
    await page.getByRole('button', { name: 'ADD', exact: true }).click();
    let routinePostCount = 0;
    let releaseRoutinePost;
    const routinePostGate = new Promise(resolve => { releaseRoutinePost = resolve; });
    let sawRoutinePost;
    const routinePostStarted = new Promise(resolve => { sawRoutinePost = resolve; });
    await page.route('**/api/routines', async route => {
      if (route.request().method() === 'POST') {
        routinePostCount += 1;
        sawRoutinePost();
        await routinePostGate;
      }
      await route.continue();
    });
    const routineWrite = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && response.url().endsWith('/api/routines')
    ));
    await page.evaluate(() => {
      G.saveCounselRoutine();
      G.saveCounselRoutine();
    });
    await routinePostStarted;
    assert.equal(routinePostCount, 1);
    assert.equal(await page.locator('#schedule-routine-save').isDisabled(), true);
    await page.evaluate(() => G.saveCounselRoutine());
    assert.equal(routinePostCount, 1);
    releaseRoutinePost();
    assert.equal((await routineWrite).status(), 200);
    await page.getByText('Routine forged into the weekly plan.', { exact: true }).waitFor();
    await page.locator('.overlay').waitFor({ state: 'detached' });
    assert.equal(await cell('friday', 0).getAttribute('data-schedule-slot-shape'), 'routine');
    assert.equal(await schedule.locator('[data-schedule-cell^="friday-"]').count(), 2);
    assert.equal(await schedule.locator('[data-schedule-gap="friday-2"]').count(), 1);

    await cell('saturday', 0).click();
    await chooser().getByRole('button', { name: 'Recovery', exact: true }).click();
    await chooser().getByRole('button', { name: 'Rest', exact: true }).click();
    assert.deepEqual(
      await cell('saturday', 0).evaluate(element => ({
        modality: element.dataset.scheduleModality,
        sprite: element.querySelector('canvas')?.dataset.sprite,
        mark: element.querySelector('[data-schedule-tier-mark]')?.textContent,
      })),
      { modality: 'mobility', sprite: 'schedule_rest', mark: 'R' },
    );

    await cell('sunday', 0).click();
    await chooser().getByRole('button', { name: 'Strength', exact: true }).click();
    assert.equal(
      await settledInnerText(chooser().locator('[data-schedule-choice]').last()),
      'LET THE COUNSEL CHOOSE',
    );
    await chooser().getByRole('button', { name: 'Let the counsel choose', exact: true }).click();

    await cell('monday', 0).click();
    assert.match(
      await page.locator('[data-schedule-current]').textContent(),
      /run · easy/i,
    );
    await chooser().getByRole('button', { name: 'Optional: off', exact: true }).click();
    await page.waitForFunction(() => (
      document.activeElement?.getAttribute('aria-label') === 'Optional: on'
    ));
    await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
    await chooser().getByRole('button', { name: 'Run', exact: true }).click();
    await chooser().getByRole('button', { name: 'Steady', exact: true }).click();
    await cell('monday', 1).click();
    await chooser().getByRole('button', { name: 'Remove slot', exact: true }).click();
    assert.equal(await schedule.locator('[data-schedule-row]').count(), 2);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
    );

    const settingsWrite = page.waitForResponse(response => (
      response.request().method() === 'POST'
      && response.url().endsWith('/api/settings')
    ));
    await schedule.getByRole('button', { name: 'SAVE WEEKLY PLAN', exact: true }).click();
    assert.equal((await settingsWrite).status(), 200);
    await page.getByText('Weekly counsel plan saved.', { exact: true }).waitFor();
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_schedule.monday),
      [
        { optional: true, tier: 'steady', modality: 'run' },
      ],
    );
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_schedule.tuesday),
      [{ routine: 'starting_strength', optional: false }],
    );
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_schedule.wednesday),
      [{ modality: 'ride', optional: false }],
    );
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_schedule.thursday),
      [{ optional: false }],
    );
    assert.match(
      await page.evaluate(() => S.state.settings.counsel_schedule.friday[0].routine),
      /^custom:r[0-9a-f]{8}$/,
    );
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_schedule.saturday),
      [{ modality: 'rest', optional: false }],
    );
    assert.deepEqual(
      await page.evaluate(() => S.state.settings.counsel_schedule.sunday),
      [{ modality: 'strength', optional: false }],
    );
    assert.equal(
      await page.evaluate(() => S.state.settings.counsel_mode),
      'considered',
    );

    if (EVIDENCE_DIR) {
      await page.waitForFunction(() => (
        document.querySelectorAll('.key-pop-ghost').length === 0
      ));
      await page.locator('.toast').waitFor({ state: 'detached' });
      await cell('monday', 1).click();
      await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
      await chooser().getByRole('button', { name: 'Climb', exact: true }).click();
      await chooser().getByRole('button', { name: 'Volume', exact: true }).click();
      await page.waitForFunction(() => (
        document.querySelectorAll('.key-pop-ghost').length === 0
      ));
      await schedule.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-populated-375.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await schedule.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-populated-1280.png'),
      });
      await page.setViewportSize({ width: 768, height: 1024 });
      await schedule.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-populated-768.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await cell('monday', 0).click();
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-chooser-filled-1280.png'),
      });
      await chooser().getByRole('button', { name: 'Close chooser', exact: true }).click();

      await page.setViewportSize({ width: 320, height: 812 });
      await cell('thursday', 1).click();
      await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
      await chooser().getByRole('button', { name: 'Swim', exact: true }).click();
      await chooser().getByRole('button', { name: 'Quality', exact: true }).click();
      await cell('friday', 1).click();
      await chooser().getByRole('button', { name: 'Endurance', exact: true }).click();
      await chooser().getByRole('button', { name: 'Climb', exact: true }).click();
      await chooser().getByRole('button', { name: 'Volume', exact: true }).click();
      assert.equal(
        await page.evaluate(() => Math.max(
          document.documentElement.scrollWidth,
          document.body.scrollWidth,
        ) <= document.documentElement.clientWidth),
        true,
      );
      assert.equal(
        await schedule.locator('.counsel-schedule-grid').evaluate(grid => (
          grid.scrollWidth <= grid.clientWidth
        )),
        true,
      );
      await page.waitForFunction(() => (
        document.querySelectorAll('.key-pop-ghost').length === 0
      ));
      await schedule.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'counsel-schedule-grid-all-glyphs-320.png'),
      });
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('weekly planner reports kept oaths without grading a poor week', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  const renderAdherence = async (done, planned) => {
    await page.evaluate(async ({ completed, total }) => {
      const days = S.state.counsel_schedule_options.days;
      S.state.settings.counsel_schedule = Object.fromEntries(days.map((day, index) => [
        day,
        index < 5
          ? [{ modality: 'run', tier: 'easy', optional: false }]
          : [],
      ]));
      S.state.counsel_schedule_adherence = completed === null
        ? null
        : { done: completed, planned: total };
      counselScheduleDraft = null;
      await render();
    }, { completed: done, total: planned });
    await page.locator('#counsel-schedule').waitFor();
  };
  try {
    await createGiverProfile(page, 'scheduled');
    await page.evaluate(() => nav('settings'));
    await page.locator('#counsel-schedule').waitFor();

    await renderAdherence(5, 5);
    const good = page.locator('.counsel-schedule-adherence');
    assert.equal(await good.textContent(), 'Sworn paths kept this week: 5 of 5.');
    const goodPresentation = await good.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        className: element.className,
        background: style.backgroundColor,
        border: style.border,
        color: style.color,
        fontWeight: style.fontWeight,
      };
    });
    assert.doesNotMatch(
      await page.locator('#counsel-schedule').textContent(),
      /\b(?:CTL|ATL|HRV|streak|weight)\b/i,
    );
    if (EVIDENCE_DIR) {
      await page.locator('#counsel-schedule').screenshot({
        path: path.join(EVIDENCE_DIR, 'schedule-adherence-good-375.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('#counsel-schedule').screenshot({
        path: path.join(EVIDENCE_DIR, 'schedule-adherence-good-1280.png'),
      });
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await renderAdherence(1, 5);
    const poor = page.locator('.counsel-schedule-adherence');
    assert.equal(await poor.textContent(), 'Sworn paths kept this week: 1 of 5.');
    const poorPresentation = await poor.evaluate(element => {
      const style = getComputedStyle(element);
      return {
        className: element.className,
        background: style.backgroundColor,
        border: style.border,
        color: style.color,
        fontWeight: style.fontWeight,
      };
    });
    assert.deepEqual(poorPresentation, goodPresentation);
    assert.doesNotMatch(await poor.getAttribute('class'), /danger|good|poor|success|warning/);
    if (EVIDENCE_DIR) {
      await page.locator('#counsel-schedule').screenshot({
        path: path.join(EVIDENCE_DIR, 'schedule-adherence-poor-375.png'),
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator('#counsel-schedule').screenshot({
        path: path.join(EVIDENCE_DIR, 'schedule-adherence-poor-1280.png'),
      });
    }

    await renderAdherence(null, null);
    assert.equal(await page.locator('.counsel-schedule-adherence').count(), 0);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Hall tapestry and sequencer share promoted activity colours', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await createGiverProfile(page, 'considered');
    const days = [
      ['2026-07-20', 'run'],
      ['2026-07-21', 'ride'],
      ['2026-07-22', 'swim'],
      ['2026-07-23', 'climb'],
      ['2026-07-24', 'strength'],
      ['2026-07-25', 'mobility'],
      ['2026-07-26', null],
    ].map(([date, cat]) => ({ date, cat }));
    await page.route('**/api/tapestry', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ days, woven: 6, best_stretch: 6 }),
    }));
    await page.evaluate(() => {
      statsTab = 'calendar';
      nav('stats');
    });
    const tapestry = page.locator('#tapestry-cv');
    await tapestry.waitFor();
    if (EVIDENCE_DIR) {
      await tapestry.screenshot({
        path: path.join(EVIDENCE_DIR, 'tapestry-shared-colours.png'),
      });
    }
    const colors = await tapestry.evaluate(canvas => {
      const ctx = canvas.getContext('2d');
      const root = getComputedStyle(document.documentElement);
      const categories = ['run', 'ride', 'swim', 'climb', 'strength', 'mobility'];
      return categories.map((category, row) => {
        const pixel = ctx.getImageData(27, 19 + row * 14, 1, 1).data;
        return {
          category,
          pixel: `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`,
          token: root.getPropertyValue(`--activity-${category}`).trim(),
        };
      });
    });
    assert.equal(colors.every(item => item.token), true, JSON.stringify(colors));
    assert.deepEqual(
      colors.map(item => item.pixel),
      await page.evaluate(values => values.map(value => {
        const probe = document.createElement('span');
        probe.style.color = value;
        document.body.appendChild(probe);
        const resolved = getComputedStyle(probe).color;
        probe.remove();
        return resolved;
      }), colors.map(item => item.token)),
    );
    const contrast = await page.evaluate(categories => {
      const root = getComputedStyle(document.documentElement);
      const luminance = color => {
        const channels = color.match(/[a-f0-9]{2}/gi)
          .map(value => parseInt(value, 16) / 255)
          .map(value => value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4);
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
      };
      const background = luminance(root.getPropertyValue('--panel2').trim());
      return categories.map(category => {
        const color = root.getPropertyValue(`--activity-${category}`).trim();
        const foreground = luminance(color);
        return {
          category,
          color,
          ratio: (Math.max(background, foreground) + 0.05)
            / (Math.min(background, foreground) + 0.05),
        };
      });
    }, ['run', 'ride', 'climb', 'strength', 'swim', 'mobility']);
    assert.equal(contrast.every(item => item.ratio >= 3), true, JSON.stringify(contrast));
    if (EVIDENCE_DIR) {
      await writeFile(
        path.join(EVIDENCE_DIR, 'sequencer-modality-contrast.json'),
        JSON.stringify(contrast, null, 2),
      );
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium lazily renders the full catalog and opens apostrophe-name detail', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    const bootCatalogRequests = await page.evaluate(() => (
      performance.getEntriesByType('resource')
        .map(entry => new URL(entry.name).pathname)
        .filter(pathname => pathname.startsWith('/api/catalog'))
    ));
    assert.deepEqual(bootCatalogRequests, []);

    await page.evaluate(() => {
      statsTab = 'compendium';
      nav('stats');
    });
    const rows = page.locator('.compendium-list-row');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 881);
    assert.equal(await page.locator('[data-compendium-catalog-status]').count(), 0);
    assert.equal(await page.locator('.compendium-list canvas').count(), 0);

    const detailResponse = page.waitForResponse(response => (
      new URL(response.url()).pathname === '/api/catalog/Conans_Wheel'
    ));
    await page.getByRole('button', { name: "Conan's Wheel", exact: true }).click();
    assert.equal((await detailResponse).status(), 200);
    await page.locator('.compendium-detail-name').filter({ hasText: "Conan's Wheel" }).waitFor();
    assert.equal(await page.locator('.compendium-detail-pane canvas').count(), 1);
    assert.ok(await page.locator('.compendium-prose li').count() > 0);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium explains an unreadable imported catalog without exposing developer text', async () => {
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'iron-vale-catalog-source-'));
  const sourcePath = path.join(sourceDir, 'malformed-exercises.json');
  await writeFile(sourcePath, '{not json', 'utf8');
  const sourceServer = await startCatalogSourceServer(sourcePath);
  const { context, failures, page } = await openMainProfileAt(
    sourceServer.baseUrl,
    { width: 375, height: 812 },
  );
  try {
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/state');
      return { body: await response.json(), status: response.status };
    });
    assert.equal(state.status, 200);
    assert.equal(state.body.imported_exercise_catalog.source_error, 'source file is not valid JSON');

    await openCompendium(page);
    assert.equal(await compendiumResultCount(page), 26);
    const status = page.locator('[data-compendium-catalog-status="error"]');
    await status.waitFor();
    const playerCopy = await status.textContent();
    assert.match(playerCopy, /could not read the imported ledger/i);
    assert.match(playerCopy, /only the Vale's 26 sworn movements are listed/i);
    assert.doesNotMatch(playerCopy, /source file is not valid JSON/i);
    if (EVIDENCE_DIR) {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'compendium-catalog-unreadable-phone.png') });
      await page.setViewportSize(GIVER_VIEWPORTS.tablet);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'compendium-catalog-unreadable-tablet.png') });
      await page.setViewportSize(GIVER_VIEWPORTS.desktop);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'compendium-catalog-unreadable-desktop.png') });
    }

    await page.evaluate(() => G.openDevConsole());
    const consoleInput = page.getByRole('textbox', { name: 'Console command' });
    await consoleInput.fill('catalog');
    await consoleInput.press('Enter');
    const consoleText = await page.locator('#dev-console-output').textContent();
    assert.match(consoleText, /loaded_rows: 0/);
    assert.match(consoleText, /skipped_rows: 0/);
    assert.match(consoleText, /skipped_by_reason: \{\}/);
    assert.match(consoleText, /source_error: source file is not valid JSON/);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
    await sourceServer.close();
    await rm(sourceDir, { recursive: true, force: true });
  }
});

test('Compendium quietly reports skipped imported rows and the console gives the breakdown', async () => {
  const sourceDir = await mkdtemp(path.join(tmpdir(), 'iron-vale-catalog-source-'));
  const sourcePath = path.join(sourceDir, 'partial-exercises.json');
  const payload = JSON.parse(await readFile(
    path.join(ROOT, 'vendor/free-exercise-db/exercises.json'),
    'utf8',
  ));
  payload[0].primaryMuscles = ['review-only muscle'];
  await writeFile(sourcePath, JSON.stringify(payload), 'utf8');
  const sourceServer = await startCatalogSourceServer(sourcePath);
  const { context, failures, page } = await openMainProfileAt(
    sourceServer.baseUrl,
    { width: 1280, height: 900 },
  );
  try {
    const state = await page.evaluate(async () => {
      const response = await fetch('/api/state');
      return { body: await response.json(), status: response.status };
    });
    assert.equal(state.status, 200);
    assert.deepEqual(state.body.imported_exercise_catalog, {
      loaded_rows: 872,
      skipped_rows: 1,
      skipped_by_reason: { 'unknown muscle': 1 },
      source_error: null,
    });

    await openCompendium(page);
    assert.equal(await compendiumResultCount(page), 880);
    const status = page.locator('[data-compendium-catalog-status="partial"]');
    await status.waitFor();
    assert.match(await status.textContent(), /set aside 1 imported page/i);
    if (EVIDENCE_DIR) {
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'compendium-catalog-partial-desktop.png') });
      await page.setViewportSize(GIVER_VIEWPORTS.tablet);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'compendium-catalog-partial-tablet.png') });
      await page.setViewportSize(GIVER_VIEWPORTS.phone);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'compendium-catalog-partial-phone.png') });
    }

    await page.evaluate(() => G.openDevConsole());
    const consoleInput = page.getByRole('textbox', { name: 'Console command' });
    await consoleInput.fill('catalog');
    await consoleInput.press('Enter');
    const consoleText = await page.locator('#dev-console-output').textContent();
    assert.match(consoleText, /loaded_rows: 872/);
    assert.match(consoleText, /skipped_rows: 1/);
    assert.match(consoleText, /skipped_by_reason: \{"unknown muscle":1\}/);
    assert.match(consoleText, /source_error: null/);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
    await sourceServer.close();
    await rm(sourceDir, { recursive: true, force: true });
  }
});

test('Compendium renders Kettlebell Halo on a three-times per-muscle map', async () => {
  for (const [label, viewport] of Object.entries(GIVER_VIEWPORTS)) {
    const { context, failures, page } = await openMainProfile(viewport);
    try {
      await openCompendium(page);
      await page.getByRole('button', { name: 'Kettlebell Halo', exact: true }).click();
      await page.locator('.compendium-detail-name').filter({ hasText: 'Kettlebell Halo' }).waitFor();

      const canvas = page.locator('.compendium-detail-pane canvas[data-musclemap]');
      const halo = await canvas.evaluate(element => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        const colors = new Set();
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] === 0) continue;
          colors.add(`#${[pixels[index], pixels[index + 1], pixels[index + 2]]
            .map(channel => channel.toString(16).padStart(2, '0')).join('')}`);
        }
        const detail = element.closest('.compendium-detail-scroll');
        return {
          colors: [...colors].sort(),
          detailClientWidth: detail.clientWidth,
          detailScrollWidth: detail.scrollWidth,
          height: element.height,
          primary: JSON.parse(decodeURIComponent(element.dataset.primaryMuscles)),
          scale: element.width / 68,
          secondary: JSON.parse(decodeURIComponent(element.dataset.secondaryMuscles)),
          width: element.width,
        };
      });
      assert.deepEqual(halo.primary, ['shoulders']);
      assert.deepEqual(halo.secondary, []);
      assert.deepEqual(halo.colors, ['#272735', '#2c2c3e', '#f0c83c']);
      assert.equal(halo.scale, 3);
      assert.equal(halo.width, 204);
      assert.equal(halo.height, 192);
      assert.ok(halo.detailScrollWidth <= halo.detailClientWidth, `${label}: detail has no horizontal overflow`);
      if (EVIDENCE_DIR) {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, `compendium-muscle-map-${label}-halo.png`) });
      }

      await page.evaluate(() => G.compBack());
      await page.getByRole('button', { name: 'Kettlebell Clean & Press', exact: true }).click();
      await page.locator('.compendium-detail-name').filter({ hasText: 'Kettlebell Clean & Press' }).waitFor();
      const classifiedColors = await canvas.evaluate(element => {
        const pixels = element.getContext('2d').getImageData(0, 0, element.width, element.height).data;
        const colors = new Set();
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] === 0) continue;
          colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
        }
        return colors.size;
      });
      assert.ok(classifiedColors > 4, `${label}: primary and secondary identities remain visible`);
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `compendium-muscle-map-${label}-classified.png`),
        });
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test('Muscle Ledger renders primary and secondary source muscles at three-times scale', async () => {
  for (const [label, viewport] of Object.entries(GIVER_VIEWPORTS)) {
    const { context, failures, page } = await openMainProfile(viewport);
    try {
      await createGiverProfile(page, 'self');
      await page.evaluate(async () => {
        await api('/lifts', {
          method: 'POST',
          body: { exercise: 'Seated Head Harness Neck Resistance', weight: 0, reps: 10 },
        });
        await api('/lifts', {
          method: 'POST',
          body: { exercise: 'Kettlebell Floor Press', weight: 16, reps: 8 },
        });
        statsTab = 'iron';
        nav('stats');
      });

      const canvas = page.locator('.hall-body canvas[data-musclemap]');
      await canvas.waitFor();
      const ledger = await canvas.evaluate(element => ({
        height: element.height,
        primary: JSON.parse(decodeURIComponent(element.dataset.primaryMuscles)),
        scale: element.width / 68,
        secondary: JSON.parse(decodeURIComponent(element.dataset.secondaryMuscles)),
        width: element.width,
      }));
      assert.deepEqual([...ledger.primary].sort(), ['chest', 'neck']);
      assert.deepEqual([...ledger.secondary].sort(), ['shoulders', 'triceps']);
      assert.ok(ledger.scale >= 2, `${label}: Ledger muscle map is rendered above 1x`);
      assert.equal(ledger.width, 204);
      assert.equal(ledger.height, 192);
      assert.equal(await page.locator('.hall-body canvas[data-bodymap]').count(), 0);
      assert.equal(await page.locator('.hall-body table.rpg').first().locator('tbody tr').count(), 8);
      const caption = page.locator('.hall-body .ledger-map-caption');
      assert.match(await caption.textContent(), /bright: primary within 3 days.*dim: secondary-only/);
      assert.equal(
        await caption.evaluate(element => getComputedStyle(element).color),
        'rgb(149, 140, 168)',
      );
      if (EVIDENCE_DIR) {
        await page.screenshot({ path: path.join(EVIDENCE_DIR, `muscle-ledger-${label}.png`) });
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test('Compendium detail contains every field at narrow and wide split-pane widths', async () => {
  for (const viewport of [{ width: 744, height: 900 }, { width: 1280, height: 900 }]) {
    const { context, failures, page } = await openMainProfile(viewport);
    try {
      await openCompendium(page);
      await page.getByRole('button', { name: 'Kettlebell Halo', exact: true }).click();
      await page.locator('.compendium-detail-name').filter({ hasText: 'Kettlebell Halo' }).waitFor();
      const overflows = await page
        .locator('.compendium-detail-pane, .compendium-detail-pane *')
        .evaluateAll(elements => elements
          .filter(element => element.clientWidth > 0 && element.scrollWidth > element.clientWidth)
          .map(element => ({
            className: element.className,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            tagName: element.tagName,
            text: element.textContent.trim().slice(0, 80),
          })));
      assert.deepEqual(overflows, [], `${viewport.width}px detail overflow:\n${JSON.stringify(overflows, null, 2)}`);
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `compendium-detail-${viewport.width}.png`),
        });
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test('Compendium parser returns exact catalog counts and keeps apostrophe names usable', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    assert.equal(await compendiumResultCount(page), 881);
    await search.fill('kettlebells');
    assert.equal(await compendiumResultCount(page), 62);
    await search.fill('beginner');
    assert.equal(await compendiumResultCount(page), 528);
    await search.fill('kettlebells beginner');
    assert.equal(await compendiumResultCount(page), 9);

    await search.fill("CONAN'S WHEEL");
    assert.equal(await compendiumResultCount(page), 1);
    assert.deepEqual(await page.locator('.compendium-list-row').allTextContents(), ["Conan's Wheel"]);
    await page.getByRole('button', { name: "Conan's Wheel", exact: true }).click();
    await page.locator('.compendium-detail-name').filter({ hasText: "Conan's Wheel" }).waitFor();
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium parser uses longest matches and resolves chest as a muscle', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    await search.fill('lower back');
    assert.equal(await compendiumResultCount(page), 27);
    assert.deepEqual(await page.locator('.compendium-query-chip').allTextContents(), ['muscle: lower back ×']);

    await search.fill('chest');
    assert.equal(await page.locator('[data-chip-dimension="muscle"][data-chip-value="chest"]').count(), 1);
    assert.equal(await page.locator('[data-chip-dimension="group"][data-chip-value="chest"]').count(), 0);
    assert.equal(await page.locator('[data-compendium-vocabulary-value]').count(), 50);

    await search.fill('legs');
    assert.equal(await page.locator('[data-chip-dimension="group"][data-chip-value="legs"]').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Include secondary muscles' }).isVisible(), false);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium muscle parsing defaults to primary and can include secondary', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    await search.fill('glutes');
    assert.equal(await compendiumResultCount(page), 22);

    const secondary = page.getByRole('button', { name: 'Include secondary muscles' });
    assert.equal(await secondary.isVisible(), true);
    assert.equal(await secondary.getAttribute('aria-pressed'), 'false');
    await secondary.click();
    assert.equal(await secondary.getAttribute('aria-pressed'), 'true');
    assert.equal(await compendiumResultCount(page), 247);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium parser uses OR within dimensions and AND across them', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    await search.fill('barbell');
    const barbellCount = await compendiumResultCount(page);
    await search.fill('barbell dumbbell');
    const twoEquipmentCount = await compendiumResultCount(page);
    assert.ok(twoEquipmentCount > barbellCount);

    await search.fill('barbell dumbbell legs');
    const narrowedCount = await compendiumResultCount(page);
    assert.ok(narrowedCount > 0);
    assert.ok(narrowedCount < twoEquipmentCount);

    await search.fill('kettlebells glutes');
    assert.equal(await compendiumResultCount(page), 0);
    assert.match(await page.locator('.compendium-list-empty').textContent(), /No page/i);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium filter chips demote parsed tokens to literal name text', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    await search.fill('pull');
    assert.equal(await compendiumResultCount(page), 378);
    const chip = page.locator('[data-chip-dimension="force"][data-chip-value="pull"]');
    assert.equal((await chip.textContent()).trim(), 'force: pull ×');
    await chip.click();
    assert.equal(await search.inputValue(), '"pull"');
    assert.equal(await compendiumResultCount(page), 46);
    assert.equal((await page.locator('[data-chip-dimension="text"]').textContent()).trim(), 'text: "pull" ×');
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium vocabulary reference appends terms without selection state', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    const reference = page.locator('.compendium-vocabulary');
    await page.getByRole('button', { name: 'Open filter vocabulary' }).click();
    assert.equal(await reference.isVisible(), true);
    await page.getByRole('button', { name: 'Close the index' }).click();
    assert.equal(await reference.isVisible(), false);
    assert.equal(await search.inputValue(), '');
    assert.equal(
      await page.getByRole('button', { name: 'Open filter vocabulary' }).getAttribute('aria-expanded'),
      'false',
    );
    await page.getByRole('button', { name: 'Open filter vocabulary' }).click();
    const kettlebells = reference.getByRole('button', { name: 'Kettlebells', exact: true });
    assert.equal(await kettlebells.getAttribute('aria-pressed'), null);
    await kettlebells.click();
    assert.equal(await search.inputValue(), 'kettlebells');
    assert.equal(await compendiumResultCount(page), 62);
    assert.equal(await page.locator('[data-chip-dimension="equipment"][data-chip-value="kettlebells"]').count(), 1);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium clearing and filtering preserve an open detail and correct ARIA state', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    await page.getByRole('button', { name: "Conan's Wheel", exact: true }).click();
    await page.locator('.compendium-detail-name').filter({ hasText: "Conan's Wheel" }).waitFor();
    assert.equal(await page.locator('.compendium-list-row[aria-pressed]').count(), 0);
    assert.equal(
      await page.getByRole('button', { name: "Conan's Wheel", exact: true }).getAttribute('aria-current'),
      'true',
    );

    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    await search.fill('Kettlebell Halo');
    assert.equal(await compendiumResultCount(page), 1);
    assert.equal(await page.getByRole('button', { name: "Conan's Wheel", exact: true }).count(), 0);
    assert.equal(await page.locator('.compendium-detail-name').textContent(), "Conan's Wheel");

    await search.fill('a page maud never filed');
    assert.equal(await compendiumResultCount(page), 0);
    await page.locator('.compendium-list-empty').waitFor();
    assert.match(await page.locator('.compendium-list-empty').textContent(), /No page/i);
    assert.equal(await page.locator('.compendium-detail-name').textContent(), "Conan's Wheel");

    await page.getByRole('button', { name: 'Clear the search' }).click();
    assert.equal(await compendiumResultCount(page), 881);
    assert.equal(await search.inputValue(), '');
    assert.equal(await page.locator('.compendium-detail-name').textContent(), "Conan's Wheel");
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium neck muscle parsing stays independent of the seven groups', async () => {
  const { context, failures, page } = await openMainProfile({ width: 1280, height: 900 });
  try {
    await openCompendium(page);
    const search = page.getByRole('searchbox', { name: 'Search the Compendium' });
    await search.fill('neck');
    assert.equal(await compendiumResultCount(page), 8);
    await page.getByRole('button', { name: 'Include secondary muscles' }).click();
    assert.equal(await compendiumResultCount(page), 9);

    const ungroupedNeckNames = new Set([
      'Isometric Neck Exercise - Front And Back',
      'Isometric Neck Exercise - Sides',
      'Lying Face Down Plate Neck Resistance',
      'Lying Face Up Plate Neck Resistance',
      'Neck-SMR',
      'Seated Head Harness Neck Resistance',
      'Side Neck Stretch',
    ]);
    for (const groupName of ['legs', 'posterior', 'chest', 'back', 'shoulders', 'arms', 'core']) {
      await search.fill(groupName);
      const visibleNames = await page.locator('.compendium-list-row').allTextContents();
      assert.equal(visibleNames.some(name => ungroupedNeckNames.has(name)), false, groupName);
    }
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Compendium parsing search stays compact at phone, tablet, and desktop', async () => {
  for (const [label, viewport] of Object.entries(GIVER_VIEWPORTS)) {
    const { context, failures, page } = await openMainProfile(viewport);
    try {
      await openCompendium(page);
      const geometry = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        listTop: document.querySelector('.compendium-list-pane').getBoundingClientRect().top,
        search: (() => {
          const input = document.querySelector('.compendium-search');
          const rect = input.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            background: getComputedStyle(input).backgroundColor,
          };
        })(),
      }));
      assert.ok(geometry.search.width > 0, `${label}: search is visible`);
      assert.equal(geometry.search.background, 'rgb(0, 0, 0)', `${label}: search uses the shared form skin`);
      assert.ok(geometry.documentWidth <= geometry.viewportWidth, `${label}: no horizontal overflow`);
      assert.ok(geometry.listTop < 420, `${label}: movement list starts near the top (${geometry.listTop}px)`);
      if (viewport.width <= 719) {
        assert.ok(geometry.search.height >= 44, `${label}: search keeps a phone touch target`);
        const undersized = await page.locator('.compendium-search-tools button').evaluateAll(buttons => (
          buttons
            .map(button => ({ label: button.textContent.trim(), height: button.getBoundingClientRect().height }))
            .filter(button => button.height > 0 && button.height < 44)
        ));
        assert.deepEqual(undersized, [], `${label}: filter controls keep phone targets`);
      }
      if (EVIDENCE_DIR) {
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `compendium-search-${label}-default.png`),
        });
      }

      await page.getByRole('searchbox', { name: 'Search the Compendium' }).fill('glutes');
      await page.getByRole('button', { name: 'Include secondary muscles' }).click();
      await page.getByRole('button', { name: 'Open filter vocabulary' }).click();
      assert.equal(await compendiumResultCount(page), 247);
      assert.ok(await page.locator('.compendium-vocabulary').isVisible(), `${label}: vocabulary open`);
      const expandedGeometry = await page.evaluate(() => ({
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
      }));
      assert.ok(
        expandedGeometry.documentWidth <= expandedGeometry.viewportWidth,
        `${label}: expanded filters do not overflow`,
      );
      if (EVIDENCE_DIR) {
        await page.waitForFunction(() => !document.querySelector('.key-pop-ghost'));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `compendium-search-${label}-vocabulary.png`),
        });
      }
      assert.deepEqual(failures, []);
    } finally {
      await context.close();
    }
  }
});

test('Settings renders v0.27 routine and open slots in the sequencer grid', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(async () => {
      const days = S.state.counsel_schedule_options.days;
      const counsel_schedule = Object.fromEntries(days.map(day => [day, []]));
      counsel_schedule.monday = [
        { routine: 'starting_strength', optional: false },
        { modality: 'climb', optional: true },
        { optional: false },
      ];
      await api('/settings', { method: 'POST', body: { counsel_schedule } });
      await refreshState();
      nav('settings');
    });

    const schedule = page.locator('#counsel-schedule');
    await schedule.waitFor();
    assert.equal(await schedule.locator('[data-schedule-row]').count(), 4);
    assert.deepEqual(
      await schedule.locator('[data-schedule-cell^="monday-"]').evaluateAll(cells => (
        cells.slice(0, 3).map(cell => ({
          shape: cell.dataset.scheduleSlotShape,
          sprite: cell.querySelector('canvas')?.dataset.sprite || null,
          anyPath: Boolean(cell.querySelector('[data-schedule-any-path]')),
          optional: Boolean(cell.querySelector('[data-schedule-optional-mark]')),
        }))
      )),
      [
        { shape: 'routine', sprite: 'schedule_strength', anyPath: false, optional: false },
        { shape: 'open', sprite: 'schedule_climb', anyPath: false, optional: true },
        { shape: 'open', sprite: null, anyPath: true, optional: false },
      ],
    );
    await schedule.locator('[data-schedule-cell="monday-0"]').click();
    assert.match(
      await page.locator('[data-schedule-current]').textContent(),
      /starting strength/i,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('Scheduled mode serves the written giver path and names an unwritten board', async () => {
  const { context, failures, page } = await openMainProfile({ width: 375, height: 812 });
  try {
    await createGiverProfile(page, 'considered');
    await page.evaluate(async () => {
      const days = S.state.counsel_schedule_options.days;
      const counsel_schedule = Object.fromEntries(
        days.map(day => [day, [{ modality: 'run', tier: 'easy', optional: false }]]),
      );
      await api('/settings', {
        method: 'POST',
        body: { counsel_mode: 'scheduled', counsel_schedule },
      });
      await refreshState();
    });

    await openGiverBoard(page, 'endurance');
    assert.equal(await page.locator('.counsel-path-card').count(), 1);
    assert.equal(
      await page.locator('.counsel-path-card').getAttribute('data-tier-label'),
      'easy',
    );
    assert.equal(
      await page.locator('.giver-offer-board').getAttribute('data-counsel-mode'),
      'scheduled',
    );

    await openGiverBoard(page, 'strength');
    assert.equal(await page.locator('.counsel-path-card').count(), 0);
    assert.equal(
      await settledInnerText(page.locator('.giver-offer-board .win-title')),
      'NO PATH WRITTEN',
    );
    await page.waitForFunction(() => (
      document.getElementById('dlg')?.textContent
        ?.includes('No path of mine is written for today.')
    ));
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

    await openGiverBoard(page, 'strength');
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
      assert.equal((await label.textContent()).trim().toLowerCase(), setting.rowLabel);
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

    await openGiverBoard(page, 'strength');
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

    await page.evaluate(() => nav('doctrines', { giver: 'strength' }));
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

    await openGiverBoard(page, 'strength');
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
      await openGiverBoard(page, 'strength');
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
    await openGiverBoard(page, 'strength');
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
    await openGiverBoard(page, 'strength');
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

    await openGiverBoard(page, 'endurance');
    assert.match(await page.locator('.npc-name').textContent(), /Old Fenn the Wayfarer/);
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
    assert.equal(acceptPayload.giver, 'endurance');
    assert.equal(Number.isInteger(acceptPayload.offer_id), true);
    assert.equal(await page.evaluate(() => S.params.react), 'accept');
    assert.match(await page.locator('.npc-name').textContent(), /Old Fenn the Wayfarer/);
    assert.equal(await page.locator('[data-portrait="fenn"]').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).count(), 0);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.filter(quest => quest.giver === 'endurance').length;
      }),
      1,
    );
    assert.equal(await page.locator('.toast.err').count(), 0);

    await page.evaluate(async () => {
      try {
        await api('/quests/accept', {
          method: 'POST',
          body: { giver: 'endurance', offer_id: -1 },
        });
      } catch {
        // The shared api() helper owns the visible refusal toast.
      }
    });
    const refusal = page.locator('.toast.err');
    await refusal.waitFor();
    assert.match(await refusal.textContent(), /already carry a quest/i);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.filter(quest => quest.giver === 'endurance').length;
      }),
      1,
    );
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('legacy completion thanks migrate giver keys without colliding with the strength focus name', async () => {
  const { context, failures, page } = await openMainProfile(GIVER_VIEWPORTS.phone);
  try {
    const migrated = await page.evaluate(() => {
      localStorage.setItem('iv_lastq', JSON.stringify({
        title: 'A Legacy Quest',
        ts: Date.now(),
        thanked: {
          running: true,
          kettlebell: true,
          strength: true,
          mobility: true,
        },
      }));
      return lastQuestDone();
    });
    assert.deepEqual(migrated.thanked, {
      endurance: true,
      strength: true,
      bram: true,
      recovery: true,
    });
    assert.equal(migrated.giverKeys, 2);

    const stored = await page.evaluate(
      () => JSON.parse(localStorage.getItem('iv_lastq')),
    );
    assert.deepEqual(stored, migrated);
    assert.deepEqual(failures, []);
  } finally {
    await context.close();
  }
});

test('giver navigation waits for the requested giver instead of stale outgoing DOM', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  let releaseOffer = () => {};
  try {
    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'endurance');
    await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).click();
    await page.getByText('Your Sworn Quest', { exact: true }).waitFor();

    let markRequestHeld;
    const requestHeld = new Promise(resolve => {
      markRequestHeld = resolve;
    });
    const heldOffer = new Promise(resolve => {
      releaseOffer = resolve;
    });
    await page.route('**/api/offers/bram', async route => {
      markRequestHeld();
      await heldOffer;
      await route.continue();
    });

    let openingSettled = false;
    const opening = openGiverBoard(page, 'bram').then(() => {
      openingSettled = true;
    });
    await requestHeld;
    await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    }));
    await new Promise(resolve => setImmediate(resolve));

    const staleEvidence = await page.evaluate(requestedGiver => ({
      oldActiveBranch: /Your Sworn (Quest|Writ)/.test(
        document.querySelector('.win-title')?.textContent || '',
      ),
      oldRetiredBranch: (
        S.params.giver === requestedGiver
        && !S.state.offerable_givers.includes(requestedGiver)
        && Boolean(document.querySelector('.npc-head'))
      ),
      renderedGiver: document.querySelector('.giver-dialogue')?.dataset.giver || null,
      requestedGiver,
    }), 'bram');
    const settledWhileStale = openingSettled;

    releaseOffer();
    await opening;

    assert.equal(staleEvidence.oldActiveBranch, true);
    assert.equal(staleEvidence.oldRetiredBranch, true);
    assert.equal(staleEvidence.renderedGiver, 'endurance');
    assert.equal(
      settledWhileStale,
      false,
      `Outgoing DOM satisfied the giver wait: ${JSON.stringify(staleEvidence)}`,
    );
    assert.equal(
      await page.locator('.giver-dialogue').getAttribute('data-giver'),
      'bram',
    );
    assert.match(await page.locator('.npc-name').textContent(), /Ser Bram/);
    assert.deepEqual(failures, []);
  } finally {
    releaseOffer();
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
          assert.match(await page.locator('.npc-name').textContent(), new RegExp(giverCase.identity));
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
    await openGiverBoard(page, 'endurance');
    const hardWarningCard = page.locator('.counsel-path-card.has-wellness-warning');
    await hardWarningCard.scrollIntoViewIfNeeded();
    assert.equal(
      (await hardWarningCard.locator('.counsel-tier-label').textContent()).toLowerCase(),
      'quality',
    );
    assert.match(
      await hardWarningCard.locator('.counsel-eligibility.warn').textContent(),
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
      for (const giver of ['endurance', 'recovery']) {
        await openGiverBoard(page, giver);
        await page.waitForFunction(() => (
          !renderLoop
          && !queuedRender
          && !document.getElementById('app')?.hasAttribute('aria-busy')
        ));
        const cards = page.locator('.counsel-path-card');
        assert.equal(await cards.count(), mode === 'considered' ? 1 : 3);

        if (giver === 'endurance') {
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
      assert.deepEqual(
        await page.locator('.town-scene > .trow').evaluateAll(rows => rows.map(row => (
          Array.from(row.querySelectorAll(':scope > .bld > button'))
            .map(button => button.getAttribute('aria-label').split(':')[0])
        ))),
        [
          ['Visit Old Fenn', 'Visit Grunhilda', 'Visit Sage Elowen'],
          ['Visit The Ledger House', 'Visit Hall of Records', 'Visit Ser Bram'],
          ['Visit The Menagerie', 'Visit The Crankwerk', 'Visit The Colosseum', 'Visit The Undercroft'],
        ],
        `town rows preserve giver, record-keeper, and diversion groupings at ${viewportName}`,
      );
      assert.equal(await page.locator('#bld-bram').count(), 1);
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
        if (viewportName === 'phone') {
          await page.screenshot({
            path: path.join(EVIDENCE_DIR, 'three-giver-town-four-identities__phone-full.png'),
            fullPage: true,
          });
        }
      }

      await openGiverBoard(page, 'bram');
      assert.match(await page.locator('.npc-name').textContent(), /Ser Bram the Old Knight at Rest/);
      assert.match(await page.locator('#dlg').textContent(), /set no tasks now/i);
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

test('legacy Bram quests keep his identity without lift or routine affordances', async () => {
  const { context, failures, page } = await openMainProfile(
    GIVER_VIEWPORTS.phone,
    { reducedMotion: 'reduce' },
  );
  try {
    await createGiverProfile(page, 'considered');
    const slug = await page.evaluate(async () => (await api('/profiles')).current);
    const details = {
      target_minutes: 30,
      intensity: 'easy',
      structure: 'Thirty minutes on the wall.',
      xp: 40,
      gold: 15,
      vigor: 2,
      routine: [{ exercise: 'Pull-Up', sets: 3, reps: 5 }],
    };
    const seed = spawnSync(
      path.join(ROOT, '.venv/bin/python'),
      ['-c', `
import sqlite3, sys
connection = sqlite3.connect(sys.argv[1])
connection.execute(
    "INSERT INTO quests (giver, kind, title, details, status, accepted_at) "
    "VALUES ('bram', 'climb_technique', 'An Old Oath of the Wall', ?, 'active', ?)",
    (sys.argv[2], sys.argv[3]),
)
connection.commit()
connection.close()
`, path.join(dataDir, `${slug}.db`), JSON.stringify(details), new Date().toISOString()],
      { encoding: 'utf8' },
    );
    assert.equal(seed.status, 0, `Legacy Bram quest seed failed: ${seed.stderr || seed.stdout}`);
    await page.evaluate(async () => {
      S.state = await api('/state');
    });

    for (const [viewportName, viewport] of Object.entries({
      phone: GIVER_VIEWPORTS.phone,
      desktop: GIVER_VIEWPORTS.desktop,
    })) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => nav('town'));
      await page.waitForFunction(() => (
        S.screen === 'town'
        && document.querySelector('.town-scene')
        && !renderLoop
        && !queuedRender
        && !document.getElementById('app')?.hasAttribute('aria-busy')
      ));
      assert.equal(await page.getByRole('button', { name: 'LOG SETS', exact: true }).count(), 0);
      assert.equal(await page.locator('.chip.mod-lift').count(), 0);
      const bramBuilding = page.locator('#bld-bram > button');
      assert.equal(await bramBuilding.count(), 1);
      assert.equal(await bramBuilding.getAttribute('aria-label'), 'Visit Ser Bram: The Old Knight at Rest');

      await openGiverBoard(page, 'bram');
      await page.waitForFunction(() => (
        !renderLoop
        && !queuedRender
        && getComputedStyle(document.getElementById('app')).visibility !== 'hidden'
      ));
      assert.match(await page.locator('.npc-name').textContent(), /Ser Bram the Old Knight at Rest/);
      assert.equal(await page.locator('[data-portrait="bram"]').count(), 1);
      assert.equal(await page.locator('.offer .o-title').textContent(), 'An Old Oath of the Wall');
      const honorButton = page.getByRole('button', { name: 'COMPLETE ON HONOR', exact: true });
      await honorButton.waitFor({ state: 'visible' });
      assert.equal(await honorButton.count(), 1);
      assert.equal(await page.getByRole('button', { name: 'OPEN TRAINING LOG', exact: true }).count(), 0);
      assert.equal(await page.getByRole('button', { name: 'DOCTRINES & ROUTINES', exact: true }).count(), 0);
      assert.equal(await page.locator('.chip.mod-lift').count(), 0);
      if (EVIDENCE_DIR) {
        await page.evaluate(() => new Promise(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        await page.screenshot({
          path: path.join(EVIDENCE_DIR, `bram-legacy-climb-${viewportName}.png`),
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
      await openGiverBoard(page, 'endurance');
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
    assert.ok(observations.every(item => item.assetVersion === '126'), JSON.stringify(observations, null, 2));
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
    await openGiverBoard(page, 'endurance');

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
    await openGiverBoard(page, 'endurance');
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
    await openGiverBoard(page, 'endurance');
    await page.getByRole('button', { name: 'ACCEPT QUEST', exact: true }).click();
    await page.getByText('Your Sworn Quest', { exact: true }).waitFor();
    const successToast = page.locator('.toast:not(.err)');
    await successToast.waitFor();
    assert.match(await successToast.textContent(), /oath is inked/i);
    assert.deepEqual(acceptStatuses, [200]);
    assert.equal(
      await page.evaluate(async () => {
        const state = await api('/state');
        return state.active_quests.filter(quest => quest.giver === 'endurance').length;
      }),
      1,
    );
    if (EVIDENCE_DIR) {
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'accept-continuation-phone.png'),
      });
    }

    await createGiverProfile(page, 'considered');
    await openGiverBoard(page, 'endurance');
    const staleOfferId = Number(
      await page.locator('.counsel-path-card').first().getAttribute('data-offer-id'),
    );
    await setCounselMode(page, 'self');
    await page.evaluate(async offerId => {
      try {
        await api('/quests/accept', {
          method: 'POST',
          body: { giver: 'endurance', offer_id: offerId },
        });
      } catch {
        // The error toast is the player-visible refusal.
      }
    }, staleOfferId);
    await page.locator('.toast.err').waitFor();
    assert.match(await page.locator('.toast.err').textContent(), /offer has faded/i);
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
          body: { giver: 'endurance', option_key: { malformed: true } },
        });
      } catch {
        // The error toast is the player-visible refusal.
      }
    });
    assert.match(await page.locator('.toast.err').textContent(), /offer key is not recognized/i);
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
        body: { giver: 'strength', key: 'starting_strength' },
      });
      await refreshState();
    });
    for (const mode of ['considered', 'self']) {
      await setCounselMode(page, mode);
      for (const viewportName of ['phone', 'desktop']) {
        await page.setViewportSize(GIVER_VIEWPORTS[viewportName]);
        await openGiverBoard(page, 'strength');
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
        await openGiverBoard(page, 'recovery');
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
    await openGiverBoard(page, 'strength');

    const intro = page.locator('.giver-board-intro');
    const selector = page.locator('.iron-today-control .pixel-select');
    assert.equal(await selector.count(), 1);
    assert.equal(
      (await settledInnerText(intro)).replace(/\s+/g, ' ').trim(),
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
      await openGiverBoard(page, 'strength');

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
      await openGiverBoard(page, 'strength');
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
    for (const giver of ['endurance', 'recovery']) {
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
    await openGiverBoard(page, 'strength');

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
    await openGiverBoard(page, 'strength');
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
    await page.evaluate(() => nav('giver', { giver: 'recovery' }));
    await page.waitForFunction(() => (
      document.querySelector('.giver-offer-board')?.dataset.giver === 'recovery'
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
      document.querySelector('.giver-offer-board')?.dataset.giver === 'endurance'
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

      await page.evaluate(() => nav('giver', { giver: 'recovery' }));
      await page.waitForFunction(() => (
        document.querySelector('.giver-offer-board')?.dataset.giver === 'recovery'
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
        giver: 'endurance',
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

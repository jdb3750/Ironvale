import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = 'http://127.0.0.1:8322';
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

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'iron-vale-browser-'));
  if (EVIDENCE_DIR) await mkdir(EVIDENCE_DIR, { recursive: true });
  server = spawn(
    path.join(ROOT, '.venv/bin/uvicorn'),
    ['app.main:app', '--host', '127.0.0.1', '--port', '8322'],
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
    assert.equal(await page.locator('[data-counsel-secondary="iron"]').getAttribute('aria-pressed'), 'false');
    assert.equal(
      await page.locator('[data-counsel-secondary="iron"]').evaluate(
        element => element.classList.contains('active'),
      ),
      false,
    );
    assert.deepEqual(
      await toggleStyle(page.locator('[data-counsel-secondary="iron"]')),
      toggleOffStyle,
    );
    assert.equal(
      await page.locator('.counsel-focus-choices').evaluate(
        element => getComputedStyle(element).justifyContent,
      ),
      'center',
    );
    await page.getByRole('button', { name: 'Iron' }).click();
    assert.deepEqual(
      await toggleStyle(page.locator('[data-counsel-secondary="iron"]')),
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
      { primary: 'run', secondary: ['iron'] },
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
              elements.every(element => /intervals\.icu/i.test(element.textContent))
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

/* Capture the identity mockups. Re-runnable; the widths are arguments, not
   constants, because the phone width is still Joe's call (390 vs 414 vs the
   320/375/430 contract). Playwright is the GLOBAL node module — run it as:

     PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
     /opt/node22/bin/node docs/mockups/identity/capture.mjs \
       --file docs/mockups/identity/border-kit.html \
       --desktop 1440@2 --phone 390@1 --phone 414@1

   Each --phone/--desktop is WIDTH@DEVICESCALEFACTOR. Output goes to
   <basename>-desktop.png and <basename>-phone-<width>.png next to the source.
   To re-render at another width, change the --phone arguments; nothing else
   in the script knows the number.

   Never run `playwright install` — Chromium 141 is already at /opt/pw-browsers.  */

/* Playwright is a GLOBAL node module here, and ESM ignores NODE_PATH, so resolve
   it by package name first and fall back to the global install path. */
let chromium;
try { ({ chromium } = await import('playwright')); }
catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
let file = null; const shots = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') file = args[++i];
  else if (args[i] === '--desktop' || args[i] === '--phone') {
    const kind = args[i].slice(2);
    const [w, d] = args[++i].split('@');
    shots.push({ kind, width: +w, dsf: +(d || 1) });
  }
}
if (!file || !shots.length) { console.error('need --file and at least one --desktop/--phone'); process.exit(1); }

const abs = path.resolve(file);
const dir = path.dirname(abs);
const base = path.basename(abs).replace(/\.html$/, '');

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: 900 },
    deviceScaleFactor: s.dsf,
  });
  const page = await ctx.newPage();
  await page.goto('file://' + abs, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(i => i.complete ? null : i.decode().catch(() => {})));
  });
  await page.waitForTimeout(400);

  const out = s.kind === 'desktop'
    ? path.join(dir, `${base}-desktop.png`)
    : path.join(dir, `${base}-phone-${s.width}.png`);
  await page.screenshot({ path: out, fullPage: true });

  const box = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  console.log(`${out}  viewport=${s.width}@${s.dsf}  cssHeight=${box.doc}  hOverflow=${box.overflow}`);
  await ctx.close();
}
await browser.close();

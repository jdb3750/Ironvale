/*
 * capture.mjs — re-render the ten committed mockup PNGs in docs/mockups/.
 *
 * The script that made the originals was never committed, so this is a fresh
 * one, reverse-engineered from the PNGs it has to replace. Each place-*.html is
 * a gallery page: a mock head, the legend, the thesis note, and two device
 * stations — the 414px phone bezel and the fit-scaled desktop bezel. Opening it
 * at viewport 1440 lays the two stations out side by side; at 420 they stack.
 * So the two frames per scene are the same page seen at two widths:
 *
 *     viewport 1440 -> place-<scene>-desktop.png
 *     viewport  420 -> place-<scene>-phone.png
 *
 * Both are full-page shots, which is why every committed PNG is exactly its
 * viewport wide. Nothing is hidden, clipped or scaled: the gallery IS the frame.
 *
 * The mockups have no build step — _harness.js loads from a relative <script>
 * tag — so the pages are opened straight off disk over file://.
 *
 * Run it from the repo root:
 *
 *     node docs/mockups/capture.mjs                 # all five scenes
 *     node docs/mockups/capture.mjs forge willow    # just those two
 *
 * Chromium comes from the repo's own playwright devDependency; if node_modules
 * is missing, run `npm ci` first. NEVER run `playwright install` here — the
 * browser is preinstalled under PLAYWRIGHT_BROWSERS_PATH and this script points
 * at it directly. Override with IV_CHROMIUM=<path> if it ever moves.
 *
 * Every PNG's real pixel size is read back out of its IHDR and printed, because
 * Chromium silently truncates a capture past roughly 150 megapixels and a
 * truncated frame looks perfectly fine until you scroll to the bottom of it.
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const MOCKUPS = path.dirname(fileURLToPath(import.meta.url));
const SCENES = ['forge', 'hall', 'ledger', 'room', 'willow'];
const FRAMES = { desktop: 1440, phone: 420 };

/* Chromium will not allocate a capture past roughly this many pixels; beyond it
   the image comes back silently short rather than erroring. These pages are a
   few megapixels, so this is a tripwire, not a limit we work near. */
const PIXEL_CEILING = 150e6;

/* Where the browser lives. The repo's playwright build asks for a browser
   revision that is not the one preinstalled here, so point it at the binary
   rather than letting it look one up and tell us to download. */
const CHROMIUM = process.env.IV_CHROMIUM
  || path.join(process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers', 'chromium');

/* The harness lays out on document.fonts.ready and again 150ms later; the
   desktop bezel is fit-scaled from its measured wrapper, so the page is not
   final until that has run against loaded fonts and hydrated sprite canvases.
   Wait for both frames to have real size, then drive IV.layout() ourselves and
   let the height stop moving. */
async function settle(page) {
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForFunction(() => {
    const frames = document.querySelectorAll('#frame-desktop, #frame-phone');
    if (!frames.length) return false;
    return [...frames].every((f) => {
      const r = f.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  });
  let last = -1;
  for (let i = 0; i < 12; i++) {
    await page.evaluate(() => window.IV && window.IV.layout && window.IV.layout());
    await page.waitForTimeout(200);
    const h = await page.evaluate(() => document.documentElement.scrollHeight);
    if (h === last) return h;
    last = h;
  }
  return last;
}

/* PNG dimensions straight out of the IHDR chunk — no image library, and it
   reports what was actually written rather than what we asked for. */
async function pngSize(file) {
  const buf = await readFile(file);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bytes: buf.length };
}

async function capture(browser, scene, kind) {
  const width = FRAMES[kind];
  const src = pathToFileURL(path.join(MOCKUPS, `place-${scene}.html`)).href;
  const out = path.join(MOCKUPS, `place-${scene}-${kind}.png`);

  const page = await browser.newPage({ viewport: { width, height: 1200 } });
  try {
    await page.goto(src, { waitUntil: 'networkidle' });
    const docHeight = await settle(page);

    if (width * docHeight > PIXEL_CEILING) {
      throw new Error(
        `${scene}/${kind}: ${width}x${docHeight} is past Chromium's capture ceiling; `
        + 'it would come back silently truncated.',
      );
    }

    await writeFile(out, await page.screenshot({ fullPage: true }));
    const got = await pngSize(out);
    /* A full-page shot that came back shorter than the document is the exact
       failure mode this script exists to catch. */
    if (got.h < docHeight - 2 || got.w !== width) {
      throw new Error(
        `${scene}/${kind}: wrote ${got.w}x${got.h} for a ${width}x${docHeight} document — truncated.`,
      );
    }
    return { file: path.basename(out), ...got };
  } finally {
    await page.close();
  }
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const scenes = wanted.length ? wanted : SCENES;
for (const s of scenes) {
  if (!SCENES.includes(s)) throw new Error(`unknown scene "${s}" — one of ${SCENES.join(', ')}`);
}

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
try {
  for (const scene of scenes) {
    for (const kind of Object.keys(FRAMES)) {
      const r = await capture(browser, scene, kind);
      console.log(
        `${r.file.padEnd(28)} ${String(r.w).padStart(5)}x${String(r.h).padStart(5)}`
        + `  ${String(r.bytes).padStart(8)} bytes`,
      );
    }
  }
} finally {
  await browser.close();
}

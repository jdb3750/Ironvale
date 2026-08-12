/* Iron Vale — mockup screenshot renderer (MOCKUP-ONLY, not shipped app code).

   Regenerates the desktop/phone PNGs for every place-*.html gallery in
   docs/mockups/ using the same two viewports the existing screenshots were
   shot at: a 1280px-wide viewport for "-desktop.png" (wide enough to keep
   the two-column gallery layout, >1199px breakpoint, and narrow enough to
   stay phone-readable — captures must be <=1280px wide) and a 420px-wide
   viewport for "-phone.png" (narrow enough to collapse to the single-column,
   gutter-less layout, <760px breakpoint). Both are full-page screenshots —
   the PNG shows the whole gallery wall (head, legend, note, both stations),
   not just one bezel.

   Usage: node docs/mockups/_render.mjs [scene ...]
   With no args, renders every place-*.html in this directory. */

import { chromium } from 'playwright';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

async function findScenes() {
  const files = await readdir(DIR);
  return files
    .filter((f) => /^place-[a-z]+\.html$/.test(f))
    .map((f) => f.replace(/\.html$/, ''));
}

async function renderScene(browser, scene) {
  const file = path.join(DIR, `${scene}.html`);
  const url = 'file://' + file;

  // Desktop — 1280px viewport, full-page screenshot.
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    await page.goto(url);
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, `${scene}-desktop.png`), fullPage: true });
    await page.close();
  }

  // Phone — 420px viewport, full-page screenshot.
  {
    const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
    await page.goto(url);
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(DIR, `${scene}-phone.png`), fullPage: true });
    await page.close();
  }

  console.log(`rendered ${scene}`);
}

async function main() {
  const requested = process.argv.slice(2);
  const scenes = requested.length ? requested : await findScenes();
  const browser = await chromium.launch();
  try {
    for (const scene of scenes) {
      await renderScene(browser, scene);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

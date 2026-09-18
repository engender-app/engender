/* Screenshots of onboarding's areas step (phase 10 redesign ticket 22): the
   hub's own groups and rows, ticked, between the scales step and the lock
   step. One new screen, so there is no before to compare against - the
   sign-off is the step itself, across every palette and both themes.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/onboarding-areas-gallery.mjs [outDir]
   Default outDir is .claude/onboarding-areas-shots, which is gitignored and
   durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const outDir = resolve(process.argv[2] ?? '.claude/onboarding-areas-shots');

const THEMES = ['dark', 'light'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

/* The whole step, not just what fits one 844px viewport: the app does not
   scroll its document, `[data-app-scroll-region]` does, so the technique is
   growing the viewport to that element's full height and shrinking back
   after (see the ticket 22 memory on this - fullPage and an element shot of
   [data-app-root] both clip to the viewport). */
async function shoot(name) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-setup-answers]') ?? document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width: 390, height: tall });
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  shots.push(name);
}

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

/** First run, walked forward to the areas step (welcome, name, flag,
    scales, areas), with the palette and theme set before entering it -
    onboarding has no theme control of its own, so wearing both has to
    happen from Settings first, on a clean run each time. */
async function areasStep(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  for (const step of ['welcome', 'name', 'flag', 'scales', 'areas']) {
    await page.waitForTimeout(500);
    if (step === 'name') await page.locator('#ob-name').fill('Alicja');
    if (step === 'areas') break;
    await page.locator('[data-next]').click();
  }
  await page.waitForTimeout(600);
}

/* ---------- the step, on all eight flags, both themes ---------- */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await areasStep(palette, theme);
    await shoot(`areas-${palette}-${theme}`);
  }
}

/* ---------- the states that only exist because the list can be edited ---------- */
await areasStep('trans', 'dark');

// Untouched: the default four (measurements, care, milestones, tryouts).
await shoot('areas-default-ticked');

// A default unticked and something outside it ticked, so the row that
// changed and the one that did not are both on screen at once.
await page.locator('[data-list-row="area-care"]').click();
await page.locator('[data-list-row="area-letters"]').click();
await page.waitForTimeout(400);
await shoot('areas-custom-ticked');

// Everything unticked - a legitimate resting state (pinnedRows.ts: an empty
// list is "nothing pinned", not an error) - and must not read as broken.
const rows = await page.locator('[data-list-row^="area-"][aria-checked="true"]').evaluateAll((els) =>
  els.map((el) => el.dataset.listRow)
);
for (const key of rows) {
  await page.locator(`[data-list-row="${key}"]`).click();
}
await page.waitForTimeout(400);
await shoot('areas-none-ticked');

await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);

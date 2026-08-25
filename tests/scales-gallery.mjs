/* Screenshots of the scale checklist (phase 5 ticket 35): the first run's
   scales step and Settings' scales sheet, which are one component drawn
   twice, plus the states that only exist because the list can be emptied.

   The palette sweep is on the Settings sheet rather than on both screens.
   What a flag changes here is the ticked box's fill and edge and nothing
   else - the rows, the type and the spacing are the same on either screen -
   so eight flags on one surface answers the question, and eight on both
   would be sixteen extra pictures of the same box.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/scales-gallery.mjs [outDir]
   Default outDir is .claude/scale-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const outDir = resolve(process.argv[2] ?? '.claude/scale-shots');

const PALETTES = [
  'trans',
  'nonbinary',
  'genderfluid',
  'bisexual',
  'lesbian',
  'pansexual',
  'rainbow',
  'agender'
];
const THEMES = ['dark', 'light'];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

async function shoot(name) {
  // The backup toast is true about this browser profile and is not what
  // any of these pictures is of (gates-gallery.mjs says the same).
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
}

/** A screen, with the first run cleared out of the way if it is up. */
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

async function wear(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/** Settings, with the scales sheet up and settled. */
async function openSheet() {
  await settle('/settings');
  await page.locator('[data-list-row="scales"]').click();
  // The sheet rises on --dur-med and the ticks are already at rest.
  await page.waitForTimeout(500);
}

/* ---------- the sheet, on all eight flags ---------- */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await wear(palette, theme);
    await openSheet();
    await shoot(`sheet-${palette}-${theme}`);
  }
}

/* ---------- the states the list can be put into ---------- */
await wear('trans', 'dark');

// Mid-tick, at the point the mark is drawing itself in. --dur-slow is
// 380ms, so 150 is a little under halfway and the mark is a stroke rather
// than a check.
await openSheet();
await page.locator('[data-list-row="scale-binary_nonbinary"]').click();
await page.waitForTimeout(150);
await shoot('sheet-mid-tick');
await page.waitForTimeout(500);
await shoot('sheet-four-ticked');

// Everything unticked, which somebody can reach and which must not read as
// broken: the sheet, the row that summarises it, and the editor under it.
await openSheet();
for (const key of ['euphoria_dysphoria', 'femininity', 'masculinity', 'binary_nonbinary', 'agender_gendered']) {
  const row = page.locator(`[data-list-row="scale-${key}"][aria-checked="true"]`);
  if (await row.count()) await row.click();
}
await page.waitForTimeout(400);
await shoot('sheet-none-ticked');
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
await shoot('settings-row-none-ticked');

await settle('/entry/new');
await page.waitForTimeout(500);
await shoot('editor-none-ticked');

// And the same editor with the default three back, for the comparison the
// empty one is only legible against.
await openSheet();
for (const key of ['euphoria_dysphoria', 'femininity', 'masculinity']) {
  await page.locator(`[data-list-row="scale-${key}"]`).click();
}
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await settle('/entry/new');
await page.waitForTimeout(500);
await shoot('editor-three-ticked');

/* ---------- the first run, where the same list is the second screen ---------- */
for (const theme of THEMES) {
  await wear('trans', theme);
  await settle('/');
  await page.selectOption('#demo-jump', 'first-run');
  await page.waitForSelector('[data-next]');
  for (const step of ['welcome', 'name', 'flag', 'scales']) {
    await page.waitForTimeout(600);
    if (step === 'name') await page.locator('#ob-name').fill('Alicja');
    if (step === 'scales') break;
    await page.locator('[data-next]').click();
  }
  await page.waitForTimeout(600);
  await shoot(`onboarding-scales-trans-${theme}`);
}

// Reduced motion: the mark is simply there, and the box's colour still
// changes. The substitute rather than the absence of one.
await page.emulateMedia({ reducedMotion: 'reduce' });
await wear('trans', 'dark');
await openSheet();
await page.locator('[data-list-row="scale-binary_nonbinary"]').click();
await page.waitForTimeout(60);
await shoot('sheet-reduced-motion-just-ticked');

await page.close();
await app.close();
await browser.close();

console.log(`${shots.length} shots in ${outDir}`);

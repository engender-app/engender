/* Screenshots of the spread mark (phase 6 unprompted ticket 11): the
   calendar month, across all 8 palettes and both themes.

   Two sweeps, because the screen has two colour systems on it. A gender
   dimension shades in the active flag's stripe, so it sweeps all 8 palettes
   in both themes. Mood draws its own five faces on its own ramp (ADR-0025),
   which the flag does not reach at all, so it sweeps the 4 mood presets
   instead - shooting it across the flags would be 16 identical pictures.

   The demo persona logs a second entry on about one day in eight, which is
   what a real month looks like and is why a month here has three split or
   stacked days rather than a wall of them.

   The calendar shots come in pairs: the month as a person sees it, and the
   grid alone at 3x, where the split's seam and the deck's edge are at a
   size they can be argued about.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/spread-gallery.mjs [outDir]
   Default outDir is .claude/spread-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

/* Mood carries its own ramp, chosen independently of the flag (ADR-0025),
   so a mood month looks the same on all 8 palettes and different on all 4
   of these. Sweeping the flags for it would be 16 identical pictures. */
const MOOD_PRESETS = ['amber', 'teal', 'plum', 'moss'];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/spread-shots'));
const THEMES = ['dark', 'light'];

await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const shots = [];

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

/* Palette and theme are one compound selector, so both are stamped through
   the app's own settings rather than by writing the attribute: a later
   page.goto would drop a hand-set one and every shot after it would be a
   picture of the previous palette. */
async function dress(palette, theme, moodPreset) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  if (moodPreset) await page.locator(`[data-mood-preset-pick="${moodPreset}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function month(metric) {
  await settle('/calendar');
  await page.locator('[data-cal-step="prev"]').click();
  await page.selectOption('#calendar-metric', metric);
  await page.waitForSelector('[data-cal-grid]:not([aria-busy="true"])');
  await page.waitForTimeout(200);
}

async function shoot(name, selector) {
  // A storage-permission toast lands on top of the grid on a fresh profile.
  await page.evaluate(() => document.querySelectorAll('[data-toast]').forEach((t) => t.remove()));
  await page.locator(selector).screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
}

/* A gender dimension is the flag's, so it sweeps the flags. Both the whole
   screen and the grid alone: the grid at this scale is the split's seam and
   the deck's edge at a size they can be argued about. */
for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await dress(palette, theme);
    await month('euphoria_dysphoria');
    await shoot(`calendar-dimension-${palette}-${theme}`, '[data-app-root]');
    await shoot(`grid-dimension-${palette}-${theme}`, '[data-cal-grid]');
  }
}

/* Mood sweeps its own four ramps instead, on one flag, because the flag
   reaches none of it. */
for (const preset of MOOD_PRESETS) {
  for (const theme of THEMES) {
    await dress('trans', theme, preset);
    await month('mood');
    await shoot(`calendar-mood-${preset}-${theme}`, '[data-app-root]');
    await shoot(`grid-mood-${preset}-${theme}`, '[data-cal-grid]');
  }
}

/* The values sheet used to be shot here, one per theme: it was words
   rather than colour, so it needed one of each rather than a sweep. Ticket
   99 item 26 removed the "All values" link and the sheet with it, and the
   spread wording now lives only in the screen's hidden value list - there
   is no rendered surface left to photograph. The calendar's spread mark
   above is the whole of this gallery now. */

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);

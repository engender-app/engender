/* Screenshots of the spread mark (phase 6 unprompted ticket 11): the
   calendar month and the values sheet on /stats, across all 8 palettes and
   both themes.

   The mark is drawn in the cell's own computed ink, and the ink is a
   different colour on every one of the 16 combinations, so this is the only
   way to see whether it stays legible on a pale fill and stops short of
   fighting the date on a deep one. The demo persona logs a second entry on
   about one day in eight, which is what a real month looks like and is why
   a month here has a handful of marks rather than a wall of them.

   The calendar shots come in pairs: the month as a person sees it, and the
   same month again at 3x so the mark can actually be judged.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/spread-gallery.mjs [outDir]
   Default outDir is .claude/spread-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

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
async function dress(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function shoot(name, selector) {
  // A storage-permission toast lands on top of the grid on a fresh profile.
  await page.evaluate(() => document.querySelectorAll('[data-toast]').forEach((t) => t.remove()));
  await page.locator(selector).screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
}

for (const palette of PALETTES) {
  for (const theme of THEMES) {
    await dress(palette, theme);

    /* Last month rather than this one. The persona logs today and stops, so
       the current month is one cell of colour and 29 empty ones - and what
       is being looked at is a month of days, several of which covered
       ground.

       Both metrics, because the two ranges make different pictures and the
       ticket asks for both. Mood is five integers, so two entries on a day
       land on the same value about as often as not and a month carries a
       couple of marks; a dimension runs 0 to 100 and almost every
       two-entry day covered some ground, which is the dense case and the
       one that says whether a month of marks reads as noise. */
    await settle('/calendar');
    await page.locator('[data-cal-step="prev"]').click();
    for (const metric of ['mood', 'euphoria_dysphoria']) {
      await page.selectOption('#calendar-metric', metric);
      await page.waitForSelector('[data-cal-grid]:not([aria-busy="true"])');
      await page.waitForTimeout(200);
      await shoot(`calendar-${metric}-${palette}-${theme}`, '[data-app-root]');
      // The grid alone, which at this scale is the mark at a size it can be
      // argued about.
      await shoot(`grid-${metric}-${palette}-${theme}`, '[data-cal-grid]');
    }

    await settle('/stats');
    await page.waitForSelector('[data-values-open]');
    await page.locator('[data-values-open]').click();
    await page.waitForSelector('[data-sheet] [data-bar-row]');
    // The sheet rises (DIRECTION, tier 2); a shot taken on the click is a
    // picture of it half transparent over the screen behind.
    await page.waitForTimeout(600);
    /* Scrolled to a day that covered ground. Two entries on one day is
       about one day in eight, so the top of a 30-day list is mostly days
       with nothing to say and a picture of it would show none of this. */
    const marked = page.locator('[data-sheet] [data-bar-row]').filter({ hasText: ' to ' }).first();
    await marked.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shoot(`values-${palette}-${theme}`, '[data-sheet]');
  }
}

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);

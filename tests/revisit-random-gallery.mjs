/* Screenshots of ticket 08's two new UI surfaces (phase 8 features ticket
   08, "Show me this again"), in the default trans palette only - Alicja's
   sign-off request for this ticket names one theme, the same "screens of
   the default trans theme" scope curve-markers-gallery.mjs already set a
   precedent for.

   Needs Fill every feature: the demo persona has no entries at all without
   it, and both surfaces here need real entries to work on - a revisit set
   on one, and a result set to draw randomly from.

   Run: node tests/revisit-random-gallery.mjs [outDir]
   Default outDir is .claude/revisit-random-shots, which is gitignored and
   durable. It changes no source file and needs no rebuild afterwards. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/revisit-random-shots'));

await mkdir(outDir, { recursive: true });
const shots = [];

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.setDefaultTimeout(90000);

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

/* The visible field is flatpickr's altInput and the ISO value lives on the
   hidden original (walkthrough.test.mjs's own fillDate), so a real pick is
   fp.setDate rather than typing into the field a click would miss - it is
   the underlying hidden input, not what is drawn. */
const fillDate = async (selector, iso) => {
  await page.evaluate(
    ([sel, v]) => {
      const el = document.querySelector(sel);
      const fp = el?._flatpickr ?? el?.flatpickr;
      if (!fp) throw new Error(`no flatpickr instance on ${sel}`);
      fp.setDate(v, true);
    },
    [selector, iso]
  );
};

const shoot = async (name) => {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

try {
  // Seeding resolves with its own goto('/more'), so wait for that before
  // navigating anywhere.
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 120000 });
  await page.waitForTimeout(1500);

  // Palette and theme are one compound selector and a goto resets a
  // hand-set data-theme, so both come from the real controls first.
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator('[data-segment="light"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');

  // An entry with a revisit not yet set.
  await settle('/');
  await page.locator('a[href^="/entry/"]').first().click();
  await page.waitForSelector('[data-revisit-open]');
  await shoot('entry-header-unset');
  await page.locator('[data-revisit-open]').click();
  await page.waitForSelector('.revisit-date-row');
  await shoot('revisit-sheet-unset');

  // Set it from a preset, reopen to see the set state and the filled icon.
  await page.getByRole('button', { name: /In a month/i }).click();
  await page.waitForTimeout(400);
  await shoot('entry-header-set');
  await page.locator('[data-revisit-open]').click();
  await page.waitForSelector('[data-revisit-cancel]');
  await shoot('revisit-sheet-set');

  // The free date field, its calendar popup open - #revisit-date is the
  // visible altInput a click actually reaches (the DatePicker's own id
  // handoff), where [data-revisit-date] is the hidden original.
  await page.locator('#revisit-date').click();
  await page.waitForSelector('.flatpickr-calendar.open');
  await page.waitForTimeout(300);
  await shoot('revisit-sheet-datepicker');
  await page.keyboard.press('Escape');

  // Random entry, on an ad hoc search with real hits.
  await settle('/search');
  await page.locator('[data-filter-toggle]').click();
  await fillDate('[data-filter-start]', '2000-01-01');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-search-random]', { timeout: 20000 });
  await shoot('search-random-button');
  await page.locator('[data-search-save]').click();
  await page.locator('input[name="saved-question-name"]').fill('Random gallery question');
  await page.locator('[data-saved-question-save-confirm]').click();
  await page.waitForTimeout(500);

  // The same control on a saved question's run.
  await settle('/search/questions');
  await page.getByText('Random gallery question').click();
  await page.waitForSelector('[data-search-random]', { timeout: 20000 });
  await shoot('saved-question-random-button');
} finally {
  await page.close();
  await browser.close();
  await app.close();
}

console.log(`\n${shots.length} shots in ${outDir}`);

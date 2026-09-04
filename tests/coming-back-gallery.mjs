/* Screenshots of the return surface (phase 8 features ticket 05): the screen
   somebody meets after five weeks away, the two backfill sheets, and the
   honest empty state.

   Default flag only, both themes, which is what the sign-off asked for.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/coming-back-gallery.mjs [outDir]
   Default outDir is .claude/coming-back-shots, which is gitignored. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/coming-back-shots'));

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];

/** The day a wear session is said to have come off, twenty back, so the
    sheet is shot with a real answer in the field rather than empty. */
const CAME_OFF = new Date(Date.now() - 20 * 86400_000).toISOString().slice(0, 10);

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: theme
  });

  const shoot = async (name, fullPage = false) => {
    await page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.screenshot({ path: file, fullPage });
    shots.push(`${name}-trans-${theme}`);
  };

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);

  /* ---------- the empty state first, while the journal still stops today.
     Shot before the gap seed rather than after answering every row, because
     what it has to show is the screen reached by hand with nothing waiting
     - which is the state ADR-0062 says the route must draw rather than
     redirect away from. ---------- */
  await settle('/coming-back');
  await page.locator('[data-notice="coming-back-empty"]').waitFor();
  await page.waitForTimeout(300);
  await shoot('01-nothing-waiting');

  /* ---------- five weeks away. The jump lands on Home and the shell's own
     gate is what opens the surface, so this is the arrival as a person
     meets it. ---------- */
  await settle('/');
  await page.locator('[data-fill-coming-back]').click();
  await page.waitForURL('**/coming-back', { timeout: 60000 });
  await page.waitForSelector('[data-coming-back-item="dose"]');
  await page.waitForTimeout(500);
  await shoot('02-what-was-waiting', true);

  /* ---------- the dose slot: the one sheet that collects something, and the
     amount, site and vehicle are what it asks. ---------- */
  await page.locator('[data-row-main="coming-back-dose"]').click();
  await page.waitForSelector('[data-coming-back-dose-confirm]');
  await page.waitForTimeout(400);
  await shoot('03-dose-sheet', true);

  /* With a site tapped, since the confirm is refused until one is - the
     enabled button is the state worth looking at. */
  await page.locator('[data-site="thigh-left"]').click();
  await page.waitForTimeout(300);
  await shoot('04-dose-sheet-answered', true);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* ---------- the wear session: the one offer that opens with an empty
     field on purpose. ---------- */
  await page.locator('[data-row-main="coming-back-wear"]').click();
  await page.waitForSelector('[data-coming-back-wear-confirm]');
  await page.waitForTimeout(400);
  await shoot('05-wear-sheet');

  await page.evaluate((iso) => {
    document.querySelector('#coming-back-wear-end')._flatpickr.setDate(iso, true);
  }, CAME_OFF);
  await page.waitForTimeout(400);
  await shoot('06-wear-sheet-answered');

  await page.locator('[data-coming-back-wear-confirm]').click();
  await page.waitForSelector('[data-coming-back-item="wear-session"]', { state: 'detached' });
  await page.waitForTimeout(600);
  await shoot('07-one-row-answered', true);

  await page.close();
}

await app.httpServer.close();
await browser.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
for (const shot of shots) console.log(' ', shot);

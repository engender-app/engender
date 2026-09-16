/* Sign-off renders for redesign ticket 05 ("Look back opens on the span's
   own facts"). Only what the ticket changed, in crops rather than whole
   screens (Alicja, on ticket 07's sign-off): the top of the door through
   the first card, the merged tag card, Care's merged interval card, and
   Compare's opening state - trans, light and dark, before and after.

   Run against each build separately, from that build's own checkout as
   the cwd (vite's preview({ root }) serves the cwd's build):

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/lookback-05-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/lookback-05-gallery.mjs --tag after --out /abs/dir

   `--tag` picks which selectors and routes this ticket moved things
   between: before, the two tag cards are `tag-insights`/`correlations` on
   /stats and the two folds are `interval-mood`/`custom-interval` there too;
   after, they are the merged `tags-moved` on /stats and the merged
   `interval-mood` on /care. Compare is shot at /compare directly before
   (nothing prefills it) and at the Look back row's own href after. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve(here, '../.claude/lookback-05-shots')), tag);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(String(err)));

  const strip = () =>
    page.evaluate(() => {
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
      for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    });

  const settle = async (path) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
  };

  const dress = async () => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  /* One element, cropped: grow the viewport past the app's own scroll
     region so nothing is clipped by it, screenshot the element at its real
     layout position, then shrink back (stats-gallery.mjs's own trick). */
  const shootElement = async (selector, name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(500);
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.locator(selector).first().screenshot({ path: file });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
  };

  /* Compare's opening state: what shows without scrolling, which is the
     whole point of the before/after (four empty fields vs. a table already
     drawn). Plain viewport shot, not an element crop. */
  const shootViewport = async (name) => {
    await strip();
    const file = `${outDir}/${name}-trans-${theme}.png`;
    await page.screenshot({ path: file });
    shots.push(`${name}-trans-${theme}`);
  };

  /* `resetDemo()` runs async behind the button's own `busy` state
     (DemoBar.svelte) - a fixed wait raced it under load and produced a
     0-or-3-or-enough entry count across otherwise identical runs. Wait for
     the disabled round-trip instead of guessing a duration. */
  await settle('/');
  await page.locator('[data-reset-demo]').click();
  await page.waitForSelector('[data-reset-demo][disabled]', { timeout: 5000 }).catch(() => {});
  await page.waitForSelector('[data-reset-demo]:not([disabled])', { timeout: 30000 });
  await dress();

  /* --- 1. The top of the door: rail through the first card ("Across your
     journal") - after, that includes the facts block; before, the rail
     runs straight into the era offer / tile grid with nothing between. */
  await settle('/stats');
  await page.waitForSelector('[data-lookback-rail]');
  await page.waitForTimeout(1200);
  {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(400);
    const boxBottom = await page.evaluate(() => {
      const headings = [...document.querySelectorAll('[data-section-heading] h2')];
      const cross = headings.find((h) => h.textContent?.trim() === 'Across your journal');
      return cross ? cross.closest('[data-section-heading]').getBoundingClientRect().top : null;
    });
    if (boxBottom !== null) {
      const file = `${outDir}/01-top-of-door-trans-${theme}.png`;
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 390, height: Math.round(boxBottom) } });
      shots.push(`01-top-of-door-trans-${theme}`);
    } else {
      errors.push('Could not find "Across your journal" heading to crop the top of the door');
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
  }

  /* --- 2. The merged tag card. Before: both halves of the duplication. */
  if (tag === 'before') {
    await shootElement('[data-chart-card="tag-insights"]', '02a-tag-insights');
    await shootElement('[data-chart-card="correlations"]', '02b-what-shows-up-together');
  } else {
    await shootElement('[data-chart-card="tags-moved"]', '02-tags-and-how-a-scale-moved');
  }

  /* --- 3. The interval fold(s). Before: both cards, still on /stats. */
  if (tag === 'before') {
    await shootElement('[data-chart-card="interval-mood"]', '03a-mood-between-injections');
    await shootElement('[data-chart-card="custom-interval"]', '03b-custom-interval-length');
  } else {
    await settle('/care');
    await page.waitForSelector('[data-chart-card="interval-mood"]');
    await page.waitForTimeout(600);
    await shootElement('[data-chart-card="interval-mood"]', '03-care-mood-between-injections');
  }

  /* --- 4. Compare's opening state. Before: nothing prefills it. After:
     the Look back row's own href - the span and the stretch before it. */
  if (tag === 'before') {
    await settle('/compare');
  } else {
    await settle('/stats');
    const href = await page.locator('[data-list-row="compare"]').first().getAttribute('href');
    await settle(href ?? '/compare');
  }
  await page.waitForTimeout(600);
  await shootViewport('04-compare-opening-state');

  await page.close();
}

console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const s of shots) console.log(' -', s);
if (errors.length) {
  console.log(`\n${errors.length} PAGE ERROR(S):`);
  for (const e of errors) console.log(' -', e);
}

app.httpServer.close();
await browser.close();
process.exit(errors.length ? 1 : 0);

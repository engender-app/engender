/* Sign-off renders for phase 11 UI/UX ticket 25 ("Make timeline facts
   selectable without precision tapping"). Only what the ticket changed, in
   crops rather than whole screens: the Care rail, the same rail at 200%
   zoom, and the fold under the Look back rail, closed and open - trans,
   light and dark, before and after.

   Run against each build separately, from that build's own checkout as the
   cwd (vite's preview serves the cwd's build):

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/timeline-facts-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/timeline-facts-gallery.mjs --tag after --out /abs/dir

   "Fill every feature" rather than the demo persona: the persona logs no
   doses and runs no regimen, so the Care rail draws nothing at all for it,
   and the Look back rail draws eras and milestones but no episode, tryout
   or surgery - which are three of the five kinds the fold exists to
   list. */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/timeline-facts-shots')), tag);

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
     region so nothing is clipped by it, shoot the element where it lies,
     then shrink back (lookback-06-gallery.mjs's own trick). */
  const shootElement = async (selector, name, width = 390) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width, height: tall });
    await page.waitForTimeout(500);
    const target = page.locator(selector).first();
    if ((await target.count()) === 0) {
      errors.push(`${name}: nothing matched ${selector}`);
    } else {
      const file = `${outDir}/${name}-trans-${theme}.png`;
      await target.screenshot({ path: file });
      shots.push(`${name}-trans-${theme}`);
    }
    await page.setViewportSize({ width, height: width === 390 ? 900 : 422 });
    await page.waitForTimeout(300);
  };

  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 300000 });
  await dress();

  /* --- 1. The Care rail: the captions, now a 48px row each, and the lane
     names, now the way down to each drug's own block. */
  await settle('/care');
  await page.waitForSelector('[data-care-rail]');
  await page.waitForTimeout(1500);
  await shootElement('[data-care-rail]', '01-care-rail');

  /* --- 2. The same rail at 195px, which is 200% zoom on a 390px phone:
     the width the caption collision rule was never sized for. */
  await page.setViewportSize({ width: 195, height: 422 });
  await settle('/care');
  await page.waitForSelector('[data-care-rail]');
  await page.waitForTimeout(1500);
  await shootElement('[data-care-rail]', '02-care-rail-zoomed', 195);
  await page.setViewportSize({ width: 390, height: 900 });

  /* A band of the page between two elements, cropped: the same
     tall-viewport trick, then a clip from the top of one to the bottom of
     the other. Where the second is missing - the before build has no fold -
     the crop ends at the first. */
  const shootBand = async (fromSelector, toSelector, name, maxHeight = 900) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(500);
    const from = await page.locator(fromSelector).first().boundingBox();
    const to = (await page.locator(toSelector).count()) ? await page.locator(toSelector).first().boundingBox() : null;
    if (!from) {
      errors.push(`${name}: nothing matched ${fromSelector}`);
    } else {
      const bottom = to ? to.y + to.height : from.y + from.height;
      const file = `${outDir}/${name}-trans-${theme}.png`;
      await page.screenshot({
        path: file,
        clip: { x: 0, y: from.y, width: 390, height: Math.min(bottom - from.y, maxHeight) }
      });
      shots.push(`${name}-trans-${theme}`);
    }
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
  };

  /* --- 3. The Look back rail with the fold under it, closed: the rail is
     unchanged and the fold is one row. Before, the crop is the rail
     alone. */
  await settle('/stats');
  await page.waitForSelector('[data-lookback-rail]');
  await page.waitForTimeout(1500);
  await shootBand('[data-lookback-rail]', '[data-span-facts]', '03-lookback-rail-and-fold');

  /* --- 4. The fold open: the facts as rows, each with its kind and its own
     dates - and --- 5. a row picked, with the span the rail now holds and
     the tick on the row that set it. Neither exists before this ticket. */
  if (await page.locator('[data-span-facts-toggle]').count()) {
    await page.locator('[data-span-facts-toggle]').click();
    await page.waitForSelector('[data-span-fact]');
    await page.waitForTimeout(600);
    await shootBand('[data-span-facts]', '[data-span-facts]', '04-lookback-fold-open', 620);

    const row = page.locator('[data-span-fact="tryout"], [data-span-fact="regimen"]').first();
    if (await row.count()) {
      await row.click();
      await page.waitForTimeout(700);
      await shootBand('[data-lookback-rail]', '[data-span-facts]', '05-lookback-row-picked', 760);
    }
  }

  /* --- 6. Polish, light only: one new string in the fold, and the Care
     captions' collision rule is sized against Polish. */
  if (theme === 'light') {
    await settle('/settings');
    await page.locator('[data-segment="pl"]').click();
    await page.waitForTimeout(1500);
    await settle('/care');
    await page.waitForSelector('[data-care-rail]');
    await page.waitForTimeout(1500);
    await shootElement('[data-care-rail]', '06-care-rail-polish');
    await settle('/stats');
    await page.waitForSelector('[data-lookback-rail]');
    await page.waitForTimeout(1200);
    if (await page.locator('[data-span-facts-toggle]').count()) {
      await page.locator('[data-span-facts-toggle]').click();
      await page.waitForSelector('[data-span-fact]');
      await page.waitForTimeout(600);
      await shootBand('[data-span-facts]', '[data-span-facts]', '07-lookback-fold-polish', 520);
    }
  }

  await page.close();
}

await browser.close();
await app.close();

console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const s of shots) console.log(' -', s);
if (errors.length) {
  console.log(`\n${errors.length} PAGE ERROR(S):`);
  for (const e of errors) console.log(' -', e);
}

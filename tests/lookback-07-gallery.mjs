/* Sign-off renders for phase 11 ticket 07 ("Look back becomes a set of
   deep readings"): the door whole, since this ticket changes the whole
   screen; the constellation screen's head; the year wrapped's head - trans,
   light and dark, before and after.

   Run against each build separately, from that build's own checkout as the
   cwd (vite's preview({ root }) serves the cwd's build):

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/lookback-07-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/lookback-07-gallery.mjs --tag after --out /abs/dir

   "Fill every feature", so every reading has data in the default span and
   every tile draws. Before, the constellation is a card mid-scroll on the
   door and the year is a face per day; after, the constellation has a
   screen and the year is twelve shaded rows under its figures. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
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
const outDir = resolve(flag('out', resolve(here, '../.claude/lookback-07-shots')), tag);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];
const measured = {};

for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(`${theme}: ${String(err)}`));

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

  /* The whole screen: grow the viewport to the content so the app's own
     scroll region clips nothing, shoot, shrink back. Returns the screen's
     height, which is what the ticket's ceiling is measured on. */
  const shootWhole = async (name) => {
    await strip();
    const tall = await page.evaluate(() => {
      const scroller = document.querySelector('[data-app-scroll-region]');
      const hidden = scroller ? scroller.scrollHeight - scroller.clientHeight : 0;
      return Math.min(window.innerHeight + hidden + 40, 12000);
    });
    await page.setViewportSize({ width: 390, height: tall });
    await page.waitForTimeout(600);
    const height = Math.round(await page.evaluate(() => document.querySelector('.screen')?.getBoundingClientRect().height ?? 0));
    const svgs = await page.evaluate(() => document.querySelectorAll('.screen svg').length);
    await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}-trans-${theme}.png` });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
    return { height, svgs };
  };

  /* The head of a screen: the first `height` px at phone size, as opened. */
  const shootHead = async (name, height) => {
    await strip();
    await page.setViewportSize({ width: 390, height });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${outDir}/${name}-trans-${theme}.png`, clip: { x: 0, y: 0, width: 390, height } });
    await page.setViewportSize({ width: 390, height: 900 });
    await page.waitForTimeout(300);
    shots.push(`${name}-trans-${theme}`);
  };

  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await dress();

  // --- 1. The door, whole.
  await settle('/stats');
  await page.waitForSelector('[data-lookback-rail]');
  await page.waitForTimeout(2500);
  measured[`door-${theme}`] = await shootWhole('01-door');
  if (tag === 'after') {
    const tiles = await page.evaluate(() =>
      [...document.querySelectorAll('[data-reading-grid] [data-reading]')].map((t) => ({
        key: t.dataset.reading,
        head: t.querySelector('.kit-reading-head')?.textContent?.trim() ?? '',
        href: t.getAttribute('href'),
        height: Math.round(t.getBoundingClientRect().height)
      }))
    );
    measured[`tiles-${theme}`] = tiles;
  }

  // --- 2. The constellation: its own screen after, the card on the door before.
  if (tag === 'after') {
    await page.locator('[data-reading="plane"]').click();
    await page.waitForURL('**/stats/plane?**');
    await page.waitForSelector('[data-chart-card="constellation"]');
    await page.waitForTimeout(1500);
    await shootHead('02-plane-head', 900);
  } else {
    await page.evaluate(() => document.querySelector('[data-chart-card="constellation"]')?.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(800);
    await shootHead('02-plane-head', 900);
  }

  // --- 3. The year wrapped's head.
  await settle('/wrapped/year');
  await page.waitForSelector('[data-wrapped-cover-year], [data-wrapped-thin]');
  await page.waitForTimeout(2000);
  measured[`year-${theme}`] = await shootWhole('03-year-whole');
  await page.evaluate(() => document.querySelector('[data-app-scroll-region]')?.scrollTo(0, 0));
  await shootHead('03-year-head', 1200);

  await page.close();
}

await writeFile(`${outDir}/measured.json`, JSON.stringify(measured, null, 2));
console.log(`${shots.length} shot(s) in ${outDir}:`);
for (const s of shots) console.log(' -', s);
for (const [key, value] of Object.entries(measured)) {
  if (value && typeof value.height === 'number') console.log(`   ${key}: ${value.height}px, ${value.svgs} svg(s)`);
  if (Array.isArray(value)) console.log(`   ${key}: ${value.map((t) => `${t.key}=${JSON.stringify(t.head)}`).join(' ')}`);
}
if (errors.length) {
  console.log(`\n${errors.length} PAGE ERROR(S):`);
  for (const e of errors) console.log(' -', e);
}

app.httpServer.close();
await browser.close();
process.exit(errors.length ? 1 : 0);

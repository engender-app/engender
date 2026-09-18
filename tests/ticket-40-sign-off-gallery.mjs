/* Renders for phase 11 ticket 40 (the tally screen logs beside its counts):
   /tally with its two new action rows, the sign-off surface.

   trans, light and dark, only (2026-09-14 standing rule), at 390px, plus
   one 320px light shot for the label wrap. Everything here is over the
   fill-every-feature fixture, which layers no tally events of its own, so
   both counters show the persona's seed - one in-range event each - and
   the undo controls render enabled.

     VITE_DEMO=1 npm run build
     node tests/ticket-40-sign-off-gallery.mjs
*/
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const outDir = resolve('.claude/ticket-40-sign-off-shots');
const width = 390;
const foldHeight = 844;

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

const page = await browser.newPage({ viewport: { width, height: foldHeight }, deviceScaleFactor: 2 });
page.on('pageerror', (err) => errors.push(String(err)));

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function strip() {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
    if (!document.getElementById('sign-off-shot-css')) {
      const style = document.createElement('style');
      style.id = 'sign-off-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

async function grow() {
  let last = -1;
  for (let i = 0; i < 6; i++) {
    const tall = await page.evaluate(() => {
      const s = document.querySelector('[data-app-scroll-region]');
      return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight), 8000);
    });
    if (tall === last) break;
    last = tall;
    await page.setViewportSize({ width, height: tall });
    await page.waitForTimeout(200);
  }
  return last;
}

async function full(name) {
  await strip();
  const tall = await grow();
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name} (${tall}px)\n`);
  await page.setViewportSize({ width, height: foldHeight });
}

async function setLook(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}

process.stdout.write('ticket 40 sign-off\n');
await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 180000 });
await page.waitForTimeout(1000);

await setLook('trans', 'light');
await settle('/tally');
await page.waitForSelector('[data-tally-log="misgendered"]');
await full('tally-light-390');

await setLook('trans', 'dark');
await settle('/tally');
await page.waitForSelector('[data-tally-log="misgendered"]');
await full('tally-dark-390');

/* The narrow end: both buttons must keep the 48px floor and wrap rather
   than squeeze when the Polish labels run long - the wrap is what this
   shot is for (English here; the lengths that matter are checkable, the
   wrap behaviour is the same either way). */
await setLook('trans', 'light');
await settle('/tally');
await page.waitForSelector('[data-tally-log="misgendered"]');
await page.setViewportSize({ width: 320, height: foldHeight });
await full('tally-light-320');

if (errors.length) {
  console.error('pageerrors:', errors);
  process.exit(1);
}
console.log(`done: ${shots.length} shots in ${outDir}`);
await browser.close();
await app.close();
process.exit(0);

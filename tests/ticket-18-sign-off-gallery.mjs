/* Renders for ticket 18 (phase 11 all-four-doors), for sign-off.

   Only what the ticket changed, in crops rather than whole screens: the
   Journal door's foot (the "Recent days" week-strip duplicate before,
   "Earlier entries" opened once after), search's opening state before a
   character is typed, and a new entry's save bar (no star anywhere before,
   the star beside Save after).

   trans, light and dark, only (2026-09-14 standing rule) - the full
   palette cross product is palette-contrast.test.ts's job, not a sign-off
   page's.

   Before and after both, since the ticket changed three existing screens
   rather than adding a new one. `--tag before` reads the old selectors
   (the week strip, the idle Notice, no star in a new entry's footer);
   `--tag after` reads the new ones. Run `--tag before` from a checkout at
   the ticket's own merge base as its cwd - vite's `preview({ root })`
   serves the *cwd's* build rather than root's (journal-door-gallery.mjs
   found this the hard way), so this script has to be copied there and run
   with that checkout as the working directory:

     VITE_DEMO=1 npm run build   # in the before checkout
     node tests/ticket-18-sign-off-gallery.mjs --tag before --out /abs/dir

     VITE_DEMO=1 npm run build   # in this ticket's own checkout
     node tests/ticket-18-sign-off-gallery.mjs --tag after --out /abs/dir */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const tag = flag('tag', 'after');
const outDir = resolve(flag('out', resolve('.claude/ticket-18-sign-off-shots')), tag);
const width = 390;

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const shots = [];
const errors = [];

const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
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

async function fillEveryFeature() {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1000);
}

async function setLook(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}

async function grow() {
  const tall = await page.evaluate(() => {
    const s = document.querySelector('[data-app-scroll-region]');
    return Math.min(window.innerHeight + (s.scrollHeight - s.clientHeight) + 40, 8000);
  });
  await page.setViewportSize({ width, height: tall });
  await page.waitForTimeout(150);
}

async function crop(name, fromSel, toSel = fromSel) {
  await strip();
  await grow();
  const box = await page.evaluate(
    ([from, to]) => {
      const pick = (spec) => {
        const [sel, at] = spec.split('@');
        const all = [...document.querySelectorAll(sel)];
        if (at === undefined) return all[0];
        const n = Number(at);
        return n < 0 ? all[all.length + n] : all[n];
      };
      const first = pick(from);
      const last = pick(to);
      if (!first || !last) return null;
      const a = first.getBoundingClientRect();
      const b = last.getBoundingClientRect();
      return { top: a.top, bottom: b.bottom };
    },
    [fromSel, toSel]
  );
  if (!box) {
    errors.push(`${name}: ${fromSel} or ${toSel} not found`);
    await page.setViewportSize({ width, height: 844 });
    return;
  }
  const top = Math.max(0, Math.floor(box.top) - 10);
  const height = Math.min(Math.ceil(box.bottom - top) + 12, 4000);
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: { x: 0, y: top, width, height } });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
  await page.setViewportSize({ width, height: 844 });
}

/** The epoch day arithmetic epochDay.ts uses (ADR-0001: the local calendar
    day, counted from Date.UTC(y, m, d)) - duplicated here rather than
    imported, since this script runs against a built app and has no `$lib`
    of its own to import it from. */
function todayEpochDay() {
  const now = new Date();
  return Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
}

for (const theme of ['light', 'dark']) {
  await fillEveryFeature();
  await setLook('trans', theme);

  // 1. The Journal door's foot.
  await settle('/calendar');
  await page.waitForSelector('[data-day-card]');
  if (tag === 'before') {
    await page.waitForSelector('[data-week-strip]');
    await crop(`calendar-foot-${theme}`, '[data-day-card]@-1', '[data-week-strip]');
  } else {
    await page.locator('[data-recent-days-more]').click();
    await page.waitForTimeout(500);
    await crop(`calendar-foot-${theme}`, '[data-day-card]@-3', '[data-recent-days-more]');
  }

  // 2. Search's opening state - nothing typed yet.
  await settle('/search');
  if (tag === 'before') {
    await page.waitForSelector('[data-notice="search-idle"]');
    await crop(`search-opening-${theme}`, '[data-screen-header]', 'p.search-hint');
  } else {
    await page.waitForSelector('[data-search-idle]');
    await crop(`search-opening-${theme}`, '[data-screen-header]', '[data-search-idle]');
  }

  // 3. A new entry's save bar.
  await settle(`/entry/new/${todayEpochDay()}`);
  await page.waitForSelector('[data-app-savebar]');
  await crop(`editor-save-bar-${theme}`, '[data-app-savebar]');
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();

console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}

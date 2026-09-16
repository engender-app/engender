/* Renders for the lead time, on screen (redesign phase 10 ticket 16), for
   sign-off.

   Only what the ticket changed: the new field on the stock editor, and the
   two surfaces that now name the reorder-by day instead of a countdown -
   Home's low-stock notice and the /care spine mark. Everything else on
   each screen is left in frame only as far as it gives the changed piece
   its context (ticket 23's field-gallery.mjs precedent), never a whole
   screen on its own.

   Updated by ticket 09 (ADR-0084): the stock editor stopped being its own
   screen at /settings/stock and is a sheet off Care's regimen block now,
   opened here through the Hormones card's own "stock" row - a stale
   render, from before that move, would have opened the sheet already
   showing the entry rather than the plain list this documents.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/lead-time-gallery.mjs [--out /abs/path] */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/lead-time-shots')));

const SETTLED = 500;

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];
const errors = [];

let page;
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));

async function reopen(width = 390, scale = 2) {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width, height: width > 800 ? 900 : 844 }, deviceScaleFactor: scale });
  watch(page);
}

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
    if (!document.getElementById('lead-time-shot-css')) {
      const style = document.createElement('style');
      style.id = 'lead-time-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

async function shootEl(name, selector, extra = 16) {
  await strip();
  await page.waitForTimeout(300);
  const box = await page.evaluate(
    ([sel, extra]) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      return { x: Math.max(r.x - extra, 0), y: Math.max(r.y - extra, 0), width: r.width + extra * 2, height: r.height + extra * 2 };
    },
    [selector, extra]
  );
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: box });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

async function setLook(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}

async function setLanguage(lang) {
  await settle('/settings');
  await page.locator(`[data-segment="${lang}"]`).click();
  await page.waitForURL('**/settings', { timeout: 15000 });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

async function fillEveryFeature() {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1000);
}

/** Opens an existing stock row by drug name and rewrites its quantity and
    lead time, leaving every other field as the fixture seeded it. `null`
    leaves the lead-time field empty (cleared). */
async function editStock(drug, quantity, leadTimeDays) {
  await settle('/care');
  await page.locator('[data-list-row="stock"]').click();
  await page.waitForSelector('[data-sheet]');
  await page.locator('[data-stock]', { hasText: drug }).click();
  await page.fill('#care-stock-quantity', String(quantity));
  await page.fill('#care-stock-lead-time', leadTimeDays === null ? '' : String(leadTimeDays));
  await page.locator('[data-save-stock]').click();
  await page.waitForSelector('[data-sheet]', { state: 'hidden' });
  await page.waitForTimeout(SETTLED);
}

/* ---------- 1. The field itself: empty, then typed, then cleared ---------- */
for (const [lang, width, scale] of [
  ['en', 390, 2],
  ['pl', 390, 2],
  ['en', 320, 2],
  ['en', 195, 4] // what 200% zoom leaves of a 390px phone (field-gallery.mjs's own convention)
]) {
  await reopen(width, scale);
  await settle('/');
  if (lang === 'pl') await setLanguage('pl');
  await setLook('trans', 'light');
  await settle('/care');
  await page.locator('[data-list-row="stock"]').click();
  await page.waitForSelector('[data-sheet]');
  /* A fresh journal's stock list is empty, so the sheet opens on its own
     empty state rather than the plain list - `[data-add-stock]` only
     exists once there is at least one entry to list beside it. */
  const emptyAction = page.locator('[data-notice="care-stock-empty"] [data-notice-action]');
  if (await emptyAction.count()) {
    await emptyAction.click();
  } else {
    await page.locator('[data-add-stock]').click();
  }
  await page.waitForSelector('#care-stock-lead-time');
  await shootEl(`field-empty-${lang}-${width}`, '[data-sheet]');

  await page.fill('#care-stock-lead-time', '21');
  await shootEl(`field-filled-${lang}-${width}`, '[data-sheet]');
}

/* ---------- 2. Home's notice and the /care spine, naming the same day ---------- */
const SCENARIOS = [
  // Long lead time pulls the reorder day inside Home's 7-day gate well
  // before the drug itself is anywhere near out - the whole point of the
  // ticket, and the flagship render.
  { name: 'reorder', drug: 'Progesterone', quantity: 30, leadTimeDays: 21 },
  // No lead time: the notice and the rail fall back to the run-out day
  // itself, worded and labelled differently from the case above.
  { name: 'projected', drug: 'Progesterone', quantity: 5, leadTimeDays: null },
  // Physically out already, regardless of any lead time.
  { name: 'out', drug: 'Progesterone', quantity: 0, leadTimeDays: null }
];

for (const scenario of SCENARIOS) {
  await reopen(390, 2);
  await fillEveryFeature();
  await setLook('trans', 'light');
  await editStock(scenario.drug, scenario.quantity, scenario.leadTimeDays);

  await settle('/');
  await page.waitForSelector('[data-stock-notice]', { timeout: 10000 });
  await shootEl(`notice-${scenario.name}`, '[data-stock-notice]');

  await settle('/care');
  await page.waitForSelector('[data-chart-card="care-spine"]', { timeout: 10000 });
  await shootEl(`spine-${scenario.name}`, '[data-chart-card="care-spine"]');
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}

/* Renders for ticket 09 (ADR-0084), for sign-off.

   Only what the ticket changed: Care's Hormones card (lost its "Dose log"
   and "Cumulative exposure" rows) and the regimen block above the rail
   (gained a dose-total line and a stock line), plus that stock line's own
   sheet opened. Everything else on the screen is left out of frame - the
   crop follows the changed area, not the whole screen (redesign ticket 59
   precedent: "show only what the ticket changed").

   trans, light and dark, only (2026-09-14 standing rule) - the full
   palette cross product is palette-contrast.test.ts's job, not a sign-off
   page's.

   Before and after (lookback-05-gallery.mjs's own precedent: `--tag`
   picks which selectors and routes this ticket moved things between).
   Before, there is no `.care-regimen-block` wrapper yet - just the bare
   drug-name anchor with none of the lines this ticket added - and the
   stock editor is the whole of `/settings/stock`, not a sheet. Run against
   each build separately, from that build's own checkout as the cwd (vite's
   preview({ root }) serves the cwd's build):

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/ticket-09-sign-off-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/ticket-09-sign-off-gallery.mjs --tag after --out /abs/dir */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/ticket-09-sign-off-shots')), tag);

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];
const errors = [];

let page;
const watch = (p) => p.on('pageerror', (err) => errors.push(String(err)));

async function reopen() {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
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
    if (!document.getElementById('sign-off-shot-css')) {
      const style = document.createElement('style');
      style.id = 'sign-off-shot-css';
      style.textContent =
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
      document.head.append(style);
    }
  });
}

async function shootBox(name, box, extra = 16) {
  await strip();
  await page.waitForTimeout(300);
  const padded = {
    x: Math.max(box.x - extra, 0),
    y: Math.max(box.y - extra, 0),
    width: box.width + extra * 2,
    height: box.height + extra * 2
  };
  await page.screenshot({ path: `${outDir}/${name}.png`, clip: padded });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

async function shootEl(name, selector, extra = 16) {
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, selector);
  if (!box) throw new Error(`selector not found: ${selector}`);
  await shootBox(name, box, extra);
}

async function shootViewport(name) {
  await strip();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
  process.stdout.write(`  ${name}\n`);
}

/* The regimen block and the Hormones card sit far apart on the real page
   (an "Other regimens" list and a mood chart fall between them), so each
   gets its own crop rather than one union box that would sweep in
   everything between - "show only what changed", not the page between two
   changed spots. Before this ticket there is no `.care-regimen-block`
   wrapper - the anchor is the whole of it. */
async function shootRegimenBlock(name) {
  const box = await page.evaluate((wantBlock) => {
    const anchor = document.querySelector('[data-care-regimen]');
    const el = wantBlock ? anchor?.closest('.care-regimen-block') : anchor;
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, tag === 'after');
  if (!box) throw new Error('regimen row/block not found');
  await shootBox(name, box);
}

async function shootHormonesCard(name) {
  const box = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('[data-section-heading]')].find((el) =>
      el.textContent?.includes('Hormones')
    );
    const card = heading?.nextElementSibling;
    if (!card) return null;
    card.scrollIntoView({ block: 'center' });
    const r = card.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (!box) throw new Error('Hormones card not found');
  await shootBox(name, box);
}

async function setLook(palette, theme) {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).first().click();
  await page.waitForFunction((t) => document.documentElement.dataset.theme === t, theme);
}

async function fillEveryFeature() {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1000);
}

for (const theme of ['light', 'dark']) {
  await reopen();
  await fillEveryFeature();
  await setLook('trans', theme);

  await settle('/care');
  await page.waitForSelector('[data-chart-card="care-spine"]', { timeout: 10000 });
  /* Once, here, before any rect gets measured: the demo bar sits in normal
     document flow (`position: relative`), so removing it later (shootBox's
     own strip() call) shifts everything below it upward and strands any
     box already computed against the pre-strip layout. Every settle() up
     to this point still needs the bar on screen to drive it. */
  await strip();
  await shootRegimenBlock(`regimen-block-${theme}`);
  await shootHormonesCard(`hormones-card-${theme}`);

  if (tag === 'before') {
    /* The stock editor's whole screen - what /settings/stock still is on
       this checkout, before ADR-0084 folds it into a sheet off Care. */
    await settle('/settings/stock');
    await shootViewport(`stock-screen-${theme}`);
  } else {
    // The stock sheet, opened from the regimen block's own line - the same
    // fact as the spine's runOut mark, stated as a sentence instead of a
    // date on the axis.
    await settle('/care');
    await page.locator('[data-care-regimen-stock]').click();
    await page.waitForSelector('[data-sheet]');
    await page.waitForTimeout(300);
    await shootEl(`stock-sheet-${theme}`, '[data-sheet]');
  }
}

await writeFile(`${outDir}/manifest.json`, JSON.stringify({ tag, shots, errors }, null, 2));
await page.close();
await browser.close();
await app.close();
console.log(`${shots.length} shot(s) in ${outDir}`);
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exitCode = 1;
}

/* Renders for phase 11 all-four-doors ticket 13, for sign-off.

   Only what the ticket changed: the axis (now drawing a personal effect and
   a side effect as two mark kinds, told apart by shape) and the side
   effects list, which moved onto this screen from /health/side-effects. The
   cycle block moved with it but draws exactly as it did there, so it is
   left out of frame - redesign ticket 59's own precedent, "show only what
   the ticket changed".

   trans, light and dark, only (2026-09-14 standing rule) - the full palette
   cross product is palette-contrast.test.ts's job, not a sign-off page's.

   Before and after (ticket-09's own precedent: `--tag` picks which
   selectors and routes this ticket moved things between). Before, the axis
   at /practice/personal-effects draws only personal effects - no side
   effect ever reaches it - and the side effects list is the whole of a
   separate screen at /health/side-effects. After, both live on
   /practice/personal-effects: the axis draws both mark kinds, and
   `data-side-effects-section` is the crop for the merged list. Run against
   each build separately, from that build's own checkout as the cwd (vite's
   preview({ root }) serves the cwd's build):

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/ticket-13-sign-off-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/ticket-13-sign-off-gallery.mjs --tag after --out /abs/dir */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/ticket-13-sign-off-shots')), tag);

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
    el.scrollIntoView({ block: 'center' });
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

  await settle('/practice/personal-effects');
  await page.waitForSelector('[data-noticed-axis]', { timeout: 10000 });
  /* Once, here, before any rect gets measured: the demo bar sits in normal
     document flow, so removing it later (shootBox's own strip() call)
     shifts everything below it upward and strands any box already computed
     against the pre-strip layout (ticket-09's own note). */
  await strip();
  await shootEl(`axis-${theme}`, '[data-noticed-axis]');

  if (tag === 'before') {
    // The whole of the screen this ticket folded in - there is no scoped
    // wrapper to crop to yet, and the point of the "before" shot is that
    // this was a screen of its own.
    await settle('/health/side-effects');
    await page.waitForSelector('[data-side-effect]', { timeout: 10000 });
    await shootViewport(`side-effects-${theme}`);
  } else {
    await settle('/practice/personal-effects');
    await page.waitForSelector('[data-side-effects-section] [data-side-effect]', { timeout: 10000 });
    await shootEl(`side-effects-${theme}`, '[data-side-effects-section]');
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

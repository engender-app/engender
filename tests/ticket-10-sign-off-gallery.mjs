/* Renders for phase 11 all-four-doors ticket 10, for sign-off.

   Care whole, because this ticket changes the whole screen: the rail, the
   regimen blocks under it and every row under those. Redesign ticket 59's
   "show only what the ticket changed" is satisfied by the screen itself
   being what changed.

   Two journals. The full fixture runs three regimens at once - an
   injectable estradiol on a weekly rhythm, an everyday progesterone and an
   everyday sertraline - which is the case the ticket exists for. The
   persona runs none, and has a lab draw and nothing else, which is the case
   that has to keep working: before this ticket its rail drew today and the
   draw on one line, and a lane-less rail still has to.

   trans, light and dark, only (2026-09-14 standing rule) - the full palette
   cross product is palette-contrast.test.ts's job, not a sign-off page's.

   Before and after (ticket 09's own precedent). Run against each build
   separately, from that build's own checkout as the cwd, since vite's
   preview serves the cwd's build:

     cd <before-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/ticket-10-sign-off-gallery.mjs --tag before --out /abs/dir

     cd <after-checkout> && VITE_DEMO=1 npm run build
     node <this-repo>/tests/ticket-10-sign-off-gallery.mjs --tag after --out /abs/dir */
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
const outDir = resolve(flag('out', resolve(here, '../.claude/ticket-10-sign-off-shots')), tag);

await mkdir(outDir, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = [];
const errors = [];

let page;

async function reopen() {
  if (page) await page.close();
  page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', (err) => errors.push(String(err)));
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

/** The whole screen, which needs the viewport grown to it first.

    The document does not scroll - `main#app-main`
    (`[data-app-scroll-region]`) does - so neither `fullPage` nor an element
    shot of the screen gets anything but the top of it: the rest was never
    painted. Ticket 13's built-in element screenshot works for a section
    inside the fold and not for this, which was the first render here, four
    PNGs with one viewport of Care and 3,800px of blank under it.

    Grown in rounds rather than once, and the round trip repeated until the
    number stops moving: the rail's captions settle on their own delays and
    the blocks arrive when six reads answer, so one measurement can land
    mid-arrival. The viewport goes back to 390x900 afterwards, so only the
    height was ever unreal. */
async function shootScreen(name) {
  await strip();
  let last = 0;
  for (let round = 0; round < 5; round += 1) {
    await page.waitForTimeout(400);
    const tall = await page.evaluate(() => {
      const region = document.querySelector('[data-app-scroll-region]');
      return Math.min(window.innerHeight + (region.scrollHeight - region.clientHeight) + 40, 8000);
    });
    if (tall <= last + 4) break;
    last = tall;
    await page.setViewportSize({ width: 390, height: tall });
  }
  await strip();
  await page.locator('[data-app-root]').screenshot({ path: `${outDir}/${name}.png` });
  await page.setViewportSize({ width: 390, height: 900 });
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

async function shootCare(name) {
  await settle('/care');
  /* The rail is gated on six reads answering together, and every caption
     settles on a delay proportional to its distance from the middle, so
     this waits for the rail and then for the last of them. */
  await page.waitForSelector('[data-care-rail], [data-notice="care-empty"]', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shootScreen(name);
}

for (const theme of ['light', 'dark']) {
  /* A fresh page is a fresh journal, and a fresh journal is the persona
     (demo/controls.ts: only "fill every feature" adds a regimen). Shot
     before the fixture is seeded, in that order, so one page serves both. */
  await reopen();
  await setLook('trans', theme);
  await shootCare(`care-persona-${theme}`);

  await fillEveryFeature();
  await setLook('trans', theme);
  await shootCare(`care-fixture-${theme}`);
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

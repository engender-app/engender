/* Screenshots of the re-keyed axis (phase 8 features ticket 16): /body-map
   and the wear trend on each axis the demo journal can offer, in the
   default trans palette.

   One palette on purpose. The picker and the note are type and line, not
   colour that carries a value, so the 8-palette sweep the constellation and
   spread galleries run would be 16 pictures of the same control (Alicja,
   2026-09-03: "only take screens of the default trans theme").

   Needs the full fixture, not the persona: the axes are data-gated, and
   only the fixture has a dose log with completed injection intervals in it
   and a procedure with a surgery date. The seeding resolves by navigating
   to /more, so that URL is what the click waits on.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/day-axis-gallery.mjs [outDir]
   Default outDir is .claude/day-axis-shots, which is gitignored and durable. */
import { preview } from 'vite';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/day-axis-shots'));
const THEMES = ['light', 'dark'];

/* Emptied first: an anchored axis is named `since:<uuid>` and the demo
   mints a fresh procedure on every seeding, so leftovers from an earlier
   run would sit beside this one's under names nothing distinguishes. */
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
const shots = [];

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

/* Palette and theme are one compound selector, so both go through the app's
   own settings rather than a hand-set attribute: a later page.goto drops
   the attribute and every shot after it is a picture of the last palette. */
async function dress(theme) {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

/* The viewport rather than [data-app-root]: the screen scrolls inside the
   app frame, so the root's own box is one viewport tall and a full-element
   shot is a picture of the top of the page. The controls are what this
   gallery is about, so they are scrolled to first. */
async function shoot(name, anchor) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-toast]').forEach((t) => t.remove());
    // The demo bar is scaffolding, not the screen: left in, it takes the top
    // third of a 390x844 shot and offsets everything under it.
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
  if (anchor && (await page.locator(anchor).count())) {
    await page.locator(anchor).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
}

/* A card is not the scroll container, so its own box is the whole card and
   an element shot is the card rather than the top of it. */
async function shootElement(name, selector) {
  const card = page.locator(selector).first();
  await card.scrollIntoViewIfNeeded();
  // The floating nav bar paints over the bottom of a card even in an
  // element shot, which is where a chart's two end labels are, so it is
  // hidden for the duration and put back after.
  await page.evaluate(() => {
    document.querySelector('[data-app-nav]')?.setAttribute('data-gallery-hidden', '');
    document.querySelectorAll('[data-toast]').forEach((t) => t.remove());
  });
  await page.addStyleTag({ content: '[data-gallery-hidden]{display:none!important}' });
  await page.waitForTimeout(250);
  await card.screenshot({ path: `${outDir}/${name}.png` });
  await page.evaluate(() => document.querySelector('[data-app-nav]')?.removeAttribute('data-gallery-hidden'));
  shots.push(name);
}

async function onAxis(pickerKey, value) {
  await page.selectOption(`[data-chart-picker="${pickerKey}"]`, value);
  // The re-keyed query re-reads all history, and the slot's own resize runs
  // 240ms; the shot waits out both rather than catching the travel.
  await page.waitForTimeout(900);
}

await settle('/');
await page.locator('[data-fill-every-feature]').click();
await page.waitForURL('**/more', { timeout: 300000 });

const screens = [
  { name: 'body-map', path: '/body-map', picker: 'body-map-axis' },
  { name: 'wear', path: '/settings/wear', picker: 'wear-axis' }
];

for (const theme of THEMES) {
  await dress(theme);
  for (const screen of screens) {
    await settle(screen.path);
    await page.waitForSelector(`[data-chart-picker="${screen.picker}"]`);
    const axes = await page.locator(`[data-chart-picker="${screen.picker}"] option`).evaluateAll((nodes) =>
      nodes.map((node) => node.value)
    );
    for (const [index, axis] of axes.entries()) {
      await onAxis(screen.picker, axis);
      // The uuid in an anchored axis is minted fresh by every seeding, so
      // the file is named by which anchored axis it is instead.
      const name = axis.startsWith('since:') ? `since-${index - 1}` : axis;
      const slug = `${screen.name}-${name}-${theme}`;
      await shoot(slug, '.kit-reading-controls');
      // And the chart alone, where the axis actually shows: its marks, its
      // two ends, and whether anything is drawn at all.
      await shootElement(`${slug}-chart`, '[data-chart-card]');
    }
  }
}

/* And the one state no axis switch reaches: a journal that can only answer
   the calendar has no picker and no note at all. The persona alone is that
   journal - no dose log, no procedure - so it is reached by discarding the
   fixture rather than by hiding a control. */
await settle('/');
/* text-under-test, and a gallery is a dev script: the demo bar's reset has
   no grip handle of its own, so a copy edit there fails this loudly rather
   than quietly shooting the fixture again. */
await page.getByRole('button', { name: 'Reset demo state' }).click();
// The reset reseeds the persona and lands on Home; Home's own handle is the
// signal that the reseed finished, not a timeout.
await page.waitForSelector('[data-home-hello]', { timeout: 300000 });
await page.waitForTimeout(1000);
for (const theme of ['light']) {
  await dress(theme);
  for (const screen of screens) {
    await settle(screen.path);
    await page.waitForTimeout(700);
    await shoot(`${screen.name}-no-axis-offered-${theme}`, '[data-chart-card]:first-of-type');
  }
}

await browser.close();
await app.close();
console.log(`${shots.length} shots in ${outDir}`);
console.log(shots.join('\n'));

/* Screenshots of the hormone curve's marker layer (phase 8 features ticket
   15), in the default trans palette only - Alicja asked for that one theme
   while signing the layer off.

   Needs Fill every feature: the demo persona has no dose log at all, so
   without it the screen draws its empty state and there is nothing to mark.
   The fixture's weekly injections over 500 days are also the density case
   the layer had to survive, which is the point of shooting 180 days as well
   as 30 and 90.

   Run: node tests/curve-markers-gallery.mjs [outDir]
   Default outDir is .claude/curve-marker-shots, which is gitignored and
   durable. It changes no source file and needs no rebuild afterwards. */
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/curve-marker-shots'));

await mkdir(outDir, { recursive: true });
const shots = [];

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
/* The fixture is 500 days of a full journal, so the heavier screens boot
   past Playwright's 30s default. */
page.setDefaultTimeout(90000);

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

const shoot = async (name) => {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
  await page.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

/* The card on its own, which is what the layer is actually judged on: the
   demo bar and the tab bar take a third of a 390px viewport between them,
   and the chart sits below the fold on every screen this app has. */
const shootCard = async (name, which = 0) => {
  const card = page.locator('[data-chart-card]').nth(which);
  await card.scrollIntoViewIfNeeded();
  /* The tab bar is fixed to the app frame and paints over whatever is under
     it, including an element screenshot's own region, so it goes for the
     shot. The demo bar goes with it for the same reason. */
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-app-nav], .demo-bar')) {
      (el instanceof HTMLElement ? el : null)?.style.setProperty('display', 'none', 'important');
    }
  });
  await page.waitForTimeout(300);
  await card.screenshot({ path: `${outDir}/${name}.png` });
  shots.push(name);
};

const scrollTo = async (where) => {
  await page.evaluate((to) => {
    const appRoot = document.querySelector('[data-app-root]');
    const scroller = appRoot?.querySelector('[data-screen]')?.parentElement ?? appRoot;
    scroller?.scrollTo({ top: to === 'foot' ? (scroller?.scrollHeight ?? 0) : 0 });
    window.scrollTo({ top: to === 'foot' ? document.body.scrollHeight : 0 });
  }, where);
  await page.waitForTimeout(300);
};

try {
  // Seeding resolves with its own goto('/more'), so wait for that before
  // navigating anywhere.
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 120000 });
  await page.waitForTimeout(1500);

  // Palette and theme are one compound selector and a goto resets a
  // hand-set data-theme, so both come from the real controls first.
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator('[data-segment="light"]').click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');

  for (const days of ['30', '90', '180']) {
    await settle('/settings/hormone-curve');
    await page.waitForSelector('.band-chart, .qual-chart', { timeout: 20000 });
    await page.locator(`[data-segment="${days}"]`).click();
    await page.waitForTimeout(700);
    await shootCard(`curve-${days}d-card`);
    await scrollTo('foot');
    await shoot(`curve-${days}d-foot`);
    await scrollTo('top');
  }

  // One mark open, which is where the tap-through lives.
  await settle('/settings/hormone-curve');
  await page.waitForSelector('.curve-markers .chart-hit', { timeout: 20000 });
  const marks = page.locator('.curve-markers .chart-hit');
  const count = await marks.count();
  console.log(`marks on the first chart's layer: ${count}`);
  if (count > 0) {
    /* Scrolled to first and clicked for real. The tab bar is fixed over the
       foot of the frame, so a forced click at a mark sitting under it hits
       the tab bar instead and reads as the handler never firing. */
    await page.locator('[data-chart-card]').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await marks.nth(Math.min(count - 1, Math.floor(count / 2))).click();
    await page.waitForTimeout(500);
    const links = await page.locator('.marker-link').count();
    console.log(`marker readout rows after the tap: ${links}`);
    await shootCard('curve-marker-open');
  }

  // Focused rather than tapped, so the ring on the hit target is visible.
  if (count > 0) {
    await page.locator('[data-chart-card]').first().scrollIntoViewIfNeeded();
    await marks.nth(Math.min(count - 1, Math.floor(count / 2))).focus();
    await page.waitForTimeout(300);
    await shootCard('curve-marker-focus');
  }

  /* The illustrative curve carries the same layer, and it is the only chart
     somebody on oral estradiol ever sees, so it is worth a shot of its own.
     The fixture's dose log is all injectable, so the shot needs an oral dose
     logged first - and the way to log one, /doses, does not boot in a
     production build at all. That is a bug on clean main, reproduced there
     on 2026-09-03 as `Cannot read properties of undefined (reading '$set')`
     with the app root stuck at data-boot="booting", and nothing this ticket
     touched. So the section is shot when the journal happens to hold one and
     skipped otherwise, rather than seeding it. */
  await settle('/settings/hormone-curve');
  const qualIndex = await page.locator('[data-chart-card]').evaluateAll((cards) =>
    cards.findIndex((card) => card.querySelector('.qual-chart') !== null)
  );
  if (qualIndex >= 0) await shootCard('curve-illustrative-card', qualIndex);
  else console.log('no illustrative curve in this journal, so no shot of one');
} finally {
  await page.close();
  await browser.close();
  await app.close();
}

console.log(`\n${shots.length} shots in ${outDir}`);

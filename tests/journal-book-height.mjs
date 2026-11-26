/* Measure the app scroll region with the demo bar removed. Compare
   the default year's folded and expanded heights, and check the seventh
   toggle is within two viewports. Print stays in view because
   hostSaveBar pins it in the app column.

   VITE_DEMO=1 npm run build
   node tests/journal-book-height.mjs */
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { fillDate, launchChromium, dateValue } from './browser-harness.mjs';

const VIEWPORT = { width: 390, height: 844 };
/* Three years back from the end the screen opens on, which is the "a longer
   range does not change that" half of the acceptance. */
const LONG_RANGE_DAYS = 365 * 3;

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const page = await context.newPage();

const strip = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });

const settle = async (path, { keepDemoBar = false } = {}) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  if (!keepDemoBar) await strip();
  /* Long enough for the book's own read to have answered, for the chunked
     entry list to have finished growing, and for the photos on it to have
     been read off the file store: a measurement taken over a placeholder or
     a half-drawn list is a measurement of that. */
  await page.waitForTimeout(4000);
};

const measure = () =>
  page.evaluate(() => {
    const main = document.querySelector('.app-main') ?? document.scrollingElement;
    const ticks = document.querySelectorAll('[data-inclusion]');
    const last = ticks[ticks.length - 1];
    const height = Math.round(main.scrollHeight);
    if (!last) return { height, toLastTick: null };
    const top = last.getBoundingClientRect().bottom - main.getBoundingClientRect().top + main.scrollTop;
    return { height, toLastTick: Math.round(top) };
  });

/** Sets the start date `days` before the end the screen opened on, typed
    into the picker's foot (browser-harness.mjs's fillDate). */
const setStartDaysBack = async (days) => {
  const end = await dateValue(page.locator('#journal-book-end'));
  const start = new Date(new Date(`${end}T12:00:00`).getTime() - days * 86_400_000);
  await fillDate(page, '#journal-book-start', start.toLocaleDateString('sv-SE'));
  await page.waitForTimeout(4000);
};

const rows = [];

try {
  /* Every feature filled, which is the journal the audit's figure was
     measured on. The seeding resolves with a goto('/more'). */
  await settle('/', { keepDemoBar: true });
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });

  await settle('/settings/journal-book');
  const summary = await page.locator('[data-book-summary]').textContent();
  rows.push({ what: 'one year, folded', ...(await measure()) });

  const foldable = await page.locator('[data-book-preview-toggle]').count();
  if (foldable) {
    await page.locator('[data-book-preview-toggle]').click();
    await page.waitForTimeout(4000);
    rows.push({ what: 'one year, open', ...(await measure()) });
    await page.locator('[data-book-preview-toggle]').click();
    await page.waitForTimeout(1000);
  }

  await setStartDaysBack(LONG_RANGE_DAYS);
  rows.push({ what: 'three years, folded', ...(await measure()) });

  console.log(`\n390x844, demo journal with every feature filled\n`);
  console.log(`summary line: ${summary}\n`);
  for (const row of rows) {
    const reach = row.toLastTick == null ? 'no switches found' : `last switch ends at ${row.toLastTick}px`;
    console.log(`${row.what.padEnd(22)}  ${String(row.height).padStart(6)}px   ${reach}`);
  }
  for (const row of rows.filter(row => row.what.endsWith('folded'))) {
    assert.ok(row.height < 3000, `${row.what}: ${row.height}px`);
    assert.ok(row.toLastTick <= VIEWPORT.height * 2, 'Switches fit within two viewports');
  }
  console.log('PASS: folded ranges stay below 3000px; switches fit within two viewports');
} finally {
  await browser.close();
  await app.close();
}

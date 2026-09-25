/* How tall the journal book screen is, measured (phase 12 final-audit
   ticket 20, audit finding U11).

   The audit's case is a number: 26,931px on the default one-year range, the
   tallest screen in the app by a factor of four, because the whole chosen
   range was laid out inline - every entry's date, mood word and text, and a
   full-bleed block per photo. So the fix owes the same number back, measured
   the same way.

   Three readings, all off the scroll region rather than the document,
   because the app frame is what scrolls (the walkthrough's own geometry
   rule), and with the demo bar removed since it is review chrome:

     closed     what the screen holds with the pages folded away, which is
                what the acceptance is written against.
     open       the same range with the fold open. That is the document this
                ticket moved, so it stands for what the screen was before
                it, give or take the summary line and the fold's own row.
     toLastTick how far down the region the seventh switch sits, which is
                what "the toggles are in the first two viewports" means.

   Print is not measured: `hostSaveBar` moves the foot out of the scroll
   region into the app column, so it is on screen at every scroll position.

   Run: node tests/journal-book-height.mjs
   Serves the `build/` in the current working directory, so it wants a
   `VITE_DEMO=1 npm run build` first. */
import assert from 'node:assert/strict';
import { preview } from 'vite';
import { launchChromium, waitForFlatpickr } from './browser-harness.mjs';

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

/** Sets the start date `days` before the end the screen opened on.
    DatePicker's visible field is a readonly flatpickr altInput, so it is
    driven through the instance the component parks on the element. */
const setStartDaysBack = async (days) => {
  await waitForFlatpickr(page, '#journal-book-end');
  await waitForFlatpickr(page, '#journal-book-start');
  const end = await page.$eval('#journal-book-end', (input) => input._flatpickr.selectedDates[0].getTime());
  const start = new Date(end - days * 86_400_000);
  await page.$eval(
    '#journal-book-start',
    (input, at) => input._flatpickr.setDate(new Date(at), true),
    start.getTime()
  );
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

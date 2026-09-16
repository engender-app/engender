/* Do the two change lines travel, or do they cut? (phase 10 redesign
   ticket 61)

   Both are `{#if}` blocks that appear and disappear while the screen is
   already on, and the standing motion clause says every appearance is
   animated and nothing is in neither place for a frame. A recording at
   speed cannot answer that and neither can a screenshot, so this samples
   the one property the appearance animates - the block's own height, which
   is what `disclose` drives - on every animation frame, and prints the
   frames.

   The two blocks are reached differently because they answer to different
   things:

     - the size change lines go when the category filter moves to a
       category with no change in it, and come back when it moves to one
       that has;
     - the measurement span goes when the selected type has fewer than two
       readings, which is the same threshold the chart draws at, so this
       adds a custom type, writes one reading (no span), starts sampling,
       and writes a second.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/measurements-sizes-motion.mjs */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
};

/** Start a rAF sampler over one selector's computed height. `null` is a
    frame where the element is not in the document at all, which is what
    tells a travel apart from a cut. */
const sample = (selector) =>
  page.evaluate((sel) => {
    window.__samples = [];
    const tick = (t) => {
      const el = document.querySelector(sel);
      window.__samples.push([Math.round(t), el ? Math.round(parseFloat(getComputedStyle(el).height)) : null]);
      if (window.__samples.length < 150) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, selector);

/** The samples with every repeat collapsed, plus what they add up to. A
    block that cut would show one frame of its full height and then null,
    with nothing in between. */
const read = async () => {
  const raw = await page.evaluate(() => window.__samples);
  const steps = raw.filter((s, i) => i === 0 || s[1] !== raw[i - 1][1]);
  const moving = steps.filter((s) => s[1] !== null);
  return {
    frames: steps.map((s) => s[1]),
    stepCount: steps.length,
    ms: moving.length > 1 ? moving[moving.length - 1][0] - moving[0][0] : 0
  };
};

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

/** One measurement through the screen's own editor. */
const addMeasurement = async (offsetDays, value) => {
  await page.locator('[data-add]').click();
  await page.waitForSelector('#measurement-value');
  await page.$eval('#measurement-date', (input, v) => input._flatpickr.setDate(v, true), iso(offsetDays));
  await page.fill('#measurement-value', String(value));
  await page.locator('[data-save-measurement]').click();
  await page.waitForTimeout(600);
};

const result = {};

try {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);

  /* 1. The size change lines, both ways. 'dresses' has no change in the
        fixture and 'pants' has one. */
  await settle('/body/measurements');
  await page.waitForSelector('[data-size-changes]');
  await sample('[data-size-changes]');
  await page.selectOption('[data-chart-picker="size-category"]', 'dresses');
  await page.waitForTimeout(1500);
  result.changeLinesOut = await read();

  await sample('[data-size-changes]');
  await page.selectOption('[data-chart-picker="size-category"]', 'pants');
  await page.waitForTimeout(1500);
  result.changeLinesIn = await read();

  /* 2. The measurement span, on a type with nothing in it yet. */
  await settle('/body/measurements');
  await page.locator('[data-manage-types]').click();
  await page.waitForSelector('#new-measurement-type');
  await page.fill('#new-measurement-type', 'Thigh');
  await page.locator('[data-add-measurement-type]').click();
  await page.waitForTimeout(800);

  await addMeasurement(-30, 54);
  if (await page.locator('[data-measurement-span]').count()) {
    errors.push('the span drew on one reading, so this run measures nothing');
  }
  await sample('[data-measurement-span]');
  await addMeasurement(-1, 53);
  await page.waitForTimeout(1200);
  result.spanIn = await read();
} finally {
  await page.close();
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ ...result, errors }, null, 2));
if (errors.length) process.exitCode = 1;

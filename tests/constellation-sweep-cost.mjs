/* What the sweep costs, because DIRECTION.md's performance contract says to
   measure the chart tween rather than assume it (phase 5 deepening ticket
   19). The worst case the app can produce is a year of daily entries: 365
   readings behind the scrubber, TRACE_WINDOW of them drawn, re-diffed on
   every frame for the length of --dur-authored.

   Samples requestAnimationFrame deltas across one sweep and reports the
   frame budget it held. Say which machine produced the number when quoting
   it: this is a desktop Chromium, not the device tier.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/constellation-sweep-cost.mjs */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const browser = await launchChromium();
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${base}/stats`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]');
if (await page.locator('[data-leave-setup]').count()) {
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  await page.goto(`${base}/stats`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

await page.locator('[data-chart-card="constellation"]').scrollIntoViewIfNeeded();
await page.locator('[data-segment="365"]').click();
await page.waitForTimeout(1500);

const readings = await page.evaluate(
  () => document.querySelector('[data-chart-card="constellation"] [data-slider]').getAttribute('aria-valuemax')
);

// Re-sweep by going back to 30 and out to 365 again, sampling the second
// one: the range change is what makes the dataset a new dataset.
await page.locator('[data-segment="30"]').click();
await page.waitForTimeout(1200);

const frames = await page.evaluate(async () => {
  const deltas = [];
  let previous = performance.now();
  let running = true;
  const tick = (now) => {
    deltas.push(now - previous);
    previous = now;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  document.querySelector('[data-segment="365"]').click();
  await new Promise((r) => setTimeout(r, 900));
  running = false;
  return deltas.slice(2);
});

const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => sorted[Math.floor((sorted.length - 1) * p)].toFixed(1);
console.log(`readings behind the scrubber: ${Number(readings) + 1}`);
console.log(`frames sampled: ${frames.length}`);
console.log(`median ${pct(0.5)}ms   p95 ${pct(0.95)}ms   worst ${pct(1)}ms`);
console.log(`over 16.7ms: ${frames.filter((d) => d > 16.7).length}`);

await browser.close();
await app.close();

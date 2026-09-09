/* Samples the breathing exercise's countdown ring on every animation frame,
   so "the ring fills" is a measurement rather than a claim (carpet 30).

   The ring is a `stroke-dashoffset` on a 1s linear transition driven by a
   1s interval, and its reset is an `$effect`. Nothing about that is visible
   to a unit test or to a screenshot: a still frame of a stub looks the same
   whether the fill is climbing or restarting, which is how the ring came to
   be a stub from the day it landed. What tells the two apart is the shape of
   the curve over a phase, so this prints one line per 250ms of wall clock
   with the fraction of the circle drawn at the end of it.

   Read it as: within a 4s phase the fraction rises monotonically, and it
   returns to 0 once, at the boundary. A sawtooth with four teeth per phase
   is the defect carpet 30 fixed (main at 8ae757fa: 18.7%, 37.5%, 56.2%,
   75%, with 0.0% between each).

   Run against a demo build, from the checkout being measured - vite's
   preview server resolves .svelte-kit/output relative to the cwd whatever
   root it is handed:
     VITE_DEMO=1 npm run build
     node tests/breathing-ring-sweep.mjs [seconds]
   A second checkout is measured by standing in it and passing this script's
   absolute path, the way tests/bespoke-card-gallery.mjs's before side is. */
import { preview } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const seconds = Number(process.argv[2] ?? 9);
const app = await preview({ root: process.cwd(), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.goto(`${base}/doubt`, { waitUntil: 'networkidle' });
await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
/* A demo build's first run lands in setup (see the gallery scripts). */
if (await page.locator('[data-leave-setup]').count()) {
  await page.locator('[data-leave-setup]').click();
  await page.waitForSelector('[data-home-hello]');
  await page.goto(`${base}/doubt`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
}

await page.locator('[data-breathing-toggle]').click();
const samples = await page.evaluate(async (runFor) => {
  const ring = document.querySelector('.breathing-ring-progress');
  const circumference = 2 * Math.PI * Number(ring.getAttribute('r'));
  const out = [];
  const started = performance.now();
  await new Promise((done) => {
    const step = () => {
      const offset = Number(getComputedStyle(ring).strokeDashoffset.replace('px', ''));
      out.push([Math.round(performance.now() - started), Number((1 - offset / circumference).toFixed(3))]);
      if (performance.now() - started > runFor) return done();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  return out;
}, seconds * 1000);

await browser.close();
await app.close();

let bucket = -1;
let resets = 0;
let previous = 0;
for (const [at, drawn] of samples) {
  if (drawn < previous - 0.2) resets++;
  previous = drawn;
  const which = Math.floor(at / 250);
  if (which === bucket) continue;
  bucket = which;
  const bars = Math.round(drawn * 40);
  console.log(`${String(at).padStart(5)}ms  ${'#'.repeat(bars)}${' '.repeat(40 - bars)} ${(drawn * 100).toFixed(1)}%`);
}
console.log(
  `${samples.length} frames over ${seconds}s, ${resets} reset(s) - one per 4s phase is the contract, ` +
    'four per phase is the defect.'
);

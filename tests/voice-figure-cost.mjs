/* What the absolute-axis figure costs to keep up to date, because phase 8
   features ticket 09 says the hundred-millisecond poll may only change
   against a measurement rather than quietly.

   The claim being measured. The poll behind the live gauge is deliberately
   slower than an animation frame (stores/voiceBenchmark.ts): the gate is
   re-run per reading, and re-running it sixty times a second spends the
   phone's main thread on numbers nobody can see change that fast. Moving
   the trace to an absolute axis did not change how many frames the tracker
   produces - every 10 ms frame is still drawn - so the trace's smoothness
   does not depend on the poll at all. What the ticket did add is furniture
   inside the field: two band washes, the overlap's two edges, up to four
   gutter numbers and the comfort bracket, all re-rendered when the trace
   updates.

   So the question is whether one poll's worth of work still fits inside a
   poll. This samples requestAnimationFrame deltas through a live practice
   session and reports the frame budget held while the figure is updating
   ten times a second.

   Say which machine produced the number when quoting it: this is a desktop
   Chromium, not the device tier, and the ticket asks for the Pixel. Both
   emulators run with the GPU disabled, so no rendering answer can come from
   one at all.

   Run: VITE_DEMO=1 npm run build first, then
        node tests/voice-figure-cost.mjs */
import { preview } from 'vite';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fakeMicrophoneSource = (await readFile(`${here}/fake-microphone.mjs`, 'utf8')).replace(
  /^export /gm,
  ''
);

const browser = await launchChromium({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

await page.addInitScript(`
  ${fakeMicrophoneSource}
  window.__fakeMicrophone = installFakeMicrophone('steady');
`);

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

await settle('/settings/voice?tab=practise');
await page.waitForSelector('[data-comfort-band]');

/* With a comfort band set, so the bracket is drawn too: the measurement
   should be of the most furniture the field can carry. */
await page.locator('[data-comfort-band]').click();
await page.waitForTimeout(300);
await page.locator('[data-comfort-low]').fill('200');
await page.locator('[data-comfort-high]').fill('235');
await page.locator('[data-comfort-save]').click();
await page.waitForTimeout(300);

await page.locator('[data-vp-start]').click();
await page.waitForSelector('[data-vp-gauge]');
// A second of settling, so the trace is at its full 200-frame window and
// every poll is doing the whole job.
await page.waitForTimeout(1200);

const sample = await page.evaluate(async () => {
  const deltas = [];
  let last = performance.now();
  await new Promise((resolve) => {
    const tick = (now) => {
      deltas.push(now - last);
      last = now;
      if (deltas.length >= 240) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const points = document
    .querySelector('[data-pitch-trace]')
    ?.getAttribute('points')
    ?.split(' ').length;
  return { deltas: deltas.slice(1), tracePoints: points ?? 0 };
});

await page.locator('[data-vp-stop]').click();

const deltas = sample.deltas.sort((a, b) => a - b);
const at = (fraction) => deltas[Math.min(deltas.length - 1, Math.floor(fraction * deltas.length))];
const over = (ms) => deltas.filter((delta) => delta > ms).length;

console.log(`frames sampled          ${deltas.length}`);
console.log(`trace points on screen  ${sample.tracePoints}`);
console.log(`median frame            ${at(0.5).toFixed(2)} ms`);
console.log(`p95 frame               ${at(0.95).toFixed(2)} ms`);
console.log(`worst frame             ${deltas[deltas.length - 1].toFixed(2)} ms`);
console.log(`frames over 16.7 ms     ${over(16.7)} of ${deltas.length}`);
console.log(`frames over 33.3 ms     ${over(33.3)} of ${deltas.length}`);

await app.httpServer.close();
await browser.close();

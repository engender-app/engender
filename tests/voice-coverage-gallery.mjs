/* The passage step's coverage cue, frame by frame (redesign ticket 41).

   The cue replaced a hold counter that emptied at every word boundary. It
   only ever fills, and rule 10 says a state change moves, so the thing to
   prove is that it moves rather than jumping: no frame in which it teleports
   to where it is going, and none in which it is in neither place.

   Both halves are here because neither on its own is enough. The samples
   say what the curve did, at animation-frame resolution, off the property
   that is actually animated. The crops say what it looked like, on the
   default flag in both themes, which is what gets signed off.

   The microphone is the shared oscillator (tests/fake-microphone.mjs), so a
   read arrives at a steady rate and the bar sweeps its whole length in the
   8.13 seconds the 98-word English passage asks for.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/voice-coverage-gallery.mjs [outDir] */
import { preview } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.argv[2] ?? resolve(here, '../.claude/voice-coverage'));
const THEMES = ['dark', 'light'];

const fakeMicrophoneSource = (await readFile(`${here}/fake-microphone.mjs`, 'utf8')).replace(
  /^export /gm,
  ''
);

await mkdir(outDir, { recursive: true });
const browser = await launchChromium({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = installFakeMicrophone('steady');
  `);
  return page;
}

async function settle(page, path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

async function dress(page, palette, theme) {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
}

async function clearToasts(page) {
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
}

/** Every animation frame from the moment the microphone opens: what the fill
    is actually translated by, what the block it lives in is clipped to, and
    how wide each of them is. Read off the computed style rather than off the
    app's own state, so a value the app believed and never painted cannot
    pass this. */
async function sample(page, seconds) {
  return page.evaluate((forSeconds) => {
    return new Promise((done) => {
      const frames = [];
      const started = performance.now();
      const step = () => {
        const at = performance.now() - started;
        const live = document.querySelector('[data-vb-live]');
        const rail = document.querySelector('[data-vb-covered]');
        const fill = rail?.firstElementChild ?? null;
        if (fill) {
          const style = getComputedStyle(fill);
          const matrix = new DOMMatrixReadOnly(style.transform);
          const box = rail.getBoundingClientRect();
          frames.push({
            at,
            // The share of the rail the fill actually covers on screen.
            covered: box.width > 0 ? Math.max(0, Math.min(1, 1 + matrix.m41 / box.width)) : 0,
            translate: matrix.m41,
            railWidth: box.width,
            railTop: box.top,
            liveOpacity: live ? Number(getComputedStyle(live).opacity) : null,
            liveClip: live ? getComputedStyle(live).clipPath : null,
            reported: Number(rail.getAttribute('aria-valuenow'))
          });
        }
        if (performance.now() - started < forSeconds * 1000) requestAnimationFrame(step);
        else done(frames);
      };
      requestAnimationFrame(step);
    });
  }, seconds);
}

/** What the samples say. A teleport is a single frame that moves the fill
    more than a poll's worth of honest progress could; "in neither place" is
    a frame where the rail is on the page and the fill is neither where it
    was nor where it is going. */
function verdict(frames) {
  const steps = [];
  for (let i = 1; i < frames.length; i++) {
    steps.push({
      at: frames[i].at,
      from: frames[i - 1].covered,
      to: frames[i].covered,
      delta: frames[i].covered - frames[i - 1].covered
    });
  }
  const moved = steps.filter((s) => Math.abs(s.delta) > 1e-6);
  const biggest = moved.reduce((a, b) => (Math.abs(b.delta) > Math.abs(a.delta) ? b : a), {
    delta: 0,
    at: 0,
    from: 0,
    to: 0
  });
  const retreats = steps.filter((s) => s.delta < -1e-4);
  /* The gate's poll is 100ms and the transition is --dur-fast, so an honest
     frame of this cue moves a fraction of a percent. A tenth of the rail in
     one frame is a jump by any reading. */
  const teleports = steps.filter((s) => s.delta > 0.1);
  const railTops = new Set(frames.map((f) => Math.round(f.railTop)));
  return {
    frames: frames.length,
    seconds: frames.length ? frames[frames.length - 1].at / 1000 : 0,
    movingFrames: moved.length,
    biggestStep: biggest,
    retreats: retreats.length,
    worstRetreat: retreats.length ? Math.min(...retreats.map((s) => s.delta)) : 0,
    teleports: teleports.length,
    teleportFrames: teleports.slice(0, 5),
    startedAt: frames.length ? frames[0].covered : null,
    endedAt: frames.length ? frames[frames.length - 1].covered : null,
    distinctRailTops: railTops.size
  };
}

const report = {};

for (const theme of THEMES) {
  const page = await openPage();
  await dress(page, 'trans', theme);
  await settle(page, '/settings/voice?tab=record');
  await clearToasts(page);

  /* The cue's whole life: the entrance as the take opens, then the fill
     sweeping the 8.13 seconds the English passage's floor asks for, then
     past the top where it stops rather than overrunning. */
  const samplerDone = sample(page, 11);
  await page.locator('[data-vb-record]').click();
  const frames = await samplerDone;
  report[theme] = verdict(frames);
  await writeFile(`${outDir}/frames-${theme}.json`, JSON.stringify(frames));

  await clearToasts(page);
  await page.locator('[data-vb-live]').screenshot({ path: `${outDir}/cue-full-trans-${theme}.png` });
  await page.locator('[data-vb-stop]').click();
  await page.close();
}

/* The two crops the ticket is signed off on beside the numbers: the cue
   part-way through a read, and the practise tab with no run bar under its
   trace. */
for (const theme of THEMES) {
  const page = await openPage();
  await dress(page, 'trans', theme);
  await settle(page, '/settings/voice?tab=record');
  await clearToasts(page);
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(3000);
  await clearToasts(page);
  await page.locator('[data-vb-live]').screenshot({ path: `${outDir}/cue-part-trans-${theme}.png` });
  await page.locator('[data-vb-stop]').click();
  await page.close();

  const practice = await openPage();
  await dress(practice, 'trans', theme);
  await settle(practice, '/settings/voice');
  await practice.locator('[data-segment="practise"]').click();
  await practice.waitForSelector('[data-comfort-band]');
  await practice.locator('[data-vp-start]').click();
  await practice.waitForTimeout(2500);
  await clearToasts(practice);
  await practice.locator('[data-vp-gauge]').screenshot({ path: `${outDir}/practise-trans-${theme}.png` });
  await practice.close();
}

await writeFile(`${outDir}/report.json`, JSON.stringify(report, null, 2));
await app.httpServer.close();
await browser.close();
console.log(JSON.stringify(report, null, 2));

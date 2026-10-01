/* Real-browser check for ux-carpet ticket 236: ticking a roadmap step used
   to fill the box, draw the tick and strike the title in one frame - a
   colour delta of 0.69-0.84 on `.roadmap-box` in a single frame, 3/3 dark
   and 2/3 light in the final desktop sweep (2026-09-24). The fill, the
   tick and the strike are all appearances, which the standing "no yanks
   anywhere" clause says must animate, not cut.

   What it proves, sampling every animation frame across the tap
   (`requestAnimationFrame`, not a fixed wait - a fast CSS transition can
   finish inside one setTimeout tick):
   - `.roadmap-box`'s border-color passes through at least two colours
     strictly between "empty" and "ticked" (the acceptance criterion, read
     off the real computed style rather than eyeballed);
   - the tick glyph's opacity and scale each pass through at least two
     intermediate values, the same `.ap-tick` shape appointment-prep
     already uses;
   - the strike drawn under a done title's `scaleX` also passes through at
     least two intermediate values, rather than snapping from 0 to 1.

   Run against a dev server (no build needed):
     node tests/roadmap-tick-motion-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/roadmap-tick-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

/** Samples a set of getters via requestAnimationFrame for `ms` milliseconds,
    starting right after the click that triggers the transition - so the
    first sample is whatever the browser painted on the very next frame. */
async function sampleFrames(getters, ms) {
  return page.evaluate(
    ({ exprs, ms }) => {
      return new Promise((resolvePromise) => {
        const fns = exprs.map((src) => new Function('return (' + src + ')')());
        const out = Object.fromEntries(exprs.map((_, i) => [i, []]));
        const start = performance.now();
        function tick() {
          for (let i = 0; i < fns.length; i++) {
            let v;
            try {
              v = fns[i]();
            } catch {
              v = NaN;
            }
            out[i].push(v);
          }
          if (performance.now() - start < ms) requestAnimationFrame(tick);
          else resolvePromise(exprs.map((_, i) => out[i]));
        }
        requestAnimationFrame(tick);
      });
    },
    { exprs: getters, ms }
  );
}

/** How many of a series of numbers sit strictly between its own first and
    last value - "intermediate frames", not endpoints, and not a series
    that only ever holds one of the two endpoint values (a cut). */
function intermediateCount(series) {
  const from = series[0];
  const to = series[series.length - 1];
  if (Math.abs(to - from) < 1e-6) return 0;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return series.filter((v) => v > lo + 1e-6 && v < hi - 1e-6).length;
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  await page.goto(`${server.resolvedUrls.local[0]}transition/roadmap`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-goal]');

  // Every goal starts unchecked on a fresh journal; the first one in DOM
  // order is on the pack's opening track (Social).
  const goal = await page.locator('[data-goal]').first().getAttribute('data-goal');
  const rowSel = `[data-goal="${goal}"]`;
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-status') === 'unchecked', rowSel);

  const getters = [
    // border-color as an [r,g,b] channel sum, cheap and monotonic enough
    // for this: the box crosses from --outline to --role-mark once.
    `() => { const s = getComputedStyle(document.querySelector('${rowSel} .roadmap-box')); const m = s.borderColor.match(/[\\d.]+/g) || [0,0,0]; return (+m[0]) + (+m[1]) + (+m[2]); }`,
    `() => +getComputedStyle(document.querySelector('${rowSel} .roadmap-tick')).opacity`,
    `() => { const m = getComputedStyle(document.querySelector('${rowSel} .roadmap-tick')).transform.match(/[\\d.-]+/g) || [1]; return +m[0]; }`, // scale, matrix(a,...)
    `() => { const m = getComputedStyle(document.querySelector('${rowSel} .roadmap-strike-text'), '::after').transform; if (m === 'none') return 0; const n = m.match(/[\\d.-]+/g) || [0]; return +n[0]; }` // scaleX via matrix a
  ];

  const clickAndSample = async () => {
    const [samples] = await Promise.all([
      sampleFrames(getters, 260),
      page.locator(`${rowSel} .kit-row-main`).click()
    ]);
    return samples;
  };
  const samples = await clickAndSample();
  const [borderSeries, opacitySeries, scaleSeries, strikeSeries] = samples;

  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-status') === 'checked', rowSel);

  // Checking a goal can mint a milestone and prompt a sheet over the row
  // (unrelated to this ticket) - close it before the next click, harmless
  // if none appeared.
  if (await page.locator('[data-sheet]').count()) {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-sheet]').length === 0);
  }

  console.log('border-color channel sum, first 10 frames:', borderSeries.slice(0, 10));
  console.log('tick opacity, first 10 frames:', opacitySeries.slice(0, 10));
  console.log('tick scale, first 10 frames:', scaleSeries.slice(0, 10));
  console.log('strike scaleX, first 10 frames:', strikeSeries.slice(0, 10));

  const borderMid = intermediateCount(borderSeries);
  const opacityMid = intermediateCount(opacitySeries);
  const scaleMid = intermediateCount(scaleSeries);
  const strikeMid = intermediateCount(strikeSeries);

  console.log(`intermediate frames - border ${borderMid}, opacity ${opacityMid}, scale ${scaleMid}, strike ${strikeMid}`);

  assert(borderMid >= 2, `the box's border-color should pass through at least two intermediate frames, got ${borderMid}`);
  assert(opacityMid >= 2, `the tick's opacity should pass through at least two intermediate frames, got ${opacityMid}`);
  assert(scaleMid >= 2, `the tick's scale should pass through at least two intermediate frames, got ${scaleMid}`);
  assert(strikeMid >= 2, `the strike's scaleX should pass through at least two intermediate frames, got ${strikeMid}`);

  // checked -> not-my-path: the same box, crossing to its second glyph (the
  // x, [1] of the two always-mounted `.roadmap-tick` spans - safe here since
  // neither is ever removed, unlike the querySelectorAll(...)[1] trap a
  // removed neighbour sets).
  const skipGetters = [
    `() => { const s = getComputedStyle(document.querySelector('${rowSel} .roadmap-box')); const m = s.borderColor.match(/[\\d.]+/g) || [0,0,0]; return (+m[0]) + (+m[1]) + (+m[2]); }`,
    `() => +getComputedStyle(document.querySelectorAll('${rowSel} .roadmap-tick')[1]).opacity`,
    `() => { const m = getComputedStyle(document.querySelectorAll('${rowSel} .roadmap-tick')[1]).transform.match(/[\\d.-]+/g) || [1]; return +m[0]; }`
  ];
  const [skipSamples] = await Promise.all([
    sampleFrames(skipGetters, 260),
    page.locator(`${rowSel} .kit-row-main`).click() // checked -> not-my-path
  ]);
  await page.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('data-status') === 'not-my-path', rowSel);
  const [skipBorder, skipOpacity, skipScale] = skipSamples;
  console.log('not-my-path border-color, first 10 frames:', skipBorder.slice(0, 10));
  console.log('not-my-path x-glyph opacity, first 10 frames:', skipOpacity.slice(0, 10));
  const skipBorderMid = intermediateCount(skipBorder);
  const skipOpacityMid = intermediateCount(skipOpacity);
  const skipScaleMid = intermediateCount(skipScale);
  console.log(`intermediate frames - not-my-path border ${skipBorderMid}, opacity ${skipOpacityMid}, scale ${skipScaleMid}`);
  assert(skipBorderMid >= 2, `the box's border-color (checked -> not-my-path) should pass through at least two intermediate frames, got ${skipBorderMid}`);
  assert(skipOpacityMid >= 2, `the x-glyph's opacity should pass through at least two intermediate frames, got ${skipOpacityMid}`);
  assert(skipScaleMid >= 2, `the x-glyph's scale should pass through at least two intermediate frames, got ${skipScaleMid}`);

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS roadmap tick fill/strike motion check');
} finally {
  await browser.close();
  await server.close();
}

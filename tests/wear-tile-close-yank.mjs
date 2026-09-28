/* The Home wear-timer tile's own close animation, isolated (bug report:
   "the wearing live panel closes in 1 frame, no animation").

   The wear-timer is the only kind in the today tier by default, so stopping
   it (data-wear-stop) usually empties `todayTiles` in the same tick that
   removes the tile itself - the outer `{#if todayTiles.length > 0}` wrapper
   in +page.svelte and the inner `{#each tiles as tile (tile.key)}` both lose
   their one item at once. `Tile.svelte`'s own `transition:collapse|global`
   is meant to survive that regardless of which ancestor block is also being
   torn down; this probe checks whether it actually does.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/wear-tile-close-yank.mjs [--runs 5] [--out <abs dir>]
   Exits 1 on any finding. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '5'));
/* The sampler is armed by a sessionStorage flag its own init script reads
   once, at document load - so the flag has to be set before the navigation
   that will show the tile, and the window has to cover settle time, the
   click, and the close, not just the click. */
const WINDOW_MS = 6000;
const outDir = resolve(flag('out', resolve(here, '../.claude/wear-tile-close')));
await mkdir(outDir, { recursive: true });

const SAMPLER = `(() => {
  if (sessionStorage.getItem('wear-close-probe') !== '1') return;
  const frames = [];
  window.__wearCloseFrames = frames;
  const t0 = performance.now();
  const tick = (now) => {
    const tile = document.querySelector('[data-live-tile="wear-timer"]');
    const grid = document.querySelector('[data-live-tile-grid]');
    const wrapper = grid ? grid.parentElement : null;
    const seenOpacity = (el) => {
      if (!el) return null;
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return Math.round(o * 1000) / 1000;
    };
    frames.push({
      at: Math.round(now - t0),
      tile: !!tile,
      tileOpacity: seenOpacity(tile),
      tileHeight: tile ? Math.round(tile.getBoundingClientRect().height) : null,
      grid: !!grid,
      wrapperPosition: wrapper ? getComputedStyle(wrapper).position : null,
      wrapperHeight: wrapper ? Math.round(wrapper.getBoundingClientRect().height) : null,
      wrapperCss: wrapper ? wrapper.style.cssText : null
    });
    if (now - t0 < ${WINDOW_MS}) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`;

const browser = await launchChromium();
const app = await preview({ root: resolve(here, '..'), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(SAMPLER);

await settlePage(page, base, '/', 'light');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('the persona reset never reached Home');

const runs = [];
for (let run = 0; run < RUNS; run += 1) {
  // Full fixture reseeds a running wear session on its own (fullFixture.ts:
  // one binder session, started 9h ago, durationMs: null) alongside a full
  // grid and fold - so stopping it here can hit the fold-promotion swap
  // path in collapse(), not just the empty-tier case the first probe run
  // covered.
  await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);

  // Armed before the navigation that will show the tile: the sampler's own
  // init script reads this flag once, at document load.
  await page.evaluate(() => sessionStorage.setItem('wear-close-probe', '1'));
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForSelector('[data-wear-stop]', { timeout: 10000 });
  await page.waitForTimeout(500); // clear of Home's own screen-arrival window

  await page.click('[data-wear-stop]');
  await page.waitForTimeout(1200);
  const frames = await page.evaluate(() => window.__wearCloseFrames ?? []);
  await page.evaluate(() => sessionStorage.removeItem('wear-close-probe'));

  const lastTrueIdx = frames.reduce((acc, f, i) => (f.tile ? i : acc), -1);
  if (lastTrueIdx < 0) throw new Error(`run ${run + 1}: the wear tile never appeared`);
  const presentFrames = frames.slice(0, lastTrueIdx + 1).filter((f) => f.wrapperHeight !== null);

  // The bug: the tier wrapper going `position: fixed` (dissolveAt, meant only
  // for an actual grid tile caught in a fold swap) while the tile it holds is
  // still on screen. Pinned like that, the wrapper gives up no room in
  // normal flow, so whatever is below it snaps into place in a single frame
  // instead of following the wrapper's own height down.
  const pinnedWhilePresent = presentFrames.some((f) => f.wrapperPosition === 'fixed');

  // A real collapse settles the wrapper's height down across several
  // sampled frames rather than jumping straight from its resting height to
  // (near) zero between two consecutive samples.
  let worstStep = 0;
  for (let i = 1; i < presentFrames.length; i += 1) {
    const a = presentFrames[i - 1].wrapperHeight;
    const b = presentFrames[i].wrapperHeight;
    worstStep = Math.max(worstStep, Math.abs(a - b));
  }
  const restingHeight = Math.max(...presentFrames.map((f) => f.wrapperHeight), 0);
  const snapped = restingHeight > 0 && worstStep >= restingHeight * 0.5;
  const animated = !pinnedWhilePresent && !snapped;

  runs.push({ run, frames: frames.length, restingHeight, worstStep, pinnedWhilePresent, animated });
  console.log(
    `run ${run + 1}: ${frames.length} frames, wrapper height ${restingHeight}px -> 0, worst single-frame step ${worstStep}px` +
      (pinnedWhilePresent ? ' - wrapper went position:fixed while the tile was still present' : '') +
      (animated ? '' : ' - NO ANIMATION, cut in place')
  );
  await writeFile(`${outDir}/run-${run + 1}.frames.json`, JSON.stringify(frames));
}

await page.close();
await browser.close();
await app.close();

const failed = runs.filter((r) => !r.animated).length;
await writeFile(`${outDir}/report.json`, JSON.stringify({ runs, errors }, null, 2));
if (errors.length) console.log('page errors:', errors);
console.log(`\n${failed} of ${runs.length} run(s) with no animation; ${outDir}/report.json`);
if (failed || errors.length) process.exitCode = 1;

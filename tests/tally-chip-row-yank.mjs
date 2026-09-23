/* Tally's presentation chip row, cold load, one surface at a time (ux-carpet
   ticket 180). `PresentationChipRow` reads the vocabulary mirror's visible
   presentations and renders nothing while that list is empty - the exact gap
   ticket 152 closed on four other screens, in this shared component instead.
   On a cold navigation straight to /tally the mirror is still empty at first
   paint, so the row is absent, then pops in at full height once the mirror
   fills, pushing the charts down in one frame.

   Sampled from the document's first frame under a slowed CPU, the order a
   phone always sees and the desktop sweep only caught 5 of 6 runs in dark.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/tally-chip-row-yank.mjs [--runs 5] [--cpu 4] [--out <abs dir>]
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
const CPU = Number(flag('cpu', '4'));
const WINDOW_MS = 1800;
const outDir = resolve(flag('out', resolve(here, '../.claude/tally-chip-row')));
await mkdir(outDir, { recursive: true });

/* Installed before any of the app's own scripts, and armed only by the
   probe's own flag, so the persona setup loads are not sampled. Also stubs
   `navigator.storage.persist` for the same reason day-cold-load-yank.mjs
   does. */
const SAMPLER = `(() => {
  if (navigator.storage) {
    navigator.storage.persist = async () => true;
    navigator.storage.persisted = async () => true;
  }
  if (sessionStorage.getItem('chip-probe') !== '1') return;
  const frames = [];
  window.__chipFrames = frames;
  const t0 = performance.now();
  const tick = (now) => {
    const row = document.querySelector('[data-presentation-highlight-row]');
    const chips = document.querySelectorAll('[data-presentation-highlight]').length;
    const chipSkeleton = row ? row.querySelector('[data-skeleton]') : null;
    const chart = document.querySelector('[data-chart-card="tally-misgendered"]');
    frames.push({
      at: Math.round(now - t0),
      row: !!row,
      rowSkeleton: !!chipSkeleton,
      chips,
      chartSkeleton: !!document.querySelector('.screen > .skeleton-stack, .screen > div > .skeleton-stack'),
      chart: chart ? Math.round(chart.getBoundingClientRect().top) : null
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

await settlePage(page, base, '/', 'dark');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('the persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

const cdp = await page.context().newCDPSession(page);
const runs = [];
for (let run = 0; run < RUNS; run += 1) {
  await page.evaluate(() => sessionStorage.setItem('chip-probe', '1'));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(`${base}/tally`, { waitUntil: 'commit', timeout: 40000 });
  await page.waitForTimeout(WINDOW_MS + 400 * CPU);
  const frames = await page.evaluate(() => window.__chipFrames ?? []);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => sessionStorage.removeItem('chip-probe'));

  /* The chart painted before the row landed with chips: content that had
     to know the mirror pushed past content that did not. */
  const chartFirstAt = frames.findIndex((f) => f.chart !== null);
  const rowChippedAt = frames.findIndex((f) => f.row && f.chips > 0);
  const beforeChips = chartFirstAt >= 0 && (rowChippedAt < 0 || rowChippedAt > chartFirstAt);

  /* The chart's own top edge, biggest single-frame step once the row's own
     resize (its skeleton opening into its chip-height, or the reverse) has
     settled - a rAF sampler can catch that transition's own start a tick
     before the ResizeObserver behind it actually begins painting, which
     reads as a snap-then-climb-back that never painted (ticket 184's care
     mood card hit the same thing). Settled = 350ms past the later of the
     chart or the chips landing, past the transition's own ~240ms. */
  const firstChart = frames.find((f) => f.chart !== null)?.at ?? null;
  const firstChips = frames.find((f) => f.chips > 0)?.at ?? null;
  const settledFromMs = Math.max(firstChart ?? 0, firstChips ?? 0) + 350;
  let worstChartStep = 0;
  let worstChartAt = null;
  for (let i = 1; i < frames.length; i += 1) {
    if (frames[i].at < settledFromMs) continue;
    const a = frames[i - 1].chart;
    const b = frames[i].chart;
    if (a !== null && b !== null) {
      const step = Math.abs(b - a);
      if (step > worstChartStep) {
        worstChartStep = step;
        worstChartAt = frames[i].at;
      }
    }
  }

  runs.push({ run, frames: frames.length, firstChart, firstChips, beforeChips, worstChartStep, worstChartAt });
  console.log(
    `run ${run + 1}: ${frames.length} frames, chart at ${firstChart}ms, chips at ${firstChips}ms, ` +
      `worst settled chart step ${worstChartStep}px at ${worstChartAt}ms` +
      (beforeChips ? ', chips landed after the chart' : '')
  );
  await writeFile(`${outDir}/run-${run + 1}.frames.json`, JSON.stringify(frames));
}

await page.close();
await browser.close();
await app.close();

const chartless = runs.filter((r) => r.firstChart === null).length;
const failed = runs.filter((r) => r.beforeChips || r.worstChartStep >= 24).length;
await writeFile(`${outDir}/report.json`, JSON.stringify({ cpu: CPU, runs, errors }, null, 2));
if (errors.length) console.log('page errors:', errors);
if (chartless) console.log(`${chartless} run(s) never drew the chart - not a measurement`);
console.log(`\n${failed} of ${runs.length} run(s) with a finding; ${outDir}/report.json`);
if (failed || chartless || errors.length) process.exitCode = 1;

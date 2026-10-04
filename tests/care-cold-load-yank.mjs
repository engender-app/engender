/* Care's cold load, one surface at a time (ux-carpet ticket 184).

   Four yanks on a cold /care, measured here from the first frame of the
   document rather than from boot-ready, at full speed and under a slowed
   CPU so the journal's first answer reliably lands after the first paint -
   the order a phone always sees and the desktop sweep only caught one run
   in three.

   - Every rail caption (`.care-mark`) sits where its settle animation will
     put it before that animation starts. Its x against the rail may not
     step in one frame: the old keyframes centred the caption only once the
     staggered delay ran out, so each one jumped half its own width (26 to
     30px) on the frame it began to fade in.
   - Nothing below the care read's skeleton is painted before the rail is.
     The interval-mood card and the hosted "Changes you've noticed" row used
     to draw under the skeleton and then get pushed some 1500px down the
     screen when the rail landed above them.
   - What the care read answers with fades in. The rail's heading, a lane's
     name and the hosted row each start their first frame under half
     opacity; they used to arrive at 1 over the skeleton still fading out.
   - The navigation's pill never paints wider than the tab it lights. On
     its first placement it used to open as the whole bar and sweep across
     to the tab (0 to 295px over 250ms), because its inset transitions were
     live for the one placement that is not a slide.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/care-cold-load-yank.mjs [--runs 5] [--cpu 1,4] [--out <abs dir>]
   Runs every CPU rate given, --runs times each.
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
const CPUS = flag('cpu', '1,4').split(',').map(Number);
const WINDOW_MS = 1800;
const outDir = resolve(flag('out', resolve(here, '../.claude/care-cold-load')));
await mkdir(outDir, { recursive: true });

/* Installed before any of the app's own scripts, and armed only by the
   probe's own flag, so the persona setup loads are not sampled. */
const SAMPLER = `(() => {
  if (sessionStorage.getItem('care-probe') !== '1') return;
  const frames = [];
  window.__careFrames = frames;
  const t0 = performance.now();
  const tick = (now) => {
    const rail = document.querySelector('[data-care-rail]');
    const railLeft = rail ? rail.getBoundingClientRect().left : null;
    const mood = document.querySelector('[data-chart-card="interval-mood"]');
    const hosted = document.querySelector('[data-hub-host="care"]');
    /* Painted opacity is the product of every ancestor's. */
    const seen = (el) => {
      if (!el) return null;
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      return Math.round(o * 1000) / 1000;
    };
    const pill = document.querySelector('[data-nav-pill="bar"]');
    const tab = document.querySelector('.app-nav [aria-current="page"]');
    const pillBox = pill && pill.getBoundingClientRect();
    const marks = {};
    if (rail) {
      for (const el of rail.querySelectorAll('.care-mark[data-care-mark]')) {
        const lane = el.closest('[data-care-lane]')?.dataset.careLane ?? 'head';
        const box = el.getBoundingClientRect();
        marks[lane + ':' + el.dataset.careMark] = {
          x: Math.round((box.left - railLeft) * 10) / 10,
          o: Number(getComputedStyle(el.closest('.care-at-inner')).opacity)
        };
      }
    }
    frames.push({
      at: Math.round(now - t0),
      rail: !!rail,
      skeleton: !!document.querySelector('.screen .skeleton-block'),
      mood: mood ? Math.round(mood.getBoundingClientRect().top) : null,
      hosted: hosted ? Math.round(hosted.getBoundingClientRect().top) : null,
      seen: {
        heading: seen(document.querySelector('[data-chart-card="care-spine"] .kit-chart-head h2')),
        lane: seen(document.querySelector('.care-lane-name')),
        hosted: seen(hosted)
      },
      pill: pill && tab ? { w: pillBox.width, tab: tab.getBoundingClientRect().width, o: Number(getComputedStyle(pill).opacity) } : null,
      marks
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
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

const cdp = await page.context().newCDPSession(page);
const runs = [];
for (const CPU of CPUS) for (let run = 0; run < RUNS; run += 1) {
  await page.evaluate(() => sessionStorage.setItem('care-probe', '1'));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await page.goto(`${base}/care`, { waitUntil: 'commit', timeout: 40000 });
  await page.waitForTimeout(WINDOW_MS + 400 * CPU);
  const frames = await page.evaluate(() => window.__careFrames ?? []);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.evaluate(() => sessionStorage.removeItem('care-probe'));

  /* Below the gate before the rail: any frame that lays out the mood card
     or the hosted row while the rail is not there yet. */
  const early = frames.filter((f) => !f.rail && (f.mood !== null || f.hosted !== null));
  /* A caption's worst single-frame step along the rail. */
  const jumps = [];
  const keys = [...new Set(frames.flatMap((f) => Object.keys(f.marks)))];
  for (const key of keys) {
    let worst = { step: 0 };
    for (let i = 1; i < frames.length; i += 1) {
      const a = frames[i - 1].marks[key];
      const b = frames[i].marks[key];
      if (!a || !b) continue;
      const step = Math.abs(b.x - a.x);
      if (step > worst.step) worst = { step: Math.round(step * 10) / 10, at: frames[i].at, o: b.o };
    }
    jumps.push({ key, ...worst });
  }
  const firstRail = frames.find((f) => f.rail)?.at ?? null;
  const worstJump = Math.max(0, ...jumps.map((j) => j.step));
  /* Each arrival's opacity on the first frame it exists. */
  const arrivals = {};
  for (const key of ['heading', 'lane', 'hosted']) arrivals[key] = frames.find((f) => f.seen[key] !== null)?.seen[key] ?? null;
  const popped = Object.entries(arrivals).filter(([, o]) => o === null || o >= 0.5);
  /* The widest the pill was ever painted past its tab, at any opacity. */
  const pillOver = Math.max(0, ...frames.filter((f) => f.pill && f.pill.o > 0).map((f) => f.pill.w - f.pill.tab));
  const label = `${CPU}x run ${run + 1}`;
  runs.push({ cpu: CPU, run, frames: frames.length, firstRail, early: early.length, worstJump, arrivals, pillOver, jumps });
  console.log(
    `${label}: ${frames.length} frames, rail at ${firstRail}ms, ` +
      `${early.length} frame(s) with content below the gate before the rail, ` +
      `worst caption step ${worstJump}px over ${keys.length} captions, ` +
      `first-frame opacity ${JSON.stringify(arrivals)}, pill up to ${Math.round(pillOver)}px wider than its tab`
  );
  for (const [key, o] of popped) console.log(`  ${key} arrived at opacity ${o}`);
  for (const j of jumps.filter((j) => j.step >= 2))
    console.log(`  ${j.key}: ${j.step}px in one frame at ${j.at}ms (opacity ${j.o})`);
  await writeFile(`${outDir}/run-${CPU}x-${run + 1}.frames.json`, JSON.stringify(frames));
}

await page.close();
await browser.close();
await app.close();

const railless = runs.filter((r) => r.firstRail === null).length;
const failed = runs.filter(
  (r) => r.early > 0 || r.worstJump >= 2 || r.pillOver > 2 || Object.values(r.arrivals).some((o) => o === null || o >= 0.5)
).length;
await writeFile(`${outDir}/report.json`, JSON.stringify({ cpus: CPUS, runs, errors }, null, 2));
if (errors.length) console.log('page errors:', errors);
if (railless) console.log(`${railless} run(s) never drew the rail - not a measurement`);
console.log(`\n${failed} of ${runs.length} run(s) with a finding; ${outDir}/report.json`);
if (failed || railless || errors.length) process.exitCode = 1;

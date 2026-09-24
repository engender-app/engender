/* The More hub's search, when a query stops matching (phase 12 ux-carpet
   ticket 206).

   Typing past the last match used to leave the last card standing,
   still about 170px tall, for some 550ms and then remove it in one frame,
   while the "nothing found" notice, which had already arrived underneath
   it, jumped up 190px into its place. So: settle the hub on a query with
   matches, type one that has none, and sample every frame after the
   keystroke for:

   - a block in the results, or under them, that is gone the frame after it
     stood more than 2px tall (a vanish rather than a collapse);
   - a step of 2px or more outside a run of 4+ frames moving the same way
     (home-fold-reserve.mjs's travel rule, ticket 183);
   - the notice's first frame painting anything: it arrives by `collapse`,
     clipped from above (memory: a collapse arrival animates clip, not
     height), so its first frame must be clipped whole or transparent.

   The first two count only what was painted. A box clipped whole or
   transparent in both frames of a step can change place without anyone
   seeing it, and getBoundingClientRect ignores clip-path: the notice
   sometimes mounts a frame before the count line's disclose pushes the
   results down, and rode that 12.7px step while still clipped to nothing,
   which failed about one records flow in ten at 4x CPU (ticket 224).

   Against a demo build:
     VITE_DEMO=1 npm run build
     node tests/more-search-nothing-found.mjs [--runs 3] [--root <built tree>] */
import { preview } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '3'));
const STEP_PX = 2;
const TRAVEL_FRAMES = 4;
const JUMP_PX = 24;
const SAMPLE_MS = 1400;

const browser = await launchChromium();
const app = await preview({ root: resolve(flag('root', resolve(here, '..'))), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);
await page.addInitScript(() => {
  if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
});
await settlePage(page, base, '/', 'light');
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);

const SAMPLER = `new Promise((done) => {
  const out = [];
  const t0 = performance.now();
  const ids = new WeakMap();
  let n = 0;
  const id = (el) => {
    if (!ids.has(el)) ids.set(el, (n++) + ':' + el.tagName.toLowerCase() + '.' + [...el.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.'));
    return ids.get(el);
  };
  const tick = () => {
    const row = { at: performance.now() - t0, boxes: {} };
    const results = document.querySelector('[data-hub-results]');
    const els = results ? [...results.querySelectorAll(':scope > *, :scope > * > .kit-notice')] : [];
    let next = results?.nextElementSibling;
    while (next) { els.push(next); next = next.nextElementSibling; }
    for (const el of els) {
      const b = el.getBoundingClientRect();
      let o = 1;
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) o *= Number(getComputedStyle(p).opacity);
      const clip = getComputedStyle(el).clipPath;
      const inset = /inset\\(([\\d.]+)px/.exec(clip);
      row.boxes[id(el)] = { top: Math.round(b.top * 10) / 10, h: Math.round(b.height * 10) / 10, o: Math.round(o * 100) / 100, clipTop: inset ? Number(inset[1]) : 0, notice: el.matches('[data-notice="hub-search-none"]') };
    }
    out.push(row);
    if (row.at < ${SAMPLE_MS}) requestAnimationFrame(() => setTimeout(tick, 0));
    else done(out);
  };
  requestAnimationFrame(() => setTimeout(tick, 0));
})`;

/* Painted: some of the box shows. Clipped to within a pixel of its whole
   height from above, or at opacity 0.05 or less, it does not. */
const painted = (box) => box != null && box.o > 0.05 && box.clipTop < box.h - 1;

/* The samples the sampler took a frame apart. It samples in a timeout after
   each animation frame, and under 4x CPU throttling that timeout sometimes
   lands a frame late and the next one a few ms after it, so one step spans
   two frames and the next is a copy of the same layout (ticket 224: a 12.7px
   step 27ms after the sample before it, then an identical sample 4ms later,
   read as a one-frame move and as the notice's first frame already 19px
   open). A copy taken under half a frame after the sample before it is
   dropped, and a sample over a frame and a half after the one before it is
   marked, so the one-frame rules below do not judge a step they did not see
   whole. The jump and vanish rules still apply across it. */
function consecutive(samples) {
  const kept = samples.filter(
    (s, i) => i === 0 || s.at - samples[i - 1].at >= 8 || JSON.stringify(s.boxes) !== JSON.stringify(samples[i - 1].boxes)
  );
  const gaps = kept.slice(1).map((s, i) => s.at - kept[i].at).sort((a, b) => a - b);
  const frame = gaps[Math.floor(gaps.length / 2)] ?? 1000 / 60;
  return kept.map((s, i) => ({ ...s, afterGap: i > 0 && s.at - kept[i - 1].at > 1.5 * frame }));
}

function findings(raw) {
  const samples = consecutive(raw);
  const out = [];
  const keys = new Set(samples.flatMap((s) => Object.keys(s.boxes)));
  for (const key of keys) {
    const name = key.replace(/^\d+:/, '');
    const series = samples.map((s) => s.boxes[key] ?? null);
    const top = (i) => series[i]?.top ?? null;
    const step = (i) => (i > 0 && i < series.length && top(i) != null && top(i - 1) != null ? top(i) - top(i - 1) : 0);
    for (let i = 1; i < series.length; i++) {
      if (painted(series[i - 1]) && !series[i] && series[i - 1].h > 2)
        out.push(`${name} vanished at ${Math.round(samples[i].at)}ms, ${series[i - 1].h}px tall at opacity ${series[i - 1].o}`);
      const d = step(i);
      if (Math.abs(d) < STEP_PX || Math.min(top(i), top(i - 1)) > 844) continue;
      if (!painted(series[i - 1]) && !painted(series[i])) continue;
      let run = 1;
      for (let j = i - 1; j > 0 && Math.sign(step(j)) === Math.sign(d) && Math.abs(step(j)) >= 1; j--) run++;
      for (let j = i + 1; j < series.length && Math.sign(step(j)) === Math.sign(d) && Math.abs(step(j)) >= 1; j++) run++;
      if ((Math.abs(d) > JUMP_PX && run < TRAVEL_FRAMES) || (run === 1 && !samples[i].afterGap))
        out.push(`${name} ${Math.round(d)}px in one frame at ${Math.round(samples[i].at)}ms (${run}-frame move)`);
    }
    const first = series.findIndex(Boolean);
    const f = series[first];
    if (f?.notice && painted(f) && !samples[first].afterGap)
      out.push(`the notice's first frame painted ${Math.round(f.h - f.clipTop)}px at opacity ${f.o}`);
  }
  return out;
}

/* Two ways to run out: a query answered by records only ("dose" finds no
   area but three records), and one answered by areas only ("measu"). */
const CASES = [
  ['records to nothing', 'dose', 'dosexq'],
  ['areas to nothing', 'measu', 'measuxq']
];
let failed = false;
for (let run = 1; run <= RUNS; run++) {
  for (const [label, from, to] of CASES) {
    await settlePage(page, base, '/more', 'light');
    await page.waitForTimeout(800);
    await page.fill('[data-hub-search]', from);
    await page.waitForTimeout(1500);
    const had = await page.locator('[data-hub-results] [data-list-row]').count();
    const sampling = page.evaluate(SAMPLER);
    await page.fill('[data-hub-search]', to);
    const samples = await sampling;
    const f = findings(samples);
    if (!had) f.push(`"${from}" matched nothing to begin with`);
    const shown = samples.some((s) => Object.values(s.boxes).some((b) => b.notice));
    if (!shown) f.push('the notice never arrived');
    if (f.length) failed = true;
    console.log(`More search, ${label}, run ${run}: ${f.length ? 'FAIL' : 'ok'}`);
    for (const line of f) console.log(`    ${line}`);
  }
}

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);

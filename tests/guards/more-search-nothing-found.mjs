/* Type from a matching More search to zero matches and sample each frame.
   Painted blocks must collapse from above 2px before disappearing. A
   step of 2px or more needs at least four frames in the same direction.
   The empty notice starts clipped or transparent. Exclude fully hidden
   movement because getBoundingClientRect ignores clip-path.

   VITE_DEMO=1 npm run build
   node tests/guards/more-search-nothing-found.mjs [--runs 3] [--root <built tree>] */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage, previewBuild } from '../browser-harness.mjs';
import { FILL_EVERY_FEATURE_EXPRESSION, INIT_HIDE_DEMO_SCRIPT, RESET_PERSONA_EXPRESSION } from '../yank-sweep-core.mjs';

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
const app = await previewBuild(resolve(flag('root', resolve(here, '../..'))));
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

/* Under CPU throttling, the sampler's post-rAF timeout can land a
   frame late. Drop duplicate timing samples below half a frame apart
   and mark gaps above 1.5 frames. Skip one-frame judgments across
   gaps, keep jump and vanish checks, and report 2–24px steps after
   a gap for review. */
function consecutive(samples) {
  const kept = samples.filter(
    (s, i) => i === 0 || s.at - samples[i - 1].at >= 8 || JSON.stringify(s.boxes) !== JSON.stringify(samples[i - 1].boxes)
  );
  const gaps = kept.slice(1).map((s, i) => s.at - kept[i].at).sort((a, b) => a - b);
  const frame = gaps[Math.floor(gaps.length / 2)] ?? 1000 / 60;
  return kept.map((s, i) => ({ ...s, afterGap: i > 0 && s.at - kept[i - 1].at > 1.5 * frame }));
}

function findings(raw, unjudged = []) {
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
      else if (run === 1)
        unjudged.push(`${name} ${Math.round(d)}px at ${Math.round(samples[i].at)}ms, after a sampling gap`);
    }
    const first = series.findIndex(Boolean);
    const f = series[first];
    if (f?.notice && painted(f))
      (samples[first].afterGap ? unjudged : out).push(`the notice's first frame painted ${Math.round(f.h - f.clipTop)}px at opacity ${f.o}`);
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
    const unjudged = [];
    const f = findings(samples, unjudged);
    if (!had) f.push(`"${from}" matched nothing to begin with`);
    const shown = samples.some((s) => Object.values(s.boxes).some((b) => b.notice));
    if (!shown) f.push('the notice never arrived');
    if (f.length) failed = true;
    console.log(`More search, ${label}, run ${run}: ${f.length ? 'FAIL' : 'ok'}`);
    for (const line of f) console.log(`    ${line}`);
    for (const line of unjudged) console.log(`    not judged: ${line}`);
  }
}

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);

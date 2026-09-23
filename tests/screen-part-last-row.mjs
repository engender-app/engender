/* A row arriving or leaving last in a `.screen-part` moves nothing but
   itself (phase 12 ux-carpet ticket 195).

   `.screen > .screen-part > *` gives every row 20px under it, and until
   this ticket `:last-child` took that away from whichever row was last. So
   the margin a row carried depended on whether anything came after it: a
   row inserted as the new last child handed its predecessor 20px in the
   frame it was inserted, and a last row leaving took 20px from the one
   before it in the frame it was removed. Neither transition can animate a
   neighbour's margin, so the page stepped 20px on top of whatever the
   transition did (the voice screen's task line, ticket 166, 248 -> 268px).

   Two checks, both against a demo build:

   1. The mechanism, on the real stylesheet. A throwaway `.screen-part` is
      put into a live screen with a block after it, and a row is appended
      as its last child the way `disclose` has it on its first frame:
      height 0, margins 0. Nothing may move, and the row before it must
      keep its own margin; the same when that row is taken out again. The
      gap the new row brings is its own margin, which `disclose` opens with
      its height.
   2. An instance: the More hub's search. The records block arrives after
      the matches as the query's hits land, and goes when they do. Every
      row of the results and every block after them is sampled per frame;
      a step of 4px or more outside a run of 4+ same-direction frames is a
      finding (home-fold-reserve.mjs's rule, ticket 183).

     VITE_DEMO=1 npm run build
     node tests/screen-part-last-row.mjs [--runs 3] [--root <built tree>] */
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
const STEP_PX = 4;
const TRAVEL_FRAMES = 4;
const JUMP_PX = 24;

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

let failed = false;

/* 1. The mechanism. */
for (const route of ['/settings', '/care/labs', '/more']) {
  await settlePage(page, base, route, 'light');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const screen = document.querySelector('.screen');
    const part = document.createElement('div');
    part.className = 'screen-part';
    const first = document.createElement('div');
    first.style.height = '40px';
    part.append(first);
    const after = document.createElement('div');
    after.style.height = '10px';
    const header = screen.querySelector(':scope > .screen-header');
    (header ?? screen.firstElementChild).after(part, after);
    const top = () => after.getBoundingClientRect().top;
    const margin = () => getComputedStyle(first).marginBottom;
    const before = { top: top(), margin: margin() };
    const row = document.createElement('div');
    row.style.cssText = 'height: 0; margin: 0; overflow: hidden';
    part.append(row);
    const arrived = { top: top() - before.top, margin: margin() };
    row.remove();
    const left = { top: top() - before.top, margin: margin() };
    part.remove();
    after.remove();
    return { before, arrived, left };
  });
  const ok = r.arrived.top === 0 && r.left.top === 0 && r.arrived.margin === r.before.margin;
  if (!ok) failed = true;
  console.log(
    `mechanism ${route}: ${ok ? 'ok' : 'FAIL'} - an empty last row moved the block after it ${r.arrived.top}px arriving, ` +
      `${r.left.top}px leaving; the row before it ${r.before.margin} -> ${r.arrived.margin} -> ${r.left.margin}`
  );
}

/* 2. The More hub's search. */
const SAMPLER = (ms) => `new Promise((done) => {
  const out = [];
  const t0 = performance.now();
  const ids = new WeakMap();
  let n = 0;
  const id = (el) => { if (!ids.has(el)) ids.set(el, (n++) + ':' + el.tagName.toLowerCase() + '.' + [...el.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 2).join('.')); return ids.get(el); };
  const tick = () => {
    const row = { at: performance.now() - t0, boxes: {} };
    const results = document.querySelector('[data-hub-results]');
    const els = results ? [...results.children] : [];
    let next = results?.nextElementSibling;
    while (next) { els.push(next); next = next.nextElementSibling; }
    for (const el of els) {
      const b = el.getBoundingClientRect();
      if (b.height > 0) row.boxes[id(el)] = Math.round(b.top * 10) / 10;
    }
    out.push(row);
    if (row.at < ${ms}) requestAnimationFrame(() => setTimeout(tick, 0));
    else done(out);
  };
  requestAnimationFrame(() => setTimeout(tick, 0));
})`;

function findings(samples) {
  const keys = new Set(samples.flatMap((s) => Object.keys(s.boxes)));
  const out = [];
  for (const key of keys) {
    const series = samples.map((s) => s.boxes[key] ?? null);
    const step = (i) => (i > 0 && i < series.length && series[i] != null && series[i - 1] != null ? series[i] - series[i - 1] : 0);
    for (let i = 1; i < series.length; i++) {
      const d = step(i);
      if (Math.abs(d) < STEP_PX || Math.min(series[i], series[i - 1]) > 844) continue;
      let run = 1;
      for (let j = i - 1; j > 0 && Math.sign(step(j)) === Math.sign(d) && Math.abs(step(j)) >= 1; j--) run++;
      for (let j = i + 1; j < series.length && Math.sign(step(j)) === Math.sign(d) && Math.abs(step(j)) >= 1; j++) run++;
      if ((Math.abs(d) > JUMP_PX && run < TRAVEL_FRAMES) || run === 1)
        out.push(`${key.replace(/^\d+:/, '')} ${Math.round(d)}px in one frame at ${Math.round(samples[i].at)}ms (${run}-frame move)`);
    }
  }
  return out;
}

/* A query whose area matches draw at once and whose record hits land after
   the debounce, then one with no hits at all (the records block leaves and
   the "nothing found" notice arrives last). */
for (let run = 1; run <= RUNS; run++) {
  await settlePage(page, base, '/more', 'light');
  await page.waitForTimeout(800);
  for (const [label, query] of [
    ['hits arrive', 'dose'],
    ['hits leave', 'dosexq']
  ]) {
    const sampling = page.evaluate(SAMPLER(1600));
    await page.fill('[data-hub-search]', query);
    const f = findings(await sampling);
    if (f.length) failed = true;
    console.log(`More search, ${label}, run ${run}: ${f.length ? 'FAIL' : 'ok'}`);
    for (const line of f) console.log(`    ${line}`);
  }
}

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);

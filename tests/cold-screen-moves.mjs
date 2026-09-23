/* What moves on a screen's cold open after it has first painted (phase 12
   ux-carpet tickets 191 and 193).

   Two defects share this shape. A `ReadGate` whose content starts with a
   heading moved that content twice after it landed: once when the leaving
   skeleton came out of the DOM and the heading became `:first-child`
   (40px of top margin to 16), and once when `resize`'s `overflow: hidden`
   came off and the heading's margin could collapse through the wrapper
   again (191). And blocks gated on nothing arrived at full height inside
   the 240ms arrival window, pushing everything under them in one frame
   (193, the measurements screen's span and size-change blocks).

   So: cold-load each screen over the persona journal, sample every
   top-level block of the screen (the `.screen`'s children and each
   `.screen-part`'s) after every paint from the document's first frame, and
   report any block whose top steps in one frame. The rule is
   home-fold-reserve.mjs's (ticket 183): a step of 4px or more counts as
   travel only inside a run of 4+ consecutive frames moving the same way,
   and a step over 24px must be inside such a run. A block's first frame is
   an arrival, not a move; frames under a view transition paint snapshots
   and are skipped.

   `navigator.storage.persist` is stubbed to resolve true: headless Chromium
   never grants it, and the toast that says so is a false dropout.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/cold-screen-moves.mjs [--runs 3] [--theme light|dark] [--routes /a,/b] [--dump <dir>]
   From another built tree, start it with that tree as cwd (kit's preview
   reads process.cwd()) and pass `--root .`. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, settlePage } from './browser-harness.mjs';
import {
  DEMO_THEME_EXPRESSION,
  FILL_EVERY_FEATURE_EXPRESSION,
  INIT_HIDE_DEMO_SCRIPT,
  RESET_PERSONA_EXPRESSION
} from './yank-sweep-core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const RUNS = Number(flag('runs', '3'));
const THEME = flag('theme', 'light');
const DUMP = flag('dump', '');
/* The screens with a heading-led ReadGate (191) and the ones found with a
   late ungated block (193). */
const ROUTES = flag(
  'routes',
  '/transition/tryouts,/body/measurements,/care/labs,/care/regimen,/health/appointments,/health/surgery,/settings/eras,/transition/letters,/body/hair-removal,/media/documents'
).split(',');
const JUMP_PX = 24;
const STEP_PX = 4;
const TRAVEL_FRAMES = 4;
const SAMPLE_MS = 1600;
const VIEWPORT_H = 844;

const SAMPLER = `(() => {
  if (navigator.storage) navigator.storage.persist = () => Promise.resolve(true);
  const ids = new WeakMap();
  let next = 0;
  const name = (el) => {
    let id = ids.get(el);
    if (id == null) {
      const cls = [...el.classList].filter((c) => !c.startsWith('s-') && !c.startsWith('svelte-')).slice(0, 2).join('.');
      const data = [...el.attributes].map((a) => a.name).find((a) => a.startsWith('data-') && a !== 'data-kit-surface');
      id = (next++) + ':' + el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (data ? '[' + data + ']' : '');
      ids.set(el, id);
    }
    return id;
  };
  const out = [];
  window.__coldSamples = out;
  let vt = false;
  const start = document.startViewTransition?.bind(document);
  if (start)
    document.startViewTransition = (...a) => {
      const running = start(...a);
      running.ready.catch(() => {}).then(() => (vt = true));
      running.finished.catch(() => {}).then(() => (vt = false));
      return running;
    };
  const t0 = performance.now();
  const tick = () => {
    const at = performance.now() - t0;
    const row = { at, vt, boxes: {} };
    for (const el of document.querySelectorAll('.screen > *, .screen > .screen-part > *')) {
      if (el.hasAttribute('data-gate-skeleton') || el.hasAttribute('data-read-reserve-hold')) continue;
      const box = el.getBoundingClientRect();
      if (box.height === 0 || box.top > ${VIEWPORT_H}) continue;
      row.boxes[name(el)] = Math.round(box.top * 10) / 10;
    }
    out.push(row);
    if (at < ${SAMPLE_MS}) requestAnimationFrame(later);
  };
  /* After the frame's paint rather than inside its rAF: a rAF read lands
     before that frame's ResizeObserver callbacks (home-fold-reserve.mjs). */
  const later = () => setTimeout(tick, 0);
  requestAnimationFrame(later);
})()`;

function teleports(series, samples) {
  const out = [];
  const step = (i) =>
    i > 0 && i < series.length && series[i] != null && series[i - 1] != null && !samples[i].vt && !samples[i - 1].vt
      ? series[i] - series[i - 1]
      : 0;
  for (let i = 1; i < series.length; i++) {
    const d = step(i);
    if (Math.abs(d) < STEP_PX) continue;
    let run = 1;
    for (let j = i - 1; j > 0 && Math.sign(step(j)) === Math.sign(d) && Math.abs(step(j)) >= 1; j--) run++;
    for (let j = i + 1; j < series.length && Math.sign(step(j)) === Math.sign(d) && Math.abs(step(j)) >= 1; j++) run++;
    if ((Math.abs(d) > JUMP_PX && run < TRAVEL_FRAMES) || run === 1)
      out.push({ px: Math.round(d), at: Math.round(samples[i].at), run });
  }
  return out;
}

function analyse(samples) {
  const keys = new Set(samples.flatMap((s) => Object.keys(s.boxes)));
  const findings = [];
  for (const key of keys) {
    const series = samples.map((s) => s.boxes[key] ?? null);
    for (const t of teleports(series, samples))
      findings.push(`${key.replace(/^\d+:/, '')} ${t.px > 0 ? 'down' : 'up'} ${Math.abs(t.px)}px in one frame at ${t.at}ms (${t.run}-frame move)`);
  }
  return findings;
}

const browser = await launchChromium();
const app = await preview({ root: resolve(flag('root', resolve(here, '..'))), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: VIEWPORT_H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (err) => errors.push(String(err)));
await page.addInitScript(INIT_HIDE_DEMO_SCRIPT);

await settlePage(page, base, '/', THEME);
if (!(await page.evaluate(RESET_PERSONA_EXPRESSION))) throw new Error('persona reset never reached Home');
await page.evaluate(FILL_EVERY_FEATURE_EXPRESSION);
await page.waitForTimeout(1500);
await settlePage(page, base, '/', THEME);
await page.evaluate(DEMO_THEME_EXPRESSION(THEME));
await page.waitForTimeout(1500);
await page.addInitScript(SAMPLER);

let failed = false;
for (const route of ROUTES) {
  for (let run = 1; run <= RUNS; run++) {
    /* Visit once first so anything remembered from a visit (a reserve's
       height) is what a returning person has, then load cold. */
    await page.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 40000 });
    await page.waitForTimeout(800);
    await page.goto(`${base}${route}`, { waitUntil: 'commit' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 40000 });
    await page.waitForTimeout(SAMPLE_MS + 300);
    const samples = await page.evaluate(() => window.__coldSamples);
    if (DUMP) {
      await mkdir(DUMP, { recursive: true });
      await writeFile(`${DUMP}/${THEME}${route.replaceAll('/', '_')}-${run}.json`, JSON.stringify(samples));
    }
    const findings = analyse(samples);
    if (findings.length) failed = true;
    console.log(`[${THEME}] ${route} run ${run}: ${findings.length ? 'FAIL' : 'ok'} - ${samples.length} frames`);
    for (const f of findings) console.log(`    ${f}`);
  }
}
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);

/* Home's cold open, one surface (phase 12 ux-carpet ticket 183).

   On a cold load the today tier, the agenda, two notices and the rest of
   the tiles all answered ~50ms after the screen painted without them, and
   every block under them teleported in one frame. The fix reserves their
   room (ReadReserve.svelte, homeReserve.ts) and crossfades them in. This
   is the scoped check the hydration sweep is too slow and too coarse for:
   it cold-loads Home over the persona journal several times, samples every
   animation frame from the document's first, and asks of the blocks that
   sit *under* the reserves - the log strip, the backup notice, the pinned
   rows - whether any of them ever moves further than `JUMP_PX` between two
   frames.

   Three cases:
   - `warm`: the reserve remembers the height from the settle before it,
     which is every visit after the first. Nothing under it may move at all.
   - `wrong`: the remembered heights are halved, the guess a changed journal
     gives. The difference must travel (resize), never jump.
   - `none`: no remembered height, the first visit. Same rule as `wrong`.

   And the reserve itself: the placeholder must fade out and the content
   fade in, never at opacity 1 on the frame it appears or leaves.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/home-fold-reserve.mjs [--runs 3] [--theme light|dark] [--root <built tree>] */
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
/* `--dump <dir>` writes every run's frames as JSON, for reading a finding. */
const DUMP = flag('dump', '');
/* The hydration sweep's own teleport floor is 24px; a resize at --dur-med
   covering a few hundred pixels moves well under that per frame at its
   steepest, and a one-frame arrival moves hundreds. */
const JUMP_PX = 24;
const SAMPLE_MS = 1500;

/* Installed before any of the app's own scripts, so the first frame
   sampled is the first frame there is anything to sample. */
const SAMPLER = `(() => {
  const marks = {
    header: '[data-home-header]',
    field: '[data-home-field]',
    hello: '[data-home-hello]',
    count: '[data-home-count]',
    log: '[data-home-log]',
    backup: '[data-backup-notice]',
    pinned: '[data-home-pinned]',
    above: '[data-home-reserve="above"]',
    below: '[data-home-reserve="below"]',
    list: '[data-home-reserve="pinned"]'
  };
  const out = [];
  window.__foldSamples = out;
  /* Frames under a view transition paint its snapshots, not the live
     layout, so a move there is not seen; the sweep's own rule, from
     \`ready\` to \`finished\` (yank-sweep-core.mjs). */
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
    const row = { at, vt, boot: document.querySelector('[data-app-root]')?.getAttribute('data-boot') ?? null };
    for (const [name, sel] of Object.entries(marks)) {
      const el = document.querySelector(sel);
      if (el) {
        const box = el.getBoundingClientRect();
        row[name] = { top: box.top, h: box.height };
      }
    }
    for (const kind of ['hold', 'body']) {
      row[kind] = [...document.querySelectorAll('[data-read-reserve-' + kind + ']')].map((el) =>
        Number(getComputedStyle(el).opacity)
      );
    }
    out.push(row);
    if (at < ${SAMPLE_MS}) requestAnimationFrame(later);
  };
  /* Read after the frame rather than inside its rAF: a rAF read lands
     before the frame's ResizeObserver callbacks, which is where \`resize\`
     starts its travel, so it sees the new height a frame before anything
     paints it (project memory: the pixels are the authority, the rAF
     samples are not). A task queued from rAF runs after that frame's paint. */
  const later = () => setTimeout(tick, 0);
  requestAnimationFrame(later);
})()`;

const browser = await launchChromium();
const app = await preview({ root: resolve(flag('root', resolve(here, '..'))), preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
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

async function coldLoad(prepare) {
  /* Settle on Home first so the reserve remembers this journal's heights,
     then bend them as the case asks, then load cold. */
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await page.waitForTimeout(1200);
  await page.evaluate(prepare);
  await page.goto(`${base}/`, { waitUntil: 'commit' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 40000 });
  await page.waitForTimeout(SAMPLE_MS + 300);
  return page.evaluate(() => window.__foldSamples);
}

const CASES = {
  warm: '(() => {})()',
  wrong: `(() => {
    for (const slot of ['above', 'below', 'pinned']) {
      const key = 'engender-home-reserve-' + slot;
      const px = Number(localStorage.getItem(key) || 0);
      localStorage.setItem(key, String(Math.round(px / 2)));
    }
  })()`,
  none: `(() => {
    for (const slot of ['above', 'below', 'pinned']) localStorage.removeItem('engender-home-reserve-' + slot);
  })()`
};

/* A teleport in the sweep's own sense (yank-sweep-core.mjs): a move over
   the floor in one frame with no movement in the frames either side. A
   travel on the tier's ease-out takes its biggest step first - a few
   hundred pixels at --dur-med is 100px or more on the first frame - and
   keeps moving after it, which is the difference between arriving and
   appearing. */
function teleports(series, label, samples) {
  const out = [];
  const step = (i) => (series[i] != null && series[i - 1] != null ? series[i] - series[i - 1] : 0);
  for (let i = 1; i < series.length; i++) {
    if (series[i] == null || series[i - 1] == null || samples[i].vt || samples[i - 1].vt) continue;
    const d = step(i);
    if (Math.abs(d) <= JUMP_PX) continue;
    const before = i > 1 ? step(i - 1) : 0;
    const after = i + 1 < series.length ? step(i + 1) : 0;
    if (Math.abs(before) < 1 && Math.abs(after) < 1)
      out.push(`${label} ${Math.round(Math.abs(d))}px in one frame at ${Math.round(samples[i].at)}ms, still either side`);
  }
  return out;
}

function analyse(samples) {
  const findings = [];
  let worst = 0;
  const series = (name, key) => samples.map((s) => (s[name] ? s[name][key] : null));
  for (const name of ['header', 'log', 'backup', 'pinned']) {
    const tops = series(name, 'top');
    findings.push(...teleports(tops, `${name} moved`, samples));
    for (let i = 1; i < tops.length; i++) {
      if (tops[i] != null && tops[i - 1] != null && !samples[i].vt && !samples[i - 1].vt)
        worst = Math.max(worst, Math.abs(tops[i] - tops[i - 1]));
      if (tops[i] == null && tops[i - 1] != null && !samples[i].vt)
        findings.push(`${name} left the page at ${Math.round(samples[i].at)}ms`);
    }
  }
  /* And the reserves' own heights, and the header's: a height that jumps
     moves its bottom edge, and everything under it, in one frame. */
  for (const name of ['header', 'above', 'below', 'list']) {
    findings.push(...teleports(series(name, 'h'), `${name} height changed`, samples));
  }
  /* The placeholder's and the content's opacity on the frame each is first
     and last seen: a hold that is gone the frame after it read 1, or a body
     that first reads 1, is a cut rather than a crossfade. */
  let holdLast = null;
  let bodyFirst = null;
  for (let i = 0; i < samples.length; i++) {
    const { hold, body } = samples[i];
    if (hold.length) holdLast = { i, o: Math.min(...hold) };
    if (body.length && bodyFirst == null) bodyFirst = { i, o: Math.max(...body) };
  }
  if (holdLast && holdLast.i < samples.length - 1 && holdLast.o > 0.9)
    findings.push(`placeholder left at opacity ${holdLast.o.toFixed(2)}`);
  if (bodyFirst && bodyFirst.o > 0.9) findings.push(`content arrived at opacity ${bodyFirst.o.toFixed(2)}`);
  const first = samples.find((s) => s.pinned);
  const last = samples.at(-1);
  return {
    findings,
    worst: Math.round(worst),
    frames: samples.length,
    pinnedFirst: first ? Math.round(first.pinned.top) : null,
    pinnedLast: last?.pinned ? Math.round(last.pinned.top) : null,
    reserved: samples.some((s) => s.hold.length > 0),
    revealedAt: samples.find((s) => s.body.length)?.at
  };
}

let failed = false;
for (const [name, prepare] of Object.entries(CASES)) {
  for (let run = 1; run <= RUNS; run++) {
    const samples = await coldLoad(prepare);
    if (DUMP) {
      await mkdir(DUMP, { recursive: true });
      await writeFile(`${DUMP}/${THEME}-${name}-${run}.json`, JSON.stringify(samples));
    }
    const r = analyse(samples);
    const verdict = r.findings.length ? 'FAIL' : 'ok';
    if (r.findings.length) failed = true;
    console.log(
      `[${THEME}] ${name} run ${run}: ${verdict} - ${r.frames} frames, worst frame-to-frame move ${r.worst}px, ` +
        `pinned top ${r.pinnedFirst} -> ${r.pinnedLast}, reserve ${r.reserved ? 'held' : 'absent'}` +
        (r.revealedAt != null ? `, revealed at ${Math.round(r.revealedAt)}ms` : '')
    );
    for (const f of r.findings) console.log(`    ${f}`);
  }
}
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);

await browser.close();
await app.close();
process.exit(failed ? 1 : 0);

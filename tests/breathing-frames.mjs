/* The breathing exercise, frame by frame (phase 12 breathing ticket 01).

   A yank, in Alicja's words, is "things teleporting/disappearing in 1
   frame". This samples every drawn node in the exercise's figure on every
   animation frame - its box, its opacity, its fill opacity and its dash
   offset - across a start from rest, more than a whole cycle (so the lap
   wraps), a pause, a resume and a second pause, and fails on any of:

   - a box that moves or resizes more than JUMP_PX between two frames (the
     water's fastest is about 1.2px a frame, the dot's about 0.8);
   - the lap's dot going backwards round the track;
   - a dash offset that moves more than JUMP_DASH between two frames;
   - an opacity that changes more than JUMP_ALPHA between two frames;
   - a node that arrives already visible, or leaves while still visible;
   - anything moving while the exercise is paused;
   - reduced motion being switched mid-breath changing anything (the
     component reads it once per visit);
   - the app going to the background and coming back: nothing may move
     while it is hidden, and the breath must carry on by itself after;
   - the Polish hold word, the longest, not clearing the vessel by 16px
     either side at 390 and 320.

   Then the same under reduced motion, where nothing but the lap's dot may
   move at all. The dot is exempt there: it steps once a second, sixteen
   steps a lap, which is the substitute decided in grilling because it
   carries the time.

   Generic on purpose, so it can be run against the component this ticket
   replaced and seen to fail there: the old ring's dash offset dropped from
   full to empty in one frame at every phase boundary.

   `node tests/breathing-frames.mjs` starts its own demo dev server;
   `node tests/breathing-frames.mjs <base-url>` uses one already running. */
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

let server = null;
let BASE = process.argv[2];
if (!BASE) {
  process.env.VITE_DEMO = '1';
  server = await createServer({ cacheDir: '.svelte-kit/breathing-frames-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
  await server.listen();
  BASE = server.resolvedUrls.local[0].replace(/\/$/, '');
}
const PATH = '/doubt';
const JUMP_PX = 3;
const JUMP_DASH = 40;
const JUMP_ALPHA = 0.3;
const ROOT = '[data-breathing-exercise]';
const CENTRE_TOLERANCE = 0.02;

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`FAIL ${msg}`);
};
const pass = (msg) => console.log(`PASS ${msg}`);

async function record(page, steps) {
  await page.evaluate((root) => {
    const ids = new WeakMap();
    let next = 0;
    const frames = [];
    window.__breathFrames = frames;
    window.__breathMarks = [];
    const sample = (now) => {
      const nodes = document.querySelectorAll(`${root} svg, ${root} svg *:not(defs, defs *, clipPath, clipPath *, g)`);
      const frame = { t: now, nodes: {} };
      for (const n of nodes) {
        if (!ids.has(n)) ids.set(n, `${n.tagName}.${n.getAttribute('class') ?? ''}#${next++}`);
        const r = n.getBoundingClientRect();
        const cs = getComputedStyle(n);
        let alpha = 1;
        for (let e = n; e && e !== document.documentElement; e = e.parentElement) alpha *= Number(getComputedStyle(e).opacity);
        frame.nodes[ids.get(n)] = {
          x: r.x, y: r.y, w: r.width, h: r.height, alpha,
          fillAlpha: Number(cs.fillOpacity),
          dash: parseFloat(cs.strokeDashoffset) || 0
        };
      }
      frames.push(frame);
      window.__breathRaf = requestAnimationFrame(sample);
    };
    window.__breathRaf = requestAnimationFrame(sample);
  }, ROOT);
  for (const [label, wait, action] of steps) {
    if (action) await action();
    await page.evaluate((l) => window.__breathMarks.push({ label: l, t: performance.now() }), label);
    await page.waitForTimeout(wait);
  }
  return page.evaluate(() => {
    cancelAnimationFrame(window.__breathRaf);
    return { frames: window.__breathFrames, marks: window.__breathMarks };
  });
}

function check(name, { frames, marks }, { reduced }) {
  const lastMark = (t) => {
    let last = null;
    for (const m of marks) if (m.t <= t) last = m;
    return last;
  };
  const problems = [];
  const svg = Object.entries(frames[0].nodes).find(([id]) => id.startsWith('svg.breathing-figure'))[1];
  const centre = { x: svg.x + svg.w / 2, y: svg.y + svg.h / 2 };
  /* Back from the background, the breath carries on by itself. */
  const shown = marks.find((m) => m.label === 'show');
  if (shown) {
    const lapAt = (t) => {
      const f = frames.find((fr) => fr.t >= t);
      return f && Object.entries(f.nodes).find(([id]) => id.includes('lap'))[1];
    };
    const p = lapAt(shown.t + 100);
    const q = lapAt(shown.t + 900);
    if (!p || !q || Math.hypot(q.x - p.x, q.y - p.y) < 5) problems.push('the breath did not carry on after coming back from the background');
  }
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const mark = lastMark(a.t);
    /* From the second frame after the press: the press paints the frozen
       pose once, and the frame after it is the first that shows it. */
    const frozen = mark?.label.startsWith('pause') && lastMark(b.t) === mark && a.t - mark.t > 34;
    for (const [id, nb] of Object.entries(b.nodes)) {
      const na = a.nodes[id];
      if (!na) {
        if (i > 1 && nb.alpha > JUMP_ALPHA) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} arrives at opacity ${nb.alpha.toFixed(2)}`);
        continue;
      }
      const moved = Math.max(Math.abs(nb.x - na.x), Math.abs(nb.y - na.y), Math.abs(nb.w - na.w), Math.abs(nb.h - na.h));
      const isLap = id.includes('lap');
      if (isLap) {
        const turn = (n) => Math.atan2(n.y + n.h / 2 - centre.y, n.x + n.w / 2 - centre.x);
        let d = turn(nb) - turn(na);
        if (d < -Math.PI) d += 2 * Math.PI;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -CENTRE_TOLERANCE) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): the lap goes back ${((-d * 180) / Math.PI).toFixed(1)} degrees`);
      }
      if (reduced && !isLap && moved > 0.5) problems.push(`frame ${i}: ${id} moves ${moved.toFixed(1)}px under reduced motion`);
      else if (!(reduced && isLap) && moved > JUMP_PX) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} jumps ${moved.toFixed(1)}px`);
      if (Math.abs(nb.dash - na.dash) > JUMP_DASH) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} dash offset ${na.dash.toFixed(0)} -> ${nb.dash.toFixed(0)}`);
      if (Math.abs(nb.alpha - na.alpha) > JUMP_ALPHA) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} opacity ${na.alpha.toFixed(2)} -> ${nb.alpha.toFixed(2)}`);
      if (Math.abs(nb.fillAlpha - na.fillAlpha) > JUMP_ALPHA) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} fill opacity ${na.fillAlpha.toFixed(2)} -> ${nb.fillAlpha.toFixed(2)}`);
      if (frozen && (moved > 0.01 || nb.fillAlpha !== na.fillAlpha)) problems.push(`frame ${i}: ${id} moves while paused`);
    }
    for (const [id, na] of Object.entries(a.nodes)) {
      if (!b.nodes[id] && na.alpha > JUMP_ALPHA) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} leaves at opacity ${na.alpha.toFixed(2)}`);
    }
  }
  const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t);
  const label = `${name}: ${frames.length} frames, longest gap ${Math.max(...gaps).toFixed(0)}ms`;
  if (problems.length) {
    fail(`${label}, ${problems.length} problems`);
    for (const p of problems.slice(0, 20)) console.log(`  ${p}`);
  } else pass(label);
}

const browser = await launchChromium();
try {
  for (const reduced of [false, true]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 1000 },
      reducedMotion: reduced ? 'reduce' : 'no-preference'
    });
    const page = await context.newPage();
    /* The storage-persistence toast is not this screen's, and it lands
       over the figure on a fresh demo origin. */
    await page.addInitScript(() => {
      if (navigator.storage) {
        navigator.storage.persist = async () => true;
        navigator.storage.persisted = async () => true;
      }
    });
    await page.goto(BASE + PATH);
    await page.waitForSelector(`${ROOT} svg`, { timeout: 60000 });
    /* On a dev server with nothing optimised yet, Vite finds more
       dependencies as the page loads and reloads it once they are bundled,
       which lands in the middle of a recording and wipes the sampler. A
       second load, after the network has gone quiet, is the stable one. */
    await page.waitForLoadState('networkidle');
    await page.reload();
    await page.waitForSelector(`${ROOT} svg`, { timeout: 60000 });
    await page.waitForTimeout(1000);
    /* Clicked from inside the page rather than through Playwright's input
       pipeline. A synthetic click from a task can land after a frame has
       begun, so the first rAF callback carries a timestamp from before the
       start - the case that once flashed "Hold" over the first inhale. It
       only sometimes lands that way, so this probe cannot be relied on to
       catch that one: breathClock.test.ts pins it. */
    const toggle = () => page.evaluate((root) => document.querySelector(`${root} [data-breathing-toggle]`).click(), ROOT);
    /* The opposite of this run's setting, flipped mid-breath and back,
       the way +layout.svelte follows the OS setting live. */
    const flip = (to) => () => page.evaluate((v) => (document.documentElement.dataset.a11yMotion = v), to);
    /* Hidden and back as the page sees it. Bringing another tab to the
       front in headless Chromium only throttles frames to one a second and
       never fires visibilitychange, so the document is told directly. */
    const visibility = (hidden) => () =>
      page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
    const run = await record(page, [
      ['rest', 600],
      ['start', 2700, toggle],
      ['flip', 1500, flip(reduced ? 'none' : 'reduce')],
      ['flip-back', 1500, flip(reduced ? 'reduce' : 'none')],
      ['pause-hidden', 2500, visibility(true)],
      ['show', 10000, visibility(false)],
      ['pause', 1500, toggle],
      ['resume', 2300, toggle],
      ['pause-2', 1200, toggle]
    ]);
    check(reduced ? 'reduced motion' : 'motion', run, { reduced });
    await context.close();
  }
  /* The longest word there is, the Polish hold, inside the vessel with
     room either side, at the widest and the narrowest column. */
  for (const width of [390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.goto(BASE + PATH);
    await page.waitForSelector(`${ROOT} svg`, { timeout: 60000 });
    await page.evaluate(async () => {
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      setLocale('pl', { reload: false });
    });
    await page.waitForTimeout(500);
    await page.evaluate((root) => document.querySelector(`${root} [data-breathing-toggle]`).click(), ROOT);
    await page.waitForTimeout(4900);
    const fit = await page.evaluate((root) => {
      const vessel = document.querySelector(`${root} .breathing-vessel`).getBoundingClientRect();
      const words = [...document.querySelectorAll(`${root} .breathing-word`)].map((t) => ({ text: t.textContent, ...t.getBoundingClientRect().toJSON() }));
      return { vessel: vessel.toJSON(), words };
    }, ROOT);
    const word = fit.words.find((w) => w.text.includes('Wstrzymaj'));
    const margin = word && Math.min(word.left - fit.vessel.left, fit.vessel.right - word.right);
    const label = `pl hold word at ${width}px: ${word ? `${word.width.toFixed(0)}px in a ${fit.vessel.width.toFixed(0)}px vessel, ${margin.toFixed(0)}px clear each side` : 'not found'}`;
    if (!word || margin < 16) fail(label);
    else pass(label);
    await page.close();
  }
} finally {
  await browser.close();
  await server?.close();
}
console.log(failures ? `${failures} failing` : 'all clean');
process.exit(failures ? 1 : 0);

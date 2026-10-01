/* The breathing exercise, frame by frame (phase 12 breathing ticket 01).

   A yank, in Alicja's words, is "things teleporting/disappearing in 1
   frame". This samples every drawn node in the exercise's figure on every
   animation frame - its box, its opacity, its fill opacity and its dash
   offset - across a start from rest, more than a whole cycle (so the lap
   wraps), a pause, a resume and a second pause, and fails on any of:

   - a box that moves or resizes more than JUMP_PX between two frames;
   - a dash offset that moves more than JUMP_DASH between two frames;
   - an opacity that changes more than JUMP_ALPHA between two frames;
   - a node that arrives already visible, or leaves while still visible;
   - anything moving while the exercise is paused.

   Then the same under reduced motion, where nothing but the lap's dot may
   move at all. The dot is exempt there: it steps once a second, sixteen
   steps a lap, which is the substitute decided in grilling because it
   carries the time.

   Generic on purpose, so it can be run against the component this ticket
   replaced and seen to fail there: the old ring's dash offset dropped from
   full to empty in one frame at every phase boundary.

   Needs a running server: `node tests/breathing-frames.mjs <base-url>`,
   against `VITE_DEMO=1 npx vite dev` or a demo build's preview. */
import { launchChromium } from './browser-harness.mjs';

const BASE = process.argv[2] ?? 'http://localhost:5291';
const PATH = process.argv[3] ?? '/doubt';
const JUMP_PX = 8;
const JUMP_DASH = 40;
const JUMP_ALPHA = 0.3;
const ROOT = '[data-breathing-exercise]';

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
  const pausedAt = (t) => {
    let state = 'rest';
    for (const m of marks) if (m.t <= t) state = m.label;
    return state.startsWith('pause');
  };
  const problems = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const frozen = pausedAt(a.t) && pausedAt(b.t) && b.t - marks.find((m) => m.t <= a.t && m.label.startsWith('pause')).t > 500;
    for (const [id, nb] of Object.entries(b.nodes)) {
      const na = a.nodes[id];
      if (!na) {
        if (i > 1 && nb.alpha > JUMP_ALPHA) problems.push(`frame ${i} (${b.t.toFixed(0)}ms): ${id} arrives at opacity ${nb.alpha.toFixed(2)}`);
        continue;
      }
      const moved = Math.max(Math.abs(nb.x - na.x), Math.abs(nb.y - na.y), Math.abs(nb.w - na.w), Math.abs(nb.h - na.h));
      const isLap = id.includes('lap');
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
    const page = await browser.newPage({
      viewport: { width: 390, height: 1000 },
      reducedMotion: reduced ? 'reduce' : 'no-preference'
    });
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
    await page.waitForTimeout(1000);
    const toggle = () => page.click(`${ROOT} [data-breathing-toggle]`);
    const run = await record(page, [
      ['rest', 600],
      ['start', 17600, toggle],
      ['pause', 1500, toggle],
      ['resume', 2300, toggle],
      ['pause-2', 1200, toggle]
    ]);
    check(reduced ? 'reduced motion' : 'motion', run, { reduced });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `${failures} failing` : 'all clean');
process.exit(failures ? 1 : 0);

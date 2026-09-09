/* The yank sweep (redesign ticket 20): every navigation and state change
   sampled per frame, looking for the two things Alicja calls a yank -
   something teleporting from one place to another in a single frame, and
   something disappearing in a single frame.

   Why a detector and not twenty flipbooks. Every round of notes on this
   phase's motion has come back as a frame pair - "look what happens between
   frames 5 and 6", "frames 9 and 10 in the first anim, 16 and 17 - second" -
   and every pair named a real single-frame defect: a card cut instead of
   faded, a line closing in one frame, an element in neither place for two
   frames. Those are found by comparing consecutive frames, which is
   arithmetic, so the arithmetic is written down here instead of being done
   by eye over hundreds of images. `tests/blind-motion-gallery.mjs` reads one
   gesture's own pseudo elements in depth; this reads every gesture shallowly
   and says which ones are worth that depth.

   What it samples, and why it is two instruments read at once. Across a
   navigation the live DOM is not what is on screen: the browser paints the
   captured pseudo elements, and `$lib/motion/outgoingScreen` removes the
   outgoing page on purpose before the new side is captured. Sampling the
   tree there reports the whole outgoing screen and all 107 of its
   descendants as vanishing on one frame, which is true of the DOM and says
   nothing about what a person saw. So a navigation is read off the
   transition's own pseudo elements - the translation, the opacity and the
   clip the browser is painting at that instant - the way
   `tests/blind-motion-gallery.mjs` reads one gesture in depth. A state
   change inside a settled screen runs no view transition, so there the
   tree *is* what is painted, and every element in the app frame is read:
   its box, its opacity, and whether it is there at all.

   Which of the two applies is not declared per scene, because a scene does
   not know: picking a mood on Today and choosing a span on Look back both
   navigate, and hand-labelling them as state changes reported the whole
   outgoing screen as 328 and 89 vanishing marks. Both instruments run in
   the same rAF loop and the run decides.

   What decides is `document.startViewTransition`, wrapped for the length of
   the sample. Asking the pseudo elements instead does not work:
   `getComputedStyle(root, '::view-transition-new(screen)')` answers
   `translate: 0px` at `opacity: 1` whether or not a transition is running,
   so "a pseudo answered" is true on every frame. Reading that as the window
   put the frames either side of the transition inside it, and the step from
   the identity default into the animation's first keyframe - 0 to 77px at
   opacity 1 to 0 - then read as a teleport and a vanish on every
   navigation. It is neither: nothing was painted from those frames. Only
   the frames the browser says it was transitioning on are the run.

   What counts as a yank.
     teleport     one frame's movement is both over TELEPORT_PX and over
                  TELEPORT_RATIO times the median frame's movement in the
                  same run - a spike in a run that is otherwise smooth
     vanish       opacity goes from at or above VISIBLE to under GONE in one
                  frame, or the element leaves the tree from full opacity,
                  with no frame in between
     limbo        a mark is absent for two or more consecutive frames in the
                  middle of a gesture and back afterwards: in neither place

   What is not a yank, and is filtered rather than reported. A cut is the
   documented substitute under `prefers-reduced-motion` (ADR-0078: substitute,
   never delete), so the reduced-motion pass is a control rather than a
   subject. The outgoing screen is removed on purpose before the new side is
   captured (`$lib/motion/outgoingScreen`), so the screen element itself is
   exempt. And a mark whose whole run is one frame long was never animating.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/yank-sweep.mjs
   `--scenes a,b` narrows the run; `--out <dir>` names where the report and
   the frames of any yank land. */
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const root = resolve(flag('root', resolve(here, '..')));
const outDir = resolve(flag('out', resolve(here, '../.claude/yank-sweep')));
const only = flag('scenes', '')
  .split(',')
  .filter(Boolean);

/** A jump under this many pixels is not a teleport however sharp it is: at
    390px wide, a mark moving 12px in a frame is still inside its own glyph. */
const TELEPORT_PX = 14;
/** And it is only a yank if the frames either side of it are still by
    comparison. Against the whole run's median this test is useless: a mark
    is at rest for most of a scene, so the median is 0 and every frame that
    moves at all trips a ratio. What separates a teleport from a fast slide
    is what its neighbours are doing - a slide arrives at speed and leaves at
    speed, a teleport has stillness on both sides of it. */
const TELEPORT_RATIO = 4;
/** Opacity at or above this is on screen; under GONE it is not there. */
const VISIBLE = 0.5;
const GONE = 0.03;
/** How long to follow a gesture. The door change is 380ms and the slowest
    stagger runs a few frames past it; what is left is the stillness that
    says it landed rather than stopped. */
const SCENE_MS = 760;

/* Each scene is a rest, a gesture, and what the gesture is supposed to be.
   The four door changes, then the state changes ADR-0078 flipped the default
   for: a sheet, a fold, a notice, a row leaving, a segment, a save. */
/** The names the app hands to a view transition: the blind, the page under
    it, the bar, then one per mark printed on each side of the field and one
    per ring of the sun on each side. Read from the pseudo elements, so a
    name that is not participating on a frame simply answers nothing. */
const VT_NAMES = [
  'blind',
  'screen',
  'nav',
  ...Array.from({ length: 8 }, (_, i) => `fp-a-${i}`),
  ...Array.from({ length: 8 }, (_, i) => `fp-b-${i}`),
  ...Array.from({ length: 8 }, (_, i) => `sun-a-${i}`),
  ...Array.from({ length: 8 }, (_, i) => `sun-b-${i}`)
];

const SCENES = [
  { name: 'door-today-journal', at: '/', act: '[data-nav-item="calendar"]', nav: true, is: 'the blind pulled up to Journal' },
  { name: 'door-journal-lookback', at: '/calendar', act: '[data-nav-item="stats"]', nav: true, is: 'the blind between two doors' },
  { name: 'door-lookback-transition', at: '/stats', act: '[data-nav-item="settings"]', nav: true, is: 'the blind down to Transition' },
  { name: 'door-transition-today', at: '/more', act: '[data-nav-item="home"]', nav: true, is: 'the blind back to the tallest field' },
  { name: 'deep-settings-tags', at: '/settings', act: 'a[href="/settings/tags"]', nav: true, is: 'a door into a deep screen' },
  { name: 'deep-back', at: '/settings/tags', act: 'back', nav: true, is: 'a deep screen back to its door' },
  { name: 'sheet-quick-add', at: '/', act: '[data-rail-add], [data-nav-add]', is: 'the sheet rising' },
  { name: 'segment-lookback', at: '/stats', act: '[data-segment]:not([aria-selected="true"])', is: 'the segmented pill sliding' },
  { name: 'mood-pick', at: '/', act: '[data-mood="4"]', is: 'a mood picked, the row looking at it' },
  { name: 'notice-dismiss', at: '/', act: '.kit-notice-x', is: 'a notice dismissed, its height closing' }
];

await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const errors = [];
const report = [];

let page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
page.on('pageerror', (err) => errors.push(String(err)));

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    for (const bar of document.querySelectorAll('.demo-bar')) bar.remove();
  });
};

/* The sampler. One rAF loop, reading both instruments into a keyed row per
   frame; the arithmetic happens afterwards in node, so the page does as
   little as possible between frames. */
const sample = (act, ms, names) =>
  page.evaluate(
    async ({ act, ms, names }) => {
      const root = document.querySelector('[data-app-root]');
      const readPseudo = (pseudo, prop) =>
        getComputedStyle(document.documentElement, pseudo)?.getPropertyValue(prop) ?? '';
      /* A name that is not in this transition answers nothing, which is how
         the set of participants is discovered rather than declared. */
      const vtRow = (side, name) => {
        const transform = readPseudo(`::view-transition-${side}(${name})`, 'transform');
        const opacity = readPseudo(`::view-transition-${side}(${name})`, 'opacity');
        if (!opacity && (!transform || transform === 'none')) return null;
        const m = /matrix\(([^)]+)\)/.exec(transform)?.[1].split(',').map(Number);
        const ride = /(-?[\d.]+)px/.exec(
          readPseudo(`::view-transition-${side}(${name})`, 'translate').split(/\s+/)[1] ?? ''
        )?.[1];
        const cut = /inset\(0px 0px (-?[\d.]+)px/.exec(
          readPseudo(`::view-transition-${side}(${name})`, 'clip-path')
        )?.[1];
        return {
          x: Math.round((m ? m[4] : 0) * 10) / 10,
          /* The mark's own travel plus the ride it takes with the blind: the
             two together are where it is on the frame. */
          y: Math.round(((m ? m[5] : 0) + Number(ride ?? 0)) * 10) / 10,
          o: opacity === '' ? 1 : Math.round(Number(opacity) * 1000) / 1000,
          ...(cut === undefined ? {} : { edge: Math.round((innerHeight - Number(cut)) * 10) / 10 })
        };
      };
      const key = (el) => {
        const cls = el.classList.length ? `.${[...el.classList].join('.')}` : el.tagName.toLowerCase();
        /* The text is what tells one row of a list from the next, trimmed
           so a count ticking up does not make a mark into a new mark. */
        const text = (el.textContent ?? '').trim().slice(0, 24).replace(/\d+/g, '#');
        return `${cls}|${text}`;
      };
      /* The browser's own answer to "is a transition running", for the
         length of this sample only; restored before the promise resolves. */
      let active = false;
      const startViewTransition = document.startViewTransition?.bind(document);
      if (startViewTransition)
        document.startViewTransition = (...a) => {
          const running = startViewTransition(...a);
          /* `ready`, not the call. Between calling and ready the browser is
             still taking its snapshot and has applied no animation, so those
             frames paint the outgoing page as it was and the pseudos answer
             with their identity defaults - which reads as the destination
             sitting there at full opacity for a frame and then snapping to
             the start of its animation. It is not painted, and counting it
             put a teleport and two vanishes on every navigation in the app. */
          running.ready.catch(() => {}).then(() => {
            active = true;
          });
          running.finished.catch(() => {}).then(() => {
            active = false;
          });
          return running;
        };
      const restore = () => {
        if (startViewTransition) document.startViewTransition = startViewTransition;
      };

      const frames = [];
      const t0 = performance.now();
      if (act.startsWith('goto:')) location.assign(act.slice(5));
      else if (act === 'back') history.back();
      else document.querySelector(act)?.click();
      return await new Promise((done) => {
        const tick = () => {
          const now = performance.now() - t0;
          const live = document.querySelector('[data-app-root]') ?? root;
          const rows = {};
          if (live) {
            for (const el of live.querySelectorAll('*')) {
              const cs = getComputedStyle(el);
              if (cs.display === 'none') continue;
              const box = el.getBoundingClientRect();
              if (!box.width && !box.height) continue;
              const k = key(el);
              /* First one wins: a repeated key inside one frame is a list of
                 identical marks, and following the first is enough to see a
                 jump the whole list makes. */
              if (rows[k]) continue;
              /* Effective opacity, not the element's own: opacity composes
                 down the tree, so a title at 1 inside a notice at 0 is not
                 on screen and its removal is not a disappearance. Reading
                 the own value reported all six of a dismissed notice's
                 marks as vanishing, when what had happened is that their
                 box faded first and took them with it. */
              let o = Number(cs.opacity);
              for (let up = el.parentElement; up && up !== live; up = up.parentElement)
                o *= Number(getComputedStyle(up).opacity);
              rows[k] = {
                x: Math.round(box.x * 10) / 10,
                y: Math.round(box.y * 10) / 10,
                w: Math.round(box.width * 10) / 10,
                h: Math.round(box.height * 10) / 10,
                o: Math.round(o * 1000) / 1000
              };
            }
          }
          const vt = {};
          for (const name of names)
            for (const side of ['old', 'new']) {
              const row = vtRow(side, name);
              if (row) vt[`${side}(${name})`] = row;
            }
          frames.push({ at: Math.round(now), active, rows, vt });
          if (now < ms) requestAnimationFrame(tick);
          else {
            restore();
            done(frames);
          }
        };
        requestAnimationFrame(tick);
      });
    },
    { act, ms, names }
  );

/** The arithmetic, in node: per mark, per consecutive frame pair.
 *
 * `settles` is the frame the gesture is over on. Everything a view
 * transition publishes stops existing on that frame at once - the browser
 * tearing its pseudo elements down, not an element being yanked - so a
 * departure there is the end of the run rather than a defect. Left at the
 * last frame for a DOM run, where a mark still on screen at the end is
 * exactly what should be there.
 */
function findYanks(frames, instrument, settles = frames.length - 1) {
  const keys = new Set();
  for (const f of frames) for (const k of Object.keys(f[instrument])) keys.add(k);
  const yanks = [];

  for (const k of keys) {
    const run = frames.map((f, i) => ({ i, at: f.at, row: f[instrument][k] ?? null }));
    const present = run.filter((r) => r.row);
    if (present.length < 2) continue;

    /* The per-frame movement of this mark, over the frames where it is in
       the tree on both sides. The median is what "the rest of the run" is. */
    const deltas = [];
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || !b) continue;
      deltas.push({ i, d: Math.hypot(b.x - a.x, b.y - a.y), at: run[i].at });
    }
    if (!deltas.length) continue;

    for (let n = 0; n < deltas.length; n++) {
      const { i, d, at } = deltas[n];
      if (d < TELEPORT_PX) continue;
      /* The fastest of the frames either side. A slide's neighbours are
         moving too; a teleport's are not. */
      const around = Math.max(deltas[n - 1]?.d ?? 0, deltas[n + 1]?.d ?? 0);
      if (d < Math.max(around, 0.25) * TELEPORT_RATIO) continue;
      yanks.push({
        kind: 'teleport',
        mark: k,
        frames: [i - 1, i],
        at,
        detail: `${Math.round(d)}px in one frame, ${Math.round(around * 10) / 10}px in the frames either side`
      });
    }

    /* Vanishing: full opacity to nothing, or out of the tree from full
       opacity, with no frame in between. */
    for (let i = 1; i < run.length; i++) {
      const a = run[i - 1].row;
      const b = run[i].row;
      if (!a || a.o < VISIBLE) continue;
      if (b && b.o <= GONE)
        yanks.push({
          kind: 'vanish',
          mark: k,
          frames: [i - 1, i],
          at: run[i].at,
          detail: `opacity ${a.o} to ${b.o} in one frame`
        });
      /* A departure on or after the frame the gesture settles on is the run
         ending. One before it, from full opacity, is a mark being taken
         off screen with no frame in between. */
      if (!b && i < settles)
        yanks.push({
          kind: 'vanish',
          mark: k,
          frames: [i - 1, i],
          at: run[i].at,
          detail: `left at opacity ${a.o}, ${settles - i} frame(s) before the gesture settled`
        });
    }

    /* Limbo: gone for two or more frames in the middle of the gesture and
       back afterwards - in neither place. */
    let gapStart = null;
    for (let i = 0; i < run.length; i++) {
      if (!run[i].row && gapStart === null) gapStart = i;
      if (run[i].row && gapStart !== null) {
        const length = i - gapStart;
        if (gapStart > 0 && length >= 2)
          yanks.push({
            kind: 'limbo',
            mark: k,
            frames: [gapStart - 1, i],
            at: run[i].at,
            detail: `absent for ${length} frames (${run[gapStart].at}ms to ${run[i - 1].at}ms)`
          });
        gapStart = null;
      }
    }
  }
  return yanks;
}

/* Furniture rather than the app: the demo bar and a toast are injected over
   whatever is being looked at. A navigation needs no exemption at all now
   that it is read off the pseudos rather than off the tree. */
const EXEMPT = /^\.demo-bar|\[data-toast\]|^\.toast/;

for (const scene of SCENES) {
  if (only.length && !only.includes(scene.name)) continue;
  try {
    await settle(scene.at);
    await page.waitForTimeout(1400);
    const all_frames = await sample(scene.act, SCENE_MS, VT_NAMES);
    /* A transition ran, so the pseudos are what the person saw, and only the
       frames it was running on are the gesture. */
    const transitioned = all_frames.some((f) => f.active);
    const instrument = transitioned ? 'vt' : 'rows';
    const frames = transitioned ? all_frames.filter((f) => f.active) : all_frames;
    const all = findYanks(frames, instrument, frames.length - 1);
    const yanks = all.filter((y) => !EXEMPT.test(y.mark));
    if (args.includes('--dump'))
      await writeFile(`${outDir}/${scene.name}.frames.json`, JSON.stringify(all_frames, null, 1));
    report.push({
      scene: scene.name,
      is: scene.is,
      instrument,
      frames: frames.length,
      sampled: all_frames.length,
      from: frames[0]?.at ?? 0,
      span: frames.at(-1)?.at ?? 0,
      yanks,
      suppressed: all.length - yanks.length
    });
    console.log(
      `${scene.name}: ${frames.length} frames read as ${instrument === 'vt' ? 'a transition' : 'a state change'}, ${yanks.length} yank(s)` +
        (yanks.length ? `\n  ${yanks.map((y) => `${y.kind} ${y.mark} @${y.at}ms - ${y.detail}`).join('\n  ')}` : '')
    );
  } catch (err) {
    report.push({ scene: scene.name, error: String(err).slice(0, 300) });
    console.log(`${scene.name}: ERROR ${String(err).slice(0, 160)}`);
  }
}

await writeFile(
  `${outDir}/report.json`,
  JSON.stringify({ thresholds: { TELEPORT_PX, TELEPORT_RATIO, VISIBLE, GONE }, report, errors }, null, 2)
);
await page.close();
await browser.close();
await app.close();
const total = report.reduce((n, r) => n + (r.yanks?.length ?? 0), 0);
console.log(`\n${report.length} scene(s), ${total} yank(s); report in ${outDir}/report.json`);
if (errors.length) {
  console.error(`${errors.length} page error(s):`);
  for (const e of errors) console.error(`  ${e}`);
}

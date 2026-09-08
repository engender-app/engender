/* Frame-by-frame captures of the tab-switch highlight, both shapes of the
   navigation (redesign ticket 26).

   The ticket's claim is about which of two edges moves when, which a still
   cannot show and a description cannot be held to. So every scene here is
   recorded twice over the same gesture. Chromium's screencast hands over
   real composited frames at the rate the page painted them, which is the
   flipbook; and a rAF loop measures the pill's own rectangle against the
   destination tab's, which is the number the flipbook is read against. The
   two passes are separate runs of the same click, because a page being
   screencast is not a page that should also be running a measurement loop.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames,
   the millisecond each was painted at, and its trace.
   tests/panel-motion-flipbook.mjs turns that into one page.

   Run: node tests/nav-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves
   `build/` rather than building, so the same build can be recorded twice. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/nav-motion'));

/** Long enough to cover the whole sequence twice over: the leading edge
    spends --dur-med, the trailing edge waits --stagger-step and then spends
    --dur-slow, and the icon's swing waits the same beat and spends the same
    --dur-slow, so the last thing to finish lands at 430ms. What is left of
    the scene is the stillness that says it landed rather than stopped. */
const SCENE_MS = 800;
const TRACE_MS = 700;

/* The phone floor, which is where the bar lives, and a width the rail exists
   at - the shell's container query hands over at 1024px. */
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1180, height: 900 };

/* The band each shape occupies, so a review page carries the navigation and
   not the screen behind it. Measured rather than guessed: at the phone floor
   the bar's box is 8,772 to 382,836, and on the desktop the rail's four
   doors run 142 to 346 inside a 220px column, under a wordmark and an add
   button that this ticket does not touch. Each has a few px of air so the
   bar's own edge and the rail's rule are in shot. */
const BAR_CROP = { left: 0, width: 390, top: 760, height: 84 };
const RAIL_CROP = { left: 0, width: 232, top: 126, height: 240 };

/** Where each door's tab leads, which is the route a scene has to be resting
    on before it can be recorded travelling away from it. The fourth is /more
    rather than /settings, and its key is 'settings' anyway (ADR-0036). */
const ROUTE = { home: '/', calendar: '/calendar', stats: '/stats', settings: '/more' };

const SCENES = [
  {
    name: 'bar-next-door',
    note: 'The bar, one door to the right: Today to Journal. The right edge goes first, the left one holds and then catches up.',
    form: 'bar',
    from: 'home',
    to: 'calendar'
  },
  {
    name: 'bar-across-the-add',
    note: 'The bar, three cells and the add button in one jump: Today to Transition. Same two phases, a wider gap to open across.',
    form: 'bar',
    from: 'home',
    to: 'settings'
  },
  {
    name: 'bar-back-across',
    note: 'The same jump backwards, Transition to Today, where the left edge is the one that leads and the right one drags.',
    form: 'bar',
    from: 'settings',
    to: 'home'
  },
  {
    name: 'rail-next-door',
    note: 'The rail, one row down: Today to Journal. The same mechanic mapped to Y - the bottom edge leads, the top edge follows.',
    form: 'rail',
    from: 'home',
    to: 'calendar'
  },
  {
    name: 'rail-back-three',
    note: 'The rail, three rows up in one jump: Transition to Today. The top edge leads going up.',
    form: 'rail',
    from: 'settings',
    to: 'home'
  }
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

/** Everything a pass needs: its own context, so reduced motion can be a
    context flag rather than something poked at the DOM. */
async function open(reducedMotion) {
  const context = await browser.newContext({
    viewport: PHONE,
    deviceScaleFactor: 1,
    reducedMotion
  });
  /* Toasts are the app working correctly and they are noise here: the
     storage warning fires on every load in headless Chromium and animates on
     a clock of its own. Hidden rather than removed, because a toast removed
     from the DOM is one the app may put back mid-scene. */
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '[data-toast]{display:none !important}';
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  return { context, page };
}

/* `reducedMotion: 'no-preference'` explicitly, and it is the difference
   between a recording and a blank one: headless Chromium answers
   `prefers-reduced-motion: reduce` by default, the shell reads that media
   query into `html[data-a11y-motion]` (+layout.svelte), and base.css clamps
   every duration to 1ms from there. The last pass in this file turns it back
   on deliberately, which is the reduced-motion criterion. */
const { context, page } = await open('no-preference');
const cdp = await context.newCDPSession(page);
const scenes = [];

const clearToasts = (p) =>
  p.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });

/* The demo bar is review chrome, half the viewport at 390px, and not in the
   build being signed off - the same removal every gallery here makes. */
const stripDemoBar = (p) =>
  p.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });

const settle = async (p, path) => {
  await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await p.locator('[data-leave-setup]').count()) {
    await p.locator('[data-leave-setup]').click();
    await p.waitForSelector('[data-home-hello]');
    await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await clearToasts(p);
  await stripDemoBar(p);
};

/* Palette and theme come from the real controls, and a goto resets a
   hand-set data-theme, so both are set and then navigated away from. One
   palette and one theme for the whole run: what this ticket changed is a
   shape's schedule, which is the same arithmetic in all eight palettes, and
   a second theme would double what a review page carries for nothing. */
const dress = async (p, theme) => {
  await settle(p, '/settings');
  await p.locator('[data-palette-pick="trans"]').click();
  await p.locator(`[data-segment="${theme}"]`).click();
  await p.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
};

/** Records everything the page paints for `SCENE_MS`, with `act` fired one
    frame in - so the first frame is the resting state the motion starts
    from rather than the middle of it. */
async function record(name, act) {
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* The screencast was stopped between this frame and its ack, which is
         the ordinary way a scene ends. */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  /* When the click landed, on the same clock the frames are stamped on, so a
     review page can put a frame and the measurement of that same instant
     side by side: the trace's own clock starts at its click, and without
     this the two runs are 80-odd ms apart with nothing saying so. Frames are
     stamped as they arrive over CDP rather than as they were painted, so the
     alignment is good to a frame and not better than that. */
  const clickAt = Date.now() - started;
  await act();
  await page.waitForTimeout(SCENE_MS);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);

  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms, click at ${clickAt}ms`);
  return { frames: written, clickAt };
}

/** Clicks the tab and samples the pill's rectangle every animation frame
    from the click, against the destination tab's own.

    The click happens inside the page so that t=0 really is the click rather
    than the round trip before it. Both edges of the travelling axis come
    back as their own numbers, because they are the whole claim: `lead` is
    the edge nearer the destination and `trail` the one left behind, each as
    the fraction of its own journey it has covered, plus the shape's size as
    a multiple of its resting size. */
function trace(p, { pillSel, tabSel, axis }) {
  return p.evaluate(
    async ({ pillSel, tabSel, axis, ms }) => {
      const pill = document.querySelector(pillSel);
      const tab = document.querySelector(tabSel);
      /* near is left or top, far is right or bottom - the same pair of names
         indicator.ts's leadingEdge uses, so a trace can be read straight
         against the code that produced it. */
      const span = (el) => {
        const r = el.getBoundingClientRect();
        return axis === 'x' ? { near: r.left, far: r.right } : { near: r.top, far: r.bottom };
      };
      const from = span(pill);
      const to = span(tab);
      const forward = to.near > from.near;
      const leadEdge = forward ? 'far' : 'near';
      const trailEdge = forward ? 'near' : 'far';
      const size = (s) => s.far - s.near;
      const rest = size(to);
      const covered = (s, edge) => {
        const journey = to[edge] - from[edge];
        return journey ? (s[edge] - from[edge]) / journey : 1;
      };
      const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

      const out = [];
      const t0 = performance.now();
      tab.click();
      return await new Promise((done) => {
        const tick = () => {
          const now = performance.now() - t0;
          const s = span(pill);
          out.push({
            at: Math.round(now),
            lead: round(covered(s, leadEdge), 3),
            trail: round(covered(s, trailEdge), 3),
            size: round(size(s), 1),
            grown: round(size(s) / rest, 3)
          });
          if (now < ms) requestAnimationFrame(tick);
          else
            done({
              rest: round(rest, 1),
              /* The gap the shape opens across, taken from the two tabs
                 rather than from the widest frame sampled: a rAF loop lands
                 either side of the true peak, so a peak read back as a
                 distance always under-reports it. */
              distance: round(Math.abs(to.near - from.near), 1),
              forward,
              leadEdge,
              frames: out
            });
        };
        requestAnimationFrame(tick);
      });
    },
    { pillSel, tabSel, axis, ms: TRACE_MS }
  );
}

const selectors = ({ form, to }) => ({
  pillSel: `[data-nav-pill="${form}"]`,
  tabSel: `[${form === 'bar' ? 'data-nav-item' : 'data-rail-item'}="${to}"]`,
  axis: form === 'bar' ? 'x' : 'y'
});

/** Rests the page on the scene's origin door, at the width its shape lives
    at, with the pill already placed there rather than travelling into it. */
async function rest(p, { form, from }) {
  await p.setViewportSize(form === 'bar' ? PHONE : DESK);
  await settle(p, ROUTE[from]);
  await p.waitForSelector(`[data-nav-pill="${form}"].is-shown`);
  await p.waitForTimeout(400);
}

try {
  await dress(page, 'light');

  for (const spec of SCENES) {
    const sel = selectors(spec);
    /* Measured first, because the trace's own click is the one that has to
       start from a settled pill, and a screencast run leaves the page on the
       destination anyway. */
    await rest(page, spec);
    const measured = await trace(page, sel);
    console.log(
      `${spec.name}: rest ${measured.rest}px, ${measured.leadEdge} leads, ` +
        `widest ${Math.max(...measured.frames.map((f) => f.grown))}x`
    );

    await rest(page, spec);
    const { frames, clickAt } = await record(spec.name, () => page.locator(sel.tabSel).click());

    scenes.push({
      ...spec,
      axis: sel.axis,
      crop: spec.form === 'bar' ? BAR_CROP : RAIL_CROP,
      trace: measured,
      clickAt,
      frames
    });
  }

  /* The reduced-motion criterion, which is a measurement rather than a
     flipbook: with the clamp on there is nothing to flip through, and what
     has to be true is that the pill is on its destination at its own size on
     the first frame after the click, with neither edge left mid-stretch. A
     context of its own, so the clamp arrives the way a person's own setting
     does. */
  const reduced = await open('reduce');
  await dress(reduced.page, 'light');
  const spec = SCENES[0];
  await rest(reduced.page, spec);
  const clamped = await trace(reduced.page, selectors(spec));
  await reduced.context.close();
  const first = clamped.frames[0];
  console.log(
    `reduced motion: first frame at ${first.at}ms - lead ${first.lead}, ` +
      `trail ${first.trail}, ${first.grown}x its resting size`
  );
  scenes.push({ name: 'reduced-motion', note: spec.note, reduced: true, trace: clamped, frames: [] });
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2)
  );
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

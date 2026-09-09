/* Frame-by-frame captures of the foot arriving and leaving (carpet 26).

   The foot is a frame object now, so a screen that grows or drops one
   changes the height of the scroll region beside it, and the claim this
   ticket makes about that is a claim about single frames: the room is taken
   at the end of the travel and given back at its start, so no frame holds a
   strip of column that has been clipped away with nothing over it. A still
   cannot show that and a description cannot be held to it, so every scene
   is recorded twice over the same gesture - Chromium's screencast for the
   flipbook, and a rAF loop reading the boxes for the numbers the flipbook
   is read against.

   Two numbers per frame carry the whole argument. `top` is the foot's own
   top edge in window coordinates, which is what travels; `hole` is how far
   the scroll region's bottom edge sits *above* it, which is the strip that
   would be missing. `hole` has to be 0 on every frame of every scene, and
   `top` has to reach its resting value on the last frame of the travel and
   on no frame before it (nothing painted at its destination before it
   travelled there; nothing in neither place - Alicja, on ticket 33: "NO
   YANKS ANYWHERE").

   The gestures are tab changes on /practice/voice, which is the one screen
   where a foot arrives, leaves and is replaced without a navigation: the
   compare tab has no foot until two takes are picked, the practise tab has
   one control, and the record tab has its own. A navigation is deliberately
   not a scene here - the foot cuts on one, and goes with the screen's own
   snapshot instead ($lib/motion/foot).

   Frames land as JPEGs plus a manifest.json in the shape
   tests/panel-motion-flipbook.mjs reads.

   Run: node tests/foot-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves
   `build/` rather than building. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/foot-motion'));

/** --dur-slow is 380ms; what is left of the scene is the stillness that
    says it landed rather than stopped. */
const SCENE_MS = 700;
const TRACE_MS = 620;

const PHONE = { width: 390, height: 844 };
/** The bottom third of the window: the foot, the floating bar it rises from
    behind, and enough of the column above it to see what the region gives
    up. */
const CROP = { left: 0, width: 390, top: 500, height: 344 };

const tab = (key) => `[data-segmented="voice-tab"] [data-segment="${key}"]`;
/** The foot, under either name: `[data-app-savebar]` after carpet 26 and
    `.editor-savebar` before it, so the same three scenes can be recorded on
    main and read beside these. */
const BAR = '[data-app-savebar], .editor-savebar';

const SCENES = [
  {
    name: 'foot-arrives',
    note: 'The compare tab has no foot until two takes are picked; the practise tab has one control. The foot rises from behind the floating bar and the column gives up its room on the last frame, under the foot rather than ahead of it.',
    from: 'compare',
    act: tab('practise')
  },
  {
    name: 'foot-leaves',
    note: 'The same gesture back. The room comes back at the first frame, while the foot is still over the strip it is uncovering, and the foot then travels down behind the bar.',
    from: 'practise',
    act: tab('compare')
  },
  {
    name: 'foot-swaps',
    note: "Record to practise: one foot leaves while another arrives, each travelling its own way past the other. Two feet in the column for the length of it and neither of them reserving room, which is what keeps the column still while they cross.",
    from: 'record',
    act: tab('practise')
  }
];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
const browser = await launchChromium();
const app = await preview({ root, preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;

/* `reducedMotion: 'no-preference'` explicitly: headless Chromium answers
   `prefers-reduced-motion: reduce` by default, which clamps every duration
   and records a blank flipbook. The last pass turns it back on
   deliberately, which is the reduced-motion criterion. */
async function open(reducedMotion) {
  const context = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 1, reducedMotion });
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

const settle = async (p, path) => {
  await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await p.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await p.locator('[data-leave-setup]').count()) {
    await p.locator('[data-leave-setup]').click();
    await p.waitForSelector('[data-home-hello]');
    await p.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await p.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await p.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
};

const dress = async (p, theme) => {
  await settle(p, '/settings');
  await p.locator('[data-palette-pick="trans"]').click();
  await p.locator(`[data-segment="${theme}"]`).click();
  await p.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
};

const { page } = await open('no-preference');
const cdp = await page.context().newCDPSession(page);

/** Rests the page on the scene's origin tab. */
async function rest(p, scene) {
  await settle(p, '/practice/voice');
  await p.waitForTimeout(500);
  await p.locator(tab(scene.from)).click();
  await p.waitForTimeout(700);
}

const fire = (p, scene) => p.evaluate((sel) => document.querySelector(sel).click(), scene.act);

/** Every frame of the change, read off the boxes the browser is painting:
    where each foot's top edge is, where the region's bottom edge is, and
    what the two of them leave between them. */
async function trace(p, scene) {
  return p.evaluate(
    async ({ act, ms, bar }) => {
      const round = (n) => Math.round(n * 10) / 10;
      const out = [];
      const t0 = performance.now();
      document.querySelector(act).click();
      return await new Promise((done) => {
        const tick = () => {
          const now = performance.now() - t0;
          const region = document.querySelector('[data-app-scroll-region]').getBoundingClientRect();
          const feet = [...document.querySelectorAll(bar)].map((el) => {
            const box = el.getBoundingClientRect();
            return {
              top: round(box.top),
              height: round(box.height),
              leaving: el.hasAttribute('data-savebar-leaving'),
              /* The strip of column that would be missing: how far the
                 region's bottom edge is above this foot's top edge. */
              hole: round(Math.max(0, box.top - region.bottom))
            };
          });
          out.push({ at: Math.round(now), region: round(region.bottom), feet });
          if (now < ms) requestAnimationFrame(tick);
          else done({ frames: out });
        };
        requestAnimationFrame(tick);
      });
    },
    { act: scene.act, ms: TRACE_MS, bar: BAR }
  );
}

/** Where a foot rests on this tab, once it has: its top edge, and the
    region's bottom edge, which the reservation makes the same line. */
const resting = (p) =>
  p.evaluate((bar) => {
    const round = (n) => Math.round(n * 10) / 10;
    const foot = document.querySelector(bar);
    const region = document.querySelector('[data-app-scroll-region]').getBoundingClientRect();
    return {
      top: foot ? round(foot.getBoundingClientRect().top) : null,
      height: foot ? round(foot.getBoundingClientRect().height) : 0,
      region: round(region.bottom)
    };
  }, BAR);

/** Records everything the page paints for `SCENE_MS`, with `act` fired one
    frame in - so the first frame is the resting state the motion starts
    from rather than the middle of it. */
async function record(name, act, p, session) {
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await session.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between this frame and its ack, which is how a scene
         ends. */
    }
  };
  session.on('Page.screencastFrame', onFrame);
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  await p.waitForTimeout(80);
  const clickAt = Date.now() - started;
  await act();
  await p.waitForTimeout(SCENE_MS);
  await session.send('Page.stopScreencast');
  session.off('Page.screencastFrame', onFrame);

  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms, click at ${clickAt}ms`);
  return { frames: written, clickAt };
}

/** The two claims, read off a trace. */
function verdict(measured, restIn) {
  const holes = measured.frames.flatMap((f) => f.feet.map((foot) => foot.hole)).filter((h) => h > 0);
  /* An arriving foot is at its destination only when it stops travelling.
     A frame that already has it there while later frames do not is
     something painted before it travelled. */
  const arrivals = measured.frames
    .map((f, i) => ({ i, at: f.at, foot: f.feet.find((x) => !x.leaving) ?? f.feet[0] }))
    .filter((f) => f.foot);
  const settledAt = restIn?.top == null ? null : arrivals.find((f) => Math.abs(f.foot.top - restIn.top) < 1);
  const last = arrivals.at(-1);
  return {
    worstHole: holes.length ? Math.max(...holes) : 0,
    frames: measured.frames.length,
    settledAt: settledAt?.at ?? null,
    settledFrame: settledAt?.i ?? null,
    travel: arrivals.length ? Math.round(Math.max(...arrivals.map((f) => f.foot.top)) - Math.min(...arrivals.map((f) => f.foot.top))) : 0,
    lastTop: last?.foot.top ?? null
  };
}

const scenes = [];
try {
  await dress(page, 'light');
  for (const scene of SCENES) {
    await rest(page, scene);
    const before = await resting(page);
    const measured = await trace(page, scene);
    const after = await resting(page);
    const v = verdict(measured, after);
    console.log(
      `${scene.name}: ${v.frames} traced frames, worst hole ${v.worstHole}px, ` +
        `${v.travel}px of travel, settled at ${v.settledAt}ms (rest top ${after.top}, region ${after.region})`
    );

    await rest(page, scene);
    const { frames, clickAt } = await record(scene.name, () => fire(page, scene), page, cdp);
    scenes.push({
      name: scene.name,
      note: scene.note,
      crop: CROP,
      trace: { ...measured, before, after, verdict: v },
      clickAt,
      frames
    });
  }

  /* The reduced-motion criterion, which is a measurement rather than a
     flipbook: with the clamp on, the foot is at its resting place on the
     first frame after the click and the region is already the height that
     goes with it. There is nothing to flip through, which is the point. */
  const reduced = await open('reduce');
  await dress(reduced.page, 'light');
  const scene = SCENES[0];
  await rest(reduced.page, scene);
  const clamped = await trace(reduced.page, scene);
  const clampedRest = await resting(reduced.page);
  await rest(reduced.page, scene);
  const clampedCdp = await reduced.page.context().newCDPSession(reduced.page);
  const clampedFrames = await record(
    'reduced-motion',
    () => fire(reduced.page, scene),
    reduced.page,
    clampedCdp
  );
  const first = clamped.frames.find((f) => f.feet.some((x) => !x.leaving));
  console.log(
    `reduced motion: first frame with a foot at ${first?.at}ms, top ${first?.feet[0]?.top}, ` +
      `resting top ${clampedRest.top}`
  );
  await reduced.context.close();
  scenes.push({
    name: 'reduced-motion',
    note: 'The clamp on: the foot cuts to its place and the column to its height. Nothing to flip through, which is the criterion.',
    reduced: true,
    crop: CROP,
    trace: { ...clamped, after: clampedRest, verdict: verdict(clamped, clampedRest) },
    clickAt: clampedFrames.clickAt,
    frames: clampedFrames.frames
  });
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

/* Frame-by-frame captures of the body map's two movements, plus the crops
   of the route that redesign ticket 40 changed.

   A still cannot review either movement. The arrival is eight shapes coming
   in one --stagger-step apart, and the question is whether any of them is
   painted at its destination before it has travelled there. The selection
   change grows one shape's stroke and fill in place and crossfades the two
   charts, and the question is whether anything is in neither state for a
   frame. Both are read twice over: from what the page painted (Chromium's
   own screencast) and from the properties themselves sampled every frame,
   because a recording at speed hides exactly the single-frame defects
   Alicja reads these for.

   The samples say what the curves did and the pixels say what was painted;
   where they disagree, the pixels are the authority - a rAF sampler reads
   before a ResizeObserver callback in the same frame.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames,
   the millisecond each was painted at and its samples;
   tests/panel-motion-flipbook.mjs turns a directory of those into one
   embeddable bundle.

   Run: node tests/body-map-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/ticket40/motion'));

/** The stagger is eight steps of --stagger-step behind a --dur-slow
    arrival; three times the longest of those shows it land and hold. */
const SCENE_MS = 1100;
const VIEWPORT = { width: 390, height: 900 };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];

const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});
const page = await context.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
const cdp = await context.newCDPSession(page);

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

const stripChrome = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    const style = document.createElement('style');
    style.textContent =
      '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
    document.head.append(style);
  });

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/* Every shape's box, its fill and its edge, every frame. The two things
   that must never happen are both here: a shape at its resting opacity and
   scale before its own step began (painted at its destination before it
   travelled there), and a shape at neither its old nor its new selected
   state for a frame. Read off the shapes themselves rather than off a
   wrapper, because the wrapper does not move. */
const READ_SHAPES = `
  const out = {};
  /* The state lives on the button and the movement lives on the drawing,
     which is an SVG group over on the other side of the stage - so neither
     element answers this on its own. Reading the button alone reported
     every shape at rest on its first frame, because a button's opacity
     never leaves 1. */
  const pickedOf = (region) =>
    document
      .querySelector('[data-body-map-figure] [data-region="' + region + '"]')
      ?.getAttribute('aria-pressed') ?? null;
  for (const el of document.querySelectorAll('[data-body-map-figure] [data-region-art], [data-body-map-figure] .region-body')) {
    const region = el.dataset.regionArt ?? 'whole_body';
    const s = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    out[region] = {
      x: Math.round(box.x * 10) / 10,
      y: Math.round(box.y * 10) / 10,
      w: Math.round(box.width * 10) / 10,
      h: Math.round(box.height * 10) / 10,
      o: Math.round(Number(s.opacity) * 1000) / 1000,
      t: s.transform,
      clip: s.clipPath,
      border: el.querySelector('rect') ? getComputedStyle(el.querySelector('rect')).strokeWidth : 'none',
      fill: s.getPropertyValue('--region-fill').trim() || 'none',
      picked: pickedOf(region)
    };
  }
  const head = document.querySelector('[data-body-map-heading]');
  if (head) {
    const b = head.getBoundingClientRect();
    out['__heading'] = {
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      w: Math.round(b.width * 10) / 10,
      h: Math.round(b.height * 10) / 10,
      o: Math.round(Number(getComputedStyle(head).opacity) * 1000) / 1000,
      text: head.textContent.trim()
    };
  }
  const charts = document.querySelector('.body-map-charts');
  if (charts) {
    const b = charts.getBoundingClientRect();
    out['__charts'] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  }
  return out;`;

async function record(name, note, act, options = {}) {
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between frame and ack: the ordinary end of a scene. */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 62, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  await startSampling(page, READ_SHAPES);
  await act();
  await page.waitForTimeout(options.ms ?? SCENE_MS);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  let samples = [];
  try {
    samples = await stopSampling(page);
  } catch {
    samples = [];
  }

  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  scenes.push({ name, note, frames: written, samples, ...(options.crop ? { crop: options.crop } : {}) });
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms, ${samples.length} samples`);
}

try {
  for (const [palette, theme] of [
    ['trans', 'light'],
    ['nonbinary', 'dark']
  ]) {
    await dress(palette, theme);

    /* The arrival, entered client-side. A page.goto runs no blind and kills
       the sampler with the document, so the screen has to be walked into
       the way a finger walks into it - from /stats, which is where the back
       control on /body-map points. */
    await settle('/stats');
    await stripChrome();
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    await record(
      `arrive-${palette}-${theme}`,
      'Arriving on the body map from Look back: the eight region shapes stagger in top to bottom by body order, one --stagger-step apart, over --dur-slow each.',
      async () => {
        await page.evaluate(() => {
          const link = document.querySelector('a[href="/body-map"], a[href$="/body-map"]');
          if (link) link.click();
          else history.pushState({}, '', '/body-map'), dispatchEvent(new PopStateEvent('popstate'));
        });
      }
    );

    await settle('/body-map');
    await stripChrome();
    await page.waitForSelector('[data-body-map-figure] [data-region="chest"]');
    await page.mouse.move(4, 4);
    await page.waitForTimeout(700);

    /* A selection change. Picked from a shape that is not adjacent to the
       one leaving, because "no travelling indicator between regions" is
       most visible where a pill would have had furthest to fly. */
    await record(
      `select-${palette}-${theme}`,
      'Tapping the hairline while the chest is picked: both shapes grow their stroke and fill in place, nothing travels between them, and the two charts crossfade their series under a heading that eases in.',
      () => page.locator('[data-body-map-figure] [data-region="hairline"]').click()
    );

    await page.waitForTimeout(500);
    /* In its clear band, not at its centre: the eight sit on the ground, so
       its middle is the chest and only what they leave over is the ground a
       finger can reach. The band under the last shape is that leftover,
       sized to a touch target by bodyRegionFigure.ts. */
    await record(
      `select-ground-${palette}-${theme}`,
      "Tapping the ground, whole_body, from the hairline, in the clear band below the last shape: the ground is a region like any other and takes the selection the same way.",
      async () => {
        const ground = await page.locator('[data-body-map-figure] [data-region="whole_body"]').boundingBox();
        const last = await page.locator('[data-body-map-figure] [data-region="hands_feet"]').boundingBox();
        const y = (last.y + last.height + ground.y + ground.height) / 2;
        await page.mouse.click(ground.x + ground.width / 2, y);
      }
    );
  }

  /* The crops. Two of what the ticket changed on the route itself, plus one
     whole screen for the arrival, which is the one shot that earns being a
     whole screen. */
  await dress('trans', 'light');
  await settle('/body-map');
  await stripChrome();
  await page.waitForSelector('[data-body-map-figure]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(outDir, 'route-whole-screen.png') });
  await page.locator('[data-body-map-figure]').screenshot({ path: resolve(outDir, 'route-figure.png') });
  await page.locator('.kit-reading-controls').screenshot({ path: resolve(outDir, 'route-controls.png') });
  await page
    .locator('[data-list-row="body-region-inspector"], [data-body-map-heading]')
    .first()
    .screenshot({ path: resolve(outDir, 'route-heading.png') });

  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ scenes }, null, 2));
  console.log(`\n${outDir}`);
} finally {
  await context.close();
  await browser.close();
  await app.close();
}

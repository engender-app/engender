/* Frame-by-frame captures of the Look back door's rail moving (phase 10
   redesign ticket 11).

   The span travels four ways that are not the finger's - an era tapped, a
   milestone tapped, the rail tapped, a key pressed - and settles once after
   a drag is released. A still cannot review any of those: what has to be
   checked is that the clip, the frame and the handles move as one object
   and that nothing under the rail jumps while they do. So this records
   what the page painted, Chromium's own screencast, the same mechanism
   tests/panel-motion-gallery.mjs and tests/journal-motion-gallery.mjs use.

   Redesign ticket 19 changed what the drag scene shows - a held handle
   follows the finger to the day and snaps on release, where ticket 11
   snapped on every move - and added the handoff: the way into the span's
   retrospective, with the rail staying raised while the door goes.

   The last scene is recorded with reduced motion on, which is the ticket's
   own acceptance box: every movement clamps, and the flipbook shows the
   cut.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames
   and the millisecond each was painted at; tests/panel-motion-flipbook.mjs
   turns a directory of those into one embeddable bundle:
     node tests/panel-motion-flipbook.mjs out.json rail=<dir> --crop 0,420 --motion 320

   Run: node tests/lookback-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { farMark, seedEras } from './lookback-shared.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/lookback-motion'));

/** The travel runs at --dur-med (240ms); a scene three times that shows it
    land and hold still. */
const SCENE_MS = 720;
const VIEWPORT = { width: 390, height: 900 };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];

/** One browser context per motion setting: headless Chromium answers
    prefers-reduced-motion with `reduce` by default, which the shell reads
    into html[data-a11y-motion]; the app's own state lives in the context,
    so each context has to seed its own journal. */
async function open(reducedMotion) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion });
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '[data-toast]{display:none !important}';
      document.head.append(style);
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}

const settle = async (page, path) => {
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

const stripChrome = (page) =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    const style = document.createElement('style');
    style.textContent =
      '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
    document.head.append(style);
  });

const dress = async (page, palette, theme) => {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};


const seed = async (page) => {
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await seedEras(page, settle);
};

/** Samples `read()` - a function body, evaluated in the page - on every
    animation frame into window.__samples until `stopSampling`, the way
    tests/state-motion-gallery.mjs measures beside its frames: a recording
    shows the settle, the samples say by how many days and over how long. */
const startSampling = (page, read) =>
  page.evaluate((body) => {
    const fn = new Function(body);
    const t0 = performance.now();
    window.__samples = [];
    window.__sampling = true;
    const step = (now) => {
      if (!window.__sampling) return;
      try {
        window.__samples.push({ t: Math.round(now - t0), ...fn() });
      } catch (e) {
        window.__samples.push({ t: Math.round(now - t0), error: String(e) });
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, read);
const stopSampling = (page) =>
  page.evaluate(() => {
    window.__sampling = false;
    return window.__samples ?? [];
  });

/* The span as the finger and then the settle have it: the start day the
   rail reports, where the start grip stands, and the lifted layer's clip. */
const READ_SPAN = `
  const tl = document.querySelector('[data-span-timeline]');
  const grip = document.querySelector('[data-span-handle="start"]');
  const full = document.querySelector('.span-tl-full');
  return {
    start: tl ? Number(tl.dataset.spanStart) : null,
    dragging: tl ? tl.classList.contains('is-dragging') : null,
    gripX: grip ? Math.round(grip.getBoundingClientRect().left) : null,
    clip: full ? getComputedStyle(full).clipPath : null
  };`;

async function record(page, cdp, name, note, act, options = {}) {
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  if (options.read) await startSampling(page, options.read);
  await act();
  await page.waitForTimeout(options.ms ?? SCENE_MS);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  let samples;
  if (options.read) {
    try {
      samples = await stopSampling(page);
    } catch {
      samples = [];
    }
  }

  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  /* A scene may name its own band for the flipbook (panel-motion-flipbook
     reads `crop` per scene): the handoff is the whole top of the screen,
     where the rail scenes are the rail alone. */
  scenes.push({ name, note, frames: written, samples, ...(options.crop ? { crop: options.crop } : {}) });
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms`);
}

const arrive = async (page) => {
  await settle(page, '/stats');
  await page.waitForSelector('[data-span-era]');
  await stripChrome(page);
  await page.mouse.move(4, 4);
  await page.waitForTimeout(400);
};

/** Drags the start handle left by `px` over a few frames and releases. */
const dragStart = async (page, px) => {
  const box = await page.locator('[data-span-handle="start"] .span-tl-grip').boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(x - (px * i) / 10, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
};

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await seed(page);
    for (const [palette, theme] of [
      ['trans', 'light'],
      ['nonbinary', 'dark']
    ]) {
      await dress(page, palette, theme);
      await arrive(page);
      await record(page, cdp, `raise-${palette}-${theme}`, 'A touch on the end grip, no drag: the rail rises from rest - the span stands up, the frame and the era names appear, the grips grow.', async () => {
        const grip = await page.locator('[data-span-handle="end"]').boundingBox();
        await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height - 8);
      });
      await page.mouse.move(4, 4);
      await page.waitForTimeout(300);
      await record(page, cdp, `milestone-${palette}-${theme}`, 'From the default span, a milestone tapped: the nearer handle goes to it, the other stays.', async () =>
        (await farMark(page)).click()
      );
      await page.mouse.move(4, 4);
      await page.waitForTimeout(300);
      await record(page, cdp, `era-${palette}-${theme}`, 'An era tapped: the clip, the frame and both handles travel to the era\'s two edges.', () =>
        page.locator('[data-span-era]').nth(1).click()
      );
      await page.mouse.move(4, 4);
      await page.waitForTimeout(300);
      await record(page, cdp, `key-${palette}-${theme}`, 'Shift plus right arrow on the start handle: ten steps of the grain, one travel.', async () => {
        await page.locator('[data-span-handle="start"]').focus();
        await page.keyboard.press('Shift+ArrowRight');
      });
      if (palette !== 'trans') continue;
      await arrive(page);
      await record(page, cdp, `drag-${palette}-${theme}`, 'The start handle dragged 140px and released: it follows the finger to the day with no snap and no easing, then on release the handle, the clip and the frame travel to the grain or a magnet on --dur-med.', () =>
        dragStart(page, 140),
        { read: READ_SPAN }
      );
      /* The handoff into the span's retrospective (redesign ticket 19): the
         rail is raised by a touch on a grip, then the way in is tapped. The
         rail stays raised while the door goes, so the chosen stretch is the
         last thing standing on the outgoing screen; the field blind and the
         fade-through carry the change. */
      await arrive(page);
      const grip = await page.locator('[data-span-handle="end"]').boundingBox();
      await page.mouse.click(grip.x + grip.width / 2, grip.y + grip.height - 8);
      await page.mouse.move(4, 4);
      await page.waitForTimeout(400);
      await record(page, cdp, `handoff-${palette}-${theme}`, 'The way into the span\'s retrospective tapped with the rail raised: the rail stays up while the door leaves, the field\'s edge travels to the deep screen\'s height, and the range view arrives under it.', () =>
        page.locator('[data-lookback-read]').click(),
        { crop: { top: 0, height: 720 } }
      );
      await arrive(page);
      await record(page, cdp, `rail-${palette}-${theme}`, 'The rail tapped between the handles: the nearer one comes to the finger.', async () => {
        const rail = await page.locator('[data-span-timeline] .span-tl-rail').boundingBox();
        await page.mouse.click(rail.x + rail.width * 0.55, rail.y + rail.height * 0.4);
      });
    }
    await context.close();
  }
  {
    /* Reduced motion: the same era tap, cut rather than travelled. */
    const { context, page, cdp } = await open('reduce');
    await seed(page);
    await dress(page, 'trans', 'light');
    await arrive(page);
    await record(page, cdp, 'era-reduced', 'The same era tap with reduce-motion set: every transition is 1ms, so the span cuts.', () =>
      page.locator('[data-span-era]').nth(1).click()
    );
    await context.close();
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

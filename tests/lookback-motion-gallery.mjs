/* Frame-by-frame captures of the Look back door's rail moving (phase 10
   redesign ticket 11).

   The span travels four ways that are not the finger's - an era tapped, a
   milestone tapped, the rail tapped, a key pressed - and settles once after
   a drag is released. A still cannot review any of those: what has to be
   checked is that the clip, the frame and the handles move as one object
   and that nothing under the rail jumps while they do. So this records
   what the page painted, Chromium's own screencast, the same mechanism
   tests/panel-motion-gallery.mjs and tests/journal-motion-gallery.mjs use.

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
import { fillDate, launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/lookback-motion'));

/** The travel runs at --dur-med (240ms); a scene three times that shows it
    land and hold still. */
const SCENE_MS = 720;
const VIEWPORT = { width: 390, height: 900 };
const DAY_MS = 86400000;

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


/** The milestone mark farthest from either handle, as a locator: a mark
    under a handle's target is the handle's to drag, not a tap. */
const farMark = async (p) => {
  const index = await p.evaluate(() => {
    const at = (el) => { const r = el.getBoundingClientRect(); return r.x + r.width / 2; };
    const handles = [...document.querySelectorAll('[data-span-handle]')].map(at);
    const marks = [...document.querySelectorAll('[data-span-milestone]')].map(at);
    let best = 0;
    let bestGap = -1;
    marks.forEach((x, i) => {
      const gap = Math.min(...handles.map((h) => Math.abs(h - x)));
      if (gap > bestGap) { bestGap = gap; best = i; }
    });
    return best;
  });
  return p.locator('[data-span-milestone]').nth(index);
};

const iso = (epochDay) => new Date(epochDay * DAY_MS).toISOString().slice(0, 10);

const seed = async (page) => {
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);
  await settle(page, '/stats');
  await page.waitForSelector('[data-span-timeline]');
  const rail = await page.evaluate(() => {
    const el = document.querySelector('[data-span-timeline]');
    return { start: Number(el.dataset.railStart), today: Number(el.dataset.spanEnd) };
  });
  const cut1 = Math.max(rail.start + 30, rail.today - 700);
  const cut2 = Math.max(cut1 + 30, rail.today - 260);
  for (const era of [
    { name: 'Before I knew', start: null, end: cut1 },
    { name: 'First year', start: cut1 + 1, end: cut2 },
    { name: 'Since moving', start: cut2 + 1, end: null }
  ]) {
    await settle(page, '/transition/eras');
    await page.locator('[data-add]').click();
    await page.waitForSelector('input[name="era-name"]');
    await page.fill('input[name="era-name"]', era.name);
    await page.locator(`[data-segmented="era-start"] [data-segment="${era.start === null ? 'open' : 'day'}"]`).click();
    if (era.start !== null) {
      await page.waitForSelector('input[name="era-start"]', { state: 'attached' });
      await fillDate(page, 'input[name="era-start"]', iso(era.start));
    }
    await page.locator(`[data-segmented="era-end"] [data-segment="${era.end === null ? 'open' : 'day'}"]`).click();
    if (era.end !== null) {
      await page.waitForSelector('input[name="era-end"]', { state: 'attached' });
      await fillDate(page, 'input[name="era-end"]', iso(era.end));
    }
    await page.waitForTimeout(200);
    await page.locator('[data-save-era]').click();
    await page.waitForSelector('[data-save-era]', { state: 'detached', timeout: 10000 });
  }
};

async function record(page, cdp, name, note, act) {
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
  scenes.push({ name, note, frames: written });
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
      await record(page, cdp, `drag-${palette}-${theme}`, 'The start handle dragged 140px and released: it follows the finger with no easing, then settles onto the grain or a magnet.', () =>
        dragStart(page, 140)
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

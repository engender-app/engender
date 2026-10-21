/* Frame captures of the return moment arriving from Home. The five linked
   rows use the same block entrance in either motion setting.

   Run: node tests/return-motion-gallery.mjs [outDir] [--only arrive,reduce-arrive]
   Needs a demo build on disk. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? new Set(argv.splice(onlyAt, 2)[1].split(',')) : null;
const outDir = resolve(argv[0] ?? resolve(root, '.claude/return-motion'));

/** --dur-slow is 380ms and six rows of --stagger-step add 300; 900ms shows
    the last block land and hold still. */
const SCENE_MS = 900;
/* A phone, exactly. Unlike Home's recorder this one does not need a taller
   window: the screen is a step, its foot is pinned to the bottom edge, and
   what is off the bottom of a 844px window is off the bottom of the phone
   too. */
const VIEWPORT = { width: 390, height: 844 };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];

/** One browser context per motion setting: headless Chromium answers
    prefers-reduced-motion with `reduce` by default, which the shell reads
    into html[data-a11y-motion], and the app's own state lives in the
    context, so each one seeds its own journal. */
async function open(reducedMotion) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, reducedMotion });
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      /* The demo bar is review chrome, a third of the viewport at 390px, and
         not in the build being signed off. Hidden here rather than removed
         per scene, because every scene below reloads at least once and a
         removed bar comes straight back; the body class it sets makes the
         frame a flex column, so that goes with it. */
      style.textContent =
        '[data-toast]{display:none !important}' +
        '.demo-bar{display:none !important}' +
        'body.has-demo-bar{display:block !important;height:auto !important}' +
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
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
};

/** A client-side navigation to the step, which is what the shell makes
    (+layout.svelte's `goto('/coming-back')`) and the only kind that runs
    the field's blind: a cold load has no outgoing screen to pull an edge
    down from, and it replaces the document, which takes the sampling loop
    with it. The route is linked from nowhere on purpose (ADR-0062), so the
    anchor the router needs is made here rather than found. */
const enterStep = (page) =>
  page.evaluate(() => {
    const a = document.createElement('a');
    a.href = '/coming-back';
    a.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(a);
    a.click();
    a.remove();
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

/** Five weeks away. The jump lands on Home and the shell's own gate is what
    opens the surface, so what this records is the arrival a person meets
    rather than a route typed in. */
const seedGap = async (page) => {
  await settle(page, '/');
  /* Dispatched rather than clicked: the demo bar is hidden by the stylesheet
     this context injects, and Playwright refuses to click what it cannot
     see. The handler is all this needs. */
  await page.locator('[data-fill-coming-back]').dispatchEvent('click');
  await page.waitForURL('**/coming-back', { timeout: 180000 });
  await page.waitForSelector('[data-coming-back-item="dose"]');
  await page.waitForTimeout(1200);
};

/* Every row, in list order, per frame: what its block is clipped to, its
   own height, and where it stands.

   All three are needed and none of them alone would do. The clip is the
   arrival (kit-block-in). The height is the leave, and it is the only
   thing that can say whether a row collapsed or cut - a row leaving from
   the bottom of the list moves nothing above it, so `tops` cannot tell the
   two apart, and the content inside a collapsing row keeps its own height
   while the row clips it, so measuring the content cannot either. `tops`
   is what says the rows under a leaving one closed up with it rather than
   jumping once it was gone. */
const READ_ROWS = `
  const rows = [...document.querySelectorAll('[data-list-card] > .rows-divide')];
  const blocks = rows.map((r) => r.querySelector('.kit-row-ico'));
  return {
    rows: rows.length,
    clips: blocks.map((b) => (b ? getComputedStyle(b).clipPath : null)),
    heights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
    tops: rows.map((r) => Math.round(r.getBoundingClientRect().top)),
    listHeight: Math.round(document.querySelector('[data-list-card]')?.getBoundingClientRect().height ?? 0),
    line: document.querySelector('[data-screen-subtitle]')?.textContent.trim() ?? null
  };`;

/** Records everything the page paints for SCENE_MS, with `act` fired one
    frame in, so the first frame is the resting state the motion starts
    from. `read`, if given, is sampled per animation frame across the same
    window and stored beside the frames. */
async function record(page, cdp, name, note, act, read, options = {}) {
  const sceneMs = options.ms ?? SCENE_MS;
  if (only && !only.has(name)) {
    await act();
    await page.waitForTimeout(sceneMs);
    return;
  }
  /* The band the flipbook keeps, measured before and after and taken as
     the union: a list that loses 100px of height has to be in shot at both
     ends of the change (panel-motion-flipbook.mjs reads `crop` per scene). */
  const bandOf = (selector) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return undefined;
      const box = el.getBoundingClientRect();
      return { top: Math.max(0, Math.floor(box.top) - 24), bottom: Math.ceil(box.bottom) + 24 };
    }, selector);
  const bandBefore = options.cropOf ? await bandOf(options.cropOf) : undefined;
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
  if (read) await startSampling(page, read);
  await act();
  await page.waitForTimeout(sceneMs);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  let crop;
  if (options.cropOf) {
    const bandAfter = await bandOf(options.cropOf);
    const bands = [bandBefore, bandAfter].filter(Boolean);
    if (bands.length) {
      const top = Math.min(...bands.map((b) => b.top));
      crop = { top, height: Math.max(...bands.map((b) => b.bottom)) - top };
    }
  }
  let samples;
  if (read) {
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
  scenes.push({ name, note, frames: written, samples, ...(crop ? { crop } : {}) });
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms`);
}

async function scenesFor(page, cdp, tag, note) {
  await seedGap(page);
  await settle(page, '/');
  await record(page, cdp, `${tag}arrive`, note, () => enterStep(page), READ_ROWS);
  await page.waitForSelector('[data-coming-back-item="dose"]');
}

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, '',
      'The field arrives from Home and each linked row icon clips open from its left edge.');
    await context.close();
  }

  {
    const { context, page, cdp } = await open('reduce');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, 'reduce-',
      'The same arrival with reduced motion: each row arrives without travel.');
    await context.close();
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

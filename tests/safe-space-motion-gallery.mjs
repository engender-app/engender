/* Frame-by-frame captures of Safe space arriving, breathing and handing
   over to a way down (phase 10 redesign ticket 47).

   The ticket's standing motion clause is mechanical rather than aesthetic -
   nothing appears, disappears or moves in one frame - and it is answered by
   two instruments read together, which is the division
   tests/yank-sweep.mjs already draws and this borrows:

     the frames   Chromium's own screencast, real composited frames at the
                  rate the page painted them. The pixels are the authority
                  on what was painted: a rAF sampler reads before a
                  ResizeObserver callback in the same frame, so the samples
                  can be right about a curve and wrong about a paint.
     the trace    the animated properties sampled on every animation frame -
                  the breath's scale and opacity, and the clip each way
                  down's icon block is drawn under. The numbers say which
                  frames are worth looking at.

   Three scenes, plus the reduced-motion control ADR-0078 requires
   (substitute, never delete):

     arrive       the hub row tapped, which is how a person actually gets
                  here. Client-side, never a goto: a goto runs no blind and
                  there is no arrival to record.
     breath       the halo pressed, which is the one thing on the screen.
     way-down     the first tap down, off the breath and into the letters
                  and photos.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames,
   the millisecond each was painted at and the scene's own trace.
   tests/panel-motion-flipbook.mjs turns a directory of those into one page.

   Run: node tests/safe-space-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves
   `build/` rather than building. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/safe-space-motion'));

/** Long enough to cover --dur-authored (380ms) twice over, so a scene shows
    the movement and the stillness after it - which is what says the motion
    landed rather than stopping somewhere. */
const SCENE_MS = 1100;
/** The breath's own clock is seconds, not frames: one phase of 4-4-4-4 is a
    second per count, so a scene that shows the phase word changing has to
    outlast one. */
const BREATH_MS = 2600;
const VIEWPORT = { width: 390, height: 844 };
const THEMES = ['light', 'dark'];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();

const scenes = [];

/* The sampler, installed in the page for the length of one scene. It reads
   what this screen animates and nothing else: the stage's own scale and
   opacity, and the clip each icon block is drawn under. `clipPath` is what
   kit-block-in animates, and it is read as a string because the inset's
   right edge is the only part that moves and a string is what the browser
   reports. */
const SAMPLER = `(() => {
  window.__trace = [];
  const t0 = performance.now();
  const tick = () => {
    const frame = document.querySelector('[data-app-root]');
    const stage = document.querySelector('.breath-stage');
    const ring = document.querySelector('[data-breathing-exercise]');
    const phase = document.querySelector('[data-breathing-phase]');
    const rows = [...document.querySelectorAll('[data-list-card] .kit-row-ico')];
    const boxOf = (el) => {
      if (!el || !frame) return null;
      const b = el.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      return { x: +(b.x - f.x).toFixed(1), y: +(b.y - f.y).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) };
    };
    const style = stage ? getComputedStyle(stage) : null;
    window.__trace.push({
      t: +(performance.now() - t0).toFixed(1),
      stage: style ? { opacity: +style.opacity, transform: style.transform, box: boxOf(stage) } : null,
      ring: boxOf(ring),
      phase: phase?.textContent?.trim() ?? null,
      rows: rows.map((el) => ({
        clip: getComputedStyle(el).clipPath,
        opacity: +getComputedStyle(el).opacity,
        box: boxOf(el)
      }))
    });
    window.__traceRaf = requestAnimationFrame(tick);
  };
  window.__traceRaf = requestAnimationFrame(tick);
})()`;

async function openContext({ reduce }) {
  /* `reducedMotion` explicitly: headless Chromium answers
     `prefers-reduced-motion: reduce` by default, the shell reads that into
     `html[data-a11y-motion]`, and every primitive cuts to zero - so the
     default run records the app correctly refusing to animate, which is the
     control and not the subject. */
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion: reduce ? 'reduce' : 'no-preference'
  });
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '[data-toast]{display:none !important}';
      document.head.append(style);
    });
  });
  return context;
}

async function run({ reduce, themes }) {
  const context = await openContext({ reduce });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  const cdp = await context.newCDPSession(page);

  const strip = () =>
    page.evaluate(() => {
      document.querySelector('.demo-bar')?.remove();
      document.body.classList.remove('has-demo-bar');
      for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
    });

  const settle = async (path, { keepDemoBar = false } = {}) => {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
      await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]');
    }
    if (!keepDemoBar) await strip();
  };

  /* Palette and theme come from the real controls, and a goto resets a
     hand-set data-theme, so both are set and then navigated away from. */
  const dress = async (theme) => {
    await settle('/settings');
    await page.locator('[data-palette-pick="trans"]').click();
    await page.locator(`[data-segment="${theme}"]`).click();
    await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
  };

  async function record(name, note, act, ms = SCENE_MS) {
    const frames = [];
    const started = Date.now();
    const onFrame = async ({ data, sessionId }) => {
      frames.push({ at: Date.now() - started, data });
      try {
        await cdp.send('Page.screencastFrameAck', { sessionId });
      } catch {
        /* The screencast was stopped between this frame and its ack, which
           is the ordinary way a scene ends. */
      }
    };
    cdp.on('Page.screencastFrame', onFrame);
    await page.evaluate(SAMPLER);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 55, everyNthFrame: 1 });
    await page.waitForTimeout(80);
    await act();
    await page.waitForTimeout(ms);
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);

    /* Read before the next navigation, and tolerant of one having happened:
       a scene that navigates loses the sampler with the document, and the
       frames are the authority there anyway. */
    const trace = await page
      .evaluate(() => {
        cancelAnimationFrame(window.__traceRaf);
        return window.__trace ?? [];
      })
      .catch(() => []);

    const written = [];
    for (const [i, frame] of frames.entries()) {
      const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
      await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
      written.push({ file, at: frame.at });
    }
    scenes.push({ name, note, frames: written, trace });
    console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms, ${trace.length} samples`);
  }

  /** A scene whose own control is not on this build is skipped rather than
      failing the run: this script is pointed at a detached worktree of main
      as its control, and three of the four things it records do not exist
      there yet. */
  const recordIfThere = async (selector, name, note, ms = SCENE_MS) => {
    const control = page.locator(selector).first();
    if (!(await control.count())) {
      console.warn(`${name}: no ${selector} on this build - skipped`);
      return;
    }
    await record(name, note, () => control.click(), ms);
  };

  for (const theme of themes) {
    const tag = reduce ? `${theme}-reduce` : theme;

    /* Every feature filled, which is the journal the audit's figure was
       measured on and the only one with letters and photographs to reach. */
    await settle('/', { keepDemoBar: true });
    await page.locator('[data-fill-every-feature]').click();
    await page.waitForURL('**/more', { timeout: 60000 });
    await dress(theme);

    /* The arrival, through the hub row rather than a goto: a goto reloads
       the document, runs no blind and leaves nothing to record. */
    await settle('/more');
    await page.waitForTimeout(500);
    await record(
      `arrive-${tag}`,
      'Safe space arriving from the More hub: the blind, the breath coming up, the ways down clipping open under it.',
      () => page.locator('[data-list-row="doubt"]').first().click()
    );

    await settle('/doubt');
    await page.waitForTimeout(700);
    await recordIfThere(
      '[data-breathing-toggle]',
      `breath-${tag}`,
      'The halo pressed: the exercise starting, the ring filling and the first phase word landing.',
      BREATH_MS
    );

    await settle('/doubt');
    await page.waitForTimeout(700);
    await recordIfThere(
      '[data-list-row="moments"]',
      `way-down-${tag}`,
      'The first tap down: off the breath and into the letters and photos.'
    );
  }

  await context.close();
}

try {
  await run({ reduce: false, themes: THEMES });
  /* The control, light only: what reduced motion substitutes is a fact
     about the clamp rather than about the palette, and a second theme of it
     doubles what a review page carries for nothing. */
  await run({ reduce: true, themes: ['light'] });
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2)
  );
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

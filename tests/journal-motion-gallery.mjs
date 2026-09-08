/* Frame-by-frame captures of the Journal door's month opening and closing
   (phase 10 redesign ticket 10).

   The one new interaction in the ticket is a travel, and a still cannot
   review a travel: what has to be checked is that no day is ever in neither
   place, that nothing under the month jumps while the days are still
   moving, and that the chevron turns over with them. So this records what
   the page actually painted - Chromium's own screencast, the same mechanism
   tests/panel-motion-gallery.mjs uses and for the same reason.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames
   and the millisecond each was painted at; tests/panel-motion-flipbook.mjs
   turns a directory of those into one embeddable bundle.

   Run: node tests/journal-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/journal-motion'));

/** The travel runs at --dur-slow (380ms); a scene twice that long shows it
    land and then hold still, which is what says it landed rather than
    stopped somewhere. */
const SCENE_MS = 900;
/* Tall enough that the entries under the month are in shot: what the height
   animation is for is that they travel with it rather than jumping when it
   is over. */
const VIEWPORT = { width: 390, height: 1100 };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
/* `reducedMotion: 'no-preference'` explicitly: headless Chromium answers
   the media query with `reduce`, the shell reads that into
   html[data-a11y-motion], and every primitive in $lib/motion cuts to zero -
   so without this the recording is of the app correctly refusing to
   animate. */
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});
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
const scenes = [];

const clearToasts = () =>
  page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });

/* Review chrome, half the viewport at 390px, and not in the build being
   signed off. Removed just before a scene rather than on arrival, because
   the demo bar is what seeds the journal. */
const stripChrome = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    const style = document.createElement('style');
    style.textContent =
      '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}';
    document.head.append(style);
  });

const settle = async (path) => {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await clearToasts();
};

async function record(name, note, act) {
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

const dress = async (palette, theme) => {
  await settle('/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/** Mood is its own hexes and its own five faces (ADR-0025); a dimension is
    where the bars and the cells are the flag's stripe. Both travel, and the
    faces are the harder case - they scale from a 7px bar to a 40px disc. */
const shadeBy = async (which) => {
  const value = await page.evaluate((wantMood) => {
    const select = document.getElementById('calendar-metric');
    if (!select) return null;
    const options = [...select.options].map((o) => o.value);
    return wantMood ? 'mood' : (options.find((v) => v !== 'mood') ?? 'mood');
  }, which === 'mood');
  if (!value) return;
  await page.selectOption('#calendar-metric', value);
  await page.waitForTimeout(400);
};

const arrive = async (metric) => {
  await settle('/calendar');
  await page.waitForSelector('[data-cal-open]');
  await shadeBy(metric);
  await stripChrome();
  /* Off the control, so no scene opens on a hover ground no phone has. */
  await page.mouse.move(4, 4);
  await page.waitForTimeout(300);
};

const toggle = () => page.locator('[data-cal-open]').click();

try {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);

  for (const theme of ['light', 'dark']) {
    await dress('trans', theme);

    await arrive('dimension');
    await record(
      `open-${theme}`,
      'The strip opening into the month: every day travels from its bar to its cell, and the entries under it move with the panel.',
      toggle
    );
    /* Closing from the state the scene above left, which is the same travel
       reversed - and the one where the days are moving into a row that is
       shorter than the panel they came from. */
    await page.mouse.move(4, 4);
    await page.waitForTimeout(400);
    await record(`close-${theme}`, 'And closing again.', toggle);

    if (theme !== 'light') continue;

    /* Mood: five drawn faces scaling out of a 7px bar. */
    await arrive('mood');
    await record('open-mood', 'On mood, where each cell is a drawn face rather than a fill.', toggle);

    /* And the narrow floor, where a bar is 7px wide and a cell is 34. */
    await page.setViewportSize({ width: 320, height: 1100 });
    await arrive('dimension');
    await record('open-320', 'At 320px, the narrowest the strip is drawn at.', toggle);
    await page.setViewportSize(VIEWPORT);
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

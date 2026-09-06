/* Frame-by-frame captures of Home's live panels arriving and leaving
   (phase 9 carpet ticket 04).

   A still cannot review a transition, and the three defects this ticket was
   filed for are all transitions: a pair of tiles yanking when one of them
   closes, panels snapping into place on the way back from the calendar, and
   a close that reads as one animation on one tile and a different one on
   its neighbour. So this records rather than photographs - Chromium's own
   screencast, which hands over real composited frames at the rate the page
   actually painted them, instead of a screenshot loop that would pause
   between frames it is trying to measure.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames
   and the millisecond each one was painted at. tests/panel-motion-flipbook.mjs
   turns a directory of those into one page.

   Run: node tests/panel-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npx vite build); it serves
   `build/` rather than building, so the same build can be recorded twice. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/panel-motion'));

/** Long enough to cover --dur-med (240ms) twice over, so a scene shows the
    animation and the stillness after it - which is what says the motion
    landed rather than stopping somewhere. */
const SCENE_MS = 800;
const THEMES = ['light', 'dark'];
/* Taller than a phone on purpose. The defects this records happen to the
   rows *below* the panel that changed, and a 844px viewport cuts the frame
   off above the look-back pair - so the recording would show a screen where
   nothing moved. The width stays at the 390px floor, which is the one that
   decides whether a pair is side by side at all. */
const VIEWPORT = { width: 390, height: 1340 };
/* And one pass wider than the floor. Below 390px `.kit-tiles` is one tile per
   line, so the only pair standing side by side on a phone is the look-back
   one - and that pair is deliberately not closable (ADR-0071). Above it the
   live-tile grid is two-up, which is where a dismissible tile actually has
   something beside it, and therefore the only place the row axis can be seen
   rather than unit-tested. Still short of 1024px, where the rail takes over
   and the column narrows again. */
const WIDE = { width: 700, height: 900 };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
/* `reducedMotion` explicitly, and it is the difference between a recording
   and a blank one: headless Chromium answers `prefers-reduced-motion: reduce`
   by default, the shell reads that media query into `html[data-a11y-motion]`
   (+layout.svelte), and every primitive in $lib/motion honours it by cutting
   to zero. So the first run of this script recorded the app correctly
   refusing to animate, which is a real state worth checking and not the one
   a motion review is for. */
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});
/* Toasts are the app working correctly and they are noise here: the storage
   warning fires on every load in headless Chromium, sits over the panels
   being recorded, and animates on a clock of its own that has nothing to do
   with what is being reviewed. Hidden rather than removed, because a toast
   removed from the DOM is one the app may put back mid-scene. */
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

/* The demo bar is review chrome, half the viewport at 390px, and not in the
   build being signed off - the same removal every gallery here makes. */
const stripDemoBar = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
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

/** Records everything the page paints for `SCENE_MS`, with `act` fired one
    frame in - so the first frame is the resting state the motion starts
    from rather than the middle of it. */
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 48, everyNthFrame: 1 });
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

/* Palette and theme come from the real controls, and a goto resets a
   hand-set data-theme, so both are set and then navigated away from. Always
   after the seeding: every demo jump re-applies the preference defaults. */
const dress = async (theme) => {
  await settle('/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction((want) => document.documentElement.dataset.theme === want, theme);
};

/** The close control of the first side-by-side live tile that has one.
    `data-rows` grids are the full-width today tier, which is the stacked
    case rather than the side-by-side one this looks for.

    Two selectors because Home draws a tile's close two ways: `.kit-tile-dismiss`
    is the corner X, and three tiles state theirs as an `action` carrying an x
    icon instead, which comes out as a soft button. Both are named here so the
    recording finds whichever pair the demo state actually produces. */
const pairedDismiss = () =>
  page
    .locator(
      '[data-live-tile-grid]:not([data-rows]) [data-tile] .kit-tile-dismiss,' +
        '[data-live-tile-grid]:not([data-rows]) [data-safe-space-nudge-dismiss],' +
        '[data-live-tile-grid]:not([data-rows]) [data-letter-dismiss],' +
        '[data-live-tile-grid]:not([data-rows]) [data-revisit-dismiss]'
    )
    .first();

try {
  for (const theme of THEMES) {
    /* Every area filled, which is what puts enough tiles on Home for a
       two-up pair to exist at all. The seeding resolves with a
       goto('/more'), so wait for that rather than navigating over a write
       still in flight. */
    await settle('/');
    await page.locator('[data-fill-every-feature]').click();
    await page.waitForURL('**/more');
    await dress(theme);

    await settle('/');
    await page.waitForSelector('[data-home-count]');
    await stripDemoBar();
    await page.waitForTimeout(400);

    const dismiss = pairedDismiss();
    if (await dismiss.count()) {
      await record(
        `close-stacked-${theme}`,
        'Closing a live tile at the 390px floor, where the grid is one tile per line.',
        () => dismiss.click()
      );
    } else {
      console.warn(`no dismissible live tile on Home (${theme}) - close scene skipped`);
    }

    /* Back from the calendar, which is the navigation the ticket names.
       Recorded from the moment the tab is tapped, so the scene holds the
       screen transition and whatever the panels do after it. */
    await settle('/');
    await stripDemoBar();
    await page.waitForTimeout(300);
    await page.goto(`${base}/calendar`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
    await stripDemoBar();
    await page.waitForTimeout(400);
    await record(
      `return-home-${theme}`,
      'Returning to Home from the calendar.',
      () => page.locator('[data-nav-item="home"]').first().click()
    );

    /* The row axis, at the one width where a dismissible tile has something
       beside it. Light only: the axis is a layout fact and does not change
       with the palette, and a second theme here would double the frames a
       review page has to carry for nothing. */
    if (theme !== 'light') continue;
    await page.setViewportSize(WIDE);
    await settle('/');
    await page.locator('[data-fill-every-feature]').click();
    await page.waitForURL('**/more');
    await settle('/');
    await page.waitForSelector('[data-home-count]');
    await stripDemoBar();
    await page.waitForTimeout(400);

    const wideDismiss = pairedDismiss();
    if (await wideDismiss.count()) {
      await record(
        'close-side-by-side',
        'Closing one of two live tiles standing side by side, at 700px.',
        () => wideDismiss.click()
      );
    } else {
      console.warn('no dismissible tile in the two-up grid - side-by-side scene skipped');
    }
    await page.setViewportSize(VIEWPORT);
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

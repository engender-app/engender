/* Frame-by-frame captures of the state changes redesign ticket 25 makes
   move on the surfaces the app already had (DIRECTION.md rule 10, ADR-0078).

   Seven movements, each recorded off the built app as Chromium's own
   screencast - the same mechanism tests/panel-motion-gallery.mjs and
   tests/lookback-motion-gallery.mjs use - because a still cannot review a
   transition and Alicja reviews motion frame by frame, naming frames:

   - the field carrying across a tab change, on all four doors;
   - a tile block clipping open, with its count counting up, as Home arrives
     and as the fold opens;
   - a section's rule drawing in ahead of its heading;
   - a tile folding away and the rows below closing up;
   - a notice leaving by its own height, where Home is showing one;
   - the segmented control's pill and the chosen label landing together, on
     the tally screen where the same tap re-ranges a chart.

   The last scenes run with reduced motion on, which is the ticket's own
   acceptance box: every movement clamps, and the flipbook shows the cut.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames
   and the millisecond each was painted at; tests/panel-motion-flipbook.mjs
   turns a directory of those into one embeddable bundle, one crop per call.
   Where a scene has something to measure rather than only to watch, the
   page samples it on every animation frame and the manifest carries the
   samples beside the frames.

   Run: node tests/state-motion-gallery.mjs [outDir] [--only a,b,c]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves the
   cwd's `build/`, so the same scenes can be recorded off another checkout
   by running it with that checkout as cwd. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const argv = process.argv.slice(2);
const onlyAt = argv.indexOf('--only');
const only = onlyAt >= 0 ? new Set(argv.splice(onlyAt, 2)[1].split(',')) : null;
const outDir = resolve(argv[0] ?? resolve(root, '.claude/state-motion'));

/** --dur-slow is 380ms and a stagger of five tiles adds 250; a scene of
    900ms shows the last block land and hold still. */
const SCENE_MS = 900;
/* Taller than a phone on purpose, as panel-motion-gallery.mjs is: the
   blocks that arrive on Home sit under the field and the foot, and a
   844px viewport would cut the flipbook off above the second tier. */
const VIEWPORT = { width: 390, height: 1200 };

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
      style.textContent =
        '[data-toast]{display:none !important}' +
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
  await page.evaluate(() => {
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
};

/* The demo bar is review chrome, half the viewport at 390px, and not in the
   build being signed off. Removed before a scene rather than in `settle`,
   because the seeding clicks a control on it. */
const strip = (page) =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
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

/** Every area filled, which is what puts a two-tier grid of tiles on Home
    and a dismissible one among them. The seeding resolves with a
    goto('/more'). */
const seed = async (page) => {
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1200);
};

/** Puts back every tile a scene closed: a close is a 24-hour snooze in
    localStorage (liveTilesSnooze.ts), so without this the next scene
    records a grid one tile smaller. */
const unsnoozeTiles = (page) =>
  page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('gender-diary-tile-snooze-') || key === 'letter_tile_snooze_until') {
        localStorage.removeItem(key);
      }
    }
  });

/** Starts sampling `read()` on every animation frame in the page, into
    window.__samples, from now until `stopSampling`. `read` is a function
    body as a string, evaluated in the page, returning a plain object. */
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

/** Records everything the page paints for SCENE_MS, with `act` fired one
    frame in, so the first frame is the resting state the motion starts
    from. `read`, if given, is sampled per animation frame across the same
    window and stored beside the frames. Sampling starts on the page that
    is there when the scene starts; a scene that navigates keeps the old
    document's loop only until it goes. */
async function record(page, cdp, name, note, act, read) {
  if (only && !only.has(name)) {
    await act();
    await page.waitForTimeout(SCENE_MS);
    return;
  }
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
  await page.waitForTimeout(SCENE_MS);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
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
  scenes.push({ name, note, frames: written, samples });
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms`);
}

const nav = (page, key) => page.locator(`[data-nav-item="${key}"]`).first().click();

/** Home, settled, with the demo bar gone and the pointer parked. */
const arriveHome = async (page) => {
  await settle(page, '/');
  await page.waitForSelector('[data-home-count]');
  await strip(page);
  await page.mouse.move(4, 4);
  await page.waitForTimeout(500);
};

/* What a scene measures, as page-side function bodies. */
const READ_SEGMENT = `
  const pill = document.querySelector('[data-segmented="tally-range"] .segment-pill');
  const active = document.querySelector('[data-segmented="tally-range"] .segment.is-active');
  const path = document.querySelector('.kit-chart svg path');
  const ps = pill ? getComputedStyle(pill) : null;
  return {
    pillX: ps ? ps.translate : null,
    pillW: ps ? ps.width : null,
    label: active ? getComputedStyle(active).color : null,
    d: path ? path.getAttribute('d').slice(0, 40) : null
  };`;

const READ_TILES = `
  const tiles = [...document.querySelectorAll('.kit-tiles .kit-tile')].slice(0, 3);
  return Object.fromEntries(tiles.map((tile, i) => {
    const value = tile.querySelector('.kit-tile-value');
    return ['tile' + i, { clip: getComputedStyle(tile).clipPath, value: value ? value.textContent : null }];
  }));`;

const READ_FIELD = `
  const field = document.querySelector('[data-screen-field], [data-home-field]');
  const box = field ? field.getBoundingClientRect() : null;
  return { top: box ? Math.round(box.top) : null, height: box ? Math.round(box.height) : null };`;

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await seed(page);
    await dress(page, 'trans', 'light');

    /* The doors. Recorded from the moment the tab is tapped: the field
       stays and its contents crossfade while the screens fade through
       behind it. Four taps round the ring, so every door is both the door
       left and the door arrived at. The arrival on Today is also the tiles
       clipping open, staggered, with their counts rising, and the agenda's
       rule drawing in under them. */
    await arriveHome(page);
    await record(page, cdp, 'door-today-journal', 'Today to Journal: the field stays put and changes its contents; the screens fade through behind it.', () => nav(page, 'calendar'), READ_FIELD);
    await page.waitForTimeout(300);
    await record(page, cdp, 'door-journal-lookback', 'Journal to Look back: the month strip on the field crossfades into the title, the two tiles clip open with the wrapped count rising, and the headings under them draw in, rule first.', () => nav(page, 'stats'), READ_TILES);
    await page.waitForTimeout(300);
    await record(page, cdp, 'door-lookback-transition', 'Look back to Transition: the title crossfades into the search box; the field is the one thing that does not fade through.', () => nav(page, 'settings'), READ_FIELD);
    await page.waitForTimeout(300);
    await record(page, cdp, 'door-transition-today', 'Transition to Today: the field grows to the sun\'s height and the wordmark arrives on it; under it the tiles clip open one after another and their counts rise.', () => nav(page, 'home'), READ_TILES);

    /* The fold: tiles arriving on a settled screen, which is the case the
       arrival window does not suppress - each opens its own height (the
       panel primitive) while its block clips open (this ticket). */
    await arriveHome(page);
    if (await page.locator('[data-home-tiles-fold]').count()) {
      await page.locator('[data-home-tiles-fold]').scrollIntoViewIfNeeded();
      await page.mouse.move(4, 4);
      await page.waitForTimeout(400);
      await record(page, cdp, 'tiles-unfold', 'The fold opened on Home: each tile opens its height and clips open from its left edge, one after another.', () => page.locator('[data-home-tiles-fold]').click(), READ_TILES);
    } else {
      console.warn('no fold on Home - unfold scene skipped');
    }

    /* A tile folding away: `collapse` gives its height back and the rows
       below close up with it. */
    await arriveHome(page);
    const dismiss = page.locator('[data-live-tile-grid] [data-tile-dismiss]').first();
    if (await dismiss.count()) {
      await dismiss.scrollIntoViewIfNeeded();
      await page.mouse.move(4, 4);
      await page.waitForTimeout(400);
      await record(page, cdp, 'tile-close', 'A live tile closed: it folds its own height away and the rows below close up with it.', () => dismiss.click());
      await unsnoozeTiles(page);
    } else {
      console.warn('no dismissible live tile on Home - close scene skipped');
    }

    /* A notice leaving by its own height, if Home is showing one it can
       dismiss. The demo journal has no stale backup, so this depends on
       what the seeding put on Home today. */
    await arriveHome(page);
    const noticeDismiss = page.locator('[data-notice] [data-notice-dismiss]').first();
    if (await noticeDismiss.count()) {
      await noticeDismiss.scrollIntoViewIfNeeded();
      await page.mouse.move(4, 4);
      await page.waitForTimeout(400);
      await record(page, cdp, 'notice-close', 'A notice dismissed: it closes its own height, ink square and all, and what is under it follows.', () => noticeDismiss.click());
    } else {
      console.warn('no dismissible notice on Home - notice scene skipped');
    }

    /* A notice arriving on a settled screen, and leaving it: the Transition
       door's search shows one when nothing matches. It opens its own
       height, ink square inside it, and closes it again when the query is
       cleared. */
    await settle(page, '/more');
    await page.waitForSelector('[data-hub-search]');
    await strip(page);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    await record(page, cdp, 'notice-arrive', 'Nothing matches the search on the Transition door: the notice opens its own height, with its ink square inside it from the first frame.', () => page.locator('[data-hub-search]').fill('zzqx'));
    await page.waitForTimeout(300);
    await record(page, cdp, 'notice-leave', 'The search cleared: the notice closes its own height and the rows return under it.', () => page.locator('[data-hub-search-clear]').click());

    /* The segmented control beside a chart it re-ranges, on one screen and
       with no navigation: the pill slides, the chosen label's colour lands
       with it, and the chart re-tweens from the same tap. */
    await settle(page, '/tally');
    await page.waitForSelector('[data-segmented="tally-range"]');
    await strip(page);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    const target = page.locator('[data-segmented="tally-range"] .segment:not(.is-active)').last();
    await record(page, cdp, 'segment-rerange', 'The tally range switched: the pill slides and stretches, the label turns page-coloured on the frame the ink reaches it, and the chart re-tweens from the same tap.', () => target.click(), READ_SEGMENT);

    await context.close();
  }

  /* The clamp. Every movement above, with reduce-motion on: the field
     crossfades over --dur-crossfade and nothing travels; blocks are simply
     there; the count is the final number. */
  {
    const { context, page, cdp } = await open('reduce');
    await seed(page);
    await dress(page, 'trans', 'light');
    await settle(page, '/more');
    await strip(page);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    await record(page, cdp, 'reduce-arrive-today', 'Transition to Today with reduce-motion set: the field crossfades over 120ms and does not travel; every block is at rest in the first frame; the counts show their final number.', () => nav(page, 'home'), READ_TILES);
    await arriveHome(page);
    const dismiss = page.locator('[data-live-tile-grid] [data-tile-dismiss]').first();
    if (await dismiss.count()) {
      await dismiss.scrollIntoViewIfNeeded();
      await page.mouse.move(4, 4);
      await page.waitForTimeout(400);
      await record(page, cdp, 'reduce-tile-close', 'The same close with reduce-motion set: the tile cuts.', () => dismiss.click());
    }
    await settle(page, '/tally');
    await page.waitForSelector('[data-segmented="tally-range"]');
    await strip(page);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    const target = page.locator('[data-segmented="tally-range"] .segment:not(.is-active)').last();
    await record(page, cdp, 'reduce-segment', 'The same range switch with reduce-motion set: pill, label and chart cut together.', () => target.click(), READ_SEGMENT);
    await context.close();
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

/* Frame-by-frame captures of the return moment's five movements (redesign
   ticket 35, DIRECTION.md rules 10 and 15, ADR-0078).

   The screen is nothing but arriving things, so every one of them is
   recorded rather than a signature moment: a still cannot review a
   transition, and Alicja reviews motion frame by frame, naming frames.

   - the items arriving, each row's block clipping open from its own left
     edge a stagger step after the row above;
   - an offer opening, the sheet rising from the bottom edge;
   - an answer landing, the sheet leaving as the write goes through;
   - an answered row leaving, giving its own height back with the rows
     under it closing up;
   - the empty state, which is what the space the last row gave back turns
     into.

   Then the same five with reduced motion set, which is the ticket's own
   acceptance box: everything clamps and the flipbook shows the cut.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames
   and the millisecond each was painted at, in the shape
   tests/panel-motion-flipbook.mjs reads. Where a scene has something to
   measure rather than only to watch, the page samples it on every
   animation frame and the manifest carries the samples beside the frames.

   Run: node tests/return-motion-gallery.mjs [outDir] [--only a,b,c]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves the
   cwd's `build/`, so the same scenes can be recorded off another checkout
   by running it with that checkout as cwd. */
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

/* The sheet's own travel, which is the offer opening and the answer
   landing: where its top edge is and how far the scrim has come up. */
const READ_SHEET = `
  const sheet = document.querySelector('.sheet');
  const scrim = document.querySelector('[data-sheet-scrim]') ?? sheet?.parentElement;
  return {
    open: !!sheet,
    sheetTop: sheet ? Math.round(sheet.getBoundingClientRect().top) : null,
    sheetTransform: sheet ? getComputedStyle(sheet).transform : null,
    scrimOpacity: scrim ? getComputedStyle(scrim).opacity : null
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

/** Everything the two contexts record, so the reduced-motion pass is the
    same five scenes rather than a second script's guess at them. */
async function scenesFor(page, cdp, tag, notes) {
  await seedGap(page);

  /* ---- the items arriving. Recorded from Home, because the arrival is a
     navigation: the field's blind carries the screen in and the rows'
     blocks clip open under it. ---- */
  await settle(page, '/');
  await page.waitForTimeout(600);
  await record(page, cdp, `${tag}arrive`, notes.arrive, () => enterStep(page), READ_ROWS);
  await page.waitForSelector('[data-coming-back-item="dose"]');

  /* ---- an offer opening. ---- */
  await page.waitForSelector('[data-coming-back-yes="dose"]');
  await record(
    page,
    cdp,
    `${tag}offer-open`,
    notes.offerOpen,
    () => page.locator('[data-coming-back-yes="dose"]').click(),
    READ_SHEET
  );

  /* ---- an answer landing: the site is tapped first, since the confirm is
     refused until one is, and the scene is the confirm itself. ---- */
  await page.locator('[data-site="thigh-left"]').first().click();
  await page.waitForTimeout(300);
  await record(
    page,
    cdp,
    `${tag}answer-lands`,
    notes.answerLands,
    () => page.locator('[data-coming-back-dose-confirm]').click(),
    READ_SHEET
  );

  /* ---- a row leaving. A decline rather than a write, so what the frames
     show is the row's own height and nothing else: the confirm above
     already recorded the write. ---- */
  await page.waitForSelector('[data-coming-back-yes="wear-session"]');
  await page.waitForTimeout(400);
  await record(
    page,
    cdp,
    `${tag}row-leaves`,
    notes.rowLeaves,
    () => page.locator('[data-coming-back-no="wear-session"]').click(),
    READ_ROWS,
    { cropOf: '[data-list-card]' }
  );

  /* ---- the empty state, arriving. Recorded as a navigation rather than
     as the last row leaving, because that is how it is actually reached:
     an arrival is a link to the screen that owns it and not an offer, so a
     list holding one cannot be answered down to nothing. What a person
     meets is the route opened with the journal holding nothing for them -
     which ADR-0062 says must draw rather than redirect - and what moves is
     the field's blind coming down to a step with no list under it.

     The gap is marked met by the visit above, so Home no longer opens the
     surface and the offers are answered; a plain navigation to the route
     is now the honest way in. ---- */
  await settle(page, '/');
  await page.waitForTimeout(600);
  await record(page, cdp, `${tag}empty`, notes.empty, () => enterStep(page), READ_ROWS);
}

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, '', {
      arrive:
        "The return moment arriving from Home: the field's blind comes down to the step's own height and each row's block clips open from its left edge, one --stagger-step after the row above. The words beside a block cut, as words do.",
      offerOpen: 'An offer opened: the sheet rises from the bottom edge and the withdrawal settles behind it.',
      answerLands:
        'The answer landed: the sheet leaves on the frame of the tap, the write goes through underneath it, and the row it was about is on its way out behind it.',
      rowLeaves:
        'A row answered with "Leave it running": it gives its own height back and the rows under it close up with it rather than jumping.',
      empty:
        "The route opened with nothing waiting: the blind comes down to a step that has no list under it, and the line says the true sentence. Reached this way rather than by answering the last row, because an arrival is a link and not an offer - a gap holding one cannot be answered down to nothing."
    });
    await context.close();
  }

  {
    const { context, page, cdp } = await open('reduce');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, 'reduce-', {
      arrive:
        'The same arrival with reduce-motion set: every block is whole in the first frame it is drawn, and the field crossfades rather than travelling.',
      offerOpen: 'The same offer with reduce-motion set: the sheet fades in where it stands.',
      answerLands: 'The same confirm with reduce-motion set: the sheet cuts.',
      rowLeaves: 'The same decline with reduce-motion set: the row cuts and the rows under it are already closed up in the next frame.',
      empty: 'The same arrival with reduce-motion set: the field crossfades and the line is in place in the first frame.'
    });
    await context.close();
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

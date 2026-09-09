/* Frame-by-frame captures of a sheet arriving and leaving (redesign ticket
   38, DIRECTION.md rule 10, ADR-0078).

   The sheet recorded is the dose offer on /coming-back, because that is the
   one Alicja read on ticket 35's flipbooks - "the popup should slide from
   below, not crossfade", "still happens with a yank between frame 1 and 2" -
   so a before/after pair on that exact sheet answers the note that was
   actually made rather than a sheet chosen to flatter the change.

   Six scenes:

   - open, the sheet rising from below the bottom edge;
   - close, it going back down past it;
   - drag-dismiss, a drag released past the threshold, which is where the
     exit has to carry on from where the finger left it;
   - tall, the same sheet in a 520px window, where `.sheet-drag`'s 85% cap
     bites and the sheet scrolls inside itself;
   - reduce-open and reduce-close, the substitute, which is a crossfade.

   Frames land as JPEGs plus a manifest.json in the shape
   tests/panel-motion-flipbook.mjs reads, and every scene samples the sheet's
   own geometry per animation frame beside them: a recording shows the sheet
   moved, the samples say by how much between which two frames.

   Run: node tests/sheet-motion-gallery.mjs [outDir] [--only a,b,c]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). preview() serves
   the cwd's .svelte-kit/output, so a "before" set is recorded by running
   this with a checkout of main as the cwd, never by swapping build/. */
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
const outDir = resolve(argv[0] ?? resolve(root, '.claude/sheet-motion'));

/** --dur-med is 240ms and the scrim settles with it; 700ms shows the sheet
    arrive and hold still, which is what says the motion ended where it was
    supposed to. */
const SCENE_MS = 700;
const VIEWPORT = { width: 390, height: 844 };
/** The tall case: 520px of window against a sheet that wants more, so
    `.sheet-drag`'s `max-height: 85%` is what decides the travel. */
const SHORT_VIEWPORT = { width: 390, height: 520 };
/** The band a flipbook keeps: the bottom 600px of the phone, which holds the
    sheet at rest, the whole of its travel and the edge it leaves by. The
    header and the flag sun above it never move in any of these scenes. */
const BAND = { top: 244, height: 600 };
const SHORT_BAND = { top: 0, height: SHORT_VIEWPORT.height };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];

/** One browser context per motion setting and per window size: headless
    Chromium answers prefers-reduced-motion with `reduce` by default, and the
    app's own state lives in the context, so each one seeds its own journal. */
async function open(reducedMotion, viewport = VIEWPORT, extraCss = '') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion });
  await context.addInitScript((extra) => {
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      /* The demo bar is review chrome and not in the build being signed off;
         the body class it sets makes the frame a flex column, so that goes
         with it. */
      style.textContent =
        '[data-toast]{display:none !important}' +
        '.demo-bar{display:none !important}' +
        'body.has-demo-bar{display:block !important;height:auto !important}' +
        '[data-app-scroll-region]{scrollbar-width:none}[data-app-scroll-region]::-webkit-scrollbar{display:none}' +
        extra;
      document.head.append(style);
    });
  }, extraCss);
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

const dress = async (page, palette, theme) => {
  await settle(page, '/settings');
  await page.locator(`[data-palette-pick="${palette}"]`).click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    [palette, theme]
  );
};

/** Five weeks away, which is what puts the offers on the return moment. The
    demo bar's own button, dispatched rather than clicked because the
    stylesheet above hides the bar and Playwright refuses to click what it
    cannot see. */
const seedGap = async (page) => {
  await settle(page, '/');
  await page.locator('[data-fill-coming-back]').dispatchEvent('click');
  await page.waitForURL('**/coming-back', { timeout: 180000 });
  await page.waitForSelector('[data-coming-back-item="dose"]');
  await page.waitForTimeout(1200);
};

/* What a sheet's motion is, per animation frame.

   `top` is the edge Alicja reads off the flipbook. `travel` is that edge
   against the frame's own bottom, which is the number the ticket is about -
   a sheet's travel is its own height, so the two are the same at rest and
   only the first one is visible in a screenshot. The scrim's opacity and the
   withdrawal's blur ride the same clock and are read here to prove they
   settle with the sheet rather than before or after it. `dragOffset` is the
   wrapper's own transform, which is what the exit has to carry on from. */
const READ_SHEET = `
  const sheet = document.querySelector('.sheet');
  const scrim = document.querySelector('[data-sheet-scrim]');
  const drag = document.querySelector('[data-sheet-drag]');
  const tint = document.querySelector('[data-sheet-tint]');
  const frame = scrim ? scrim.getBoundingClientRect() : null;
  const box = sheet ? sheet.getBoundingClientRect() : null;
  const matrix = (el) => {
    if (!el) return 0;
    const t = getComputedStyle(el).transform;
    const m = /matrix\\(([^)]+)\\)/.exec(t);
    return m ? Math.round(parseFloat(m[1].split(',')[5])) : 0;
  };
  return {
    open: !!sheet,
    top: box ? Math.round(box.top) : null,
    height: box ? Math.round(box.height) : null,
    below: box && frame ? Math.round(frame.bottom - box.top) : null,
    sheetShift: matrix(sheet),
    dragOffset: matrix(drag),
    scrimOpacity: tint ? Number(getComputedStyle(tint).opacity).toFixed(3) : null,
    withdraw: tint ? getComputedStyle(tint).backdropFilter : null
  };`;

/** Records everything the page paints for SCENE_MS, with `act` fired one
    frame in, so the first frame is the resting state the motion starts
    from. */
async function record(page, cdp, name, note, act, options = {}) {
  const sceneMs = options.ms ?? SCENE_MS;
  if (only && !only.has(name)) {
    await act();
    await page.waitForTimeout(sceneMs);
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
  await startSampling(page, READ_SHEET);
  await act();
  await page.waitForTimeout(sceneMs);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  let samples;
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
  scenes.push({ name, note, frames: written, samples, crop: options.crop ?? BAND });
  const travel = samples.filter((s) => s.top !== null).map((s) => s.top);
  const span = travel.length ? `${Math.min(...travel)} to ${Math.max(...travel)}px` : 'no sheet';
  console.log(`${name}: ${written.length} frames over ${written.at(-1)?.at ?? 0}ms, top edge ${span}`);
}

/** The offer, opened. The dose row's yes is the button ticket 35 recorded. */
const openOffer = (page) => page.locator('[data-coming-back-yes="dose"]').click();

/** A drag released past `DISMISS_DISTANCE`, in steps, so the pointer moves
    across frames the way a finger does rather than teleporting. The grab
    starts on the sheet's handle, which is above every field in it - a drag
    that starts on an input is refused by design. */
async function dragDismiss(page) {
  const handle = await page.locator('.sheet-handle').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2 + i * 20);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}

async function scenesFor(page, cdp, tag, notes, options = {}) {
  await seedGap(page);
  await page.waitForSelector('[data-coming-back-yes="dose"]');

  const crop = options.crop;

  await record(page, cdp, `${tag}open`, notes.open, () => openOffer(page), { crop });
  await page.waitForSelector('[data-sheet]');

  /* Cancel, the sheet's own second control - a close rather than an answer,
     so nothing behind the sheet moves and the frames are the sheet alone. */
  await record(
    page,
    cdp,
    `${tag}close`,
    notes.close,
    () => page.locator('[data-sheet] .btn-ghost').click(),
    { crop }
  );
  await page.waitForTimeout(300);

  if (options.drag !== false) {
    await openOffer(page);
    await page.waitForSelector('[data-sheet]');
    await page.waitForTimeout(600);
    await record(page, cdp, `${tag}drag-dismiss`, notes.dragDismiss, () => dragDismiss(page), {
      crop
    });
  }
}

try {
  {
    const { context, page, cdp } = await open('no-preference');
    await dress(page, 'trans', 'light');
    await scenesFor(page, cdp, '', {
      open: 'The offer opening: the sheet comes up from below the bottom edge, travelling its own height, and the scrim and the withdrawal behind it settle on the same clock.',
      close:
        'The offer closing: the sheet goes back down past the bottom edge rather than fading where it stands.',
      dragDismiss:
        'A drag released past the threshold: the exit carries the sheet on from where the finger left it, down past the edge, with the drag offset on the wrapper and the transition on the sheet inside it.'
    });
    await context.close();
  }

  {
    const { context, page, cdp } = await open('no-preference', SHORT_VIEWPORT);
    await dress(page, 'trans', 'light');
    await scenesFor(
      page,
      cdp,
      'tall-',
      {
        open: 'The same sheet in a 520px window, where it is taller than the space it has: `.sheet-drag` caps it at 85% and it scrolls inside itself, so the travel is the box that is actually rendered.',
        close: 'The capped sheet leaving, still by the height it was drawn at.'
      },
      { drag: false, crop: SHORT_BAND }
    );
    await context.close();
  }

  {
    const { context, page, cdp } = await open('reduce');
    await dress(page, 'trans', 'light');
    await scenesFor(
      page,
      cdp,
      'reduce-',
      {
        open: 'The same opening with reduce-motion set: the substitute is a crossfade, so the sheet appears where it stands and nothing travels.',
        close: 'The same closing with reduce-motion set: a crossfade out, not a cut.'
      },
      { drag: false }
    );
    await context.close();
  }
  /* The one number this ticket had to pick without a reference to read it
     off: how long a travel of a whole sheet's height should take. --dur-med
     is what shipped, and the same two scenes at --dur-slow are recorded
     beside it so the choice is made on frames rather than on an argument.
     The token is overridden in the page, so this is the built app running
     its own transition at the other duration rather than a second build. */
  {
    const { context, page, cdp } = await open('no-preference', VIEWPORT, ':root{--dur-med:380ms}');
    await dress(page, 'trans', 'light');
    await scenesFor(
      page,
      cdp,
      'slow-',
      {
        open: 'The same rise with --dur-slow in place of --dur-med: 380ms for the same 717px, which is about 40px between frames at the peak instead of about 110.',
        close: 'The same close at --dur-slow.'
      },
      { drag: false }
    );
    await context.close();
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

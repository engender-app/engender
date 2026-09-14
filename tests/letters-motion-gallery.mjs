/* The opening, frame by frame (phase 10 redesign ticket 45).

   A letter opening is the one movement this ticket adds, and the ticket asks
   for it as a flipbook with frame numbers and millisecond stamps rather than
   as a recording watched at speed. So each scene is Chromium's screencast of
   the whole viewport plus a rAF loop in the page reading the properties the
   movement actually animates, and the manifest carries the two together.

   What is measured, and why those properties: the card's own height, which
   is what `resize` animates when the letter unrolls; the text element's
   height under it; and, for the arrival, the clip the whole surface is
   uncovered by. A yank is then arithmetic rather than an opinion - a height
   that jumps from one sample to the next with nothing between them, or a
   frame in which the card is at neither its folded nor its open size.

   Four scenes and their clamps: a letter unfolding in the list, the same one
   folding shut, the arrival covering the screen, and the letter opening
   inside the arrival.

   Run: VITE_DEMO=1 npm run build   first, then
        node tests/letters-motion-gallery.mjs [outDir]
   then tests/panel-motion-flipbook.mjs to bundle it for a review page. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/letters-motion'));

/** --dur-slow is 380 and `resize` runs on --dur-med; 1100 shows the longest
    of them land and then hold still, which is what proves it settled. */
const SCENE_MS = 1100;
/* Taller than a phone on purpose: an unfolded letter is longer than 844px
   and a flipbook that cuts it off cannot show where it stopped growing. */
const VIEWPORT = { width: 390, height: 1200 };

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];

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

const strip = (page) =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });

const dress = async (page, theme) => {
  await settle(page, '/settings');
  await page.locator('[data-palette-pick="trans"]').click();
  await page.locator(`[data-segment="${theme}"]`).click();
  await page.waitForFunction(
    ([p, t]) => document.documentElement.dataset.palette === p && document.documentElement.dataset.theme === t,
    ['trans', theme]
  );
};

const seed = async (page) => {
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1200);
};

/** A letter dated today, through the screen's own compose sheet, which is
    what the arrival needs and what the demo persona does not ship. */
const writeLetterForToday = async (page, text) => {
  await settle(page, '/transition/letters');
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-save-letter]');
  await page.locator('textarea.input').fill(text);
  await page.evaluate(() => {
    const el = document.querySelector('#letter-unlock');
    const fp = el?._flatpickr ?? el?.flatpickr;
    if (!fp) throw new Error('no flatpickr instance on #letter-unlock');
    fp.setDate(new Date(), true);
  });
  await page.locator('[data-save-letter]').click();
  await page.waitForTimeout(800);
};

/* What each scene measures, as page-side function bodies. Heights, because
   height is what every one of these movements animates, and the clip on the
   arrival, because that is what uncovers it. */
const READ_CARD = `
  const card = document.querySelector('[data-letter-state]:has([data-letter-open])');
  const text = card ? card.querySelector('.letter-text') : null;
  const ready = card ? card.querySelector('.letter-ready') : null;
  const shut = card ? card.querySelector('[data-letter-close]') : null;
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null);
  const top = (el) => (el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null);
  return { cardH: h(card), cardTop: top(card), textH: h(text), readyH: h(ready), shutH: h(shut) };`;

const READ_ARRIVAL = `
  const surface = document.querySelector('[data-letter-arrival]');
  const card = surface ? surface.querySelector('[data-letter-state]') : null;
  const text = card ? card.querySelector('.letter-text') : null;
  const past = surface ? surface.querySelector('[data-letter-past]') : null;
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height * 10) / 10 : null);
  return {
    clip: surface ? getComputedStyle(surface).clipPath : null,
    opacity: surface ? getComputedStyle(surface).opacity : null,
    cardH: h(card),
    textH: h(text),
    pastH: h(past)
  };`;

/** Records everything the page paints for SCENE_MS, with `act` fired one
    frame in, so the first frame is the resting state the motion starts from. */
async function record(page, cdp, name, note, act, read, options = {}) {
  const sceneMs = options.ms ?? SCENE_MS;
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

try {
  for (const motion of ['no-preference', 'reduce']) {
    const tag = motion === 'reduce' ? 'reduce-' : '';
    const { context, page, cdp } = await open(motion);
    await seed(page);
    await dress(page, 'light');

    /* ---------- the list: a letter unfolding, and folding shut ---------- */
    await settle(page, '/transition/letters');
    await page.waitForSelector('[data-letter-open]');
    await strip(page);
    await page.locator('[data-letter-open]').last().scrollIntoViewIfNeeded();
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);

    await record(
      page,
      cdp,
      `${tag}unfold`,
      motion === 'reduce'
        ? 'A letter opened with reduce-motion set: the card is at its open height in the frame after the tap, which is tier 3\'s substitute - a change inside a screen has no journey a fade could stand in for.'
        : 'A letter opened in the list: the same paragraph loses its two-line clamp and the card grows to the whole letter over --dur-med, with the way out arriving under it.',
      () => page.locator('[data-letter-open]').last().click(),
      READ_CARD
    );

    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);
    await record(
      page,
      cdp,
      `${tag}fold`,
      'The same letter folded shut: the card gives its height back and the way out collapses with it.',
      () => page.locator('[data-letter-close]').click(),
      READ_CARD
    );

    /* ---------- the arrival: covering the screen, then opening ---------- */
    await writeLetterForToday(
      page,
      'You made it to today. I remember picking this date and not really believing in it, and here you are reading it.'
    );
    await settle(page, '/more');
    await strip(page);
    await page.mouse.move(4, 4);
    await page.waitForTimeout(500);

    await record(
      page,
      cdp,
      `${tag}arrival`,
      motion === 'reduce'
        ? 'The arrival with reduce-motion set: the surface crossfades over --dur-crossfade rather than being uncovered, which is the substitute its contract asks for, and nothing cuts.'
        : 'A letter whose day is today, met on the way into the letters screen: the whole surface is uncovered from the top edge down over --dur-slow, field and page as one sheet.',
      () => page.locator('[data-nav-item="transition"]').first().click().then(() => page.locator('[data-hub-row="letters"]').click().catch(() => page.goto(`${base}/transition/letters`))),
      READ_ARRIVAL,
      { ms: 1600 }
    );

    await page.waitForSelector('[data-letter-arrival]');
    await page.mouse.move(4, 4);
    await page.waitForTimeout(600);
    await record(
      page,
      cdp,
      `${tag}arrival-open`,
      'The letter opened where it arrived: the ink bar gives its height back as the letter unrolls into the same place, and the way past collapses with it.',
      () => page.locator('[data-letter-arrival] [data-letter-open]').click(),
      READ_ARRIVAL
    );

    await context.close();
  }
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2));
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

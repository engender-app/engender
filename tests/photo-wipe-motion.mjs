/* What the wipe's divider does between frames (phase 10 redesign ticket 55).

   The ticket's clause is mechanical rather than aesthetic: the divider
   never jumps on grab or release, nothing is painted at its destination
   before it travelled there, and nothing appears in one frame. Those are
   numbers, so this reads them - a rAF loop samples where the divider was
   actually painted and how far the earlier photograph is clipped, on every
   animation frame - and Chromium's screencast records the same window, so
   the frames a number accuses can be looked at rather than argued about.

   Four scenes:

     grab      a finger goes down 18px off the divider's centre and holds
               still. The divider must not move at all: the drag moves it
               by how far the pointer has travelled since the grab, not to
               wherever the pointer is.
     drag      the same finger walks the divider left across the frame, one
               small move per frame, and lets go. Every frame carries part
               of the journey and the release changes nothing.
     key       one press of ArrowLeft. The divider walks the 5% rather than
               cutting to it, which is what registering --wipe-at buys.
     swap      one press of the earlier side's "one further on". The
               photograph crossfades on a frame that stays where it is.

   Run against a demo build:
     VITE_DEMO=1 npm run build
     node tests/photo-wipe-motion.mjs [outDir]

   Exits non-zero when a scene fails its own arithmetic, so it is a check
   and not only a flipbook. Frames and a manifest land in outDir. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/photo-wipe-motion'));

const PHONE = { width: 390, height: 844 };

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const page = await browser.newPage({ viewport: PHONE });
const cdp = await page.context().newCDPSession(page);

const scenes = [];
const failures = [];

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 30000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
}

/** The demo bar is how the journal gets seeded, so it comes off only once
    the seeding is done and a scene is about to be recorded. */
const strip = () =>
  page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });

/** Where the divider was painted this frame, how far the earlier plate is
    clipped, and which photograph each side is showing. The box, not the
    custom property: what the ticket asks is where the line actually
    landed. */
const READ = `
  const handle = document.querySelector('[data-wipe-handle]');
  const earlier = document.querySelector('.wipe-plate.is-earlier');
  if (!handle) return { there: false };
  const box = handle.getBoundingClientRect();
  const images = earlier ? [...earlier.querySelectorAll('img')] : [];
  return {
    there: true,
    x: Math.round((box.x + box.width / 2) * 10) / 10,
    clip: earlier ? getComputedStyle(earlier).clipPath : null,
    /* Every photograph on the earlier plate this frame, not just the first:
       a crossfade is two of them at once, and a frame with none of them is
       the yank this scene exists to catch. */
    images: images.length,
    opacity: images.map((image) => Math.round(Number(getComputedStyle(image).opacity) * 100) / 100),
    srcs: images.map((image) => image.currentSrc.slice(-8))
  };
`;

/** Records the window `act` starts, sampling every animation frame and the
    screencast every painted one - the shape tests/noticed-axis-motion.mjs
    uses. */
async function record(name, note, act, ms = 700) {
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  await startSampling(page, READ);
  await act();
  await page.waitForTimeout(ms);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const samples = await stopSampling(page);

  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  scenes.push({ name, note, frames: written, samples });
  console.log(`${name}: ${written.length} frames, ${samples.length} samples`);
  return samples;
}

/** Where the divider is right now, outside any sampling loop. */
const dividerX = () =>
  page.evaluate(() => {
    const box = document.querySelector('[data-wipe-handle]').getBoundingClientRect();
    return Math.round((box.x + box.width / 2) * 10) / 10;
  });

const complain = (scene, line) => failures.push(`${scene}: ${line}`);

/** A travel: at least `least` frames part-way, and no frame carrying more
    than `step` of the whole journey. */
function travels(scene, samples, { least = 3, step = 0.5 }) {
  const seen = samples.filter((s) => s.there);
  if (seen.length < least) {
    complain(scene, `${seen.length} frame(s) with the divider in them, which is not a journey`);
    return;
  }
  const from = seen[0].x;
  const to = seen[seen.length - 1].x;
  const span = Math.abs(to - from);
  if (span < 1) {
    complain(scene, `the divider ended where it started (${from}px), so nothing was measured`);
    return;
  }
  const middles = seen.filter((s) => Math.abs(s.x - from) > 1 && Math.abs(s.x - to) > 1).length;
  if (middles < least - 2) {
    complain(scene, `${middles} frame(s) between ${from}px and ${to}px, which is a cut rather than a travel`);
  }
  for (const [i, s] of seen.entries()) {
    const next = seen[i + 1];
    if (!next) continue;
    if (Math.abs(next.x - s.x) / span > step) {
      complain(
        scene,
        `${Math.round((Math.abs(next.x - s.x) / span) * 100)}% of the journey in one frame, ${s.x}px to ${next.x}px between ${s.t}ms and ${next.t}ms (frames ${i} and ${i + 1})`
      );
    }
  }
}

/** A crossfade on a surface that stays put: the photograph changes, its
    opacity has middle frames, and the frame itself does not move while it
    happens. */
function crossfades(scene, samples) {
  const seen = samples.filter((s) => s.there);
  const sources = [...new Set(seen.flatMap((s) => s.srcs))];
  if (sources.length < 2) {
    complain(scene, `the photograph never changed (${sources.length} source(s) seen)`);
    return;
  }

  /* The rule in its own words: no frame with the plate holding neither
     photograph. */
  const empty = seen.map((s, i) => [i, s]).filter(([, s]) => s.images === 0);
  if (empty.length) {
    complain(
      scene,
      `${empty.length} frame(s) with no photograph at all, at ${empty.map(([i, s]) => `${s.t}ms (frame ${i})`).join(', ')}`
    );
  }

  const overlapping = seen.filter((s) => s.images > 1).length;
  if (overlapping < 2) {
    complain(scene, `${overlapping} frame(s) with both photographs up, which is a cut rather than a crossfade`);
  }

  const middles = seen.filter((s) => s.opacity.some((o) => o > 0.02 && o < 0.98)).length;
  if (middles < 2) {
    complain(scene, `${middles} frame(s) part-way through the fade, which is a cut rather than a crossfade`);
  }

  const xs = seen.map((s) => s.x);
  if (Math.max(...xs) - Math.min(...xs) > 1) {
    complain(scene, `the divider moved ${Math.max(...xs) - Math.min(...xs)}px while the photograph changed`);
  }
}

try {
  await settle('/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1500);

  /* The compare view, reached the way a person reaches it: two cells
     picked in the grid, then the Compare segment. */
  await settle('/media/photos');
  await page.waitForSelector('[data-photo-cell] img');
  const cells = page.locator('[data-photo-cell]');
  await cells.nth(0).click();
  await cells.nth(3).click();
  await page.locator('[data-segment="compare"]').click();
  await page.waitForSelector('[data-photo-wipe] .wipe-photo');
  await strip();
  await page.waitForTimeout(600);

  const handle = await page.locator('[data-wipe-handle]').boundingBox();
  const grabX = handle.x + handle.width / 2 + 18;
  const grabY = handle.y + handle.height / 2;

  /* 1. Grab. Off centre on purpose, and held still. */
  const before = await dividerX();
  await record('grab', 'a finger goes down 18px off the divider and holds still', async () => {
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.waitForTimeout(250);
  }, 120);
  const afterGrab = await dividerX();
  if (Math.abs(afterGrab - before) > 0.5) {
    complain('grab', `the divider jumped ${Math.round((afterGrab - before) * 10) / 10}px on the grab`);
  }

  /* 2. Drag, one small move per frame, then let go. */
  const dragSamples = await record('drag', 'the same finger walks the divider left, then lets go', async () => {
    for (let i = 1; i <= 24; i += 1) {
      await page.mouse.move(grabX - i * 5, grabY);
      await page.waitForTimeout(16);
    }
  }, 120);
  travels('drag', dragSamples, { least: 8, step: 0.35 });
  const beforeRelease = await dividerX();
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterRelease = await dividerX();
  if (Math.abs(afterRelease - beforeRelease) > 0.5) {
    complain('drag', `the divider jumped ${Math.round((afterRelease - beforeRelease) * 10) / 10}px on the release`);
  }

  /* 3. One arrow key. The 5% is a travel, not a cut. */
  await page.locator('[data-wipe-handle]').focus();
  const keySamples = await record('key', 'one press of ArrowLeft', async () => {
    await page.keyboard.press('ArrowLeft');
  }, 500);
  travels('key', keySamples, { least: 4, step: 0.6 });

  /* 4. The earlier side steps on, and the photograph changes on a frame
        that stays where it is. End first, so the earlier plate is the whole
        frame and the fade is not happening inside a sliver. */
  await page.keyboard.press('End');
  await page.waitForTimeout(500);
  const swapSamples = await record('swap', 'the earlier photograph steps one further on', async () => {
    await page.locator('[data-wipe-forward="left"]').click();
  }, 900);
  crossfades('swap', swapSamples);
} catch (error) {
  failures.push(`the run itself: ${String(error)}`);
} finally {
  await writeFile(
    resolve(outDir, 'scenes.json'),
    JSON.stringify({ scenes, failures }, null, 2) + '\n'
  );
  await page.close();
  await browser.close();
  await app.close();
}

console.log(JSON.stringify({ outDir, failures }, null, 2));
if (failures.length) process.exitCode = 1;

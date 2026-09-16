/* The playhead, frame by frame (phase 10 redesign ticket 46).

   Two things have to be proved about a transport this app draws itself, and
   neither is provable from a still or from watching a recording at speed:

   1. The playhead does not jump - not when playback starts, not while a
      finger is dragging it, and not when that finger comes off. A native
      `<audio>` updated its own scrubber; this one is driven by the app, and
      the ordinary way to get it wrong is to follow `timeupdate`, which fires
      about four times a second and paints a playhead that stands still for
      250ms and then teleports.
   2. Nothing appears, disappears or moves in one frame anywhere in the
      player (the standing motion clause).

   So this records what the page actually painted - Chromium's own
   screencast, the same mechanism the other motion galleries use - and, on
   the same clock, samples the two properties the drawing moves on: the
   playhead's own translate and the inset the played bars are clipped to.
   The samples say where to look; the frames are what is looked at. A rAF
   sampler reads before a ResizeObserver callback in the same frame, so the
   pixels remain the authority and the samples only describe the curve.

   Frames land as JPEGs plus a manifest.json naming each scene, its frames
   and the millisecond each was painted at, in the shape
   tests/panel-motion-flipbook.mjs already bundles.

   Run: node tests/media-transport-motion.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). */
import { preview } from 'vite';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { mediaFixtures } from './media-fixtures.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/media-transport-motion'));

/** Long enough that a scene shows the movement and then holds still, which
    is what says it landed rather than stopped somewhere. */
const SCENE_MS = 1000;
const VIEWPORT = { width: 390, height: 900 };

const media = await mediaFixtures(resolve(root, '.claude/media-fixtures'));
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
/* `reducedMotion: 'no-preference'` explicitly: headless Chromium answers
   the media query with `reduce`, the shell reads that into
   html[data-a11y-motion], and every primitive in $lib/motion cuts to zero. */
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference'
});
const page = await context.newPage();
page.on('pageerror', (e) => console.error('page error:', e.message));
const cdp = await context.newCDPSession(page);

const scenes = [];
const findings = [];

const settle = async (path) => {
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
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
  });
};

const importFile = async (trigger, file, mimeType) => {
  const chooser = page.waitForEvent('filechooser');
  await page.locator(trigger).click();
  await (await chooser).setFiles({
    name: file.split('/').pop(),
    mimeType,
    buffer: await readFile(file)
  });
};

/** Starts a sampler that reads, every animation frame, where the playhead
    of `which` transport is and how far its played bars are clipped. Both
    come off the painted styles rather than off the component's state, so a
    frame the app thought it drew and did not shows up as a flat sample. */
const startSampler = async (which) => {
  await page.evaluate((index) => {
    window.__samples = [];
    const read = () => {
      /* Looked up per frame rather than once: the arrival scene starts
         before the player exists, which is the whole thing it records. */
      const transport = document.querySelectorAll('[data-transport]')[index];
      const head = transport?.querySelector('.transport-head');
      const scrub = transport?.querySelector('[data-transport-scrub]');
      if (!head || !scrub) {
        window.__samplerFrame = requestAnimationFrame(read);
        return;
      }
      const box = scrub.getBoundingClientRect();
      const headBox = head.getBoundingClientRect();
      window.__samples.push({
        at: Math.round(performance.now()),
        /* Where the head is painted, as a fraction of the track it runs
           along - the one number both the line and the colour boundary are
           drawn from. */
        head: box.width > 0 ? (headBox.left - box.left) / box.width : 0,
        played: getComputedStyle(scrub).getPropertyValue('--played').trim(),
        width: Math.round(box.width)
      });
      window.__samplerFrame = requestAnimationFrame(read);
    };
    window.__samplerFrame = requestAnimationFrame(read);
  }, which);
};

const stopSampler = async () => {
  return page.evaluate(() => {
    cancelAnimationFrame(window.__samplerFrame);
    return window.__samples;
  });
};

async function record(name, note, which, act) {
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between this frame and its ack, which is how a scene ends. */
    }
  };
  cdp.on('Page.screencastFrame', onFrame);
  await startSampler(which);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  await page.waitForTimeout(80);
  await act();
  await page.waitForTimeout(SCENE_MS);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const samples = await stopSampler();

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

/** The biggest single-frame move the playhead made, as a fraction of the
    track, ignoring frames longer than 40ms (a dropped frame under a
    headless screencast is the recorder's, not the app's). */
function biggestStep(samples, from = 0) {
  let worst = { step: 0, at: 0, index: 0 };
  for (let i = Math.max(1, from); i < samples.length; i++) {
    const gap = samples[i].at - samples[i - 1].at;
    if (gap > 40) continue;
    const step = Math.abs(samples[i].head - samples[i - 1].head);
    if (step > worst.step) worst = { step, at: samples[i].at, index: i, gap };
  }
  return worst;
}

const judge = (name, worst, ceiling, what) => {
  const verdict = worst.step <= ceiling ? 'ok' : 'JUMP';
  findings.push({ scene: name, what, biggestStepPct: +(worst.step * 100).toFixed(2), atMs: worst.at, frame: worst.index, ceilingPct: ceiling * 100, verdict });
  console.log(
    `  ${verdict}: ${what} - biggest single-frame move ${(worst.step * 100).toFixed(2)}% of the track (ceiling ${(ceiling * 100).toFixed(1)}%), at ${worst.at}ms`
  );
};

try {
  await settle('/entry/new/today');
  await page.waitForSelector('[data-add-recording-file]');
  await importFile('[data-add-recording-file]', media.voice, 'audio/webm');
  await page.waitForSelector('[data-transport]');
  await page.waitForTimeout(1200);

  /* 1. The recording starting. A 7-second recording across a ~150px track
     moves about 0.014 of the track per 60Hz frame, so anything above a
     percent and a half in one frame is the playhead being repainted at a
     new place rather than travelling to it - which is what following
     `timeupdate` looks like (four steps a second of about 3.5% each). */
  const startAudio = await record(
    'audio-start',
    'A recording starting: the playhead leaves zero and travels, and the play control crossfades into a pause rather than cutting.',
    0,
    async () => {
      await page.locator('[data-transport-toggle]').first().click();
    }
  );
  judge('audio-start', biggestStep(startAudio), 0.015, 'the playhead on start');

  /* 2. A drag across the track and the release. The drag is the finger's
     own movement, so what is measured is the release: the playhead must
     stay where the finger left it rather than snapping back for a frame
     while the element seeks. */
  const scrubBox = await page.locator('[data-transport-scrub]').first().boundingBox();
  const dragScene = await record(
    'audio-scrub',
    'Dragging the playhead from about a fifth of the way in to about three quarters, and letting go: it follows the finger, and stays where it was left.',
    0,
    async () => {
      await page.mouse.move(scrubBox.x + scrubBox.width * 0.2, scrubBox.y + scrubBox.height / 2);
      await page.mouse.down();
      for (let step = 2; step <= 11; step++) {
        await page.mouse.move(
          scrubBox.x + scrubBox.width * (0.2 + 0.05 * step),
          scrubBox.y + scrubBox.height / 2
        );
        await page.waitForTimeout(24);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
  );
  /* Only the frames after the release, which is the second half of the
     scene: during the drag the playhead is meant to move as fast as the
     finger does. */
  const releaseAt = dragScene.findIndex((s, i) => i > 0 && s.at > dragScene[0].at + 500);
  judge('audio-scrub', biggestStep(dragScene, releaseAt), 0.02, 'the playhead after the release');

  await record(
    'audio-pause',
    'And pausing: the pause glyph crossfades back to a play, the playhead stops where it is.',
    0,
    async () => {
      await page.locator('[data-transport-toggle]').first().click();
    }
  );

  /* 3. The same three for a video note, whose transport is the same row
     under a frame - and whose centre control has to withdraw rather than
     disappear. */
  await importFile('[data-add-video-file]', media.landscape, 'video/webm');
  await page.waitForSelector('.video-row [data-transport]', { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.locator('.video-row').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const videoIndex = await page.evaluate(
    () => [...document.querySelectorAll('[data-transport]')].findIndex((t) => t.closest('.video-row'))
  );
  const startVideo = await record(
    'video-start',
    'A video note starting: the centre control fades and shrinks where it stands, and the playhead leaves zero travelling.',
    videoIndex,
    async () => {
      await page.locator('.video-row [data-transport-toggle]').click();
    }
  );
  judge('video-start', biggestStep(startVideo), 0.015, 'the playhead on start');

  const videoScrub = await page.locator('.video-row [data-transport-scrub]').boundingBox();
  const videoDrag = await record(
    'video-scrub',
    'Dragging a video note to three quarters and letting go: the picture follows the playhead and the playhead stays where it was left.',
    videoIndex,
    async () => {
      await page.mouse.move(videoScrub.x + videoScrub.width * 0.2, videoScrub.y + videoScrub.height / 2);
      await page.mouse.down();
      for (let step = 2; step <= 11; step++) {
        await page.mouse.move(
          videoScrub.x + videoScrub.width * (0.2 + 0.05 * step),
          videoScrub.y + videoScrub.height / 2
        );
        await page.waitForTimeout(24);
      }
      await page.mouse.up();
      await page.waitForTimeout(400);
    }
  );
  const videoReleaseAt = videoDrag.findIndex((s, i) => i > 0 && s.at > videoDrag[0].at + 500);
  judge('video-scrub', biggestStep(videoDrag, videoReleaseAt), 0.02, 'the playhead after the release');

  await record(
    'video-pause',
    'And pausing a video note: the centre control comes back the way it went.',
    videoIndex,
    async () => {
      await page.locator('.video-row [data-transport-toggle]').click();
    }
  );

  /* 4. The player arriving at all, which is the standing clause's other
     half: a transport is a block and blocks clip in from their own edge. */
  await settle('/entry/new/today');
  await page.waitForSelector('[data-add-recording-file]');
  await record(
    'audio-arrives',
    'A recording being added: the player is uncovered from its own edge rather than appearing at full width.',
    0,
    async () => {
      await importFile('[data-add-recording-file]', media.voice, 'audio/webm');
      await page.waitForSelector('[data-transport]');
    }
  ).catch((error) => console.error('audio-arrives:', error.message));
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ scenes, findings }, null, 2) + '\n'
  );
  await page.close();
  await context.close();
  await browser.close();
  await app.close();
}

console.log(`\n${scenes.length} scenes into ${outDir}`);
if (findings.some((f) => f.verdict !== 'ok')) {
  console.log('the playhead jumped somewhere - read the frames the numbers point at');
  process.exitCode = 1;
}

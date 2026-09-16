/* Frame-by-frame captures of the three movements redesign ticket 42 owns
   (DIRECTION.md rule 10, ADR-0078, ADR-0083).

   A still cannot review a transition and Alicja reviews motion frame by
   frame, naming frames, so each scene is Chromium's own screencast with the
   millisecond every frame was painted at - the same mechanism
   tests/state-motion-gallery.mjs uses - plus a per-animation-frame reading
   of the property the movement actually animates. The numbers say what the
   curve did; the frames say what was painted. Neither on its own catches a
   single-frame teleport.

   The three:

   - **the summary arriving**, where the take's pitch density clips open
     from its spine outward and the six figure blocks clip open a stagger
     step apart;
   - **the pair view arriving**, where the paired density opens from the
     shared spine both ways at once (motion/reveal.ts's `spread`, which this
     ticket added for exactly this shape);
   - **a pair change**, where stepping one side to another take tweens both
     shapes to their new geometry instead of cutting - the claim being that
     the widest point of each shape travels rather than jumping.

   Each also runs with reduced motion on, which is the contract: substitute,
   never delete, so every one of the three becomes a cut.

   Run: node tests/voice-motion-gallery.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build). */
import { preview } from 'vite';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/voice-motion'));

/** --dur-slow is 380ms and the six blocks add five stagger steps of 50;
    900ms shows the last one land and hold still. */
const SCENE_MS = 900;
const VIEWPORT = { width: 390, height: 1000 };

const fakeMicrophoneSource = (await readFile(`${here}/fake-microphone.mjs`, 'utf8')).replace(
  /^export /gm,
  ''
);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium({
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required']
});
const scenes = [];

async function open(reducedMotion) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    reducedMotion
  });
  await context.addInitScript(`
    ${fakeMicrophoneSource}
    window.__fakeMicrophone = installFakeMicrophone('read');
  `);
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

const seed = async (page) => {
  await settle(page, '/');
  await page.locator('[data-fill-every-feature]').click();
  await page.waitForURL('**/more', { timeout: 180000 });
  await page.waitForTimeout(1200);
};

/** What the density's own clip is doing, and what the first and last figure
    block's are: the properties rule 10 says these movements animate, read
    off the computed style rather than off any state the app believes. */
const READ_SUMMARY = `
  const clip = (el) => (el ? getComputedStyle(el).clipPath : null);
  const blocks = [...document.querySelectorAll('.vf-block')];
  return {
    density: clip(document.querySelector('[data-pitch-density]')),
    firstBlock: clip(blocks[0]),
    lastBlock: clip(blocks[blocks.length - 1]),
    blocks: blocks.length
  };
`;

/** The paired figure: its clip while it opens, and where each shape's mode
    sits on the axis.

    The mode's *height*, not its width: every density is normalised to its
    own peak, so the widest point of any shape is always the same 82 units
    out from the spine and a width would report a tween as stillness. What
    changes when the pair changes is which frequency the mass sits at, which
    is the whole subject of the figure - so the number sampled is the y of
    the widest point, and the median mark's y beside it. */
const READ_PAIR = `
  const box = document.querySelector('[data-pitch-pair]');
  const mode = (which) => {
    const shape = document.querySelector('[data-pair-outline="' + which + '"]');
    if (!shape) return null;
    let widest = null;
    for (const point of shape.points) {
      const reach = Math.abs(point.x - 100);
      if (!widest || reach > widest.reach) widest = { reach, y: point.y };
    }
    return widest ? Number(widest.y.toFixed(2)) : null;
  };
  const median = (which) => {
    const mark = document.querySelector('[data-pair-median="' + which + '"]');
    return mark ? Number(mark.y1.baseVal.value.toFixed(2)) : null;
  };
  return {
    clip: box ? getComputedStyle(box).clipPath : null,
    earlier: mode('earlier'),
    later: mode('later'),
    earlierMedian: median('earlier'),
    laterMedian: median('later'),
    dates: [...document.querySelectorAll('.vc-sides span')].map((s) => s.textContent.trim())
  };
`;

async function record(page, cdp, name, note, act, read, options = {}) {
  const sceneMs = options.ms ?? SCENE_MS;
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

/** One take, read to the passage's floor, stopping one click short of the
    summary so the scene can record the moment it arrives. */
const readPassage = async (page) => {
  await page.locator('[data-vb-record]').click();
  await page.waitForTimeout(9500);
  await page.locator('[data-vb-stop]').click();
  for (let vowel = 0; vowel < 2; vowel++) {
    await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
    await page.locator('[data-vb-skip]').click();
    await page.waitForTimeout(700);
  }
  await page.waitForSelector('[data-vb-skip]', { timeout: 20000 });
};

/** The compare view, on a pair chosen from the seeded benchmarks, stopping
    on the picking list so the scene can record the view arriving. */
const pickPair = async (page) => {
  await settle(page, '/practice/voice?tab=compare');
  await strip(page);
  await page.waitForSelector('[data-voice-cell]');
  const cells = page.locator('[data-voice-cell] .kit-row-main');
  await cells.nth(1).click();
  await cells.nth(4).click();
  await page.waitForSelector('[data-compare]');
  await page.mouse.move(4, 4);
  await page.waitForTimeout(400);
};

try {
  for (const reduced of ['no-preference', 'reduce']) {
    const tag = reduced === 'reduce' ? 'reduce-' : '';
    const { context, page, cdp } = await open(reduced);
    await seed(page);

    await settle(page, '/practice/voice?tab=record');
    await strip(page);
    await readPassage(page);
    await record(
      page,
      cdp,
      `${tag}summary-arrive`,
      reduced === 'reduce'
        ? 'The summary with reduce-motion set: the density and every figure block are whole in the first frame they are drawn.'
        : "The summary arriving: the take's pitch density clips open from its spine, and the six figure blocks clip open a stagger step apart.",
      () => page.locator('[data-vb-skip]').click(),
      READ_SUMMARY,
      { cropOf: '.vb-body' }
    );

    await pickPair(page);
    await record(
      page,
      cdp,
      `${tag}pair-open`,
      reduced === 'reduce'
        ? 'The pair view with reduce-motion set: both shapes are whole in the first frame.'
        : 'The pair view arriving: the two densities open from the shared spine, both ways at once.',
      () => page.locator('[data-compare]').click(),
      READ_PAIR,
      { cropOf: '[data-vc-pair]' }
    );

    await page.waitForSelector('[data-vc-pair]');
    await page.mouse.move(4, 4);
    await page.waitForTimeout(600);
    await record(
      page,
      cdp,
      `${tag}pair-change`,
      reduced === 'reduce'
        ? 'Stepping the later take back with reduce-motion set: the new pair is drawn in one frame.'
        : 'Stepping the later take back one benchmark: both shapes travel to their new geometry rather than cutting to it.',
      async () => {
        const earlier = page.locator('.compare-nav button').nth(2);
        await earlier.click();
      },
      READ_PAIR,
      { cropOf: '[data-vc-pair]' }
    );

    await context.close();
  }
} finally {
  await writeFile(
    resolve(outDir, 'manifest.json'),
    JSON.stringify({ sceneMs: SCENE_MS, scenes }, null, 2)
  );
  await browser.close();
  await app.close();
}

console.log(`\nframes in ${outDir}`);

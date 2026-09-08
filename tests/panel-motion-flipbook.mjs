/* Turns one or two directories of panel-motion frames into one JSON bundle
   small enough to embed in a review page (phase 9 carpet ticket 04).

   The frames come off Chromium's screencast at the viewport's full height,
   which is deliberately taller than a phone so the rows below a panel are in
   shot. That is the right recording and the wrong payload: at 390x1340 and
   205 frames a before-and-after pair is 16MB of JPEG before base64 gets near
   it. So this crops each frame to the band that actually moves and
   re-encodes it, in the one runtime already on hand that can - a canvas in
   the browser this repo already drives.

   Frames after the motion has finished are thinned rather than dropped: a
   flipbook that stops the instant the animation does cannot show that it
   settled, and every third frame is enough to show stillness.

   Run: node tests/panel-motion-flipbook.mjs <outFile.json> <label>=<dir>[:pattern] ...
   e.g. node tests/panel-motion-flipbook.mjs .claude/panel-motion.json \
          before=.claude/panel-motion-before:light after=.claude/panel-motion-after
   `pattern` keeps only the scenes whose name contains it, which is how a
   before-and-after pair stays inside a page's size budget: the defect a
   before recording is showing is the same defect in either theme.

   A scene in the manifest may carry its own `crop` ({left, top, width,
   height}) and its own `trace` of per-frame measurements; both override or
   ride past the CLI's one crop, for a run whose scenes are not all the same
   band of the same screen. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium } from './browser-harness.mjs';

/** The band worth keeping. The header and the flag sun are 380px of a screen
    that never moves in any of these scenes, and 800px below that reaches the
    rows under the panel without carrying the milestones list and the entry
    log to a review page as JPEG. A frame shorter than that keeps what it
    has. */
const CROP_TOP = 380;
const CROP_HEIGHT = 800;
/** Where the motion is over: --dur-med plus a beat. Every frame up to here,
    every third one after it. */
const MOTION_MS = 620;

/* Another ticket's scenes are another band and another duration - the
   Journal door's month is the top of the screen and runs at --dur-slow
   (redesign ticket 10) - so both are overridable, with Home's own numbers
   as the defaults:
     --crop <top>,<height>   --motion <ms> */
const argv = process.argv.slice(2);
const opt = (name) => {
  const at = argv.indexOf(`--${name}`);
  if (at < 0) return null;
  const value = argv[at + 1];
  argv.splice(at, 2);
  return value;
};
const cropArg = opt('crop');
const motionArg = opt('motion');
const [cropTopArg, cropHeightArg] = (cropArg ?? '').split(',').map(Number);
const cropTop = Number.isFinite(cropTopArg) ? cropTopArg : CROP_TOP;
const cropHeight = Number.isFinite(cropHeightArg) ? cropHeightArg : CROP_HEIGHT;
const motionMs = Number(motionArg) || MOTION_MS;

const [outFile, ...pairs] = argv;
if (!outFile || pairs.length === 0) {
  console.error('usage: node tests/panel-motion-flipbook.mjs <out.json> <label>=<dir> ...');
  process.exit(2);
}

const browser = await launchChromium();
const page = await browser.newPage();

/** Crops and re-encodes one JPEG, in the page, and hands back a data URI.
    The box is `{ left, top, width, height }`; a null width means the frame's
    own, which is every vertical band this started out cropping. */
async function shrink(bytes, box, quality) {
  return page.evaluate(
    async ({ b64, box, quality }) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.min(box.width ?? img.width, img.width - box.left));
      canvas.height = Math.max(1, Math.min(box.height, img.height - box.top));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, -box.left, -box.top);
      return { uri: canvas.toDataURL('image/jpeg', quality), w: canvas.width, h: canvas.height };
    },
    { b64: bytes.toString('base64'), box, quality }
  );
}

const bundle = { crop: cropTop, sets: {} };
let total = 0;

for (const pair of pairs) {
  const [label, spec] = pair.split('=');
  const [dir, pattern] = spec.split(':');
  const root = resolve(dir);
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const scenes = [];
  for (const scene of manifest.scenes) {
    if (pattern && !scene.name.includes(pattern)) continue;
    /* A scene may name its own crop, which is what a run whose scenes are
       not all the same band needs: the nav's two shapes are a strip along
       the bottom of a phone and a column down the left of a desktop
       (redesign ticket 26), and one crop for the run would carry most of a
       screen that never moves to fit both. The CLI's crop stays the default
       for every scene that says nothing. */
    const box = { left: 0, width: null, top: cropTop, height: cropHeight, ...(scene.crop ?? {}) };
    const kept = scene.frames.filter(
      (frame, i) => frame.at <= motionMs || i % 3 === 0 || i === scene.frames.length - 1
    );
    const frames = [];
    let size = { w: 0, h: 0 };
    for (const frame of kept) {
      const shrunk = await shrink(await readFile(resolve(root, frame.file)), box, 0.4);
      total += shrunk.uri.length;
      size = { w: shrunk.w, h: shrunk.h };
      frames.push({ at: frame.at, uri: shrunk.uri });
    }
    /* `trace` rides along untouched where a scene carries one: a flipbook of
       a two-phase move has to be readable against the numbers the same move
       measured, frame by frame, or "the trailing edge held" is a description
       rather than a measurement. */
    scenes.push({
      name: scene.name,
      note: scene.note,
      w: size.w,
      h: size.h,
      frames,
      ...(scene.trace ? { trace: scene.trace, axis: scene.axis, clickAt: scene.clickAt } : {})
    });
    console.log(`${label}/${scene.name}: ${frames.length} of ${scene.frames.length} frames`);
  }
  bundle.sets[label] = scenes;
}

await browser.close();
await writeFile(resolve(outFile), JSON.stringify(bundle));
console.log(`\n${outFile}: ${(total / 1e6).toFixed(2)}MB of data URIs`);

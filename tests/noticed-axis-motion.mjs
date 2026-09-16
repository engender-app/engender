/* What the axis does between frames (phase 10 redesign ticket 57).

   The ticket's motion clause is mechanical rather than aesthetic: nothing
   appears, disappears or moves in one frame, nothing is painted at its
   destination before it travelled there, and no frame holds an element in
   neither its old place nor its new one. Those are numbers, so this reads
   them: a rAF loop samples the properties each movement animates -
   the block's clip-path as it uncovers, a mark's opacity as it arrives or
   leaves, its x as it travels - and the run says which frames the numbers
   point at. Chromium's screencast records the same window, so the frames a
   number accuses can be looked at rather than argued about.

   Why its own recorder and not a scene in the yank sweep. The sweep's two
   journal profiles are the demo persona and an empty journal, and neither
   has a marker in it: markers are written through this screen's own sheet
   and nothing else writes them. So a sweep scene pointed at
   `[data-noticed-mark]` would find nothing to act on. This seeds the
   journal it needs - a regimen, then changes marked through the sheet -
   and then records.

   Run: node tests/noticed-axis-motion.mjs [outDir]
   Needs a demo build on disk (VITE_DEMO=1 npm run build); it serves
   `build/` rather than building.

   Exits non-zero when a scene fails its own arithmetic, so it is a check
   and not only a gallery. Frames and a manifest land in outDir. */
import { preview } from 'vite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, fillDate } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(process.argv[2] ?? resolve(root, '.claude/noticed-axis-motion'));

/** Long enough for --dur-authored (the wipe) and --dur-med (a mark's
    travel) to have finished, plus the stillness that says it landed. */
const SCENE_MS = 900;

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

const iso = (offsetDays) => {
  const day = new Date();
  day.setDate(day.getDate() + offsetDays);
  return day.toISOString().slice(0, 10);
};

async function settle(path) {
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
  }
  await page.evaluate(() => {
    document.querySelector('.demo-bar')?.remove();
    document.body.classList.remove('has-demo-bar');
    for (const toast of document.querySelectorAll('[data-toast]')) toast.remove();
  });
}

/** Arriving the way a person does. A `page.goto` replaces the document,
    which takes the sampling loop with it and records a cold load rather
    than the navigation - so the screen is entered through an anchor
    SvelteKit's own router picks up. */
const enter = (page_, path) =>
  page_.evaluate((href) => {
    const a = document.createElement('a');
    a.href = href;
    a.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.append(a);
    a.click();
    a.remove();
  }, path);

/** A regimen to count months from, so the axis is its onset mode - the one
    the screen shows whenever there is anything to count from. */
async function seedRegimen(startOffsetDays) {
  await settle('/care/regimen');
  await page.click('[data-add]');
  await page.click('[data-own]');
  await page.waitForSelector('#regimen-drug');
  await page.fill('#regimen-drug', 'Estradiol valerate');
  await page.fill('#regimen-dose', '4');
  await page.fill('#regimen-dose-unit', 'mg');
  await page.fill('#regimen-route', 'oral');
  await page.fill('#regimen-interval', 'daily');
  await fillDate(page, '#regimen-start', iso(startOffsetDays));
  await page.click('[data-save-regimen]');
  await page.waitForSelector('[data-episode]', { timeout: 8000 });
}

/** The sheet is the only way a marker is written, from the list row or from
    the mark itself. `from` says which, because the two are the same editor
    and the ticket's claim is that they are. */
async function markChange({ group, effect, date, from = 'row' }) {
  if (from === 'row') {
    await page.locator(`[data-effect-group="${group}"] [aria-expanded]`).first().click();
    await page.locator(`[data-list-row="${effect}"]`).click();
  } else {
    await page.locator(`[data-noticed-mark="${effect}"]`).click();
  }
  await page.waitForSelector('#effect-date');
  await fillDate(page, '#effect-date', date);
  await page.locator('[data-save-effect]').click();
  await page.waitForSelector('[data-save-effect]', { state: 'detached' });
}

/** Records the window `act` starts, sampling `read` every animation frame
    and the screencast every painted one. Same shape as
    tests/state-motion-gallery.mjs's own recorder. */
async function record(name, note, act, read, ms = SCENE_MS) {
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
  await startSampling(page, read);
  await act();
  await page.waitForTimeout(ms);
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  let samples = [];
  try {
    samples = await stopSampling(page);
  } catch {
    /* The document went with a navigation: an empty list, which the
       scene's own arithmetic then reports rather than passing silently. */
  }
  const written = [];
  for (const [i, frame] of frames.entries()) {
    const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
    await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
    written.push({ file, at: frame.at });
  }
  scenes.push({ name, note, frames: written, samples });
  console.log(`${name}: ${written.length} frames, ${samples.length} samples over ${ms}ms`);
  return samples;
}

/** The axis block's own uncovering: the clip the wipe is painting, and
    whether the sentence above the line is under the same clip. */
const READ_BLOCK = `
  const block = document.querySelector('[data-noticed-axis]');
  if (!block) return { there: false };
  const box = block.getBoundingClientRect();
  return {
    there: true,
    clip: getComputedStyle(block).clipPath,
    opacity: Number(getComputedStyle(block).opacity),
    w: Math.round(box.width),
    h: Math.round(box.height)
  };
`;

/** One mark: where it is, how opaque, and whether it is in the tree at all.
    Its x is read off the box rather than off the translate, because what
    the ticket asks is where it was painted. */
const readMark = (key) => `
  const mark = document.querySelector('[data-noticed-mark="${key}"]');
  if (!mark) return { there: false };
  const box = mark.getBoundingClientRect();
  /* Stamped so a mark that was replaced rather than moved says so: a new
     node carries no stamp, and a jump with a new stamp beside it is a
     re-render rather than a transition that failed to run. */
  if (!mark.dataset.stamp) mark.dataset.stamp = String((window.__stamp = (window.__stamp ?? 0) + 1));
  return {
    there: true,
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
    at: getComputedStyle(mark).getPropertyValue('--at').trim(),
    stamp: Number(mark.dataset.stamp),
    opacity: Number(getComputedStyle(mark).opacity)
  };
`;

/* The arithmetic. Each returns a list of complaints, each naming the frames
   it is about, so a failure points at frames rather than at a feeling. */

/** Something that fades: no single frame may carry more than `step` of the
    whole fade, and the fade has to have middle frames at all. */
function fadeIsAnimated(samples, { key, step = 0.6, least = 2 }) {
  const seen = samples.filter((s) => s.there).map((s) => s.opacity);
  const complaints = [];
  if (seen.length === 0) return [`${key}: never in the tree, so nothing was measured`];
  const middles = seen.filter((o) => o > 0.02 && o < 0.98).length;
  if (middles < least) {
    complaints.push(`${key}: ${middles} frame(s) part-way through the fade, which is a cut rather than a fade`);
  }
  for (const [i, s] of samples.entries()) {
    const next = samples[i + 1];
    if (!next || !s.there || !next.there) continue;
    const jump = Math.abs(next.opacity - s.opacity);
    if (jump > step) {
      complaints.push(`${key}: opacity ${s.opacity.toFixed(2)} to ${next.opacity.toFixed(2)} between ${s.t}ms and ${next.t}ms (frames ${i} and ${i + 1})`);
    }
  }
  return complaints;
}

/** Something that travels: it may not be painted at its destination before
    it got there, and no frame may carry more than `step` of the journey. */
function travelIsAnimated(samples, { key, step = 0.6 }) {
  const seen = samples.filter((s) => s.there);
  const complaints = [];
  if (seen.length < 3) return [`${key}: ${seen.length} frame(s) with the mark in them, which is not a journey`];
  const from = seen[0].x;
  const to = seen[seen.length - 1].x;
  const span = Math.abs(to - from);
  if (span < 4) return [`${key}: the mark moved ${span}px, so this scene measured nothing`];
  const moved = seen.filter((s) => Math.abs(s.x - from) > 1 && Math.abs(s.x - to) > 1).length;
  if (moved < 2) complaints.push(`${key}: ${moved} frame(s) between the two places, which is a teleport`);
  for (const [i, s] of seen.entries()) {
    const next = seen[i + 1];
    if (!next) continue;
    if (Math.abs(next.x - s.x) > span * step) {
      complaints.push(`${key}: x ${s.x} to ${next.x} between ${s.t}ms and ${next.t}ms (${span}px in all)`);
    }
  }
  return complaints;
}

/** The block uncovering: the clip has to be a moving inset rather than one
    step from hidden to whole. */
function wipeIsAnimated(samples, { key }) {
  const insets = samples.filter((s) => s.there).map((s) => s.clip);
  if (insets.length === 0) return [`${key}: the axis was never in the tree`];
  const moving = new Set(insets.filter((c) => c && c !== 'none' && !/inset\(0(px)? 0(px)? 0(px)? 0(px)?\)/.test(c)));
  if (moving.size < 3) {
    return [`${key}: ${moving.size} distinct clip value(s) while it arrived, which is a cut rather than an uncovering`];
  }
  return [];
}

function verdict(name, complaints) {
  if (complaints.length === 0) {
    console.log(`  ${name}: no yanks`);
    return;
  }
  for (const line of complaints) console.log(`  ${name}: ${line}`);
  failures.push(...complaints.map((c) => `${name}: ${c}`));
}

try {
  await settle('/');
  await seedRegimen(-500);

  /* Two changes, months apart, so the line has something on it before the
     scenes that add, move and clear one. */
  await settle('/practice/personal-effects');
  await markChange({ group: 'feminizing::body_shape', effect: 'breast_development', date: iso(-300) });
  await markChange({ group: 'feminizing::skin_hair', effect: 'skin_softening', date: iso(-120) });

  /* 1. The screen arriving. The axis is behind a skeleton until the
     markers query resolves, so the uncovering is what a person sees when
     it lands - the sentence, the line and the marks together. */
  await settle('/more');
  const arrive = await record(
    'axis-arrive',
    'The screen opened: the whole axis block uncovers from the left, sentence, line, marks and months together.',
    () => enter(page, '/practice/personal-effects'),
    READ_BLOCK,
    1400
  );
  verdict('axis-arrive', wipeIsAnimated(arrive, { key: 'the block' }));

  /* 2. A change marked from the list: its mark arrives on a line that is
     already there, which is the crossfade rather than the wipe. */
  await settle('/practice/personal-effects');
  await page.waitForSelector('[data-noticed-mark]');
  await page.waitForTimeout(600);
  const arriveMark = await record(
    'mark-arrive',
    'A change marked from the list: its mark fades onto the line it belongs on.',
    async () => {
      await markChange({ group: 'feminizing::skin_hair', effect: 'hair_changes', date: iso(-60) });
    },
    readMark('hair_changes'),
    1400
  );
  verdict('mark-arrive', fadeIsAnimated(arriveMark, { key: 'the new mark' }));

  /* 3. The same change re-dated from its own mark: the mark travels to the
     new month rather than being repainted there. */
  await settle('/practice/personal-effects');
  await page.waitForSelector('[data-noticed-mark="hair_changes"]');
  await page.waitForTimeout(600);
  const travel = await record(
    'mark-travel',
    'The date edited from the mark itself: the mark travels to its new month.',
    async () => {
      await markChange({ effect: 'hair_changes', date: iso(-430), from: 'mark' });
    },
    readMark('hair_changes'),
    1600
  );
  verdict('mark-travel', travelIsAnimated(travel, { key: 'the re-dated mark' }));

  /* 4. Cleared: the mark leaves the line the way it arrived. */
  await settle('/practice/personal-effects');
  await page.waitForSelector('[data-noticed-mark="hair_changes"]');
  await page.waitForTimeout(600);
  const leave = await record(
    'mark-leave',
    'The marker cleared from its own sheet: the mark fades off the line.',
    async () => {
      await page.locator('[data-noticed-mark="hair_changes"]').click();
      await page.waitForSelector('[data-clear-effect]');
      await page.locator('[data-clear-effect]').click();
    },
    readMark('hair_changes'),
    1600
  );
  verdict('mark-leave', fadeIsAnimated(leave, { key: 'the cleared mark' }));
} finally {
  await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ scenes }, null, 1));
  await browser.close();
  await app.close();
}

console.log(`\n${scenes.length} scene(s) in ${outDir}`);
if (failures.length) {
  console.log(`${failures.length} complaint(s)`);
  process.exit(1);
}
console.log('no yanks');

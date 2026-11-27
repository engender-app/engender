/* Open every Wrapped cadence cold at each width and in both languages.
   The selected tab stays fully inside the track and clear of opaque
   chevrons. Each hint appears exactly when content lies beyond its
   edge, including after scrolling to each end. At 200% zoom exercise
   click, Enter and drag. A selection that scrolls eases across frames
   or lands immediately with reduced motion.

   Run node tests/segmented-chosen-clear.mjs against the dev server. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium, settlePage, setAppLanguage } from './browser-harness.mjs';

const TRACK = '[data-segmented="wrapped-cadences"]';
const CADENCES = ['week', 'month', 'year'];
const WIDTHS = [390, 195];
/* The 200%-zoom width: the one where the track is narrower than its three
   segments, so choosing one can move it. */
const NARROW = 195;

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, '');
const browser = await launchChromium();

/** The track, its hints and its segments, in viewport pixels, once its
    scroll position has stopped moving for ten frames. */
const readTrack = (page) =>
  page.evaluate(async (selector) => {
    const track = document.querySelector(selector);
    if (!track) throw new Error('no cadence track on the page');
    const wrap = track.parentElement;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    /* A hint counts as drawn by what is painted, not by its markup: in the
       page and more than half opaque. */
    const shown = (edge) =>
      [...wrap.querySelectorAll(`.segmented-hint-${edge}`)].find((node) => Number(getComputedStyle(node).opacity) > 0.5);
    const state = () =>
      [track.scrollLeft, ...wrap.querySelectorAll('.segmented-hint')].map((v) => (typeof v === 'number' ? v : getComputedStyle(v).opacity)).join(' ');
    let still = 0;
    let last = state();
    for (let i = 0; i < 240 && still < 10; i++) {
      await frame();
      still = state() === last ? still + 1 : 0;
      last = state();
    }
    const box = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right };
    };
    const segments = [...track.querySelectorAll('[data-segment]')];
    return {
      scrollLeft: track.scrollLeft,
      track: box(track),
      active: box(track.querySelector('[aria-current="page"]')),
      activeLabel: track.querySelector('[aria-current="page"]')?.textContent.trim(),
      first: box(segments[0]),
      last: box(segments[segments.length - 1]),
      startHint: box(shown('start')),
      endHint: box(shown('end'))
    };
  }, TRACK);

/** The claims about a track at rest, as failure messages. */
function problems(state, where) {
  const out = [];
  const { track, startHint, endHint, first, last, active } = state;
  if (!active) return [`${where}: no segment is marked current`];
  const what = `"${state.activeLabel}"`;
  if (active.left < track.left - 0.5 || active.right > track.right + 0.5) {
    out.push(`${where}: ${what} (${active.left.toFixed(1)}-${active.right.toFixed(1)}) runs past the track (${track.left.toFixed(1)}-${track.right.toFixed(1)})`);
  }
  if (endHint && active.right > endHint.left + 0.5) {
    out.push(`${where}: the end chevron covers ${(active.right - endHint.left).toFixed(1)}px of ${what}`);
  }
  if (startHint && active.left < startHint.right - 0.5) {
    out.push(`${where}: the start chevron covers ${(startHint.right - active.left).toFixed(1)}px of ${what}`);
  }
  const moreAfter = last.right > track.right + 1;
  const moreBefore = first.left < track.left - 1;
  if (Boolean(endHint) !== moreAfter) out.push(`${where}: end chevron ${endHint ? 'drawn' : 'missing'} with ${moreAfter ? 'more' : 'nothing'} past the end`);
  if (Boolean(startHint) !== moreBefore) out.push(`${where}: start chevron ${startHint ? 'drawn' : 'missing'} with ${moreBefore ? 'more' : 'nothing'} before the start`);
  return out;
}

/** Every frame's scrollLeft and the painted opacity of both chevrons (0
    when one is not in the page), from just before `act` until all three
    have been still for ten frames. */
async function sampleScroll(page, act) {
  await page.evaluate((selector) => {
    const samples = [];
    globalThis.__trackSamples = samples;
    const opacity = (node) => (node ? Number(getComputedStyle(node).opacity) : 0);
    const tick = () => {
      const track = document.querySelector(selector);
      const wrap = track?.parentElement;
      samples.push([
        track ? track.scrollLeft : NaN,
        opacity(wrap?.querySelector('.segmented-hint-start')),
        opacity(wrap?.querySelector('.segmented-hint-end'))
      ].join(' '));
      if (samples.length < 180) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, TRACK);
  await act();
  await page.waitForFunction(() => {
    const s = globalThis.__trackSamples;
    if (s.length >= 180) return true;
    const tail = s.slice(-10);
    return s.length >= 30 && tail.every((v) => v === tail[0]);
  });
  const rows = await page.evaluate(() => globalThis.__trackSamples);
  const columns = rows.map((row) => row.split(' ').map(Number));
  const steps = (k) => columns.slice(1).map((row, i) => Math.abs(row[k] - columns[i][k]));
  return { left: steps(0), start: steps(1), end: steps(2), rows };
}

/** A mouse click on the part of a segment a person can see and reach:
    inside the track and off both chevrons. Not the locator's own click,
    which scrolls the segment into view first, instantly, and so would
    sample Playwright's scroll as the app's. */
async function tapVisible(page, value) {
  const state = await readTrack(page);
  const segment = await page.locator(`${TRACK} [data-segment="${value}"]`).boundingBox();
  const left = Math.max(segment.x, state.startHint ? state.startHint.right : state.track.left);
  const right = Math.min(segment.x + segment.width, state.endHint ? state.endHint.left : state.track.right);
  if (right - left < 8) throw new Error(`only ${(right - left).toFixed(1)}px of ${value} is reachable to tap`);
  await page.mouse.click((left + right) / 2, segment.y + segment.height / 2);
}

const failures = [];
let checked = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  await settlePage(page, base, '/wrapped/year', 'light');

  for (const language of ['en', 'pl']) {
    await setAppLanguage(page, language);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      for (const cadence of CADENCES) {
        await settlePage(page, base, `/wrapped/${cadence}`, 'light');
        await page.waitForSelector(`${TRACK} .segment-pill.is-shown`);
        const where = `${language} ${width}px /wrapped/${cadence}`;
        const rest = await readTrack(page);
        failures.push(...problems(rest, where));
        console.log(`${where}: "${rest.activeLabel}" ${rest.active ? `${rest.active.left.toFixed(1)}-${rest.active.right.toFixed(1)}` : '-'}, track ${rest.track.left.toFixed(1)}-${rest.track.right.toFixed(1)}, start hint ${rest.startHint ? rest.startHint.right.toFixed(1) : '-'}, end hint ${rest.endHint ? rest.endHint.left.toFixed(1) : '-'}, scrollLeft ${rest.scrollLeft}`);
        checked += 1;

        await page.evaluate((selector) => document.querySelector(selector).scrollTo({ left: 1e6, behavior: 'instant' }), TRACK);
        const end = await readTrack(page);
        if (end.endHint) failures.push(`${where}: end chevron still drawn at the far end of the scroll`);
        if (Boolean(end.startHint) !== end.first.left < end.track.left - 1) failures.push(`${where}: start chevron wrong at the far end`);
        await page.evaluate((selector) => document.querySelector(selector).scrollTo({ left: 0, behavior: 'instant' }), TRACK);
        const start = await readTrack(page);
        if (start.startHint) failures.push(`${where}: start chevron still drawn at the start of the scroll`);
        if (Boolean(start.endHint) !== start.last.right > start.track.right + 1) failures.push(`${where}: end chevron wrong at the start`);
      }
    }
  }
  assert.equal(checked, 16, 'every cadence in both languages at both widths');

  /* Pointer and keyboard, English at the narrow width. Week opens with the
     track at its start and Month running under the end chevron, so tapping
     the part of Month that shows has to move the track. */
  await setAppLanguage(page, 'en');
  await page.setViewportSize({ width: NARROW, height: 844 });
  await settlePage(page, base, '/wrapped/week', 'light');
  await page.waitForSelector(`${TRACK} .segment-pill.is-shown`);
  const before = await readTrack(page);
  const clicked = await sampleScroll(page, async () => {
    await tapVisible(page, 'month');
    await page.waitForURL('**/wrapped/month');
  });
  const afterClick = await readTrack(page);
  failures.push(...problems(afterClick, `en ${NARROW}px, tapped Month from week`));
  const moved = Math.abs(afterClick.scrollLeft - before.scrollLeft);
  const biggest = Math.max(...clicked.left);
  const moving = clicked.left.filter((d) => d > 0).length;
  const hintJump = Math.max(...clicked.start, ...clicked.end);
  console.log(`click: track moved ${moved}px over ${moving} frames, largest single frame ${biggest}px; largest one-frame chevron opacity change ${hintJump.toFixed(2)}`);
  console.log(`click frames (scrollLeft startOpacity endOpacity): ${clicked.rows.filter((row, i, all) => i === 0 || row !== all[i - 1]).join(' | ')}`);
  if (moved < 8) failures.push(`tapping Month from week moved the track only ${moved}px; the case this samples no longer scrolls`);
  if (moving < 3) failures.push(`tapping Month moved the track ${moved}px in ${moving} frame(s): a jump, not a scroll`);
  if (biggest > moved * 0.6) failures.push(`tapping Month moved ${biggest}px of ${moved}px in one frame`);
  /* A chevron that a scroll brings in or takes away fades rather than
     appearing or vanishing in one frame. */
  if (hintJump > 0.5) failures.push(`a chevron changed opacity by ${hintJump.toFixed(2)} in one frame while the track scrolled`);

  // Enter on a focused tab is the keyboard's selection, and lands the same way.
  await page.locator(`${TRACK} [data-segment="year"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/wrapped/year');
  failures.push(...problems(await readTrack(page), `en ${NARROW}px, Enter on Year`));
  await page.locator(`${TRACK} [data-segment="week"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/wrapped/week');
  failures.push(...problems(await readTrack(page), `en ${NARROW}px, Enter on Week`));

  // A mouse drag still scrolls the track and still chooses nothing.
  const box = await page.locator(TRACK).boundingBox();
  const dragFrom = await readTrack(page);
  await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const dragTo = await readTrack(page);
  if (!(dragTo.scrollLeft > dragFrom.scrollLeft)) failures.push(`a mouse drag no longer scrolls the track (${dragFrom.scrollLeft} -> ${dragTo.scrollLeft})`);
  if (!page.url().endsWith('/wrapped/week')) failures.push(`a mouse drag chose a cadence: ${page.url()}`);
  console.log(`drag: scrollLeft ${dragFrom.scrollLeft} -> ${dragTo.scrollLeft}, still on ${new URL(page.url()).pathname}`);
  await context.close();

  // Reduced motion: the same choice lands clear, in place rather than eased.
  const reduced = await browser.newContext({ viewport: { width: NARROW, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const still = await reduced.newPage();
  still.setDefaultTimeout(20000);
  await settlePage(still, base, '/wrapped/week', 'light');
  assert.equal(await still.evaluate(() => document.documentElement.dataset.a11yMotion), 'reduce', 'the reduced-motion path is not active');
  await still.waitForSelector(`${TRACK} .segment-pill.is-shown`);
  const quiet = await sampleScroll(still, async () => {
    await tapVisible(still, 'month');
    await still.waitForURL('**/wrapped/month');
  });
  const quietSteps = quiet.left.filter((d) => d > 0).length;
  failures.push(...problems(await readTrack(still), `en ${NARROW}px reduced motion, tapped Month`));
  console.log(`reduced motion: track moved in ${quietSteps} frame(s): ${quiet.rows.filter((row, i, all) => i === 0 || row !== all[i - 1]).join(' | ')}`);
  if (quietSteps > 1) failures.push(`reduced motion eased the track over ${quietSteps} frames`);
  await reduced.close();
} catch (error) {
  // A step that cannot run still reports what the steps before it found.
  failures.push(`stopped early: ${error.message}`);
} finally {
  await browser.close();
  await server.close();
}

for (const failure of failures) console.error('FAIL: ' + failure);
if (failures.length) process.exit(1);
console.log(`PASS: the whole chosen cadence is clear of both chevrons in ${checked} cold opens (EN/PL, 390 and 195px), the chevrons match the scroll at rest and at both ends`);
console.log('PASS: a tap eases the track, Enter lands clear, a drag scrolls without choosing, reduced motion lands in place');

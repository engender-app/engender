/* The date picker's motion, recorded and measured (phase 12 pickers, ticket
   01): every scene the ticket names - opening, closing, a month turned by
   the arrow, by a finger past the threshold, a drag that springs back, a
   stretch at a bound, Today across months, the month drum - as every frame
   Chromium's screencast paints, with a rAF sampler reading the picker
   beside it.

     VITE_DEMO=1 npm run build && node tests/date-picker-motion.mjs [--out /abs/dir] [--gate]
     node tests/date-picker-motion.mjs --root /abs/other/checkout --gate

   The yank test is the mechanical one the spec states: nothing painted at
   its destination before it travelled there, and no frame with the thing in
   neither place. So, per sample: a month panel that moves more than half
   the viewport in one frame, a gap between months wider than the gutter, a
   month that is on screen in one frame and not in the DOM in the frame
   before or after, a title face painted where it lands, a surface that
   arrives or leaves more than 45% of itself in one frame.

   The finger is a real touch sequence (CDP touch events), so pointerType is
   touch and the sheet's own drag gets the chance to steal it, as on the
   phone. The swipe also asserts its outcome - the month turned past the
   threshold, held under it and at a bound - which is the half that has to
   fail on a build with the swipe disabled.

   `--out` keeps frames and a manifest for tests/panel-motion-flipbook.mjs;
   `--gate` exits non-zero on any yank or wrong outcome. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : null;
};
const outDir = flag('out') ? resolve(flag('out')) : null;
const gate = args.includes('--gate');
const themes = (flag('themes') ?? 'light,dark').split(',');
const SCENE_MS = 900;
const GUTTER = 16;

if (outDir) await mkdir(outDir, { recursive: true });
const app = await previewBuild(flag('root') ?? process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];
const failures = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SAMPLE = `
  const picker = document.querySelector('[data-date-picker]');
  if (!picker) return { open: false };
  const surface = picker.closest('[data-sheet]') ?? picker;
  const s = surface.getBoundingClientRect();
  const clip = getComputedStyle(surface).clipPath;
  const shut = /inset\\(([\\d.]+)%(?: ([\\d.]+)%? ([\\d.]+)%? ?([\\d.]+)?%?)?/.exec(clip);
  const clipShut = shut ? Math.max(...shut.slice(1).filter(Boolean).map(Number)) / 100 : 0;
  const seen = Math.max(0, Math.min(s.bottom, innerHeight) - Math.max(s.top, 0)) / Math.max(1, s.height);
  const vp = picker.querySelector('[data-date-picker-viewport]');
  const v = vp.getBoundingClientRect();
  const panels = [...vp.querySelectorAll('[data-date-picker-month]')].map((p) => {
    const r = p.getBoundingClientRect();
    return { k: +p.dataset.datePickerMonth, l: Math.round(r.left * 10) / 10, w: Math.round(r.width) };
  });
  const box = picker.querySelector('.dp-title-face').getBoundingClientRect();
  const faces = [...picker.querySelectorAll('.dp-title-face > span')].map((f) => {
    const r = f.getBoundingClientRect();
    return { t: f.textContent.trim(), x: Math.round(r.left * 10) / 10, w: Math.round(r.width), o: +getComputedStyle(f).opacity };
  });
  return {
    open: true,
    top: Math.round(s.top * 10) / 10, h: Math.round(s.height), seen: Math.round(seen * 100) / 100,
    shown: Math.round((1 - clipShut) * 100) / 100, op: +getComputedStyle(surface).opacity,
    vl: v.left, vw: v.width, panels, fl: box.left, fw: box.width, faces
  };
`;

/** What the sampler saw, judged frame against frame. */
function findYanks(samples, { bound = false } = {}) {
  const yanks = [];
  const open = samples.filter((s) => s.open);
  const visible = (s, p) => p.l < s.vl + s.vw - 2 && p.l + p.w > s.vl + 2;
  const amount = (s) => Math.min(s.seen, s.shown, s.op);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const was = samples[i - 1];
    if (!s.open) {
      if (was?.open && amount(was) > 0.45) yanks.push({ t: s.t, what: `surface gone from ${amount(was)}` });
      continue;
    }
    if (!was?.open) {
      if (i > 0 && amount(s) > 0.45) yanks.push({ t: s.t, what: `surface appears at ${amount(s)}` });
      continue;
    }
    if (Math.abs(amount(s) - amount(was)) > 0.45) yanks.push({ t: s.t, what: `surface ${amount(was)} to ${amount(s)} in one frame` });
    for (const p of s.panels) {
      const before = was.panels.find((q) => q.k === p.k);
      if (before && Math.abs(before.l - p.l) > s.vw * 0.5) yanks.push({ t: s.t, k: p.k, what: `month jumps ${Math.round(p.l - before.l)}px` });
      if (!before && visible(s, p)) yanks.push({ t: s.t, k: p.k, what: 'month painted on screen with no frame before it' });
    }
    for (const q of was.panels) {
      if (visible(was, q) && !s.panels.some((p) => p.k === q.k)) yanks.push({ t: s.t, k: q.k, what: 'month gone from the screen in one frame' });
    }
    if (!bound) {
      const spans = s.panels.map((p) => [Math.max(p.l, s.vl), Math.min(p.l + p.w, s.vl + s.vw)]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
      let edge = s.vl;
      let gap = 0;
      for (const [a, b] of spans) {
        gap = Math.max(gap, a - edge);
        edge = Math.max(edge, b);
      }
      gap = Math.max(gap, s.vl + s.vw - edge);
      if (gap > GUTTER + 2) yanks.push({ t: s.t, what: `${Math.round(gap)}px of the grid shows no month` });
    }
    const inBox = (f) => f.x < s.fl + s.fw && f.x + f.w > s.fl && f.o > 0.05;
    if (!s.faces.some(inBox)) yanks.push({ t: s.t, what: 'no title in its box' });
    for (const f of s.faces) {
      const known = was.faces.some((g) => g.t === f.t);
      if (!known && Math.abs(f.x - s.fl) < 2 && f.o > 0.9 && was.faces.length) yanks.push({ t: s.t, what: `title "${f.t}" painted where it lands` });
    }
  }
  return { yanks, frames: open.length };
}

async function newPage(width, theme) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: width < 1024,
    timezoneId: 'Europe/Warsaw'
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, theme };
}

async function settle({ page, theme }, path) {
  await settlePage(page, base, path, theme);
}

const title = (page) => page.locator('[data-date-picker] [data-date-picker-title]').textContent().then((t) => t.trim());

/* The picker settled: open, focused, and no animation running on it. */
async function pickerAtRest(page) {
  await page.waitForFunction(() => {
    const picker = document.querySelector('[data-date-picker]');
    if (!picker || !picker.contains(document.activeElement)) return false;
    const surface = picker.closest('[data-sheet]') ?? picker;
    return [surface, ...surface.querySelectorAll('*')].every((el) => el.getAnimations().every((a) => a.playState !== 'running'));
  });
}

async function touchDrag(cdp, page, dx, { steps = 12, stepMs = 16, dy = 0 } = {}) {
  const box = await page.locator('[data-date-picker-viewport]').boundingBox();
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
    await wait(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function record(session, name, act, { crop, bound = false, note } = {}) {
  const { page, cdp } = session;
  const frames = [];
  const started = Date.now();
  const onFrame = async ({ data, sessionId }) => {
    frames.push({ at: Date.now() - started, data });
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId });
    } catch {
      /* Stopped between this frame and its ack. */
    }
  };
  if (outDir) {
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  }
  await wait(80);
  await startSampling(page, SAMPLE);
  const actAt = Date.now() - started;
  await act();
  await wait(SCENE_MS);
  const samples = await stopSampling(page);
  if (outDir) {
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);
  }
  const { yanks, frames: counted } = findYanks(samples, { bound });
  const written = [];
  if (outDir) {
    for (const [i, frame] of frames.entries()) {
      const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
      await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
      written.push({ file, at: frame.at - actAt });
    }
  }
  scenes.push({ name, note, frames: written, crop, yanks, samples: samples.map((s) => ({ t: s.t, top: s.top, seen: s.seen, shown: s.shown, x: s.panels?.find((p) => Math.abs(p.l - s.vl) < s.vw / 2)?.l })) });
  console.log(`${name}: ${written.length} frames, ${samples.length} samples (${counted} open), ${yanks.length} yank(s)`);
  for (const y of yanks.slice(0, 8)) console.log(`   ${y.t}ms ${y.k ?? ''} ${y.what}`);
  if (yanks.length) failures.push(`${name}: ${yanks.length} yank(s)`);
}

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.log(`FAIL ${name}: ${error.message}`);
    failures.push(name);
  }
}

/* The crop is the picker's own surface at rest, whatever host it is in. */
async function surfaceCrop(page) {
  const box = await page.evaluate(() => {
    const picker = document.querySelector('[data-date-picker]');
    const r = (picker.closest('[data-sheet]') ?? picker).getBoundingClientRect();
    return { left: Math.max(0, Math.floor(r.left) - 8), top: Math.max(0, Math.floor(r.top) - 8), width: Math.ceil(r.width) + 16, height: Math.ceil(Math.min(r.height, innerHeight - r.top)) + 16 };
  });
  return box;
}

try {
  for (const theme of themes) {
    /* The phone: a sheet over the appointment sheet. */
    const phone = await newPage(390, theme);
    const { page, cdp } = phone;
    await settle(phone, '/health/appointments');
    await page.locator('[data-add]').click();
    await page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
    await wait(500);
    await record(phone, `open-${theme}`, () => page.locator('#appointment-date').click(), { note: 'tap on the field: the sheet rises' });
    await pickerAtRest(page);
    const crop = await surfaceCrop(page);
    scenes.at(-1).crop = crop;

    let before = await title(page);
    await record(phone, `next-month-${theme}`, () => page.locator('[data-date-picker-next]').click(), { crop, note: 'the next-month arrow' });
    await pickerAtRest(page);
    const afterArrow = await title(page);
    await check(`${theme}: the arrow turns the month`, async () => assert.notEqual(afterArrow, before));

    before = await title(page);
    await record(phone, `swipe-turn-${theme}`, () => touchDrag(cdp, page, -150), { crop, note: 'a finger drags 150px left and lets go: past the threshold, the month turns' });
    await pickerAtRest(page);
    const turned = await title(page);
    await check(`${theme}: a swipe past the threshold turns the month`, async () => assert.notEqual(turned, before));

    before = await title(page);
    await record(phone, `swipe-back-${theme}`, () => touchDrag(cdp, page, 150), { crop, note: 'the same drag to the right: the previous month' });
    await pickerAtRest(page);
    await check(`${theme}: a swipe right turns back`, async () => assert.notEqual(await title(page), before));

    before = await title(page);
    await record(phone, `spring-back-${theme}`, () => touchDrag(cdp, page, -50, { steps: 12, stepMs: 40 }), { crop, note: 'a slow 50px drag: under the threshold, the grid springs back' });
    await pickerAtRest(page);
    const held = await title(page);
    await check(`${theme}: a short slow drag springs back`, async () => assert.equal(held, before));

    for (let i = 0; i < 3; i++) {
      await page.locator('[data-date-picker-prev]').click();
      await pickerAtRest(page);
    }
    await record(phone, `today-${theme}`, () => page.locator('[data-date-picker-today]').click(), { crop, note: 'Today, three months away: one month width of travel to it' });
    await pickerAtRest(page);

    await record(phone, `drum-open-${theme}`, () => page.locator('[data-date-picker-title]').click(), { crop, note: 'the title opens the month drum over the grid' });
    await page.waitForTimeout(200);
    await record(phone, `drum-pick-${theme}`, () => page.locator('[data-date-picker] [data-month-jump="2"]').click(), { crop, note: 'picking March: the drum leaves and the grid travels to it' });
    await pickerAtRest(page);

    await record(phone, `close-${theme}`, () => page.keyboard.press('Escape'), { crop, note: 'Escape: the sheet goes back down' });
    await page.locator('[data-date-picker]').waitFor({ state: 'detached' });

    /* A bound: the journal book's end stops at today. */
    await settle(phone, '/settings/journal-book');
    await page.locator('#journal-book-end').click();
    await pickerAtRest(page);
    before = await title(page);
    await record(phone, `bound-stretch-${theme}`, () => touchDrag(cdp, page, -180), { crop: await surfaceCrop(page), bound: true, note: 'dragging past today, the last month there is: the grid stretches and springs back' });
    await pickerAtRest(page);
    await check(`${theme}: a drag past the bound does not turn the month`, async () => assert.equal(await title(page), before));
    await phone.context.close();

    /* The desktop: a popover unrolling from the field. */
    const desk = await newPage(1280, theme);
    await settle(desk, '/health/appointments');
    await desk.page.locator('[data-add]').click();
    await desk.page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
    await wait(500);
    await record(desk, `popover-open-${theme}`, () => desk.page.locator('#appointment-date').click(), { note: 'desktop: the popover unrolls from the field' });
    await pickerAtRest(desk.page);
    const deskCrop = await surfaceCrop(desk.page);
    scenes.at(-1).crop = deskCrop;
    before = await title(desk.page);
    await record(desk, `popover-wheel-${theme}`, async () => {
      const box = await desk.page.locator('[data-date-picker-viewport]').boundingBox();
      await desk.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let i = 0; i < 10; i++) {
        await desk.page.mouse.wheel(14, 0);
        await wait(16);
      }
    }, { crop: deskCrop, note: 'desktop: a two-finger trackpad swipe' });
    await pickerAtRest(desk.page);
    await check(`${theme}: a trackpad swipe turns the month`, async () => assert.notEqual(await title(desk.page), before));
    await record(desk, `popover-close-${theme}`, () => desk.page.keyboard.press('Escape'), { crop: deskCrop, note: 'desktop: Escape rolls it back up' });
    await desk.context.close();
  }

  /* Reduced motion substitutes a crossfade for the slide. */
  const reduced = await newPage(390, 'light');
  await reduced.page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(reduced, '/health/appointments');
  await reduced.page.locator('[data-add]').click();
  await reduced.page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
  await reduced.page.locator('#appointment-date').click();
  await pickerAtRest(reduced.page);
  await record(reduced, 'next-month-reduced-light', () => reduced.page.locator('[data-date-picker-next]').click(), { crop: await surfaceCrop(reduced.page), note: 'reduced motion: the month crossfades instead of sliding' });
  await reduced.context.close();
} finally {
  if (outDir) await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ scenes }, null, 1));
  await browser.close();
  await app.httpServer.close();
}

console.log(failures.length ? `\n${failures.length} failure(s):\n  ${failures.join('\n  ')}` : '\nno yanks, every outcome as expected');
if (gate && failures.length) process.exit(1);

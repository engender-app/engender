/* The time picker, driven and recorded (phase 12 pickers, ticket 02): what
   it does - arrows step a drum, a tap on a row brings it to the band, a
   finger flick comes to rest on a row and writes it into the entry, a typed
   time turns both drums, Use time commits, Escape leaves the value alone
   and gives focus back to the field, Clear only where the field is
   optional, and a swipe on a drum turns the drum rather than pulling the
   sheet down - and how it moves while it does, every frame Chromium's
   screencast paints beside a rAF sampler reading the drums.

     VITE_DEMO=1 npm run build && node tests/time-picker-check.mjs [--out /abs/dir] [--gate]

   The yank test is the spec's mechanical one: nothing painted at its
   destination before it travelled there, no frame with the thing in
   neither place. Per sample: the surface arriving or leaving more than 45%
   of itself in one frame, and a drum moving its whole window (five rows)
   or more in one frame where nothing hid it (a reduced-motion move happens
   at opacity 0): past that no row is seen in two frames running, which is
   the drum in neither place. A typed time far from the current one spins
   fast - 38 minute rows peak near 3.7 rows a frame on Chromium's smooth
   scroll - and that is travel, not a cut; the peak is printed per scene.
   Every scene that ends at rest also asserts the drum rests on a whole
   row.

   `--out` keeps frames and a manifest for tests/panel-motion-flipbook.mjs;
   `--gate` exits non-zero on any yank or wrong outcome. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { startSampling, stopSampling } from './motion-sampling.mjs';
import { findSurfaceYanks } from './picker-motion-yanks.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : null;
};
const outDir = flag('out') ? resolve(flag('out')) : null;
const gate = args.includes('--gate');
const themes = (flag('themes') ?? 'light,dark').split(',');
const SCENE_MS = 1100;
const ROW = 48;
const WINDOW = 5 * ROW;

if (outDir) await mkdir(outDir, { recursive: true });
const app = await previewBuild(flag('root') ?? process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const scenes = [];
const failures = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SAMPLE = `
  const picker = document.querySelector('[data-time-picker]');
  if (!picker) return { open: false };
  const surface = picker.closest('[data-sheet]') ?? picker;
  const s = surface.getBoundingClientRect();
  const clip = getComputedStyle(surface).clipPath;
  const shut = clip.startsWith('inset(') ? [...clip.matchAll(/([\\d.]+)%/g)].map((m) => +m[1]) : [];
  const clipShut = shut.length ? Math.max(...shut) / 100 : 0;
  const seen = Math.max(0, Math.min(s.bottom, innerHeight) - Math.max(s.top, 0)) / Math.max(1, s.height);
  const drums = Object.fromEntries([...picker.querySelectorAll('[data-time-picker-drum]')].map((d) => [
    d.dataset.timePickerDrum, { y: Math.round(d.scrollTop * 10) / 10, op: +getComputedStyle(d).opacity }
  ]));
  return {
    open: true,
    top: Math.round(s.top * 10) / 10, seen: Math.round(seen * 100) / 100,
    shown: Math.round((1 - clipShut) * 100) / 100, op: +getComputedStyle(surface).opacity, drums
  };
`;

function findYanks(samples) {
  const yanks = findSurfaceYanks(samples);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const was = samples[i - 1];
    if (!s.open || !was?.open) continue;
    for (const [key, d] of Object.entries(s.drums)) {
      const before = was.drums[key];
      if (!before) continue;
      const hidden = d.op < 0.05 || before.op < 0.05;
      if (!hidden && Math.abs(d.y - before.y) >= WINDOW) yanks.push({ t: s.t, what: `${key} drum moves ${Math.round(d.y - before.y)}px in one frame` });
    }
  }
  return yanks;
}

async function newPage(width, theme, { reducedMotion } = {}) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: width < 1024,
    timezoneId: 'Europe/Warsaw',
    reducedMotion
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp, theme };
}

/* The picker settled: open, focus inside it, no animation running, and
   no drum still scrolling. */
async function pickerAtRest(page) {
  await page.evaluate(() => (window.__tpLast = null));
  await page.waitForTimeout(50);
  await page.waitForFunction(() => {
    const picker = document.querySelector('[data-time-picker]');
    if (!picker || !picker.contains(document.activeElement)) return false;
    const surface = picker.closest('[data-sheet]') ?? picker;
    if (![surface, ...surface.querySelectorAll('*')].every((el) => el.getAnimations().every((a) => a.playState !== 'running'))) return false;
    const now = [...picker.querySelectorAll('[data-time-picker-drum]')].map((d) => d.scrollTop).join();
    const still = window.__tpLast === now;
    window.__tpLast = now;
    return still;
  }, null, { polling: 150 });
}

const drum = (page, key) => page.locator(`[data-time-picker] [data-time-picker-drum="${key}"]`);
const entry = (page) => page.locator('[data-time-picker] [data-time-picker-entry]');
const state = (page) =>
  page.evaluate(() => {
    const read = (key) => {
      const d = document.querySelector(`[data-time-picker-drum="${key}"]`);
      return { now: +d.getAttribute('aria-valuenow'), y: d.scrollTop };
    };
    return { hour: read('hour'), minute: read('minute'), entry: document.querySelector('[data-time-picker-entry]').value };
  });

async function assertRestsOnRow(page, label) {
  const s = await state(page);
  for (const key of ['hour', 'minute']) {
    assert.equal(s[key].y % ROW, 0, `${label}: ${key} drum rests between rows at ${s[key].y}`);
    assert.equal(s[key].y / ROW, s[key].now, `${label}: ${key} drum shows ${s[key].y / ROW} but says ${s[key].now}`);
  }
  const pad = (n) => String(n).padStart(2, '0');
  assert.equal(s.entry, `${pad(s.hour.now)}:${pad(s.minute.now)}`, `${label}: the entry does not say what the drums do`);
  return s;
}

async function touchDrag(cdp, page, key, dy, { steps = 6, stepMs = 16 } = {}) {
  const box = await drum(page, key).boundingBox();
  const x = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (dy * i) / steps }] });
    await wait(stepMs);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function record(session, name, act, { crop, note } = {}) {
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
  const yanks = findYanks(samples);
  const written = [];
  if (outDir) {
    for (const [i, frame] of frames.entries()) {
      const file = `${name}-${String(i).padStart(3, '0')}.jpg`;
      await writeFile(resolve(outDir, file), Buffer.from(frame.data, 'base64'));
      written.push({ file, at: frame.at - actAt });
    }
  }
  const peak = Math.max(0, ...samples.slice(1).flatMap((s, i) => (s.open && samples[i].open ? Object.keys(s.drums).map((k) => Math.abs(s.drums[k].y - (samples[i].drums[k]?.y ?? s.drums[k].y))) : [])));
  scenes.push({ name, note, frames: written, crop, yanks, samples: samples.map((s) => ({ t: s.t, top: s.top, seen: s.seen, shown: s.shown, hour: s.drums?.hour?.y, minute: s.drums?.minute?.y })) });
  console.log(`${name}: ${written.length} frames, ${samples.length} samples, peak drum step ${Math.round(peak)}px, ${yanks.length} yank(s)`);
  for (const y of yanks.slice(0, 8)) console.log(`   ${y.t}ms ${y.what}`);
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

async function surfaceCrop(page) {
  return page.evaluate(() => {
    const picker = document.querySelector('[data-time-picker]');
    const r = (picker.closest('[data-sheet]') ?? picker).getBoundingClientRect();
    return { left: Math.max(0, Math.floor(r.left) - 8), top: Math.max(0, Math.floor(r.top) - 8), width: Math.ceil(r.width) + 16, height: Math.ceil(Math.min(r.height, innerHeight - r.top)) + 16 };
  });
}

const sheetTop = (page) => page.evaluate(() => document.querySelector('[data-time-picker]')?.closest('[data-sheet]')?.getBoundingClientRect().top ?? null);

try {
  for (const theme of themes) {
    /* The phone: a sheet over the new-reminder screen, which always
       stores a time. */
    const phone = await newPage(390, theme);
    const { page, cdp } = phone;
    await settlePage(page, base, '/settings/reminders/new', theme);
    const field = page.locator('#r-time');
    const stored = await field.inputValue();

    await record(phone, `open-${theme}`, () => field.click(), { note: 'tap on the field: the sheet rises with the drums already on the stored time' });
    await pickerAtRest(page);
    const crop = await surfaceCrop(page);
    scenes.at(-1).crop = crop;
    await check(`${theme}: opens on the stored time with the hour drum focused`, async () => {
      const s = await assertRestsOnRow(page, 'open');
      assert.equal(s.entry, stored);
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.timePickerDrum), 'hour');
      assert.equal(await page.locator('[data-time-picker-clear]').count(), 0, 'a required field offers Clear');
    });

    let before = await state(page);
    await record(phone, `arrow-${theme}`, async () => {
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowUp');
    }, { crop, note: 'ArrowUp twice on the hour drum: two rows of travel' });
    await pickerAtRest(page);
    await check(`${theme}: arrows step the hour and the drum says so`, async () => {
      const s = await assertRestsOnRow(page, 'arrow');
      assert.equal(s.hour.now, Math.min(23, before.hour.now + 2));
      assert.equal(await drum(page, 'hour').getAttribute('aria-valuetext'), String(s.hour.now).padStart(2, '0'));
    });

    before = await state(page);
    await record(phone, `tap-row-${theme}`, async () => {
      const box = await drum(page, 'minute').boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2 + 2 * ROW);
    }, { crop, note: 'a tap on the row two below the band brings it up to the band' });
    await pickerAtRest(page);
    await check(`${theme}: a tap on a row brings it to the band`, async () => {
      const s = await assertRestsOnRow(page, 'tap');
      assert.equal(s.minute.now, before.minute.now + 2);
    });

    const top = await sheetTop(page);
    before = await state(page);
    await record(phone, `flick-${theme}`, () => touchDrag(cdp, page, 'minute', -180), { crop, note: 'a finger flicks the minute drum up: it carries on and comes to rest on a row' });
    await pickerAtRest(page);
    await check(`${theme}: a flick turns the minutes, rests on a row, and writes the entry`, async () => {
      const s = await assertRestsOnRow(page, 'flick');
      assert.ok(s.minute.now > before.minute.now + 2, `the flick only reached ${s.minute.now} from ${before.minute.now}`);
    });
    /* At 00 the drum has nothing above it to scroll to, which is where
       the sheet's own drag-to-dismiss would take a downward swipe. */
    await drum(page, 'hour').focus();
    await page.keyboard.press('Home');
    await pickerAtRest(page);
    await record(phone, `pull-down-${theme}`, () => touchDrag(cdp, page, 'hour', 160), { crop, note: 'a finger pulls the hour drum down at 00: the drum stretches, the sheet stays put' });
    await check(`${theme}: a downward swipe on a drum at its end leaves the sheet where it is`, async () => {
      await pickerAtRest(page);
      const tops = scenes.at(-1).samples.filter((x) => x.top !== undefined).map((x) => x.top);
      const drift = Math.max(...tops.map((t) => Math.abs(t - top)));
      assert.ok(drift < 1, `the sheet moved ${drift}px under a swipe on the drum`);
      await assertRestsOnRow(page, 'pull-down');
    });

    await record(phone, `typed-${theme}`, async () => {
      await entry(page).fill('7:45');
    }, { crop, note: 'typing 7:45: both drums travel to it' });
    await entry(page).focus();
    await pickerAtRest(page);
    await check(`${theme}: a typed time turns both drums`, async () => {
      const s = await state(page);
      assert.equal(s.hour.now, 7);
      assert.equal(s.minute.now, 45);
      assert.equal(s.hour.y, 7 * ROW);
      assert.equal(s.minute.y, 45 * ROW);
    });

    await check(`${theme}: a time that is not one is refused`, async () => {
      await entry(page).fill('25:10');
      await page.locator('[data-time-picker-apply]').click();
      assert.equal(await page.locator('[data-time-picker]').count(), 1);
      assert.equal(await entry(page).evaluate((el) => el.validity.valid), false);
      await entry(page).fill('07:45');
    });

    await record(phone, `apply-${theme}`, () => page.locator('[data-time-picker-apply]').click(), { crop, note: 'Use time: the sheet goes back down' });
    await page.locator('[data-time-picker]').waitFor({ state: 'detached' });
    await check(`${theme}: Use time writes HH:MM into the field`, async () => {
      assert.equal(await field.inputValue(), '07:45');
    });

    await field.click();
    await pickerAtRest(page);
    await page.keyboard.press('ArrowDown');
    await pickerAtRest(page);
    await record(phone, `close-${theme}`, () => page.keyboard.press('Escape'), { crop, note: 'Escape: the sheet goes back down and the value is left as it was' });
    await page.locator('[data-time-picker]').waitFor({ state: 'detached' });
    await check(`${theme}: Escape leaves the value and gives focus back to the field`, async () => {
      assert.equal(await field.inputValue(), '07:45');
      await page.waitForFunction(() => document.activeElement?.id === 'r-time', null, { timeout: 2000 });
    });
    await check(`${theme}: Enter straight after an arrow commits the stepped time, not the one before`, async () => {
      await field.click();
      await pickerAtRest(page);
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await page.locator('[data-time-picker]').waitFor({ state: 'detached' });
      assert.equal(await field.inputValue(), '08:45');
    });
    await phone.context.close();

    /* An optional field: the lab draw time offers Clear. */
    const lab = await newPage(390, theme);
    await settlePage(lab.page, base, '/care/labs', theme);
    await lab.page.locator('[data-add]').click();
    await lab.page.locator('#lab-time').click();
    await pickerAtRest(lab.page);
    await check(`${theme}: finishing a drum move cannot replace a partially typed time`, async () => {
      await entry(lab.page).fill('23:59');
      await entry(lab.page).fill('09:');
      await pickerAtRest(lab.page);
      assert.equal(await entry(lab.page).inputValue(), '09:');
      await lab.page.locator('[data-time-picker-apply]').click();
      assert.equal(await lab.page.locator('[data-time-picker]').count(), 1);
      assert.equal(await entry(lab.page).evaluate((el) => el.validity.valid), false);
    });
    await check(`${theme}: an optional field offers Clear and Clear empties it`, async () => {
      await entry(lab.page).fill('09:15');
      await lab.page.locator('[data-time-picker-apply]').click();
      await lab.page.locator('[data-time-picker]').waitFor({ state: 'detached' });
      assert.equal(await lab.page.locator('#lab-time').inputValue(), '09:15');
      await lab.page.locator('#lab-time').click();
      await pickerAtRest(lab.page);
      await lab.page.locator('[data-time-picker-clear]').click();
      await lab.page.locator('[data-time-picker]').waitFor({ state: 'detached' });
      assert.equal(await lab.page.locator('#lab-time').inputValue(), '');
    });
    await lab.context.close();

    /* The desktop: the popover, a wheel on the hour drum, Escape. */
    const desk = await newPage(1280, theme);
    await settlePage(desk.page, base, '/settings/reminders/new', theme);
    const deskField = desk.page.locator('#r-time');
    await record(desk, `popover-open-${theme}`, () => deskField.click(), { note: 'desktop: the popover unrolls from the field' });
    await pickerAtRest(desk.page);
    const deskCrop = await surfaceCrop(desk.page);
    scenes.at(-1).crop = deskCrop;
    before = await state(desk.page);
    await record(desk, `popover-wheel-${theme}`, async () => {
      const box = await drum(desk.page, 'hour').boundingBox();
      await desk.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await desk.page.mouse.wheel(0, -100);
    }, { crop: deskCrop, note: 'desktop: one wheel notch back on the hour drum' });
    await pickerAtRest(desk.page);
    await check(`${theme}: a wheel turns a drum and it rests on a row`, async () => {
      const s = await assertRestsOnRow(desk.page, 'wheel');
      assert.ok(s.hour.now < before.hour.now, `the wheel left the hour at ${s.hour.now}`);
    });
    await desk.page.locator('[data-time-picker-drum="hour"]').focus();
    await record(desk, `popover-close-${theme}`, () => desk.page.keyboard.press('Escape'), { crop: deskCrop, note: 'desktop: Escape rolls it back up into the field' });
    await check(`${theme}: desktop Escape gives focus back to the field`, async () => {
      await desk.page.waitForFunction(() => document.activeElement?.id === 'r-time', null, { timeout: 2000 });
    });
    await desk.context.close();
  }

  /* Reduced motion: a turned drum fades out, moves, and fades back. */
  const reduced = await newPage(390, 'light', { reducedMotion: 'reduce' });
  await settlePage(reduced.page, base, '/settings/reminders/new', 'light');
  await reduced.page.locator('#r-time').click();
  await pickerAtRest(reduced.page);
  await record(reduced, 'typed-reduced-light', () => entry(reduced.page).fill('03:10'), { crop: await surfaceCrop(reduced.page), note: 'reduced motion: the drums fade to the typed time instead of travelling' });
  await entry(reduced.page).focus();
  await pickerAtRest(reduced.page);
  await check('reduced motion still lands the drums on the typed time', async () => {
    const s = await state(reduced.page);
    assert.equal(s.hour.y, 3 * ROW);
    assert.equal(s.minute.y, 10 * ROW);
  });
  await reduced.context.close();
} finally {
  if (outDir) await writeFile(resolve(outDir, 'manifest.json'), JSON.stringify({ scenes }, null, 1));
  await browser.close();
  await app.httpServer.close();
}

console.log(failures.length ? `\n${failures.length} failure(s):\n  ${failures.join('\n  ')}` : '\nno yanks, every outcome as expected');
if (gate && failures.length) process.exit(1);

/* Real-browser check for the Measurements / Sizes in-page jump (phase 11
   pre-production UI/UX ticket 29), mirroring the hair-progress jump
   check's shape: a dev server, the real control-kit, no demo bar.

   What it proves:
   - a jump control naming both halves sits near the start of the screen;
   - picking Sizes scrolls the size log into view and lands focus on it,
     and a jump back does the same for the measurements half;
   - the selected measurement type, an open editor sheet and its unsaved
     input survive the jump (acceptance: switching preserves them);
   - at 320px in Polish, a long custom dimension label keeps its overflow
     affordance and stays reachable, including by keyboard.

   Run against a dev server (no build needed):
     node tests/measurements-sizes-jump-check.mjs */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const outDir = '.claude/measurements-jump-shots';
await mkdir(outDir, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/measurements-jump-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();

const browser = await launchChromium();
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  reducedMotion: 'reduce'
});
page.setDefaultTimeout(15000);

const errors = [];
page.on('pageerror', (err) => errors.push(err.message));

async function visit(href) {
  await page.evaluate((url) => {
    const link = document.createElement('a');
    link.href = url;
    link.id = 'jump-test-link';
    link.textContent = 'Open';
    document.body.append(link);
  }, href);
  await page.locator('#jump-test-link').click();
  await page.evaluate(() => document.querySelector('#jump-test-link')?.remove());
  await page.waitForURL((url) => url.pathname === href.split('#')[0]);
  await page.waitForTimeout(200);
}

/* A box inside the app frame rather than inside the window: the frame's
   own top edge is where the screen starts, however the harness sits. */
const frameBox = (selector) =>
  page.evaluate((sel) => {
    const frame = document.querySelector('[data-app-root]').getBoundingClientRect();
    const el = document.querySelector(sel);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { top: box.top - frame.top, bottom: box.bottom - frame.top, height: frame.height };
  }, selector);

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }

  // Seed both halves so neither renders its empty state
  await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    for (const [day, value] of [[19990, 80], [20000, 78], [20010, 77]]) {
      await j.measurements.upsertMeasurement({ epochDay: day, type: 'waist', value, unit: 'cm' });
      await j.measurements.upsertMeasurement({ epochDay: day, type: 'hips', value: value + 9, unit: 'cm' });
    }
    await j.sizeRecords.upsertRecord({
      epochDay: 20000,
      category: 'pants',
      size: '32',
      brand: 'H&M',
      fitNote: 'true to size'
    });
  });

  await visit('/body/measurements');
  await page.waitForSelector('[data-measurements-jump]');
  await page.waitForSelector('#sizes-log');
  await page.waitForSelector('[data-measurement]');

  // The jump control names both halves and sits near the start
  const jump = await frameBox('[data-measurements-jump]');
  assert(jump && jump.top < 400, `Jump control should sit near the start, got top=${jump?.top}`);
  const measurementsActive = await page
    .locator('[data-measurements-jump] [data-segment="measurements"]')
    .getAttribute('aria-checked');
  assert.equal(measurementsActive, 'true', 'Measurements segment should be active on arrival');

  // The finding, reproduced: the size log starts well below the fold
  const sizesAtLoad = await frameBox('#sizes-log');
  assert(sizesAtLoad && sizesAtLoad.top > 844, 'Size log should start below the fold on arrival');

  await page.screenshot({ path: `${outDir}/01-arrival.png` });

  // Pick the hips dimension and open an editor with an unsaved value;
  // the date field arrives prefilled with today
  await page.locator('[data-segment="hips"]').click();
  const hipsChecked = await page.locator('[data-segment="hips"]').getAttribute('aria-checked');
  assert.equal(hipsChecked, 'true', 'Hips should be the selected dimension');
  await page.locator('[data-add]').click();
  await page.waitForSelector('[data-sheet] input[name="measurement-value"]');
  await page.locator('[data-sheet] input[name="measurement-value"]').fill('55.5');
  // The visible date field is flatpickr's alt input; the bound input it
  // fronts carries the draft's date and is what preservation is about
  const dateBefore = await page.locator('[data-sheet] input[name="measurement-date"]').inputValue();
  assert(dateBefore, 'The new editor should arrive with a date');

  // While the editor is open it owns the screen: the jump control sits
  // under the sheet's scrim, so a tap there cannot jump away from the
  // draft (the sheet's own dismissal policy, not the jump's, decides
  // what happens to an unsaved input), and the draft's value and date
  // are still exactly as left
  const blocked = await page.evaluate(() => {
    const jump = document.querySelector('[data-measurements-jump] [data-segment="sizes"]');
    const box = jump.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return Boolean(hit?.closest('[data-sheet], [data-sheet-scrim]'));
  });
  assert(blocked, 'An open editor must block the jump control');
  assert.equal(await page.locator('[data-sheet] input[name="measurement-value"]').inputValue(), '55.5');
  assert.equal(await page.locator('[data-sheet] input[name="measurement-date"]').inputValue(), dateBefore);

  // Closing a changed draft offers the discard choice, and only then is
  // the jump reachable - switching preserves the selected dimension
  // because a jump moves nothing but the scroll
  await page.locator('[data-close-record]').click();
  const discard = page.locator('[data-discard-record]');
  assert(await discard.count(), 'Closing a changed draft must offer the discard choice');
  await discard.click();
  await page.waitForTimeout(200);

  // Jump to Sizes: the log scrolls into view and focus lands on its
  // heading, with the selected dimension untouched. The scroll offset is
  // remembered: jumping back must land where the jump left, not at the
  // top of the screen.
  const scrollBefore = await page.evaluate(() => document.querySelector('[data-app-scroll-region]').scrollTop);
  await page.locator('[data-measurements-jump] [data-segment="sizes"]').click();
  await page.waitForTimeout(400);
  const sizesJumped = await frameBox('#sizes-log');
  assert(sizesJumped && sizesJumped.top < 300, `Sizes heading should be in view after the jump, got top=${sizesJumped?.top}`);
  const sizesActive = await page
    .locator('[data-measurements-jump] [data-segment="sizes"]')
    .getAttribute('aria-checked');
  assert.equal(sizesActive, 'true', 'Sizes segment should be active after jumping');
  const focusedId = await page.evaluate(() => document.activeElement?.closest('[id]')?.id ?? document.activeElement?.tagName.toLowerCase());
  assert.equal(focusedId, 'sizes-log', `Focus should land on the sizes heading, got ${focusedId}`);
  const hipsAfter = await page.locator('[data-segment="hips"]').getAttribute('aria-checked');
  assert.equal(hipsAfter, 'true', 'Selected dimension must survive the jump');

  await page.screenshot({ path: `${outDir}/02-sizes-jumped.png` });

  // Jump back: the measurements half comes back into view where it was
  // left, and its picker carries focus
  await page.locator('[data-jump-measurements]').click();
  await page.waitForTimeout(400);
  const scrollAfter = await page.evaluate(() => document.querySelector('[data-app-scroll-region]').scrollTop);
  assert(
    Math.abs(scrollAfter - scrollBefore) < 5,
    `Jumping back should restore the scroll offset, got ${scrollAfter} vs ${scrollBefore}`
  );
  const readingBack = await frameBox('#measurements-picker');
  assert(readingBack && readingBack.top < 600, `Measurements anchor should be back in view, got top=${readingBack?.top}`);
  const backActive = await page
    .locator('[data-measurements-jump] [data-segment="measurements"]')
    .getAttribute('aria-checked');
  assert.equal(backActive, 'true', 'Measurements segment should be active after jumping back');

  await page.screenshot({ path: `${outDir}/03-measurements-back.png` });

  // Keyboard: the type picker is reachable and its options scroll into
  // view as arrows move through it. The picker is the radiogroup inside
  // the measurements anchor - the jump's own Segmented is a radiogroup
  // too, and it sits earlier in the screen.
  const typeGroup = () => page.evaluate(() => document.querySelector('#measurements-picker [role="radiogroup"]'));
  assert.notEqual(await typeGroup(), null, 'The measurements anchor should hold the type picker');
  await page.evaluate(() => document.querySelector('#measurements-picker [role="radiogroup"]').focus());
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const keyboardState = await page.evaluate(() => {
    const group = document.querySelector('#measurements-picker [role="radiogroup"]');
    const focus = document.activeElement;
    const onTrack = group.contains(focus);
    if (!onTrack) return { onTrack };
    const box = focus.getBoundingClientRect();
    const track = group.getBoundingClientRect();
    return { onTrack, inView: box.left >= track.left - 1 && box.right <= track.right + 1 };
  });
  assert(keyboardState.onTrack, 'Arrow keys should move through the type options');
  assert(keyboardState.inView, 'The focused option should be scrolled into view');

  // 320px, Polish, a long custom dimension: the picker keeps its overflow
  // affordance and the selected option stays visible
  await page.setViewportSize({ width: 320, height: 690 });
  await visit('/settings');
  await page.locator('[data-segment="pl"]').click();
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const { journal: j } = await import('/src/lib/data/live/journal.svelte.ts');
    await j.measurements.addCustomMeasurementType('Udo w najszerszym miejscu');
  });
  await visit('/body/measurements');
  await page.waitForSelector('[data-measurement]');
  const overflow = await page.evaluate(() => {
    const group = document.querySelector('#measurements-picker [role="radiogroup"]');
    const active = group.querySelector('[aria-checked="true"]');
    const activeBox = active.getBoundingClientRect();
    const trackBox = group.getBoundingClientRect();
    const hint = document.querySelector('#measurements-picker .segmented-hint-end, #measurements-picker .segmented-hint-start');
    return {
      canScroll: group.classList.contains('can-scroll'),
      hintPresent: Boolean(hint),
      activeInView: activeBox.left >= trackBox.left - 1 && activeBox.right <= trackBox.right + 1
    };
  });
  assert(overflow.canScroll || !overflow.hintPresent, 'A track that fits needs no affordance, one that scrolls must say so');
  assert(
    overflow.canScroll === false || overflow.hintPresent === true,
    'An overflowing picker must show its chevron affordance'
  );
  assert(overflow.activeInView, 'The selected dimension must stay visible in the picker');

  // And the long custom label is reachable by keyboard: arrows carry it
  // into view
  await page.evaluate(() => document.querySelector('#measurements-picker [role="radiogroup"]').focus());
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  const customInView = await page.evaluate(() => {
    const group = document.querySelector('#measurements-picker [role="radiogroup"]');
    const focus = document.activeElement;
    if (!group.contains(focus)) return false;
    const box = focus.getBoundingClientRect();
    const track = group.getBoundingClientRect();
    return box.left >= track.left - 1 && box.right <= track.right + 1;
  });
  assert(customInView, 'Keyboard must carry the focused custom label into view');

  // The shared contract's 48px floor holds for everything this ticket
  // added: the jump segments and the way back on the sizes heading
  const hitHeights = await page.evaluate(() => {
    const heights = [];
    for (const el of document.querySelectorAll(
      '[data-measurements-jump] .segment, [data-jump-measurements]'
    )) {
      heights.push(el.getBoundingClientRect().height);
    }
    return heights;
  });
  assert(hitHeights.length >= 3, 'Jump segments and the way back should all be present');
  for (const h of hitHeights) assert(h >= 48, `Interactive targets must meet the 48px floor, got ${h}`);

  await page.screenshot({ path: `${outDir}/04-320-polish.png` });

  assert.equal(errors.length, 0, `Page errors encountered: ${errors.join(', ')}`);
  console.log('PASS measurements sizes jump real-browser check');
} finally {
  await browser.close();
  await server.close();
}

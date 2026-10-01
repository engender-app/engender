import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { preview } from 'vite';
import { launchChromium, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = resolve(process.env.DATE_PICKER_SHOTS ?? '.claude/date-picker-shots');
if (gallery) await mkdir(out, { recursive: true });
const app = await preview({ preview: { port: 0 } });
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const errors = [];
const PICKER = '[data-date-picker]';
async function shot(page, name) {
  if (gallery) await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
}
/* A picker closes on its own exit, so the next step waits for it to have
   gone rather than clicking a field under a scrim that is still leaving. */
async function closed(page) {
  await page.locator(PICKER).waitFor({ state: 'detached' });
}
async function enterDate(page, value) {
  await page.locator(`${PICKER} [data-date-picker-entry]`).fill(value);
  await page.locator(`${PICKER} [data-date-picker-apply]`).click();
}
async function title(page) {
  return (await page.locator(`${PICKER} [data-date-picker-title]`).textContent()).trim();
}
async function open(page, route) {
  await settlePage(page, base, route, 'light');
}
try {
  for (const language of ['en', 'pl']) {
    for (const width of [320, 390, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true, timezoneId: 'Europe/Warsaw' });
      page.on('pageerror', error => errors.push(error.stack));
      await page.addInitScript(language => localStorage.setItem('PARAGLIDE_LOCALE', language), language);
      await open(page, '/health/appointments');
      await page.locator('[data-add]').click();
      const input = page.locator('#appointment-date');
      for (const day of [15, 16]) {
        await input.click();
        const cell = page.locator(`${PICKER} [role="grid"] .dp-day`).filter({ hasText: new RegExp(`^${day}$`) });
        await cell.waitFor();
        /* Measured on the settled sheet, not mid-rise. */
        await page.waitForFunction(() => document.activeElement?.closest('[data-date-picker]'));
        const box = await cell.boundingBox();
        assert.ok(box.width >= 47.99 && box.height >= 47.99, `${language} ${width}px: day ${day} target ${box.width} × ${box.height}`);
        const ownsEdges = await cell.evaluate(el => {
          const r = el.getBoundingClientRect();
          return [[1, r.height / 2], [r.width - 1, r.height / 2], [r.width / 2, 1], [r.width / 2, r.height - 1]]
            .every(([x, y]) => el.contains(document.elementFromPoint(r.x + x, r.y + y)));
        });
        assert.ok(ownsEdges, 'neighboring dates do not overlap hit regions');
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        await closed(page);
        assert.match(await input.inputValue(), new RegExp(`-${day}$`), 'adjacent day selected through actual hit target');
      }

      /* Keyboard parity: ArrowDown opens on the chosen day, arrows move a
         day, PageDown turns a month, Shift+PageDown a year, Enter picks,
         and focus comes back to the field. */
      await input.focus();
      await input.press('ArrowDown');
      await page.waitForFunction(() => document.activeElement?.matches('[data-date-picker] .dp-day'));
      assert.equal((await page.locator(`${PICKER} .dp-day:focus`).textContent()).trim(), '16', 'keyboard starts on selected day');
      await page.keyboard.press('ArrowLeft');
      assert.equal((await page.locator(`${PICKER} .dp-day:focus`).textContent()).trim(), '15', 'day arrow reaches adjacent target');
      const monthBefore = await title(page);
      await page.keyboard.press('PageDown');
      await page.waitForTimeout(400);
      assert.notEqual(await title(page), monthBefore, 'PageDown turns the month');
      assert.equal((await page.locator(`${PICKER} .dp-day:focus`).textContent()).trim(), '15', 'PageDown keeps the day of the month');
      await page.keyboard.press('Shift+PageDown');
      await page.waitForTimeout(400);
      assert.match(await title(page), /2027/, 'Shift+PageDown turns the year');
      await page.keyboard.press('Enter');
      await closed(page);
      assert.match(await input.inputValue(), /^2027-\d\d-15$/, 'Enter picks the day under the cursor');
      assert.equal(await input.evaluate(el => el === document.activeElement), true, 'picking returns focus to the field');

      await input.click();
      await enterDate(page, '2000-02-29');
      await closed(page);
      assert.equal(await input.inputValue(), '2000-02-29', 'historical leap day preserves local date east of UTC');
      await input.click();
      await enterDate(page, '2000-02-30');
      assert.equal(await input.inputValue(), '2000-02-29', 'invalid date does not roll over');
      assert.equal(await page.locator(`${PICKER} [data-date-picker-entry]`).evaluate(el => el.validity.valid), false);

      /* The arrows and the month drum. */
      assert.match(await title(page), /2000/);
      await page.locator(`${PICKER} [data-date-picker-next]`).click();
      await page.waitForTimeout(400);
      assert.match(await title(page), /(march|mar)/i, 'next month button turns the month');
      await page.locator(`${PICKER} [data-date-picker-title]`).click();
      await page.locator(`${PICKER} [data-month-jump="8"]`).click();
      await page.waitForTimeout(400);
      assert.match(await title(page), /(september|wrzesie)/i, 'the month drum jumps to a month');
      await page.locator(`${PICKER} [data-date-picker-title]`).click();
      await page.locator(`${PICKER} .dp-jump`).waitFor();
      await page.keyboard.press('Escape');
      await page.locator(`${PICKER} .dp-jump`).waitFor({ state: 'detached' });
      assert.equal(await page.locator(PICKER).count(), 1, 'Escape closes the drum before the picker');

      const controls = await page.locator(PICKER).evaluate(picker =>
        [...picker.querySelectorAll('button, input')]
          .filter(el => el.getClientRects().length && !el.disabled && !el.closest('[aria-hidden="true"]'))
          .map(el => { const r = el.getBoundingClientRect(); return [el.className, r.width, r.height]; }));
      assert.ok(controls.every(([, width, height]) => width >= 47.99 && height >= 47.99), JSON.stringify(controls));
      await shot(page, `picker-${language}-${width}`);
      await page.keyboard.press('Escape');
      await closed(page);
      assert.equal(await page.locator('[data-sheet]').count(), 1, 'picker Escape preserves parent sheet');
      await page.waitForFunction(() => document.activeElement?.id === 'appointment-date');
      await page.keyboard.press('Escape');
      await page.locator('[data-discard-record]').click();
      await page.waitForSelector('[data-sheet]', { state: 'detached' });

      await open(page, '/settings/journal-book');
      await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      const start = page.locator('#journal-book-start');
      const end = page.locator('#journal-book-end');
      const a = await start.boundingBox(), b = await end.boundingBox();
      assert.ok(b.y >= a.y + a.height, 'range fields stack with enlarged text');
      for (const field of [start, end]) {
        assert.ok(await field.evaluate(el => el.scrollWidth <= el.clientWidth), 'full numeric date fits field at 200% text');
      }
      await end.scrollIntoViewIfNeeded();
      await shot(page, `book-${language}-${width}-text200`);
      await page.evaluate(() => document.documentElement.style.fontSize = '');
      await end.click();
      const previousEnd = await end.inputValue();
      await enterDate(page, '1900-01-01');
      assert.equal(await end.inputValue(), previousEnd, 'range bound rejects a date before start');
      await page.keyboard.press('Escape');
      await closed(page);

      await open(page, '/care/regimen');
      await page.locator('[data-add]').click();
      await page.locator('[data-own]').click();
      const optionalEnd = page.locator('#regimen-end');
      await optionalEnd.click();
      await enterDate(page, '2020-09-30');
      await closed(page);
      assert.equal(await optionalEnd.inputValue(), '2020-09-30');
      await optionalEnd.click();
      await page.locator(`${PICKER} [data-date-picker-clear]`).click();
      await closed(page);
      assert.equal(await optionalEnd.inputValue(), '', 'open-ended range stays empty after clearing');
      await optionalEnd.click();
      await page.keyboard.press('Escape');
      await closed(page);
      assert.equal(await optionalEnd.inputValue(), '', 'opening and dismissing empty end does not choose today');
      await page.close();
      console.log(`PASS ${language} ${width}px: adjacent hits, keyboard, history, drum, bounds, clearing, range text and Escape`);
    }
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 360 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.stack));
  await open(page, '/care/labs');
  await page.locator('[data-add]').click();
  await page.locator('#lab-date').click();
  await enterDate(page, '2001-09-30');
  await closed(page);
  assert.equal(await page.locator('#lab-date').inputValue(), '2001-09-30', 'historical action reachable in short viewport');
  await page.locator('#lab-date').click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => visualViewport.scale), 2);
  await enterDate(page, '2001-10-01');
  await closed(page);
  assert.equal(await page.locator('#lab-date').inputValue(), '2001-10-01', 'date action reachable at real 200% page scale');
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#lab-date').click();
  if (gallery) {
    for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(({ palette, theme }) => {
        document.documentElement.dataset.palette = palette;
        document.documentElement.dataset.theme = theme;
      }, { palette, theme });
      await shot(page, `lab-${palette}-${theme}`);
    }
  }
  await page.close();
  assert.deepEqual(errors, [], 'no browser errors');
  console.log('PASS lab sheet, short viewport, 200% page scale');
} finally {
  await browser.close();
  await app.httpServer.close();
}

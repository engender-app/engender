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
async function shot(page, name) {
  if (gallery) await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' });
}
async function enterDate(page, value) {
  await page.locator('.flatpickr-calendar.open .date-picker-entry input').fill(value);
  await page.locator('.flatpickr-calendar.open .date-picker-entry button').first().click();
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
        if (!await page.locator('.flatpickr-calendar.open').count()) await input.click();
        const cell = page.locator('.flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)').filter({ hasText: new RegExp(`^${day}$`) });
        await cell.scrollIntoViewIfNeeded();
        const box = await cell.boundingBox();
        assert.ok(box.width >= 48 && box.height >= 48, `${language} ${width}px: day ${day} target ${box.width} × ${box.height}`);
        const ownsEdges = await cell.evaluate(el => {
          const r = el.getBoundingClientRect();
          return [[1, r.height / 2], [r.width - 1, r.height / 2], [r.width / 2, 1], [r.width / 2, r.height - 1]]
            .every(([x, y]) => el.contains(document.elementFromPoint(r.x + x, r.y + y)));
        });
        assert.ok(ownsEdges, 'neighboring dates do not overlap hit regions');
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
        assert.match(await input.inputValue(), new RegExp(`-${day}$`), 'adjacent day selected through actual hit target');
      }
      await input.focus();
      await input.press('ArrowDown');
      assert.equal(await page.locator('.flatpickr-day:focus').textContent(), '16', 'keyboard starts on selected day');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('.flatpickr-day:focus').textContent(), '15', 'day arrow reaches adjacent target');
      await enterDate(page, '2000-02-29');
      assert.equal(await input.inputValue(), '2000-02-29', 'historical leap day preserves local date east of UTC');
      await input.click();
      await enterDate(page, '2000-02-30');
      assert.equal(await input.inputValue(), '2000-02-29', 'invalid date does not roll over');
      assert.equal(await page.locator('.date-picker-calendar.open .date-picker-entry input').evaluate(el => el.validity.valid), false);
      await page.keyboard.press('Escape');
      await input.click();
      const month = page.locator('.date-picker-calendar.open .flatpickr-monthDropdown-months');
      await month.selectOption('8');
      assert.equal(await month.inputValue(), '8', 'month dropdown works');
      await month.focus();
      await month.press('ArrowDown');
      assert.equal(await month.inputValue(), '9', 'month dropdown responds to keyboard arrows');
      const year = page.locator('.date-picker-calendar.open .cur-year');
      await year.fill('1999');
      await year.press('Enter');
      assert.equal(await year.inputValue(), '1999', 'direct year navigation works');
      const controls = await page.locator('.date-picker-calendar.open').evaluate(calendar =>
        [...calendar.querySelectorAll('button, input, select, [role="button"], .flatpickr-day')]
          .filter(el => el.getClientRects().length && !el.disabled)
          .map(el => { const r = el.getBoundingClientRect(); return [el.className, r.width, r.height]; }));
      /* A day cell comes back 47.99999px tall in Polish at 320px - a 48px
         row after the grid is divided in floats, not a short target - so
         the floor gets a hundredth of slack. */
      assert.ok(controls.every(([, width, height]) => width >= 47.99 && height >= 47.99), JSON.stringify(controls));
      await shot(page, `picker-${language}-${width}`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('[data-sheet]').count(), 1, 'calendar Escape preserves parent sheet');
      assert.equal(await input.evaluate(el => el === document.activeElement), true, 'calendar Escape restores launcher');
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

      await open(page, '/care/regimen');
      await page.locator('[data-add]').click();
      await page.locator('[data-own]').click();
      if (await page.locator('.flatpickr-calendar.open').count()) await page.keyboard.press('Escape');
      const optionalEnd = page.locator('#regimen-end');
      await optionalEnd.click();
      await enterDate(page, '2020-09-30');
      assert.equal(await optionalEnd.inputValue(), '2020-09-30');
      await optionalEnd.click();
      await page.locator('.date-picker-calendar.open .date-picker-entry button').last().click();
      assert.equal(await optionalEnd.inputValue(), '', 'open-ended range stays empty after clearing');
      await optionalEnd.click();
      await page.keyboard.press('Escape');
      assert.equal(await optionalEnd.inputValue(), '', 'opening and dismissing empty end does not choose today');
      await page.close();
      console.log(`PASS ${language} ${width}px: adjacent hits, history, bounds, clearing, range text and Escape`);
    }
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 360 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.stack));
  await open(page, '/care/labs');
  await page.locator('[data-add]').click();
  if (!await page.locator('.flatpickr-calendar.open').count()) await page.locator('#lab-date').click();
  await enterDate(page, '2001-09-30');
  assert.equal(await page.locator('#lab-date').inputValue(), '2001-09-30', 'historical action reachable in short viewport');
  await page.locator('#lab-date').click();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
  assert.equal(await page.evaluate(() => visualViewport.scale), 2);
  await enterDate(page, '2001-10-01');
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

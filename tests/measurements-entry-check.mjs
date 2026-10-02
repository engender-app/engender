import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/measurements-entry-shots';
if (gallery) await mkdir(out, { recursive: true });

const server = await createServer({
  cacheDir: '.svelte-kit/measurements-entry-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function fieldOrder(controls) {
  const positions = [];
  for (const control of controls) {
    positions.push(await control.evaluate((el) => {
      const rect = el.closest('.field').querySelector('.field-label').getBoundingClientRect();
      return { top: rect.top, left: rect.left };
    }));
  }
  for (let i = 1; i < positions.length; i++) {
    const previous = positions[i - 1], current = positions[i];
    assert.ok(current.top > previous.top || (current.top === previous.top && current.left > previous.left), `Field ${i} precedes field ${i + 1}`);
  }
  await controls[0].focus();
  for (const control of controls.slice(1)) {
    await page.keyboard.press('Tab');
    assert.equal(await control.evaluate((el) => document.activeElement === el), true, 'Keyboard follows reading order');
  }
}

function measurementControls() {
  return [
    page.locator('[data-sheet] [role="radiogroup"]').nth(0).locator('[aria-checked="true"]'),
    page.locator('#measurement-value'),
    page.locator('[data-sheet] [role="radiogroup"]').nth(1).locator('[aria-checked="true"]'),
    page.locator('#measurement-date')
  ];
}

const sizeControls = () => ['size-log-category', 'size-log-size', 'size-log-brand', 'size-log-fit-note', 'size-log-date'].map((id) => page.locator(`#${id}`));
const typePicker = () => page.locator('#measurements-picker [role="radiogroup"]');
const editorType = () => page.locator('[data-sheet] [role="radiogroup"]').nth(0);
const editorUnit = () => page.locator('[data-sheet] [role="radiogroup"]').nth(1);

async function close() {
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
async function discard() {
  await page.locator('[data-close-record]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
async function installFault(area, operation) {
  await page.evaluate(async ({ area, operation }) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal[area][operation].bind(bootState.journal[area]);
    window.recordFault = { mode: 'fail', calls: 0 };
    bootState.journal[area][operation] = async (draft) => {
      window.recordFault.calls++;
      if (window.recordFault.mode === 'fail') throw new Error('injected record save failure');
      if (window.recordFault.mode === 'pending') await new Promise((resolve) => { window.recordFault.resolve = resolve; });
      return original(draft);
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  }, { area, operation });
}
async function valuesMatch(values) {
  for (const [id, value] of Object.entries(values)) assert.equal(await page.locator(`#${id}`).inputValue(), value, id);
  if ('measurement-value' in values) {
    assert.equal(await editorType().getByRole('radio', { checked: true }).innerText(), 'Shoulder width');
    assert.equal(await editorUnit().locator('[aria-checked="true"]').getAttribute('data-segment'), 'in');
  }
}
async function saveAndReopen({ handle, area, operation, rows, title, values, changeId, changedValue }) {
  const before = await rows.count();
  const save = page.locator(`[data-save-${handle}]`);
  await installFault(area, operation);
  await save.click();
  await page.getByRole('alert').waitFor();
  await valuesMatch(values);
  assert.equal(await rows.count(), before);
  await page.evaluate(() => { window.recordFault.mode = 'pending'; });
  await save.click();
  await page.waitForFunction(() => window.recordFault.resolve);
  await save.evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator(`#${changeId}`).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  await page.evaluate(() => window.recordFault.resolve());
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await rows.filter({ hasText: title }).waitFor();
  assert.equal(await rows.count(), before + 1);
  assert.equal(await page.evaluate(() => window.recordFault.calls), 2);
  const row = rows.filter({ hasText: title });
  const selector = `[data-${handle}="${await row.getAttribute(`data-${handle}`)}"]`;
  await page.locator(selector).click();
  await valuesMatch(values);
  await close();
  await page.locator(selector).click();
  await page.locator(`#${changeId}`).fill(changedValue);
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator(`#${changeId}`).inputValue(), changedValue);
  await discard();
  await page.locator(selector).click();
  await valuesMatch(values);
  await page.locator(`#${changeId}`).fill(changedValue);
  await page.locator(`#${changeId}`).fill(values[changeId]);
  await close();
  await page.locator(selector).click();
  await page.locator(`#${changeId}`).fill(changedValue);
  await page.evaluate(() => { window.recordFault.mode = 'pass'; });
  await save.click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator(selector).click();
  await valuesMatch({ ...values, [changeId]: changedValue });
  await close();
  assert.equal(await rows.count(), before + 1);
  console.log(`PASS ${handle} retains failed draft, saves once on retry, reopens fixed date, protects edits and updates one record`);
  return selector;
}
async function deleteRecord(handle, selector, description) {
  await page.locator(selector).click();
  await page.locator(`[data-delete-${handle}]`).click();
  await page.locator(`[data-confirm-delete-${handle}]`).waitFor();
  assert.ok((await page.locator('[data-sheet]').last().innerText()).includes(description));
  await page.getByRole('button', { name: 'Keep it', exact: true }).click();
  assert.equal(await page.locator(selector).count(), 1);
  await page.locator(selector).click();
  await page.locator(`[data-delete-${handle}]`).click();
  await page.locator(`[data-confirm-delete-${handle}]`).click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator(selector).waitFor({ state: 'detached' });
  console.log(`PASS ${handle} deletion names record, cancellation keeps it, confirmation removes it`);
}
async function capture(name, zoom) {
  const sheet = page.locator('[data-sheet]').last();
  assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${name}: no horizontal overflow`);
  for (const group of await sheet.getByRole('radiogroup').all()) {
    await page.waitForFunction((el) => {
      const selected = el.querySelector('[aria-checked="true"]').getBoundingClientRect();
      const highlight = el.querySelector('.segment-pill').getBoundingClientRect();
      return Math.abs(highlight.left - selected.left) <= 2 && Math.abs(highlight.width - selected.width) <= 2;
    }, await group.elementHandle(), { timeout: 3000 }).catch(async () => {
      assert.fail(`${name}: selected option loses its visible highlight: ${JSON.stringify(await group.evaluate((el) => ({
        selected: el.querySelector('[aria-checked="true"]').getBoundingClientRect().toJSON(),
        highlight: el.querySelector('.segment-pill').getBoundingClientRect().toJSON()
      })))}`);
    });
  }
  for (const control of await sheet.locator('input, select, button[role="radio"], button[data-close-record], button[data-save-measurement], button[data-save-size-record]').all()) {
    const box = await control.boundingBox();
    const label = await control.evaluate((el) => el.id || el.textContent?.trim() || el.tagName);
    assert.ok(box.width / zoom >= 48 && box.height / zoom >= 48, `${name}: ${label} touch target is ${box.width / zoom}x${box.height / zoom}px, requires 48px`);
  }
  assert.equal(await sheet.locator('input[readonly]').evaluateAll((inputs) => inputs.every((input) => {
    const style = getComputedStyle(input);
    const context = document.createElement('canvas').getContext('2d');
    context.font = `${style.fontSize} ${style.fontFamily}`;
    return context.measureText(input.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) <= input.clientWidth;
  })), true, `${name}: readable date`);
  if (gallery) {
    await sheet.evaluate((el) => { el.scrollTop = 0; });
    await sheet.screenshot({ path: `${out}/${name}.png` });
    if (await sheet.evaluate((el) => el.scrollHeight > el.clientHeight)) {
      await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await sheet.screenshot({ path: `${out}/${name}-bottom.png` });
    }
  }
}

try {
  await page.goto(`${server.resolvedUrls.local[0]}body/measurements`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.goto(`${server.resolvedUrls.local[0]}body/measurements`, { waitUntil: 'networkidle' });
  }
  await page.evaluate(() => { document.querySelector('.demo-bar').style.display = 'none'; });
  await page.locator('[data-add]').click();
  await page.locator('#measurement-value').waitFor();
  assert.equal(await page.locator('[data-save-measurement]').isDisabled(), true);
  assert.equal(await page.locator('#measurement-value').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#measurement-value').getAttribute('aria-describedby'), 'measurement-value-hint');
  assert.match(await page.locator('#measurement-value-hint').innerText(), /number/i);
  await page.locator('#measurement-value').press('e');
  assert.equal(await page.locator('[data-save-measurement]').isDisabled(), true);
  await page.locator('#measurement-value').fill('1e309');
  assert.equal(await page.locator('[data-save-measurement]').isDisabled(), true);
  await page.locator('#measurement-value').fill('82.5');
  assert.equal(await page.locator('[data-save-measurement]').isEnabled(), true);
  assert.equal(await page.locator('#measurement-value').getAttribute('aria-invalid'), 'false');
  console.log('PASS empty and invalid measurement explain disabled Save; correction enables Save');
  await fieldOrder(measurementControls());
  console.log('PASS measurement type, value and unit precede date in reading and keyboard order');
  await page.locator('[data-close-record]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-add-size]').click();
  await page.locator('#size-log-size').waitFor();
  assert.equal(await page.locator('[data-save-size-record]').isDisabled(), true);
  assert.equal(await page.locator('#size-log-size').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#size-log-size').getAttribute('aria-describedby'), 'size-log-size-hint');
  assert.match(await page.locator('#size-log-size-hint').innerText(), /size/i);
  await fieldOrder(sizeControls());
  await page.locator('#size-log-size').fill('   ');
  assert.equal(await page.locator('[data-save-size-record]').isDisabled(), true);
  await page.locator('#size-log-size').fill('M');
  assert.equal(await page.locator('[data-save-size-record]').isEnabled(), true);
  console.log('PASS size content precedes date; required size explains disabled Save');
  await page.locator('#size-log-category').selectOption('pants');
  await page.locator('#size-log-brand').fill('Fixture brand');
  await page.locator('#size-log-fit-note').fill('Fits at the waist');
  await fillDate(page, '#size-log-date', '2024-03-12');
  const sizeRow = await saveAndReopen({
    handle: 'size-record', area: 'sizeRecords', operation: 'upsertRecord', rows: page.locator('[data-size-record]'),
    title: 'M · Fixture brand', changeId: 'size-log-size', changedValue: 'L',
    values: { 'size-log-category': 'pants', 'size-log-size': 'M', 'size-log-brand': 'Fixture brand', 'size-log-fit-note': 'Fits at the waist', 'size-log-date': '2024-03-12' }
  });
  await deleteRecord('size-record', sizeRow, 'Pants');

  await page.locator('[data-manage-types]').click();
  await page.locator('#new-measurement-type').fill('Shoulder width');
  await page.locator('[data-add-measurement-type]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const custom = typePicker().getByRole('radio', { name: 'Shoulder width', exact: true });
  await custom.waitFor();
  assert.equal(await custom.getAttribute('aria-checked'), 'true');
  const customKey = await custom.getAttribute('data-segment');
  await page.evaluate(async (customKey) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.measurements.upsertMeasurement({ epochDay: 19783, type: customKey, value: 80, unit: 'cm' });
    await journal.measurements.upsertMeasurement({ epochDay: 30000, type: 'hips', value: 90, unit: 'cm' });
  }, customKey);
  await page.locator('[data-measurement]').filter({ hasText: '80 cm' }).waitFor();
  await page.locator('[data-add]').click();
  assert.equal(await editorType().getByRole('radio', { checked: true }).innerText(), 'Shoulder width');
  assert.equal(await editorUnit().locator('[aria-checked="true"]').getAttribute('data-segment'), 'cm');
  await page.locator('#measurement-value').fill('32.5');
  await editorUnit().locator('[data-segment="in"]').click();
  await fillDate(page, '#measurement-date', '2024-03-11');
  const measurementRow = await saveAndReopen({
    handle: 'measurement', area: 'measurements', operation: 'upsertMeasurement', rows: page.locator('[data-measurement]'),
    title: '32.5 in', changeId: 'measurement-value', changedValue: '33.25',
    values: { 'measurement-value': '32.5', 'measurement-date': '2024-03-11' }
  });
  await page.locator('[data-measurement]').filter({ hasText: '80 cm' }).waitFor();
  await page.locator('[data-add]').click();
  assert.equal(await editorUnit().locator('[aria-checked="true"]').getAttribute('data-segment'), 'in');
  await close();
  await typePicker().locator('[data-segment="hips"]').click();
  await page.locator('[data-measurement]').filter({ hasText: '90 cm' }).waitFor();
  await page.locator('[data-add]').click();
  assert.equal(await editorType().locator('[aria-checked="true"]').getAttribute('data-segment'), 'hips');
  assert.equal(await editorUnit().locator('[aria-checked="true"]').getAttribute('data-segment'), 'cm');
  await close();
  await custom.click();
  await page.locator('[data-manage-types]').click();
  await page.locator(`[data-measurement-type-hide="${customKey}"]`).click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await custom.waitFor({ state: 'detached' });
  await page.locator('[data-manage-types]').click();
  await page.locator(`[data-measurement-type-hide="${customKey}"]`).click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await custom.click();
  await page.locator(measurementRow).waitFor();
  console.log('PASS custom type management and hidden records survive; selected type and last unit defaults follow each type; native unit rows remain');
  await deleteRecord('measurement', measurementRow, 'Shoulder width');

  for (const locale of ['en', 'pl']) {
    const copy = JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale;
      setLocale(locale, { reload: false });
    }, locale);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    await page.evaluate(() => { document.querySelector('.demo-bar').style.display = 'none'; });
    for (const kind of ['measurement', 'size-record']) {
      await page.locator(kind === 'measurement' ? '[data-add]' : '[data-add-size]').click();
      const field = page.locator(kind === 'measurement' ? '#measurement-value' : '#size-log-size');
      const hint = page.locator(kind === 'measurement' ? '#measurement-value-hint' : '#size-log-size-hint');
      for (const zoom of [1, 2]) {
        await page.evaluate(async (zoom) => {
          document.documentElement.style.zoom = String(zoom);
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.disguise = zoom === 2;
        }, zoom);
        await page.waitForFunction((zoom) => Number(getComputedStyle(document.documentElement).zoom) === zoom, zoom);
        await fieldOrder(kind === 'measurement' ? measurementControls() : sizeControls());
        if (kind === 'measurement') {
          assert.equal(await page.locator('[data-sheet]').getByRole('radiogroup', { name: copy.measurement_type_label, exact: true }).count(), 1);
          assert.equal(await page.getByRole('radiogroup', { name: copy.measurement_unit_label, exact: true }).count(), 1);
          assert.equal(await page.getByRole('spinbutton', { name: copy.measurement_value_label, exact: true }).count(), 1);
          assert.equal(await hint.innerText(), copy.measurement_invalid_value);
          await field.fill('0');
          assert.equal(await page.locator('[data-save-measurement]').isEnabled(), true);
          await field.fill('');
        } else {
          assert.equal(await page.locator('[data-sheet]').getByRole('combobox', { name: copy.size_log_category_label, exact: true }).count(), 1);
          for (const key of ['size_log_size_label', 'size_log_brand_label', 'size_log_fit_note_label']) {
            assert.equal(await page.getByRole('textbox', { name: copy[key], exact: true }).count(), 1);
          }
          assert.equal(await hint.innerText(), copy.size_log_required_size);
        }
        await capture(`${locale}-${zoom}x-${kind}-requirements`, zoom);
      }
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      if (gallery) {
        for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
          await page.evaluate(async ({ palette, theme }) => {
            const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
            prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
          }, { palette, theme });
          await capture(`${locale}-${palette}-${theme}-${kind}`, 1);
        }
      }
      await close();
    }
    console.log(`PASS ${locale} labels, guidance, field order, readable dates and 48px targets at 390px and 200% zoom, including disguise`);
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

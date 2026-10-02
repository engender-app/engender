import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/lab-entry-shots';
if (gallery) await mkdir(out, { recursive: true });

const server = await createServer({ plugins: [{
  name: 'fixed-lab-recognition',
  enforce: 'pre',
  load(id) {
    if (id.endsWith('/src/lib/data/labs/ocr-engine.ts')) return `
      export function tesseractLabOcrEngine() {
        return { async recognize() {
          if (window.labOcrFail) throw new Error('injected recognition failure');
          return { data: { text: window.labOcrText } };
        } };
      }
    `;
  }
}], cacheDir: '.svelte-kit/lab-entry-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

async function openNew() {
  await page.locator('[data-add]').click();
  await page.locator('#lab-analyte').waitFor();
}
async function close() {
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
async function fieldOrder(ids) {
  const positions = await page.evaluate((ids) => ids.map((id) => {
    const rect = document.querySelector(`label[for="${id}"]`).getBoundingClientRect();
    return { id, top: rect.top, left: rect.left };
  }), ids);
  for (let i = 1; i < positions.length; i++) {
    const previous = positions[i - 1], current = positions[i];
    assert.ok(current.top > previous.top || (current.top === previous.top && current.left > previous.left), `${previous.id} before ${current.id}`);
  }
  await page.locator(`#${ids[0]}`).focus();
  for (const id of ids.slice(1)) {
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), id);
  }
}
async function stored(analyte) {
  return page.evaluate(async (analyte) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal.labs.getResults(analyte);
  }, analyte);
}
async function installFault() {
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.labs.upsertResult.bind(bootState.journal.labs);
    window.labFault = { mode: 'fail', calls: 0 };
    bootState.journal.labs.upsertResult = async (draft) => {
      window.labFault.calls++;
      if (window.labFault.mode === 'fail') throw new Error('injected lab save failure');
      if (window.labFault.mode === 'pending') await new Promise((resolve) => { window.labFault.resolve = resolve; });
      return original(draft);
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
}
async function review() {
  await page.locator('[data-import-lab]').click();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-ocr-pick="gallery"]').click()
  ]);
  await chooser.setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]) });
}
async function capture(name) {
  const sheet = page.locator('[data-sheet]').last();
  assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true, name);
  const datesFit = await sheet.locator('input[readonly]').evaluateAll((inputs) => inputs.every((input) => {
    const style = getComputedStyle(input);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${style.fontSize} ${style.fontFamily}`;
    return context.measureText(input.value).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight) <= input.clientWidth;
  }));
  assert.ok(datesFit, `${name}: date and time remain readable`);
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
  await page.goto(`${server.resolvedUrls.local[0]}care/labs`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await openNew();
  await fieldOrder(['lab-analyte', 'lab-value', 'lab-unit', 'lab-provider', 'lab-date', 'lab-time', 'lab-note']);
  assert.equal(await page.locator('[data-save-lab]').isDisabled(), true);
  assert.equal(await page.locator('#lab-value').getAttribute('aria-invalid'), 'true');
  assert.match(await page.locator('#lab-value-hint').innerText(), /number/i);
  console.log('PASS manual result fields precede context and time; missing value explains disabled Save');
  await page.locator('#lab-analyte').selectOption('custom');
  assert.equal(await page.locator('#lab-custom-analyte').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#lab-custom-analyte').getAttribute('aria-describedby'), 'lab-custom-analyte-hint');
  await page.locator('#lab-custom-analyte').fill('shbg');
  await page.locator('#lab-value').fill('');
  await page.locator('#lab-value').press('e');
  assert.equal(await page.locator('[data-save-lab]').isDisabled(), true);
  assert.equal(await page.locator('#lab-value').getAttribute('aria-describedby'), 'lab-value-hint');
  await page.locator('#lab-value').fill('61.25');
  await page.locator('#lab-unit').fill('nmol/L');
  await page.locator('#lab-provider').fill('Fixture lab');
  await fillDate(page, '#lab-date', '2024-03-11');
  await page.locator('#lab-time').click();
  await page.waitForFunction(() => /^\d{2}:\d{2}$/.test(document.querySelector('[data-time-picker-entry]').value));
  await page.locator('[data-time-picker-entry]').fill('09:35');
  await page.locator('[data-time-picker-entry]').press('Enter');
  await page.locator('[data-time-picker]').waitFor({ state: 'detached' });
  await page.locator('#lab-note').fill('Manual result');
  await fieldOrder(['lab-analyte', 'lab-custom-analyte', 'lab-value', 'lab-unit', 'lab-provider', 'lab-date', 'lab-time', 'lab-note']);
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#lab-custom-analyte').inputValue(), 'shbg');
  const before = await stored('shbg');
  await installFault();
  await page.locator('[data-save-lab]').click();
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  for (const [id, value] of Object.entries({ 'lab-custom-analyte': 'shbg', 'lab-value': '61.25', 'lab-unit': 'nmol/L', 'lab-provider': 'Fixture lab', 'lab-date': '2024-03-11', 'lab-time': '09:35', 'lab-note': 'Manual result' })) {
    assert.equal(await page.locator(`#${id}`).inputValue(), value);
  }
  assert.deepEqual(await stored('shbg'), before);
  await page.evaluate(() => { window.labFault.mode = 'pending'; });
  await page.locator('[data-save-lab]').click();
  await page.waitForFunction(() => window.labFault.resolve);
  await page.locator('[data-save-lab]').evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator('#lab-value').isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(await page.locator('#lab-custom-analyte').inputValue(), 'shbg');
  await page.evaluate(() => window.labFault.resolve());
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.labFault.calls), 2);
  const saved = (await stored('shbg')).find((r) => !before.some((old) => old.id === r.id));
  assert.equal((await stored('shbg')).length, before.length + 1);
  assert.equal(saved.value, 61.25);
  await page.locator('[data-segment="shbg"]').click();
  await page.locator(`[data-lab-result="${saved.id}"]`).click();
  for (const [id, value] of Object.entries({ 'lab-analyte': 'shbg', 'lab-value': '61.25', 'lab-unit': 'nmol/L', 'lab-provider': 'Fixture lab', 'lab-date': '2024-03-11', 'lab-time': '09:35', 'lab-note': 'Manual result' })) {
    assert.equal(await page.locator(`#${id}`).inputValue(), value);
  }
  await page.evaluate(() => { window.labFault.mode = 'pass'; });
  await page.locator('#lab-note').fill('Corrected note');
  await page.locator('[data-save-lab]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.deepEqual((await stored('shbg')).find((r) => r.id === saved.id).timing, saved.timing);
  await page.locator(`[data-lab-result="${saved.id}"]`).click();
  await page.locator('[data-delete-lab]').click();
  await page.locator('[data-confirm-delete-lab]').waitFor();
  await page.getByRole('button', { name: 'Keep it', exact: true }).click();
  assert.equal((await stored('shbg')).length, before.length + 1);
  console.log('PASS custom result and optional draw time survive failure, one delayed retry, reopen, note correction and cancelled deletion');

  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.preferredLabUnits = { estradiol: 'pmol/L' };
  });
  await openNew();
  await page.locator('#lab-unit').fill('');
  await page.locator('#lab-analyte').selectOption('estradiol');
  assert.equal(await page.locator('#lab-unit').inputValue(), 'pmol/L');
  await page.locator('#lab-value').fill('0');
  await page.locator('#lab-unit').fill('');
  assert.equal(await page.locator('[data-save-lab]').isEnabled(), true);
  await page.locator('[data-close-record]').click();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS preferred unit defaults preserved; zero and blank unit remain valid');

  await page.evaluate(() => {
    window.labOcrText = 'Date: 2024-03-11\nshbg 61.25 nmol/L\nEstradiol 123.4 pg/mL\nTestosteron 0.92 ng/mL';
    window.labOcrFail = true;
  });
  await review();
  await page.locator('[data-ocr-state="recognition-failed"]').waitFor();
  await page.locator('[data-ocr-retry]').click();
  await page.evaluate(() => { window.labOcrFail = false; });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-ocr-pick="gallery"]').click()]);
  await chooser.setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from([1, 2, 3]) });
  await page.locator('#ocr-analyte-0').waitFor();
  assert.equal(await page.locator('#ocr-analyte-0').inputValue(), 'shbg');
  const includes = page.locator('[data-ocr-state] input[type="checkbox"]');
  assert.equal(await includes.nth(0).isChecked(), false);
  assert.match(await page.locator('[data-ocr-state]').innerText(), /Duplicate/);
  assert.equal(await includes.nth(1).isChecked(), true);
  await includes.nth(2).uncheck();
  await fieldOrder(['ocr-analyte-1', 'ocr-value-1', 'ocr-unit-1', 'ocr-date-1', 'ocr-note-1']);
  await page.locator('#ocr-analyte-1').fill('');
  await page.locator('[data-ocr-save]').click();
  await page.getByRole('alert').filter({ hasText: 'Every included row needs an analyte' }).waitFor();
  await page.locator('#ocr-analyte-1').fill('estradiol');
  await page.locator('#ocr-value-1').fill('invalid');
  await page.locator('[data-ocr-save]').click();
  await page.getByRole('alert').filter({ hasText: 'valid numeric value' }).waitFor();
  await page.locator('#ocr-value-1').fill('124,6');
  await page.locator('#ocr-unit-1').fill('pg/mL');
  await fillDate(page, '#ocr-date-1', '2024-03-12');
  await page.locator('#ocr-note-1').fill('Corrected OCR result');
  const estradiolBefore = await stored('estradiol');
  const testosteroneBefore = await stored('testosterone');
  await page.locator('[data-ocr-save]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const imported = (await stored('estradiol')).find((r) => !estradiolBefore.some((old) => old.id === r.id));
  assert.equal((await stored('estradiol')).length, estradiolBefore.length + 1);
  assert.equal(imported.value, 124.6);
  assert.equal(imported.unit, 'pg/mL');
  assert.equal(imported.note, 'Corrected OCR result');
  assert.equal(imported.drawTime, null);
  assert.deepEqual(await stored('testosterone'), testosteroneBefore);
  assert.equal((await stored('shbg')).length, before.length + 1);
  await page.locator('[data-segment="estradiol"]').click();
  await page.locator(`[data-lab-result="${imported.id}"]`).click();
  assert.equal(await page.locator('#lab-date').inputValue(), '2024-03-12');
  assert.equal(await page.locator('#lab-time').inputValue(), '');
  await close();
  console.log('PASS fixed OCR retries recognition, marks duplicate, corrects selected row, saves exact fields without skipped rows');
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
    await openNew();
    await page.locator('#lab-analyte').selectOption('custom');
    for (const zoom of [1, 2]) {
      await page.evaluate(async (zoom) => {
        document.documentElement.style.zoom = String(zoom);
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = zoom === 2;
      }, zoom);
      await fieldOrder(['lab-analyte', 'lab-custom-analyte', 'lab-value', 'lab-unit', 'lab-provider', 'lab-date', 'lab-time', 'lab-note']);
      assert.equal(await page.getByRole('combobox', { name: copy.labs_analyte_label, exact: true }).count(), 1);
      assert.equal(await page.getByRole('textbox', { name: copy.labs_custom_label, exact: true }).count(), 1);
      assert.equal(await page.getByRole('spinbutton', { name: copy.labs_value_label, exact: true }).count(), 1);
      assert.equal(await page.locator('#lab-value-hint').innerText(), copy.labs_invalid_value);
      await capture(`${locale}-${zoom}x-manual-requirements`);
      const save = await page.locator('[data-save-lab]').boundingBox();
      assert.ok(save.width / zoom >= 48 && save.height / zoom >= 48);
    }
    if (gallery) {
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      await page.locator('#lab-custom-analyte').fill('shbg');
      await page.locator('#lab-value').fill('61.25');
      await page.locator('#lab-unit').fill('nmol/L');
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
        }, { palette, theme });
        await capture(`${locale}-${palette}-${theme}-manual`);
      }
    }
    await page.locator('[data-close-record]').click();
    await page.locator('[data-discard-record]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    await page.evaluate(() => {
      window.labOcrText = 'Date: 2024-03-11\nshbg 61.25 nmol/L\nEstradiol 123.4 pg/mL';
      window.labOcrFail = false;
      document.documentElement.style.zoom = '1';
    });
    await review();
    await page.locator('#ocr-analyte-1').waitFor();
    await page.locator('#ocr-value-1').fill('invalid');
    await page.locator('[data-ocr-save]').click();
    await page.getByRole('alert').waitFor();
    for (const zoom of [1, 2]) {
      await page.evaluate(async (zoom) => {
        document.documentElement.style.zoom = String(zoom);
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = zoom === 2;
      }, zoom);
      await fieldOrder(['ocr-analyte-1', 'ocr-value-1', 'ocr-unit-1', 'ocr-date-1', 'ocr-note-1']);
      assert.equal(await page.getByRole('textbox', { name: copy.labs_analyte_label, exact: true }).count(), 2);
      assert.equal(await page.getByRole('alert').innerText(), copy.labs_ocr_invalid_value);
      await capture(`${locale}-${zoom}x-ocr-validation`);
    }
    if (gallery) {
      await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
        }, { palette, theme });
        await capture(`${locale}-${palette}-${theme}-ocr`);
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    console.log(`PASS ${locale} reading/keyboard order, accessible names and guidance at 390px, 200% zoom and disguise`);
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(error, errors);
  throw error;
} finally {
  await browser.close();
  await server.close();
}

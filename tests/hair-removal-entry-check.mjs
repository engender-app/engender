import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium, settlePage } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/hair-removal-entry-shots';
if (gallery) await mkdir(out, { recursive: true });
const server = await createServer({
  cacheDir: '.svelte-kit/hair-removal-entry-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
let selections = 0;
page.on('filechooser', () => selections++);
const sessions = () => page.evaluate(async () => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  return journal.hairRemoval.getSessions();
});
async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path; document.body.append(link); link.click(); link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname + url.search === path);
}
async function close() {
  await page.locator('[data-close-record]').click();
  await page.locator('#hair-removal-area').waitFor({ state: 'detached' });
}
async function fieldOrder(copy) {
  const method = page.getByRole('radiogroup', { name: copy.hair_removal_method_label, exact: true });
  const pain = page.getByRole('radiogroup', { name: copy.hair_removal_pain_label, exact: true });
  const controls = [method, page.locator('#hair-removal-area'), pain,
    page.locator('#hair-removal-cost'), page.locator('#hair-removal-provider'), page.locator('#hair-removal-date')];
  for (let i = 1; i < controls.length; i++) {
    const previous = await controls[i - 1].boundingBox();
    const current = await controls[i].boundingBox();
    assert.ok(current.y > previous.y, 'Method, area, pain, cost and provider precede date');
  }
  const selectedMethod = method.getByRole('radio', { checked: true });
  await selectedMethod.focus();
  for (const control of [controls[1], pain.getByRole('radio', { checked: true }), ...controls.slice(3)]) {
    await page.keyboard.press('Tab');
    assert.equal(await control.evaluate((el) => el === document.activeElement), true, 'Keyboard follows field order');
  }
}
async function capture(name) {
  const sheet = page.locator('[data-sheet]').first();
  assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true, `${name}: no horizontal overflow`);
  if (gallery) {
    await sheet.evaluate((el) => { el.scrollTop = 0; });
    await sheet.screenshot({ path: `${out}/${name}.png` });
    await sheet.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await sheet.screenshot({ path: `${out}/${name}-bottom.png` });
  }
}
try {
  await settlePage(page, server.resolvedUrls.local[0], 'body/hair-removal', 'light');
  const en = JSON.parse(await readFile('messages/en.json', 'utf8'));
  await page.locator('[data-add]').click();
  await fieldOrder(en);
  assert.equal(await page.locator('#hair-removal-area').inputValue(), 'upper_lip');
  assert.equal(await page.getByRole('radio', { name: en.hair_removal_method_laser, exact: true }).isChecked(), true);
  assert.equal(await page.locator('[data-add-photo]').count(), 0);
  assert.ok((await page.locator('[data-sheet]').innerText()).includes(en.hair_removal_photo_hint));
  await page.locator('#hair-removal-area').selectOption('chin');
  await page.locator('#hair-removal-cost').fill('125 PLN');
  await page.locator('#hair-removal-provider').fill('Clinic fixture');
  await fillDate(page, '#hair-removal-date', '2024-03-12');
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').click();
  assert.equal(await page.locator('#hair-removal-provider').inputValue(), 'Clinic fixture');

  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.hairRemoval.upsertSession.bind(bootState.journal.hairRemoval);
    window.hairFault = { mode: 'fail', calls: 0 };
    bootState.journal.hairRemoval.upsertSession = async (draft) => {
      window.hairFault.calls++;
      if (window.hairFault.mode === 'fail') throw new Error('injected session save failure');
      if (window.hairFault.mode === 'pending') await new Promise((resolve) => { window.hairFault.resolve = resolve; });
      return original(draft);
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal); journalIsOpen();
  });
  const before = (await sessions()).length;
  await page.locator('[data-save-hair-removal-session]').click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('#hair-removal-provider').inputValue(), 'Clinic fixture');
  assert.equal(await page.locator('#hair-removal-date').inputValue(), '2024-03-12');
  assert.equal((await sessions()).length, before);
  assert.equal(await page.locator('[data-add-photo]').count(), 0);
  assert.equal(await page.locator('[data-hair-removal-saved]').count(), 0);
  await page.evaluate(() => { window.hairFault.mode = 'pending'; });
  await page.locator('[data-save-hair-removal-session]').click();
  await page.waitForFunction(() => window.hairFault.resolve);
  await page.locator('[data-save-hair-removal-session]').evaluate((el) => { el.click(); el.click(); });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  assert.equal(await page.evaluate(() => window.hairFault.calls), 2);
  await page.evaluate(() => { window.hairFault.resolve(); window.hairFault.mode = 'pass'; });
  await page.locator('#hair-removal-area').waitFor({ state: 'detached' });
  const saved = (await sessions()).find((session) => session.provider === 'Clinic fixture');
  assert.equal((await sessions()).length, before + 1);
  assert.equal(saved.epochDay, 19794);
  assert.equal(saved.cost, '125 PLN');
  const notice = page.locator(`[data-hair-removal-saved="${saved.id}"]`);
  await notice.waitFor();
  assert.equal(await notice.getAttribute('aria-live'), 'polite');
  assert.ok((await notice.innerText()).includes('2024'));
  assert.equal(await page.locator('[data-add]').evaluate((el) => el === document.activeElement), true, 'Save restores opener focus');
  assert.equal(selections, 0, 'Save never starts photo selection');
  console.log('PASS grouping, defaults, draft protection, rejected save, delayed retry and single committed session');
  await notice.getByRole('button').click();
  await page.locator('[data-add-photo]').waitFor();
  assert.equal(await page.locator('#hair-removal-date').inputValue(), '2024-03-12');
  assert.equal(await page.locator('#hair-removal-provider').inputValue(), 'Clinic fixture');
  await page.waitForFunction(() => document.querySelector('[data-sheet]')?.contains(document.activeElement));
  const cancelled = page.waitForEvent('filechooser');
  await page.locator('[data-add-photo]').click();
  await (await cancelled).setFiles([]);
  assert.equal(await page.locator('[data-hair-removal-photo]').count(), 0);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#227799'; context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-add-photo]').click();
  await (await chooser).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('[data-hair-removal-photo]').waitFor();
  const photoId = await page.locator('[data-hair-removal-photo]').getAttribute('data-hair-removal-photo');
  await close();
  await navigate('/media/photos');
  await page.locator(`[data-photo-key="${photoId}"] [data-photo-cell]`).waitFor();
  await page.locator(`[data-photo-key="${photoId}"] [data-photo-cell]`).click();
  await page.locator('[data-photo-owner]').click();
  await page.waitForURL('**/body/hair-removal?session=*');
  await page.locator('[data-add-photo]').waitFor();
  assert.equal(await page.locator('#hair-removal-date').inputValue(), '2024-03-12');
  await page.locator(`[data-hair-removal-photo="${photoId}"]`).waitFor();
  const library = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return journal.photoLibrary.inJournal();
  });
  assert.equal(library.find((photo) => photo.id === photoId).epochDay, saved.epochDay);
  assert.equal(library.find((photo) => photo.id === photoId).source, 'hairRemoval');
  assert.equal(library.find((photo) => photo.id === photoId).ownerId, saved.id);
  assert.equal((await sessions()).length, before + 1);
  console.log('PASS opt-in selection, cancelled selection, attachment persistence and library source/day');
  await fillDate(page, '#hair-removal-date', '2024-03-13');
  await page.locator('[data-save-hair-removal-session]').click();
  await page.locator('#hair-removal-area').waitFor({ state: 'detached' });
  await navigate(`/body/hair-removal?session=${saved.id}`);
  await page.locator(`[data-hair-removal-photo="${photoId}"]`).waitFor();
  assert.equal(await page.locator('#hair-removal-date').inputValue(), '2024-03-13');
  assert.equal(await page.evaluate(async (photoId) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return (await journal.photoLibrary.inJournal()).find((photo) => photo.id === photoId).epochDay;
  }, photoId), saved.epochDay + 1);
  await page.locator('[data-delete-hair-removal-session]').click();
  await page.locator('[data-confirm-delete-hair-removal-session]').waitFor();
  await page.getByRole('button', { name: en.keep_it, exact: true }).click();
  await page.locator('[data-confirm-delete-hair-removal-session]').waitFor({ state: 'detached' });
  assert.ok((await sessions()).some((session) => session.id === saved.id));
  await navigate(`/body/hair-removal?session=${saved.id}`);
  await page.locator(`[data-hair-removal-photo="${photoId}"]`).waitFor();
  await page.locator('[data-delete-hair-removal-session]').click();
  await page.locator('[data-confirm-delete-hair-removal-session]').click();
  await page.waitForFunction(() => !document.querySelector('[data-sheet]'));
  assert.equal(await page.evaluate(async (photoId) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return (await journal.photoLibrary.inJournal()).some((photo) => photo.id === photoId);
  }, photoId), false);
  console.log('PASS editing carries attachment day; delete cancellation keeps owner and confirmation removes attachment');

  for (const locale of ['en', 'pl']) {
    const copy = JSON.parse(await readFile(`messages/${locale}.json`, 'utf8'));
    await page.evaluate(async (locale) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      const { setLocale } = await import('/src/lib/paraglide/runtime.js');
      prefs.language = locale; setLocale(locale, { reload: false });
    }, locale);
    await settlePage(page, server.resolvedUrls.local[0], 'body/hair-removal', 'light');
    await page.locator('[data-add]').click();
    for (const zoom of [1, 2]) {
      await page.evaluate(async (zoom) => {
        document.documentElement.style.zoom = String(zoom);
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.disguise = zoom === 2;
      }, zoom);
      await fieldOrder(copy);
      await capture(`${locale}-${zoom}x`);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    if (gallery) for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
      }, { palette, theme });
      await capture(`${locale}-${palette}-${theme}`);
    }
    await page.locator('[data-save-hair-removal-session]').click();
    await page.locator('#hair-removal-area').waitFor({ state: 'detached' });
    await page.locator('[data-hair-removal-saved]').getByRole('button', { name: copy.hair_removal_add_photo, exact: true }).click();
    await page.locator('[data-add-photo]').waitFor();
    assert.equal(await page.locator('[data-hair-removal-photo]').count(), 0, 'Photo remains optional');
    for (const zoom of [1, 2]) {
      await page.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, zoom);
      await capture(`${locale}-saved-${zoom}x`);
    }
    await page.evaluate(() => { document.documentElement.style.zoom = '1'; });
    await close();
    if (gallery) for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ({ palette, theme }) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = palette; prefs.theme = theme; prefs.disguise = false;
      }, { palette, theme });
      await page.locator('[data-hair-removal-saved]').screenshot({ path: `${out}/${locale}-${palette}-${theme}-saved.png` });
    }
    console.log(`PASS ${locale} grouping, continuation and optional photo at 390px and 200% zoom`);
  }
  {
    await page.locator('[data-hair-removal-saved]').getByRole('button').click();
    await page.locator('#hair-removal-provider').fill('Private unsaved draft');
    await page.keyboard.press('Escape');
    await page.locator('[data-keep-editing]').waitFor();
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      window.previousAccessMode = bootState.accessMode;
      bootState.accessMode = 'passphrase'; lockState.unlocked = false;
    });
    await page.locator('#hair-removal-provider').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-discard-record]').count(), 0);
    assert.equal(await page.locator('[data-hair-removal-saved]').count(), 0);
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = window.previousAccessMode; markUnlocked();
    });
    await page.locator('[data-add]').waitFor();
    await page.locator('[data-add]').click();
    await page.locator('[data-save-hair-removal-session]').click();
    await page.locator('#hair-removal-area').waitFor({ state: 'detached' });
    await page.locator('[data-hair-removal-saved]').waitFor();
  }
  console.log('PASS lock conceals changed editor, discard prompt and saved continuation');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('Page errors:', errors);
  console.error((await page.locator('body').innerText()).slice(0, 1200));
  throw error;
} finally {
  await browser.close();
  await server.close();
}

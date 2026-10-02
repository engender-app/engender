import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium } from './browser-harness.mjs';
import { makePdf } from './pdf-fixture.mjs';
import { PALETTES } from './palettes.mjs';

const gallery = process.argv.includes('--gallery');
const out = '.claude/document-import-shots';
if (gallery) await mkdir(out, { recursive: true });

const server = await createServer({ cacheDir: '.svelte-kit/document-import-vite', optimizeDeps: { include: ['pdfjs-dist/legacy/build/pdf.worker.mjs'] }, server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const bytes = Buffer.from(makePdf(['Pending document fixture']));
async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(resolve), 0))));
}
async function pick() {
  await page.locator('[data-documents-present-reading]').waitFor();
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-add]').click()
  ]);
  await chooser.setFiles({ name: 'fixture.pdf', mimeType: 'application/pdf', buffer: bytes });
  await page.locator('#document-title').waitFor();
}
async function keep() {
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
}
async function stored() {
  return page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal.documents.getDocuments();
  });
}
async function installFault() {
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.documents.addDocument.bind(bootState.journal.documents);
    window.documentFault = { mode: 'fail', calls: 0 };
    bootState.journal.documents.addDocument = async (draft, content) => {
      window.documentFault.calls++;
      if (window.documentFault.mode === 'fail') throw new Error('injected document save failure');
      if (window.documentFault.mode === 'pending') await new Promise((resolve) => { window.documentFault.resolve = resolve; });
      const id = await original(draft, content);
      window.documentFault.id = id;
      return id;
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
}
async function capture(name) {
  if (!gallery) return;
  const sheet = page.locator('[data-sheet]').last();
  assert.equal(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth), true, name);
  await sheet.screenshot({ path: `${out}/${name}.png` });
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await navigate('/media/documents');
  await page.waitForURL('**/media/documents');
  const baseline = await stored();
  const cancelled = page.waitForEvent('filechooser');
  await page.locator('[data-add]').click();
  await (await cancelled).element().dispatchEvent('cancel');
  assert.equal(await page.locator('#document-title').count(), 0);
  assert.deepEqual(await stored(), baseline);
  console.log('PASS picker cancellation opens no editor and creates no document');
  await pick();
  const originalDay = await page.locator('#document-day').inputValue();
  await page.keyboard.press('Escape');
  await keep();
  assert.equal(await page.locator('#document-title').inputValue(), '');
  console.log('PASS unnamed selected file survives dismissal');
  await page.locator('#document-title').fill('Retained document');
  await fillDate(page, '#document-day', '2024-03-11');
  await page.keyboard.press('Escape');
  await keep();
  assert.equal(await page.locator('#document-title').inputValue(), 'Retained document');
  assert.equal(await page.locator('#document-day').inputValue(), '2024-03-11');
  for (const path of ['scrim', 'drag', 'close', 'back', 'navigation']) {
    if (path === 'scrim') await page.locator('[data-sheet-scrim]').click({ position: { x: 2, y: 2 } });
    if (path === 'drag') {
      await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
      const box = await page.locator('.sheet-handle').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 130, { steps: 10 });
      await page.mouse.up();
    }
    if (path === 'close') await page.locator('[data-close-record]').click();
    if (path === 'back') await page.evaluate(() => history.back());
    if (path === 'navigation') await navigate('/more');
    await keep();
    assert.equal(await page.locator('#document-title').inputValue(), 'Retained document');
    assert.equal(await page.locator('#document-day').inputValue(), '2024-03-11');
    assert.equal(new URL(page.url()).pathname, '/media/documents');
    assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
  }
  console.log('PASS scrim, drag, Cancel, Back and navigation retain metadata');

  await page.locator('#document-title').fill('');
  await fillDate(page, '#document-day', originalDay);
  await page.locator('[data-close-record]').click();
  await page.locator('[data-keep-editing]').waitFor();
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.deepEqual(await stored(), baseline);
  await pick();
  assert.equal(await page.locator('#document-title').inputValue(), '');
  assert.equal(await page.locator('#document-day').inputValue(), originalDay);
  assert.equal(await page.locator('[data-save-document]').isDisabled(), true);
  assert.equal(await page.locator('#document-title').getAttribute('required'), '');
  assert.equal(await page.locator('#document-title').getAttribute('aria-invalid'), 'true');
  assert.equal(await page.locator('#document-title').getAttribute('aria-describedby'), 'document-requirements');
  assert.match(await page.locator('#document-requirements').innerText(), /Add a title/);
  await navigate('/more');
  await page.locator('[data-discard-record]').click();
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  assert.deepEqual(await stored(), baseline);
  console.log('PASS reverting metadata still protects selected bytes; discard writes nothing and navigation continues');
  await navigate('/media/documents');
  await page.waitForURL('**/media/documents');
  await pick();
  await installFault();
  await page.locator('#document-title').fill('Retained document');
  await fillDate(page, '#document-day', '2024-03-11');
  await page.locator('[data-save-document]').click();
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await page.locator('#document-title').inputValue(), 'Retained document');
  assert.equal(await page.locator('#document-day').inputValue(), '2024-03-11');
  assert.deepEqual(await stored(), baseline);
  await capture('save-failed');
  if (gallery) {
    for (const locale of ['en', 'pl']) {
      await page.locator('[data-close-record]').click();
      await page.locator('[data-discard-record]').click();
      await page.waitForSelector('[data-sheet]', { state: 'detached' });
      await page.evaluate(async (locale) => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        const { setLocale } = await import('/src/lib/paraglide/runtime.js');
        prefs.language = locale;
        setLocale(locale, { reload: false });
      }, locale);
      // Language selection normally reloads the app. Remount before capturing
      // translated labels, rather than changing locale inside an open draft.
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
      await page.evaluate(() => { document.querySelector('.demo-bar').style.display = 'none'; });
      await pick();
      await page.locator('#document-title').fill('Retained document');
      await fillDate(page, '#document-day', '2024-03-11');
      await installFault();
      await page.locator('[data-save-document]').click();
      await page.getByRole('alert').waitFor();
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette;
          prefs.theme = theme;
        }, { palette, theme });
        await capture(`${locale}-${palette}-${theme}-import`);
        await page.locator('[data-close-record]').click();
        await capture(`${locale}-${palette}-${theme}-discard`);
        for (const selector of ['[data-keep-editing]', '[data-discard-record]']) {
          const box = await page.locator(selector).boundingBox();
          assert.ok(box.width >= 48 && box.height >= 48);
        }
        await keep();
      }
      for (const width of [390, 1280]) for (const zoom of [1, 2]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(async (zoom) => {
          document.documentElement.style.zoom = String(zoom);
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.disguise = true;
        }, zoom);
        await page.locator('#document-title').fill('');
        await capture(`${locale}-${width}-${zoom}x-requirements`);
        await page.locator('#document-title').fill('Retained document');
        await capture(`${locale}-${width}-${zoom}x-disguise`);
        await page.locator('[data-close-record]').click();
        await capture(`${locale}-${width}-${zoom}x-discard`);
        await keep();
      }
    }
    await page.evaluate(async () => {
      document.documentElement.style.zoom = '1';
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.disguise = false;
    });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.evaluate(() => { window.documentFault.mode = 'pending'; });
  await page.locator('[data-save-document]').click();
  await page.waitForFunction(() => window.documentFault.resolve);
  await page.locator('[data-save-document]').evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator('[data-save-document]').isDisabled(), true);
  assert.equal(await page.locator('#document-title').isDisabled(), true);
  assert.equal(await page.locator('#document-day').isDisabled(), true);
  assert.equal(await page.locator('fieldset').getAttribute('aria-busy'), 'true');
  await page.keyboard.press('Escape');
  await page.locator('[data-sheet-scrim]').click({ position: { x: 2, y: 2 } });
  await page.evaluate(() => history.back());
  await navigate('/more');
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(await page.locator('#document-title').inputValue(), 'Retained document');
  assert.equal(new URL(page.url()).pathname, '/media/documents');
  await capture('saving');
  await page.evaluate(() => window.documentFault.resolve());
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.getByRole('link', { name: /Retained document/ }).waitFor();
  assert.equal(await page.evaluate(() => window.documentFault.calls), 2);
  assert.equal((await stored()).length, baseline.length + 1);
  await page.getByRole('link', { name: /Retained document/ }).click();
  await page.locator('[data-document-identity] time').waitFor();
  assert.equal(await page.locator('[data-document-identity] time').getAttribute('datetime'), '2024-03-11');
  const download = page.waitForEvent('download');
  await page.locator('[data-export-document]').click();
  assert.deepEqual(await readFile(await (await download).path()), bytes);
  console.log('PASS rejected write retains import; delayed retry blocks dismissal and duplicates; reopened PDF preserves exact bytes/date');

  await navigate('/media/documents');
  await page.waitForURL('**/media/documents');
  await pick();
  await page.locator('#document-title').fill('Private pending document');
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').waitFor();
  await page.evaluate(async () => {
    const { quickExit } = await import('/src/lib/stores/lock.svelte.ts');
    quickExit();
  });
  await page.locator('#document-title').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  await page.locator('[data-blank]').click();
  await page.evaluate(async () => {
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    markUnlocked();
  });
  await pick();
  await page.locator('#document-title').fill('Private lock document');
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
    window.previousAccessMode = bootState.accessMode;
    bootState.accessMode = 'passphrase';
    lockState.unlocked = false;
  });
  await page.locator('#document-title').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    bootState.accessMode = window.previousAccessMode;
    markUnlocked();
  });
  assert.equal((await stored()).length, baseline.length + 1);
  console.log('PASS lock and quick exit conceal import and confirmation immediately');

  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    const { setLocale } = await import('/src/lib/paraglide/runtime.js');
    prefs.language = 'pl'; setLocale('pl', { reload: false });
  });
  await pick();
  assert.equal(await page.getByRole('textbox', { name: 'Co to jest', exact: true }).count(), 1);
  assert.match(await page.locator('#document-requirements').innerText(), /Dodaj tytuł/);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-keep-editing]').innerText(), 'Edytuj dalej');
  await page.locator('[data-discard-record]').click();
  assert.deepEqual(errors, []);
  console.log('PASS Polish title guidance and pending-file confirmation');
} catch (error) {
  console.error(error, errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}

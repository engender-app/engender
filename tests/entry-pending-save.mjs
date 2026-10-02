/* Run against the demo build: VITE_DEMO=1 npm run build && node tests/entry-pending-save.mjs.
   Delay the first encrypted attachment write without replacing storage. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from './yank-sweep-core.mjs';
import { tinyPhoto } from './photo-fixture.mjs';
import { PALETTES } from './palettes.mjs';

const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = '.claude/entry-pending-save-shots';
await mkdir(shots, { recursive: true });

async function attachPhoto(page) {
  await page.locator('[data-section-chip="photos"]').click();
  const buffer = await tinyPhoto(page, '#789abc');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-add-photo]').click();
  assert.equal(await page.locator('[data-save]').isDisabled(), true, 'save waits for the photo picker');
  await (await chooser).setFiles({ name: 'entry.png', mimeType: 'image/png', buffer });
  assert.equal(await page.locator('[data-save]').isDisabled(), true, 'save waits for the photo day');
  await page.locator('[data-photo-day-skip]').click();
  await page.locator('[data-photo-day-skip]').waitFor({ state: 'detached' });
  await page.locator('.photo-view').waitFor();
}

try {
  for (const locale of ['en', 'pl']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(INIT_HIDE_DEMO_SCRIPT);
    await context.addInitScript(STUB_PERSIST_SCRIPT);
    await context.addInitScript(() => {
      const original = FileSystemFileHandle.prototype.createWritable;
      window.entryWrite = { armed: false, entered: false, release: null, fail: false };
      FileSystemFileHandle.prototype.createWritable = async function (...args) {
        const stream = await original.apply(this, args);
        const write = stream.write.bind(stream);
        const name = this.name;
        stream.write = async (...args) => {
          const control = window.entryWrite;
          if (control.armed && name.endsWith('.jpg')) {
            control.armed = false;
            control.entered = true;
            control.name = name;
            control.bytes = [...new Uint8Array(args[0])];
            await new Promise((resolve) => { control.release = resolve; });
            if (control.fail) throw new Error('forced attachment write failure');
          }
          return write(...args);
        };
        return stream;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await settlePage(page, base, '/settings', locale === 'en' ? 'light' : 'dark');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    await page.goto(base + '/entry/new/today?seedMood=4', { waitUntil: 'networkidle' });
    const note = page.locator('#ed-note');
    await note.fill(`Pending entry ${locale}`);
    const scale = page.getByRole('slider').first();
    await scale.focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    assert.equal(await scale.getAttribute('aria-valuenow'), '5');
    await page.locator('[data-section-chip="tags"]').click();
    await page.locator('[data-tag="g-body-eu"]').click();
    await page.locator('[data-section-chip="body"]').click();
    const body = page.locator('[data-editor-section="body"]');
    await body.locator('button').first().click();
    await body.getByRole('slider').focus();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await body.getByRole('slider').getAttribute('aria-valuenow'), '95');
    await attachPhoto(page);
    if (locale === 'pl') await page.locator('[data-section-chip="body"]').click();
    await page.evaluate(() => { window.entryWrite.armed = true; });
    await page.locator('[data-app-savebar]').evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    const barGeometry = () => page.locator('[data-save]').evaluate((button) => ({
      top: button.offsetTop, height: button.offsetHeight, barHeight: button.closest('[data-app-savebar]').offsetHeight
    }));
    const before = await barGeometry();
    await page.locator('[data-save]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.entryWrite.entered);
    await page.locator('[data-save]').dispatchEvent('click');
    assert.equal(await page.locator('[data-save]').isDisabled(), true);
    assert.equal(await page.evaluate(async () => {
      try {
        const image = await createImageBitmap(new Blob([Uint8Array.from(window.entryWrite.bytes)]));
        image.close();
        return true;
      } catch {
        return false;
      }
    }), false, 'OPFS receives encrypted bytes that cannot be decoded as a photo');
    await note.focus();
    await page.keyboard.type(' Later text');
    assert.equal(await note.inputValue(), `Pending entry ${locale}`, 'pending editor refuses keyboard edits');
    await page.locator('[data-mood="2"]').click({ force: true });
    assert.equal(await page.locator('[data-mood="4"]').getAttribute('aria-checked'), 'true');
    await scale.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await scale.getAttribute('aria-valuenow'), '5');
    if (locale === 'en') {
      await page.locator('.photo-remove').click({ force: true });
      assert.equal(await page.locator('.photo-view').count(), 1);
    } else {
      await body.getByRole('slider').focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(await body.getByRole('slider').getAttribute('aria-valuenow'), '95');
      await body.locator('button').first().click({ force: true });
      assert.equal(await body.locator('button').first().getAttribute('aria-pressed'), 'true');
    }
    await page.locator('[data-section-chip="tags"]').click({ force: true });
    assert.equal(await page.locator('[data-section-chip="tags"]').getAttribute('aria-expanded'), 'false');
    await page.locator('[data-nav-item="calendar"]').click();
    assert.equal(new URL(page.url()).pathname, '/entry/new/today', 'pending save prevents departure');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => !!document.activeElement?.closest('.editor, .editor-save-moods')), false);
    await page.locator('[data-save]').evaluate(async (node) => {
      await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    assert.deepEqual(await barGeometry(), before, 'pending save keeps bar layout');
    assert.equal(await page.getByRole('status').filter({ hasText: locale === 'en' ? 'Saving' : 'Zapisywanie' }).count(), 1);
    for (const palette of PALETTES) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(({ palette, theme }) => {
          document.documentElement.dataset.palette = palette;
          document.documentElement.dataset.theme = theme;
        }, { palette, theme });
        await page.screenshot({ path: `${shots}/${locale}-${palette}-${theme}.png` });
      }
    }
    // The minimum supported WebView predates native inert. Native fields
    // and custom scale callbacks must also refuse edits without it.
    await page.evaluate(() => {
      document.querySelector('.editor')?.removeAttribute('inert');
      document.querySelector('[data-save-moods]')?.removeAttribute('inert');
    });
    assert.equal(await note.isEditable(), false);
    await scale.focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await scale.getAttribute('aria-valuenow'), '5');
    if (locale === 'pl') {
      await body.getByRole('slider').focus();
      await page.keyboard.press('ArrowLeft');
      assert.equal(await body.getByRole('slider').getAttribute('aria-valuenow'), '95');
    }
    await page.evaluate(() => window.entryWrite.release());
    await page.waitForURL((url) => url.pathname === '/');
    assert.equal(await page.evaluate(() => localStorage.getItem('engender-entry-draft')), null);
    await page.goto(base + '/day/today', { waitUntil: 'networkidle' });
    const entry = page.locator('[data-entry-card]').filter({ hasText: `Pending entry ${locale}` });
    assert.equal(await entry.count(), 1, 'only one entry is saved');
    await entry.click();
    assert.equal(await note.inputValue(), `Pending entry ${locale}`);
    assert.equal(await page.locator('[data-mood="4"]').getAttribute('aria-checked'), 'true');
    assert.equal(await scale.getAttribute('aria-valuenow'), '5');
    await page.locator('[data-section-chip="tags"]').click();
    assert.equal(await page.locator('[data-tag="g-body-eu"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-section-chip="body"]').click();
    assert.equal(await body.getByRole('slider').getAttribute('aria-valuenow'), '95');
    await page.locator('[data-section-chip="photos"]').click();
    assert.equal(await page.locator('.photo-view').count(), 1);
    await page.goto(base + '/entry/new/today?seedMood=4', { waitUntil: 'networkidle' });
    assert.equal(await note.inputValue(), '', 'reopening has no unsaved accepted edits');

    await note.fill(`Retry entry ${locale}`);
    await attachPhoto(page);
    await page.locator('[data-section-chip="tags"]').click();
    await page.locator('[data-tag="g-body-eu"]').click();
    await page.evaluate(() => { Object.assign(window.entryWrite, { armed: true, entered: false, fail: true }); });
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => window.entryWrite.entered);
    await page.locator('[data-tag="g-body-eu"]').click({ force: true });
    assert.equal(await page.locator('[data-tag="g-body-eu"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => window.entryWrite.release());
    await page.waitForFunction(() => !document.querySelector('[data-save]')?.disabled);
    assert.equal(await note.inputValue(), `Retry entry ${locale}`);
    assert.ok(await page.evaluate(() => localStorage.getItem('engender-entry-draft')), 'failure retains recovery');
    await note.fill(`Corrected retry ${locale}`);
    await page.evaluate(() => { window.entryWrite.fail = false; });
    await page.locator('[data-save]').click();
    await page.waitForURL((url) => url.pathname === '/');
    await page.goto(base + '/day/today', { waitUntil: 'networkidle' });
    await page.locator('[data-entry-card]').filter({ hasText: `Corrected retry ${locale}` }).click();
    assert.equal(await note.inputValue(), `Corrected retry ${locale}`);
    await page.locator('[data-section-chip="photos"]').click();
    assert.equal(await page.locator('.photo-view').count(), 1, 'failed save retains attachment for retry');
    const mirror = await page.evaluate(() => localStorage.getItem('engender-entry-draft'));
    await note.fill(`Recovered edit ${locale}`);
    await page.waitForFunction((previous) => localStorage.getItem('engender-entry-draft') !== previous, mirror);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false);
    assert.equal(await note.inputValue(), `Recovered edit ${locale}`, 'reopening restores unsaved draft over saved content');
    assert.deepEqual(errors, []);
    console.log(`PASS ${locale}: pending save freezes edits and persists entry and encrypted photo`);
    await context.close();
  }
} finally {
  await browser.close();
  await app.close();
}

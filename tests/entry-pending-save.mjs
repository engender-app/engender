/* Run against the demo build: VITE_DEMO=1 npm run build && node tests/entry-pending-save.mjs.
   Delay the first encrypted attachment write without replacing storage. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { launchChromium, previewBuild, settlePage } from './browser-harness.mjs';
import { INIT_HIDE_DEMO_SCRIPT, STUB_PERSIST_SCRIPT } from './yank-sweep-core.mjs';
import { tinyPhoto } from './photo-fixture.mjs';
import { PALETTES } from './palettes.mjs';

const app = await previewBuild(process.cwd());
const base = `http://localhost:${app.httpServer.address().port}`;
const browser = await launchChromium();
const shots = '.claude/entry-pending-save-shots';
await mkdir(shots, { recursive: true });
let diagnosticPage;
const browserErrors = [];

async function attachPhoto(page) {
  if (await page.locator('[data-section-chip="photos"]').getAttribute('aria-expanded') !== 'true') {
    await page.locator('[data-section-chip="photos"]').click();
  }
  const before = await page.locator('.photo-view').count();
  const buffer = await tinyPhoto(page, '#789abc');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-add-photo]').click();
  assert.equal(await page.locator('[data-save]').isDisabled(), true, 'save waits for the photo picker');
  await (await chooser).setFiles({ name: 'entry.png', mimeType: 'image/png', buffer });
  assert.equal(await page.locator('[data-save]').isDisabled(), true, 'save waits for the photo day');
  await page.locator('[data-photo-day-skip]').click();
  await page.locator('[data-photo-day-skip]').waitFor({ state: 'detached' });
  await page.waitForFunction((before) => document.querySelectorAll('.photo-view').length === before + 1, before);
}

try {
  for (const locale of ['en', 'pl']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.addInitScript(INIT_HIDE_DEMO_SCRIPT);
    await context.addInitScript(STUB_PERSIST_SCRIPT);
    await context.addInitScript(() => {
      const encrypt = SubtleCrypto.prototype.encrypt;
      const setItem = Storage.prototype.setItem;
      const notes = new Map();
      window.entryMirror = { armed: false, entered: false, release: null, lastNote: null, finished: false };
      SubtleCrypto.prototype.encrypt = async function (...args) {
        const boundTo = args[0].additionalData;
        const mirror = boundTo && new TextDecoder().decode(boundTo) === 'engender-entry-draft';
        const note = mirror ? JSON.parse(new TextDecoder().decode(args[2])).note : null;
        const encrypted = await encrypt.apply(this, args);
        if (mirror) {
          notes.set(btoa(String.fromCharCode(...new Uint8Array(encrypted))), note);
          if (window.entryMirror.armed) {
            window.entryMirror.armed = false;
            window.entryMirror.entered = true;
            await new Promise((resolve) => { window.entryMirror.release = resolve; });
            window.entryMirror.finished = true;
          }
        }
        return encrypted;
      };
      Storage.prototype.setItem = function (key, value) {
        setItem.call(this, key, value);
        if (key === 'engender-entry-draft') window.entryMirror.lastNote = notes.get(btoa(atob(value).slice(12)));
      };
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
          const result = await write(...args);
          if (control.entered && name === control.name) control.finished = true;
          return result;
        };
        return stream;
      };
    });
    const page = await context.newPage();
    diagnosticPage = page;
    const errors = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      browserErrors.push({ locale, type: 'pageerror', message: error.message });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push({ locale, type: 'console', message: message.text() });
    });
    await settlePage(page, base, '/settings', locale === 'en' ? 'light' : 'dark');
    await page.locator('[data-list-row="language"]').click();
    await page.locator(`[data-segment="${locale}"]`).click();
    await page.goto(base + '/settings/access-mode', { waitUntil: 'networkidle' });
    await page.locator('[data-lock-after-choice="immediately"]').click();
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
    assert.equal(await page.locator('[data-save]').evaluate((button) => getComputedStyle(button).opacity), '1', 'pending status stays readable');
    assert.equal(await page.getByRole('status').filter({ hasText: locale === 'en' ? 'Saving' : 'Zapisywanie' }).count(), 1);
    for (const palette of PALETTES) {
      for (const theme of ['light', 'dark']) {
        await page.evaluate(({ palette, theme }) => {
          document.documentElement.dataset.palette = palette;
          document.documentElement.dataset.theme = theme;
        }, { palette, theme });
        await page.evaluate(async () => {
          await Promise.all(document.getAnimations().filter((animation) => animation instanceof CSSTransition)
            .map((animation) => animation.finished.catch(() => {})));
        });
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
    await entry.waitFor();
    assert.equal(await entry.count(), 1, 'only one entry is saved');
    await entry.click();
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false);
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
    await page.waitForFunction((note) => window.entryMirror.lastNote === note, `Retry entry ${locale}`);
    await attachPhoto(page);
    await page.locator('[data-section-chip="tags"]').click();
    await page.locator('[data-tag="g-body-eu"]').click();
    await page.evaluate(() => { window.entryMirror.armed = true; });
    await note.fill(`Retry after mirror delay ${locale}`);
    await page.waitForFunction(() => window.entryMirror.entered);
    await page.evaluate(() => { Object.assign(window.entryWrite, { armed: true, entered: false, fail: true }); });
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => window.entryWrite.entered);
    await page.locator('[data-tag="g-body-eu"]').click({ force: true });
    assert.equal(await page.locator('[data-tag="g-body-eu"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.locator('[data-applock]').waitFor();
    await note.waitFor({ state: 'detached' });
    await page.locator('[data-save]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-save]').count(), 0, 'privacy gate hides editor and hosted save controls');
    assert.ok(await page.evaluate(() => localStorage.getItem('engender-entry-draft')), 'lock retains pending recovery');
    if (locale === 'pl') await page.evaluate(() => window.entryWrite.release());
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-session-submit]').click();
    await page.locator('[data-applock]').waitFor({ state: 'detached' });
    if (locale === 'en') {
      await page.locator('[data-save]').waitFor();
      assert.equal(await page.locator('[data-save]').isDisabled(), true, 'unlock cannot duplicate a pending save');
      await page.evaluate(() => window.entryWrite.release());
    }
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false);
    assert.equal(await note.inputValue(), `Retry after mirror delay ${locale}`);
    assert.ok(await page.evaluate(() => localStorage.getItem('engender-entry-draft')), 'failure retains recovery');
    await page.locator('[data-section-chip="photos"]').click();
    assert.equal(await page.locator('.photo-view').count(), 1, 'lock and failed storage retain picked media');
    await note.fill(`Corrected retry ${locale}`);
    await page.waitForFunction((note) => window.entryMirror.lastNote === note, `Corrected retry ${locale}`);
    const correctedMirror = await page.evaluate(() => localStorage.getItem('engender-entry-draft'));
    await page.evaluate(() => window.entryMirror.release());
    await page.waitForFunction(() => window.entryMirror.finished);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => localStorage.getItem('engender-entry-draft')), correctedMirror,
      'detached encryption cannot overwrite correction after lock and failed save');
    await page.evaluate(() => { window.entryWrite.fail = false; });
    await page.locator('[data-save]').click();
    await page.waitForURL((url) => url.pathname === '/');
    await page.goto(base + '/day/today', { waitUntil: 'networkidle' });
    await page.locator('[data-entry-card]').filter({ hasText: `Corrected retry ${locale}` }).click();
    assert.equal(await note.inputValue(), `Corrected retry ${locale}`);
    await page.locator('[data-section-chip="photos"]').click();
    assert.equal(await page.locator('.photo-view').count(), 1, 'failed save retains attachment for retry');
    await note.fill(`Recovered edit ${locale}`);
    await page.waitForFunction((note) => window.entryMirror.lastNote === note, `Recovered edit ${locale}`);
    // Model process loss without the ordinary visibility-lock departure.
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false);
    assert.equal(await note.inputValue(), `Recovered edit ${locale}`, 'reopening restores unsaved draft over saved content');
    assert.equal(new URL(page.url()).searchParams.get('from'), '/day/today', 'reopening retains the originating list');
    await attachPhoto(page);
    await page.evaluate(() => { Object.assign(window.entryWrite, { armed: true, entered: false, fail: false }); });
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => window.entryWrite.entered);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.locator('[data-applock]').waitFor();
    await page.locator('[data-save]').waitFor({ state: 'detached' });
    const lockedRoute = page.url();
    await page.evaluate(() => window.entryWrite.release());
    await page.waitForFunction(() => localStorage.getItem('engender-entry-draft') === null);
    assert.equal(page.url(), lockedRoute, 'detached save does not navigate through gate');
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-session-submit]').click();
    await page.locator('[data-entry-saved]').waitFor();
    await page.locator('[data-save]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-save]').count(), 0, 'completed save resumes readonly fallback');
    assert.equal(await page.locator('[data-entry-saved] a').getAttribute('href'), '/day/today',
      'completed save returns to the originating list after unlock');
    await page.locator('[data-entry-saved] a').click();
    await page.waitForURL((url) => url.pathname === '/day/today');
    const recovered = page.locator('[data-entry-card]').filter({ hasText: `Recovered edit ${locale}` });
    await recovered.waitFor();
    assert.equal(await recovered.count(), 1);
    await recovered.click();
    assert.equal(await note.inputValue(), `Recovered edit ${locale}`);
    await page.locator('[data-section-chip="photos"]').click();
    assert.equal(await page.locator('.photo-view').count(), 2, 'save completed while locked persists all media');
    // A route can change behind the lock after the pending editor unmounts.
    const olderEntryRoute = new URL(page.url()).pathname;
    await note.fill(`Detached completion ${locale}`);
    await attachPhoto(page);
    await page.evaluate(() => { Object.assign(window.entryWrite, { armed: true, entered: false, finished: false, fail: false }); });
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => window.entryWrite.entered);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    await page.locator('[data-applock]').waitFor();
    await page.locator('[data-save]').waitFor({ state: 'detached' });
    await page.goBack();
    await page.waitForURL((url) => url.pathname === '/day/today');
    await page.locator('#session-passphrase').fill('demo');
    await page.locator('[data-session-submit]').click();
    await page.locator('[data-applock]').waitFor({ state: 'detached' });
    await page.locator('[data-entry-card]').filter({ hasText: `Pending entry ${locale}` }).click();
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false);
    const newerEntryRoute = new URL(page.url()).pathname;
    assert.notEqual(newerEntryRoute, olderEntryRoute);
    await note.fill(`Other editor recovery ${locale}`);
    await page.waitForFunction((note) => window.entryMirror.lastNote === note, `Other editor recovery ${locale}`);
    const newerMirror = await page.evaluate(() => localStorage.getItem('engender-entry-draft'));
    await page.evaluate(() => window.entryWrite.release());
    await page.waitForFunction(() => window.entryWrite.finished);
    await page.waitForTimeout(500); // allow the attachment's SQLite commit to settle
    assert.equal(await page.evaluate(() => localStorage.getItem('engender-entry-draft')), newerMirror,
      'detached completion cannot clear another editor recovery');
    await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false);
    assert.equal(await note.inputValue(), `Other editor recovery ${locale}`, 'different-route draft recovers after old save finishes');
    await page.goto(base + '/day/today', { waitUntil: 'networkidle' });
    await page.locator('[data-entry-card]').filter({ hasText: `Detached completion ${locale}` }).waitFor();
    assert.equal(await page.locator('[data-entry-card]').filter({ hasText: `Detached completion ${locale}` }).count(), 1,
      'detached save actually committed');
    assert.deepEqual(errors, []);
    console.log(`PASS ${locale}: pending save freezes edits and persists entry and encrypted photo`);
    await context.close();
  }
} catch (error) {
  // The gallery precedes reloads. Keep the failed screen too, without replacing
  // the guard's error if capture fails or the browser stops answering.
  if (diagnosticPage && !diagnosticPage.isClosed()) {
    const page = diagnosticPage;
    let deadline;
    await Promise.race([
      Promise.allSettled([
        writeFile(`${shots}/failure.json`, JSON.stringify({ url: page.url(), error: String(error), browserErrors }, null, 2)),
        page.content().then((html) => writeFile(`${shots}/failure.html`, html)),
        page.evaluate(() => ({
          boot: document.querySelector('[data-app-root]')?.getAttribute('data-boot') ?? null,
          locked: !!document.querySelector('[data-applock]'),
          visibility: document.visibilityState,
          entryCards: [...document.querySelectorAll('[data-entry-card]')].map((node) => node.textContent)
        })).then((state) => writeFile(`${shots}/failure-state.json`, JSON.stringify(state, null, 2))),
        page.screenshot({ path: `${shots}/failure.png`, fullPage: true })
      ]),
      new Promise((resolve) => { deadline = setTimeout(resolve, 5000); })
    ]);
    clearTimeout(deadline);
  }
  throw error;
} finally {
  await browser.close();
  await app.close();
}

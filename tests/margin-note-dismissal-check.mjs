/* Real margin-note composers retain changed text until discard is confirmed. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { continueToTheRest, launchChromium, untilSplashLets } from './browser-harness.mjs';
import { reachAccessSetup, ready, JOURNAL_SECRET, clientRoute } from './browser-tier/built-flow.mjs';

const serial = process.env.MARGIN_NOTE_ANDROID;
const gallery = process.env.MARGIN_NOTE_GALLERY;
const before = process.argv.includes('--before');
if (serial && !/^emulator-\d+$/.test(serial)) throw new Error('Use an owned emulator serial');
const server = serial ? null : await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }, plugins: [{ name: 'margin-no-watch', configResolved(config) { config.server.watch = null; } }] });
await server?.listen();
const browser = serial ? await chromium.connectOverCDP(process.env.MARGIN_NOTE_CDP, { noDefaults: true }) : await launchChromium();
const page = serial ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(30000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const input = page.locator('[data-margin-note-input]');
const add = page.locator('[data-margin-note-add]').last();
const edit = page.locator('[data-margin-note-edit]').last();
const save = page.locator('[data-margin-note-save]');
const sheet = page.locator('[data-sheet]').last();
async function settled() {
  await page.waitForFunction(() => !document.getAnimations().some(a => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity));
}
async function open(kind) {
  await (kind === 'add' ? add : edit).click();
  await input.waitFor();
  await settled();
}
async function dismiss(path) {
  if (path === 'escape') await page.keyboard.press('Escape');
  if (path === 'scrim') await page.locator('[data-sheet-scrim]').last().click({ position: { x: 2, y: 2 } });
  if (path === 'back') {
    if (serial) {
      // Android gives the first Back to an open keyboard, before sheet dismissal.
      const keyboard = () => /mInputShown=true/.test(execFileSync('adb', ['-s', serial, 'shell', 'dumpsys', 'input_method'], { encoding: 'utf8' }));
      if (keyboard()) {
        execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
        for (let attempt = 0; keyboard() && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
        assert.equal(keyboard(), false, 'keyboard closes before testing sheet Back');
      }
      execFileSync('adb', ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK']);
    } else await page.evaluate(() => history.back());
  }
}
async function keep() {
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
}
async function discard() {
  await page.locator('[data-discard-record]').click();
  await input.waitFor({ state: 'detached' });
  await page.locator('[data-sheet]').waitFor({ state: 'detached' });
}
async function returnToDay() {
  if (!new URL(page.url()).pathname.startsWith('/day/')) await clientRoute(page, '/day/today');
  await add.waitFor();
  await settled();
}
async function fault(method, mode) {
  await page.evaluate(async ({ method, mode }) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    const notes = bootState.journal.marginNotes;
    window.marginFault ??= { originals: {}, calls: {}, mode: {} };
    const fault = window.marginFault;
    fault.mode[method] = mode;
    if (!fault.originals[method]) {
      fault.originals[method] = notes[method].bind(notes);
      fault.calls[method] = 0;
      notes[method] = async (...args) => {
        fault.calls[method]++;
        if (fault.mode[method] === 'fail') throw new Error('injected margin note write failure');
        if (fault.mode[method] === 'pending') await new Promise(resolve => { fault.resolve = resolve; });
        return fault.originals[method](...args);
      };
      attachJournal(bootState.journal);
      journalIsOpen();
    }
  }, { method, mode });
}
async function run() {
  if (serial) {
    await reachAccessSetup(page, new URL(page.url()).origin);
    await page.locator('[data-list-row="passphrase"]').press('Enter');
    await page.locator('[data-access-continue]').press('Enter');
    await page.locator('#am-passphrase').fill(JOURNAL_SECRET);
    await page.locator('#am-passphrase-confirm').fill(JOURNAL_SECRET);
    await page.locator('[data-access-submit]').press('Enter');
    await ready(page);
    for (let step = 0; step < 12 && await page.locator('[data-next]').count(); step++) {
      await page.locator('[data-next]').press('Enter');
    }
    await page.locator('[data-finish]').press('Enter');
    await page.locator('[data-home-hello]').waitFor();
  }
  else {
    await page.goto(server.resolvedUrls.local[0]);
    await page.locator('[data-app-root][data-boot="ready"]').waitFor({ timeout: 60000 });
    await untilSplashLets(page);
    const hide = page.getByRole('button', { name: 'Hide this bar', exact: true });
    if (await hide.isVisible()) await hide.click();
    if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
    await page.locator('[data-home-hello]').waitFor();
  }
  await clientRoute(page, '/entry/new/today?seedMood=3');
  await continueToTheRest(page);
  await page.locator('#ed-note').fill('Margin note dismissal fixture');
  if (serial) await page.locator('[data-save]').press('Enter');
  else await page.locator('[data-save]').click();
  await page.waitForURL(url => url.pathname === '/');
  await page.locator('#ed-note').waitFor({ state: 'detached' });
  await returnToDay();

  // Seed one saved note through the same UI whose write admission is retained.
  await open('add');
  await input.fill('Saved margin note');
  if (serial) await save.press('Enter');
  else await save.click();
  await input.waitFor({ state: 'detached' });
  await edit.waitFor();

  if (!serial && gallery) {
    await page.waitForFunction(() => !document.querySelector('[data-toast]'));
    await mkdir(gallery, { recursive: true });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async theme => {
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.palette = 'trans';
        prefs.theme = theme;
      }, theme);
      await open('add');
      await input.fill('A thought to keep while rereading.');
      if (!before) {
        await dismiss('escape');
        await page.locator('[data-keep-editing]').waitFor();
      }
      await settled();
      await sheet.screenshot({ path: `${gallery}/${before ? 'before' : 'after'}-trans-${theme}.png` });
      if (before) {
        await dismiss('escape');
        await input.waitFor({ state: 'detached' });
        assert.equal(await page.locator('[data-keep-editing]').count(), 0, 'base loses a changed composer without asking');
      } else await discard();
    }
    if (before) {
      console.log('PASS baseline captures: changed text closes without asking');
    }
  }
  if (before) return;

  for (const kind of ['add', 'edit']) {
    for (const path of ['escape', 'scrim', 'back']) {
      await open(kind);
      const initial = await input.inputValue();
      const text = `${initial}  unsaved ${kind} ${path}  `;
      await input.fill(text);
      const original = await input.elementHandle();
      await dismiss(path);
      await page.locator('[data-keep-editing]').waitFor();
      assert.equal(new URL(page.url()).pathname, '/day/today');
      await keep();
      assert.equal(await original.evaluate(el => el === document.querySelector('[data-margin-note-input]')), true, 'Keep keeps the same mounted composer');
      assert.equal(await input.inputValue(), text);
      await input.fill(initial);
      await dismiss(path);
      await input.waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-keep-editing]').count(), 0);
      await returnToDay();
      await open(kind);
      await dismiss(path);
      await input.waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-keep-editing]').count(), 0);
      await returnToDay();
      console.log(`PASS ${kind}/${path}: changed text retained in same composer; reverted and untouched close silently`);
    }
    await open(kind);
    await input.fill('Deliberately discarded');
    await dismiss('escape');
    await discard();
    await open(kind);
    assert.equal(await input.inputValue(), kind === 'add' ? '' : 'Saved margin note');
    await dismiss('escape');
    await input.waitFor({ state: 'detached' });
  }
  console.log('PASS confirmed discard does not create or modify a stored note');
  for (const kind of ['add', 'edit']) {
    await open(kind);
    const unsaveable = kind === 'add' ? '  ' : '';
    await input.fill(unsaveable);
    assert.equal(await save.isDisabled(), true);
    await dismiss('escape');
    await keep();
    assert.equal(await input.inputValue(), unsaveable);
    await dismiss('escape');
    await discard();
  }
  console.log('PASS whitespace-only additions and cleared edits remain guarded while Save is disabled');


  if (!serial) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({ reducedMotion });
      await open('add');
      await input.fill('Motion and focus proof');
      await page.evaluate(() => {
        window.marginFrames = [];
        window.marginSampling = true;
        const sample = () => {
          const question = document.querySelector('[data-keep-editing]')?.closest('[data-sheet]');
          if (question) {
            const style = getComputedStyle(question);
            window.marginFrames.push({ top: question.getBoundingClientRect().top, opacity: Number(style.opacity) });
          }
          if (window.marginSampling) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await dismiss('escape');
      await page.locator('[data-keep-editing]').waitFor();
      await settled();
      const frames = await page.evaluate(() => { window.marginSampling = false; return window.marginFrames; });
      assert.ok(frames.length > 2, 'sampled the arriving confirmation over multiple frames');
      if (reducedMotion === 'reduce') {
        assert.ok(frames[0].opacity < 1 && frames.some(f => f.opacity > 0 && f.opacity < 1), 'reduced motion starts transparent and fades');
      } else {
        assert.ok(frames[0].top > frames.at(-1).top + 5, 'normal motion starts below its final position');
      }
      for (const control of ['[data-keep-editing]', '[data-discard-record]']) {
        const box = await page.locator(control).boundingBox();
        assert.ok(box.height >= 48 && box.width >= 48 && box.x >= 0 && box.x + box.width <= 390);
      }
      assert.equal(await sheet.evaluate(el => el.contains(document.activeElement)), true);
      await page.keyboard.press('Escape');
      await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
      assert.equal(await input.inputValue(), 'Motion and focus proof');
      assert.equal(await input.evaluate(el => el.closest('[data-sheet]').contains(document.activeElement)), true);
      await dismiss('escape');
      await discard();
      console.log(`PASS ${reducedMotion}: ${frames.length} frames, first=${JSON.stringify(frames[0])}, last=${JSON.stringify(frames.at(-1))}; focus returns to composer, 48px actions`);
    }
  }

  if (!serial) {
    for (const [kind, method] of [['add', 'add'], ['edit', 'edit']]) {
      await fault(method, 'fail');
      await open(kind);
      await input.fill(`Retry ${method}`);
      await save.click();
      await page.locator('[data-toast]').filter({ hasText: 'Could not save' }).last().waitFor();
      assert.equal(await input.inputValue(), `Retry ${method}`);
      await dismiss('escape');
      await keep();
      await fault(method, 'pending');
      await save.click();
      await page.waitForFunction(() => typeof window.marginFault.resolve === 'function');
      await save.evaluate(button => { button.click(); button.click(); });
      assert.equal(await save.isDisabled(), true);
      for (const path of ['escape', 'scrim', 'back']) await dismiss(path);
      assert.equal(await page.locator('[data-sheet]').count(), 1);
      assert.equal(await page.locator('[data-keep-editing]').count(), 0);
      assert.equal(new URL(page.url()).pathname, '/day/today');
      assert.equal(await page.evaluate(method => window.marginFault.calls[method], method), 2);
      await page.evaluate(() => { window.marginFault.resolve(); delete window.marginFault.resolve; });
      await input.waitFor({ state: 'detached' });
      console.log(`PASS ${method}: rejected write keeps draft; pending write refuses closure and duplicate saves`);
    }
    await fault('remove', 'fail');
  }
  await page.locator('[data-margin-note-delete]').last().click();
  const remove = page.locator('[data-confirm-delete-margin-note]');
  await remove.click();
  if (!serial) {
    await page.locator('[data-delete-failed]').waitFor();
    await fault('remove', 'pending');
    await remove.click();
    await page.waitForFunction(() => typeof window.marginFault.resolve === 'function');
    await remove.evaluate(button => { button.click(); button.click(); });
    await dismiss('escape');
    assert.equal(await remove.count(), 1);
    assert.equal(await page.evaluate(() => window.marginFault.calls.remove), 2);
    await page.evaluate(() => window.marginFault.resolve());
  }
  await remove.waitFor({ state: 'detached' });
  console.log('PASS delete retains its confirmation and write admission');
  if (!serial) {
    await page.evaluate(async () => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.disguise = true;
    });
    await open('add');
    await input.fill('Private margin note');
    await dismiss('escape');
    await page.locator('[data-keep-editing]').waitFor();
    assert.equal(await sheet.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = 'passphrase';
      lockState.unlocked = false;
    });
    await input.waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-discard-record]').count(), 0);
    assert.equal(await page.locator('body').innerText().then(text => text.includes('Private margin note')), false);
    console.log('PASS disguise confirmation fits; lock removes private composer and discard question');
  }
  assert.deepEqual(errors, []);
}

try {
  await run();
} finally {
  await browser.close();
  await server?.close();
}

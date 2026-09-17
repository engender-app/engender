import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL((url) => url.pathname === path);
}
async function keepEditing() {
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
}
async function discard() {
  await page.locator('[data-discard-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
}
async function openNew() {
  await page.locator('[data-add]').click();
  await page.waitForFunction(() => document.activeElement?.closest('[data-sheet]'));
  if (await page.locator('.flatpickr-calendar.open').count()) await page.keyboard.press('Escape');
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  if (await page.locator('[data-leave-setup]').count()) {
    await page.locator('[data-leave-setup]').click();
    await page.waitForSelector('[data-home-hello]');
  }
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = '/health/appointments';
    link.id = 'record-proof-link';
    link.textContent = 'Appointments';
    document.body.append(link);
  });
  await page.locator('#record-proof-link').click();
  await page.locator('[data-add]').click();
  await page.locator('#appointment-note').fill('Questions for my next visit. '.repeat(40));
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').click();
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Questions for my next visit. '.repeat(40));
  console.log('PASS cancelled dismissal preserves long appointment notes');

  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  const note = await page.locator('#appointment-note').inputValue();
  for (const path of ['scrim', 'drag', 'close', 'back']) {
    if (path === 'scrim') await page.locator('[data-sheet-scrim]').click({ position: { x: 2, y: 2 } });
    if (path === 'close') await page.locator('[data-close-record]').click();
    if (path === 'back') await page.evaluate(() => history.back());
    if (path === 'drag') {
      await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
      const box = await page.locator('.sheet-handle').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2, box.y + 130, { steps: 10 });
      await page.mouse.up();
    }
    await keepEditing();
    assert.equal(await page.locator('#appointment-note').inputValue(), note);
    assert.equal(new URL(page.url()).pathname, '/health/appointments');
    assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
    console.log(`PASS cancelled ${path} dismissal retains fields and sheet position`);
  }

  await page.locator('#appointment-note').fill('');
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS reverting appointment edits closes without confirmation');

  const visits = await page.locator('[data-appointment]').count();
  await openNew();
  await page.locator('#appointment-note').fill('Discard this unfinished visit');
  await page.locator('[data-close-record]').click();
  await discard();
  assert.equal(await page.locator('[data-appointment]').count(), visits);
  await openNew();
  assert.equal(await page.locator('#appointment-note').inputValue(), '');
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS discard closes without creating a partial appointment');

  await navigate('/care/labs');
  await openNew();
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await openNew();
  await page.locator('#lab-provider').fill('Laboratory');
  await page.locator('#lab-note').fill('Waiting for remaining values');
  await page.keyboard.press('Escape');
  await keepEditing();
  assert.equal(await page.locator('#lab-provider').inputValue(), 'Laboratory');
  assert.equal(await page.locator('#lab-note').inputValue(), 'Waiting for remaining values');
  await page.locator('#lab-provider').fill('');
  await page.locator('#lab-note').fill('');
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS partial labs survive cancellation; reverted values close cleanly');

  await page.locator('[data-lab-result]').first().click();
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-lab-result]').first().click();
  const originalValue = await page.locator('#lab-value').inputValue();
  await page.locator('#lab-value').fill('321');
  await page.locator('#lab-value').fill(originalValue);
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS existing lab inspection and reverted numeric values remain clean');

  await navigate('/health/appointments');
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.appointments.upsertAppointment.bind(bootState.journal.appointments);
    window.recordFault = { mode: 'fail', calls: 0 };
    bootState.journal.appointments.upsertAppointment = async (draft) => {
      window.recordFault.calls++;
      if (window.recordFault.mode === 'fail') throw new Error('injected record save failure');
      if (window.recordFault.mode === 'pending') await new Promise((resolve) => { window.recordFault.resolve = resolve; });
      return original(draft);
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
  await openNew();
  await page.locator('#appointment-note').fill('Save failure must retain this');
  await page.locator('[data-save-appointment]').click();
  await page.locator('[role="alert"]').filter({ hasText: 'Could not save' }).waitFor();
  await page.keyboard.press('Escape');
  await keepEditing();
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Save failure must retain this');
  console.log('PASS failed save retains draft and dismissal guard');

  await page.evaluate(() => { window.recordFault.mode = 'pending'; });
  await page.locator('[data-save-appointment]').click();
  await page.waitForFunction(() => window.recordFault.resolve);
  assert.equal(await page.locator('[data-save-appointment]').isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-sheet]').count(), 1);
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Save failure must retain this');
  await page.evaluate(() => window.recordFault.resolve());
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.recordFault.calls), 2);
  console.log('PASS pending save prevents dismissal; completed save closes exactly once');

  await openNew();
  await page.locator('#appointment-note').fill('Leaving via browser history');
  await page.evaluate(() => history.back());
  await page.locator('[data-discard-record]').click();
  await page.waitForURL((url) => url.pathname === '/care/labs');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS discard resumes requested browser navigation');

  await navigate('/transition/milestones');
  await page.locator('[data-add]').click();
  await page.locator('[data-own]').click();
  await page.locator('#ms-name').waitFor();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#227799';
    ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.locator('[data-add-photo]').click();
  await (await chooser).setFiles({ name: 'draft-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.locator('[data-photo-day-skip]').click();
  await page.locator('[data-photo-day-skip]').waitFor({ state: 'detached' });
  await page.locator('.photo-wrap img').waitFor();
  const photoUrl = await page.locator('.photo-wrap img').getAttribute('src');
  await page.locator('[data-close-record]').click();
  await keepEditing();
  assert.equal(await page.locator('.photo-wrap img').getAttribute('src'), photoUrl);
  await page.locator('[data-close-record]').click();
  await discard();
  await page.locator('[data-add]').click();
  await page.locator('[data-own]').click();
  await page.locator('#ms-name').waitFor();
  assert.equal(await page.locator('.photo-wrap img').count(), 0);
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS temporary photo survives Keep editing and is released on Discard');

  await navigate('/health/appointments');
  await openNew();
  await page.locator('#appointment-note').fill('Private appointment details');
  await page.locator('[data-close-record]').click();
  await page.locator('[data-keep-editing]').waitFor();
  await page.evaluate(async () => {
    const { quickExit } = await import('/src/lib/stores/lock.svelte.ts');
    quickExit();
  });
  await page.locator('[data-blank]').waitFor();
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  assert.equal(await page.locator('[data-blank]').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return document.elementFromPoint(rect.width / 2, rect.height / 2) === el;
  }), true);
  await page.locator('[data-blank]').click();
  await page.evaluate(async () => {
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    markUnlocked();
  });
  if (await page.locator('[data-close-record]').count()) {
    await page.locator('[data-close-record]').click();
    await discard();
  }
  console.log('PASS quick exit covers private content immediately without a discard prompt');

  await openNew();
  await page.locator('#appointment-note').fill('Private appointment details');
  await page.locator('[data-close-record]').click();
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
    window.previousAccessMode = bootState.accessMode;
    bootState.accessMode = 'passphrase';
    lockState.unlocked = false;
  });
  await page.locator('#appointment-note').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    bootState.accessMode = window.previousAccessMode;
    markUnlocked();
  });
  console.log('PASS lock removes editor and confirmation without delaying privacy gate');

  await openNew();
  await page.locator('#appointment-note').fill('Layout proof');
  await page.locator('[data-close-record]').click();
  await page.locator('[data-keep-editing]').waitFor();
  await mkdir('.claude/record-dismissal-shots', { recursive: true });
  for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
    await page.evaluate(async ({ palette, theme }) => {
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.palette = palette;
      prefs.theme = theme;
    }, { palette, theme });
    await page.locator('[data-sheet]').last().screenshot({ path: `.claude/record-dismissal-shots/${palette}-${theme}.png` });
    for (const selector of ['[data-keep-editing]', '[data-discard-record]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.width >= 48 && box.height >= 48);
    }
  }
  console.log('PASS confirmation renders across eight palettes and both themes with 48px actions');
  await discard();
  await navigate('/settings');
  await page.locator('[data-segment="pl"]').click();
  await page.waitForSelector('[data-app-root][data-boot="ready"]');
  await navigate('/health/appointments');
  await openNew();
  await page.locator('#appointment-note').fill('Pytania na wizytę');
  await page.locator('[data-close-record]').click();
  await page.locator('[data-keep-editing]').waitFor();
  assert.equal(await page.locator('[data-keep-editing]').innerText(), 'Edytuj dalej');
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.disguise = true;
  });
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const sheet = page.locator('[data-sheet]').last();
    assert.ok(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth));
    for (const selector of ['[data-keep-editing]', '[data-discard-record]']) {
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.height >= 48);
    }
    await sheet.screenshot({ path: `.claude/record-dismissal-shots/pl-disguise-${width}.png` });
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#appointment-note').inputValue(), 'Pytania na wizytę');
  console.log('PASS Polish disguise layout at 320/390/430/1280px; Escape cancels confirmation');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await server.close();
}

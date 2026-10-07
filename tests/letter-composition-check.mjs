import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, launchChromium } from './browser-harness.mjs';

const server = await createServer({ cacheDir: '.svelte-kit/letter-composition-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
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
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(resolve), 0))));
}
async function open() {
  await page.locator('[data-add]').click();
  await page.locator('textarea').waitFor();
}
async function keep() {
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
}
async function stored() {
  return page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal.letters.getLetters(100);
  });
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await navigate('/transition/letters');
  await page.waitForURL('**/transition/letters');
  await open();
  const baseline = await page.locator('#letter-unlock').inputValue();
  await page.locator('textarea').fill('Keep this letter');
  await page.keyboard.press('Escape');
  await keep();
  assert.equal(await page.locator('textarea').inputValue(), 'Keep this letter');
  console.log('PASS changed letter dismissal retains text');
  const dates = await page.evaluate(async () => {
    const { todayEpochDay, dateInputValueFromEpochDay } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();
    return { today, future: dateInputValueFromEpochDay(today + 30), past: dateInputValueFromEpochDay(today - 1) };
  });
  await page.evaluate(async (day) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.milestones.upsertMilestone({ name: 'Letter milestone', epochDay: day + 30 });
  }, dates.today);
  await page.getByRole('button', { name: 'Letter milestone', exact: true }).click();
  assert.equal(await page.locator('#letter-unlock').inputValue(), dates.future);
  console.log('PASS milestone shortcut still selects unlock date');
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
    assert.equal(await page.locator('textarea').inputValue(), 'Keep this letter');
    assert.equal(await page.locator('#letter-unlock').inputValue(), dates.future);
    assert.equal(new URL(page.url()).pathname, '/transition/letters');
    assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
  }
  console.log('PASS scrim, drag, close, Back and navigation preserve composition');

  await page.locator('textarea').fill('');
  await fillDate(page, '#letter-unlock', baseline);
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  await open();
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS unchanged and reverted text/date close without confirmation');

  await open();
  assert.equal(await page.locator('[data-save-letter]').isDisabled(), true);
  assert.match(await page.locator('#letter-requirements').innerText(), /Write some text/);
  await page.getByRole('textbox', { name: 'Letter', exact: true }).fill('Discard this letter');
  await page.locator('#letter-unlock').click();
  await page.locator('[data-date-picker-clear]').click();
  assert.equal(await page.locator('[data-save-letter]').isDisabled(), true);
  assert.match(await page.locator('#letter-requirements').innerText(), /valid unlock date/);
  assert.equal(await page.locator('#letter-unlock').getAttribute('aria-invalid'), 'true');
  await navigate('/more');
  await page.locator('[data-discard-record]').click();
  await page.waitForURL('**/more');
  await page.locator('[data-hub-search]').waitFor();
  assert.equal((await stored()).length, 0);
  await navigate('/transition/letters');
  await page.waitForURL('**/transition/letters');
  await open();
  assert.equal(await page.locator('textarea').inputValue(), '');
  assert.equal(await page.locator('#letter-unlock').inputValue(), baseline);
  console.log('PASS requirements explain disabled seal; navigation discard clears only draft');

  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.letters.addLetter.bind(bootState.journal.letters);
    window.letterFault = { mode: 'fail', calls: 0 };
    bootState.journal.letters.addLetter = async (draft) => {
      window.letterFault.calls++;
      if (window.letterFault.mode === 'fail') throw new Error('injected letter save failure');
      if (window.letterFault.mode === 'pending') await new Promise((resolve) => { window.letterFault.resolve = resolve; });
      const id = await original(draft);
      window.letterFault.id = id;
      return id;
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
  await page.locator('textarea').fill('A future letter worth keeping');
  await fillDate(page, '#letter-unlock', dates.future);
  await page.locator('[data-save-letter]').click();
  await page.getByRole('alert').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await page.locator('textarea').inputValue(), 'A future letter worth keeping');
  assert.equal(await page.locator('#letter-unlock').inputValue(), dates.future);
  assert.equal((await stored()).length, 0);
  await page.evaluate(() => { window.letterFault.mode = 'pending'; });
  await page.locator('[data-save-letter]').click();
  await page.waitForFunction(() => window.letterFault.resolve);
  await page.locator('[data-save-letter]').evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator('[data-save-letter]').isDisabled(), true);
  assert.equal(await page.locator('textarea').isDisabled(), true);
  await page.keyboard.press('Escape');
  await page.evaluate(() => history.back());
  await navigate('/more');
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(await page.locator('textarea').inputValue(), 'A future letter worth keeping');
  assert.equal(new URL(page.url()).pathname, '/transition/letters');
  await page.evaluate(() => window.letterFault.resolve());
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-letter-state="sealed"]').waitFor();
  assert.match(await page.locator('[data-toast-kind="record-saved"]').last().innerText(), /Letter sealed/);
  assert.equal(await page.evaluate(() => window.letterFault.calls), 2);
  const letters = await stored();
  assert.equal(letters.length, 1);
  assert.equal(letters[0].text, 'A future letter worth keeping');
  assert.equal(letters[0].unlockEpochDay, dates.today + 30);
  assert.equal(await page.locator('[data-letter-text]').count(), 0);
  console.log('PASS failed write retains text/date; delayed retry and repeated taps save exactly once');

  await open();
  assert.equal(await page.locator('textarea').inputValue(), '');
  assert.equal(await page.locator('#letter-unlock').inputValue(), baseline);
  await page.locator('textarea').fill('Readable past letter');
  await fillDate(page, '#letter-unlock', dates.past);
  await page.evaluate(() => { window.letterFault.mode = 'normal'; });
  await page.locator('[data-save-letter]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const readyId = await page.evaluate(() => window.letterFault.id);
  await page.locator(`[data-letter-open="${readyId}"]`).click();
  assert.equal(await page.locator('[data-letter-text]').innerText(), 'Readable past letter');
  assert.match(await page.locator('[data-toast-kind="record-saved"]').last().innerText(), /ready to read/);
  await page.locator('[data-letter-close]').click();
  console.log('PASS past date remains permissible; saved text reopens through reading flow');

  await open();
  await page.locator('textarea').fill('Readable today letter');
  await page.locator('[data-save-letter]').click();
  await page.locator('[data-letter-arrival]').waitFor();
  await page.locator('[data-letter-arrival]').getByRole('button', { name: 'Open it' }).click();
  assert.equal(await page.locator('[data-letter-arrival] [data-letter-text]').innerText(), 'Readable today letter');
  await page.locator('[data-letter-arrival] [data-letter-close]').click();
  await page.locator('[data-letter-arrival]').waitFor({ state: 'detached' });
  assert.equal((await stored()).length, 3);
  console.log('PASS today date keeps arrival and reading lifecycle');

  await open();
  await page.locator('textarea').fill('Private lock letter');
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
    window.previousAccessMode = bootState.accessMode;
    bootState.accessMode = 'passphrase';
    lockState.unlocked = false;
  });
  await page.locator('textarea').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
    bootState.accessMode = window.previousAccessMode;
    markUnlocked();
  });
  assert.equal((await stored()).length, 3);
  console.log('PASS lock conceals composition immediately');
  await navigate('/settings');
  await page.locator('[data-list-row="language"]').click();
  await Promise.all([
    page.waitForEvent('load'),
    page.locator('[data-segment="pl"]').click()
  ]);
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  await navigate('/transition/letters');
  await page.waitForURL('**/transition/letters');
  await open();
  assert.equal(await page.getByRole('textbox', { name: 'List', exact: true }).count(), 1);
  assert.match(await page.locator('#letter-requirements').innerText(), /Napisz coś/);
  await page.locator('#letter-text').fill('List do mnie z przyszłości');
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.disguise = true;
    document.documentElement.style.zoom = '2';
  });
  await mkdir('.claude/letter-shots', { recursive: true });
  await page.locator('[data-sheet]').screenshot({ path: '.claude/letter-shots/pl-disguise-200-compose.png' });
  assert.equal(await page.locator('[data-sheet]').evaluate((el) => el.scrollWidth <= el.clientWidth), true);
  await page.keyboard.press('Escape');
  await page.locator('[data-keep-editing]').waitFor();
  assert.equal(await page.locator('[data-keep-editing]').innerText(), 'Edytuj dalej');
  await page.locator('[data-sheet]').last().screenshot({ path: '.claude/letter-shots/pl-disguise-200-discard.png' });
  await keep();
  assert.equal(await page.locator('#letter-text').inputValue(), 'List do mnie z przyszłości');
  await page.evaluate(async () => {
    const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
    prefs.lockAfter = 'immediately';
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.visibilityState;
  });
  await page.locator('#letter-text').waitFor({ state: 'detached' });
  assert.equal(await page.locator('[data-discard-record]').count(), 0);
  // A web lock closes the journal (after-release ticket 10): while the gate is
  // up there is no handle to read letters through. Waited for rather than read
  // once: the gate is drawn a moment before the lock lets go of the handle.
  await page.waitForFunction(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal === null;
  });
  await page.locator('#session-passphrase').fill('demo');
  await page.locator('[data-session-submit]').click();
  await page.locator('[data-applock]').waitFor({ state: 'detached' });
  assert.equal((await stored()).length, 3, 'the letters saved before the lock read back through the reopened journal');
  console.log('PASS Polish labels and discard at 200% zoom; disguise lock conceals unsaved text');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(errors, page.url(), await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}

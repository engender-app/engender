/* After-release ticket 06: every save says it worked, every failure says so,
   and a double tap writes once. One check per class of save rather than one
   per screen: RecordSheet (measurements, standing for its seventeen
   screens), a hand-written sheet save (affirmations), a save that leaves
   the screen (a reminder), surgery's notes, and Today's acknowledgement of
   an entry saved today. Failures come from a journal operation replaced in
   the page with one that rejects, the same seam letter-composition-check
   uses; nothing may end as an unhandled rejection. */
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({
  cacheDir: '.svelte-kit/save-and-failure-vite',
  server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } }
});
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  window.unhandled = [];
  addEventListener('unhandledrejection', (event) => window.unhandled.push(String(event.reason)));
});

async function navigate(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.waitForURL(`**${path}`);
}

/* Replaces journal.<area>.<operation> with a wrapper whose behaviour the
   test switches: 'fail' rejects, 'pending' waits for window.fault.resolve(),
   'pass' calls through. Calls are counted, which is how a double tap is
   seen to write once. */
async function fault(area, operation, mode = 'fail') {
  await page.evaluate(async ({ area, operation, mode }) => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const target = bootState.journal[area];
    window.originals ??= {};
    const key = `${area}.${operation}`;
    window.originals[key] ??= target[operation].bind(target);
    const original = window.originals[key];
    window.fault = { mode, calls: 0 };
    target[operation] = async (...args) => {
      window.fault.calls++;
      if (window.fault.mode === 'fail') throw new Error(`injected ${key} failure`);
      if (window.fault.mode === 'pending') await new Promise((resolve) => { window.fault.resolve = resolve; });
      return original(...args);
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  }, { area, operation, mode });
}
const setMode = (mode) => page.evaluate((mode) => { window.fault.mode = mode; delete window.fault.resolve; }, mode);
const calls = () => page.evaluate(() => window.fault.calls);
const toastOf = (kind) => page.locator(`[data-toast-kind="${kind}"]`);
/* Within 1.2s, the audit's own bound. Filtered by its words, since an
   earlier toast of the same kind can still be on screen. */
async function expectToast(kind, text) {
  const toast = text ? toastOf(kind).filter({ hasText: text }) : toastOf(kind);
  await toast.last().waitFor({ timeout: 1200 });
}
async function doubleTapWhilePending(button) {
  await setMode('pending');
  const before = await calls();
  await button.evaluate((el) => { el.click(); el.click(); });
  await page.waitForFunction(() => window.fault.resolve);
  assert.equal(await button.isDisabled(), true, 'the button holds while its write is in flight');
  await page.evaluate(() => window.fault.resolve());
  return before;
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(() => { const bar = document.querySelector('.demo-bar'); if (bar) bar.style.display = 'none'; });

  // RecordSheet: save confirms, a failed save keeps the sheet, a failed delete keeps its sheet.
  await navigate('/body/measurements');
  await page.locator('[data-add]').click();
  await page.locator('#measurement-value').fill('71.5');
  await fault('measurements', 'upsertMeasurement');
  await page.locator('[data-save-measurement]').click();
  await page.locator('[data-save-failed]').waitFor();
  assert.equal(await page.locator('#measurement-value').inputValue(), '71.5');
  const before = await doubleTapWhilePending(page.locator('[data-save-measurement]'));
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await calls(), before + 1, 'a double tap on Save writes once');
  await expectToast('record-saved', /Saved/);
  console.log('PASS record sheet: failed save stays with its draft, double tap writes once, save confirms');

  const row = page.locator('[data-measurement]').filter({ hasText: '71.5' }).first();
  await fault('measurements', 'deleteMeasurement');
  await row.click();
  await page.locator('[data-delete-measurement]').click();
  await page.locator('[data-confirm-delete-measurement]').click();
  await page.locator('[data-delete-failed]').waitFor();
  assert.equal(await page.locator('[data-confirm-delete-measurement]').isVisible(), true, 'the confirm sheet stays');
  const beforeDelete = await doubleTapWhilePending(page.locator('[data-confirm-delete-measurement]'));
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await calls(), beforeDelete + 1, 'a double tap on Delete removes once');
  await expectToast('record-deleted', /Deleted/);
  await row.waitFor({ state: 'detached' });
  console.log('PASS record sheet: failed delete says so in its sheet, double tap deletes once, delete confirms');

  // A hand-written sheet save: affirmations.
  await navigate('/settings/affirmations');
  await page.locator('[data-add-affirmation]').click();
  await page.locator('[data-sheet] textarea').fill('A line worth keeping');
  await fault('affirmations', 'addLine');
  const saveLine = page.locator('[data-sheet] .btn-primary');
  await saveLine.click();
  await expectToast('failed', /Could not save/);
  assert.equal(await page.locator('[data-sheet] textarea').inputValue(), 'A line worth keeping');
  const beforeLine = await doubleTapWhilePending(saveLine);
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await calls(), beforeLine + 1);
  await expectToast('record-saved');
  console.log('PASS sheet save: failure toasts and keeps the sheet, double tap writes once, save confirms');

  // A save that leaves the screen: a reminder.
  await navigate('/settings/reminders/new');
  await page.locator('[data-save]').waitFor();
  await fault('reminders', 'upsertReminder');
  await page.locator('[data-save]').click();
  await expectToast('failed');
  assert.match(page.url(), /reminders\/new$/, 'a failed save stays on the screen');
  await setMode('pass');
  await page.locator('[data-save]').click();
  await page.waitForURL(/\/settings\/reminders$/);
  await expectToast('record-saved');
  console.log('PASS leaving save: failure stays on the screen, success leaves and confirms');

  // Surgery notes: confirm, and switching procedure asks first.
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.procedures.upsertProcedure({ name: 'Probe procedure one' });
    await journal.procedures.upsertProcedure({ name: 'Probe procedure two' });
  });
  await navigate('/health/surgery');
  await page.getByRole('button', { name: /Probe procedure one/ }).first().click();
  await page.locator('#surgery-notes').fill('Ask about drains');
  await page.getByRole('button', { name: /Probe procedure two/ }).first().click();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#surgery-notes').inputValue(), 'Ask about drains', 'keeping leaves the notes');
  await fault('procedures', 'setNotes');
  await page.locator('[data-save-notes]').click();
  await expectToast('failed');
  await setMode('pass');
  await page.locator('[data-save-notes]').click();
  await expectToast('record-saved', /Notes saved/);
  await page.getByRole('button', { name: /Probe procedure two/ }).first().click();
  assert.equal(await page.locator('[data-keep-editing]').count(), 0, 'saved notes switch without a question');
  console.log('PASS surgery notes: switching asks before losing typed notes, a failed save says so, a save confirms');

  // Today: an entry saved today is acknowledged on the strip.
  await navigate('/');
  await page.locator('[data-mood-chips]').waitFor();
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    await journal.entries.upsertEntry({ epochDay: todayEpochDay(), timestamp: Date.now(), mood: 4 });
  });
  await page.locator('[data-mood-chips] [data-mood="4"][aria-checked="true"]').waitFor();
  // The earlier time, if today had one, crosses out under the new one.
  const logged = page.locator('[data-home-log-logged]:not([inert])');
  await page.waitForFunction(() => document.querySelectorAll('[data-home-log-logged]').length === 1);
  assert.match(await logged.innerText(), /Logged at/);
  await page.locator('[data-mood-chips] [data-mood="4"]').click();
  await page.waitForURL(/\/entry\/new\/today\?seedMood=4/);
  console.log('PASS Today rings the latest mood saved today, says when, and the ringed face still adds another');

  assert.deepEqual(await page.evaluate(() => window.unhandled), [], 'no unhandled rejections');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS no unhandled rejection or page error across the run');
} finally {
  await browser.close();
  await server.close();
}

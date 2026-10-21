/* After-release ticket 06: every save says it worked, every failure says so,
   and a double tap writes once. One check per class of save rather than one
   per screen: a save that leaves
   the screen (a reminder), surgery's notes, and Today's acknowledgement of
   an entry saved today. Then the eight action sites UI 17 brought under
   the same rule, each failing once and then double tapped while held. Failures come from a journal operation replaced in
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
async function doubleTapWhilePending(button, field) {
  await setMode('pending');
  const before = await calls();
  await button.evaluate((el) => { el.click(); el.click(); });
  await page.waitForFunction(() => window.fault.resolve);
  assert.equal(await button.isDisabled(), true, 'the button holds while its write is in flight');
  if (field) assert.equal(await field.evaluate((el) => !!el.closest('[inert]') || el.matches(':disabled')), true, 'the form is frozen while its write is in flight');
  await page.evaluate(() => window.fault.resolve());
  return before;
}

/* UI ticket 17: the action sites after-release 06 missed. A rejected write
   says the catalogued failure and leaves the control ready for a retry; a
   held write plus a second tap then admits one write. */
async function failsThenRetries(button, kept) {
  // Only a toast raised by this tap counts, not one still up from before.
  await page.evaluate(() => document.querySelectorAll('[data-toast]').forEach((t) => t.setAttribute('data-seen', '')));
  await button.click();
  await page.locator('[data-toast-kind="failed"]:not([data-seen])').filter({ hasText: /Could not save/ }).waitFor({ timeout: 1200 });
  if (kept) await kept();
  assert.equal(await button.isDisabled(), false, 'a failed write clears busy for a retry');
}
/* The records a section needs before its screen opens. A switch rather
   than a function passed in: the app's CSP refuses eval in the page. */
const seed = (what, arg) => page.evaluate(async ({ what, arg }) => {
  const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
  const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
  const today = todayEpochDay();
  if (what === 'side effect') return journal.sideEffects.upsertSideEffect({ name: 'Probe side effect', severity: null, epochDay: today, resolvedEpochDay: null });
  if (what === 'lab result') return journal.labs.upsertResult({ epochDay: today, analyte: 'Probe analyte', value: 1.5, unit: 'nmol/L' });
  if (what === 'procedure') return journal.procedures.upsertProcedure({ name: 'Probe dilation procedure', surgeryEpochDay: today - 30, kind: 'vaginoplasty' });
  if (what === 'no procedure') return journal.procedures.deleteProcedure(arg);
  if (what === 'tryout') return journal.tryouts.upsertTryout({ kind: 'name', label: 'Probe tryout', startEpochDay: today - 3, endEpochDay: null });
  throw new Error(`no seed for ${what}`);
}, { what, arg });
/* A row toggle stays pressable while its write runs (disabling it would drop
   keyboard focus), so the double tap is counted rather than seen held. */
async function doubleToggleWhilePending(control) {
  await setMode('pending');
  const before = await calls();
  await control.evaluate((el) => { el.click(); el.click(); });
  await page.waitForFunction(() => window.fault.resolve);
  await page.evaluate(() => window.fault.resolve());
  return before;
}

try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await page.evaluate(() => { const bar = document.querySelector('.demo-bar'); if (bar) bar.style.display = 'none'; });


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

  // UI 17: a custom effect type, the appointment prep list's own add and its two toggles.
  await navigate('/care/changes');
  await page.locator('[data-manage-effects]').click();
  await page.locator('#new-effect-type').fill('Probe effect type');
  await fault('personalEffects', 'addCustomEffectType');
  const addEffectType = page.locator('[data-add-effect-type]');
  await failsThenRetries(addEffectType, async () => {
    assert.equal(await page.locator('#new-effect-type').inputValue(), 'Probe effect type', 'a failed add keeps the typed name');
  });
  const beforeEffect = await doubleTapWhilePending(addEffectType, page.locator('#new-effect-type'));
  await page.waitForFunction(() => document.querySelector('#new-effect-type')?.value === '');
  assert.equal(await calls(), beforeEffect + 1, 'a double tap adds one effect type');
  const typeRow = page.locator('[data-sheet] .managed-label').filter({ hasText: 'Probe effect type' });
  await typeRow.first().waitFor();
  assert.equal(await typeRow.count(), 1, 'one row for the new type');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS effect type: failure says so and keeps the name, double tap adds one');

  await navigate('/health/appointments');
  await page.locator('[data-add-prep]').first().click();
  await page.locator('#appointment-prep-input').fill('Probe prep question');
  await fault('checklists', 'addToStandaloneChecklist');
  const addPrep = page.locator('[data-save-appointment-item]');
  await failsThenRetries(addPrep, async () => {
    assert.equal(await page.locator('#appointment-prep-input').inputValue(), 'Probe prep question', 'a failed add keeps the sheet and its text');
  });
  const beforePrep = await doubleTapWhilePending(addPrep, page.locator('#appointment-prep-input'));
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  assert.equal(await calls(), beforePrep + 1, 'a double tap adds one prep item');
  const prepRow = page.locator('[data-appointment-item]').filter({ hasText: 'Probe prep question' });
  await prepRow.waitFor();
  assert.equal(await prepRow.count(), 1, 'one row for the new item');
  console.log('PASS appointment prep add: failure keeps the sheet, double tap adds one');

  const check = prepRow.locator('[role="checkbox"]');
  await fault('checklists', 'setItemChecked');
  await failsThenRetries(check, async () => {
    assert.equal(await check.getAttribute('aria-checked'), 'false', 'a failed check leaves the item unchecked');
  });
  const beforeCheck = await doubleToggleWhilePending(check);
  await prepRow.locator('[role="checkbox"][aria-checked="true"]').waitFor();
  assert.equal(await calls(), beforeCheck + 1, 'a double tap on the checkbox writes once');
  await setMode('pass');
  await check.click();
  await prepRow.locator('[role="checkbox"][aria-checked="false"]').waitFor();
  console.log('PASS appointment prep check: failure says so, double tap writes once, a later tap still toggles back');

  const flag = prepRow.locator('[data-carry-forward]');
  await fault('checklists', 'setItemCarriedForward');
  await failsThenRetries(flag, async () => {
    assert.equal(await flag.getAttribute('aria-pressed'), 'false', 'a failed flag leaves the item unflagged');
  });
  const beforeFlag = await doubleToggleWhilePending(flag);
  await prepRow.locator('[data-carry-forward][aria-pressed="true"]').waitFor();
  assert.equal(await calls(), beforeFlag + 1, 'a double tap on the flag writes once');
  console.log('PASS appointment prep flag: failure says so, double tap writes once');

  // UI 17: Add to appointment prep from a side effect and from a lab result.
  // Unseen: raised since failsThenRetries marked the toasts already up.
  const prepAdded = () => page.locator('[data-toast]:not([data-seen])').filter({ hasText: 'Added to appointment prep list' });
  for (const [path, open] of [
    ['/care/changes', async () => {
      const id = await seed('side effect');
      await page.locator(`[data-side-effect="${id}"]`).click();
    }],
    ['/care/labs', async () => {
      const id = await seed('lab result');
      // The list shows one analyte at a time.
      await page.locator('[data-segmented="labs-analyte"] [data-segment="Probe analyte"]').click();
      await page.locator(`[data-lab-result="${id}"]`).click();
    }]
  ]) {
    await navigate(path);
    await open();
    const addToPrep = page.locator('[data-add-to-appointment-prep]');
    await fault('checklists', 'addToStandaloneChecklist');
    await failsThenRetries(addToPrep, async () => {
      assert.equal(await prepAdded().count(), 0, 'a failed add does not say it was added');
    });
    const beforeAdd = await doubleTapWhilePending(addToPrep);
    await prepAdded().last().waitFor({ timeout: 1200 });
    assert.equal(await calls(), beforeAdd + 1, `a double tap on ${path} Add to appointment prep adds one`);
    // Intentional later additions are still additions: a second visit adds again.
    await setMode('pass');
    await addToPrep.click();
    await page.waitForFunction((n) => window.fault.calls === n, beforeAdd + 2);
    await page.waitForFunction((n) => [...document.querySelectorAll('[data-toast]:not([data-seen])')].filter((t) => t.textContent.includes('Added to appointment prep list')).length >= n, 2);
    await page.locator('[data-close-record]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
    console.log(`PASS ${path} Add to appointment prep: failure says so, double tap adds one, a later tap adds again`);
  }

  // UI 17: a dilation schedule.
  const procedureId = await seed('procedure');
  await navigate('/health/dilation');
  await page.locator('[data-notice="dilation-schedule-empty"]').getByRole('button', { name: 'Add your schedule' }).click();
  await page.locator('[data-stage-frequency="0"]').fill('1');
  await page.locator('[data-stage-duration="0"]').fill('30');
  await fault('taper', 'upsertTaper');
  const saveSchedule = page.locator('[data-save-schedule]');
  await failsThenRetries(saveSchedule, async () => {
    assert.equal(await page.locator('[data-stage-duration="0"]').inputValue(), '30', 'a failed save keeps the editor and its stages');
  });
  const beforeSchedule = await doubleTapWhilePending(saveSchedule);
  await page.locator('[data-schedule]').waitFor();
  assert.equal(await calls(), beforeSchedule + 1, 'a double tap saves one schedule');
  // A stage changed while the save runs is not closed away under it.
  await page.locator('[data-schedule]').click();
  await setMode('pending');
  await saveSchedule.click();
  await page.waitForFunction(() => window.fault.resolve);
  await page.locator('[data-stage-duration="0"]').fill('45');
  await page.evaluate(() => window.fault.resolve());
  await page.waitForFunction(() => !document.querySelector('[data-save-schedule]')?.disabled);
  assert.equal(await page.locator('[data-stage-duration="0"]').inputValue(), '45', 'the editor stays with the newer stage');
  await setMode('pass');
  await saveSchedule.click();
  await page.locator('[data-schedule]').waitFor();
  await seed('no procedure', procedureId);
  console.log('PASS dilation schedule: failure keeps the editor, double tap saves one');

  // UI 17: a felt-sense reading on a tryout.
  const tryoutId = await seed('tryout');
  await navigate(`/transition/tryouts/${tryoutId}`);
  await page.locator('[data-mood="4"]').first().click();
  await page.locator('#tr-feeling-note').fill('Probe feeling');
  await fault('feltSense', 'add');
  const addFeeling = page.locator('[data-add-feeling]');
  await failsThenRetries(addFeeling, async () => {
    assert.equal(await page.locator('#tr-feeling-note').inputValue(), 'Probe feeling', 'a failed reading keeps the note');
  });
  const beforeFeeling = await doubleTapWhilePending(addFeeling);
  await page.waitForFunction(() => document.querySelector('#tr-feeling-note')?.value === '');
  assert.equal(await calls(), beforeFeeling + 1, 'a double tap saves one reading');
  await page.waitForFunction(() => document.querySelectorAll('[data-feeling]').length === 1);
  // Only what was sent is cleared: a note typed while the write runs stays.
  await page.locator('[data-mood="2"]').first().click();
  await setMode('pending');
  await addFeeling.click();
  await page.waitForFunction(() => window.fault.resolve);
  await page.locator('#tr-feeling-note').fill('Typed while saving');
  await page.evaluate(() => window.fault.resolve());
  await page.waitForFunction(() => document.querySelectorAll('[data-feeling]').length === 2);
  assert.equal(await page.locator('#tr-feeling-note').inputValue(), 'Typed while saving', 'a note typed during the write is kept');
  console.log('PASS felt sense: failure keeps the reading, double tap saves one');

  assert.deepEqual(await page.evaluate(() => window.unhandled), [], 'no unhandled rejections');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('PASS no unhandled rejection or page error across the run');
} finally {
  await browser.close();
  await server.close();
}

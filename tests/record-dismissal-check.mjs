import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { fillDate, fillTime, launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

const server = await createServer({ cacheDir: '.svelte-kit/record-dismissal-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
async function requestNavigation(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  // SvelteKit handles a link after repaint; let its guard see the request.
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(resolve), 0))));
}
async function navigate(path) {
  await requestNavigation(path);
  await page.waitForURL((url) => url.pathname === path);
  if (path === '/care/doses') await page.locator('[data-attribution-toggle]').waitFor();
  if (path === '/care/labs') await page.locator('[data-lab-result]').first().waitFor();
}
async function dragSheet() {
  await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
  const box = await page.locator('.sheet-handle').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 130, { steps: 10 });
  await page.mouse.up();
}
async function doseValues() {
  const values = {};
  for (const [group, fields] of [
    ['what', ['dose-amount', 'dose-unit']],
    ['status', ['dose-scheduled-amount', 'dose-scheduled-time']],
    ['when', ['dose-day', 'dose-time']]
  ]) {
    const toggle = page.locator(`[data-dose-${group}]`);
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
    for (const field of fields) values[field] = await page.locator(`#${field}`).inputValue();
  }
  await page.locator('[data-dose-what]').click();
  values.route = await page.locator('[data-route][aria-pressed="true"]').getAttribute('data-route');
  values.vehicle = await page.locator('[data-vehicle][aria-pressed="true"]').getAttribute('data-vehicle');
  values.site = await page.locator('button[data-site][aria-checked="true"]').getAttribute('data-site');
  return values;
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
  if (await page.locator('[data-date-picker]').count()) await page.keyboard.press('Escape');
}
try {
  await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
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
    if (path === 'drag') await dragSheet();
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

  await navigate('/care/doses');
  await openNew();
  const doseAmount = page.locator('#dose-amount');
  const doseUnit = page.locator('#dose-unit');
  assert.equal(await page.locator('[data-save-dose]').isDisabled(), true);
  assert.match(await page.locator('#dose-requirements').innerText(), /Enter a dose amount/);
  await doseAmount.fill('7.5');
  await doseUnit.fill('proof-unit');
  await page.locator('[data-route="im"]').click();
  assert.equal(await page.locator('[data-save-dose]').isDisabled(), true);
  assert.match(await page.locator('#dose-requirements').innerText(), /Choose an injection site/);
  await page.locator('[data-route="gel"]').click();
  assert.equal(await page.locator('[data-save-dose]').isDisabled(), true);
  assert.match(await page.locator('#dose-requirements').innerText(), /Choose an application site/);
  await page.locator('[data-route="oral"]').click();
  console.log('PASS missing dose amount and route-specific sites explain disabled save');

  for (const path of ['escape', 'scrim', 'drag', 'close', 'back', 'navigation']) {
    if (path === 'escape') await page.keyboard.press('Escape');
    if (path === 'scrim') await page.locator('[data-sheet-scrim]').click({ position: { x: 2, y: 2 } });
    if (path === 'close') await page.locator('[data-close-record]').click();
    if (path === 'back') await page.evaluate(() => history.back());
    if (path === 'navigation') await requestNavigation('/care/labs');
    if (path === 'drag') await dragSheet();
    await keepEditing();
    assert.equal(await doseAmount.inputValue(), '7.5');
    assert.equal(await doseUnit.inputValue(), 'proof-unit');
    assert.equal(new URL(page.url()).pathname, '/care/doses');
    assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
    console.log(`PASS changed dose survives ${path} and Keep editing`);
  }
  await doseAmount.fill('');
  await doseUnit.fill('');
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS reverted dose closes without confirmation');
  assert.equal(await page.locator('[data-add]').evaluate((el) => el === document.activeElement), true);

  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const original = bootState.journal.doses.upsertDose.bind(bootState.journal.doses);
    window.doseFault = { mode: 'fail', calls: 0 };
    bootState.journal.doses.upsertDose = async (draft) => {
      window.doseFault.calls++;
      if (window.doseFault.mode === 'fail') throw new Error('injected dose save failure');
      if (window.doseFault.mode === 'pending') await new Promise((resolve) => { window.doseFault.resolve = resolve; });
      const id = await original(draft);
      window.doseFault.savedId = id;
      return id;
    };
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
  const doseCount = await page.locator('[data-dose]').count();
  await openNew();
  await doseAmount.fill('7.5');
  await doseUnit.fill('proof-unit');
  await page.locator('[data-route="im"]').click();
  await page.locator('[data-vehicle="aqueous"]').click();
  await page.locator('button[data-site="thigh-left"]').click();
  await page.locator('[data-dose-status]').click();
  await page.locator('[data-segment="changed"]').click();
  await page.locator('#dose-scheduled-amount').fill('8.5');
  await fillTime(page, '#dose-scheduled-time', '08:15');
  await page.locator('[data-dose-when]').click();
  const previousDay = await page.evaluate(async () => {
    const { todayEpochDay, dateInputValueFromEpochDay } = await import('/src/lib/data/epochDay.ts');
    return dateInputValueFromEpochDay(todayEpochDay() - 1);
  });
  await fillDate(page, '#dose-day', previousDay);
  await fillTime(page, '#dose-time', '09:15');
  const valuesBeforeFailure = await doseValues();
  await page.locator('[data-save-dose]').click();
  await page.locator('[role="alert"]').filter({ hasText: 'Could not save' }).waitFor();
  assert.equal(await doseAmount.inputValue(), '7.5');
  assert.equal(await doseUnit.inputValue(), 'proof-unit');
  assert.equal(await page.locator('[data-dose]').count(), doseCount);
  assert.deepEqual(await doseValues(), valuesBeforeFailure);
  console.log('PASS rejected dose save retains all correction fields and accessible retry error');

  await page.evaluate(() => { window.doseFault.mode = 'pending'; });
  await page.locator('[data-save-dose]').click();
  await page.waitForFunction(() => window.doseFault.resolve);
  await page.locator('[data-save-dose]').evaluate((button) => { button.click(); button.click(); });
  assert.equal(await page.locator('[data-save-dose]').isDisabled(), true);
  assert.equal(await doseAmount.isDisabled(), true);
  await page.keyboard.press('Escape');
  await page.locator('[data-sheet-scrim]').click({ position: { x: 2, y: 2 } });
  await dragSheet();
  await page.evaluate(() => {
    window.doseBackReturned = false;
    const returned = () => {
      if (location.pathname !== '/care/doses') return;
      window.doseBackReturned = true;
      window.removeEventListener('popstate', returned);
    };
    window.addEventListener('popstate', returned);
    history.back();
  });
  await page.waitForFunction(() => window.doseBackReturned);
  await requestNavigation('/care/labs');
  assert.equal(await page.locator('[data-sheet]').count(), 1);
  assert.equal(await page.locator('[data-keep-editing]').count(), 0);
  assert.equal(new URL(page.url()).pathname, '/care/doses');
  assert.equal(await page.evaluate(() => window.doseFault.calls), 2);
  await page.evaluate(() => window.doseFault.resolve());
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const savedDoseId = await page.evaluate(() => { window.doseFault.mode = 'ok'; return window.doseFault.savedId; });
  const savedDose = page.locator(`[data-dose="${savedDoseId}"]`);
  await savedDose.waitFor();
  assert.equal(await page.locator('[data-dose]').count(), doseCount + 1);
  console.log('PASS delayed retry writes one dose; pending save prevents dismissal and duplicate taps');

  await navigate('/care/labs');
  await navigate('/care/doses');
  await savedDose.click();
  await page.locator('[data-dose-what]').click();
  assert.equal(await doseAmount.inputValue(), '7.5');
  assert.equal(await doseUnit.inputValue(), 'proof-unit');
  assert.deepEqual(await doseValues(), valuesBeforeFailure);
  await doseAmount.fill('8');
  await doseAmount.fill('7.5');
  await page.locator('[data-close-record]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS saved dose reopens; reverted numeric edit closes directly');
  const keptDoseId = await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return bootState.journal.doses.upsertDose({ timestamp: Date.now(), route: 'oral', dose: 2, doseUnit: 'kept-unit' });
  });
  await page.locator(`[data-dose="${keptDoseId}"]`).waitFor();

  await savedDose.click();
  await page.locator('[data-delete-dose]').click();
  const confirmation = page.locator('[data-sheet]').last();
  assert.match(await confirmation.innerText(), /7.5 proof-unit/);
  assert.match(await confirmation.innerText(), /permanently deleted/);
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await navigate('/care/labs');
  await navigate('/care/doses');
  await savedDose.waitFor();
  console.log('PASS cancelled dose deletion preserves stored dose after reopening log');
  await savedDose.click();
  await page.locator('[data-dose-what]').click();
  await doseAmount.fill('9');
  await page.locator('[data-delete-dose]').click();
  await keepEditing();
  assert.equal(await doseAmount.inputValue(), '9');
  await page.locator('[data-delete-dose]').click();
  await page.locator('[data-discard-record]').click();
  await page.locator('[data-confirm-delete-dose]').waitFor();
  assert.match(await page.locator('[data-sheet]').last().innerText(), /7.5 proof-unit/);
  await page.locator('[data-confirm-delete-dose]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await savedDose.waitFor({ state: 'detached' });
  await navigate('/care/labs');
  await navigate('/care/doses');
  assert.equal(await page.locator('[data-dose]').count(), doseCount + 1);
  await page.locator(`[data-dose="${keptDoseId}"]`).waitFor();
  console.log('PASS confirmed deletion names stored dose and removes only that record');

  const autoDoseId = await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
    const day = todayEpochDay() - 1;
    const episodeId = await bootState.journal.regimen.upsertEpisode({
      drug: 'Automatic proof', ester: null, dose: 4, doseUnit: 'mg', route: 'oral', interval: 'daily',
      startEpochDay: day, endEpochDay: null, endReason: null
    });
    await bootState.journal.doses.upsertSchedule({
      episodeId, recurrence: { kind: 'everyNDays', everyNDays: 1 }, dosesPerDay: 1,
      doseAmounts: [{ dose: 4, doseUnit: 'mg' }], autoLogFromEpochDay: day
    });
    return bootState.journal.doses.upsertDose({
      timestamp: startOfDayTimestamp(day) + 12 * 3600000, route: 'oral', dose: 4, doseUnit: 'mg',
      source: 'schedule', drug: 'Automatic proof'
    });
  });
  const autoDose = page.locator(`[data-dose="${autoDoseId}"]`);
  await page.locator(`[data-dose-skip="${autoDoseId}"]`).click();
  await page.locator(`[data-dose-skip="${autoDoseId}"]`).waitFor({ state: 'detached' });
  assert.match(await autoDose.innerText(), /skipped, was logged from your schedule/);
  assert.equal(await page.locator('[data-sheet]').count(), 0);
  await autoDose.click();
  await page.locator('[data-dose-what]').click();
  await doseAmount.fill('5');
  await page.locator('[data-save-dose]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.waitForFunction((id) => document.querySelector(`[data-dose="${id}"]`)?.textContent.includes('5 mg'), autoDoseId);
  assert.match(await autoDose.innerText(), /skipped, was logged from your schedule/);
  console.log('PASS one-tap skipped correction retains record and schedule source through editing');
  await autoDose.click();
  await page.locator('[data-delete-dose]').click();
  assert.match(await page.locator('[data-sheet]').last().innerText(), /automatic logging/i);
  await page.locator('[data-sheet]').last().getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS active automatic schedule deletion explains possible logging again');

  await page.locator('[data-segment="schedule"]').click();
  await openNew();
  await page.locator('[data-dose-when]').click();
  const oldDay = await page.evaluate(async () => {
    const { todayEpochDay, dateInputValueFromEpochDay } = await import('/src/lib/data/epochDay.ts');
    return dateInputValueFromEpochDay(todayEpochDay() - 120);
  });
  await fillDate(page, '#dose-day', oldDay);
  await page.locator('[data-save-dose]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const oldDoseId = await page.evaluate(() => window.doseFault.savedId);
  await page.locator(`[data-dose="${oldDoseId}"]`).waitFor();
  assert.equal(await page.locator('[data-segment="log"]').getAttribute('aria-checked'), 'true');
  await page.locator(`[data-dose="${oldDoseId}"]`).click();
  await page.locator('[data-delete-dose]').click();
  await page.locator('[data-confirm-delete-dose]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS saving from schedule exposes backdated dose beyond initial log window');

  await openNew();
  await page.locator('[data-dose-when]').click();
  const futureDay = await page.evaluate(async () => {
    const { todayEpochDay, dateInputValueFromEpochDay } = await import('/src/lib/data/epochDay.ts');
    return dateInputValueFromEpochDay(todayEpochDay() + 3);
  });
  await fillDate(page, '#dose-day', futureDay);
  await page.locator('[data-save-dose]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  const futureDoseId = await page.evaluate(() => window.doseFault.savedId);
  await page.locator(`[data-dose="${futureDoseId}"]`).waitFor();
  await page.locator('[data-segment="schedule"]').click();
  await page.locator('[data-segment="log"]').click();
  await page.locator(`[data-dose="${futureDoseId}"]`).click();
  await page.locator('[data-delete-dose]').click();
  await page.locator('[data-confirm-delete-dose]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS successful future-dated save remains visible when reopening log');

  await openNew();
  await page.locator('[data-dose-what]').click();
  await doseAmount.fill('12');
  await requestNavigation('/care/labs');
  await page.locator('[data-discard-record]').click();
  await page.waitForURL((url) => url.pathname === '/care/labs');
  await page.locator('[data-lab-result]').first().waitFor();
  await navigate('/care/doses');
  assert.equal(await page.locator('[data-dose]').count(), doseCount + 2);
  console.log('PASS dose Discard resumes requested route without saving');

  for (const concealment of ['quick-exit', 'lock']) {
    await openNew();
    await page.locator('[data-dose-what]').click();
    await doseAmount.fill('11');
    await page.locator('[data-close-record]').click();
    await page.locator('[data-keep-editing]').waitFor();
    await page.evaluate(async (concealment) => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { quickExit, lockState } = await import('/src/lib/stores/lock.svelte.ts');
      window.doseAccessMode = bootState.accessMode;
      if (concealment === 'quick-exit') quickExit();
      else { bootState.accessMode = 'passphrase'; lockState.unlocked = false; }
    }, concealment);
    if (concealment === 'quick-exit') {
      await page.locator('[data-blank]').waitFor();
      assert.equal(await page.locator('[data-blank]').evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return document.elementFromPoint(rect.width / 2, rect.height / 2) === el;
      }), true);
      await page.locator('[data-blank]').click();
    } else await doseAmount.waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-discard-record]').count(), 0);
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = window.doseAccessMode;
      markUnlocked();
    });
    if (await page.locator('[data-close-record]').count()) {
      await page.locator('[data-close-record]').click();
      await discard();
    }
    console.log(`PASS dose ${concealment} conceals journal immediately without draft prompt`);
  }

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
  await page.locator('[data-list-row="language"]').click();
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
} catch (error) {
  console.error(errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}

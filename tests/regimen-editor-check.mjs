import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';

const server = await createServer({ cacheDir: '.svelte-kit/regimen-editor-vite', server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
await server.listen();
const browser = await launchChromium();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = server.resolvedUrls.local[0];
async function requestNavigation(path) {
  await page.evaluate((path) => {
    const link = document.createElement('a');
    link.href = path;
    document.body.append(link);
    link.click();
    link.remove();
  }, path);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => setTimeout(() => requestAnimationFrame(resolve), 0))));
}
async function navigate(path) {
  await requestNavigation(path);
  await page.waitForURL((url) => url.pathname === path);
}
async function stored() {
  return page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    return { episodes: await bootState.journal.regimen.getEpisodes(), schedules: await bootState.journal.doses.getSchedules(), pauses: await bootState.journal.doses.getPauses() };
  });
}
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
  if (await page.locator('[data-leave-setup]').count()) await page.locator('[data-leave-setup]').click();
  await navigate('/care/regimen');
  await page.locator('[data-add]').click();
  await page.locator('[data-own]').click();
  assert.equal(await page.locator('[data-save-regimen]').isDisabled(), true);
  assert.match(await page.locator('#regimen-episode-requirements').innerText(), /drug name/);
  await page.locator('#regimen-drug').fill('Independent proof');
  assert.match(await page.locator('#regimen-episode-requirements').innerText(), /dose amount/);
  await page.locator('#regimen-dose').fill('2');
  await page.locator('#regimen-dose-unit').fill('mg');
  await page.locator('#regimen-route').fill('oral');
  await page.locator('[data-save-regimen]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-episode]', { hasText: 'Independent proof' }).click();
  await page.locator('#regimen-dose').fill('3');
  await page.locator('#regimen-every').fill('5');
  await page.locator('[data-save-regimen]').click();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#regimen-every').count(), 1, 'Episode save retains unsaved schedule editor');
  assert.equal(await page.locator('#regimen-every').inputValue(), '5');
  const result = await stored();
  assert.equal(result.episodes.find((e) => e.drug === 'Independent proof').dose, 3);
  assert.equal(result.schedules.length, 0);
  assert.match(await page.locator('[data-regimen-status]').innerText(), /schedule.*unsaved/i);
  await page.locator('[data-save-schedule]').click();
  await page.locator('[data-close-regimen]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  await page.locator('[data-episode]', { hasText: 'Independent proof' }).click();
  assert.equal(await page.locator('#regimen-every').inputValue(), '5');
  console.log('PASS episode save preserves schedule draft and commits episode only');

  await page.locator('#regimen-every').fill('0');
  assert.equal(await page.locator('[data-save-schedule]').isDisabled(), true);
  assert.equal(await page.locator('#regimen-every').getAttribute('aria-invalid'), 'true');
  assert.match(await page.locator('#regimen-schedule-requirements').innerText(), /at least 1/);
  await page.locator('#regimen-every').fill('5');
  await page.locator('[data-schedule-kind="weekdays"]').click();
  assert.equal(await page.locator('[data-save-schedule]').isDisabled(), true);
  assert.match(await page.locator('#regimen-schedule-requirements').innerText(), /weekday/);
  await page.locator('[data-schedule-kind="everyNDays"]').click();
  await page.locator('#regimen-per-day').fill('1.5');
  assert.equal(await page.locator('[data-save-schedule]').isDisabled(), true);
  await page.locator('#regimen-per-day').fill('1');
  await page.locator('[data-add-amount]').click();
  assert.equal(await page.locator('[data-save-schedule]').isDisabled(), true);
  assert.match(await page.locator('#regimen-schedule-requirements').innerText(), /amount and unit/);
  await page.locator('[data-delete-amount="0"]').click();
  console.log('PASS missing episode and schedule requirements explain disabled actions');

  await page.locator('#regimen-dose').fill('4');
  await page.locator('#regimen-every').fill('6');
  await page.locator('[data-save-schedule]').click();
  await page.waitForFunction(() => document.querySelector('[data-regimen-status]').textContent.includes('Schedule saved'));
  assert.equal(await page.locator('#regimen-dose').inputValue(), '4');
  assert.equal((await stored()).episodes.find((e) => e.drug === 'Independent proof').dose, 3);
  assert.equal((await stored()).schedules[0].recurrence.everyNDays, 6);
  await page.locator('[data-close-regimen]').click();
  await page.locator('[data-keep-editing]').click();
  await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
  await page.locator('[data-save-regimen]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS schedule save preserves episode edits; remaining episode save closes');

  const open = async () => {
    await page.locator('[data-episode]', { hasText: 'Independent proof' }).click();
    await page.locator('#regimen-every').waitFor();
  };
  const discard = async () => {
    await page.locator('[data-discard-record]').click();
    await page.waitForSelector('[data-sheet]', { state: 'detached' });
  };
  await open();
  await page.locator('#regimen-dose').fill('8');
  await page.locator('#regimen-every').fill('9');
  for (const dismiss of ['escape', 'scrim', 'drag', 'close', 'back', 'route']) {
    if (dismiss === 'escape') await page.keyboard.press('Escape');
    if (dismiss === 'scrim') await page.locator('[data-sheet-scrim]').click({ position: { x: 2, y: 2 } });
    if (dismiss === 'close') await page.locator('[data-close-regimen]').click();
    if (dismiss === 'back') await page.evaluate(() => history.back());
    if (dismiss === 'route') await requestNavigation('/care/doses');
    if (dismiss === 'drag') {
      await page.locator('[data-sheet]').evaluate((el) => { el.scrollTop = 0; });
      const rect = await page.locator('.sheet-handle').boundingBox();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.mouse.down();
      await page.mouse.move(rect.x + rect.width / 2, rect.y + 170, { steps: 12 });
      await page.mouse.up();
    }
    await page.locator('[data-keep-editing]').click();
    await page.locator('[data-keep-editing]').waitFor({ state: 'detached' });
    assert.equal(await page.locator('#regimen-dose').inputValue(), '8');
    assert.equal(await page.locator('#regimen-every').inputValue(), '9');
    assert.equal(new URL(page.url()).pathname, '/care/regimen');
    assert.equal(await page.locator('[data-sheet-drag]').evaluate((el) => el.style.transform), '');
  }
  await page.locator('#regimen-dose').fill('4');
  await page.locator('#regimen-every').fill('6');
  await page.locator('[data-close-regimen]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS all ordinary dismissals protect both drafts; reverted numeric edits close directly');

  await page.evaluate(async () => {
    const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
    window.regimenFault = { operation: null, mode: 'pass', calls: {} };
    for (const [area, method] of [['regimen', 'upsertEpisode'], ['regimen', 'endEpisode'], ['doses', 'upsertSchedule'], ['doses', 'upsertPause'], ['doses', 'deletePause']]) {
      const original = bootState.journal[area][method].bind(bootState.journal[area]);
      bootState.journal[area][method] = async (...args) => {
        const fault = window.regimenFault;
        fault.calls[method] = (fault.calls[method] ?? 0) + 1;
        if (fault.operation === method && fault.mode === 'fail') throw new Error('Injected regimen write failure');
        if (fault.operation === method && fault.mode === 'pending') await new Promise((resolve) => { fault.resolve = resolve; });
        return original(...args);
      };
    }
    const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
    attachJournal(bootState.journal);
    journalIsOpen();
  });
  async function fault(operation, mode) {
    await page.evaluate(({ operation, mode }) => Object.assign(window.regimenFault, { operation, mode }), { operation, mode });
  }
  async function failed() {
    await page.locator('[data-regimen-failure][role="alert"]').waitFor();
    assert.match(await page.locator('[data-regimen-failure]').innerText(), /Try/);
  }
  await open();
  await page.locator('#regimen-dose').fill('10');
  await page.locator('#regimen-every').fill('7');
  for (const [method, control] of [['upsertEpisode', '[data-save-regimen]'], ['upsertSchedule', '[data-save-schedule]']]) {
    await fault(method, 'fail');
    await page.locator(control).click();
    await failed();
    assert.equal(await page.locator('#regimen-dose').inputValue(), '10');
    assert.equal(await page.locator('#regimen-every').inputValue(), '7');
    assert.equal((await stored()).episodes.find((e) => e.drug === 'Independent proof').dose, 4);
    assert.equal((await stored()).schedules[0].recurrence.everyNDays, 6);
  }
  for (const [method, control] of [['upsertSchedule', '[data-save-schedule]'], ['upsertEpisode', '[data-save-regimen]']]) {
    await fault(method, 'pending');
    const before = await page.evaluate((method) => window.regimenFault.calls[method], method);
    await page.locator(control).click();
    await page.waitForFunction(() => document.querySelector('.regimen-editor').getAttribute('aria-busy') === 'true');
    await page.locator(control).evaluate((el) => { el.click(); el.click(); });
    await page.keyboard.press('Escape');
    await requestNavigation('/care/doses');
    assert.equal(new URL(page.url()).pathname, '/care/regimen');
    assert.equal(await page.locator('[data-keep-editing]').count(), 0);
    for (const selector of ['[data-save-regimen]', '[data-save-schedule]', '[data-end-episode]']) assert.equal(await page.locator(selector).isDisabled(), true);
    assert.equal(await page.evaluate((method) => window.regimenFault.calls[method], method), before + 1);
    await page.evaluate(() => window.regimenFault.resolve());
    if (method === 'upsertSchedule') await page.waitForFunction(() => document.querySelector('.regimen-editor').getAttribute('aria-busy') === 'false');
    else await page.waitForSelector('[data-sheet]', { state: 'detached' });
  }
  console.log('PASS failed independent saves retain both drafts; delayed retries serialize all actions and repeated taps');

  await open();
  await page.locator('#regimen-dose').fill('11');
  await page.locator('[data-add-amount]').click();
  await page.locator('[data-amount-dose="0"]').fill('2');
  await page.locator('[data-amount-unit="0"]').fill('mg');
  const auto = page.locator('[data-auto-log-switch] [role="switch"]');
  await fault('upsertSchedule', 'fail');
  await auto.click();
  await failed();
  assert.equal(await auto.getAttribute('aria-checked'), 'false');
  assert.equal(await page.locator('[data-amount-dose="0"]').inputValue(), '2');
  await fault('upsertSchedule', 'pass');
  await auto.click();
  await page.waitForFunction(() => document.querySelector('[data-auto-log-switch] [role="switch"]').getAttribute('aria-checked') === 'true');
  const on = (await stored()).schedules[0];
  const today = await page.evaluate(async () => (await import('/src/lib/data/epochDay.ts')).todayEpochDay());
  assert.equal(on.autoLogFromEpochDay, today);
  assert.deepEqual(on.doseAmounts, [{ dose: 2, doseUnit: 'mg' }]);
  assert.equal((await stored()).episodes.find((e) => e.drug === 'Independent proof').dose, 10);
  assert.match(await page.locator('[data-episode-dirty]').innerText(), /unsaved changes/);
  assert.match(await page.locator('[data-schedule-dirty]').innerText(), /no unsaved changes/);
  await page.locator('[data-close-regimen]').click();
  await discard();
  await open();
  assert.equal(await page.locator('#regimen-dose').inputValue(), '10');
  assert.equal(await auto.getAttribute('aria-checked'), 'true');
  await page.locator('#regimen-every').fill('8');
  await page.locator('[data-save-schedule]').click();
  await page.waitForFunction(() => document.querySelector('[data-regimen-status]').textContent.includes('Schedule saved'));
  assert.equal((await stored()).schedules[0].autoLogFromEpochDay, today);
  await fault('upsertSchedule', 'fail');
  await auto.click();
  await failed();
  assert.equal(await auto.getAttribute('aria-checked'), 'true');
  await fault('upsertSchedule', 'pass');
  await auto.click();
  await page.waitForFunction(() => document.querySelector('[data-auto-log-switch] [role="switch"]').getAttribute('aria-checked') === 'false');
  assert.equal((await stored()).schedules[0].autoLogFromEpochDay, null);
  await page.locator('#regimen-route').fill('Unsaved route');
  assert.equal(await auto.count(), 1, 'Logging eligibility uses saved oral route');
  await page.locator('#regimen-route').fill('oral');
  console.log('PASS automatic logging commits current schedule only, preserves opt-in day and rolls back failed controls');

  await page.locator('#regimen-dose').fill('12');
  await page.locator('#regimen-every').fill('9');
  await page.locator('[data-new-pause]').click();
  await fault('upsertPause', 'fail');
  await page.locator('[data-add-pause]').click();
  await failed();
  assert.equal((await stored()).pauses.length, 0);
  await fault('upsertPause', 'pass');
  await page.locator('[data-add-pause]').click();
  await page.locator('[data-delete-pause]').waitFor();
  assert.equal((await stored()).pauses[0].endEpochDay, null);
  assert.equal(await page.locator('#regimen-every').inputValue(), '9');
  await fault('deletePause', 'fail');
  await page.locator('[data-delete-pause]').click();
  // Deleting a pause asks first (UI 07); the write runs on the confirm.
  await page.locator('[data-confirm-delete-pause]').click();
  await failed();
  assert.equal((await stored()).pauses.length, 1);
  await page.locator('[data-end-reason="pausedForNow"]').click();
  await fault('endEpisode', 'fail');
  await page.locator('[data-end-episode]').click();
  await failed();
  assert.equal((await stored()).episodes.find((e) => e.drug === 'Independent proof').endEpochDay, null);
  await fault('endEpisode', 'pass');
  await page.locator('[data-end-episode]').click();
  await page.locator('[data-end-episode]').waitFor({ state: 'detached' });
  assert.equal(await page.locator('#regimen-dose').inputValue(), '12');
  assert.equal(await page.locator('#regimen-every').inputValue(), '9');
  await page.locator('[data-close-regimen]').click();
  await discard();
  const immediate = await stored();
  const ended = immediate.episodes.find((e) => e.drug === 'Independent proof');
  assert.equal(ended.endEpochDay, today);
  assert.equal(ended.endReason, 'pausedForNow');
  assert.equal(ended.dose, 10);
  assert.equal(immediate.schedules[0].recurrence.everyNDays, 8);
  assert.equal(immediate.pauses.length, 1);
  await open();
  await fault('deletePause', 'pass');
  await page.locator('[data-delete-pause]').click();
  await page.locator('[data-confirm-delete-pause]').click();
  await page.locator('[data-delete-pause]').waitFor({ state: 'detached' });
  await page.locator('[data-close-regimen]').click();
  await page.waitForSelector('[data-sheet]', { state: 'detached' });
  console.log('PASS pause and end failures retry; discard preserves immediate writes without saving other drafts');

  await open();
  await page.locator('#regimen-dose').fill('13');
  await requestNavigation('/care/doses');
  await discard();
  await page.waitForURL((url) => url.pathname === '/care/doses');
  // The URL changes before the view transition mounts the dose screen.
  await page.getByRole('heading', { name: 'Dose log', exact: true }).waitFor();
  await navigate('/care/regimen');
  {
    await page.waitForURL((url) => url.pathname === '/care/regimen');
    await open();
    await page.locator('#regimen-dose').fill('14');
    await page.locator('[data-close-regimen]').click();
    await page.locator('[data-keep-editing]').waitFor();
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      window.regimenAccessMode = bootState.accessMode;
      bootState.accessMode = 'passphrase';
      lockState.unlocked = false;
    });
    await page.locator('#regimen-dose').waitFor({ state: 'detached' });
    assert.equal(await page.locator('[data-discard-record]').count(), 0);
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { markUnlocked } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = window.regimenAccessMode;
      markUnlocked();
    });
    if (await page.locator('[data-close-regimen]').count()) {
      await page.locator('[data-close-regimen]').click();
      await discard();
    }
  }
  console.log('PASS route discard continues navigation; lock conceals pending prompts immediately');
  assert.deepEqual(errors, []);
} catch (error) {
  console.error('Route', page.url(), 'Page errors', errors, await page.locator('body').innerText());
  throw error;
} finally {
  await browser.close();
  await server.close();
}

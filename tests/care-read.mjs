import { realpathSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

async function verifyEmptyTimeline(page, { gallery }) {
  const evidence = [];
  await mkdir('.claude/care-read-shots', { recursive: true });
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { clearJournal } = await import('/src/lib/data/demo/journal-seed.ts');
    await clearJournal(journal);
  });
  const rail = page.locator('[data-care-rail]');
  const empty = page.locator('[data-notice="care-empty"]');
  await rail.waitFor({ state: 'detached' });
  await page.locator('[data-care-regimen-block]').waitFor({ state: 'detached' });
  assert.equal(await empty.count(), 0, 'Empty Care has no timeline notice');
  for (const key of ['labs', 'hormone-curve', 'stock', 'clinician-summary']) {
    assert.equal(await page.locator(`[data-list-row="${key}"]`).isVisible(), true, `${key} remains reachable`);
  }
  assert.equal(await page.locator('[data-care-fold="interval"]').count(), 1);
  assert.equal(await page.locator('[data-hub-host="care"]').count(), 1);
  if (gallery) await page.screenshot({ path: '.claude/care-read-shots/empty-en-no-regimen.png', fullPage: true });

  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    const { todayEpochDay } = await import('/src/lib/data/epochDay.ts');
    const today = todayEpochDay();
    const episodeId = await journal.regimen.upsertEpisode({ drug: 'Timeline proof', ester: null,
      dose: 2, doseUnit: 'mg', route: 'oral', interval: 'daily', startEpochDay: today - 10,
      endEpochDay: null, endReason: null });
    window.timelineProof = { today, episodeId };
  });
  const regimen = page.locator('[data-care-regimen-block="Timeline proof"]');
  await regimen.waitFor();
  assert.equal(await rail.count(), 0, 'Running regimen alone has no timeline');
  assert.equal(await empty.count(), 0);
  assert.equal(await regimen.locator('[data-care-log]').isVisible(), true);

  const stockId = await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    return journal.stock.upsertEntry({ drug: 'In the drawer', quantity: 10, unit: 'pills',
      recordedEpochDay: window.timelineProof.today });
  });
  await page.waitForFunction(() => document.querySelector('[data-list-row="stock"]').textContent.includes('In the drawer'));
  assert.equal(await rail.count(), 0, 'A stock count without a drawable mark keeps the timeline absent');
  assert.equal(await empty.count(), 0);
  await page.evaluate(async (id) => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.stock.deleteEntry(id);
    await journal.doses.upsertSchedule({ episodeId: window.timelineProof.episodeId,
      recurrence: { kind: 'everyNDays', everyNDays: 1 }, dosesPerDay: 1,
      doseAmounts: [{ dose: 2, doseUnit: 'mg' }], autoLogFromEpochDay: null });
  }, stockId);
  await page.waitForFunction(() => document.querySelector('[data-care-regimen-block]').textContent.includes('Next dose'));
  assert.equal(await rail.count(), 0, 'A scheduled next dose without any logged record has no timeline');
  assert.equal(await empty.count(), 0);

  async function changeRecord(kind, remove = false) {
    return page.evaluate(async ({ kind, remove }) => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
      const proof = window.timelineProof;
      const frames = [];
      const started = performance.now();
      function sample() {
        frames.push(document.querySelector('[data-care-regimen-block]').getBoundingClientRect().top);
        if (performance.now() - started < 800) requestAnimationFrame(sample);
      }
      sample();
      if (remove) {
        if (kind === 'lab') await journal.labs.deleteResult(proof.recordId);
        if (kind === 'dose') await journal.doses.deleteDose(proof.recordId);
        if (kind === 'stock') await journal.stock.deleteEntry(proof.recordId);
      } else {
        if (kind === 'lab') proof.recordId = await journal.labs.upsertResult({ epochDay: proof.today,
          analyte: 'estradiol', value: 100, unit: 'pg/mL' });
        if (kind === 'dose') proof.recordId = await journal.doses.upsertDose({ drug: 'Timeline proof',
          timestamp: startOfDayTimestamp(proof.today), route: 'oral', dose: 2, doseUnit: 'mg' });
        if (kind === 'stock') proof.recordId = await journal.stock.upsertEntry({ drug: 'Timeline proof',
          quantity: 10, unit: 'pills', recordedEpochDay: proof.today });
      }
      await new Promise((resolve) => setTimeout(resolve, 900));
      return frames;
    }, { kind, remove });
  }
  function assertTravel(frames, label) {
    const from = frames[0];
    const to = frames.at(-1);
    const distance = Math.abs(to - from);
    assert.ok(distance > 50, `${label} moves following content`);
    const steps = frames.slice(1).map((top, i) => Math.abs(top - frames[i]));
    assert.ok(steps.filter((step) => step > 0.5).length >= 3, `${label} has intermediate layout frames`);
    assert.ok(Math.max(...steps) < distance / 2, `${label} has no one-frame jump`);
    assert.ok(steps.at(-1) < 1, `${label} settles cleanly`);
  }
  for (const reducedMotion of ['no-preference', 'reduce']) {
    await page.emulateMedia({ reducedMotion });
    await page.waitForFunction((mode) => document.documentElement.dataset.a11yMotion === mode,
      reducedMotion === 'reduce' ? 'reduce' : 'normal');
    for (const kind of ['lab', 'dose', 'stock']) {
      const opening = await changeRecord(kind);
      assert.equal(await rail.count(), 1, `First ${kind} reveals timeline`);
      assert.equal(await empty.count(), 0);
      if (reducedMotion === 'no-preference') assertTravel(opening, `${kind} arrival`);
      if (gallery && kind === 'lab' && reducedMotion === 'no-preference') {
        await page.screenshot({ path: '.claude/care-read-shots/first-lab.png', fullPage: true });
      }
      const closing = await changeRecord(kind, true);
      assert.equal(await rail.count(), 0, `Last ${kind} removal hides timeline despite running schedule`);
      assert.equal(await empty.count(), 0);
      assert.equal(await regimen.count(), 1);
      if (reducedMotion === 'no-preference') assertTravel(closing, `${kind} removal`);
      evidence.push({ kind, reducedMotion, opening, closing });
    }
  }
  await writeFile('.claude/care-read-shots/timeline-motion.json', JSON.stringify(evidence, null, 2));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.documentElement.dataset.a11yMotion === 'normal');
  await changeRecord('lab');
  const departureHeights = await page.evaluate(async () => {
    const heights = [];
    const started = performance.now();
    function sample() {
      const rail = document.querySelector('[data-care-rail]');
      if (rail) heights.push(rail.closest('[data-chart-card]').parentElement.getBoundingClientRect().height);
      if (performance.now() - started < 900) requestAnimationFrame(sample);
    }
    sample();
    document.querySelector('a[href="/more"]').click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return heights;
  });
  assert.ok(departureHeights.length > 1, 'Departure retains outgoing Care frames');
  assert.ok(Math.max(...departureHeights) - Math.min(...departureHeights) < 1, 'Route departure does not collapse the timeline');
  await page.evaluate(async () => {
    const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
    await journal.labs.deleteResult(window.timelineProof.recordId);
    document.querySelector('a[href="/care"]').click();
  });
  await regimen.waitFor();
  await rail.waitFor({ state: 'detached' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.documentElement.dataset.a11yMotion === 'reduce');
  if (gallery) {
    async function galleryLocale(locale) {
      await page.evaluate(async (locale) => {
        const { setLocale } = await import('/src/lib/paraglide/runtime.js');
        const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
        prefs.language = locale;
        setLocale(locale, { reload: false });
      }, locale);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-app-root][data-boot="ready"]', { state: 'attached' });
      await page.evaluate(() => document.querySelector('.demo-bar')?.style.setProperty('display', 'none'));
      await regimen.waitFor();
      assert.equal(await rail.count(), 0);
      assert.equal(await empty.count(), 0);
      assert.equal(await page.locator('[data-screen-title="care"]').innerText(), locale === 'pl' ? 'Opieka' : 'Care');
    }
    for (const locale of ['en', 'pl']) {
      await galleryLocale(locale);
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme;
        }, { palette, theme });
        await page.waitForTimeout(100);
        await page.screenshot({ path: `.claude/care-read-shots/empty-${locale}-${palette}-${theme}.png`, fullPage: true });
      }
    }
    for (const locale of ['en', 'pl']) {
      await galleryLocale(locale);
      await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
      await page.waitForTimeout(100);
      await page.screenshot({ path: `.claude/care-read-shots/empty-${locale}-200-percent.png`, fullPage: true });
    }
    await page.evaluate(async () => {
      document.documentElement.style.zoom = '1';
      const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
      prefs.disguise = true;
    });
    await page.waitForTimeout(100);
    await page.screenshot({ path: '.claude/care-read-shots/empty-disguise.png', fullPage: true });
  }
}

export async function verifyCareRead({ gallery = false } = {}) {
  const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
  await server.listen();
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(30000);
  /* Navigations, printed only if a wait below runs out: a reload would drop
     the fault this check installs, and only CI has failed it. */
  const navigations = [];
  const started = Date.now();
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(`${Date.now() - started}ms ${frame.url()}`);
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]', { timeout: 60000 });
    if (await page.locator('[data-leave-setup]').count()) {
      await page.locator('[data-leave-setup]').click();
      await page.waitForSelector('[data-home-hello]');
    }
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { todayEpochDay, startOfDayTimestamp } = await import('/src/lib/data/epochDay.ts');
      const j = bootState.journal;
      const today = todayEpochDay();
      await j.regimen.upsertEpisode({ drug: 'Care proof', ester: null, dose: 2, doseUnit: 'mg', route: 'oral',
        interval: 'daily', startEpochDay: today - 10, endEpochDay: null, endReason: null });
      await j.doses.upsertDose({ drug: 'Care proof', timestamp: startOfDayTimestamp(today - 2), route: 'oral', dose: 2, doseUnit: 'mg' });
      await j.stock.upsertEntry({ drug: 'Care proof', quantity: 10, unit: 'pills', recordedEpochDay: today - 5 });
      const original = j.exposure.getCounters.bind(j.exposure);
      window.careFault = { mode: 'fail', pending: [], today, startOfDayTimestamp };
      j.exposure.getCounters = async (...args) => {
        const value = await original(...args);
        if (window.careFault.mode === 'fail') throw new Error('injected Care totals failure');
        if (window.careFault.mode === 'pending') return new Promise((resolve, reject) => {
          window.careFault.pending.push({ resolve: () => resolve(value), reject });
        });
        return value;
      };
      const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
      attachJournal(j);
      journalIsOpen();
      const link = document.createElement('a');
      link.href = '/care'; link.id = 'care-proof-link'; link.textContent = 'Care'; document.body.append(link);
    });
    await page.locator('#care-proof-link').click();
    const retry = page.getByRole('button', { name: 'Try again', exact: true });
    const lane = page.locator('[data-care-regimen-block="Care proof"]');
    await retry.waitFor().catch(async (error) => {
      console.log('navigations:', navigations.join(' | '));
      console.log('page says:', (await page.locator('main').innerText().catch(() => '')).slice(0, 300));
      throw error;
    });
    assert.equal(await lane.count(), 0);
    assert.equal(await page.locator('[data-care-rail]').count(), 0);

    await page.evaluate(() => { window.careFault.mode = 'pending'; });
    await retry.click();
    await page.waitForFunction(() => window.careFault.pending.length === 1);
    assert.equal(await lane.count(), 0);
    await page.evaluate(() => window.careFault.pending[0].resolve());
    await lane.waitFor();
    await retry.waitFor({ state: 'detached' });
    const before = await lane.innerText();
    assert.match(before, /2 mg oral in the last 90 days/);

    // One actual dose write must refresh the last dose, stock and totals together.
    await page.evaluate(async () => {
      const { journal } = await import('/src/lib/data/live/journal.svelte.ts');
      const { today, startOfDayTimestamp } = window.careFault;
      await journal.doses.upsertDose({ drug: 'Care proof', timestamp: startOfDayTimestamp(today), route: 'oral', dose: 3, doseUnit: 'mg' });
    });
    await page.waitForFunction(() => window.careFault.pending.length >= 2);
    assert.equal(await lane.innerText(), before);
    /* Fail every refresh still waiting and any that starts later. The write
       can start more than one run, and on a slow machine one can begin after
       the newest was rejected and wait forever, so Try again never shows. */
    await page.evaluate(() => {
      window.careFault.mode = 'fail';
      for (const run of window.careFault.pending) run.reject(new Error('refresh totals failure'));
    });
    await retry.waitFor();
    assert.equal(await lane.innerText(), before);
    assert.match(await page.getByRole('status').filter({ has: retry }).innerText(), /Showing the last result/);

    if (gallery) {
      await mkdir('.claude/care-read-shots', { recursive: true });
      await page.evaluate(async () => {
        document.querySelector('.demo-bar').style.display = 'none';
        document.querySelector('#care-proof-link').remove();
        const { toasts } = await import('/src/lib/stores/toasts.svelte.ts');
        toasts.splice(0);
        document.querySelectorAll('*').forEach((element) => { element.scrollTop = 0; });
      });
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette; prefs.theme = theme;
        }, { palette, theme });
        await page.waitForTimeout(100);
        await page.screenshot({ path: `.claude/care-read-shots/${palette}-${theme}.png`, fullPage: true });
      }
    }

    await page.evaluate(() => { window.careFault.mode = 'rows'; });
    await retry.click();
    await retry.waitFor({ state: 'detached' });
    assert.match(await lane.innerText(), /5 mg oral in the last 90 days/);
    assert.notEqual(await lane.innerText(), before);
    assert.match(await lane.locator('[data-care-regimen-stock]').innerText(), /8 pills/);

    // A stale medication reading stays behind the app's lock gate.
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = 'pin';
      lockState.unlocked = false;
    });
    await lane.waitFor({ state: 'detached' });
    await page.evaluate(async () => {
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      lockState.unlocked = true;
    });
    await lane.waitFor();
    await verifyEmptyTimeline(page, { gallery });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyCareRead({ gallery: process.argv.includes('--gallery') });
  console.log('PASS Care read timing, failures, write refresh, lock concealment and empty timeline motion');
}

import { realpathSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

export async function verifyCareRead({ gallery = false } = {}) {
  const server = await createServer({ server: { port: 0, fs: { allow: [process.cwd(), realpathSync('node_modules')] } } });
  await server.listen();
  const browser = await launchChromium();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-app-root][data-boot="ready"]');
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
    await retry.waitFor();
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
    await page.evaluate(() => window.careFault.pending.at(-1).reject(new Error('refresh totals failure')));
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
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyCareRead({ gallery: process.argv.includes('--gallery') });
  console.log('PASS Care read timing, failures, write refresh and lock concealment');
}

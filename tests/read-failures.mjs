import { realpathSync } from 'node:fs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './browser-harness.mjs';
import { PALETTES } from './palettes.mjs';

/** Drive the production list and layout. Faults replace only the journal
 * read; the live query, gate, retry button and lock remain the shipped code. */
export async function verifyReadFailures({ gallery = false } = {}) {
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
      window.readFault = { calls: 0, mode: 'fail', pending: [] };
      bootState.journal.eras.getEras = () => {
        const fault = window.readFault;
        fault.calls++;
        if (fault.mode === 'throw') throw new Error('injected synchronous read failure');
        if (fault.mode === 'fail') return Promise.reject(new Error('injected read failure'));
        if (fault.mode === 'empty') return Promise.resolve([]);
        if (fault.mode === 'pending') return new Promise((resolve, reject) => fault.pending.push({ resolve, reject }));
        return Promise.resolve([{ id: 'read-proof', uuid: 'read-proof', name: 'Private era proof', startEpochDay: 19000, endEpochDay: 19010 }]);
      };
      const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
      attachJournal(bootState.journal);
      journalIsOpen();
      const link = document.createElement('a');
      link.href = '/settings/eras';
      link.id = 'read-proof-link';
      link.textContent = 'Open eras';
      document.body.append(link);
    });
    await page.locator('#read-proof-link').click();
    const retry = page.getByRole('button', { name: 'Try again', exact: true });
    await retry.waitFor();
    assert.match(await page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) }).innerText(), /Couldn't read your journal/);
    const { emptyTitle } = await page.evaluate(async () => {
      const { m } = await import('/src/lib/paraglide/messages.js');
      return { emptyTitle: m.eras_empty_title() };
    });
    assert.equal(await page.getByText(emptyTitle, { exact: true }).count(), 0);

    await page.evaluate(() => { window.readFault.mode = 'rows'; });
    await retry.click();
    await page.getByText('Private era proof', { exact: true }).waitFor();
    await retry.waitFor({ state: 'detached' });

    await page.evaluate(async () => {
      window.readFault.mode = 'fail';
      const { bump } = await import('/src/lib/data/live/tableVersions.svelte.ts');
      bump(['era']);
    });
    await retry.waitFor();
    assert.match(await page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) }).innerText(), /Couldn't refresh your journal/);
    assert.match(await page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) }).innerText(), /Showing the last result/);
    assert.equal(await page.getByText('Private era proof', { exact: true }).count(), 1);

    if (gallery) {
      await mkdir('.claude/read-failure-shots', { recursive: true });
      await page.evaluate(async () => {
        document.querySelector('.demo-bar').style.display = 'none';
        document.querySelector('#read-proof-link').remove();
        const { toasts } = await import('/src/lib/stores/toasts.svelte.ts');
        toasts.splice(0);
      });
      for (const palette of PALETTES) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ palette, theme }) => {
          const { prefs } = await import('/src/lib/data/prefs/store.svelte.ts');
          prefs.palette = palette;
          prefs.theme = theme;
        }, { palette, theme });
        await page.waitForTimeout(500);
        await page.screenshot({ path: `.claude/read-failure-shots/${palette}-${theme}.png`, fullPage: true });
      }
    }

    // Two retries in flight. An older success must not erase the newer failure.
    await page.evaluate(() => { window.readFault.mode = 'pending'; });
    await retry.click();
    await page.waitForFunction(() => window.readFault.pending.length === 1);
    await retry.click();
    await page.waitForFunction(() => window.readFault.pending.length === 2);
    await page.evaluate(() => window.readFault.pending[1].reject(new Error('newest failure')));
    await page.evaluate(() => window.readFault.pending[0].resolve([]));
    assert.equal(await page.getByText('Private era proof', { exact: true }).count(), 1);
    assert.match(await page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) }).innerText(), /Couldn't refresh/);

    // A newer empty success must survive an older rejection.
    await retry.click();
    await page.waitForFunction(() => window.readFault.pending.length === 3);
    await page.evaluate(() => { window.readFault.mode = 'empty'; });
    await retry.click();
    await page.getByText(emptyTitle, { exact: true }).waitFor();
    await page.evaluate(() => window.readFault.pending[2].reject(new Error('obsolete failure')));
    await retry.waitFor({ state: 'detached' });
    assert.equal(await page.getByText('Private era proof', { exact: true }).count(), 0);

    // A failed refresh of an empty result cannot repeat the successful empty claim.
    await page.evaluate(async () => {
      window.readFault.mode = 'throw';
      const { bump } = await import('/src/lib/data/live/tableVersions.svelte.ts');
      bump(['era']);
    });
    await retry.waitFor();
    assert.match(await page.getByRole('status').filter({ has: page.getByRole('button', { name: 'Try again', exact: true }) }).innerText(), /Couldn't refresh/);
    assert.equal(await page.getByText(emptyTitle, { exact: true }).count(), 0);
    await page.evaluate(() => { window.readFault.mode = 'rows'; });
    await retry.click();
    await page.getByText('Private era proof', { exact: true }).waitFor();

    // Lock stale rows with a retry still in flight, then let private rows arrive.
    await page.evaluate(async () => {
      window.readFault.mode = 'fail';
      const { bump } = await import('/src/lib/data/live/tableVersions.svelte.ts');
      bump(['era']);
    });
    await retry.waitFor();
    await page.evaluate(() => { window.readFault.mode = 'pending'; });
    await retry.click();
    await page.waitForFunction(() => window.readFault.pending.length === 4);
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      bootState.accessMode = 'pin';
      lockState.unlocked = false;
    });
    await page.getByText('Private era proof', { exact: true }).waitFor({ state: 'detached' });
    await page.evaluate(() => window.readFault.pending[3].resolve([
      { id: 'late', name: 'Late private result', startEpochDay: 19000, endEpochDay: 19010 }
    ]));
    assert.equal(await page.getByText('Late private result', { exact: true }).count(), 0);
    assert.equal(await retry.count(), 0);
    // The tryout's entry list uses detailDraft.readingRecord and liveListIn.
    await page.evaluate(async () => {
      const { bootState } = await import('/src/lib/stores/boot.svelte.ts');
      const { lockState } = await import('/src/lib/stores/lock.svelte.ts');
      const { attachJournal, journalIsOpen } = await import('/src/lib/data/live/journal.svelte.ts');
      const journal = bootState.journal;
      const original = journal.entries.searchEntries;
      window.dependentReadFails = true;
      journal.entries.searchEntries = (...args) => window.dependentReadFails
        ? Promise.reject(new Error('injected dependent read failure'))
        : original(...args);
      const tryoutId = await journal.tryouts.upsertTryout({
        kind: 'name', label: 'Read proof', startEpochDay: 19000, endEpochDay: 19010
      });
      await journal.entries.upsertEntry({ epochDay: 19005, mood: 3, note: 'Dependent entry proof' });
      attachJournal(journal);
      journalIsOpen();
      lockState.unlocked = true;
      const link = document.createElement('a');
      link.href = '/transition/tryouts/' + tryoutId;
      link.id = 'dependent-proof-link';
      link.textContent = 'Open tryout';
      document.body.append(link);
    });
    await page.locator('#dependent-proof-link').click();
    await retry.waitFor();
    await page.evaluate(() => { window.dependentReadFails = false; });
    await retry.click();
    await retry.waitFor({ state: 'detached' });
    await page.getByText('Dependent entry proof', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyReadFailures({ gallery: process.argv.includes('--gallery') });
  console.log('PASS read failures, retry races, empty recovery and locked list concealment');
}

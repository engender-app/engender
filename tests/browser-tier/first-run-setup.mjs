import assert from 'node:assert/strict';
import { resolve } from 'node:path';

const source = `/@fs${resolve(import.meta.dirname, '../../src/lib')}`;
const modes = ['passphrase', 'pin', 'biometric', 'device-bound'];

async function prepare(page, origin) {
  await page.goto(`${origin}/first-run-setup.html`);
  await page.evaluate(async (source) => {
    const [pass, pin, biometric, device, keys, initialization, sqlite] = await Promise.all([
      import(`${source}/data/journal-passphrase.ts`), import(`${source}/data/journal-pin.ts`),
      import(`${source}/data/journal-biometric.ts`), import(`${source}/data/device-bound-journal.ts`),
      import(`${source}/data/keystore-file.ts`), import(`${source}/data/journal-initialization.ts`),
      import(`${source}/data/sqlite/mc-driver.ts`)
    ]);
    // Only the platform PRF interaction is simulated. Its wrap, metadata,
    // initialization ownership, browser storage and SQLite are production code.
    const biometricPorts = {
      authenticator: {
        enrol: async () => ({ credentialId: new Uint8Array([1]), secret: 'fixture-prf-output' }),
        evaluate: async () => 'fixture-prf-output'
      },
      readKeystore: keys.readKeystoreFile,
      writeKeystore: keys.writeKeystoreFile,
      journalExists: initialization.journalAccessExists
    };
    window.setupProbe = {
      async setup(mode, second = false) {
        try {
          const key = mode === 'pin' ? await pin.setupJournalPin(second ? '4321' : '1234')
            : mode === 'biometric' ? await biometric.setupJournalBiometric(biometricPorts)
            : mode === 'device-bound' ? await device.setupDeviceBoundJournal()
            : await pass.setupJournalPassphrase(second ? 'second-test-password' : 'first-test-password');
          this.key = key;
          return 'created';
        } catch (error) { return error.name; }
      },
      async fingerprint() {
        const root = await navigator.storage.getDirectory();
        const result = {};
        for (const name of ['keystore.json', 'device-key.json']) {
          try { result[name] = await (await (await root.getFileHandle(name)).getFile()).text(); }
          catch (error) { if (error.name !== 'NotFoundError') throw error; }
        }
        return result;
      },
      async write() {
        const start = performance.now();
        this.driver = sqlite.createEncryptedWebSqlite('setup-regression.sqlite3', this.key).driver;
        await this.driver.exec("CREATE TABLE saved_note(note TEXT); INSERT INTO saved_note VALUES('original journal');");
        return performance.now() - start;
      },
      async close() { await this.driver.close(); },
      async reopen(mode, second = false) {
        const key = mode === 'pin' ? await pin.unlockJournalPin(second ? '4321' : '1234')
          : mode === 'biometric' ? await biometric.unlockJournalBiometric(biometricPorts)
          : mode === 'device-bound' ? await device.unlockDeviceBoundJournal()
          : await pass.unlockJournalPassphrase(second ? 'second-test-password' : 'first-test-password');
        const driver = sqlite.createEncryptedWebSqlite('setup-regression.sqlite3', key).driver;
        try { return await driver.query('SELECT note FROM saved_note'); }
        finally { await driver.close(); }
      }
    };
    await sqlite.prewarmJournalWorker('setup-regression.sqlite3');
  }, source);
}

export async function firstRunSetup(browser, origin) {
  const results = [];
  for (const mode of modes) {
    const context = await browser.newContext();
    try {
      const a = await context.newPage(), b = await context.newPage();
      await Promise.all([prepare(a, origin), prepare(b, origin)]);
      assert.deepEqual(await a.evaluate(() => setupProbe.fingerprint()), {});
      assert.deepEqual(await b.evaluate(() => setupProbe.fingerprint()), {});
      assert.equal(await a.evaluate((mode) => setupProbe.setup(mode), mode), 'created');
      const openMs = await a.evaluate(() => setupProbe.write());
      const first = await a.evaluate(() => setupProbe.fingerprint());
      for (const staleMode of modes) {
        assert.equal(await b.evaluate((mode) => setupProbe.setup(mode, true), staleMode), 'JournalAlreadyExistsError', `${mode} -> stale ${staleMode}`);
        assert.deepEqual(await b.evaluate(() => setupProbe.fingerprint()), first, 'original metadata unchanged');
      }
      await a.evaluate(() => setupProbe.close());
      assert.deepEqual(await b.evaluate((mode) => setupProbe.reopen(mode), mode), [{ note: 'original journal' }]);
      results.push({ mode, rejectedModes: modes.length, originalReopened: true, openMs });
    } finally { await context.close(); }
  }
  for (const pair of [['passphrase', 'passphrase'], ['pin', 'passphrase'], ['device-bound', 'pin']]) {
    const context = await browser.newContext();
    try {
      const pages = [await context.newPage(), await context.newPage()];
      await Promise.all(pages.map((page) => prepare(page, origin)));
      const answers = await Promise.all(pages.map((page, i) => page.evaluate(({ mode, second }) => setupProbe.setup(mode, second), { mode: pair[i], second: i === 1 })));
      assert.deepEqual([...answers].sort(), ['JournalAlreadyExistsError', 'created']);
      const winner = answers.indexOf('created');
      await pages[winner].evaluate(() => setupProbe.write());
      await pages[winner].evaluate(() => setupProbe.close());
      assert.deepEqual(await pages[1 - winner].evaluate(({ mode, second }) => setupProbe.reopen(mode, second), { mode: pair[winner], second: winner === 1 }), [{ note: 'original journal' }]);
      results.push({ simultaneous: pair, winner: pair[winner], originalReopened: true });
    } finally { await context.close(); }
  }
  return results;
}

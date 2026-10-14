import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver';
import { boot } from '../../src/lib/data/sqlite/boot';
import type { SqliteDriver } from '../../src/lib/data/sqlite/driver';
import { openJournal } from '../../src/lib/data/journal/journal';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store';
import { observeWrites } from '../../src/lib/data/live/writes';
import { applyUpdate, watchForUpdates } from '../../src/lib/pwa/update';
import { CLIENT_RELEASE } from '../../src/lib/pwa/sw-messages';

/** Each page gets an isolated encrypted journal, but uses the real built
    release's worker. Holding the public transaction seam changes no SQL. */
async function setup(worker: string, name: string, version: string) {
  Object.assign(globalThis, { __retainedWorkerUrl: worker });
  const key = new Uint8Array(32).fill(7);
  let opened = createEncryptedWebSqlite(name + '.sqlite3', key);
  let driver: SqliteDriver;
  let held: (() => void) | undefined;
  let fail = false;
  let saved = false;
  let recovery = '';
  let saving: Promise<void> | undefined;
  let takeovers = 0;
  let reloads = 0;
  const draft = document.createElement('textarea');
  draft.dataset.retainedDraft = name;
  document.body.append(draft);
  const gate = (scope: SqliteDriver): SqliteDriver => ({
    ...scope,
    async run(sql, params) {
      if (/INSERT INTO entry\s*\(/i.test(sql)) {
        await new Promise<void>(resolve => { held = resolve; });
        held = undefined;
        if (fail) throw new Error('retained fixture save refused');
      }
      return scope.run(sql, params);
    },
    transaction: work => scope.transaction(transaction => work(gate(transaction)))
  });
  async function open() {
    const result = await boot({ createDriver: () => opened.driver, fileOps: opened.fileOps });
    if (result.phase === 'error') throw result.error;
    driver = result.driver;
    const raw = openJournal(gate(driver), fakeFileStore());
    await raw.reconcileBuiltIns();
    return observeWrites(raw, () => {});
  }
  let journal = await open();
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new Error('The production worker is not registered');
  const report = () => navigator.serviceWorker.controller?.postMessage({ type: CLIENT_RELEASE, version });
  navigator.serviceWorker.addEventListener('controllerchange', () => { takeovers++; report(); });
  report();
  watchForUpdates(registration, {
    onControllerChange(listener) {
      navigator.serviceWorker.addEventListener('controllerchange', listener);
      return () => navigator.serviceWorker.removeEventListener('controllerchange', listener);
    },
    reload() { reloads++; location.reload(); }
  });
  Object.assign(window, { retained: {
    start(note: string, refuses: boolean) {
      draft.value = note;
      fail = refuses;
      saving = journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note })
        .then(() => { saved = true; draft.value = ''; })
        .catch(error => { recovery = error.message; });
    },
    async finish() { held?.(); await saving; },
    state: () => ({ held: Boolean(held), saved, recovery, draft: draft.value, takeovers, reloads }),
    apply: () => applyUpdate(),
    report,
    async reopen() {
      await driver.close();
      opened = createEncryptedWebSqlite(name + '.sqlite3', key);
      journal = await open();
      return journal.entries.entriesForDay(20000);
    },
    entries: () => journal.entries.entriesForDay(20000)
  } });
}
Object.assign(window, { setupRetained: setup });

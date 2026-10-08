import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver';
import { boot } from '../../src/lib/data/sqlite/boot';
import type { SqliteDriver } from '../../src/lib/data/sqlite/driver';
import { openJournal } from '../../src/lib/data/journal/journal';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store';
import { observeWrites } from '../../src/lib/data/live/writes';
import { journalIsBusy } from '../../src/lib/data/journal-busy';
import { applyUpdate, updateReady, watchForUpdates } from '../../src/lib/pwa/update';

const draft = document.querySelector<HTMLInputElement>('#draft')!;
const outcome = document.querySelector<HTMLElement>('#outcome')!;
const { driver, fileOps, requestPersistentStorage } = createEncryptedWebSqlite(
  'update-handover.sqlite3', new Uint8Array(32).fill(7)
);
const opened = await boot({ createDriver: () => driver, fileOps, requestPersistentStorage });
if (opened.phase === 'error') throw opened.error;
let releaseWrite: (() => void) | undefined;
let held = false;
let shouldFail = false;
let saving: Promise<void> | undefined;
let saved = false;
let failed = false;
let applying: Promise<boolean> | undefined;
let reloads = 0;
let takeovers = 0;

const gate = (scope: SqliteDriver): SqliteDriver => ({
  ...scope,
  async run(sql, params) {
    if (held && /INSERT INTO entry\s*\(/i.test(sql)) {
      document.body.dataset.writeHeld = 'true';
      await new Promise<void>((resolve) => { releaseWrite = resolve; });
      held = false;
      if (shouldFail) throw new Error('held journal write failed');
    }
    return scope.run(sql, params);
  },
  transaction: (work) => scope.transaction((transaction) => work(gate(transaction)))
});
const raw = openJournal(gate(opened.driver), fakeFileStore());
await raw.reconcileBuiltIns();
const journal = observeWrites(raw, () => {});
document.querySelector('#save')!.addEventListener('click', () => {
  saved = false;
  failed = false;
  saving = journal.entries.upsertEntry({ epochDay: 20000, mood: 4, note: draft.value })
    .then(() => { saved = true; draft.value = ''; outcome.textContent = 'Saved'; })
    .catch((error) => { failed = true; outcome.textContent = error.message; });
});

const registration = await navigator.serviceWorker.register('/handover-sw.js', { type: 'module', updateViaCache: 'none' });
await navigator.serviceWorker.ready;
await waitFor(() => navigator.serviceWorker.controller !== null);
watchForUpdates(registration, {
  onControllerChange(listener) {
    const changed = () => { takeovers++; listener(); };
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', changed);
  },
  reload() {
    reloads++;
    sessionStorage.setItem('handover-reload', JSON.stringify({ busy: journalIsBusy(), saved, failed, draft: draft.value }));
    location.reload();
  }
});

Object.assign(window, { handover: {
  async offer() {
    await fetch('/bump');
    await registration.update();
    await waitFor(() => registration.waiting !== null);
  },
  apply() { applying = applyUpdate(); },
  applied: () => applying,
  hold(fail: boolean) { held = true; shouldFail = fail; releaseWrite = undefined; delete document.body.dataset.writeHeld; },
  async finish() { releaseWrite?.(); await saving; },
  state: () => ({ busy: journalIsBusy(), ready: updateReady(), saved, failed, reloads, takeovers, draft: draft.value }),
  entries: () => journal.entries.entriesForDay(20000),
  controller: () => navigator.serviceWorker.controller?.state,
  checkpoint: () => JSON.parse(sessionStorage.getItem('handover-reload') ?? 'null')
}});
document.body.dataset.ready = 'true';


async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('service worker lifecycle did not settle');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

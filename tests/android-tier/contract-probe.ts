/* The Android tier's probe (ticket 11): boots the native driver through the
   Capacitor bridge and runs the shared contract suite over it - the same
   suite src/lib/data/journal/contract-suite.test.ts runs over node:sqlite.

   It loads inside the real app's WebView, which the instrumentation test
   points at this bundle with Bridge.setServerBasePath, so the plugin, the
   bridge and the WebView are the ones the app ships rather than stand-ins.

   Photos are ticket 12, so the journal gets the same in-memory file store
   the Node tier uses. Nothing the contract asks about touches it. */

import { boot } from '../../src/lib/data/sqlite/boot.ts';
import { createAndroidSqlite } from '../../src/lib/data/sqlite/android-driver.ts';
import { runJournalContract } from '../../src/lib/data/journal/contract-suite.ts';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store.ts';

declare global {
  interface Window {
    __contractResult?: unknown;
  }
}

const publish = (value: unknown) => {
  window.__contractResult = value;
  document.body.dataset.contractReady = 'true';
};

async function run() {
  /* One fixed name, the probe's own - the app's journal is not touched.
     Freshness comes from JournalContractTest deleting this file before it
     launches the activity, rather than from a new name per run, which would
     leave a database behind in app storage every time the suite ran. */
  const { driver, fileOps, requestPersistentStorage } =
    createAndroidSqlite('contract-probe.sqlite3');

  const result = await boot({ createDriver: () => driver, fileOps, requestPersistentStorage });
  if (result.phase === 'error') {
    publish({ error: String((result.error as Error)?.stack ?? result.error) });
    return;
  }

  const checks = await runJournalContract(result.driver, fakeFileStore());
  publish({ persistDenied: result.persistDenied, checks });
  await driver.close();
}

run().catch((error) => publish({ error: String((error as Error)?.stack ?? error) }));

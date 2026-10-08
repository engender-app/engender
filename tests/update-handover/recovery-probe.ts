import { mount } from 'svelte';
import SchemaTooNew from '../../src/lib/components/SchemaTooNew.svelte';
import { createEncryptedWebSqlite } from '../../src/lib/data/sqlite/mc-driver';
import { boot } from '../../src/lib/data/sqlite/boot';
import { LATEST_SCHEMA_VERSION } from '../../src/lib/data/sqlite/schema-version';
import { initialBoot, reduce, type BootEvent } from '../../src/lib/stores/boot-machine';
import { registerServiceWorkerAfterBoot } from '../../src/lib/pwa/register';
import { updateReady } from '../../src/lib/pwa/update';

const key = new Uint8Array(32).fill(9);
const { driver, fileOps } = createEncryptedWebSqlite('schema-recovery.sqlite3', key);
const seed = new URLSearchParams(location.search).has('seed');
if (seed) {
  await driver.setUserVersion(LATEST_SCHEMA_VERSION + 1);
  await driver.close();
  const registration = await navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' });
  await navigator.serviceWorker.ready;
  await waitFor(() => navigator.serviceWorker.controller !== null);
  Object.assign(window, { recoverySeed: {
    async offer() {
      await fetch('/recovery-bump');
      await registration.update();
      await waitFor(() => registration.waiting !== null);
    }
  } });
} else {
  let machine = initialBoot();
  const statuses: string[] = [];
  const send = (event: BootEvent) => {
    machine = reduce(machine, event).machine;
    statuses.push(machine.boot.status);
    registerServiceWorkerAfterBoot(machine.boot.status);
  };
  send({ type: 'started', platform: 'web', demo: false });
  send({ type: 'web-surveyed', keystoreSecretSource: 'passphrase', deviceBoundKeystoreExists: false, legacyStoragePresent: false });
  send({ type: 'key-obtained', dataKey: key, accessMode: 'passphrase', unlocked: true });
  let journalReads = 0;
  const opened = await boot({ createDriver: () => driver, fileOps, loadReferenceData: async () => { journalReads++; } });
  if (opened.phase !== 'error') throw new Error('future schema was not refused');
  send({ type: 'journal-open-failed', error: opened.error });
  if (machine.boot.status !== 'schema-too-new') throw new Error('schema refusal gate was not reached');

  let registerCalls = 0;
  const nativeRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
  navigator.serviceWorker.register = (...args) => { registerCalls++; return nativeRegister(...args); };
  let takeovers = 0;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    takeovers++;
    sessionStorage.setItem('schema-recovery-handover', JSON.stringify({ status: machine.boot.status, journalReads, registerCalls, takeovers }));
  });
  const registration = await navigator.serviceWorker.getRegistration();
  Object.assign(window, { recovery: {
    state: () => ({ status: machine.boot.status, statuses, journalReads, registerCalls, updateReady: updateReady(), waiting: registration?.waiting !== null }),
    checkpoint: () => JSON.parse(sessionStorage.getItem('schema-recovery-handover') ?? 'null')
  } });
  mount(SchemaTooNew, { target: document.querySelector('#recovery')! });
}
document.body.dataset.ready = 'true';

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('service worker lifecycle did not settle');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

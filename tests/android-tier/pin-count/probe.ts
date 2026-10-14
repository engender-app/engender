import { mount, unmount, tick } from 'svelte';
import PinEntry, { type PinAttempt } from '../../../src/lib/components/PinEntry.svelte';
import { wrapDataKeyWithSecret } from '../../../src/lib/crypto/keystore';
import { DecryptionFailedError } from '../../../src/lib/crypto/aesGcm';
import { writeKeystoreFile } from '../../../src/lib/data/keystore-file';
import { unlockJournalPin } from '../../../src/lib/data/journal-pin';
import { combinePinWithDevice, keystoreDeviceBinding } from '../../../src/lib/data/device-secret';
import { androidPinBinding } from '../../../src/lib/data/pin-binding-bridge';
import { localStorageAttempts } from '../../../src/lib/lock/attempt-store';
import { androidLockTiming, androidPinAttempts, readAndroidPinAccounting } from '../../../src/lib/lock/lock-timing-bridge';
import { readKeystoreFile } from '../../../src/lib/data/keystore-file';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver';

const store = localStorageAttempts();
const binding = keystoreDeviceBinding(androidPinBinding);
const database = 'pin-count-fixture.sqlite3';
const marker = 'synthetic PIN accounting journal';
let gate: ReturnType<typeof mount> | undefined;
let release: (() => void) | undefined;
const probe = {
  started: false,
  verified: '',
  holdBeforeVerification: false,
  holdAfterAdmission: false,
  admitted: false,
  holdDerivationReply: false,
  derivationPosted: false,
  derivationCompleted: false,
  async seed() {
    await probe.unmount();
    const key = new Uint8Array(Array.from({ length: 32 }, (_, index) => index + 21));
    const metadata = await wrapDataKeyWithSecret(key,
      combinePinWithDevice('1234', await binding.create()),
      { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 }, 'pin');
    metadata.pinBinding = 'keystore';
    await writeKeystoreFile(metadata);
    const { driver } = createAndroidSqlite(database, key);
    try {
      await driver.exec('CREATE TABLE IF NOT EXISTS accounting (id INTEGER PRIMARY KEY, note TEXT)');
      await driver.run('INSERT OR REPLACE INTO accounting VALUES (1, ?)', [marker]);
    } finally { await driver.close(); key.fill(0); }
    // Fixture resets follow real successful authentication, never a wrong guess.
    const pending = await readAndroidPinAccounting();
    await new Promise(resolve => setTimeout(resolve, pending.remainingMs + 50));
    const authenticated = await unlockJournalPin('1234');
    authenticated.fill(0);
    store.clear();
    probe.started = false; probe.verified = ''; probe.holdBeforeVerification = false; probe.holdAfterAdmission = false; probe.admitted = false;
    probe.holdDerivationReply = false; probe.derivationPosted = false; probe.derivationCompleted = false;
  },
  async mount() {
    await probe.unmount();
    gate = mount(PinEntry, { target: document.getElementById('gate')!, props: { onVerify: verify } });
    await tick();
  },
  async unmount() {
    if (gate) await unmount(gate);
    gate = undefined;
  },
  releaseVerification() { release?.(); release = undefined; },
  async snapshot() {
    const native = await androidLockTiming.getPinWait();
    return { count: { wrongAttempts: native.wrongAttempts }, mirror: store.read(), native,
      status: document.querySelector('[data-pin-status]')?.getAttribute('data-pin-status'),
      started: probe.started, admitted: probe.admitted, verified: probe.verified,
      derivationPosted: probe.derivationPosted, derivationCompleted: probe.derivationCompleted };
  }
};

async function verify(pin: string, current: () => void): Promise<PinAttempt> {
  probe.started = true; probe.verified = '';
  if (probe.holdBeforeVerification) await new Promise<void>(resolve => { release = resolve; });
  let key: Uint8Array | undefined;
  try {
    key = await unlockJournalPin(pin, { binding, bindingKind: 'keystore',
      journalExists: async () => true, readKeystore: readKeystoreFile, writeKeystore: writeKeystoreFile,
      attempts: {
        async begin() {
          const token = await androidPinAttempts.begin();
          probe.admitted = true;
          if (probe.holdAfterAdmission) await new Promise<void>(resolve => { release = resolve; });
          return token;
        },
        finish: androidPinAttempts.finish
      }
    }, current);
    const { driver } = createAndroidSqlite(database, key);
    try {
      if ((await driver.query<{ note: string }>('SELECT note FROM accounting WHERE id = 1'))[0]?.note !== marker) {
        throw new Error('synthetic journal did not reopen');
      }
    } finally { await driver.close(); }
    probe.verified = 'ok';
    return 'ok';
  } catch (error) {
    if (error instanceof DecryptionFailedError) { probe.verified = 'wrong'; return 'wrong'; }
    throw error;
  } finally { key?.fill(0); }
}

// Keep the real worker and KDF; hold only its response at a repeatable
// interruption boundary. No request, secret or derived bytes enter evidence.
const NativeWorker = window.Worker;
window.Worker = class extends NativeWorker {
  postMessage(message: unknown) {
    if (probe.holdDerivationReply) probe.derivationPosted = true;
    super.postMessage(message);
  }
  set onmessage(handler: ((this: Worker, event: MessageEvent) => unknown) | null) {
    super.onmessage = event => {
      if (probe.holdDerivationReply) {
        probe.derivationCompleted = true;
        release = () => { handler?.call(this, event); };
      } else handler?.call(this, event);
    };
  }
};

declare global { interface Window { __pinCount: typeof probe; } }
window.__pinCount = probe;
document.body.dataset.pinCountReady = 'true';

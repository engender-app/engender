import { wrapDataKeyWithSecret, serializeKeystore, rewrapKeystore } from '../../../src/lib/crypto/keystore';
import { readKeystoreFile, writeKeystoreFile, KEYSTORE_FILE } from '../../../src/lib/data/keystore-file';
import { changeJournalPassphrase, unlockJournalPassphrase } from '../../../src/lib/data/journal-passphrase';
import { changeJournalPin, unlockJournalPin } from '../../../src/lib/data/journal-pin';
import { combinePinWithDevice, keystoreDeviceBinding } from '../../../src/lib/data/device-secret';
import { androidKeystore } from '../../../src/lib/lock/keystore-bridge';
import { androidPinBinding } from '../../../src/lib/data/pin-binding-bridge';
import { createAndroidSqlite } from '../../../src/lib/data/sqlite/android-driver';

type Credential = 'passphrase' | 'pin';
const secrets = { passphrase: ['durability old passphrase', 'durability new passphrase'], pin: ['1234', '5678'] };
const dataKey = () => new Uint8Array(Array.from({ length: 32 }, (_, i) => i + 1));
const binding = keystoreDeviceBinding(androidPinBinding);
const database = 'credential-power-cut.sqlite3';
const marker = 'synthetic credential durability record';
const fast = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

async function checkJournal(key: Uint8Array, seed = false): Promise<boolean> {
  const { driver } = createAndroidSqlite(database, key);
  try {
    if (seed) {
      await driver.exec('CREATE TABLE IF NOT EXISTS durability (id INTEGER PRIMARY KEY, note TEXT)');
      await driver.run('INSERT OR REPLACE INTO durability VALUES (1, ?)', [marker]);
    }
    return (await driver.query<{ note: string }>('SELECT note FROM durability WHERE id = 1'))[0]?.note === marker;
  } finally { await driver.close(); }
}

const probe = {
  confirmed: false,
  error: '',
  async seed(type: Credential, legacy = false) {
    const key = dataKey();
    const secret = type === 'pin' ? combinePinWithDevice(secrets.pin[0], await binding.create()) : secrets.passphrase[0];
    const metadata = await wrapDataKeyWithSecret(key, secret, fast, type);
    if (type === 'pin') metadata.pinBinding = 'keystore';
    if (legacy) {
      const root = await navigator.storage.getDirectory();
      const writable = await (await root.getFileHandle(KEYSTORE_FILE, { create: true })).createWritable();
      await writable.write(serializeKeystore(metadata));
      await writable.close();
      // The host removes only this isolated package's native record first.
      const adopted = await readKeystoreFile();
      if (adopted?.secretSource !== type) throw new Error('released OPFS adoption did not retain its credential type');
    } else await writeKeystoreFile(metadata);
    // Moving from a device mode to a secret erases only the old device wrap.
    await androidKeystore.erase();
    if ((await readKeystoreFile())?.secretSource !== type) throw new Error('device-binding cleanup erased the new credential');
    try { if (!await checkJournal(key, true)) throw new Error('fixture journal did not save'); }
    finally { key.fill(0); }
    probe.confirmed = false;
    probe.error = '';
    return { seeded: type, adopted: legacy };
  },
  async change(type: Credential) {
    probe.confirmed = false;
    probe.error = '';
    try {
      if (type === 'pin') await changeJournalPin(secrets.pin[0], secrets.pin[1]);
      else await changeJournalPassphrase(secrets.passphrase[0], secrets.passphrase[1]);
      // Settings displays its confirmation only after this same promise resolves.
      probe.confirmed = true;
    } catch (error) { probe.error = String(error); throw error; }
  },
  async failureFixtures(type: Credential) {
    const old = await readKeystoreFile();
    if (!old) throw new Error('failure fixture has no current wrap');
    const device = type === 'pin' ? await binding.read() : '';
    const secret = (index: number) => type === 'pin' ? combinePinWithDevice(secrets.pin[index], device) : secrets.passphrase[index];
    // Build the replacement in memory. It has never been published or confirmed.
    const next = await rewrapKeystore(old, secret(0), secret(1));
    if (type === 'pin') next.pinBinding = old.pinBinding;
    return { old: serializeKeystore(old), next: serializeKeystore(next) };
  },
  async verify(type: Credential) {
    const results: boolean[] = [];
    for (const secret of secrets[type]) {
      let key: Uint8Array | undefined;
      try {
        key = type === 'pin' ? await unlockJournalPin(secret) : await unlockJournalPassphrase(secret);
        results.push(await checkJournal(key));
      } catch { results.push(false); }
      finally { key?.fill(0); }
    }
    return { oldOpens: results[0], newOpens: results[1], source: (await readKeystoreFile())?.secretSource ?? null };
  }
};

declare global { interface Window { __credentialPowerCut: typeof probe; } }
window.__credentialPowerCut = probe;
document.body.dataset.credentialProbeReady = 'true';

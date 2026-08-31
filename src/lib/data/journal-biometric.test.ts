import { test, expect } from 'vitest';
import { addJournalBiometric, setupJournalBiometric, unlockJournalBiometric, type BiometricPorts } from './journal-biometric.ts';
import { BiometricUnavailableError, type PrfAuthenticator } from './webauthn-prf.ts';
import { DecryptionFailedError } from '../crypto/aesGcm.ts';
import { KeystoreUnreadableError, parseKeystore, serializeKeystore, createKeystore, type KeystoreMetadata } from '../crypto/keystore.ts';

/* A fake platform authenticator: it holds a per-credential key it never
   hands out, and the "PRF output" is a digest of that key and the salt -
   deterministic in the pair, exactly as the real extension is, and
   unavailable to anything that does not hold the credential.

   The Argon2id derivations underneath are real at the shipped biometric
   profile, for the reason keystore.test.ts states: stubbing the KDF would
   un-test the property the module exists for. */
function device(): PrfAuthenticator & { forget(): void } {
  const held = new Map<string, Uint8Array>();
  const name = (id: Uint8Array) => Buffer.from(id).toString('base64');

  async function derive(key: Uint8Array, salt: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new Uint8Array([...key, ...salt]));
    return Buffer.from(new Uint8Array(digest)).toString('base64');
  }

  return {
    async enrol(salt) {
      const credentialId = crypto.getRandomValues(new Uint8Array(16));
      const key = crypto.getRandomValues(new Uint8Array(32));
      held.set(name(credentialId), key);
      return { credentialId, secret: await derive(key, salt) };
    },
    async evaluate(credentialId, salt) {
      const key = held.get(name(credentialId));
      if (!key) throw new BiometricUnavailableError('this device does not hold that credential');
      return derive(key, salt);
    },
    forget() {
      held.clear();
    }
  };
}

/** The keystore file, in memory, and deliberately through the serialized
    form: what a cold start gets is JSON off a disk, not the object that was
    written. */
function ports(authenticator: PrfAuthenticator): BiometricPorts & { stored(): KeystoreMetadata | null; put(m: KeystoreMetadata): void } {
  let file: string | null = null;
  return {
    authenticator,
    readKeystore: async () => (file === null ? null : parseKeystore(file)),
    writeKeystore: async (metadata) => {
      file = serializeKeystore(metadata);
    },
    stored: () => (file === null ? null : parseKeystore(file)),
    put: (metadata) => {
      file = serializeKeystore(metadata);
    }
  };
}

test('a journal set up under a biometric opens again through the same authenticator', async () => {
  const world = ports(device());
  const dataKey = await setupJournalBiometric(world);

  expect(dataKey.length).toBe(32);
  expect(await unlockJournalBiometric(world)).toEqual(dataKey);
});

test('the stored keystore names the biometric as its source, so boot draws that gate', async () => {
  const world = ports(device());
  await setupJournalBiometric(world);

  expect(world.stored()?.secretSource).toBe('biometric');
});

/* The acceptance's cold-start claim: the file holds everything needed to ask
   the authenticator, so a later run with nothing else in memory opens. */
test('the credential id and salt in the keystore are the whole of what a cold start needs', async () => {
  const authenticator = device();
  const first = ports(authenticator);
  const dataKey = await setupJournalBiometric(first);

  const laterRun = ports(authenticator);
  laterRun.put(first.stored()!);

  expect(await unlockJournalBiometric(laterRun)).toEqual(dataKey);
});

test('the salt is load-bearing: the same credential under another salt does not open the journal', async () => {
  const authenticator = device();
  const world = ports(authenticator);
  await setupJournalBiometric(world);

  const reSalted = world.stored()!;
  const elsewhere = ports(authenticator);
  elsewhere.put({ ...reSalted, biometric: { credentialId: reSalted.biometric!.credentialId, prfSalt: crypto.getRandomValues(new Uint8Array(32)) } });

  await expect(unlockJournalBiometric(elsewhere)).rejects.toThrow(DecryptionFailedError);
});

/* The same claim PIN mode's device-binding test makes, for the same reason:
   the file on its own is not the journal. Here the second half is the
   authenticator rather than a browser key. */
test('the keystore file on another device fails as unavailable rather than as a wrong secret', async () => {
  const world = ports(device());
  await setupJournalBiometric(world);

  const anotherDevice = ports(device());
  anotherDevice.put(world.stored()!);

  await expect(unlockJournalBiometric(anotherDevice)).rejects.toThrow(BiometricUnavailableError);
});

test('losing the enrolled credential is its own failure, not a secret that stopped working', async () => {
  const authenticator = device();
  const world = ports(authenticator);
  await setupJournalBiometric(world);
  authenticator.forget();

  await expect(unlockJournalBiometric(world)).rejects.toThrow(BiometricUnavailableError);
});

test('moving an open journal to biometric mode wraps the key it already has', async () => {
  const world = ports(device());
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  await addJournalBiometric(dataKey, world);

  expect(world.stored()?.secretSource).toBe('biometric');
  expect(await unlockJournalBiometric(world)).toEqual(dataKey);
});

test('unlocking a journal that is not in biometric mode fails by name rather than at the prompt', async () => {
  const world = ports(device());
  const { metadata } = await createKeystore('a typed passphrase');
  world.put(metadata);

  await expect(unlockJournalBiometric(world)).rejects.toThrow(KeystoreUnreadableError);
});

test('a keystore that names the biometric with no credential to ask is refused when it is read', async () => {
  const world = ports(device());
  await setupJournalBiometric(world);
  const stripped = JSON.parse(serializeKeystore(world.stored()!)) as Record<string, unknown>;
  delete stripped.credentialId;

  expect(() => parseKeystore(JSON.stringify(stripped))).toThrow(KeystoreUnreadableError);
});

test('a biometric keystore with no handle is refused before it can overwrite a good one', async () => {
  const { metadata } = await createKeystore('anything', undefined, 'biometric');

  expect(() => serializeKeystore(metadata)).toThrow(KeystoreUnreadableError);
});

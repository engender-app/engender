import { test, expect } from 'vitest';
import {
  addJournalPin,
  changeJournalPin,
  isValidPin,
  setupJournalPin,
  unlockJournalPin,
  type PinPorts
} from './journal-pin.ts';
import { DeviceBindingUnavailableError } from './device-secret.ts';
import { DecryptionFailedError } from '../crypto/aesGcm.ts';
import { KeystoreUnreadableError, type KeystoreMetadata } from '../crypto/keystore.ts';
import type { DeviceKeySlot } from './device-bound-journal.ts';

/* Both halves of PIN mode in memory: the keystore file and the browser key
   slot. The Argon2id derivations are real at the shipped pin-encryption
   profile - stubbing the KDF would un-test the one property this module
   exists for, the same reasoning keystore.test.ts states. */
function ports(): PinPorts & { forgetDevice(): void; stored(): KeystoreMetadata | null } {
  let keystore: KeystoreMetadata | null = null;
  let held: CryptoKey | null = null;
  const slot: DeviceKeySlot = {
    load: async () => held,
    save: async (key) => {
      held = key;
    },
    remove: async () => {
      held = null;
    }
  };
  return {
    slot,
    readKeystore: async () => keystore,
    writeKeystore: async (metadata) => {
      keystore = metadata;
    },
    forgetDevice: () => {
      held = null;
    },
    stored: () => keystore
  };
}

test('a journal set up under a PIN opens with that PIN and refuses another', async () => {
  const world = ports();
  const dataKey = await setupJournalPin('1234', world);

  expect(await unlockJournalPin('1234', world)).toEqual(dataKey);
  await expect(unlockJournalPin('4321', world)).rejects.toThrow(DecryptionFailedError);
});

test('the stored keystore names PIN as its source, so boot draws the pad rather than a passphrase field', async () => {
  const world = ports();
  await setupJournalPin('1234', world);

  expect(world.stored()?.secretSource).toBe('pin');
});

/* The claim the four-digit decision rests on (ADR-0041): the keystore file
   on its own is not guessable, because the PIN is only half the secret. */
test('the keystore file alone does not open the journal: the device key is the other half', async () => {
  const world = ports();
  await setupJournalPin('1234', world);
  const copied = world.stored();

  // Everything an attacker gets by copying the file, on a device that never
  // held the binding key - which is every device but this one.
  const elsewhere = ports();
  await elsewhere.writeKeystore(copied!);

  await expect(unlockJournalPin('1234', elsewhere)).rejects.toThrow(DeviceBindingUnavailableError);
});

test('losing the browser profile is its own failure rather than a wrong PIN', async () => {
  const world = ports();
  await setupJournalPin('1234', world);
  world.forgetDevice();

  await expect(unlockJournalPin('1234', world)).rejects.toThrow(DeviceBindingUnavailableError);
});

test('wrapping an already-open journal under a PIN keeps the same data key', async () => {
  const world = ports();
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  await addJournalPin(dataKey, '1234', world);

  expect(await unlockJournalPin('1234', world)).toEqual(dataKey);
});

test('changing the PIN keeps the journal and stops the old PIN working', async () => {
  const world = ports();
  const dataKey = await setupJournalPin('1234', world);
  await changeJournalPin('1234', '5678', world);

  expect(await unlockJournalPin('5678', world)).toEqual(dataKey);
  await expect(unlockJournalPin('1234', world)).rejects.toThrow(DecryptionFailedError);
});

test('changing the PIN with the wrong current PIN writes nothing', async () => {
  const world = ports();
  await setupJournalPin('1234', world);
  const before = world.stored();

  await expect(changeJournalPin('9999', '5678', world)).rejects.toThrow(DecryptionFailedError);
  expect(world.stored()).toBe(before);
  expect(await unlockJournalPin('1234', world)).toBeTruthy();
});

test('a passphrase keystore is refused by the PIN unlock rather than derived under the wrong profile', async () => {
  const world = ports();
  const dataKey = await setupJournalPin('1234', world);
  const passphraseKeystore = { ...world.stored()!, secretSource: 'passphrase' as const };
  await world.writeKeystore(passphraseKeystore);

  await expect(unlockJournalPin('1234', world)).rejects.toThrow(KeystoreUnreadableError);
  expect(dataKey.length).toBe(32);
});

test('only four digits is a PIN', () => {
  expect(isValidPin('1234')).toBe(true);
  expect(isValidPin('0000')).toBe(true);
  expect(isValidPin('123')).toBe(false);
  expect(isValidPin('12345')).toBe(false);
  expect(isValidPin('12a4')).toBe(false);
  expect(isValidPin('')).toBe(false);
});

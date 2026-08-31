import { test, expect } from 'vitest';
import {
  addJournalPin,
  changeJournalPin,
  isValidPin,
  removeEveryPinBinding,
  setupJournalPin,
  unlockJournalPin,
  type PinPorts
} from './journal-pin.ts';
import {
  DeviceBindingUnavailableError,
  browserDeviceBinding,
  keystoreDeviceBinding,
  type PinBindingBridge
} from './device-secret.ts';
import { DecryptionFailedError } from '../crypto/aesGcm.ts';
import { KeystoreUnreadableError, type KeystoreMetadata } from '../crypto/keystore.ts';
import type { DeviceKeySlot } from './device-bound-journal.ts';

/* Both halves of PIN mode in memory: the keystore file and the two key
   stores a PIN can be bound to. The Argon2id derivations are real at the
   shipped pin-encryption profile - stubbing the KDF would un-test the one
   property this module exists for, the same reasoning keystore.test.ts
   states.

   One world holds both platforms' ports over the *same* keystore and the
   same WebView slot, because that is what the migration is: a journal an
   older Android build wrote through `web` below, opened later through
   `phone`. */
function world() {
  let keystore: KeystoreMetadata | null = null;
  let held: CryptoKey | null = null;
  let aliasKey: string | null = null;
  let mints = 0;

  const slot: DeviceKeySlot = {
    load: async () => held,
    save: async (key) => {
      held = key;
    },
    remove: async () => {
      held = null;
    }
  };

  /* The phone's Keystore, with the property that matters kept real: the
     signature is a function of the key under the alias, so replacing the key
     changes the secret and an erased alias yields nothing. */
  const bridge: PinBindingBridge = {
    create: async ({ label }) => {
      mints++;
      aliasKey = crypto.randomUUID();
      return { secret: `${aliasKey}/${label}` };
    },
    read: async ({ label }) => ({ secret: aliasKey === null ? null : `${aliasKey}/${label}` }),
    erase: async () => {
      aliasKey = null;
    }
  };

  let failNextWrite = false;
  const file = {
    readKeystore: async () => keystore,
    writeKeystore: async (metadata: KeystoreMetadata) => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('the process died before the keystore landed');
      }
      keystore = metadata;
    }
  };

  return {
    /** The web, and every Android build before ticket sec-02-06. */
    web: { binding: browserDeviceBinding(slot), bindingKind: 'browser', ...file } satisfies PinPorts,
    /** Android now: the phone's Keystore, with the WebView slot kept only so
        a journal the older build wrote can still be opened once. */
    phone: {
      binding: keystoreDeviceBinding(bridge),
      bindingKind: 'keystore',
      legacyBinding: browserDeviceBinding(slot),
      ...file
    } satisfies PinPorts,
    forgetDevice: () => {
      held = null;
    },
    webViewHoldsAKey: () => held !== null,
    phoneHoldsAKey: () => aliasKey !== null,
    mints: () => mints,
    failNextWrite: () => {
      failNextWrite = true;
    },
    stored: () => keystore
  };
}

/** Most of the file is about one platform at a time, and for those the web's
    ports are the shape every test had before the phone gained a binding. */
function ports() {
  const shared = world();
  return Object.assign(shared.web, {
    forgetDevice: shared.forgetDevice,
    stored: shared.stored
  });
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

/* Two refusals that exist so a mistake cannot become a journal nobody can
   open. Both were added after review: the first because minting a fresh
   binding key replaces the only key that opens the keystore already on disk,
   the second because the digit count is what the setup copy's whole
   brute-force figure is computed from. */
test('moving to PIN mode refuses a journal already in PIN mode, rather than replacing its device key', async () => {
  const world = ports();
  const dataKey = await setupJournalPin('1234', world);
  const before = world.stored();

  await expect(addJournalPin(dataKey, '5678', world)).rejects.toThrow(KeystoreUnreadableError);
  // Nothing written, and the PIN that worked still does.
  expect(world.stored()).toBe(before);
  expect(await unlockJournalPin('1234', world)).toEqual(dataKey);
});

test('a PIN that is not four digits never reaches the wrap', async () => {
  const world = ports();
  await expect(setupJournalPin('123', world)).rejects.toThrow(KeystoreUnreadableError);
  await expect(setupJournalPin('12345', world)).rejects.toThrow(KeystoreUnreadableError);
  await expect(setupJournalPin('', world)).rejects.toThrow(KeystoreUnreadableError);
  expect(world.stored()).toBe(null);

  await setupJournalPin('1234', world);
  await expect(changeJournalPin('1234', '99', world)).rejects.toThrow(KeystoreUnreadableError);
  expect(await unlockJournalPin('1234', world)).toBeTruthy();
});

/* --- the phone's binding, and the journals that predate it (sec-02-06) --- */

/* The claim the whole ticket is for: on Android the key the PIN is bound to
   is in the platform keystore, so a copy of the app's directory - which is
   where the WebView's key store lives - contains neither half of the secret. */
test('a PIN set up on a phone binds to the Keystore and puts nothing in the WebView', async () => {
  const w = world();
  const dataKey = await setupJournalPin('1234', w.phone);

  expect(w.stored()?.pinBinding).toBe('keystore');
  expect(w.phoneHoldsAKey()).toBe(true);
  expect(w.webViewHoldsAKey()).toBe(false);
  expect(await unlockJournalPin('1234', w.phone)).toEqual(dataKey);
});

test('a phone journal is not openable by the WebView key alone: unlocking without the alias fails as a missing device key', async () => {
  const w = world();
  await setupJournalPin('1234', w.phone);
  await w.phone.binding.remove();

  await expect(unlockJournalPin('1234', w.phone)).rejects.toThrow(DeviceBindingUnavailableError);
});

test('a PIN journal from before this ticket opens on this build and comes out bound to the Keystore', async () => {
  const w = world();
  // What the older Android build wrote: bound to the WebView's key store.
  const dataKey = await setupJournalPin('1234', w.web);
  expect(w.stored()?.pinBinding).toBe('browser');

  expect(await unlockJournalPin('1234', w.phone)).toEqual(dataKey);

  expect(w.stored()?.pinBinding).toBe('keystore');
  expect(w.webViewHoldsAKey()).toBe(false);
  // And it keeps opening, now through the alias rather than the migration.
  expect(await unlockJournalPin('1234', w.phone)).toEqual(dataKey);
});

test('a wrong PIN against a journal from before this ticket writes nothing and leaves the old key opening it', async () => {
  const w = world();
  const dataKey = await setupJournalPin('1234', w.web);
  const before = w.stored();

  await expect(unlockJournalPin('4321', w.phone)).rejects.toThrow(DecryptionFailedError);

  expect(w.stored()).toBe(before);
  expect(w.webViewHoldsAKey()).toBe(true);
  expect(await unlockJournalPin('1234', w.phone)).toEqual(dataKey);
});

/* The interruption the ticket asks about. The new key is minted before the
   keystore that uses it can be written, so the window between the two is the
   one that has to leave a journal somebody can open - under the old binding,
   because that is the one the file on disk still names. */
test('a process death between minting the new key and writing the keystore leaves the journal opening under the old one', async () => {
  const w = world();
  const dataKey = await setupJournalPin('1234', w.web);
  const before = w.stored();

  w.failNextWrite();
  await expect(unlockJournalPin('1234', w.phone)).rejects.toThrow('the process died before the keystore landed');

  expect(w.stored()).toBe(before);
  expect(w.stored()?.pinBinding).toBe('browser');
  expect(w.webViewHoldsAKey()).toBe(true);
  // The next attempt finishes what that one started.
  expect(await unlockJournalPin('1234', w.phone)).toEqual(dataKey);
  expect(w.stored()?.pinBinding).toBe('keystore');
});

/* The other half of that window: the keystore lands and the old key does not
   go, because the removal failed or the process died first. The journal opens
   under the new binding either way - a tidying failure must not deny somebody
   their journal - and the key still sitting in the WebView is swept by the
   next unlock, so a phone does not keep one indefinitely. */
test('a WebView key left behind by an interrupted migration is cleared by the next unlock', async () => {
  const w = world();
  const dataKey = await setupJournalPin('1234', w.web);
  const interrupted: PinPorts = {
    ...w.phone,
    legacyBinding: {
      ...w.phone.legacyBinding!,
      remove: async () => {
        throw new Error('the process died before the old key went');
      }
    }
  };

  expect(await unlockJournalPin('1234', interrupted)).toEqual(dataKey);
  expect(w.stored()?.pinBinding).toBe('keystore');
  expect(w.webViewHoldsAKey()).toBe(true);

  expect(await unlockJournalPin('1234', w.phone)).toEqual(dataKey);
  expect(w.webViewHoldsAKey()).toBe(false);
});

test('changing a PIN on a phone journal reuses the alias rather than minting a second key', async () => {
  const w = world();
  const dataKey = await setupJournalPin('1234', w.phone);
  await changeJournalPin('1234', '5678', w.phone);

  expect(w.mints()).toBe(1);
  expect(w.stored()?.pinBinding).toBe('keystore');
  expect(await unlockJournalPin('5678', w.phone)).toEqual(dataKey);
  await expect(unlockJournalPin('1234', w.phone)).rejects.toThrow(DecryptionFailedError);
});

test('changing the PIN of a journal from before this ticket rebinds it to the Keystore on the way', async () => {
  const w = world();
  const dataKey = await setupJournalPin('1234', w.web);
  await changeJournalPin('1234', '5678', w.phone);

  expect(w.stored()?.pinBinding).toBe('keystore');
  expect(w.webViewHoldsAKey()).toBe(false);
  expect(await unlockJournalPin('5678', w.phone)).toEqual(dataKey);
});

test('a wrong current PIN writes nothing and rebinds nothing', async () => {
  const w = world();
  await setupJournalPin('1234', w.web);
  const before = w.stored();

  await expect(changeJournalPin('9999', '5678', w.phone)).rejects.toThrow(DecryptionFailedError);
  expect(w.stored()).toBe(before);
  expect(await unlockJournalPin('1234', w.phone)).toBeTruthy();
});

/* A reset, and a move out of PIN mode. A key left behind on either path is
   key material outliving the journal it belonged to, and on a phone there
   are two places it could be. */
test('clearing the bindings takes both places a phone could be holding one', async () => {
  const w = world();
  await setupJournalPin('1234', w.web);
  await w.phone.binding.create();

  await removeEveryPinBinding(w.phone);

  expect(w.webViewHoldsAKey()).toBe(false);
  expect(w.phoneHoldsAKey()).toBe(false);
});

test('one binding that will not clear does not keep the other, and the failure is still raised', async () => {
  const w = world();
  await setupJournalPin('1234', w.web);
  await w.phone.binding.create();
  const stubborn: PinPorts = {
    ...w.phone,
    binding: { ...w.phone.binding, remove: async () => Promise.reject(new Error('the keystore would not delete the alias')) }
  };

  await expect(removeEveryPinBinding(stubborn)).rejects.toThrow('the keystore would not delete the alias');
  expect(w.webViewHoldsAKey()).toBe(false);
});

/* The web keeps one binding and gains no second one. Reaching a keystore
   that names the phone's alias there is a wiring mistake, not a wrong PIN,
   and it has to say so rather than deriving from a key it does not have. */
test('a keystore bound to a Keystore alias fails by name on a platform with no alias', async () => {
  const w = world();
  await setupJournalPin('1234', w.web);
  await w.web.writeKeystore({ ...w.stored()!, pinBinding: 'keystore' });

  await expect(unlockJournalPin('1234', w.web)).rejects.toThrow(DeviceBindingUnavailableError);
});

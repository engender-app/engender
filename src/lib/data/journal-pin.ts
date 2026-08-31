/* PIN mode's flows (ticket 53), the sibling of journal-passphrase.ts and the
   same shape: the keystore math plus where the metadata lives, so boot and
   the settings screen share one spelling of setup, unlock and change.

   The one difference from a passphrase is where the secret comes from. A
   passphrase is what the person typed; a PIN is what they typed bound to a
   key that cannot leave this browser (device-secret.ts). That binding is
   what makes four digits defensible, so it is not optional and not a
   fallback - every function here goes through it.

   Unlike journal-passphrase.ts this module takes its ports rather than
   reaching for OPFS and IndexedDB directly. Two moving parts whose
   interaction *is* the security claim - a keystore file and a device key -
   is worth being able to test on the Node tier against both of them.

   The returned data keys live in memory and nowhere else, exactly as
   ADR-0018 requires. */

import { createKeystore, rewrapKeystore, unlockKeystore, wrapDataKeyWithSecret, KeystoreUnreadableError, type KeystoreMetadata } from '../crypto/keystore';
import { PIN_LENGTH } from '../crypto/params';
import { readKeystoreFile, writeKeystoreFile } from './keystore-file';
import { browserKeySlot, type DeviceKeySlot } from './device-bound-journal';
import { combinePinWithDevice, createDeviceBindingSecret, readDeviceBindingSecret, PIN_BINDING_SLOT } from './device-secret';

/** Where a PIN keystore's two halves live. Defaults to the real browser
    bindings; the tests hand in memory. */
export interface PinPorts {
  slot: DeviceKeySlot;
  readKeystore(): Promise<KeystoreMetadata | null>;
  writeKeystore(metadata: KeystoreMetadata): Promise<void>;
}

const browserPorts = (): PinPorts => ({
  slot: browserKeySlot(PIN_BINDING_SLOT),
  readKeystore: readKeystoreFile,
  writeKeystore: writeKeystoreFile
});

/** Exactly four digits (crypto/params.ts states why four). A floor and a
    ceiling both, because the pad collects a fixed count and submits itself on
    the last one. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^[0-9]{${PIN_LENGTH}}$`).test(pin);
}

/* Enforced here rather than trusted from the pad. The pad does guarantee the
   shape today, which made a UI-side check unreachable - but the shape is what
   the whole five-second figure is computed from, so the guarantee belongs
   next to the wrap rather than in whichever component happened to collect the
   digits. A three-digit "PIN" wrapping a journal is 1000 candidates and copy
   that lies about it. */
function requireValidPin(pin: string): string {
  if (!isValidPin(pin)) {
    throw new KeystoreUnreadableError(`a PIN is exactly ${PIN_LENGTH} digits, and this one is not`);
  }
  return pin;
}

/** First run: mints the binding key and the data key, wraps one under the
    other plus the PIN, persists the metadata, hands back the key for this
    session. */
export async function setupJournalPin(pin: string, ports: PinPorts = browserPorts()): Promise<Uint8Array<ArrayBuffer>> {
  const secret = combinePinWithDevice(requireValidPin(pin), await createDeviceBindingSecret(ports.slot));
  const { metadata, dataKey } = await createKeystore(secret, undefined, 'pin');
  await ports.writeKeystore(metadata);
  return dataKey;
}

/** Moves a journal that is already open into PIN mode - the Settings change,
    where the data key is in memory. Mints a fresh binding key, so the
    previous mode's leftovers cannot open what this writes.

    Refuses a journal already in PIN mode, and the refusal is the point rather
    than tidiness. Minting replaces the binding key before the new keystore is
    written, and for every other starting mode that is safe: the keystore on
    disk does not use the binding key, so it keeps opening if this is
    interrupted. From PIN mode it is not safe - the key being replaced is the
    only one that opens the keystore still on disk, so an interruption between
    the two would leave a journal nothing can open. Changing a PIN without
    changing the device is changeJournalPin, which reuses the key. */
export async function addJournalPin(
  dataKey: Uint8Array<ArrayBuffer>,
  pin: string,
  ports: PinPorts = browserPorts()
): Promise<void> {
  requireValidPin(pin);
  if ((await ports.readKeystore())?.secretSource === 'pin') {
    throw new KeystoreUnreadableError('this journal is already in PIN mode - use changeJournalPin to change the PIN');
  }
  const secret = combinePinWithDevice(pin, await createDeviceBindingSecret(ports.slot));
  await ports.writeKeystore(await wrapDataKeyWithSecret(dataKey, secret, undefined, 'pin'));
}

/** Every later run. Throws DecryptionFailedError on a wrong PIN and
    DeviceBindingUnavailableError when this browser no longer holds the key -
    two different sentences on the gate, because only one of them is worth
    retyping for. */
export async function unlockJournalPin(pin: string, ports: PinPorts = browserPorts()): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await requirePinKeystore(ports);
  const secret = combinePinWithDevice(pin, await readDeviceBindingSecret(ports.slot));
  return unlockKeystore(metadata, secret);
}

/** Rewraps the same data key under a new PIN (the journal is never
    re-encrypted). Throws before anything is written when the current PIN is
    wrong. The binding key is deliberately kept rather than re-minted: this
    is a change of PIN, not a change of device. */
export async function changeJournalPin(
  current: string,
  next: string,
  ports: PinPorts = browserPorts()
): Promise<void> {
  requireValidPin(next);
  const metadata = await requirePinKeystore(ports);
  const deviceSecret = await readDeviceBindingSecret(ports.slot);
  await ports.writeKeystore(
    await rewrapKeystore(
      metadata,
      combinePinWithDevice(current, deviceSecret),
      combinePinWithDevice(next, deviceSecret),
      undefined,
      'pin'
    )
  );
}

/* Boot decides which gate to draw from the keystore's own recorded source,
   so reaching here with anything but a PIN keystore is a wiring mistake
   rather than a wrong PIN. Named as one: deriving a passphrase keystore's
   key under the PIN profile would fail as "wrong PIN" and send somebody
   retyping four digits at a journal that wants a sentence. */
async function requirePinKeystore(ports: PinPorts): Promise<KeystoreMetadata> {
  const metadata = await ports.readKeystore();
  if (metadata === null) {
    throw new KeystoreUnreadableError('there is no keystore to unlock - boot decides setup vs unlock before calling this');
  }
  if (metadata.secretSource !== 'pin') {
    throw new KeystoreUnreadableError(`this journal is unlocked by ${metadata.secretSource}, not by a PIN`);
  }
  return metadata;
}

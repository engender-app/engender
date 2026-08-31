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

   Since ticket sec-02-06 there are two key stores a PIN can be bound to and
   the ports say which: the browser's own on the web, and Android Keystore on
   a phone, where the key is then not in the app's directory for a copy of it
   to take. Which one wrapped a given keystore is recorded in the keystore
   (`pinBinding`), not inferred from the platform, because an Android journal
   made before that ticket is bound to the WebView's store until the first
   correct PIN rewraps it - and inferring would derive the secret from a key
   that never wrapped the file and report a correct PIN as wrong.

   The returned data keys live in memory and nowhere else, exactly as
   ADR-0018 requires. */

import {
  createKeystore,
  rewrapKeystore,
  unlockKeystore,
  wrapDataKeyWithSecret,
  KeystoreUnreadableError,
  type KeystoreMetadata,
  type PinBinding
} from '../crypto/keystore';
import { PIN_LENGTH } from '../crypto/params';
import { isAndroid } from '../platform';
import { readKeystoreFile, writeKeystoreFile } from './keystore-file';
import { browserKeySlot } from './device-bound-journal';
import {
  browserDeviceBinding,
  combinePinWithDevice,
  keystoreDeviceBinding,
  DeviceBindingUnavailableError,
  PIN_BINDING_SLOT,
  type DeviceBinding
} from './device-secret';
import { androidPinBinding } from './pin-binding-bridge';

/** Where a PIN keystore's two halves live. Defaults to this platform's own;
    the tests hand in memory. */
export interface PinPorts {
  /** The key store a wrap written now binds to. */
  binding: DeviceBinding;
  /** Its name, which goes into the keystore beside the wrap so a later
      unlock knows which key produced the secret it needs. */
  bindingKind: PinBinding;
  /** What an older build on this platform bound a PIN to, kept only so such
      a journal can be opened once and rewrapped under the binding above.
      Android only: the web has only ever had the one key store, and there is
      nothing to move its key to. */
  legacyBinding?: DeviceBinding;
  readKeystore(): Promise<KeystoreMetadata | null>;
  writeKeystore(metadata: KeystoreMetadata): Promise<void>;
}

const platformPorts = (): PinPorts =>
  isAndroid()
    ? {
        binding: keystoreDeviceBinding(androidPinBinding),
        bindingKind: 'keystore',
        legacyBinding: browserDeviceBinding(browserKeySlot(PIN_BINDING_SLOT)),
        readKeystore: readKeystoreFile,
        writeKeystore: writeKeystoreFile
      }
    : {
        binding: browserDeviceBinding(browserKeySlot(PIN_BINDING_SLOT)),
        bindingKind: 'browser',
        readKeystore: readKeystoreFile,
        writeKeystore: writeKeystoreFile
      };

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
export async function setupJournalPin(pin: string, ports: PinPorts = platformPorts()): Promise<Uint8Array<ArrayBuffer>> {
  const secret = combinePinWithDevice(requireValidPin(pin), await ports.binding.create());
  const { metadata, dataKey } = await createKeystore(secret, undefined, 'pin');
  await ports.writeKeystore(named(metadata, ports));
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
  ports: PinPorts = platformPorts()
): Promise<void> {
  requireValidPin(pin);
  if ((await ports.readKeystore())?.secretSource === 'pin') {
    throw new KeystoreUnreadableError('this journal is already in PIN mode - use changeJournalPin to change the PIN');
  }
  const secret = combinePinWithDevice(pin, await ports.binding.create());
  await ports.writeKeystore(named(await wrapDataKeyWithSecret(dataKey, secret, undefined, 'pin'), ports));
}

/** Every later run. Throws DecryptionFailedError on a wrong PIN and
    DeviceBindingUnavailableError when this browser no longer holds the key -
    two different sentences on the gate, because only one of them is worth
    retyping for. */
export async function unlockJournalPin(pin: string, ports: PinPorts = platformPorts()): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await requirePinKeystore(ports);
  const wrappedUnder = metadata.pinBinding ?? 'browser';
  if (wrappedUnder !== ports.bindingKind) return rebindOnUnlock(metadata, pin, ports);

  const dataKey = await unlockKeystore(metadata, combinePinWithDevice(pin, await ports.binding.read()));
  /* A migration that wrote its keystore and then lost the process before
     clearing the old key leaves one behind, and on a phone the whole point
     of this ticket is that no PIN key sits in the WebView's store. It opens
     nothing now, so this is tidying rather than repair - but tidying that
     nothing else would ever do. */
  await forgetLegacyBinding(ports);
  return dataKey;
}

/** An Android PIN journal from before ticket sec-02-06, rewrapped under the
    phone's Keystore the first time the right PIN opens it.

    Write then clear, which is the order every other rewrap in the app uses
    and here is the crash safety. Minting the new key touches nothing that
    opens the keystore on disk - that is the old key, and it is untouched
    until the write lands - so an interruption before the write leaves a
    journal that opens under the old binding, and one after it leaves a
    journal that opens under the new one. Never neither. */
async function rebindOnUnlock(
  metadata: KeystoreMetadata,
  pin: string,
  ports: PinPorts
): Promise<Uint8Array<ArrayBuffer>> {
  /* Unwrapped under the old binding first, so a wrong PIN throws with the
     keystore on disk exactly as it was and the old key still the one that
     opens it. */
  const dataKey = await unlockKeystore(metadata, combinePinWithDevice(pin, await legacyBinding(metadata, ports).read()));
  const secret = combinePinWithDevice(pin, await ports.binding.create());
  await ports.writeKeystore(named(await wrapDataKeyWithSecret(dataKey, secret, undefined, 'pin'), ports));
  await forgetLegacyBinding(ports);
  return dataKey;
}

/** Rewraps the same data key under a new PIN (the journal is never
    re-encrypted). Throws before anything is written when the current PIN is
    wrong. The binding key is deliberately kept rather than re-minted: this
    is a change of PIN, not a change of device. */
export async function changeJournalPin(
  current: string,
  next: string,
  ports: PinPorts = platformPorts()
): Promise<void> {
  requireValidPin(next);
  const metadata = await requirePinKeystore(ports);
  const rebinding = (metadata.pinBinding ?? 'browser') !== ports.bindingKind;

  const currentDevice = rebinding
    ? await legacyBinding(metadata, ports).read()
    : await ports.binding.read();
  /* Minting before the current PIN has been checked, on the rebinding path
     only. The keystore on disk still names the old binding, so the new key
     opens nothing until the write below lands and a wrong PIN leaves the
     journal exactly as it was; doing it the other way round would mean
     deriving the same wrap twice. */
  const nextDevice = rebinding ? await ports.binding.create() : currentDevice;

  await ports.writeKeystore(
    named(
      await rewrapKeystore(
        metadata,
        combinePinWithDevice(current, currentDevice),
        combinePinWithDevice(next, nextDevice),
        undefined,
        'pin'
      ),
      ports
    )
  );
  if (rebinding) await forgetLegacyBinding(ports);
}

/** Takes every key a PIN could be bound to on this platform: the one this
    build binds to, and on Android the WebView slot an older build used. The
    reset calls it, and so does a move out of PIN mode - a key left behind on
    either path is key material outliving the journal it belonged to.

    Every binding is tried even when an earlier one throws, for the reason
    `DeviceStores.wipe` states on the native side: the first failure used to
    be the last thing that ran. The first failure is what is raised, with any
    later one attached to it. */
export async function removeEveryPinBinding(ports: PinPorts = platformPorts()): Promise<void> {
  let failure: unknown = null;
  for (const binding of [ports.binding, ports.legacyBinding]) {
    if (binding === undefined) continue;
    try {
      await binding.remove();
    } catch (error) {
      if (failure === null) failure = error;
      else console.warn('a second PIN binding key would not go either', error);
    }
  }
  if (failure !== null) throw failure;
}

/** The keystore, with the binding it was wrapped under named in it.
    Attached here rather than by `wrap`, which stays blind to where a secret
    came from the same way it is for biometric mode's handle. */
function named(metadata: KeystoreMetadata, ports: PinPorts): KeystoreMetadata {
  return { ...metadata, pinBinding: ports.bindingKind };
}

/** The binding a keystore this platform did not write was wrapped under.
    Absent means a keystore from a platform this one is not: openable by
    neither key here, and said so by name rather than derived from the wrong
    one and reported as a wrong PIN. */
function legacyBinding(metadata: KeystoreMetadata, ports: PinPorts): DeviceBinding {
  if (ports.legacyBinding === undefined) {
    throw new DeviceBindingUnavailableError(
      `this journal's PIN is bound to a key store this platform does not have (${metadata.pinBinding ?? 'browser'})`
    );
  }
  return ports.legacyBinding;
}

/* Warned rather than raised: by the time this runs the journal is open under
   a key that works, and refusing somebody their journal over a key that
   opens nothing would be the wrong trade. The unlock above sweeps whatever
   this leaves. */
async function forgetLegacyBinding(ports: PinPorts): Promise<void> {
  await ports.legacyBinding?.remove().catch((error) => {
    console.warn('could not clear the key an older build bound this PIN to', error);
  });
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

/* PIN setup, unlock and change share keystore operations. Every PIN is
   bound to a device key. Inject keystore and device-secret ports so Node
   tests can cover both parts.

   Use the browser key on web and Android Keystore on Android. Read the
   binding from pinBinding; earlier Android journals still use the WebView
   key until successful PIN entry rewraps them. Platform inference would
   reject a valid PIN on those journals. Data keys stay in memory
   (ADR-0018). */

import { authenticateCredentials, changeCredentials } from './credential-ownership';
import { withoutPendingRecoveryKeyOwned } from './recovery-key';
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
import { initializeJournal, journalAccessExists } from './journal-initialization';
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
import { androidPinAttempts } from '../lock/lock-timing-bridge';

/** Where a PIN keystore's two halves live. Defaults to this platform's own;
    the tests hand in memory. */
/* PinPorts stays exported only for its own test. */
export interface PinPorts {
  journalExists(): Promise<boolean>;
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
  writeKeystore(metadata: KeystoreMetadata, current?: () => void): Promise<void>;
  /** Runs the write of a changed PIN with any recovery key nobody confirmed taken away.
      Optional so the tests' in-memory ports need not carry a recovery store. */
  withoutPendingRecoveryKey?<T>(work: (doNotRestorePending: () => void) => Promise<T>): Promise<T>;
  /** Android admits durably before derivation; web counts at its gate. */
  attempts?: {
    begin(): Promise<string>;
    finish(token: string, successful: boolean): Promise<void>;
  };
}

const keystoreFile = {
  journalExists: journalAccessExists,
  readKeystore: readKeystoreFile,
  writeKeystore: writeKeystoreFile,
  withoutPendingRecoveryKey: <T,>(work: (doNotRestorePending: () => void) => Promise<T>) => withoutPendingRecoveryKeyOwned(work)
};

const platformPorts = (): PinPorts =>
  isAndroid()
    ? {
        binding: keystoreDeviceBinding(androidPinBinding),
        bindingKind: 'keystore',
        legacyBinding: browserDeviceBinding(browserKeySlot(PIN_BINDING_SLOT)),
        attempts: androidPinAttempts,
        ...keystoreFile
      }
    : {
        binding: browserDeviceBinding(browserKeySlot(PIN_BINDING_SLOT)),
        bindingKind: 'browser',
        ...keystoreFile
      };

/** Exactly four digits (crypto/params.ts states why four). A floor and a
    ceiling both, because the pad collects a fixed count and submits itself on
    the last one. */
/* isValidPin stays exported only for its own test. */
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
  return initializeJournal(async () => {
    const secret = combinePinWithDevice(requireValidPin(pin), await ports.binding.create());
    const { metadata, dataKey } = await createKeystore(secret, undefined, 'pin');
    await ports.writeKeystore(bindingNamed(metadata, ports));
    return dataKey;
  }, () => ports.journalExists());
}

/** Moves a journal that is already open into PIN mode - the Settings change,
    where the data key is in memory. Mints a fresh binding key, so the
    previous mode's leftovers cannot open what this writes.

    A retry of the same PIN and data key keeps the published wrap unchanged.
    Any other PIN journal refuses. Minting replaces the binding key before
    the new keystore is written, and for every other starting mode that is
    safe: the keystore on
    disk does not use the binding key, so it keeps opening if this is
    interrupted. From PIN mode it is not safe - the key being replaced is the
    only one that opens the keystore still on disk, so an interruption between
    the two would leave a journal nothing can open. Changing a PIN without
    changing the device is changeJournalPin, which reuses the key.
    The caller owns credential mutation through old-mode cleanup. */
export async function addJournalPin(
  dataKey: Uint8Array<ArrayBuffer>,
  pin: string,
  ports: PinPorts = platformPorts(),
  current: () => void = () => {},
  beforeCredentialWrite: () => void = () => {}
): Promise<void> {
  current();
  requireValidPin(pin);
  const existing = await ports.readKeystore();
  if (existing?.secretSource === 'pin') {
    const binding = (existing.pinBinding ?? 'browser') === ports.bindingKind
      ? ports.binding : requireLegacyBinding(existing, ports);
    const opened = await unlockKeystore(existing, combinePinWithDevice(pin, await binding.read()));
    try {
      if (opened.length !== dataKey.length || !opened.every((byte, index) => byte === dataKey[index])) {
        throw new KeystoreUnreadableError('the published PIN wrap belongs to a different journal key');
      }
      return;
    } finally { opened.fill(0); }
  }
  current();
  const secret = combinePinWithDevice(pin, await ports.binding.create());
  const metadata = bindingNamed(await wrapDataKeyWithSecret(dataKey, secret, undefined, 'pin'), ports);
  current();
  beforeCredentialWrite();
  await ports.writeKeystore(metadata, current);
}

/** Every later run. Throws DecryptionFailedError on a wrong PIN and
    DeviceBindingUnavailableError when this browser no longer holds the key -
    two different sentences on the gate, because only one of them is worth
    retyping for. */
export async function unlockJournalPin(
  pin: string,
  ports: PinPorts = platformPorts(),
  current: () => void = () => {}
): Promise<Uint8Array<ArrayBuffer>> {
  return authenticateCredentials(async () => {
    current();
    return unlockPin(pin, ports, current);
  });
}

/** A fresh Settings check uses the same attempt accounting without migrating
    a binding or changing any credential as a side effect of authentication. */
export async function verifyJournalPin(
  pin: string,
  current: () => void,
  ports: PinPorts = platformPorts()
): Promise<Uint8Array<ArrayBuffer>> {
  return authenticateCredentials(() => { current(); return unlockPin(pin, ports, current, false); });
}

async function unlockPin(pin: string, ports: PinPorts, current: () => void, migrate = true): Promise<Uint8Array<ArrayBuffer>> {
  const metadata = await requirePinKeystore(ports);
  const wrappedUnder = metadata.pinBinding ?? 'browser';
  const rebinding = wrappedUnder !== ports.bindingKind;
  const binding = rebinding ? requireLegacyBinding(metadata, ports) : ports.binding;
  const secret = combinePinWithDevice(requireValidPin(pin), await binding.read());
  current(); // Metadata, binding and cancellation refusals do not admit a guess.
  const token = await ports.attempts?.begin();
  let dataKey: Uint8Array<ArrayBuffer> | undefined;
  let settled = false;
  try {
    dataKey = await unlockKeystore(metadata, secret);
    current();
    if (migrate && rebinding) await rebindOnUnlock(dataKey, pin, ports);
    if (migrate) await forgetLegacyBinding(ports);
    current();
    if (token !== undefined) {
      settled = true;
      await ports.attempts!.finish(token, true);
    }
    current();
    return dataKey;
  } catch (error) {
    dataKey?.fill(0);
    // An interrupted or cancelled derivation remains accounted for. A failed
    // durable settlement must not escape as an acknowledged wrong PIN.
    if (token !== undefined && !settled) await ports.attempts!.finish(token, false);
    throw error;
  }
}

/** An Android PIN journal from, rewrapped under the phone's Keystore the first time the
    right PIN opens it.

    Write then clear, which is the order every other rewrap in the app uses and here is the
    crash safety. Minting the new key touches nothing that opens the keystore on disk - that
    is the old key, and it is untouched until the write lands - so an interruption before
    the write leaves a journal that opens under the old binding, and one after it leaves a
    journal that opens under the new one. Never neither. */
async function rebindOnUnlock(
  dataKey: Uint8Array<ArrayBuffer>,
  pin: string,
  ports: PinPorts
): Promise<void> {
  const secret = combinePinWithDevice(pin, await ports.binding.create());
  await ports.writeKeystore(bindingNamed(await wrapDataKeyWithSecret(dataKey, secret, undefined, 'pin'), ports));
}

/** Rewraps the same data key under a new PIN (the journal is never
    re-encrypted). Throws before anything is written when the current PIN is
    wrong. The binding key is deliberately kept rather than re-minted: this
    is a change of PIN, not a change of device. The one exception is a journal
    still on an older build's binding, where changing the key is the point and
    this does what `rebindOnUnlock` does. */
export async function changeJournalPin(
  current: string,
  next: string,
  ports: PinPorts = platformPorts()
): Promise<void> {
  return changeCredentials(async () => {
    requireValidPin(next);
    const metadata = await requirePinKeystore(ports);
    const rebinding = (metadata.pinBinding ?? 'browser') !== ports.bindingKind;

    const currentDevice = rebinding
      ? await requireLegacyBinding(metadata, ports).read()
      : await ports.binding.read();
    /* Minting before the current PIN has been checked, on the rebinding path
       only. The keystore on disk still names the old binding, so the new key
       opens nothing until the write below lands and a wrong PIN leaves the
       journal exactly as it was; doing it the other way round would mean
       deriving the same wrap twice. */
    const nextDevice = rebinding ? await ports.binding.create() : currentDevice;

    const rewrapped = bindingNamed(
      await rewrapKeystore(
        metadata,
        combinePinWithDevice(current, currentDevice),
        combinePinWithDevice(next, nextDevice),
        undefined,
        'pin'
      ),
      ports
    );
    /* After the current PIN is proven: a wrong PIN touches nothing, and a recovery key
       nobody confirmed does not outlive the PIN it was made under. */
    const write = (doNotRestorePending: () => void = () => {}) => {
      doNotRestorePending();
      return ports.writeKeystore(rewrapped);
    };
    await (ports.withoutPendingRecoveryKey ? ports.withoutPendingRecoveryKey(write) : write());
    if (rebinding) await forgetLegacyBinding(ports);
  });
}

/** Takes every key a PIN could be bound to on this platform: the one this
    build binds to, and on Android the WebView slot an older build used. The
    reset calls it, and so does a move out of PIN mode - a key left behind on
    either path is key material outliving the journal it belonged to.

    The reset or mode-change caller owns credential mutation through this cleanup.
    Every binding is tried even when an earlier one throws, for the reason
    `DeviceStores.wipe` states on the native side: the first failure used to
    be the last thing that ran. The first failure is the one raised, since it
    is the one a caller can say something about; a second is logged, because
    an Error here has nowhere to carry it. */
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
function bindingNamed(metadata: KeystoreMetadata, ports: PinPorts): KeystoreMetadata {
  return { ...metadata, pinBinding: ports.bindingKind };
}

/** The binding a keystore this platform did not write was wrapped under.
    Absent means a keystore from a platform this one is not: openable by
    neither key here, and said so by name rather than derived from the wrong
    one and reported as a wrong PIN. */
function requireLegacyBinding(metadata: KeystoreMetadata, ports: PinPorts): DeviceBinding {
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

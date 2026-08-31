/* The device half of PIN mode's secret (ADR-0041, ticket 53).

   Four digits is 10,000 candidates. No KDF cost closes a gap that small, and
   a growing-delay throttle - which is what protected the retired app-lock
   PIN - protects nothing here, because the attack on a wrapping key is
   offline: copy keystore.json, walk away, and guess on your own hardware
   where none of this app's code runs. That is why ADR-0018 and ADR-0014 said
   a PIN could not be the encryption key.

   What makes four digits defensible is that the PIN is not the whole secret.
   A non-extractable HMAC key is minted in this browser's IndexedDB and never
   leaves it; signing one fixed label with it yields a stable, high-entropy
   string, and the secret fed to the KDF is that string with the PIN. So a
   copied keystore file cannot be guessed at at all without the device, and
   the 10,000 candidates only ever matter to somebody who already has the
   device and runs their own code on it.

   HMAC rather than AES-GCM on purpose. Deriving a *deterministic* value from
   a non-extractable AES key means encrypting a fixed plaintext under a fixed
   nonce, which is safe here (one plaintext, one nonce, so no two messages
   ever share one) but is exactly the shape a reader has to stop and check. A
   signature over a label has no nonce and no reuse question.

   **Where the key lives, per platform (ticket sec-02-06).** On the web it is
   the browser's key store and there is nothing to move it to: non-extractable
   keeps it away from JavaScript, but the browser's own IndexedDB files are on
   disk next to `keystore.json`, so a copy of the profile takes both halves of
   the secret and lands the copier in the 10,000-candidate bucket the setup
   copy quotes five seconds for. On Android it is a Keystore alias, whose key
   material is not in the app's directory at all - so the same copy yields
   neither half, and PIN mode there is as strong against a forensic copy as
   device-bound mode is. Both are the same mechanism over a different key
   store, which is why this module takes a binding rather than reaching for
   one, and why what wrapped a given keystore is recorded in it
   (`crypto/keystore.ts`'s `pinBinding`) rather than inferred from the
   platform.

   Either way the trade device-bound mode already makes applies, and the setup
   copy says so: the key cannot leave the device, so losing the device or the
   profile loses the journal. An archive export is the only thing that
   survives it. */

import { browserKeySlot, type DeviceKeySlot } from './device-bound-journal.ts';

/** Exported so journal-pin.ts opens the same slot rather than repeating the
    name: two spellings of one storage key diverge silently, and the failure
    is a journal nobody can open. */
export const PIN_BINDING_SLOT = 'journal-pin-binding';

/** Signed to produce the secret. Versioned, so a later scheme can derive a
    different value from the same key rather than needing a second key. */
const BINDING_LABEL = 'gender-diary/pin-binding/v1';

/** Separates the PIN from the device secret. A character no PIN contains, so
    no pair of (PIN, secret) can run together into another pair's string - a
    "12" + "34xyz" colliding with "1234" + "xyz" would let one PIN open a
    journal that was set up under a different one. */
const SEPARATOR = ':';

/** Raised when the device key this journal's PIN was bound to is gone - a
    cleared browser profile, an evicted origin, a different browser.
    Deliberately not a decryption failure: the PIN is not wrong, and saying
    it is would have somebody retyping a correct PIN for ever. */
export class DeviceBindingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceBindingUnavailableError';
  }
}

const defaultSlot = (): DeviceKeySlot => browserKeySlot(PIN_BINDING_SLOT);

/** The device half of a PIN, wherever this platform holds the key that
    yields it. Two implementations below, and the flows in journal-pin.ts
    never learn which one they have - what differs is only where the key is,
    which is a property of the platform and not of the scheme. */
export interface DeviceBinding {
  /** First run of PIN mode: mints the key and returns the secret it yields.
      Overwrites any existing key, which is correct - the caller is about to
      write a keystore wrapped under the new secret, and a leftover key from
      an abandoned attempt must not outlive it. */
  create(): Promise<string>;
  /** Every later unlock. Throws rather than minting: a fresh key would
      derive a different secret and present as an endlessly wrong PIN. */
  read(): Promise<string>;
  remove(): Promise<void>;
}

/** The web's binding, and an Android journal made before sec-02-06. A
    non-extractable HMAC key in the browser's own key store. */
export function browserDeviceBinding(slot: DeviceKeySlot = defaultSlot()): DeviceBinding {
  return {
    async create() {
      const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      await slot.save(key);
      return sign(key);
    },
    async read() {
      const key = await slot.load();
      if (key === null) {
        throw new DeviceBindingUnavailableError('this browser no longer holds the device key this PIN was bound to');
      }
      return sign(key);
    },
    remove: () => slot.remove()
  };
}

/** What the Android plugin answers. The key itself never crosses the bridge
    and cannot: it is an Android Keystore alias, and the platform will not
    hand out its bytes to anything, this app included. What crosses is one
    signature over the label below, which is the same value the browser
    binding produces from its own key and is useless without the PIN. */
export interface PinBindingBridge {
  /** Mints the key under its alias, replacing anything already there, and
      signs the label with it. */
  create(options: { label: string }): Promise<{ secret: string }>;
  /** Signs the label with the key already under the alias. No secret when
      there is no such key: reading never mints, for the reason `read` above
      states. */
  read(options: { label: string }): Promise<{ secret?: string | null }>;
  /** The reset path, and a move out of PIN mode. */
  erase(): Promise<void>;
}

/** Android's binding: the key is in the platform keystore, so a copy of the
    app's directory contains neither half of the secret. */
export function keystoreDeviceBinding(bridge: PinBindingBridge): DeviceBinding {
  return {
    async create() {
      const { secret } = await bridge.create({ label: BINDING_LABEL });
      /* A bridge that answered without a signature has not bound anything,
         and taking it at its word would wrap a journal under `undefined`.
         Every other bridge in this app fails closed the same way
         (lock/android-key.ts's header states the rule). */
      if (!secret) throw new DeviceBindingUnavailableError('the phone did not bind a key to this PIN');
      return secret;
    },
    async read() {
      const { secret } = await bridge.read({ label: BINDING_LABEL });
      if (!secret) {
        throw new DeviceBindingUnavailableError('this phone no longer holds the device key this PIN was bound to');
      }
      return secret;
    },
    remove: () => bridge.erase()
  };
}

/** What actually reaches the KDF. */
export function combinePinWithDevice(pin: string, deviceSecret: string): string {
  return `${pin}${SEPARATOR}${deviceSecret}`;
}

async function sign(key: CryptoKey): Promise<string> {
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(BINDING_LABEL)));
  return btoa(String.fromCharCode(...signature));
}

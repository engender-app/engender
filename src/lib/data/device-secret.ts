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

   The same trade device-bound mode already makes applies, and the setup copy
   says so: the key is held by the browser rather than by hardware, and
   losing the profile loses the journal. An archive export is the only thing
   that survives it. */

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

/** First run of PIN mode: mints the binding key and returns the secret it
    yields. Overwrites any existing key, which is correct - the caller is
    about to write a keystore wrapped under the new secret, and a leftover
    key from an abandoned attempt must not outlive it. */
export async function createDeviceBindingSecret(slot: DeviceKeySlot = defaultSlot()): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  await slot.save(key);
  return sign(key);
}

/** Every later unlock. Throws rather than minting: a fresh key would derive
    a different secret and present as an endlessly wrong PIN. */
export async function readDeviceBindingSecret(slot: DeviceKeySlot = defaultSlot()): Promise<string> {
  const key = await slot.load();
  if (key === null) {
    throw new DeviceBindingUnavailableError('this browser no longer holds the device key this PIN was bound to');
  }
  return sign(key);
}

export async function removeDeviceBindingSecret(slot: DeviceKeySlot = defaultSlot()): Promise<void> {
  await slot.remove();
}

/** What actually reaches the KDF. */
export function combinePinWithDevice(pin: string, deviceSecret: string): string {
  return `${pin}${SEPARATOR}${deviceSecret}`;
}

async function sign(key: CryptoKey): Promise<string> {
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(BINDING_LABEL)));
  return btoa(String.fromCharCode(...signature));
}

/* Getting the Journal's data key out of Android Keystore (ticket 13,
   ADR-0018).

   On the web a passphrase unwraps the key (data/journal-passphrase.ts). On
   Android nobody types anything: the key is wrapped by a Keystore key that
   cannot be used until the platform says someone authenticated, so this
   module asks, and reads the answer.

   The reading is the whole job, and it is written to fail closed. A key
   comes back only when the platform said `authenticated` AND handed over 64
   hex characters; every other combination - including the ones a bridge bug
   would produce, like a success with no key attached - is a refusal with
   something to do next. `biometric-outcome.ts` owns that vocabulary.

   One state is not a biometric state and is kept out of it: a Keystore key
   is destroyed when the screen lock it was bound to is removed, and no
   retry brings it back. Calling that a failed finger would loop somebody
   round the prompt for ever, so it comes back as `invalidated` and the gate
   offers the reset instead. */

import { interpretAuthentication, type AuthenticationResult } from './biometric-outcome.ts';

/** What Android's own prompt says and asks for. The words come from the
    catalogue through here rather than being written in Java, so the dialog
    Android draws is in the language the app is in. */
export interface UnlockRequest {
  title: string;
  subtitle: string;
  /** The prompt's negative button, which Android requires unless the device
      credential is allowed - and forbids when it is. */
  cancel: string;
  /** The `deviceCredential` way forward, taken: authorize the unwrap with
      the device's PIN, pattern or password rather than with a finger. False
      on the first attempt, so an unavailable or unenrolled sensor is
      reported as itself instead of sliding past into a different check. */
  deviceCredential: boolean;
}

export interface KeystoreBridge {
  /** Whether this device already holds a wrapped data key - a first run
      against every later one. */
  status(): Promise<{ hasKey: boolean }>;
  /** First run. Mints a random data key, wraps it, and hands the key over
      without a prompt: the person is already here, and there is nothing yet
      to protect it from. `noDeviceCredential` when the device has no lock
      screen for the Keystore key to be bound to. */
  create(): Promise<{ outcome: 'created' | 'noDeviceCredential'; hexKey?: string }>;
  /** Every later run: the prompt, then the unwrap behind it. */
  unlock(request: UnlockRequest): Promise<{ outcome: string; hexKey?: string }>;
  /** The same prompt with no key behind it, for the app-lock screen reached
      mid-session, where the key is already in memory (ADR-0014). */
  confirm(request: UnlockRequest): Promise<{ outcome: string }>;
  /** The reset path (ADR-0014): the wrapped key goes with the Journal. */
  erase(): Promise<void>;
}

export type AndroidKeyResult =
  /** The Journal can be opened with this. */
  | { kind: 'key'; dataKey: Uint8Array<ArrayBuffer> }
  | AndroidKeyRefusal;

/** Everything that is not a key. This is the half the gate renders, and the
    half that is safe to keep in reactive state - the key itself stays in
    boot's own scope and never lands anywhere a screen can read it. */
export type AndroidKeyRefusal =
  /** Not this time. `authentication.wayForward` is what the gate offers. */
  | { kind: 'refused'; authentication: AuthenticationResult }
  /** The wrapped key is unusable for good; only a reset moves on. */
  | { kind: 'invalidated' };

/** 32 bytes as hex, and nothing else - the size ADR-0018's data key is and
    the only thing SQLCipher's raw-key open accepts. */
const KEY_HEX = /^[0-9a-f]{64}$/i;

export async function openAndroidDataKey(
  bridge: KeystoreBridge,
  request: UnlockRequest
): Promise<AndroidKeyResult> {
  const { hasKey } = await bridge.status();

  if (!hasKey) {
    const created = await bridge.create();
    return created.outcome === 'created'
      ? keyOrRefusal(created.hexKey)
      : { kind: 'refused', authentication: interpretAuthentication('noDeviceCredential') };
  }

  const { outcome, hexKey } = await bridge.unlock(request);
  if (outcome === 'keyInvalidated') return { kind: 'invalidated' };
  if (outcome !== 'authenticated') return { kind: 'refused', authentication: interpretAuthentication(outcome) };
  return keyOrRefusal(hexKey);
}

/** The app-lock screen's biometric key (ticket 17's gate, on Android). No
    data key is involved and none should be: by then the Journal is open and
    its key is in memory, and app lock is a casual-access layer rather than an
    encryption credential (ADR-0014). Only `authenticated` unlocks; everything
    else is a state the screen can name, with the PIN pad still there behind
    it either way. */
export async function confirmWithBiometrics(
  bridge: KeystoreBridge,
  request: UnlockRequest
): Promise<AuthenticationResult> {
  const { outcome } = await bridge.confirm(request);
  return interpretAuthentication(outcome);
}

/** The last gate before the key reaches SQLCipher. A missing or malformed
    key is reported as a plain failure - which is true, and leaves a retry
    on offer - rather than passed down to fail as a corrupt database. */
function keyOrRefusal(hexKey: string | undefined): AndroidKeyResult {
  if (!hexKey || !KEY_HEX.test(hexKey)) {
    return { kind: 'refused', authentication: interpretAuthentication('failed') };
  }
  return { kind: 'key', dataKey: fromHex(hexKey) };
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

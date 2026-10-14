import { changeCredentials, currentCredentials } from './credential-ownership';
import type { JournalAccessMode } from './journal-access-mode';
import { UnlockCancelledError } from '../lock/unlock-attempt';
import { BiometricUnavailableError } from './webauthn-prf';

/** A Settings operation owns its prompt and its eventual publication. No
 * reusable authentication result leaves this closure. Failed authentication
 * may be retried; admission to mutation spends the operation, even if writing fails. */
export function protectionChange<T>({ current, readCredential, authenticate, mutate }: {
  current(): void;
  readCredential(): Promise<string | null>;
  authenticate(secret: string, current: () => void): Promise<void>;
  mutate(current: () => void): Promise<T>;
}): (secret?: string, attemptCurrent?: () => void) => Promise<T> {
  const credentialsCurrent = currentCredentials();
  // Capture durable identity when the prompt opens, not when it answers.
  const captured = readCredential().then(
    credential => ({ credential, error: undefined }),
    error => ({ credential: null, error })
  );
  let spent = false;
  let pending = false;
  return async (secret = '', attemptCurrent = () => {}) => {
    const check = () => { current(); credentialsCurrent(); attemptCurrent(); };
    check();
    if (spent || pending) throw new UnlockCancelledError();
    pending = true;
    try {
      const { credential, error } = await captured;
      if (error !== undefined) throw error;
      check();
      if (credential !== await readCredential()) throw new UnlockCancelledError();
      check();
      await authenticate(secret, check);
      check();
      return await changeCredentials(async () => {
        check();
        if (credential !== await readCredential()) throw new UnlockCancelledError();
        check();
        spent = true;
        return mutate(check);
      });
    } finally { pending = false; }
  };
}

export interface ProtectionAuthentication {
  pin(secret: string, current: () => void): Promise<Uint8Array<ArrayBuffer>>;
  passphrase(secret: string): Promise<Uint8Array<ArrayBuffer>>;
  biometric(): Promise<Uint8Array<ArrayBuffer>>;
  recovery(secret: string): Promise<Uint8Array<ArrayBuffer>>;
  /** Always biometric-only. The adapter must not offer device-lock fallback. */
  androidBiometric(): Promise<string>;
}

/** Verify the protection that exists, never the credential being chosen next.
 * Derived keys are compared to this session and discarded, not adopted by boot. */
export async function verifyCurrentProtection(
  mode: JournalAccessMode,
  android: boolean,
  sessionKey: Uint8Array<ArrayBuffer>,
  secret: string,
  current: () => void,
  auth: ProtectionAuthentication
): Promise<void> {
  current();
  if (mode === 'device-bound' && !android) return;
  if (android && (mode === 'device-bound' || (mode === 'unlocked' && secret === ''))) {
    const outcome = await auth.androidBiometric();
    current();
    if (outcome === 'cancelled') throw new UnlockCancelledError();
    if (outcome !== 'authenticated') throw new BiometricUnavailableError('fresh biometric authentication was not successful');
    return;
  }
  let opened: Uint8Array<ArrayBuffer>;
  if (mode === 'unlocked' && android && secret !== '') opened = await auth.recovery(secret);
  else if (mode === 'pin') opened = await auth.pin(secret, current);
  else if (mode === 'passphrase') opened = await auth.passphrase(secret);
  else if (mode === 'biometric') opened = await auth.biometric();
  else throw new BiometricUnavailableError('this access mode has no approved authentication method');
  try {
    current();
    if (opened.length !== sessionKey.length || !opened.every((byte, index) => byte === sessionKey[index])) {
      throw new UnlockCancelledError();
    }
  } finally { opened.fill(0); }
}

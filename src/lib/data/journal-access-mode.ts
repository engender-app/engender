import { describeJournalState } from './conversion/conversion.ts';
import type { JournalSecretSource } from '../crypto/keystore.ts';

/* How this journal opens (ADR-0041, ticket 53).

   Three of the four modes ADR-0041 names are here. `'biometric'` - the web's
   WebAuthn PRF mode - is deliberately absent rather than declared and
   unreachable: ticket 55 owns it, and a mode with no mechanism behind it
   would put a dead arm in every branch that narrows over this union.

   The two secret-derived modes are one wrap system with two secret sources
   (crypto/keystore.ts): a keystore's own `secretSource` says which, so the
   mode is read off the keystore rather than tracked beside it. Android's
   device-bound mode is the one that is biometric-gated already - Keystore
   will not release the key until the platform confirms who is present - so
   the module names it as such rather than offering a second mechanism. */
export type JournalAccessMode = 'passphrase' | 'pin' | 'device-bound' | null;

/** Whether this mode has a secret to ask for again mid-session. Device-bound
    on Android does: the Keystore prompt is one. Device-bound on the web does
    not - there is nothing to ask - which is the one combination where
    lock-on-leave can only blank the screen, and the settings copy says so. */
export function accessModeHasSecret(mode: JournalAccessMode, android: boolean): boolean {
  if (mode === 'passphrase' || mode === 'pin') return true;
  return mode === 'device-bound' && android;
}

export function chooseJournalAccessMode({
  keystoreSecretSource,
  deviceBoundKeystoreExists
}: {
  keystoreSecretSource: JournalSecretSource | null;
  deviceBoundKeystoreExists: boolean;
}): JournalAccessMode {
  /* A secret keystore wins over leftover device-bound material, the rule
     passphrase mode has always had: changing mode writes the new keystore
     before clearing the old key, so a crash in between must not downgrade
     the journal to the weaker of the two. */
  if (keystoreSecretSource !== null) return keystoreSecretSource;
  if (deviceBoundKeystoreExists) return 'device-bound';
  return null;
}

export type WebBootPlan = 'needs-setup' | 'needs-unlock' | 'auto-unlock' | 'convert' | 'retire';

export function describeWebBootPlan({
  keystoreSecretSource,
  deviceBoundKeystoreExists,
  plaintextJournalPresent,
  marker
}: {
  keystoreSecretSource: JournalSecretSource | null;
  deviceBoundKeystoreExists: boolean;
  plaintextJournalPresent: boolean;
  marker: Parameters<typeof describeJournalState>[0]['marker'];
}): WebBootPlan {
  const state = describeJournalState({
    keystoreExists: keystoreSecretSource !== null || deviceBoundKeystoreExists,
    plaintextJournalPresent,
    marker
  });

  if (state === 'first-run') return 'needs-setup';
  if (state !== 'unlock') return state;
  return chooseJournalAccessMode({ keystoreSecretSource, deviceBoundKeystoreExists }) === 'device-bound'
    ? 'auto-unlock'
    : 'needs-unlock';
}

export type AndroidBootPlan = 'needs-setup' | 'needs-unlock' | 'needs-authentication' | 'plaintext-error';

export function describeAndroidBootPlan({
  keystoreSecretSource,
  nativeDeviceKeyExists,
  plaintextJournalPresent
}: {
  keystoreSecretSource: JournalSecretSource | null;
  nativeDeviceKeyExists: boolean;
  plaintextJournalPresent: boolean;
}): AndroidBootPlan {
  if (keystoreSecretSource !== null) return 'needs-unlock';
  if (nativeDeviceKeyExists) return 'needs-authentication';
  if (plaintextJournalPresent) return 'plaintext-error';
  return 'needs-setup';
}

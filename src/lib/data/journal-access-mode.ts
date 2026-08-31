import { describeJournalState } from './conversion/conversion.ts';
import type { JournalSecretSource } from '../crypto/keystore.ts';

/* How this journal opens (ADR-0041, tickets 53 and 55).

   All four of ADR-0041's modes are here. The three secret-derived ones are
   one wrap system with three secret sources (crypto/keystore.ts): a
   keystore's own `secretSource` says which, so the mode is read off the
   keystore rather than tracked beside it. Android's device-bound mode is the
   one that is biometric-gated already - Keystore will not release the key
   until the platform confirms who is present - so the module names it as
   such rather than offering a second mechanism, and `'biometric'` here means
   the web's WebAuthn PRF mode only (ticket 55, data/journal-biometric.ts).
   It is offered on a device that turns out to have it and nowhere else, so
   nothing may assume a build that compiles this arm can reach it. */
export type JournalAccessMode = 'passphrase' | 'pin' | 'biometric' | 'device-bound' | null;

/** Whether this mode has a secret to ask for again mid-session. Device-bound
    on Android does: the Keystore prompt is one. Device-bound on the web does
    not - there is nothing to ask - which is the one combination where
    lock-on-leave can only blank the screen, and the settings copy says so.
    Biometric mode does: the prompt is the secret, the same way Android's
    Keystore one is. */
export function accessModeHasSecret(mode: JournalAccessMode, android: boolean): boolean {
  if (mode === 'passphrase' || mode === 'pin' || mode === 'biometric') return true;
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

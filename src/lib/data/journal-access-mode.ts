import { describeJournalState } from './conversion/conversion.ts';

export type JournalAccessMode = 'passphrase' | 'device-bound' | null;

export function chooseJournalAccessMode({
  passphraseKeystoreExists,
  deviceBoundKeystoreExists
}: {
  passphraseKeystoreExists: boolean;
  deviceBoundKeystoreExists: boolean;
}): JournalAccessMode {
  if (passphraseKeystoreExists) return 'passphrase';
  if (deviceBoundKeystoreExists) return 'device-bound';
  return null;
}

export type WebBootPlan = 'needs-setup' | 'needs-unlock' | 'auto-unlock' | 'convert' | 'retire';

export function describeWebBootPlan({
  passphraseKeystoreExists,
  deviceBoundKeystoreExists,
  plaintextJournalPresent,
  marker
}: {
  passphraseKeystoreExists: boolean;
  deviceBoundKeystoreExists: boolean;
  plaintextJournalPresent: boolean;
  marker: Parameters<typeof describeJournalState>[0]['marker'];
}): WebBootPlan {
  const state = describeJournalState({
    keystoreExists: passphraseKeystoreExists || deviceBoundKeystoreExists,
    plaintextJournalPresent,
    marker
  });

  if (state === 'first-run') return 'needs-setup';
  if (state !== 'unlock') return state;
  return chooseJournalAccessMode({ passphraseKeystoreExists, deviceBoundKeystoreExists }) === 'device-bound'
    ? 'auto-unlock'
    : 'needs-unlock';
}

export type AndroidBootPlan = 'needs-setup' | 'needs-unlock' | 'needs-authentication' | 'plaintext-error';

export function describeAndroidBootPlan({
  passphraseKeystoreExists,
  nativeDeviceKeyExists,
  plaintextJournalPresent
}: {
  passphraseKeystoreExists: boolean;
  nativeDeviceKeyExists: boolean;
  plaintextJournalPresent: boolean;
}): AndroidBootPlan {
  if (passphraseKeystoreExists) return 'needs-unlock';
  if (nativeDeviceKeyExists) return 'needs-authentication';
  if (plaintextJournalPresent) return 'plaintext-error';
  return 'needs-setup';
}
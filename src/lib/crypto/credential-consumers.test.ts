import { test, expect } from 'vitest';
import {
  CREDENTIAL_CONSUMERS,
  CREDENTIAL_PROFILES,
  CredentialConsumerMismatchError,
  UnknownCredentialConsumerError,
  credentialConsumer,
  resolveCredentialProfile,
} from './credential-consumers.ts';
import { ARCHIVE_ARGON2_PARAMS, JOURNAL_ARGON2_PARAMS, PIN_ARGON2_PARAMS } from './params.ts';

test('the registry declares every supported credential consumer and its selection rule', () => {
  expect(CREDENTIAL_CONSUMERS).toEqual([
    {
      consumer: 'journal-passphrase-setup',
      profile: 'journal-passphrase',
      selectionRule: 'current',
      purpose: 'Mint a new keystore for first-run Journal unlock.'
    },
    {
      consumer: 'journal-passphrase-add',
      profile: 'journal-passphrase',
      selectionRule: 'current',
      purpose: 'Wrap an existing Journal data key under a passphrase.'
    },
    {
      consumer: 'journal-passphrase-unlock',
      profile: 'journal-passphrase',
      selectionRule: 'persisted',
      purpose: 'Unlock a keystore with the parameter set it was written under.'
    },
    {
      consumer: 'journal-passphrase-change',
      profile: 'journal-passphrase',
      selectionRule: 'current',
      purpose: 'Rewrap the Journal data key under the current passphrase profile.'
    },
    {
      consumer: 'archive-export',
      profile: 'archive-password',
      selectionRule: 'current',
      purpose: 'Derive the password that protects a newly packed archive.'
    },
    {
      consumer: 'archive-import',
      profile: 'archive-password',
      selectionRule: 'persisted',
      purpose: 'Derive the password for an archive header\'s recorded profile.'
    },
    {
      consumer: 'pin-hash',
      profile: 'app-lock-pin',
      selectionRule: 'current',
      purpose: 'Stamp a freshly chosen PIN with the current PIN profile.'
    },
    {
      consumer: 'pin-verify',
      profile: 'app-lock-pin',
      selectionRule: 'persisted',
      purpose: 'Verify a PIN against the parameter set stored in its record.'
    }
  ]);
});

test('each profile keeps its current purpose and parameter set', () => {
  expect(CREDENTIAL_PROFILES).toEqual({
    'archive-password': {
      purpose: 'Protects an archive that can leave the device.',
      params: ARCHIVE_ARGON2_PARAMS
    },
    'journal-passphrase': {
      purpose: 'Wraps the Journal data key for portable cold-start unlock.',
      params: JOURNAL_ARGON2_PARAMS
    },
    'app-lock-pin': {
      purpose: 'Gates casual access during an unlocked session.',
      params: PIN_ARGON2_PARAMS
    }
  });
});

test('current-profile consumers resolve the current params for their profile', () => {
  expect(resolveCredentialProfile('journal-passphrase-setup')).toBe(JOURNAL_ARGON2_PARAMS);
  expect(resolveCredentialProfile('archive-export')).toBe(ARCHIVE_ARGON2_PARAMS);
  expect(resolveCredentialProfile('pin-hash')).toBe(PIN_ARGON2_PARAMS);
});

test('persisted-profile consumers resolve the params they are handed', () => {
  const persistedArchive = { memorySize: 1024, iterations: 2, parallelism: 1, hashLength: 16 };
  const persistedPin = { memorySize: 2048, iterations: 3, parallelism: 1, hashLength: 32 };

  expect(resolveCredentialProfile('archive-import', { persistedParams: persistedArchive })).toBe(persistedArchive);
  expect(resolveCredentialProfile('pin-verify', { persistedParams: persistedPin })).toBe(persistedPin);
});

test('unknown consumers fail explicitly', () => {
  expect(() => credentialConsumer('camera-roll')).toThrow(UnknownCredentialConsumerError);
  expect(() => resolveCredentialProfile('camera-roll')).toThrow('unknown credential consumer: camera-roll');
});

test('mismatched profile requests fail explicitly', () => {
  expect(() => resolveCredentialProfile('pin-hash', { profile: 'archive-password' })).toThrow(CredentialConsumerMismatchError);
  expect(() => resolveCredentialProfile('pin-hash', { profile: 'archive-password' })).toThrow(
    'pin-hash uses the app-lock-pin profile, not archive-password'
  );
});

test('wrong selection mode fails explicitly', () => {
  expect(() => resolveCredentialProfile('archive-import')).toThrow(CredentialConsumerMismatchError);
  expect(() => resolveCredentialProfile('archive-import')).toThrow(
    'archive-import requires persisted archive-password parameters'
  );
  expect(() => resolveCredentialProfile('archive-export', { persistedParams: ARCHIVE_ARGON2_PARAMS })).toThrow(
    'archive-export uses the current archive-password profile, not persisted parameters'
  );
});

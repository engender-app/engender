import { test, expect } from 'vitest';
import {
  CREDENTIAL_CONSUMERS,
  CREDENTIAL_PROFILES,
  CredentialConsumerMismatchError,
  UnknownCredentialConsumerError,
  credentialConsumer,
  resolveCredentialProfile,
} from './credential-consumers.ts';
import { ARCHIVE_ARGON2_PARAMS, JOURNAL_ARGON2_PARAMS, PIN_ENCRYPTION_ARGON2_PARAMS } from './params.ts';

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
      consumer: 'journal-pin-setup',
      profile: 'pin-encryption',
      selectionRule: 'current',
      purpose: 'Mint a new keystore for first-run PIN unlock.'
    },
    {
      consumer: 'journal-pin-add',
      profile: 'pin-encryption',
      selectionRule: 'current',
      purpose: 'Wrap an existing Journal data key under a PIN.'
    },
    {
      consumer: 'journal-pin-unlock',
      profile: 'pin-encryption',
      selectionRule: 'persisted',
      purpose: 'Unlock a PIN keystore with the parameter set it was written under.'
    },
    {
      consumer: 'journal-pin-change',
      profile: 'pin-encryption',
      selectionRule: 'current',
      purpose: 'Rewrap the Journal data key under the current PIN profile.'
    },
    {
      consumer: 'journal-biometric-setup',
      profile: 'biometric-prf',
      selectionRule: 'current',
      purpose: 'Mint a new keystore for first-run biometric unlock.'
    },
    {
      consumer: 'journal-biometric-add',
      profile: 'biometric-prf',
      selectionRule: 'current',
      purpose: 'Wrap an existing Journal data key under a platform authenticator.'
    },
    {
      consumer: 'journal-biometric-unlock',
      profile: 'biometric-prf',
      selectionRule: 'persisted',
      purpose: 'Unlock a biometric keystore with the parameter set it was written under.'
    },
    {
      consumer: 'journal-recovery-add',
      profile: 'recovery-key',
      selectionRule: 'current',
      purpose: 'Wrap an existing Journal data key under a written recovery key.'
    },
    {
      consumer: 'journal-recovery-unlock',
      profile: 'recovery-key',
      selectionRule: 'persisted',
      purpose: 'Open a recovery wrap with the parameter set it was written under.'
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
    'pin-encryption': {
      purpose: 'Wraps the Journal data key under a short PIN, sealed to this device.',
      params: PIN_ENCRYPTION_ARGON2_PARAMS
    },
    'biometric-prf': {
      purpose: 'Wraps the Journal data key under a secret only a platform authenticator releases.',
      params: JOURNAL_ARGON2_PARAMS
    },
    'recovery-key': {
      purpose: 'Wraps the Journal data key under a written key kept off the device.',
      params: JOURNAL_ARGON2_PARAMS
    }
  });
});

/* Deliberate, and stated as a test so that re-tuning one and not the other
   is a decision somebody makes rather than a drift: a PRF output has no
   small input space for KDF cost to defend, so biometric mode buys the same
   cold-start budget a passphrase does. */
test('biometric mode derives at the journal cold-start cost, the same budget a passphrase has', () => {
  expect(resolveCredentialProfile('journal-biometric-setup')).toBe(JOURNAL_ARGON2_PARAMS);
});

/* The same deliberate sharing, for a related reason and a different one.
   Related: 120 bits has no small input space for KDF cost to defend, so
   there is nothing here for a heavier profile to buy. Different: a
   recovery key is derived once in a while rather than on every cold start,
   so the budget is not what constrains it - it is named apart so that a
   later reason to make it heavier has somewhere to land, and shares the
   numbers until there is one. */
test('a recovery key derives at the journal cold-start cost, named apart from it', () => {
  expect(resolveCredentialProfile('journal-recovery-add')).toBe(JOURNAL_ARGON2_PARAMS);
  expect(credentialConsumer('journal-recovery-add').profile).toBe('recovery-key');
});

test('current-profile consumers resolve the current params for their profile', () => {
  expect(resolveCredentialProfile('journal-passphrase-setup')).toBe(JOURNAL_ARGON2_PARAMS);
  expect(resolveCredentialProfile('archive-export')).toBe(ARCHIVE_ARGON2_PARAMS);
  expect(resolveCredentialProfile('journal-pin-setup')).toBe(PIN_ENCRYPTION_ARGON2_PARAMS);
});

test('persisted-profile consumers resolve the params they are handed', () => {
  const persistedArchive = { memorySize: 1024, iterations: 2, parallelism: 1, hashLength: 16 };
  const persistedPin = { memorySize: 2048, iterations: 3, parallelism: 1, hashLength: 32 };

  expect(resolveCredentialProfile('archive-import', { persistedParams: persistedArchive })).toBe(persistedArchive);
  expect(resolveCredentialProfile('journal-pin-unlock', { persistedParams: persistedPin })).toBe(persistedPin);
});

test('unknown consumers fail explicitly', () => {
  expect(() => credentialConsumer('camera-roll')).toThrow(UnknownCredentialConsumerError);
  expect(() => resolveCredentialProfile('camera-roll')).toThrow('unknown credential consumer: camera-roll');
});

test('mismatched profile requests fail explicitly', () => {
  expect(() => resolveCredentialProfile('journal-pin-setup', { profile: 'archive-password' })).toThrow(CredentialConsumerMismatchError);
  expect(() => resolveCredentialProfile('journal-pin-setup', { profile: 'archive-password' })).toThrow(
    'journal-pin-setup uses the pin-encryption profile, not archive-password'
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

/* The PIN's setup copy states "four digits" and "all 10,000 possible PINs"
   as prose, in both languages, because parameterising only the digit count
   would leave the 10,000 and the five-second figure behind and produce copy
   that contradicts itself. That trade is only safe while the constant is
   what the copy says, so the constant is pinned here: a change to
   PIN_LENGTH has to fail a test rather than silently make a risk screen
   lie (docs/ui-copy.md, "the sentence must be exactly as final as the
   behaviour, in both languages"). */
test('the PIN length the copy is written around is the one the pad collects', async () => {
  const { PIN_LENGTH } = await import('./params.ts');
  expect(PIN_LENGTH).toBe(4);
});

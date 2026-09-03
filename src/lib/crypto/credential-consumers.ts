import { ARCHIVE_ARGON2_PARAMS, JOURNAL_ARGON2_PARAMS, PIN_ENCRYPTION_ARGON2_PARAMS, type Argon2Params } from './params.ts';

export type CredentialProfile = 'archive-password' | 'journal-passphrase' | 'pin-encryption' | 'biometric-prf' | 'recovery-key';

export type CredentialConsumer =
  | 'journal-passphrase-setup'
  | 'journal-passphrase-add'
  | 'journal-passphrase-unlock'
  | 'journal-passphrase-change'
  | 'archive-export'
  | 'archive-import'
  | 'journal-pin-setup'
  | 'journal-pin-add'
  | 'journal-pin-unlock'
  | 'journal-pin-change'
  | 'journal-biometric-setup'
  | 'journal-biometric-add'
  | 'journal-biometric-unlock'
  | 'journal-recovery-add'
  | 'journal-recovery-unlock';

type SelectionRule = 'current' | 'persisted';

interface CredentialProfileRegistration {
  purpose: string;
  params: Argon2Params;
}

export interface CredentialConsumerRegistration {
  consumer: CredentialConsumer;
  profile: CredentialProfile;
  selectionRule: SelectionRule;
  purpose: string;
}

export const CREDENTIAL_PROFILES = {
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
  /* Ticket 55 asked whether a WebAuthn PRF secret needs a profile of its own
     the way a PIN did, and the answer is no in the direction that matters. A
     PRF output is 32 bytes an authenticator produced, so there is no small
     input space here for KDF cost to defend - nobody enumerates 2^256, and
     no number this profile could carry would change that. What the cost is
     still for is the same thing the passphrase profile's is: a cold start
     can spend about half a second and no more.

     So it deliberately shares the passphrase profile's numbers rather than
     restating them. Re-tuning the journal's cold-start budget should move
     both, because it is one budget; the registry keeps the two named apart
     so that a future reason to separate them has somewhere to land. */
  'biometric-prf': {
    purpose: 'Wraps the Journal data key under a secret only a platform authenticator releases.',
    params: JOURNAL_ARGON2_PARAMS
  },
  /* The written recovery key (ADR-0054, ticket sec-01), sharing the
     passphrase's numbers for one of biometric mode's reasons and one of
     its own.

     Shared for the same reason: 120 bits of alphabet is not a space
     anybody enumerates, so there is no small input for Argon2id cost to
     defend here, and no number this profile could carry would change
     that.

     Its own reason: this derivation is not on the cold-start path. A
     recovery key is derived when one is minted and on the rare boot that
     uses it, so the half-second budget that shapes the passphrase profile
     is not the constraint it is there - this one could afford to be
     heavier. It is not, because heavier would buy nothing against 120
     bits, and a profile that costs more without protecting more is just a
     slower screen. Named apart so that a real reason to diverge has
     somewhere to land. */
  'recovery-key': {
    purpose: 'Wraps the Journal data key under a written key kept off the device.',
    params: JOURNAL_ARGON2_PARAMS
  }
} as const satisfies Record<CredentialProfile, CredentialProfileRegistration>;

export const CREDENTIAL_CONSUMERS = [
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
  /* Two rows rather than the four the access modes each have, because a
     recovery key does two things and not the other two. There is no
     `setup`: a recovery key never mints a journal, it always wraps a data
     key that some access mode already opened. And there is no `change`:
     replacing a recovery key is minting a new one over the old, which is
     `add` again, and the thing being replaced is not a secret somebody
     remembers changing. */
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
] as const satisfies readonly CredentialConsumerRegistration[];

const consumersByName = new Map<string, CredentialConsumerRegistration>(
  CREDENTIAL_CONSUMERS.map((entry) => [entry.consumer, entry])
);

export class UnknownCredentialConsumerError extends Error {
  constructor(consumer: string) {
    super(`unknown credential consumer: ${consumer}`);
    this.name = 'UnknownCredentialConsumerError';
  }
}

export class CredentialConsumerMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialConsumerMismatchError';
  }
}

export function credentialConsumer(consumer: string): CredentialConsumerRegistration {
  const entry = consumersByName.get(consumer);
  if (!entry) throw new UnknownCredentialConsumerError(consumer);
  return entry;
}

export function resolveCredentialProfile(
  consumer: string,
  options: { profile?: CredentialProfile; persistedParams?: Argon2Params } = {}
): Argon2Params {
  const entry = credentialConsumer(consumer);
  if (options.profile && options.profile !== entry.profile) {
    throw new CredentialConsumerMismatchError(
      `${entry.consumer} uses the ${entry.profile} profile, not ${options.profile}`
    );
  }

  if (entry.selectionRule === 'persisted') {
    if (!options.persistedParams) {
      throw new CredentialConsumerMismatchError(
        `${entry.consumer} requires persisted ${entry.profile} parameters`
      );
    }
    return options.persistedParams;
  }

  if (options.persistedParams) {
    throw new CredentialConsumerMismatchError(
      `${entry.consumer} uses the current ${entry.profile} profile, not persisted parameters`
    );
  }

  return CREDENTIAL_PROFILES[entry.profile].params;
}

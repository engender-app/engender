import { ARCHIVE_ARGON2_PARAMS, JOURNAL_ARGON2_PARAMS, PIN_ARGON2_PARAMS, type Argon2Params } from './params.ts';

export type CredentialProfile = 'archive-password' | 'journal-passphrase' | 'app-lock-pin';

export type CredentialConsumer =
  | 'journal-passphrase-setup'
  | 'journal-passphrase-add'
  | 'journal-passphrase-unlock'
  | 'journal-passphrase-change'
  | 'archive-export'
  | 'archive-import'
  | 'pin-hash'
  | 'pin-verify';

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
  'app-lock-pin': {
    purpose: 'Gates casual access during an unlocked session.',
    params: PIN_ARGON2_PARAMS
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

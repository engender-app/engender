/* The web key model (ADR-0018, ticket 09): a random 32-byte data key
   encrypts the Journal; the Journal passphrase only wraps that key. What
   persists beside the ciphertext is this metadata - salt, the Argon2id
   parameter set the wrap was made with, and the AES-GCM-wrapped key - none
   of which is usable without the passphrase.

   The parameters travel in the metadata rather than being read from
   params.ts at unlock time (ADR-0013's evolvability): re-tuning the
   constants changes keystores created after the change, and every older
   keystore keeps unlocking with the set it was written under.

   Changing the passphrase is rewrapKeystore(): unwrap with the old, wrap
   with the new, fresh salt, same data key - the Journal itself is never
   re-encrypted (ticket 09's acceptance).

   Pure over bytes and strings; where the serialized form lives (an OPFS
   file on web, ticket 13's Keystore on Android) is its caller's decision. */

import { encrypt, decrypt } from './aesGcm.ts';
import { deriveKey, randomSalt } from './argon2id.ts';
import { resolveCredentialProfile } from './credential-consumers.ts';
import type { Argon2Params } from './params.ts';

/* What this build writes. Version 1 is still read: it is what every
   installation before ticket 53 has on disk, and it predates the source
   field below (see parseKeystore). */
const KEYSTORE_VERSION = 2;
const READABLE_VERSIONS: readonly number[] = [1, 2];
const DATA_KEY_LENGTH = 32;

/** Where the wrapping secret came from (ADR-0041). The wrap is identical
    either way - this is what tells boot which gate to draw before anything
    has been typed, and which KDF profile the secret was priced under. A
    PIN's secret is not the four digits alone: data/journal-pin.ts binds
    them to a device secret first, which is what makes four digits
    defensible at all. */
export type JournalSecretSource = 'passphrase' | 'pin';

const SECRET_SOURCES: readonly JournalSecretSource[] = ['passphrase', 'pin'];

/* Two consumers per source per operation (ADR-0013). The unlock rows both
   select persisted parameters, so which one is used changes no bytes - it
   keeps the registry honest about who derives what, and it is what makes
   re-tuning one profile without touching the other possible. */
const CONSUMERS = {
  passphrase: {
    setup: 'journal-passphrase-setup',
    add: 'journal-passphrase-add',
    unlock: 'journal-passphrase-unlock',
    change: 'journal-passphrase-change'
  },
  pin: {
    setup: 'journal-pin-setup',
    add: 'journal-pin-add',
    unlock: 'journal-pin-unlock',
    change: 'journal-pin-change'
  }
} as const satisfies Record<JournalSecretSource, Record<string, string>>;

export interface KeystoreMetadata {
  version: typeof KEYSTORE_VERSION;
  kdf: 'argon2id';
  secretSource: JournalSecretSource;
  params: Argon2Params;
  salt: Uint8Array<ArrayBuffer>;
  nonce: Uint8Array<ArrayBuffer>;
  wrappedKey: Uint8Array<ArrayBuffer>;
}

/** Mints a fresh random data key and wraps it under the secret. The
    returned data key goes to the database and the file stores, and only
    ever lives in memory; the metadata is what may be persisted. */
export async function createKeystore(
  secret: string,
  params?: Argon2Params,
  secretSource: JournalSecretSource = 'passphrase'
): Promise<{ metadata: KeystoreMetadata; dataKey: Uint8Array<ArrayBuffer> }> {
  const dataKey = crypto.getRandomValues(new Uint8Array(DATA_KEY_LENGTH));
  const chosen = params ?? resolveCredentialProfile(CONSUMERS[secretSource].setup);
  return { metadata: await wrap(dataKey, secret, chosen, secretSource), dataKey };
}

export async function wrapDataKeyWithSecret(
  dataKey: Uint8Array<ArrayBuffer>,
  secret: string,
  params?: Argon2Params,
  secretSource: JournalSecretSource = 'passphrase'
): Promise<KeystoreMetadata> {
  return wrap(dataKey, secret, params ?? resolveCredentialProfile(CONSUMERS[secretSource].add), secretSource);
}

/** Recovers the data key, or throws DecryptionFailedError - a wrong secret
    and a corrupted keystore are deliberately the same failure (aesGcm.ts),
    and callers show only "that was not right". */
export async function unlockKeystore(
  metadata: KeystoreMetadata,
  secret: string
): Promise<Uint8Array<ArrayBuffer>> {
  const wrappingKey = await deriveKey(
    secret,
    metadata.salt,
    resolveCredentialProfile(CONSUMERS[metadata.secretSource].unlock, { persistedParams: metadata.params })
  );
  return decrypt(wrappingKey, metadata.nonce, metadata.wrappedKey);
}

/** Changes the secret by rewrapping the same data key: fresh salt, fresh
    nonce, current parameter constants. Throws without side effects when the
    current secret is wrong.

    Also how the access mode changes (ticket 53): naming a different
    `newSource` rewraps under that source's profile, and the Journal itself
    is never re-encrypted either way. Omitting it keeps the source the
    keystore already had, which is the plain change-my-secret case. */
export async function rewrapKeystore(
  metadata: KeystoreMetadata,
  currentSecret: string,
  newSecret: string,
  params?: Argon2Params,
  newSource: JournalSecretSource = metadata.secretSource
): Promise<KeystoreMetadata> {
  const dataKey = await unlockKeystore(metadata, currentSecret);
  return wrap(dataKey, newSecret, params ?? resolveCredentialProfile(CONSUMERS[newSource].change), newSource);
}

async function wrap(
  dataKey: Uint8Array<ArrayBuffer>,
  secret: string,
  params: Argon2Params,
  secretSource: JournalSecretSource
): Promise<KeystoreMetadata> {
  const salt = randomSalt();
  const wrappingKey = await deriveKey(secret, salt, params);
  const { nonce, ciphertext } = await encrypt(wrappingKey, dataKey);
  return { version: KEYSTORE_VERSION, kdf: 'argon2id', secretSource, params, salt, nonce, wrappedKey: ciphertext };
}

/* --- the persisted form: JSON with base64 byte fields ------------------- */

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export function serializeKeystore(metadata: KeystoreMetadata): string {
  return JSON.stringify({
    version: metadata.version,
    kdf: metadata.kdf,
    secretSource: metadata.secretSource,
    params: metadata.params,
    salt: toBase64(metadata.salt),
    nonce: toBase64(metadata.nonce),
    wrappedKey: toBase64(metadata.wrappedKey)
  });
}

/** Thrown for a keystore this build cannot read - a newer format version
    (the SchemaTooNewError situation, on the key side) or a file that is
    not a keystore at all. Distinct from DecryptionFailedError on purpose:
    this one is not "wrong passphrase" and retyping won't fix it. */
export class KeystoreUnreadableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeystoreUnreadableError';
  }
}

export function parseKeystore(serialized: string): KeystoreMetadata {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(serialized) as Record<string, unknown>;
  } catch {
    throw new KeystoreUnreadableError('keystore file is not JSON');
  }
  if (typeof raw.version !== 'number' || !READABLE_VERSIONS.includes(raw.version)) {
    throw new KeystoreUnreadableError(
      `keystore format version ${String(raw.version)} is not one this build reads (${READABLE_VERSIONS.join(', ')})`
    );
  }
  /* Version 1 predates the field and could only ever have been a
     passphrase: device-bound keys have never lived in this file
     (data/device-bound-journal.ts keeps its own). Absent means passphrase;
     present means it has to be a source this build knows, because guessing
     would price the KDF under the wrong profile. */
  const secretSource = raw.secretSource ?? 'passphrase';
  if (typeof secretSource !== 'string' || !SECRET_SOURCES.includes(secretSource as JournalSecretSource)) {
    throw new KeystoreUnreadableError(`keystore names a secret source this build does not have: ${String(secretSource)}`);
  }
  if (raw.kdf !== 'argon2id' || typeof raw.salt !== 'string' || typeof raw.nonce !== 'string' || typeof raw.wrappedKey !== 'string') {
    throw new KeystoreUnreadableError('keystore file is missing fields');
  }
  // The parameters get fed to the KDF as-is (that is the evolvability), so
  // a mangled block must fail here by name, not later as a derive error
  // that would read as a wrong passphrase.
  const params = raw.params as Partial<Argon2Params> | undefined;
  const numbers: (keyof Argon2Params)[] = ['memorySize', 'iterations', 'parallelism', 'hashLength'];
  if (!params || numbers.some((field) => typeof params[field] !== 'number')) {
    throw new KeystoreUnreadableError('keystore file has no usable KDF parameters');
  }
  return {
    version: KEYSTORE_VERSION,
    kdf: 'argon2id',
    secretSource: secretSource as JournalSecretSource,
    params: params as Argon2Params,
    salt: fromBase64(raw.salt),
    nonce: fromBase64(raw.nonce),
    wrappedKey: fromBase64(raw.wrappedKey)
  };
}

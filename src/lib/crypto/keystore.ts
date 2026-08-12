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
import { JOURNAL_ARGON2_PARAMS, type Argon2Params } from './params.ts';

const KEYSTORE_VERSION = 1;
const DATA_KEY_LENGTH = 32;

export interface KeystoreMetadata {
  version: typeof KEYSTORE_VERSION;
  kdf: 'argon2id';
  params: Argon2Params;
  salt: Uint8Array<ArrayBuffer>;
  nonce: Uint8Array<ArrayBuffer>;
  wrappedKey: Uint8Array<ArrayBuffer>;
}

/** Mints a fresh random data key and wraps it under the passphrase.
    The returned data key goes to the database and the file stores, and
    only ever lives in memory; the metadata is what may be persisted. */
export async function createKeystore(
  passphrase: string,
  params: Argon2Params = JOURNAL_ARGON2_PARAMS
): Promise<{ metadata: KeystoreMetadata; dataKey: Uint8Array<ArrayBuffer> }> {
  const dataKey = crypto.getRandomValues(new Uint8Array(DATA_KEY_LENGTH));
  return { metadata: await wrap(dataKey, passphrase, params), dataKey };
}

export async function wrapDataKeyWithPassphrase(
  dataKey: Uint8Array<ArrayBuffer>,
  passphrase: string,
  params: Argon2Params = JOURNAL_ARGON2_PARAMS
): Promise<KeystoreMetadata> {
  return wrap(dataKey, passphrase, params);
}

/** Recovers the data key, or throws DecryptionFailedError - a wrong
    passphrase and a corrupted keystore are deliberately the same failure
    (aesGcm.ts), and callers show only "wrong passphrase". */
export async function unlockKeystore(
  metadata: KeystoreMetadata,
  passphrase: string
): Promise<Uint8Array<ArrayBuffer>> {
  const wrappingKey = await deriveKey(passphrase, metadata.salt, metadata.params);
  return decrypt(wrappingKey, metadata.nonce, metadata.wrappedKey);
}

/** Changes the passphrase by rewrapping the same data key: fresh salt,
    fresh nonce, current parameter constants. Throws without side effects
    when the current passphrase is wrong. */
export async function rewrapKeystore(
  metadata: KeystoreMetadata,
  currentPassphrase: string,
  newPassphrase: string,
  params: Argon2Params = JOURNAL_ARGON2_PARAMS
): Promise<KeystoreMetadata> {
  const dataKey = await unlockKeystore(metadata, currentPassphrase);
  return wrap(dataKey, newPassphrase, params);
}

async function wrap(
  dataKey: Uint8Array<ArrayBuffer>,
  passphrase: string,
  params: Argon2Params
): Promise<KeystoreMetadata> {
  const salt = randomSalt();
  const wrappingKey = await deriveKey(passphrase, salt, params);
  const { nonce, ciphertext } = await encrypt(wrappingKey, dataKey);
  return { version: KEYSTORE_VERSION, kdf: 'argon2id', params, salt, nonce, wrappedKey: ciphertext };
}

/* --- the persisted form: JSON with base64 byte fields ------------------- */

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export function serializeKeystore(metadata: KeystoreMetadata): string {
  return JSON.stringify({
    version: metadata.version,
    kdf: metadata.kdf,
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
  if (raw.version !== KEYSTORE_VERSION) {
    throw new KeystoreUnreadableError(
      `keystore format version ${String(raw.version)} is not the ${KEYSTORE_VERSION} this build reads`
    );
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
    params: params as Argon2Params,
    salt: fromBase64(raw.salt),
    nonce: fromBase64(raw.nonce),
    wrappedKey: fromBase64(raw.wrappedKey)
  };
}

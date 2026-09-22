/* AES-256-GCM via WebCrypto (ticket 12), identical code on web and
   Android. Every call gets a fresh random nonce - reusing a nonce with
   the same key breaks GCM's confidentiality guarantee entirely.

   Both calls take optional additional authenticated data: bytes that are
   not encrypted but are covered by the tag, so decryption fails unless the
   same bytes are supplied again. The archive binds each chunk's position
   and the file's header that way (ADR-0007, ticket 13). */

const NONCE_LENGTH = 12;
/* WebCrypto's default AES-GCM tag length is 128 bits; aesGcm() never
   overrides it, so this is fixed rather than read back from anywhere. */
const TAG_LENGTH = 16;

/** Bytes `seal` adds on top of the plaintext: nonce then GCM's tag, in that
    order, which is also the layout `seal`'s output and `open`'s input share.
    For a caller that has to size a buffer before sealing, or recover a
    plaintext length from a stored size, without holding the bytes yet. */
export const SEAL_OVERHEAD = NONCE_LENGTH + TAG_LENGTH;

interface Encrypted {
  nonce: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
}

/** Thrown on any decryption failure - a wrong key and a corrupted file
    fail AES-GCM's authentication tag check identically, so this class
    can't and doesn't distinguish them. Callers show the user only "wrong
    password" (ticket 12's acceptance), never a more specific diagnosis
    that would help an attacker probe for corruption vs a bad guess. */
export class DecryptionFailedError extends Error {
  constructor(cause: unknown) {
    super('wrong password');
    this.name = 'DecryptionFailedError';
    this.cause = cause;
  }
}

async function importKey(key: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/* additionalData is left off the parameters entirely when there is none,
   rather than passed as undefined: Chromium rejects a key that is present
   and undefined with "Not a BufferSource", while Node's WebCrypto accepts
   it - so the obvious spelling passes the Node tier and throws in the
   browser, which is what the browser tier is for. */
function aesGcm(nonce: Uint8Array<ArrayBuffer>, additionalData?: Uint8Array<ArrayBuffer>): AesGcmParams {
  return additionalData ? { name: 'AES-GCM', iv: nonce, additionalData } : { name: 'AES-GCM', iv: nonce };
}

export async function encrypt(
  key: Uint8Array<ArrayBuffer>,
  plaintext: Uint8Array<ArrayBuffer>,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<Encrypted> {
  const cryptoKey = await importKey(key);
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = await crypto.subtle.encrypt(aesGcm(nonce, additionalData), cryptoKey, plaintext);
  return { nonce, ciphertext: new Uint8Array(ciphertext) };
}

export async function decrypt(
  key: Uint8Array<ArrayBuffer>,
  nonce: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  try {
    const cryptoKey = await importKey(key);
    const plaintext = await crypto.subtle.decrypt(aesGcm(nonce, additionalData), cryptoKey, ciphertext);
    return new Uint8Array(plaintext);
  } catch (err) {
    // Importing the key can fail too - e.g. a corrupted archive header
    // (ADR-0007) claiming the wrong key length - and that must be just as
    // indistinguishable from a wrong password as the decrypt step itself.
    throw new DecryptionFailedError(err);
  }
}

/** `encrypt`/`decrypt` for a caller that stores the nonce and the ciphertext
    as one byte string rather than two fields - a file, a localStorage
    value, an archive chunk. Owns the framing (nonce first, then ciphertext)
    so no caller redeclares `NONCE_LENGTH` to slice one back apart. */
export async function seal(
  key: Uint8Array<ArrayBuffer>,
  plaintext: Uint8Array<ArrayBuffer>,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const { nonce, ciphertext } = await encrypt(key, plaintext, additionalData);
  const sealed = new Uint8Array(nonce.length + ciphertext.length);
  sealed.set(nonce);
  sealed.set(ciphertext, nonce.length);
  return sealed;
}

export async function open(
  key: Uint8Array<ArrayBuffer>,
  sealed: Uint8Array<ArrayBuffer>,
  additionalData?: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> {
  const nonce = sealed.subarray(0, NONCE_LENGTH) as Uint8Array<ArrayBuffer>;
  const ciphertext = sealed.subarray(NONCE_LENGTH) as Uint8Array<ArrayBuffer>;
  return decrypt(key, nonce, ciphertext, additionalData);
}

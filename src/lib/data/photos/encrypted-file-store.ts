/* Per-file encryption for what lives outside SQLite (ticket 09, ADR-0020's
   consequence): photos and thumbnails are files, so whole-database
   encryption never reaches them. This decorator wraps any PhotoFileStore -
   OPFS on web, app-private files on Android - and encrypts each file with
   AES-256-GCM under the same random data key that keys the database
   (ADR-0018).

   The file's name is the additional authenticated data, so a ciphertext
   moved to another name fails decryption instead of decoding as the wrong
   photo. Stored form: nonce, then ciphertext, nothing else - GCM's tag
   already authenticates, so no separate header or magic is needed, and
   size() can answer the plaintext length by arithmetic instead of a read
   (packing an archive asks for every photo's length up front, ADR-0007).

   remove() and list() pass through untouched: names were opaque uuids
   before encryption and stay so, which is what keeps the orphan sweep and
   delete working with no idea encryption exists. */

import type { PhotoFileStore } from '../journal/journal';
import { encrypt, decrypt } from '../../crypto/aesGcm';

const NONCE_LENGTH = 12;
const GCM_TAG_LENGTH = 16;

export function encryptedFileStore(inner: PhotoFileStore, dataKey: Uint8Array<ArrayBuffer>): PhotoFileStore {
  const nameBytes = (name: string) => new TextEncoder().encode(name) as Uint8Array<ArrayBuffer>;

  return {
    async write(name, bytes) {
      const { nonce, ciphertext } = await encrypt(dataKey, bytes as Uint8Array<ArrayBuffer>, nameBytes(name));
      const stored = new Uint8Array(nonce.length + ciphertext.length);
      stored.set(nonce);
      stored.set(ciphertext, nonce.length);
      await inner.write(name, stored);
    },

    async read(name) {
      const stored = await inner.read(name);
      if (stored === null) return null;
      const nonce = stored.slice(0, NONCE_LENGTH) as Uint8Array<ArrayBuffer>;
      const ciphertext = stored.slice(NONCE_LENGTH) as Uint8Array<ArrayBuffer>;
      // A tampered or foreign file throws DecryptionFailedError rather than
      // returning bytes that aren't a photo - loud, like the journal's own
      // failures (ADR-0017).
      return decrypt(dataKey, nonce, ciphertext, nameBytes(name));
    },

    async size(name) {
      const stored = await inner.size(name);
      return stored === null ? null : stored - NONCE_LENGTH - GCM_TAG_LENGTH;
    },

    remove: (name) => inner.remove(name),
    list: () => inner.list()
  };
}

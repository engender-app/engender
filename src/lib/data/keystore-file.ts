/* Where the web keeps the keystore metadata (ticket 09): one JSON file in
   the OPFS root, beside the SAHPool directory whose contents it unlocks.
   Everything in it survives disclosure without the passphrase
   (crypto/keystore.ts), so it needs no protection of its own - what it
   needs is to be readable before the database opens, and to go when a
   reset empties the OPFS root (data/reset.ts already removes everything
   under the root, this file included).

   Android will keep the same serialized form behind Keystore-protected
   storage instead (ticket 13); the functions stay this small so that
   difference stays a storage difference. */

import { parseKeystore, serializeKeystore, type KeystoreMetadata } from '../crypto/keystore';

export const KEYSTORE_FILE = 'keystore.json';

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

/** The stored metadata, or null on a first run - which is what tells boot
    to offer setup rather than unlock. */
export async function readKeystoreFile(): Promise<KeystoreMetadata | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const handle = await root.getFileHandle(KEYSTORE_FILE);
    return parseKeystore(await (await handle.getFile()).text());
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function writeKeystoreFile(metadata: KeystoreMetadata): Promise<void> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(KEYSTORE_FILE, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(serializeKeystore(metadata));
  } finally {
    await writable.close();
  }
}

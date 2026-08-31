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

import { parseKeystore, serializeKeystore, type JournalSecretSource, type KeystoreMetadata } from '../crypto/keystore';

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
  /* Serialized before the file is opened, because createWritable() truncates
     and serializeKeystore can refuse metadata (a biometric keystore with no
     credential id). Building the text first means a refusal leaves the old
     keystore where it was rather than emptying it. */
  const serialized = serializeKeystore(metadata);
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(KEYSTORE_FILE, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(serialized);
  } finally {
    await writable.close();
  }
}

/** Which kind of secret opens this journal, or null on a first run. What
    boot's survey asks (ticket 53): the mode is a property of the keystore
    rather than something tracked beside it, so there is nothing to drift. */
export async function readKeystoreSource(): Promise<JournalSecretSource | null> {
  return (await readKeystoreFile())?.secretSource ?? null;
}

/** Removes the keystore, for a move to device-bound mode where there is no
    secret to wrap under any more. Tolerates an absent file: the caller's
    goal is that it is gone. */
export async function removeKeystoreFile(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(KEYSTORE_FILE);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

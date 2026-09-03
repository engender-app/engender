/* Where the recovery wrap lives (ADR-0054, ticket sec-01): one JSON file
   in the OPFS root, beside `keystore.json` whose journal it opens.

   Everything in it survives disclosure without the key itself
   (crypto/recoveryWrap.ts), so like the keystore it needs no protection of
   its own - what it needs is to be readable before the database opens, and
   to go when a reset empties the OPFS root. `data/reset.ts` already removes
   everything under that root recursively, so this file needs no line there
   and deliberately does not get one.

   Same three functions as `keystore-file.ts`, and kept as small as that one
   is for the same reason: Android keeps the identical serialized form, so
   the difference between the platforms stays a storage difference. */

import { parseRecoveryWrap, serializeRecoveryWrap, type RecoveryWrap } from '../crypto/recoveryWrap';

export const RECOVERY_KEY_FILE = 'recovery-key.json';

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

/** The stored wrap, or null when this journal has no recovery key - which
    is every journal until somebody asks for one. */
export async function readRecoveryWrapFile(): Promise<RecoveryWrap | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const handle = await root.getFileHandle(RECOVERY_KEY_FILE);
    return parseRecoveryWrap(await (await handle.getFile()).text());
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function writeRecoveryWrapFile(wrap: RecoveryWrap): Promise<void> {
  /* Serialized before the file is opened, the ordering `writeKeystoreFile`
     spells out: createWritable() truncates, so building the text first
     means a refusal leaves the previous file where it was rather than
     emptying it. */
  const serialized = serializeRecoveryWrap(wrap);
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(RECOVERY_KEY_FILE, { create: true });
  const writable = await handle.createWritable();
  /* One write, into the swap file `createWritable` opens without
     `keepExistingData`: it only replaces the real file on close(), so a
     process that dies mid-write leaves the previous recovery key intact
     rather than a truncated file that opens nothing. Replacing a key is the
     case that matters - an interruption there leaves the old key working.

     Aborted rather than closed when the write throws, which is the half
     `writeKeystoreFile` gets wrong and this file copied at first: close()
     is what commits the swap, so a `finally { close() }` publishes exactly
     the truncated file the swap exists to prevent. abort() discards it and
     leaves the previous key where it was. The same one-line fix is owed to
     keystore-file.ts, which is out of this ticket's scope and named in its
     notes instead. */
  try {
    await writable.write(serialized);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

export async function removeRecoveryWrapFile(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(RECOVERY_KEY_FILE);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

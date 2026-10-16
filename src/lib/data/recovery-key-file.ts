/* Where the recovery wrap lives (ADR-0054, ticket sec-01): one JSON file
   in the OPFS root, beside `keystore.json` whose journal it opens, and a
   second while a new key waits to be confirmed (last-audit UI 42). The
   pending file holds the new key's wrap until the person says they have it
   written down; only then does it replace the active one, so an interrupted
   replacement leaves the old key working.

   Everything in it survives disclosure without the key itself
   (crypto/recoveryWrap.ts), so like the keystore it needs no protection of
   its own - what it needs is to be readable before the database opens, and
   to go when a reset empties the OPFS root. `data/reset.ts` removes this wrap
   after the other journal files, preserving recovery if data deletion fails.

   Same three functions as `keystore-file.ts`, and kept as small as that one
   is for the same reason: Android keeps the identical serialized form, so
   the difference between the platforms stays a storage difference. */

import { parseRecoveryWrap, serializeRecoveryWrap, type RecoveryWrap } from '../crypto/recoveryWrap';

/* Reset keeps both recovery wraps until the other journal files are gone. */
export const RECOVERY_KEY_FILE = 'recovery-key.json';
export const PENDING_RECOVERY_KEY_FILE = 'recovery-key-pending.json';

const isNotFound = (error: unknown): boolean => (error as DOMException)?.name === 'NotFoundError';

/** The stored wrap, or null when this journal has no recovery key - which
    is every journal until somebody asks for one. */
export async function readRecoveryWrapFile(name = RECOVERY_KEY_FILE): Promise<RecoveryWrap | null> {
  const root = await navigator.storage.getDirectory();
  try {
    const handle = await root.getFileHandle(name);
    return parseRecoveryWrap(await (await handle.getFile()).text());
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function writeRecoveryWrapFile(wrap: RecoveryWrap, name = RECOVERY_KEY_FILE): Promise<void> {
  /* Serialized before the file is opened, the ordering `writeKeystoreFile`
     spells out: createWritable() truncates, so building the text first
     means a refusal leaves the previous file where it was rather than
     emptying it. */
  const serialized = serializeRecoveryWrap(wrap);
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  /* One write, into the swap file `createWritable` opens without
     `keepExistingData`: it only replaces the real file on close(), so a
     process that dies mid-write leaves the previous recovery key intact
     rather than a truncated file that opens nothing. Promoting a pending
     key over the active one is the case that matters - an interruption
     there leaves the old key working.

     Aborted rather than closed when the write throws: close() is what
     commits the swap, so a `finally { close() }` publishes exactly the
     truncated file the swap exists to prevent. abort() discards it and
     leaves the previous key where it was. `writeKeystoreFile` follows the
     same pattern. */
  try {
    await writable.write(serialized);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}

export async function removeRecoveryWrapFile(name = RECOVERY_KEY_FILE): Promise<void> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(name);
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
}

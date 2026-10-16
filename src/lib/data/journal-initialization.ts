import { isAndroid } from '../platform';
import { androidKeystore } from '../lock/keystore-bridge';
import { keystoreFileExists } from './keystore-file';
import { webJournalPresent } from './journal-presence';
import { JOURNAL_DATABASE, legacyStoragePresent } from './legacy-journal';
import { inspectAndroidJournal } from './sqlite/android-driver';
import { initializeCredentials } from './credential-ownership';

export const DEVICE_BOUND_FILE = 'device-key.json';

export class JournalAlreadyExistsError extends Error {
  constructor() {
    super('a journal already exists; setup must return to its unlock flow');
    this.name = 'JournalAlreadyExistsError';
  }
}

/** Check all access modes before minting any key, including a PIN binding.
    An unreadable record fails closed: it is not an empty installation. */
export async function journalAccessExists(): Promise<boolean> {
  if (await keystoreFileExists()) return true;
  if (isAndroid()) {
    if ((await androidKeystore.status()).hasKey) return true;
    return (await inspectAndroidJournal(JOURNAL_DATABASE)).exists;
  }
  const root = await navigator.storage.getDirectory();
  try {
    await root.getFileHandle(DEVICE_BOUND_FILE);
    return true;
  } catch (error) {
    if ((error as DOMException)?.name !== 'NotFoundError') throw error;
  }
  return await legacyStoragePresent(root) || await webJournalPresent();
}

/** The lock spans the durable check and publication. A stale or simultaneous
    setup cannot replace credentials, even when it chose a different mode.
    Database opening follows publication and may be retried with this key;
    its failure must never authorize another initialization. */
export async function initializeJournal<T>(
  create: () => Promise<T>,
  exists: () => Promise<boolean> = journalAccessExists
): Promise<T> {
  const initialize = async () => {
    if (await exists()) throw new JournalAlreadyExistsError();
    return create();
  };
  return initializeCredentials(initialize);
}

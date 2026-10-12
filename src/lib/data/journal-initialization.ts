import { isAndroid } from '../platform';
import { androidKeystore } from '../lock/keystore-bridge';
import { KEYSTORE_FILE } from './keystore-file';
import { legacyStoragePresent } from './legacy-journal';
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
  const root = await navigator.storage.getDirectory();
  for (const name of [KEYSTORE_FILE, DEVICE_BOUND_FILE]) {
    try {
      await root.getFileHandle(name);
      return true;
    } catch (error) {
      if ((error as DOMException)?.name !== 'NotFoundError') throw error;
    }
  }
  if (isAndroid()) {
    return (await androidKeystore.status()).hasKey;
  }
  return legacyStoragePresent(root);
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

import { JOURNAL_DATABASE } from './legacy-journal';
import { poolDirectory } from './sqlite/pool-directory';

/** A retained pool must never be mistaken for a fresh installation. Do not
    acquire its handles or initialize SQLite just to inspect its presence. */
export async function webJournalPresent(): Promise<boolean> {
  const root = await navigator.storage.getDirectory();
  try {
    await root.getDirectoryHandle(poolDirectory(JOURNAL_DATABASE));
    return true;
  } catch (error) {
    if ((error as DOMException)?.name === 'NotFoundError') return false;
    throw error;
  }
}

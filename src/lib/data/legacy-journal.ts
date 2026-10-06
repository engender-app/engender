/** The live encrypted database uses this name inside its private pool. */
export const JOURNAL_DATABASE = 'engender.sqlite3';

const LEGACY_FILES = [
  JOURNAL_DATABASE,
  `${JOURNAL_DATABASE}.pre-migration-backup`,
  `${JOURNAL_DATABASE}-journal`,
  `${JOURNAL_DATABASE}-wal`,
  `${JOURNAL_DATABASE}-shm`,
  'conversion.json'
];

/** Detect unsupported plaintext-era files without opening or changing them. */
export async function legacyStoragePresent(
  root?: Pick<FileSystemDirectoryHandle, 'getFileHandle'>
): Promise<boolean> {
  const directory = root ?? await navigator.storage.getDirectory();
  for (const name of LEGACY_FILES) {
    try {
      await directory.getFileHandle(name);
      return true;
    } catch (error) {
      if ((error as DOMException)?.name !== 'NotFoundError') throw error;
    }
  }
  return false;
}

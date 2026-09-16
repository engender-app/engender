/* Port constructors for the journal: SQLite driver and photo files store.
   Decoupled so photo file store creation never instantiates an unmanaged SQLite connection (ticket 128). */

import { JOURNAL_DATABASE } from '../data/conversion/web-ports';
import { createAndroidSqlite } from '../data/sqlite/android-driver';
import { createEncryptedWebSqlite } from '../data/sqlite/mc-driver';
import type { WebSqlite } from '../data/sqlite/sqlocal-driver';
import type { SqliteDriver } from '../data/sqlite/driver';
import type { MigrationFileOps } from '../data/sqlite/migration-runner';
import { appPrivatePhotoFiles } from '../data/photos/android-file-store';
import { opfsPhotoFiles } from '../data/photos/opfs-file-store';
import { encryptedFileStore } from '../data/photos/encrypted-file-store';
import type { PhotoFileStore } from '../data/journal/journal';
import { isAndroid } from '../platform';

/** Photo file store for the current platform. Decoupled from SQLite driver creation. */
export function journalPhotoFiles(dataKey: Uint8Array<ArrayBuffer>): PhotoFileStore {
  if (isAndroid()) {
    return encryptedFileStore(appPrivatePhotoFiles(), dataKey);
  }
  return encryptedFileStore(opfsPhotoFiles(), dataKey);
}

/** SQLite driver and migration file ops for the current platform. */
export function createJournalSqlite(dataKey: Uint8Array<ArrayBuffer>): WebSqlite {
  if (isAndroid()) {
    return createAndroidSqlite(JOURNAL_DATABASE, dataKey);
  }
  return createEncryptedWebSqlite(JOURNAL_DATABASE, dataKey);
}

let activeDriver: SqliteDriver | null = null;
let activeFileOps: MigrationFileOps | null = null;

export function getActiveDriver(): SqliteDriver | null {
  return activeDriver;
}

export function getActiveFileOps(): MigrationFileOps | null {
  return activeFileOps;
}

export function setActiveDriver(driver: SqliteDriver | null, fileOps: MigrationFileOps | null = null): void {
  activeDriver = driver;
  activeFileOps = fileOps;
}

/** Closes active driver cleanly and clears driver references. */
export async function closeActiveDriver(): Promise<void> {
  if (activeDriver) {
    const driver = activeDriver;
    activeDriver = null;
    activeFileOps = null;
    await driver.close().catch(() => {});
  }
}

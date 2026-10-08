import { openJournal, type PhotoFileStore } from '../journal/journal';
import type { SqliteDriver } from '../sqlite/driver';
import type { MigrationFileOps } from '../sqlite/migration-runner';
import { migrateJournal } from '../sqlite/boot';
import { openPreferences } from '../prefs/preferences';
import { clearJournal, demoPhoto, personaPhotoSeeds, writePersonaJournal } from './journal-seed';
import type { NormalizedPhoto } from '../journal/photos';

/** Prepares photos together once the journal needs a persona. Each draw is
    handed out once; any other photo is drawn on demand. */
export function warmDemoPhotos(
  source: Parameters<typeof personaPhotoSeeds>[0],
  makePhoto: typeof demoPhoto = demoPhoto
): typeof demoPhoto {
  const warm = new Map<number, Promise<NormalizedPhoto>[]>();
  for (const seed of personaPhotoSeeds(source)) {
    const drawing = makePhoto(seed);
    // A failed draw surfaces where the seed takes it, not as an unhandled rejection here.
    drawing.catch(() => {});
    warm.set(seed, [...(warm.get(seed) ?? []), drawing]);
  }
  return (seed) => warm.get(seed)?.shift() ?? makePhoto(seed);
}

/** The worker owns its connection until this call finishes. Journal writes
    join this transaction rather than opening nested transactions. A failed
    seed rolls back all rows; boot's next orphan sweep reclaims staged files. */
export async function seedPersonaInTransaction(
  driver: SqliteDriver,
  files: PhotoFileStore,
  source: Parameters<typeof writePersonaJournal>[1],
  makePhoto: typeof demoPhoto = demoPhoto
): Promise<void> {
  await driver.transaction(async (scope) => {
    const joined: SqliteDriver = { ...scope, transaction: async (write) => write(joined) };
    await writePersonaJournal(openJournal(joined, files), source, makePhoto);
  });
}

/** Same cold boot steps, over the worker's local connection. Preferences stay
    empty until the page writes them, so a failed seed retries on next boot. */
export async function preparePersonaJournal(
  driver: SqliteDriver,
  files: PhotoFileStore,
  fileOps: MigrationFileOps,
  source: Parameters<typeof writePersonaJournal>[1],
  makePhoto: typeof demoPhoto = demoPhoto
): Promise<boolean> {
  const startedWithoutTables = (await driver.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1"
  )).length === 0;
  await migrateJournal(driver, fileOps);
  const journal = openJournal(driver, files);
  await journal.reconcileBuiltIns({ unlessCurrent: true });
  if (!(await openPreferences(driver)).openedEmpty()) return false;
  // An empty database that migrated ran the baseline's unguarded CREATEs:
  // any pre-existing authored table would have refused migration instead.
  // That schema has no authored rows. An interrupted seed already has a
  // schema, so that retry still clears before writing.
  if (!startedWithoutTables) await clearJournal(journal);
  await seedPersonaInTransaction(driver, files, source, warmDemoPhotos(source, makePhoto));
  return true;
}

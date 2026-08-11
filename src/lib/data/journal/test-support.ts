/* Shared by the journal's Node-tier tests: a journal over a freshly
   migrated node:sqlite database, built-ins reconciled - the state boot
   leaves behind. */

import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function journalWithBuiltIns(): Promise<{
  journal: Journal;
  db: Awaited<ReturnType<typeof migratedDb>>;
}> {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  return { journal, db };
}

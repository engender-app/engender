/* Shared by the journal's Node-tier tests: a journal over a freshly
   migrated node:sqlite database, built-ins reconciled - the state boot
   leaves behind. */

import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
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

export interface DriverRoundTrips {
  query: number;
  run: number;
}

export function countingDriver(
  driver: SqliteDriver,
  hooks: {
    onQuery?: (sql: string, params: unknown[] | undefined) => void;
    onRun?: (sql: string, params: unknown[] | undefined) => void;
  } = {}
): {
  driver: SqliteDriver;
  roundTrips: () => DriverRoundTrips;
  resetRoundTrips: () => void;
} {
  let queryRoundTrips = 0;
  let runRoundTrips = 0;

  const wrapped: SqliteDriver = {
    ...driver,
    query(sql, params) {
      queryRoundTrips += 1;
      hooks.onQuery?.(sql, params);
      return driver.query(sql, params);
    },
    run(sql, params) {
      runRoundTrips += 1;
      hooks.onRun?.(sql, params);
      return driver.run(sql, params);
    }
  };

  return {
    driver: wrapped,
    roundTrips: () => ({ query: queryRoundTrips, run: runRoundTrips }),
    resetRoundTrips: () => {
      queryRoundTrips = 0;
      runRoundTrips = 0;
    }
  };
}

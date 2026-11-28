/* Version 113 gives a reminder the drug it is for. Every reminder already stored is for
   none. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { preSquashChain } from './test-support/pre-squash-chain.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 113 adds a nullable reminder.drug and leaves every row as it was', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, preSquashChain.filter((m) => m.version <= 112));
  db.raw.exec(`INSERT INTO reminder (uuid, title, time, recurrence, enabled, updated_at)
               VALUES ('r1', 'Pill', '20:00', 'DAILY', 1, 1000)`);
  const before = db.raw.prepare('SELECT * FROM reminder').all();

  await runMigrations(db, fileOps, preSquashChain);

  assert.deepEqual(
    db.raw.prepare('SELECT * FROM reminder').all().map((row) => ({ ...(row as object) })),
    before.map((row) => ({ ...(row as object), drug: null }))
  );
  db.raw.exec(`INSERT INTO reminder (uuid, title, time, recurrence, enabled, updated_at, drug)
               VALUES ('r2', 'E', '08:00', 'DAILY', 1, 1000, 'Estradiol')`);
  assert.equal((db.raw.prepare("SELECT drug FROM reminder WHERE uuid = 'r2'").get() as { drug: string }).drug, 'Estradiol');
});

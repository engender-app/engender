/* FA 30: version 115 gives the five records that cost money an amount, a
   currency and a refunded flag, and reads hair removal's free-text cost by
   the recorded rule (cost.ts, parseLegacyCostText): a clean parse becomes
   the amount, anything else moves into the session's note, and the old
   column is left null for FA 50 to drop (version 119, migration-hygiene.test.ts). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { migrateHairRemovalCost } from './cost-migration.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

const COSTED = ['hair_removal_session', 'appointment', 'procedure', 'lab_result', 'medication_stock'];

async function journalAt114() {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= 114));
  return db;
}

function session(db: ReturnType<typeof makeNodeSqliteDb>, uuid: string, cost: string | null, note: string | null = null) {
  db.raw
    .prepare(
      `INSERT INTO hair_removal_session (uuid, epoch_day, area, method, pain_rating, cost, provider, updated_at, note)
       VALUES (?, 100, 'chin', 'laser', NULL, ?, 'Clinic', 1000, ?)`
    )
    .run(uuid, cost, note);
}

const read = (db: ReturnType<typeof makeNodeSqliteDb>, uuid: string): Record<string, unknown> =>
  ({ ...(db.raw
    .prepare('SELECT cost, cost_amount, cost_currency, cost_refunded, note, updated_at FROM hair_removal_session WHERE uuid = ?')
    .get(uuid) as object) });

test('version 115 adds the three cost columns to every costed table, empty', async () => {
  const db = await journalAt114();
  db.raw.exec(`INSERT INTO lab_result (uuid, epoch_day, analyte, value, unit, updated_at) VALUES ('l1', 1, 'E2', 100, 'pg/mL', 1)`);
  await runMigrations(db, noopFileOps(), migrations);
  assert.ok((await db.getUserVersion()) >= 115);
  for (const table of COSTED) {
    const columns = db.raw.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; notnull: number; dflt_value: unknown }>;
    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    assert.equal(byName.cost_amount?.notnull, 0, table);
    assert.equal(byName.cost_currency?.notnull, 0, table);
    assert.equal(byName.cost_refunded?.notnull, 1, table);
    assert.equal(byName.cost_refunded?.dflt_value, '0', table);
  }
  assert.deepEqual(
    { ...(db.raw.prepare("SELECT cost_amount, cost_currency, cost_refunded FROM lab_result WHERE uuid = 'l1'").get() as object) },
    { cost_amount: null, cost_currency: null, cost_refunded: 0 }
  );
});

test('a cleanly parsed text cost becomes the amount and the old column is left null', async () => {
  const db = await journalAt114();
  session(db, 'zl', '250 zł');
  session(db, 'eur', '€80,50');
  session(db, 'bare', '300');
  await runMigrations(db, noopFileOps(), [
    ...migrations.filter((m) => m.version <= 114),
    ...migrations.filter((m) => m.version === 115).map((m) => ({ ...m, apply: (d: Parameters<typeof migrateHairRemovalCost>[0]) => migrateHairRemovalCost(d, 'GBP') }))
  ]);
  assert.deepEqual(read(db, 'zl'), { cost: null, cost_amount: 250, cost_currency: 'PLN', cost_refunded: 0, note: null, updated_at: 1000 });
  assert.deepEqual(read(db, 'eur'), { cost: null, cost_amount: 80.5, cost_currency: 'EUR', cost_refunded: 0, note: null, updated_at: 1000 });
  assert.deepEqual(read(db, 'bare'), { cost: null, cost_amount: 300, cost_currency: 'GBP', cost_refunded: 0, note: null, updated_at: 1000 });
});

test('a text cost that does not parse moves into the note, after any note already there, and no text is lost', async () => {
  const db = await journalAt114();
  session(db, 'words', 'covered by NFZ');
  session(db, 'range', '200-300 zł', 'second pass');
  session(db, 'blank', '   ');
  session(db, 'empty', '');
  session(db, 'none', null, 'kept');
  session(db, 'padded', '  paid  in cash ');
  await migrateToVersion118(db);
  assert.equal(read(db, 'padded').note, '  paid  in cash ', 'the text moves exactly as typed');
  assert.deepEqual(read(db, 'words'), { cost: null, cost_amount: null, cost_currency: null, cost_refunded: 0, note: 'covered by NFZ', updated_at: 1000 });
  assert.deepEqual(read(db, 'range'), { cost: null, cost_amount: null, cost_currency: null, cost_refunded: 0, note: 'second pass\n200-300 zł', updated_at: 1000 });
  assert.equal(read(db, 'blank').note, null);
  assert.equal(read(db, 'empty').note, null);
  assert.equal(read(db, 'none').note, 'kept');
});

async function migrateToVersion118(db: ReturnType<typeof makeNodeSqliteDb>) {
  // Version 119 drops the column this test reads back as null.
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= 118));
}

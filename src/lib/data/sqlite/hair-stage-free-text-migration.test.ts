/* FA 23: hair staging becomes free text. Version 102 rebuilds hair_stage
   without its scale and stage columns, and every row recorded against a
   published scale keeps what it said, as the text the staging now holds. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import { legacyHairStagingText } from '../hairStageScales.ts';

const LEGACY = [
  ['n1', 'norwood_hamilton', '3v', ''],
  ['n2', 'norwood_hamilton', '2a', ''],
  ['n3', 'norwood_hamilton', '7', ''],
  ['s1', 'sinclair', '4', ''],
  ['o1', 'other', '', 'thinner at the crown'],
  ['o2', 'other', '', '']
] as const;

test('version 102 turns every staging into the text it read as, and drops the scale columns', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 101));
  for (const [uuid, scale, stage, description] of LEGACY) {
    db.raw
      .prepare('INSERT INTO hair_stage (uuid, epoch_day, scale, stage, description, updated_at) VALUES (?, 100, ?, ?, ?, 1000)')
      .run(uuid, scale, stage, description);
  }

  await runMigrations(db, fileOps, migrations);

  assert.ok((await db.getUserVersion()) >= 102);
  const columns = (db.raw.prepare('PRAGMA table_info(hair_stage)').all() as Array<{ name: string }>).map((c) => c.name);
  assert.deepEqual(columns, ['id', 'uuid', 'epoch_day', 'description', 'updated_at']);
  const rows = db.raw.prepare('SELECT uuid, description FROM hair_stage ORDER BY id').all() as Array<{
    uuid: string;
    description: string;
  }>;
  assert.deepEqual(
    rows.map((r) => [r.uuid, r.description]),
    [
      ['n1', 'Norwood-Hamilton 3V'],
      ['n2', 'Norwood-Hamilton 2A'],
      ['n3', 'Norwood-Hamilton 7'],
      ['s1', 'Sinclair 4'],
      ['o1', 'thinner at the crown'],
      ['o2', '']
    ]
  );
  // The SQL and the archive path's conversion say the same thing.
  for (const [uuid, scale, stage, description] of LEGACY) {
    assert.equal(rows.find((r) => r.uuid === uuid)?.description, legacyHairStagingText(scale, stage, description));
  }
  assert.deepEqual(db.raw.prepare('PRAGMA integrity_check').all().map((row) => ({ ...(row as object) })), [
    { integrity_check: 'ok' }
  ]);
});

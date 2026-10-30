/* Functional audit ticket 15: the patch-schedule tile is folded into the
   dose panel, so version 113 drops the switch that turned it off. Every
   other preference stays as it was. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';

test('version 113 drops the patch-schedule tile switch and keeps the dose panel one', async () => {
  const db = makeNodeSqliteDb();
  const fileOps = noopFileOps();
  await runMigrations(db, fileOps, migrations.filter((m) => m.version <= 112));
  db.raw.exec(`INSERT INTO pref (key, value) VALUES ('patchScheduleTileEnabled', 'false'),
                                                   ('dosePanelEnabled', 'false')`);

  await runMigrations(db, fileOps, migrations);

  assert.deepEqual(
    db.raw.prepare("SELECT key, value FROM pref WHERE key IN ('patchScheduleTileEnabled', 'dosePanelEnabled')")
      .all().map((row) => ({ ...(row as object) })),
    [{ key: 'dosePanelEnabled', value: 'false' }]
  );
});

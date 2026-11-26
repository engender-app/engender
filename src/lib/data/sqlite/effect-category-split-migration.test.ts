/* The effect-category split: 'genital_sexual' becomes
   'genital' and 'sexual'. Both new categories start in the state the old one
   was in, every built-in effect lands where the split puts it, and a custom
   effect a person filed under the old category moves to 'genital'. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { runMigrations } from './migration-runner.ts';
import { migrations } from './migrations.ts';
import { migratedDb, noopFileOps } from './test-support/migrated-db.ts';
import { makeNodeSqliteDb } from './test-support/node-sqlite-driver.ts';
import {
  EFFECT_CATEGORY_SPLIT,
  EFFECT_CATEGORY_SPLIT_VERSION,
  SPLIT_GENITAL_EFFECTS,
  SPLIT_SEXUAL_EFFECTS
} from './effect-category-split-migration.ts';
import { reconcileBuiltIns } from '../journal/reconcile.ts';
import { BUILT_IN_PERSONAL_EFFECT_TYPES } from '../vocabulary/builtins.ts';

const rows = (db: ReturnType<typeof makeNodeSqliteDb>, sql: string) =>
  db.raw.prepare(sql).all().map((row) => ({ ...(row as object) }));

/** A journal one step before the split, seeded the way the build before it
    seeded one: 'genital_sexual' holding all 21 effects. */
async function journalBeforeTheSplit(enabled: boolean) {
  const db = makeNodeSqliteDb();
  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version < EFFECT_CATEGORY_SPLIT_VERSION));
  db.raw.exec(`
    INSERT INTO effect_category (key, name, enabled, updated_at) VALUES
      ('body_shape', '', 1, 0), ('skin_hair', '', 1, 0), ('genital_sexual', '', ${enabled ? 1 : 0}, 1234),
      ('cognitive_emotional', '', 0, 0), ('sensory', '', 0, 0);
  `);
  const insert = db.raw.prepare(
    "INSERT INTO personal_effect_type (key, name, is_built_in, category_key, direction, updated_at) VALUES (?, '', 1, 'genital_sexual', 'feminizing', 0)"
  );
  for (const key of [...SPLIT_GENITAL_EFFECTS, ...SPLIT_SEXUAL_EFFECTS]) insert.run(key);
  db.raw.exec(`
    INSERT INTO personal_effect_type (uuid, key, name, is_built_in, category_key, direction, updated_at)
      VALUES ('c1', 'c1', 'bottom growth', 0, 'genital_sexual', NULL, 55);
    INSERT INTO personal_effect_type (key, name, is_built_in, category_key, direction, updated_at)
      VALUES ('voice_drop', '', 1, 'body_shape', 'masculinizing', 0);
  `);
  return db;
}

for (const enabled of [true, false]) {
  test(`the split carries an ${enabled ? 'enabled' : 'disabled'} genital_sexual into both new categories`, async () => {
    const db = await journalBeforeTheSplit(enabled);

    await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= EFFECT_CATEGORY_SPLIT_VERSION));

    assert.equal(db.getUserVersion(), EFFECT_CATEGORY_SPLIT_VERSION);
    assert.deepEqual(
      rows(db, "SELECT key, enabled, updated_at FROM effect_category WHERE key IN ('genital_sexual', 'genital', 'sexual') ORDER BY key"),
      [
        { key: 'genital', enabled: enabled ? 1 : 0, updated_at: 1234 },
        { key: 'sexual', enabled: enabled ? 1 : 0, updated_at: 1234 }
      ]
    );
  });
}

test('the split files each built-in effect where the catalogue now puts it, and a custom one under genital', async () => {
  const db = await journalBeforeTheSplit(false);

  await runMigrations(db, noopFileOps(), migrations.filter((m) => m.version <= EFFECT_CATEGORY_SPLIT_VERSION));

  const filed = new Map(
    rows(db, 'SELECT key, category_key FROM personal_effect_type').map((row) => {
      const { key, category_key } = row as { key: string; category_key: string };
      return [key, category_key];
    })
  );
  // The migration's own lists agree with the catalogue a fresh journal seeds.
  for (const effect of BUILT_IN_PERSONAL_EFFECT_TYPES) {
    if (filed.has(effect.key)) assert.equal(filed.get(effect.key), effect.category, effect.key);
  }
  assert.equal(filed.size, 23);
  assert.equal(filed.get('c1'), 'genital');
  assert.equal(filed.get('voice_drop'), 'body_shape');
  assert.equal([...filed.values()].includes('genital_sexual'), false);
  // A migration is not an edit: nobody's row reads as newer than it was.
  assert.deepEqual(rows(db, "SELECT updated_at FROM personal_effect_type WHERE key = 'c1'"), [{ updated_at: 55 }]);
});

test('a journal that never had genital_sexual gets both categories from the reconcile, in catalogue order', async () => {
  const db = await migratedDb();
  await reconcileBuiltIns(db);
  assert.deepEqual(
    rows(db, 'SELECT key, enabled FROM effect_category ORDER BY id'),
    [
      { key: 'body_shape', enabled: 1 },
      { key: 'skin_hair', enabled: 1 },
      { key: 'cognitive_emotional', enabled: 0 },
      { key: 'sensory', enabled: 0 },
      { key: 'genital', enabled: 0 },
      { key: 'sexual', enabled: 0 }
    ]
  );
});

test('the migration list carries 121 for the split, as the constant says', () => {
  /* migrations.ts writes the number as a literal so release-schema.mjs can read it. */
  assert.equal(migrations.find((m) => m.sql === EFFECT_CATEGORY_SPLIT)?.version, EFFECT_CATEGORY_SPLIT_VERSION);
});

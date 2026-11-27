/* Reconciling built-ins by key is one idempotent operation, called from boot and reused by
   Replace (ADR-0002, ADR-0017). */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import {
  BUILT_IN_DIMENSIONS,
  BUILT_IN_TAG_GROUPS
} from '../vocabulary/builtins.ts';
import type { TableName } from '../live/writes.ts';
import { openJournal } from './journal.ts';
import { RECONCILE_TABLES, reconcileBuiltIns } from './reconcile.ts';
import { countingDriver } from './test-support.ts';

const count = (db: Awaited<ReturnType<typeof migratedDb>>, table: string): number =>
  (db.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

test('seeds every built-in dimension, group and tag into an empty journal, and no preset', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();

  assert.equal(count(db, 'gender_dimension'), BUILT_IN_DIMENSIONS.length);
  // Legacy presets stay out of an empty journal.
  assert.equal(count(db, 'gender_preset'), 0);
  assert.equal(count(db, 'tag_group'), BUILT_IN_TAG_GROUPS.length);
  assert.equal(count(db, 'tag'), BUILT_IN_TAG_GROUPS.flatMap((g) => g.tags).length);

});

test('running twice changes nothing', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  const before = ['gender_dimension', 'gender_preset', 'tag_group', 'tag', 'preset_dimension'].map((t) =>
    count(db, t)
  );

  await journal.reconcileBuiltIns();
  const after = ['gender_dimension', 'gender_preset', 'tag_group', 'tag', 'preset_dimension'].map((t) =>
    count(db, t)
  );
  assert.deepEqual(after, before);
});

test('restores a missing built-in without touching custom rows', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  await journal.tags.addTag('emotions', 'proud');

  db.raw.exec("DELETE FROM tag WHERE key = 'e-happy'");
  await journal.reconcileBuiltIns();

  const groups = await journal.tags.getTagGroups();
  const emotions = groups.find((g) => g.key === 'emotions')!;
  assert.ok(emotions.tags.some((t) => t.id === 'e-happy'), 'e-happy restored');
  assert.ok(emotions.tags.some((t) => t.label === 'proud'), 'custom tag survived');
});

// The physical schema tables reconcileBuiltIns inserts into, mapped to the
// logical TableName writes.ts announces: a new
// built-in table added to reconcile.ts without an entry here, or without a
// matching RECONCILE_TABLES entry, fails this test instead of silently
// missing its invalidation.
const PHYSICAL_TO_LOGICAL: Record<string, TableName> = {
  gender_dimension: 'dimension',
  gender_preset: 'preset',
  preset_dimension: 'preset',
  tag_group: 'tag',
  tag: 'tag',
  body_region: 'bodyRegion',
  effect_category: 'effectCategory',
  personal_effect_type: 'personalEffectType',
  progress_pose: 'progressPhoto'
};

test('RECONCILE_TABLES names exactly the tables reconcileBuiltIns writes', async () => {
  const db = await migratedDb();
  const written = new Set<TableName>();
  const counting = countingDriver(db, {
    onRun(sql) {
      const table = /INSERT INTO\s+(\w+)/i.exec(sql)?.[1];
      if (table) {
        const logical = PHYSICAL_TO_LOGICAL[table];
        assert.ok(logical, `reconcileBuiltIns writes ${table}, which no logical table covers`);
        written.add(logical);
      }
    }
  });

  await reconcileBuiltIns(counting.driver);

  assert.deepEqual([...written].toSorted(), [...RECONCILE_TABLES].toSorted());
});

/* Three built-ins repeat another one - the two gender-group dysphoria flags repeat the
   physical and social dysphoria types, and the whole-body region repeats the
   euphoria/dysphoria scale. A journal created now seeds them hidden; a journal that already
   holds them keeps whatever it had. */
const hiddenOf = (db: Awaited<ReturnType<typeof migratedDb>>, table: string, key: string): number | undefined =>
  (db.raw.prepare(`SELECT hidden FROM ${table} WHERE key = ?`).get(key) as { hidden: number } | undefined)?.hidden;

test('a new journal seeds the duplicate built-ins hidden and their counterparts visible (FA 41)', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();

  assert.equal(hiddenOf(db, 'tag', 'g-body-dys'), 1, 'g-body-dys repeats dt-physical');
  assert.equal(hiddenOf(db, 'tag', 'g-soc-dys'), 1, 'g-soc-dys repeats dt-social');
  assert.equal(hiddenOf(db, 'body_region', 'whole_body'), 1, 'whole body repeats the euphoria/dysphoria scale');

  assert.equal(hiddenOf(db, 'tag', 'dt-physical'), 0);
  assert.equal(hiddenOf(db, 'tag', 'dt-social'), 0);
  assert.equal(hiddenOf(db, 'tag', 'g-body-eu'), 0);
  assert.equal(hiddenOf(db, 'body_region', 'chest'), 0);
  assert.equal(hiddenOf(db, 'gender_dimension', 'euphoria_dysphoria'), 0);
});

test('a reconcile over an existing journal leaves its duplicate built-ins as they were (FA 41)', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  // What a journal seeded before this ticket holds: all three visible.
  db.raw.exec("UPDATE tag SET hidden = 0 WHERE key IN ('g-body-dys', 'g-soc-dys')");
  db.raw.exec("UPDATE body_region SET hidden = 0 WHERE key = 'whole_body'");
  await journal.reconcileBuiltIns();

  assert.equal(hiddenOf(db, 'tag', 'g-body-dys'), 0);
  assert.equal(hiddenOf(db, 'tag', 'g-soc-dys'), 0);
  assert.equal(hiddenOf(db, 'body_region', 'whole_body'), 0);
});

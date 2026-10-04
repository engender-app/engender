/* The built-in catalogue's fingerprint (ux-carpet ticket 208) and the boot
   path that trusts it. */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import {
  BUILT_IN_AFFIRMATION_KEYS,
  BUILT_IN_BODY_REGIONS,
  BUILT_IN_DIMENSIONS,
  BUILT_IN_EFFECT_CATEGORIES,
  BUILT_IN_MEASUREMENT_TYPES,
  BUILT_IN_PERSONAL_EFFECT_TYPES,
  BUILT_IN_TAG_GROUPS,
  ENTRY_TEMPLATES
} from '../vocabulary/builtins.ts';
import { builtInTemplateHidden } from '../vocabulary/entryTemplates.ts';
import { BUILT_INS_FINGERPRINT, builtInsStamp } from './builtInsStamp.ts';
import { openJournal } from './journal.ts';
import { countingDriver } from './test-support.ts';

/** Everything reconcile.ts reads from the catalogue, and its own source. */
function catalogueFingerprint(): string {
  const catalogue = {
    dimensions: BUILT_IN_DIMENSIONS.map((d) => [d.key, d.min, d.max]),
    tagGroups: BUILT_IN_TAG_GROUPS.map((g) => [g.key, [...g.tags]]),
    affirmations: [...BUILT_IN_AFFIRMATION_KEYS],
    bodyRegions: [...BUILT_IN_BODY_REGIONS],
    measurementTypes: BUILT_IN_MEASUREMENT_TYPES.map((t) => t.key),
    effectCategories: BUILT_IN_EFFECT_CATEGORIES.map((c) => [c.key, c.defaultEnabled]),
    personalEffectTypes: BUILT_IN_PERSONAL_EFFECT_TYPES.map((e) => [e.key, e.category, e.direction]),
    templates: ENTRY_TEMPLATES.map((t) => [t.key, [...t.tags], Object.entries(t.dims), builtInTemplateHidden(t)])
  };
  const source = readFileSync(new URL('./reconcile.ts', import.meta.url), 'utf8');
  return createHash('sha256').update(JSON.stringify(catalogue)).update(source).digest('hex').slice(0, 16);
}

const applicationId = (db: Awaited<ReturnType<typeof migratedDb>>): number =>
  (db.raw.prepare('PRAGMA application_id').get() as { application_id: number }).application_id;

test('the recorded fingerprint is the catalogue this build reconciles', () => {
  const actual = catalogueFingerprint();
  assert.equal(
    BUILT_INS_FINGERPRINT,
    actual,
    `The built-in catalogue or reconcile.ts changed. Set BUILT_INS_FINGERPRINT in builtInsStamp.ts to '${actual}' so every journal reconciles once on its next boot.`
  );
});

test('the stamp changes with the catalogue and with the schema, and is never 0', () => {
  assert.notEqual(builtInsStamp('a', 84), builtInsStamp('b', 84));
  assert.notEqual(builtInsStamp('a', 84), builtInsStamp('a', 85));
  assert.ok(builtInsStamp() > 0);
});

test('a reconcile records the stamp in the journal header', async () => {
  const db = await migratedDb();
  assert.equal(applicationId(db), 0);
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();
  assert.equal(applicationId(db), builtInsStamp());
});

test('boot skips the reconcile, transaction and all, when the journal carries this build\'s stamp', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns();

  const statements: string[] = [];
  let transactions = 0;
  const counting = countingDriver(db, {
    onQuery: (sql) => statements.push(sql),
    onRun: (sql) => statements.push(sql)
  });
  const driver = {
    ...counting.driver,
    transaction: <T>(work: Parameters<typeof counting.driver.transaction<T>>[0]) => {
      transactions += 1;
      return counting.driver.transaction(work);
    }
  };
  await openJournal(driver, fakeFileStore()).reconcileBuiltIns({ unlessCurrent: true });
  assert.equal(transactions, 0);
  assert.deepEqual(statements, ['PRAGMA application_id']);
});

test('boot reconciles a journal whose stamp is another catalogue\'s, and restamps it', async () => {
  const db = await migratedDb();
  const journal = openJournal(db, fakeFileStore());
  await journal.reconcileBuiltIns();
  /* A journal last reconciled by a build whose catalogue lacked e-happy. */
  db.raw.exec("DELETE FROM tag WHERE key = 'e-happy'");
  db.raw.exec(`PRAGMA application_id = ${builtInsStamp('an older catalogue')}`);

  await journal.reconcileBuiltIns({ unlessCurrent: true });

  const groups = await journal.tags.getTagGroups();
  assert.ok(groups.find((g) => g.key === 'emotions')!.tags.some((t) => t.id === 'e-happy'), 'e-happy added');
  assert.equal(applicationId(db), builtInsStamp());
});

test('a journal that has never been reconciled is reconciled on boot', async () => {
  const db = await migratedDb();
  await openJournal(db, fakeFileStore()).reconcileBuiltIns({ unlessCurrent: true });
  const n = (db.raw.prepare('SELECT COUNT(*) AS n FROM gender_dimension').get() as { n: number }).n;
  assert.equal(n, BUILT_IN_DIMENSIONS.length);
});

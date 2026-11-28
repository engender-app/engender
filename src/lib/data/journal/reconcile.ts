/* Reconciling the built-in vocabulary into the journal, by key (ADR-0002).

   One idempotent operation, not a seed-if-empty branch: it adds what is missing and touches
   nothing else, so it is safe on every boot and runs again before an import applies - a
   Replace import must not be able to leave the journal short of a built-in it needs.

   Keys only, no display text: a built-in's wording lives in the message catalogue and is
   resolved at display time (F25), so name/label columns are stored as '' for built-ins and
   never read for them. */

import type { SqliteDriver } from '../sqlite/driver';
import type { TableName } from '../live/writes';
import {
  BUILT_IN_BODY_REGIONS,
  BUILT_IN_DIMENSIONS,
  BUILT_IN_EFFECT_CATEGORIES,
  BUILT_IN_PERSONAL_EFFECT_TYPES,
  BUILT_IN_PROGRESS_POSES,
  BUILT_IN_TAG_GROUPS,
  SEEDED_HIDDEN_BODY_REGIONS,
  SEEDED_HIDDEN_TAGS
} from '../vocabulary/builtins';
import { RECONCILE_TABLES } from '../live/writes';
export { RECONCILE_TABLES };

const now = (): number => Date.now();

async function presentKeys(driver: SqliteDriver, table: string): Promise<Set<string>> {
  const rows = await driver.query<{ key: string }>(`SELECT key FROM ${table} WHERE key IS NOT NULL`);
  return new Set(rows.map((r) => r.key));
}

/** With a `stamp`, also records in the journal header which catalogue it now holds
    (builtInsStamp.ts), in the same transaction, so a reconcile that fails part-way leaves
    the old stamp and the next boot tries again. */
export async function reconcileBuiltIns(driver: SqliteDriver, stamp?: number): Promise<void> {
  await driver.transaction(async (driver) => {
    await reconcileBuiltInsWithin(driver);
    /* exec, not run: a PRAGMA takes no bound parameter, and Android's
       run() goes through execSQL(sql, bindArgs) where setUserVersion
       deliberately does not (SqliteConnection.java). The stamp is a number
       this module computed, never anything typed. */
    if (stamp !== undefined) await driver.exec(`PRAGMA application_id = ${Math.trunc(stamp)}`);
  });
}

/** The same work without a transaction of its own, for the one caller that
    is already inside one: an import seeds and then swaps the journal as a
    single transaction, so that a failure leaves the database exactly as it
    was rather than as the next boot would have made it. SQLite
    has no nested transactions, which is why this is a second entry point and
    not a second implementation. */
export async function reconcileBuiltInsWithin(driver: SqliteDriver): Promise<void> {
  /* A built-in row nobody has edited is stamped 0 rather than with the time
     it was seeded: an archive Merge reads
     `updated_at` as the time of the person's last edit, and a device
     installed later must not undo a built-in another device hid. Retiring
     a built-in below is an edit, and carries the clock. */
  const seeded = 0;
  const ts = now();

  const dimensionKeys = await presentKeys(driver, 'gender_dimension');
  for (const d of BUILT_IN_DIMENSIONS) {
    if (dimensionKeys.has(d.key)) continue;
    await driver.run(
      `INSERT INTO gender_dimension (key, name, low_label, high_label, min_value, max_value, is_built_in, updated_at)
       VALUES (?, '', '', '', ?, ?, 1, ?)`,
      [d.key, d.min, d.max, seeded]
    );
  }

  /* Retire social_recognition from scale selection without deleting its
     dimension row or any values recorded against it. */
  await driver.run(
    `UPDATE gender_dimension SET hidden = 1, updated_at = ?
     WHERE key = 'social_recognition' AND is_built_in = 1 AND hidden = 0`,
    [ts]
  );

  /* Seed no retired presets. `BUILT_IN_PRESETS` still interprets older
     Archive keys and supports schema 42. Leave existing rows in place
     for export and apply whatever rows the Archive carries. Restoring
     an Archive without these presets leaves them absent. */

  const groupKeys = await presentKeys(driver, 'tag_group');
  const tagKeys = await presentKeys(driver, 'tag');
  for (const [orderIndex, g] of BUILT_IN_TAG_GROUPS.entries()) {
    if (!groupKeys.has(g.key)) {
      await driver.run(`INSERT INTO tag_group (key, name, order_index, updated_at) VALUES (?, '', ?, ?)`, [
        g.key,
        orderIndex,
        seeded
      ]);
    }
    for (const [tagIndex, tagKey] of g.tags.entries()) {
      if (tagKeys.has(tagKey)) continue;
      await driver.run(
        `INSERT INTO tag (key, group_id, label, hidden, order_index, updated_at)
         SELECT ?, id, '', ?, ?, ? FROM tag_group WHERE key = ?`,
        [tagKey, SEEDED_HIDDEN_TAGS.has(tagKey) ? 1 : 0, tagIndex, seeded, g.key]
      );
    }
  }

  const bodyRegionKeys = await presentKeys(driver, 'body_region');
  for (const key of BUILT_IN_BODY_REGIONS) {
    if (bodyRegionKeys.has(key)) continue;
    await driver.run(`INSERT INTO body_region (key, name, hidden, updated_at) VALUES (?, '', ?, ?)`, [
      key,
      SEEDED_HIDDEN_BODY_REGIONS.has(key) ? 1 : 0,
      seeded
    ]);
  }

  const progressPoseKeys = await presentKeys(driver, 'progress_pose');
  for (const key of BUILT_IN_PROGRESS_POSES) {
    if (progressPoseKeys.has(key)) continue;
    await driver.run(`INSERT INTO progress_pose (key, name, hidden, updated_at) VALUES (?, '', 0, ?)`, [key, seeded]);
  }

  const effectCategoryKeys = await presentKeys(driver, 'effect_category');
  for (const c of BUILT_IN_EFFECT_CATEGORIES) {
    if (effectCategoryKeys.has(c.key)) continue;
    await driver.run(`INSERT INTO effect_category (key, name, enabled, updated_at) VALUES (?, '', ?, ?)`, [
      c.key,
      c.defaultEnabled ? 1 : 0,
      seeded
    ]);
  }

  const personalEffectTypeKeys = await presentKeys(driver, 'personal_effect_type');
  for (const e of BUILT_IN_PERSONAL_EFFECT_TYPES) {
    if (personalEffectTypeKeys.has(e.key)) continue;
    await driver.run(
      `INSERT INTO personal_effect_type (key, name, is_built_in, category_key, direction, updated_at) VALUES (?, '', 1, ?, ?, ?)`,
      [e.key, e.category, e.direction, seeded]
    );
  }
}

/* Effect categories (phase 5 ticket 41, CONTEXT: "Effect category"): a
   named, toggleable collection over the effect catalogue - tag_group's
   own semantics (`setGroupEnabled`, tags.ts), reused rather than
   reinvented. Built-in only, no custom-category creation asked for, so
   unlike tag_group there is no add/rename/reorder here - just the get and
   the toggle. */

import type { SqliteDriver } from '../sqlite/driver';
import type { EffectCategory } from '../types';
import { assertChanged, bool, now } from './support';

export interface EffectCategoriesArea {
  /** All five (or six) built-in categories, in seed order. */
  getEffectCategories(): Promise<EffectCategory[]>;
  /** Turning a category off hides its effects from the timeline and the
      "mark a change" picker; every marker already recorded against one of
      its effects survives untouched (CONTEXT: "Tag group"'s own rule). */
  setCategoryEnabled(key: string, enabled: boolean): Promise<void>;
}

type EffectCategoryRow = { key: string; name: string; enabled: number };

const toEffectCategory = (row: EffectCategoryRow): EffectCategory => ({
  key: row.key,
  name: row.name,
  enabled: bool(row.enabled)
});

export function makeEffectCategoriesArea(driver: SqliteDriver): EffectCategoriesArea {
  return {
    async getEffectCategories() {
      const rows = await driver.query<EffectCategoryRow>('SELECT key, name, enabled FROM effect_category ORDER BY id');
      return rows.map(toEffectCategory);
    },

    async setCategoryEnabled(key, enabled) {
      const result = await driver.run('UPDATE effect_category SET enabled = ?, updated_at = ? WHERE key = ?', [
        enabled ? 1 : 0,
        now(),
        key
      ]);
      assertChanged(result, `effect category: ${key}`);
    }
  };
}

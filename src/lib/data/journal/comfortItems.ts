/* The comfort list (phase 6 ticket 14, ADR-0040, CONTEXT: "Comfort list").
   A user-authored list living inside Safe space - who to text, which walk,
   which playlist - entirely the person's own words, with nothing shipped by
   the app behind it, the same distinction ChecklistsArea's own doc comment
   draws for a checklist item. No owner and no grouping, unlike tag or
   checklist: there is exactly one list, so `reorder` takes no scoping key. */

import type { SqliteDriver } from '../sqlite/driver';
import type { ComfortItem } from '../types';
import { assertChanged, mintUuid, now } from './support';

export interface ComfortItemsArea {
  getItems(): Promise<ComfortItem[]>;
  addItem(text: string): Promise<ComfortItem>;
  editItem(id: string, text: string): Promise<void>;
  /** Idempotent: deleting an already-gone item is success. */
  deleteItem(id: string): Promise<void>;
  /** The whole order at once, the same reason TagsArea.reorder takes it
      (tags.ts) - a per-click mutation cannot express a drag. `orderedIds`
      must permute the list's items. */
  reorder(orderedIds: string[]): Promise<void>;
}

type ItemRow = { uuid: string; text: string };

const toItem = (row: ItemRow): ComfortItem => ({ id: row.uuid, text: row.text });

export function makeComfortItemsArea(driver: SqliteDriver): ComfortItemsArea {
  return {
    async getItems() {
      const rows = await driver.query<ItemRow>('SELECT uuid, text FROM comfort_item ORDER BY position, id');
      return rows.map(toItem);
    },

    async addItem(text) {
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO comfort_item (uuid, text, position, updated_at)
         VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM comfort_item), ?)`,
        [uuid, text, now()]
      );
      return { id: uuid, text };
    },

    async editItem(id, text) {
      const result = await driver.run('UPDATE comfort_item SET text = ?, updated_at = ? WHERE uuid = ?', [
        text,
        now(),
        id
      ]);
      assertChanged(result, `comfort item: ${id}`);
    },

    async deleteItem(id) {
      await driver.run('DELETE FROM comfort_item WHERE uuid = ?', [id]);
    },

    async reorder(orderedIds) {
      const rows = await driver.query<{ uuid: string }>('SELECT uuid FROM comfort_item', []);
      const current = new Set(rows.map((r) => r.uuid));
      if (orderedIds.length !== rows.length || !orderedIds.every((id) => current.has(id))) {
        throw new Error('reorder of the comfort list does not permute its items');
      }
      await driver.transaction(async () => {
        for (const [position, id] of orderedIds.entries()) {
          await driver.run('UPDATE comfort_item SET position = ?, updated_at = ? WHERE uuid = ?', [
            position,
            now(),
            id
          ]);
        }
      });
    }
  };
}

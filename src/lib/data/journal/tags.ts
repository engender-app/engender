/* The tags area (PRD F4/F17). A tag's domain id is its travelling
   identity (ADR-0002): the seeded key for a built-in, the minted uuid for
   a custom - integer rowids stay behind the seam. Built-ins hide and
   customs delete; that asymmetry is the area's one rule (F17). */

import type { SqliteDriver } from '../sqlite/driver';
import type { Tag, TagGroup } from '../types';
import { assertChanged, bool, mintUuid, now } from './support';

export interface TagsArea {
  getTagGroups(): Promise<TagGroup[]>;
  addGroup(name: string): Promise<TagGroup>;
  setGroupEnabled(key: string, enabled: boolean): Promise<void>;
  addTag(groupKey: string, label: string): Promise<Tag>;
  renameTag(id: string, label: string): Promise<void>;
  setTagHidden(id: string, hidden: boolean): Promise<void>;
  /** Customs only; built-ins hide. Removes the tag's entry links too.
      Idempotent: deleting an already-gone tag is success. */
  deleteTag(id: string): Promise<void>;
  /** The whole order at once (F17 wants a drag, and a per-click mutation
      cannot express one). `orderedIds` must permute the group's tags. */
  reorder(groupKey: string, orderedIds: string[]): Promise<void>;
}

/* A type alias, not an interface: the driver's row generic is constrained
   to Record<string, unknown>, which interfaces do not structurally satisfy. */
type TagRow = {
  id: number;
  uuid: string | null;
  key: string | null;
  label: string;
  hidden: number;
  group_id: number;
};

/** A tag's domain id: seeded key for built-ins, minted uuid for customs. */
const domainId = (row: { key: string | null; uuid: string | null }): string => row.key ?? row.uuid ?? '';

const toTag = (row: TagRow): Tag => ({
  id: domainId(row),
  label: row.label,
  builtIn: row.key !== null,
  hidden: bool(row.hidden)
});

export function makeTagsArea(driver: SqliteDriver): TagsArea {
  /* `id IS ?` twice: a built-in row has uuid NULL and a custom row has key
     NULL, so matching the one string against both columns finds exactly
     the addressed row either way. */
  const byDomainId = async (id: string): Promise<TagRow | undefined> => {
    const rows = await driver.query<TagRow>(
      'SELECT id, uuid, key, label, hidden, group_id FROM tag WHERE key = ? OR uuid = ?',
      [id, id]
    );
    return rows[0];
  };

  const groupIdByKey = async (key: string): Promise<number> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM tag_group WHERE key = ?', [key]);
    if (rows.length === 0) throw new Error(`unknown tag group: ${key}`);
    return rows[0].id;
  };

  return {
    async getTagGroups() {
      const groups = await driver.query<{ id: number; uuid: string | null; key: string; name: string; enabled: number }>(
        'SELECT id, uuid, key, name, enabled FROM tag_group ORDER BY order_index, id'
      );
      const tags = await driver.query<TagRow>(
        'SELECT id, uuid, key, label, hidden, group_id FROM tag ORDER BY order_index, id'
      );
      return groups.map((g) => ({
        key: g.key,
        name: g.name,
        enabled: bool(g.enabled),
        builtIn: g.uuid === null,
        tags: tags.filter((t) => t.group_id === g.id).map(toTag)
      }));
    },

    async addGroup(name) {
      // A custom group's key is its minted uuid: tag_group.key is NOT NULL
      // for built-ins' sake, and one identity is enough for a custom row.
      const uuid = mintUuid();
      await driver.run('INSERT INTO tag_group (uuid, key, name, order_index, updated_at) VALUES (?, ?, ?, ?, ?)', [
        uuid,
        uuid,
        name,
        1000, // after the seeded groups; reorder of groups is not offered
        now()
      ]);
      return { key: uuid, name, enabled: true, builtIn: false, tags: [] };
    },

    async setGroupEnabled(key, enabled) {
      const result = await driver.run('UPDATE tag_group SET enabled = ?, updated_at = ? WHERE key = ?', [
        enabled ? 1 : 0,
        now(),
        key
      ]);
      assertChanged(result, `tag group: ${key}`);
    },

    async addTag(groupKey, label) {
      const groupId = await groupIdByKey(groupKey);
      const uuid = mintUuid();
      await driver.run(
        `INSERT INTO tag (uuid, group_id, label, order_index, updated_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(order_index), -1) + 1 FROM tag WHERE group_id = ?), ?)`,
        [uuid, groupId, label, groupId, now()]
      );
      return { id: uuid, label, builtIn: false, hidden: false };
    },

    async renameTag(id, label) {
      const result = await driver.run('UPDATE tag SET label = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
        label,
        now(),
        id,
        id
      ]);
      assertChanged(result, `tag: ${id}`);
    },

    async setTagHidden(id, hidden) {
      const result = await driver.run('UPDATE tag SET hidden = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
        hidden ? 1 : 0,
        now(),
        id,
        id
      ]);
      assertChanged(result, `tag: ${id}`);
    },

    async deleteTag(id) {
      const row = await byDomainId(id);
      if (!row) return; // already gone
      if (row.key !== null) throw new Error(`built-in tags hide, not delete: ${id}`);
      await driver.transaction(async () => {
        await driver.run('DELETE FROM entry_tag WHERE tag_id = ?', [row.id]);
        await driver.run('DELETE FROM tag WHERE id = ?', [row.id]);
      });
    },

    async reorder(groupKey, orderedIds) {
      const groupId = await groupIdByKey(groupKey);
      const rows = await driver.query<TagRow>(
        'SELECT id, uuid, key, label, hidden, group_id FROM tag WHERE group_id = ?',
        [groupId]
      );
      const current = new Set(rows.map(domainId));
      if (orderedIds.length !== rows.length || !orderedIds.every((id) => current.has(id))) {
        throw new Error(`reorder of ${groupKey} does not permute its tags`);
      }
      await driver.transaction(async () => {
        for (const [orderIndex, id] of orderedIds.entries()) {
          await driver.run('UPDATE tag SET order_index = ?, updated_at = ? WHERE key = ? OR uuid = ?', [
            orderIndex,
            now(),
            id,
            id
          ]);
        }
      });
    }
  };
}

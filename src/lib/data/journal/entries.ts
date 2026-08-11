/* The entries area (PRD F1). Two rules carry this module:

   An entry holds at least one of mood, a dimension value, a tag, a
   non-blank note, a photo - or it does not exist (CONTEXT: "Entry").
   Enforced here so no path bypasses it.

   Dimension values write per dimension, never as a whole object: a value
   belongs to the entry, not to the preset that happened to be active when
   it was logged, so editing under a narrower preset must leave the other
   axes' rows alone. Tags, by contrast, arrive as the whole set the editor
   showed, and replace.

   Photos become writable in ticket 11; their rows are already cleaned up
   on delete here, files included, via the injected store. */

import type { SqliteDriver } from '../sqlite/driver';
import type { Entry } from '../types';
import type { PhotoFileStore } from './journal';
import { mintUuid, now, rowidByUuid } from './support';

export interface EntryInput {
  id?: number;
  epochDay?: number;
  timestamp?: number;
  mood?: number | null;
  note?: string;
  dims?: Record<string, number>;
  tags?: string[];
}

export interface EntriesArea {
  getEntry(id: number): Promise<Entry | undefined>;
  entriesForDay(epochDay: number): Promise<Entry[]>;
  /** Returns the entry's id. Inserting needs an epochDay; updating an
      unknown id throws. */
  upsertEntry(input: EntryInput): Promise<number>;
  /** Idempotent. Takes the entry's dimension values, tag links, photo
      rows and photo files with it. */
  deleteEntry(id: number): Promise<void>;
}

/* A type alias, not an interface: the driver's row generic is constrained
   to Record<string, unknown>, which interfaces do not structurally satisfy. */
type EntryRow = {
  id: number;
  epoch_day: number;
  timestamp: number;
  mood: number | null;
  note: string | null;
};

export function makeEntriesArea(driver: SqliteDriver, files: PhotoFileStore): EntriesArea {
  const dimensionIdByKey = async (key: string): Promise<number> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM gender_dimension WHERE key = ?', [key]);
    if (rows.length === 0) throw new Error(`unknown dimension: ${key}`);
    return rows[0].id;
  };

  const tagRowidByDomainId = async (id: string): Promise<number> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM tag WHERE key = ? OR uuid = ?', [id, id]);
    if (rows.length === 0) throw new Error(`unknown tag: ${id}`);
    return rows[0].id;
  };

  const dimsOf = async (entryId: number): Promise<Record<string, number>> => {
    const rows = await driver.query<{ key: string; value: number }>(
      `SELECT gd.key, edv.value FROM entry_dimension_value edv
       JOIN gender_dimension gd ON gd.id = edv.dimension_id WHERE edv.entry_id = ?`,
      [entryId]
    );
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  };

  const tagsOf = async (entryId: number): Promise<string[]> => {
    const rows = await driver.query<{ key: string | null; uuid: string | null }>(
      `SELECT t.key, t.uuid FROM entry_tag et JOIN tag t ON t.id = et.tag_id WHERE et.entry_id = ? ORDER BY t.id`,
      [entryId]
    );
    return rows.map((r) => r.key ?? r.uuid ?? '');
  };

  const photoCountOf = async (entryId: number): Promise<number> => {
    const rows = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM photo WHERE entry_id = ?', [entryId]);
    return rows[0].n;
  };

  const toEntry = async (row: EntryRow): Promise<Entry> => ({
    id: row.id,
    epochDay: row.epoch_day,
    timestamp: row.timestamp,
    mood: row.mood,
    note: row.note ?? '',
    dims: await dimsOf(row.id),
    tags: await tagsOf(row.id),
    photos: [] // rows exist from ticket 11 on; nothing renders them yet
  });

  function assertHasContent(e: { mood: number | null; note: string; dimCount: number; tagCount: number; photoCount: number }) {
    const empty = e.mood == null && !e.note.trim() && e.dimCount === 0 && e.tagCount === 0 && e.photoCount === 0;
    if (empty) throw new Error('an entry needs a mood, a dimension value, a tag, a note or a photo');
  }

  return {
    async getEntry(id) {
      const rows = await driver.query<EntryRow>(
        'SELECT id, epoch_day, timestamp, mood, note FROM entry WHERE id = ?',
        [id]
      );
      return rows[0] && toEntry(rows[0]);
    },

    async entriesForDay(epochDay) {
      const rows = await driver.query<EntryRow>(
        'SELECT id, epoch_day, timestamp, mood, note FROM entry WHERE epoch_day = ? ORDER BY timestamp, id',
        [epochDay]
      );
      return Promise.all(rows.map(toEntry));
    },

    async upsertEntry(input) {
      if (input.id != null) {
        const current = (
          await driver.query<EntryRow>('SELECT id, epoch_day, timestamp, mood, note FROM entry WHERE id = ?', [
            input.id
          ])
        )[0];
        if (!current) throw new Error(`unknown entry: ${input.id}`);

        const currentDims = await dimsOf(current.id);
        const mergedDims = { ...currentDims, ...input.dims };
        const tags = input.tags ?? (await tagsOf(current.id));
        assertHasContent({
          mood: input.mood !== undefined ? input.mood : current.mood,
          note: input.note ?? current.note ?? '',
          dimCount: Object.keys(mergedDims).length,
          tagCount: tags.length,
          photoCount: await photoCountOf(current.id)
        });

        // Resolved before the transaction so an unknown key aborts cleanly.
        const dimIds = await Promise.all(
          Object.entries(input.dims ?? {}).map(async ([key, value]) => [await dimensionIdByKey(key), value] as const)
        );
        const tagIds = input.tags && (await Promise.all(input.tags.map(tagRowidByDomainId)));

        await driver.transaction(async () => {
          await driver.run(
            'UPDATE entry SET epoch_day = ?, timestamp = ?, mood = ?, note = ?, updated_at = ? WHERE id = ?',
            [
              input.epochDay ?? current.epoch_day,
              input.timestamp ?? current.timestamp,
              input.mood !== undefined ? input.mood : current.mood,
              input.note ?? current.note ?? '',
              now(),
              current.id
            ]
          );
          for (const [dimensionId, value] of dimIds) {
            await driver.run(
              `INSERT INTO entry_dimension_value (entry_id, dimension_id, value) VALUES (?, ?, ?)
               ON CONFLICT (entry_id, dimension_id) DO UPDATE SET value = excluded.value`,
              [current.id, dimensionId, value]
            );
          }
          if (tagIds) {
            await driver.run('DELETE FROM entry_tag WHERE entry_id = ?', [current.id]);
            for (const tagId of tagIds) {
              await driver.run('INSERT INTO entry_tag (entry_id, tag_id) VALUES (?, ?)', [current.id, tagId]);
            }
          }
        });
        return current.id;
      }

      if (input.epochDay == null) throw new Error('a new entry needs an epochDay');
      const dims = input.dims ?? {};
      const tags = input.tags ?? [];
      assertHasContent({
        mood: input.mood ?? null,
        note: input.note ?? '',
        dimCount: Object.keys(dims).length,
        tagCount: tags.length,
        photoCount: 0
      });
      const dimIds = await Promise.all(
        Object.entries(dims).map(async ([key, value]) => [await dimensionIdByKey(key), value] as const)
      );
      const tagIds = await Promise.all(tags.map(tagRowidByDomainId));

      const uuid = mintUuid();
      return driver.transaction(async () => {
        await driver.run(
          'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid, input.epochDay, input.timestamp ?? now(), input.mood ?? null, input.note ?? '', now()]
        );
        const entryId = await rowidByUuid(driver, 'entry', uuid);
        for (const [dimensionId, value] of dimIds) {
          await driver.run('INSERT INTO entry_dimension_value (entry_id, dimension_id, value) VALUES (?, ?, ?)', [
            entryId,
            dimensionId,
            value
          ]);
        }
        for (const tagId of tagIds) {
          await driver.run('INSERT INTO entry_tag (entry_id, tag_id) VALUES (?, ?)', [entryId, tagId]);
        }
        return entryId;
      });
    },

    async deleteEntry(id) {
      const photos = await driver.query<{ file_path: string }>('SELECT file_path FROM photo WHERE entry_id = ?', [
        id
      ]);
      await driver.transaction(async () => {
        await driver.run('DELETE FROM photo WHERE entry_id = ?', [id]);
        await driver.run('DELETE FROM entry_dimension_value WHERE entry_id = ?', [id]);
        await driver.run('DELETE FROM entry_tag WHERE entry_id = ?', [id]);
        await driver.run('DELETE FROM entry WHERE id = ?', [id]);
      });
      // After the commit: a failed file removal must not resurrect rows,
      // and an orphaned file is what the boot sweep (ticket 11) reclaims.
      for (const p of photos) await files.remove(p.file_path);
    }
  };
}

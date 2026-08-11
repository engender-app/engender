/* The entries area (PRD F1). Two rules carry this module:

   An entry holds at least one of mood, a dimension value, a tag, a
   non-blank note, a photo - or it does not exist (CONTEXT: "Entry").
   Enforced here so no path bypasses it.

   Dimension values write per dimension, never as a whole object: a value
   belongs to the entry, not to the preset that happened to be active when
   it was logged, so editing under a narrower preset must leave the other
   dimensions' rows alone. Tags, by contrast, arrive as the whole set the editor
   showed, and replace.

   Photos become writable in ticket 11; their rows are already cleaned up
   on delete here, files included, via the injected store. */

import { EMPTY_ENTRY_ERROR, entryIsEmpty, type EntryContent } from '../entryContent';
import { foldText } from '../fold';
import { ftsMatchExpression } from '../searchQuery';
import type { SqliteDriver } from '../sqlite/driver';
import type { Entry } from '../types';
import type { PhotoFileStore } from './journal';
import { attachPhoto, photosOfEntry, removeFilesOf, type NormalizedPhoto } from './photos';
import { domainIdOf, mintUuid, now, rowidByUuid } from './support';

export interface EntryInput {
  id?: number;
  epochDay?: number;
  timestamp?: number;
  mood?: number | null;
  note?: string;
  dims?: Record<string, number>;
  tags?: string[];
  /** Photos picked in this edit, normalized and ready to store (ADR-0008).
      They arrive with the save rather than in a call after it, for two
      reasons: an entry is committed as one action (PRD F1), and a photo on
      its own is enough content for an entry - attaching afterwards would mean
      a photo-only entry is rejected as empty on the way to getting its photo.

      Additive, unlike `tags`: the photos an entry already has stay, because
      the editor has their rows but not their bytes. Removing one is
      `photos.remove`. */
  attachPhotos?: NormalizedPhoto[];
}

export interface EntriesArea {
  getEntry(id: number): Promise<Entry | undefined>;
  entriesForDay(epochDay: number): Promise<Entry[]>;
  /** Every entry on the most recent `dayCount` days that carry one, newest
      first. Days rather than rows, because Home groups by day and heads a
      group with how many entries it holds - a row limit would cut a group
      in half and make the count a lie (PRD F1). */
  recentDays(dayCount: number): Promise<Entry[]>;
  /** The entries carrying a tag, newest first, at most `limit` of them. The
      id is a tag's domain id: a built-in's key or a custom's uuid
      (ADR-0002). An unknown id yields nothing rather than throwing - this
      is a read. */
  entriesWithTag(tagId: string, limit: number): Promise<Entry[]>;
  /** Notes matching the query, unioned with the entries carrying any of
      `matchingTagIds`, newest first (ADR-0005, PRD F19).

      Matching labels to ids is the caller's half, for the reason
      searchQuery.ts sets out: pass `tagIdsMatching(query, tags)` over the
      mirrored vocabulary, or `[]` to mean "notes alone". */
  searchEntries(query: string, matchingTagIds: string[], limit?: number): Promise<Entry[]>;
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
    return rows.map((r) => domainIdOf(r, 'tag'));
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
    photos: await photosOfEntry(driver, row.id)
  });

  function assertHasContent(e: EntryContent) {
    if (entryIsEmpty(e)) throw new Error(EMPTY_ENTRY_ERROR);
  }

  /* The index is contentless, so it holds folded text against the entry's
     rowid and nothing else (ADR-0005). Every write goes through here, which
     is what keeps the fold on the index and the fold on the query the same
     function rather than the same intention.

     Clearing first makes this the same two statements for a new entry and
     for an edit. On an insert the delete matches nothing, which costs one
     statement inside a transaction and means neither caller has to know
     which case it is in.

     Deletes are not here: migration v3's trigger drops the index row with
     the entry row, so paths that delete entries without knowing about the
     index - ticket 14's Replace import - stay correct. */
  const indexEntry = async (entryId: number, note: string) => {
    await driver.run('DELETE FROM entry_fts WHERE rowid = ?', [entryId]);
    await driver.run('INSERT INTO entry_fts (rowid, folded_text) VALUES (?, ?)', [entryId, foldText(note)]);
  };

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

    async recentDays(dayCount) {
      /* The inner select picks the days, the outer one takes their entries
         whole. Filtering on a day list rather than on `LIMIT` is what keeps
         a two-entry day from arriving as one entry. */
      const rows = await driver.query<EntryRow>(
        `SELECT id, epoch_day, timestamp, mood, note FROM entry
         WHERE epoch_day IN (SELECT DISTINCT epoch_day FROM entry ORDER BY epoch_day DESC LIMIT ?)
         ORDER BY epoch_day DESC, timestamp DESC, id DESC`,
        [dayCount]
      );
      return Promise.all(rows.map(toEntry));
    },

    async entriesWithTag(tagId, limit) {
      // COALESCE(key, uuid) is a tag's domain id (ADR-0002), the same rule
      // searchEntries and the tag insights match on.
      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note FROM entry e
         JOIN entry_tag et ON et.entry_id = e.id
         JOIN tag t ON t.id = et.tag_id
         WHERE COALESCE(t.key, t.uuid) = ?
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         LIMIT ?`,
        [tagId, limit]
      );
      return Promise.all(rows.map(toEntry));
    },

    async searchEntries(query, matchingTagIds, limit) {
      /* One statement rather than two lookups unioned in JS, so ordering and
         de-duplication are the database's job: an entry whose note and tag
         both match has to appear once.

         Either half can be absent - a query of pure punctuation yields no
         match expression, a query matching no label yields no tag ids - so
         the halves are assembled rather than parameterised away. An unused
         half cannot be left in the SQL and disarmed with a parameter: an
         empty FTS5 expression is a syntax error, not an empty result, and
         whether SQLite evaluates a guard before the MATCH beside it is not
         something to depend on across three different SQLite builds. */
      const clauses: string[] = [];
      const params: (string | number)[] = [];

      const match = ftsMatchExpression(query);
      if (match) {
        clauses.push('e.id IN (SELECT rowid FROM entry_fts WHERE entry_fts MATCH ?)');
        params.push(match);
      }

      if (matchingTagIds.length > 0) {
        // COALESCE(key, uuid) is the domain id of a tag: a built-in has the
        // key, a custom row has the uuid (ADR-0002), which is the same rule
        // domainIdOf() applies when reading one back out.
        const placeholders = matchingTagIds.map(() => '?').join(', ');
        clauses.push(
          `e.id IN (
             SELECT et.entry_id FROM entry_tag et JOIN tag t ON t.id = et.tag_id
             WHERE COALESCE(t.key, t.uuid) IN (${placeholders})
           )`
        );
        params.push(...matchingTagIds);
      }

      if (clauses.length === 0) return [];

      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note FROM entry e
         WHERE ${clauses.join(' OR ')}
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         ${limit == null ? '' : 'LIMIT ?'}`,
        limit == null ? params : [...params, limit]
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
        const attaching = input.attachPhotos ?? [];
        assertHasContent({
          mood: input.mood !== undefined ? input.mood : current.mood,
          note: input.note ?? current.note ?? '',
          dimCount: Object.keys(mergedDims).length,
          tagCount: tags.length,
          photoCount: (await photoCountOf(current.id)) + attaching.length
        });

        // Resolved before the transaction so an unknown key aborts cleanly.
        const dimIds = await Promise.all(
          Object.entries(input.dims ?? {}).map(async ([key, value]) => [await dimensionIdByKey(key), value] as const)
        );
        const tagIds = input.tags && (await Promise.all(input.tags.map(tagRowidByDomainId)));
        // The note that will be stored, whether this edit supplied one or
        // not - reindexing on input.note alone would blank the index for an
        // edit that only touched the mood.
        const note = input.note ?? current.note ?? '';

        await driver.transaction(async () => {
          await driver.run(
            'UPDATE entry SET epoch_day = ?, timestamp = ?, mood = ?, note = ?, updated_at = ? WHERE id = ?',
            [
              input.epochDay ?? current.epoch_day,
              input.timestamp ?? current.timestamp,
              input.mood !== undefined ? input.mood : current.mood,
              note,
              now(),
              current.id
            ]
          );
          await indexEntry(current.id, note);
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
          for (const photo of attaching) await attachPhoto(driver, files, { entryId: current.id }, photo);
        });
        return current.id;
      }

      if (input.epochDay == null) throw new Error('a new entry needs an epochDay');
      const dims = input.dims ?? {};
      const tags = input.tags ?? [];
      const attachingNew = input.attachPhotos ?? [];
      assertHasContent({
        mood: input.mood ?? null,
        note: input.note ?? '',
        dimCount: Object.keys(dims).length,
        tagCount: tags.length,
        photoCount: attachingNew.length
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
        await indexEntry(entryId, input.note ?? '');
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
        for (const photo of attachingNew) await attachPhoto(driver, files, { entryId }, photo);
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
      await removeFilesOf(files, photos);
    }
  };
}

/* The entries area (PRD F1). Two rules carry this module:

   An entry holds at least one of mood, a dimension value, a tag, a
   non-blank note, a photo, a body-region intensity - or it does not exist
   (CONTEXT: "Entry"). Enforced here so no path bypasses it.

   Dimension values write per dimension, never as a whole object: a value
   belongs to the entry, not to the preset that happened to be active when
   it was logged, so editing under a narrower preset must leave the other
   dimensions' rows alone. Tags and body regions (ticket 09), by contrast,
   arrive as the whole set the editor showed, and replace - each picker
   shows every option every time, so an id or region key missing from a
   save is the user deselecting it.

   Photos become writable in ticket 11; their rows travel with the entry
   into trash and back (phase 5 ticket 19) rather than being cleaned up on
   delete - purgeExpiredTrash is what eventually takes them and their files
   with it, via the injected store. */

import { BODY_REGION_KEYS } from '../bodyMap';
import { EMPTY_ENTRY_ERROR, entryIsEmpty, type EntryContent } from '../entryContent';
import { foldText } from '../fold';
import { ftsMatchExpression } from '../searchQuery';
import type { SqliteDriver } from '../sqlite/driver';
import type { Entry, Photo, VoiceRecording } from '../types';
import type { PhotoFileStore } from './journal';
import {
  insertStagedPhoto,
  photosByEntry,
  removeFilesAfterCommit,
  removeFilesOf,
  stagePhoto,
  type NormalizedPhoto,
  type StagedPhoto
} from './photos';
import {
  insertStagedRecording,
  recordingsByEntry,
  removeRecordingFilesAfterCommit,
  removeRecordingFilesOf,
  stageRecording,
  type StagedRecording
} from './voiceRecordings';
import { assertChanged, bool, domainIdOf, mintUuid, now, rowidByUuid } from './support';

/** How long a trashed entry survives before purgeExpiredTrash reclaims it
    (phase 5 ticket 19). Fixed, like the hair-photo schedule's 28 days
    (hairPhotoSchedule.ts) - no per-user setting. */
export const TRASH_WINDOW_DAYS = 30;
const TRASH_WINDOW_MS = TRASH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface EntryInput {
  id?: number;
  epochDay?: number;
  timestamp?: number;
  mood?: number | null;
  note?: string;
  dims?: Record<string, number>;
  tags?: string[];
  /** By body-region key (bodyMap.ts). Arrives as the whole set the picker
      showed, and replaces - same rule as `tags`, not `dims`. */
  bodyRegions?: Record<string, number>;
  /** Photos picked in this edit, normalized and ready to store (ADR-0008).
      They arrive with the save rather than in a call after it, for two
      reasons: an entry is committed as one action (PRD F1), and a photo on
      its own is enough content for an entry - attaching afterwards would mean
      a photo-only entry is rejected as empty on the way to getting its photo.

      Additive, unlike `tags`: the photos an entry already has stay, because
      the editor has their rows but not their bytes. */
  attachPhotos?: NormalizedPhoto[];
  /** Stored photos removed in this edit. They travel with the rest of the
      entry save so its fields and photos commit as one action. */
  removePhotoIds?: string[];
  /** Recordings made in this edit, ready to store as-is (ticket 24: no
      client-side audio effects, so nothing normalizes them the way a photo
      is). Additive, the same reason attachPhotos is: the editor has the
      entry's existing recording rows but not their bytes. */
  attachRecordings?: Uint8Array[];
  /** Stored recordings removed in this edit, committed with the rest of the
      entry save the same way removePhotoIds is. */
  removeRecordingIds?: string[];
}

export interface EntrySearchFilters {
  tagIds?: string[];
  moods?: number[];
  startEpochDay?: number | null;
  endEpochDay?: number | null;
  hasNote?: boolean;
  hasPhoto?: boolean;
  /** Starred entries only (CONTEXT: "Starred") - the starred shelf's own
      query, reached from search. */
  starred?: boolean;
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
  /** Entries carrying `tagId` or starred (CONTEXT: "Starred"), newest
      first, at most `limit` of them - the doubt journal's counterevidence
      pool (ticket 14 widened this from a tag-only query so a person can
      curate their own "proof" rather than relying solely on whatever
      happened to get the tag). Not folded into entriesWithTag itself: that
      one is also the stats screen's tag-insight query, for an arbitrary
      tag, and starred entries have no business surfacing there. */
  counterevidencePool(tagId: string, limit: number): Promise<Entry[]>;
  /** Notes matching the query, unioned with the entries carrying any of
      `matchingTagIds`, newest first (ADR-0005, PRD F19).

      Matching labels to ids is the caller's half, for the reason
      searchQuery.ts sets out: pass `tagIdsMatching(query, tags)` over the
      mirrored vocabulary, or `[]` to mean "notes alone". */
  searchEntries(
    query: string,
    matchingTagIds: string[],
    filtersOrLimit?: EntrySearchFilters | number,
    limit?: number
  ): Promise<Entry[]>;
  /** How many entries the same query matches in total. Its own call because
      the search screen shows a page of hits and a count of all of them, and
      the count must not become the page size - it said "30 results" for a
      query with fifty. An aggregate, so it transfers one row however many
      match. */
  countSearchMatches(query: string, matchingTagIds: string[], filters?: EntrySearchFilters): Promise<number>;
  /** Returns the entry's id. Inserting needs an epochDay; updating an
      unknown id throws. */
  upsertEntry(input: EntryInput): Promise<number>;
  /** Idempotent. Moves the entry to trash for TRASH_WINDOW_DAYS (phase 5
      ticket 19): its dimension values, tag links and body regions stay as
      they are, its photos and recordings are left untouched, and it drops
      out of every other read this area offers until it is restored or
      purgeExpiredTrash reclaims it for good. */
  deleteEntry(id: number): Promise<void>;
  /** Brings a trashed entry back, photos and recordings included. A no-op
      on an unknown id or one that is not trashed. */
  restoreEntry(id: number): Promise<void>;
  /** Every trashed entry, most recently trashed first - the dedicated trash
      view's only read (out of scope: any other screen surfacing them). */
  trashedEntries(): Promise<TrashedEntry[]>;
  /** Starred sits outside upsertEntry's input (CONTEXT: "Starred"): it is
      curation metadata, not one of the seven content fields, so it gets
      its own toggle the way setTagHidden does rather than folding into a
      content save. Throws on an unknown id. */
  setEntryStarred(id: number, starred: boolean): Promise<void>;
}

export interface TrashedEntry extends Entry {
  trashedAt: number;
}

/* A type alias, not an interface: the driver's row generic is constrained
   to Record<string, unknown>, which interfaces do not structurally satisfy. */
type EntryRow = {
  id: number;
  epoch_day: number;
  timestamp: number;
  mood: number | null;
  note: string | null;
  starred: number;
};

type RemovedPhotoRow = { uuid: string; entry_id: number | null; file_path: string };
type RemovedRecordingRow = { uuid: string; entry_id: number; file_path: string };

export function makeEntriesArea(driver: SqliteDriver, files: PhotoFileStore): EntriesArea {
  const resolveDimensionIds = async (dims: Record<string, number>): Promise<readonly (readonly [number, number])[]> => {
    const entries = Object.entries(dims);
    if (entries.length === 0) return [];

    const keys = [...new Set(entries.map(([key]) => key))];
    const placeholders = keys.map(() => '?').join(', ');
    const rows = await driver.query<{ id: number; key: string }>(
      `SELECT id, key FROM gender_dimension WHERE key IN (${placeholders})`,
      keys
    );

    const byKey = new Map(rows.map((row) => [row.key, row.id]));
    for (const key of keys) {
      if (!byKey.has(key)) throw new Error(`unknown dimension: ${key}`);
    }

    return entries.map(([key, value]) => [byKey.get(key)!, value] as const);
  };

  const resolveTagIds = async (tagDomainIds: string[]): Promise<number[]> => {
    if (tagDomainIds.length === 0) return [];

    const unique = [...new Set(tagDomainIds)];
    const placeholders = unique.map(() => '?').join(', ');
    const rows = await driver.query<{ id: number; key: string | null; uuid: string | null }>(
      `SELECT id, key, uuid FROM tag WHERE key IN (${placeholders}) OR uuid IN (${placeholders})`,
      [...unique, ...unique]
    );

    const byDomainId = new Map<string, number>();
    for (const row of rows) byDomainId.set(domainIdOf(row, 'tag'), row.id);
    for (const tagId of unique) {
      if (!byDomainId.has(tagId)) throw new Error(`unknown tag: ${tagId}`);
    }

    return tagDomainIds.map((tagId) => byDomainId.get(tagId)!);
  };

  const upsertDimensionValues = async (
    entryId: number,
    dimensionValues: readonly (readonly [number, number])[]
  ): Promise<void> => {
    if (dimensionValues.length === 0) return;
    const values = dimensionValues.map(() => '(?, ?, ?)').join(', ');
    const params = dimensionValues.flatMap(([dimensionId, value]) => [entryId, dimensionId, value]);

    await driver.run(
      `INSERT INTO entry_dimension_value (entry_id, dimension_id, value) VALUES ${values}
       ON CONFLICT (entry_id, dimension_id) DO UPDATE SET value = excluded.value`,
      params
    );
  };

  const insertEntryTags = async (entryId: number, tagIds: readonly number[]): Promise<void> => {
    if (tagIds.length === 0) return;
    const values = tagIds.map(() => '(?, ?)').join(', ');
    const params = tagIds.flatMap((tagId) => [entryId, tagId]);
    await driver.run(`INSERT INTO entry_tag (entry_id, tag_id) VALUES ${values}`, params);
  };

  // A region is a fixed, built-in key rather than a stored row (bodyMap.ts),
  // so there is no table to resolve against - just this allowlist, checked
  // against live input the way resolveDimensionIds and resolveTagIds are.
  const KNOWN_BODY_REGIONS = new Set<string>(BODY_REGION_KEYS);

  const assertKnownBodyRegions = (bodyRegions: Record<string, number>): void => {
    for (const key of Object.keys(bodyRegions)) {
      if (!KNOWN_BODY_REGIONS.has(key)) throw new Error(`unknown body region: ${key}`);
    }
  };

  const insertBodyRegions = async (entryId: number, bodyRegions: Record<string, number>): Promise<void> => {
    const entries = Object.entries(bodyRegions);
    if (entries.length === 0) return;
    const values = entries.map(() => '(?, ?, ?)').join(', ');
    const params = entries.flatMap(([region, intensity]) => [entryId, region, intensity]);
    await driver.run(`INSERT INTO entry_body_region (entry_id, region, intensity) VALUES ${values}`, params);
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

  const bodyRegionsOf = async (entryId: number): Promise<Record<string, number>> => {
    const rows = await driver.query<{ region: string; intensity: number }>(
      'SELECT region, intensity FROM entry_body_region WHERE entry_id = ?',
      [entryId]
    );
    return Object.fromEntries(rows.map((r) => [r.region, r.intensity]));
  };

  const photoCountOf = async (entryId: number): Promise<number> => {
    const rows = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM photo WHERE entry_id = ?', [entryId]);
    return rows[0].n;
  };

  const recordingCountOf = async (entryId: number): Promise<number> => {
    const rows = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM voice_recording WHERE entry_id = ?', [
      entryId
    ]);
    return rows[0].n;
  };

  const photosToRemove = async (entryId: number | null, ids: string[]): Promise<RemovedPhotoRow[]> =>
    Promise.all(
      [...new Set(ids)].map(async (id) => {
        const rows = await driver.query<RemovedPhotoRow>(
          'SELECT uuid, entry_id, file_path FROM photo WHERE uuid = ?',
          [id]
        );
        if (!rows[0]) throw new Error(`unknown photo: ${id}`);
        if (entryId == null) throw new Error(`photo ${id} does not belong to a new entry`);
        if (rows[0].entry_id !== entryId) throw new Error(`photo ${id} does not belong to entry: ${entryId}`);
        return rows[0];
      })
    );

  const recordingsToRemove = async (entryId: number | null, ids: string[]): Promise<RemovedRecordingRow[]> =>
    Promise.all(
      [...new Set(ids)].map(async (id) => {
        const rows = await driver.query<RemovedRecordingRow>(
          'SELECT uuid, entry_id, file_path FROM voice_recording WHERE uuid = ?',
          [id]
        );
        if (!rows[0]) throw new Error(`unknown recording: ${id}`);
        if (entryId == null) throw new Error(`recording ${id} does not belong to a new entry`);
        if (rows[0].entry_id !== entryId) throw new Error(`recording ${id} does not belong to entry: ${entryId}`);
        return rows[0];
      })
    );

  /* A page of entries in a fixed number of queries rather than three per
     row. Every driver call is one serialized crossing of the Android bridge
     (android-driver.ts) costing tens of milliseconds whatever SQL sits
     behind it, so a thirty-hit search hydrated row by row spent about
     ninety crossings on work that four answer. Promise.all did not save it:
     the driver queues, so those were ninety in a row.

     Chunked because the ids go in as bound parameters and SQLite caps how
     many a statement may carry - 999 on the oldest build in play. Callers
     that take a limit stay inside one chunk; searchEntries without one, and
     recentDays over a long journal, do not. */
  const ID_CHUNK = 400;

  const hydrate = async (rows: EntryRow[]): Promise<Entry[]> => {
    if (rows.length === 0) return [];

    const dims = new Map<number, Record<string, number>>();
    const tags = new Map<number, string[]>();
    const photos = new Map<number, Photo[]>();
    const recordings = new Map<number, VoiceRecording[]>();
    const bodyRegions = new Map<number, Record<string, number>>();

    for (let from = 0; from < rows.length; from += ID_CHUNK) {
      const ids = rows.slice(from, from + ID_CHUNK).map((row) => row.id);
      const placeholders = ids.map(() => '?').join(', ');

      const dimRows = await driver.query<{ entry_id: number; key: string; value: number }>(
        `SELECT edv.entry_id, gd.key, edv.value FROM entry_dimension_value edv
         JOIN gender_dimension gd ON gd.id = edv.dimension_id
         WHERE edv.entry_id IN (${placeholders})`,
        ids
      );
      for (const row of dimRows) {
        const forEntry = dims.get(row.entry_id) ?? {};
        forEntry[row.key] = row.value;
        dims.set(row.entry_id, forEntry);
      }

      // ORDER BY t.id, as tagsOf has it: the order a tag list arrives in is
      // what the entry editor renders.
      const tagRows = await driver.query<{ entry_id: number; key: string | null; uuid: string | null }>(
        `SELECT et.entry_id, t.key, t.uuid FROM entry_tag et JOIN tag t ON t.id = et.tag_id
         WHERE et.entry_id IN (${placeholders}) ORDER BY t.id`,
        ids
      );
      for (const row of tagRows) {
        const forEntry = tags.get(row.entry_id) ?? [];
        forEntry.push(domainIdOf(row, 'tag'));
        tags.set(row.entry_id, forEntry);
      }

      for (const [entryId, forEntry] of await photosByEntry(driver, ids)) photos.set(entryId, forEntry);
      for (const [entryId, forEntry] of await recordingsByEntry(driver, ids)) recordings.set(entryId, forEntry);

      const bodyRegionRows = await driver.query<{ entry_id: number; region: string; intensity: number }>(
        `SELECT entry_id, region, intensity FROM entry_body_region WHERE entry_id IN (${placeholders})`,
        ids
      );
      for (const row of bodyRegionRows) {
        const forEntry = bodyRegions.get(row.entry_id) ?? {};
        forEntry[row.region] = row.intensity;
        bodyRegions.set(row.entry_id, forEntry);
      }
    }

    return rows.map((row) => ({
      id: row.id,
      epochDay: row.epoch_day,
      timestamp: row.timestamp,
      mood: row.mood,
      note: row.note ?? '',
      dims: dims.get(row.id) ?? {},
      tags: tags.get(row.id) ?? [],
      photos: photos.get(row.id) ?? [],
      recordings: recordings.get(row.id) ?? [],
      bodyRegions: bodyRegions.get(row.id) ?? {},
      starred: bool(row.starred)
    }));
  };

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
  /* Which entries a search matches, as one WHERE clause plus its parameters -
     shared by the page of hits and the count of all of them, so the two can
     never disagree about what matched.

     One clause rather than two lookups unioned in JS, so ordering and
     de-duplication are the database's job: an entry whose note and tag both
     match has to appear once.

     Either half can be absent - a query of pure punctuation yields no match
     expression, a query matching no label yields no tag ids - so the halves
     are assembled rather than parameterised away, and null means "do not go
     to the database at all". An unused half cannot be left in the SQL and
     disarmed with a parameter: an empty FTS5 expression is a syntax error,
     not an empty result, and whether SQLite evaluates a guard before the
     MATCH beside it is not something to depend on across three different
     SQLite builds. */
  const searchMatches = (
    query: string,
    matchingTagIds: string[],
    filters: EntrySearchFilters
  ): { where: string; params: (string | number)[] } | null => {
    const clauses: string[] = [];
    const params: (string | number)[] = [];

    const textOrLabel: string[] = [];
    const match = ftsMatchExpression(query);
    if (match) {
      textOrLabel.push('e.id IN (SELECT rowid FROM entry_fts WHERE entry_fts MATCH ?)');
      params.push(match);
    }

    if (matchingTagIds.length > 0) {
      // COALESCE(key, uuid) is the domain id of a tag: a built-in has the key,
      // a custom row has the uuid (ADR-0002), which is the same rule
      // domainIdOf() applies when reading one back out.
      const placeholders = matchingTagIds.map(() => '?').join(', ');
      textOrLabel.push(
        `e.id IN (
           SELECT et.entry_id FROM entry_tag et JOIN tag t ON t.id = et.tag_id
           WHERE COALESCE(t.key, t.uuid) IN (${placeholders})
         )`
      );
      params.push(...matchingTagIds);
    }

    if (textOrLabel.length > 0) clauses.push(`(${textOrLabel.join(' OR ')})`);

    if ((filters.tagIds ?? []).length > 0) {
      const placeholders = filters.tagIds!.map(() => '?').join(', ');
      clauses.push(
        `e.id IN (
           SELECT et.entry_id FROM entry_tag et JOIN tag t ON t.id = et.tag_id
           WHERE COALESCE(t.key, t.uuid) IN (${placeholders})
         )`
      );
      params.push(...filters.tagIds!);
    }

    if ((filters.moods ?? []).length > 0) {
      const placeholders = filters.moods!.map(() => '?').join(', ');
      clauses.push(`e.mood IN (${placeholders})`);
      params.push(...filters.moods!);
    }

    if (filters.startEpochDay != null) {
      clauses.push('e.epoch_day >= ?');
      params.push(filters.startEpochDay);
    }
    if (filters.endEpochDay != null) {
      clauses.push('e.epoch_day <= ?');
      params.push(filters.endEpochDay);
    }
    if (filters.hasNote) {
      clauses.push("TRIM(COALESCE(e.note, '')) <> ''");
    }
    if (filters.hasPhoto) {
      clauses.push('EXISTS (SELECT 1 FROM photo p WHERE p.entry_id = e.id)');
    }
    if (filters.starred) {
      clauses.push('e.starred = 1');
    }

    return clauses.length === 0 ? null : { where: clauses.join(' AND '), params };
  };

  const searchArgs = (
    filtersOrLimit?: EntrySearchFilters | number,
    limit?: number
  ): { filters: EntrySearchFilters; limit?: number } => {
    if (typeof filtersOrLimit === 'number') return { filters: {}, limit: filtersOrLimit };
    return { filters: filtersOrLimit ?? {}, limit };
  };

  const indexEntry = async (entryId: number, note: string) => {
    await driver.run('DELETE FROM entry_fts WHERE rowid = ?', [entryId]);
    await driver.run('INSERT INTO entry_fts (rowid, folded_text) VALUES (?, ?)', [entryId, foldText(note)]);
  };

  return {
    async getEntry(id) {
      const rows = await driver.query<EntryRow>(
        'SELECT id, epoch_day, timestamp, mood, note, starred FROM entry WHERE id = ? AND trashed_at IS NULL',
        [id]
      );
      return rows[0] && (await hydrate(rows))[0];
    },

    async entriesForDay(epochDay) {
      const rows = await driver.query<EntryRow>(
        `SELECT id, epoch_day, timestamp, mood, note, starred FROM entry
         WHERE epoch_day = ? AND trashed_at IS NULL ORDER BY timestamp, id`,
        [epochDay]
      );
      return hydrate(rows);
    },

    async recentDays(dayCount) {
      /* The inner select picks the days, the outer one takes their entries
         whole. Filtering on a day list rather than on `LIMIT` is what keeps
         a two-entry day from arriving as one entry. Trashed entries are
         excluded from both: a day whose only entry is trashed must not
         count towards the days this picks. */
      const rows = await driver.query<EntryRow>(
        `SELECT id, epoch_day, timestamp, mood, note, starred FROM entry
         WHERE trashed_at IS NULL
           AND epoch_day IN (
             SELECT DISTINCT epoch_day FROM entry WHERE trashed_at IS NULL ORDER BY epoch_day DESC LIMIT ?
           )
         ORDER BY epoch_day DESC, timestamp DESC, id DESC`,
        [dayCount]
      );
      return hydrate(rows);
    },

    async entriesWithTag(tagId, limit) {
      // COALESCE(key, uuid) is a tag's domain id (ADR-0002), the same rule
      // searchEntries and the tag insights match on.
      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred FROM entry e
         JOIN entry_tag et ON et.entry_id = e.id
         JOIN tag t ON t.id = et.tag_id
         WHERE COALESCE(t.key, t.uuid) = ? AND e.trashed_at IS NULL
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         LIMIT ?`,
        [tagId, limit]
      );
      return hydrate(rows);
    },

    async counterevidencePool(tagId, limit) {
      // EXISTS rather than a JOIN: a starred entry carrying several other
      // tags would otherwise arrive once per tag row, since the tag match
      // itself has to live in the WHERE clause (an entry need not carry
      // `tagId` at all to qualify here) rather than the JOIN condition.
      // Trashed entries are excluded the same way every other read here is
      // (phase 5 ticket 19) - a trashed entry is not counterevidence for
      // anything until it is restored.
      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred FROM entry e
         WHERE e.trashed_at IS NULL
           AND (
             e.starred = 1
             OR EXISTS (
               SELECT 1 FROM entry_tag et JOIN tag t ON t.id = et.tag_id
               WHERE et.entry_id = e.id AND COALESCE(t.key, t.uuid) = ?
             )
           )
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         LIMIT ?`,
        [tagId, limit]
      );
      return hydrate(rows);
    },

    async searchEntries(query, matchingTagIds, filtersOrLimit, limit) {
      const args = searchArgs(filtersOrLimit, limit);
      const matches = searchMatches(query, matchingTagIds, args.filters);
      if (!matches) return [];

      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred FROM entry e
         WHERE e.trashed_at IS NULL AND ${matches.where}
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         ${args.limit == null ? '' : 'LIMIT ?'}`,
        args.limit == null ? matches.params : [...matches.params, args.limit]
      );
      return hydrate(rows);
    },

    async countSearchMatches(query, matchingTagIds, filters = {}) {
      const matches = searchMatches(query, matchingTagIds, filters);
      if (!matches) return 0;
      const rows = await driver.query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM entry e WHERE e.trashed_at IS NULL AND ${matches.where}`,
        matches.params
      );
      return rows[0].n;
    },

    async trashedEntries() {
      const rows = await driver.query<EntryRow & { trashed_at: number }>(
        `SELECT id, epoch_day, timestamp, mood, note, starred, trashed_at FROM entry
         WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC`
      );
      const trashedAtById = new Map(rows.map((row) => [row.id, row.trashed_at]));
      const hydrated = await hydrate(rows);
      return hydrated.map((entry) => ({ ...entry, trashedAt: trashedAtById.get(entry.id)! }));
    },

    async upsertEntry(input) {
      if (input.id != null) {
        const current = (
          await driver.query<EntryRow>(
            'SELECT id, epoch_day, timestamp, mood, note FROM entry WHERE id = ? AND trashed_at IS NULL',
            [input.id]
          )
        )[0];
        if (!current) throw new Error(`unknown entry: ${input.id}`);
        const mood = input.mood !== undefined ? input.mood : current.mood;
        if (mood == null) throw new Error('an entry needs a mood');

        const currentDims = await dimsOf(current.id);
        const mergedDims = { ...currentDims, ...input.dims };
        const tags = input.tags ?? (await tagsOf(current.id));
        const bodyRegions = input.bodyRegions ?? (await bodyRegionsOf(current.id));
        const attaching = input.attachPhotos ?? [];
        const removedPhotos = await photosToRemove(current.id, input.removePhotoIds ?? []);
        const attachingRecordings = input.attachRecordings ?? [];
        const removedRecordings = await recordingsToRemove(current.id, input.removeRecordingIds ?? []);
        assertHasContent({
          mood,
          note: input.note ?? current.note ?? '',
          dimCount: Object.keys(mergedDims).length,
          tagCount: tags.length,
          photoCount: (await photoCountOf(current.id)) - removedPhotos.length + attaching.length,
          recordingCount:
            (await recordingCountOf(current.id)) - removedRecordings.length + attachingRecordings.length,
          bodyRegionCount: Object.keys(bodyRegions).length
        });

        // Resolved before the transaction so an unknown key aborts cleanly.
        const dimIds = await resolveDimensionIds(input.dims ?? {});
        const tagIds = input.tags && (await resolveTagIds(input.tags));
        if (input.bodyRegions) assertKnownBodyRegions(input.bodyRegions);
        // The note that will be stored, whether this edit supplied one or
        // not - reindexing on input.note alone would blank the index for an
        // edit that only touched the mood.
        const note = input.note ?? current.note ?? '';
        const stagedPhotos: StagedPhoto[] = [];
        for (const photo of attaching) stagedPhotos.push(await stagePhoto(files, photo));
        const stagedRecordings: StagedRecording[] = [];
        for (const bytes of attachingRecordings) stagedRecordings.push(await stageRecording(files, bytes));

        await driver.transaction(async () => {
          await driver.run(
            'UPDATE entry SET epoch_day = ?, timestamp = ?, mood = ?, note = ?, updated_at = ? WHERE id = ?',
            [
              input.epochDay ?? current.epoch_day,
              input.timestamp ?? current.timestamp,
              mood,
              note,
              now(),
              current.id
            ]
          );
          await indexEntry(current.id, note);
          await upsertDimensionValues(current.id, dimIds);
          if (tagIds) {
            await driver.run('DELETE FROM entry_tag WHERE entry_id = ?', [current.id]);
            await insertEntryTags(current.id, tagIds);
          }
          if (input.bodyRegions) {
            await driver.run('DELETE FROM entry_body_region WHERE entry_id = ?', [current.id]);
            await insertBodyRegions(current.id, input.bodyRegions);
          }
          for (const photo of removedPhotos) {
            await driver.run('DELETE FROM photo WHERE uuid = ? AND entry_id = ?', [photo.uuid, current.id]);
          }
          for (const photo of stagedPhotos) {
            await insertStagedPhoto(driver, { entryId: current.id, milestoneId: null }, photo);
          }
          for (const recording of removedRecordings) {
            await driver.run('DELETE FROM voice_recording WHERE uuid = ? AND entry_id = ?', [
              recording.uuid,
              current.id
            ]);
          }
          for (const recording of stagedRecordings) {
            await insertStagedRecording(driver, current.id, recording);
          }
        });
        await removeFilesAfterCommit(files, removedPhotos);
        await removeRecordingFilesAfterCommit(files, removedRecordings);
        return current.id;
      }

      if (input.epochDay == null) throw new Error('a new entry needs an epochDay');
      const dims = input.dims ?? {};
      const tags = input.tags ?? [];
      const bodyRegions = input.bodyRegions ?? {};
      const attachingNew = input.attachPhotos ?? [];
      const attachingRecordingsNew = input.attachRecordings ?? [];
      const mood = input.mood;
      if (mood == null) throw new Error('an entry needs a mood');
      await photosToRemove(null, input.removePhotoIds ?? []);
      await recordingsToRemove(null, input.removeRecordingIds ?? []);
      assertHasContent({
        mood,
        note: input.note ?? '',
        dimCount: Object.keys(dims).length,
        tagCount: tags.length,
        photoCount: attachingNew.length,
        recordingCount: attachingRecordingsNew.length,
        bodyRegionCount: Object.keys(bodyRegions).length
      });
      const dimIds = await resolveDimensionIds(dims);
      const tagIds = await resolveTagIds(tags);
      assertKnownBodyRegions(bodyRegions);
      const stagedPhotos: StagedPhoto[] = [];
      for (const photo of attachingNew) stagedPhotos.push(await stagePhoto(files, photo));
      const stagedRecordings: StagedRecording[] = [];
      for (const bytes of attachingRecordingsNew) stagedRecordings.push(await stageRecording(files, bytes));

      const uuid = mintUuid();
      return driver.transaction(async () => {
        await driver.run(
          'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [uuid, input.epochDay, input.timestamp ?? now(), mood, input.note ?? '', now()]
        );
        const entryId = await rowidByUuid(driver, 'entry', uuid);
        await indexEntry(entryId, input.note ?? '');
        await upsertDimensionValues(entryId, dimIds);
        await insertEntryTags(entryId, tagIds);
        await insertBodyRegions(entryId, bodyRegions);
        for (const photo of stagedPhotos) {
          await insertStagedPhoto(driver, { entryId, milestoneId: null }, photo);
        }
        for (const recording of stagedRecordings) {
          await insertStagedRecording(driver, entryId, recording);
        }
        return entryId;
      });
    },

    async deleteEntry(id) {
      // Marks the row rather than removing it (phase 5 ticket 19): the
      // dimension values, tag links, body regions, photo rows and
      // recording rows all stay exactly as they are, so restoreEntry has
      // them to bring back. Only the search index drops the entry now -
      // trashed_at IS NULL on every other read is what hides the rest.
      await driver.run('UPDATE entry SET trashed_at = ? WHERE id = ? AND trashed_at IS NULL', [now(), id]);
      await driver.run('DELETE FROM entry_fts WHERE rowid = ?', [id]);
    },

    async restoreEntry(id) {
      const current = (await driver.query<{ note: string | null }>(
        'SELECT note FROM entry WHERE id = ? AND trashed_at IS NOT NULL',
        [id]
      ))[0];
      if (!current) return;
      await driver.run('UPDATE entry SET trashed_at = NULL WHERE id = ?', [id]);
      await indexEntry(id, current.note ?? '');
    },

    async setEntryStarred(id, starred) {
      const result = await driver.run('UPDATE entry SET starred = ?, updated_at = ? WHERE id = ?', [
        starred ? 1 : 0,
        now(),
        id
      ]);
      assertChanged(result, `entry: ${id}`);
    }
  };
}

/** Reclaims every entry trashed more than TRASH_WINDOW_DAYS ago, the same
    hard delete deleteEntry used to do directly (dimension values, tag
    links, body regions, photo/recording rows and files), run once at boot
    after migrations (boot.ts), mirroring sweepOrphanPhotos's shape. */
export async function purgeExpiredTrash(driver: SqliteDriver, files: PhotoFileStore): Promise<void> {
  const cutoff = now() - TRASH_WINDOW_MS;
  const expired = await driver.query<{ id: number }>(
    'SELECT id FROM entry WHERE trashed_at IS NOT NULL AND trashed_at <= ?',
    [cutoff]
  );
  if (expired.length === 0) return;
  const ids = expired.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(', ');

  const photos = await driver.query<{ file_path: string }>(
    `SELECT file_path FROM photo WHERE entry_id IN (${placeholders})`,
    ids
  );
  const recordings = await driver.query<{ file_path: string }>(
    `SELECT file_path FROM voice_recording WHERE entry_id IN (${placeholders})`,
    ids
  );

  await driver.transaction(async () => {
    await driver.run(`DELETE FROM photo WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM voice_recording WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM entry_dimension_value WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM entry_tag WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM entry_body_region WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM entry WHERE id IN (${placeholders})`, ids);
  });
  // After the commit, the same reasoning deleteEntry's old hard delete gave:
  // a failed file removal must not resurrect rows, and an orphaned file is
  // what the boot orphan sweep (sweepOrphanPhotos) reclaims next.
  await removeFilesOf(files, photos);
  await removeRecordingFilesOf(files, recordings);
}

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

import { bodyRegionIsLogged } from '../bodyMap';
import type { WordFrequencySource } from '../wordFrequency';
import { GOOD_DAY_REGION_EUPHORIA_FLOOR } from './stats';
import {
  BAD_MOMENT_MOOD_CEILING,
  BAD_MOMENT_REGION_DYSPHORIA_FLOOR,
  DYSPHORIA_TAG_KEYS
} from '../safeSpaceNudge';
import { EMPTY_ENTRY_ERROR, entryIsEmpty, type EntryContent } from '../entryContent';
import { foldText } from '../fold';
import { ftsMatchExpression } from '../searchQuery';
import type { SqliteDriver } from '../sqlite/driver';
import type { BodyRegionFeeling, Entry, Photo, VideoNote, VoiceRecording } from '../types';
import type { PhotoFileStore } from '../photos/photo-file-store';
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
import {
  insertStagedVideo,
  removeVideoFilesAfterCommit,
  removeVideoFilesOf,
  stageVideo,
  videosByEntry,
  type StagedVideo
} from './videoNotes';
import { assertChanged, bool, domainIdOf, mintUuid, now, rowidByUuid } from './support';
import { watchJournalWrites } from '../journal-busy';
import { startOfDayTimestamp } from '../epochDay';
import type { CycleEventKind, DoseRoute, DoseStatus, InjectionVehicle, PersonalEffectType } from '../types';
import type { ApplicationSiteKey, InjectionSiteKey } from '../doseSchedule';

/** How long a trashed entry survives before purgeExpiredTrash reclaims it
    (phase 5 ticket 19). Fixed, like the hair-photo schedule's 28 days
    (hairPhotoSchedule.ts) - no per-user setting. */
export const TRASH_WINDOW_DAYS = 30;
const TRASH_WINDOW_MS = TRASH_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export interface EntryTryoutFeltSenseInput {
  tryoutId: string;
  mood: number;
  note?: string | null;
  epochDay?: number;
}

export interface EntryDoseLogInput {
  timestamp?: number;
  dose: number;
  doseUnit: string;
  route?: DoseRoute;
  drug?: string | null;
  status?: DoseStatus;
  injectionSite?: InjectionSiteKey;
  vehicle?: InjectionVehicle;
  applicationSite?: ApplicationSiteKey;
}

export interface EntryProcedureRecoveryInput {
  procedureId: string;
  notes?: string;
  photo?: NormalizedPhoto;
}

export interface EntryEffectMarkerInput {
  effect: PersonalEffectType;
  firstNoticedEpochDay?: number;
}

export interface EntryCycleEventInput {
  kind: CycleEventKind;
  epochDay?: number;
}

export interface EntryInput {
  id?: number;
  epochDay?: number;
  timestamp?: number;
  mood?: number | null;
  note?: string;
  dims?: Record<string, number>;
  tags?: string[];
  /** By body-region domain id (bodyRegions.ts). Arrives as the whole set the picker
      showed, and replaces - same rule as `tags`, not `dims`. */
  bodyRegions?: Record<string, BodyRegionFeeling>;
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
  /** Video notes made in this edit, already capped and re-encoded by the
      editor (videoNotes/limits.ts) - the journal stores what it is handed,
      the same contract NormalizedPhoto states. Absent leaves the entry's
      existing video rows alone; the bytes are never re-read from them. */
  attachVideos?: Uint8Array[];
  /** Stored video notes removed in this edit, committed with the rest of the
      save. */
  removeVideoIds?: string[];
  /** Contextual tryout felt-sense reflection (ADR-0044). */
  tryoutFeltSense?: EntryTryoutFeltSenseInput;
  /** Contextual scheduled dose quick-log (ADR-0044). */
  doseLog?: EntryDoseLogInput;
  /** Contextual post-op procedure recovery note and wound photo (ADR-0044). */
  procedureRecovery?: EntryProcedureRecoveryInput;
  /** Contextual HRT physical effect noticed milestone (ADR-0044). */
  effectMarker?: EntryEffectMarkerInput;
  /** Contextual cycle event (ADR-0044). */
  cycleEvent?: EntryCycleEventInput;
  /** The presentation this entry is filed under (phase 5 deepening ticket
      17, ADR-0048), a domain id or null to clear it. Undefined leaves the
      entry's current presentation alone, the same `undefined` vs. explicit
      `null` rule `mood` and `note` already answer to - a save that never
      touched the chip must not silently unset it. Commits with the rest of
      the entry in this one transaction (ADR-0044). */
  presentationId?: string | null;
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
  /** Entries carrying any of `tagIds` or starred (CONTEXT: "Starred"),
      newest first, at most `limit` of them - the doubt journal's
      counterevidence pool (ticket 14 widened this from a tag-only query so
      a person can curate their own "proof" rather than relying solely on
      whatever happened to get the tag; ticket 32 widened `tagId` to
      `tagIds` so the caller can pass all three euphoria tags rather than
      just the general one). Not folded into entriesWithTag itself: that
      one is also the stats screen's tag-insight query, for an arbitrary
      tag, and starred entries have no business surfacing there. */
  counterevidencePool(tagIds: readonly string[], limit: number): Promise<Entry[]>;
  /** The most recent entry qualifying as a bad moment (lowest mood, dysphoria tag,
      body-region dysphoria intensity >= 50, or euphoria_dysphoria <= 20), newest first
      (ticket 50, ADR-0040). Returns undefined when no such entry exists. */
  latestBadMomentEntry(dysphoriaTagIds?: readonly string[]): Promise<Entry | undefined>;
  /** The same entry's id alone, `undefined` when there is none. Its own read
      rather than a field off the one above, because hydrating an entry costs
      six more statements pulling dimension values, tag links, photos,
      recordings, video notes and body regions - and a surface offering to
      revisit a bad moment needs the id it would link to and nothing else
      (phase 8 audit ticket 13). */
  latestBadMomentEntryId(dysphoriaTagIds?: readonly string[]): Promise<number | undefined>;
  /** The day of the most recent untrashed entry at or before `todayEpochDay`,
      or null if there is none (phase 8 features ticket 03, lastWrite.ts). One
      bounded `MAX`, not a fetched list reduced in JS. A row dated after today
      is excluded rather than trusted - the last-write registry never lets a
      clock-skewed row stand in for the truth. */
  lastWriteEpochDay(todayEpochDay: number): Promise<number | null>;
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
  /** How many untrashed entries the journal holds, over all of its history
      (phase 8 UX ticket 01). Home's count line, and Safe Space's body of
      work.

      Its own narrow read rather than a field on the recap: a recap pays for
      six queries including two window functions and is scoped to a range,
      and this is one `COUNT(*)` over the one table. Entries rather than the
      days they fall on - a day carrying three of them is three. */
  countAll(): Promise<number>;
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
  /** Every untrashed entry carrying a non-empty note, in no particular
      order - what a text fold needs (phase 8 features ticket 14's
      word-frequency fold) and nothing `hydrate()` also fetches: no dims,
      tags, photos, recordings or body regions, none of which a fold over
      note text reads. A blank note contributes no words, so it is excluded
      at the query rather than filtered by every caller. */
  noteEntries(): Promise<WordFrequencySource[]>;
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
  presentation_id: string | null;
};

type RemovedPhotoRow = { uuid: string; entry_id: number | null; file_path: string };
type RemovedRecordingRow = { uuid: string; entry_id: number; file_path: string };
type RemovedVideoRow = { uuid: string; entry_id: number; file_path: string };

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

  // A region is a reference-data row since ticket 30, addressed by its
  // domain id (key for a built-in, uuid for a custom) - checked against the
  // body_region table the same way resolveTagIds checks tag ids, rather
  // than the closed BODY_REGION_KEYS list this used to hold in code.
  const assertKnownBodyRegions = async (bodyRegions: Record<string, BodyRegionFeeling>): Promise<void> => {
    const keys = Object.keys(bodyRegions);
    if (keys.length === 0) return;

    const unique = [...new Set(keys)];
    const placeholders = unique.map(() => '?').join(', ');
    const rows = await driver.query<{ key: string | null; uuid: string | null }>(
      `SELECT key, uuid FROM body_region WHERE key IN (${placeholders}) OR uuid IN (${placeholders})`,
      [...unique, ...unique]
    );

    const known = new Set<string>();
    for (const row of rows) {
      if (row.key !== null) known.add(row.key);
      if (row.uuid !== null) known.add(row.uuid);
    }
    for (const key of unique) {
      if (!known.has(key)) throw new Error(`unknown body region: ${key}`);
    }
  };

  // A presentation is addressed by its uuid alone - it ships no built-ins
  // (ADR-0048), so unlike a tag or a body region there is no key to also
  // check.
  const assertKnownPresentation = async (id: string): Promise<void> => {
    const rows = await driver.query<{ id: number }>('SELECT id FROM presentation WHERE uuid = ?', [id]);
    if (rows.length === 0) throw new Error(`unknown presentation: ${id}`);
  };

  const countLoggedRegions = (bodyRegions: Record<string, BodyRegionFeeling>): number =>
    Object.values(bodyRegions).filter(bodyRegionIsLogged).length;

  // A region whose two axes are both null says nothing its absence does not
  // already say, so it never reaches the table - the v33 CHECK would reject
  // it anyway. The editor keeps such a region on screen while it is being
  // filled in; dropping it here is what stops a picked-then-ignored region
  // from being saved as a blank row.
  const insertBodyRegions = async (entryId: number, bodyRegions: Record<string, BodyRegionFeeling>): Promise<void> => {
    const entries = Object.entries(bodyRegions).filter(([, f]) => bodyRegionIsLogged(f));
    if (entries.length === 0) return;
    const values = entries.map(() => '(?, ?, ?, ?)').join(', ');
    const params = entries.flatMap(([region, f]) => [entryId, region, f.dysphoria, f.euphoria]);
    await driver.run(
      `INSERT INTO entry_body_region (entry_id, region, dysphoria, euphoria) VALUES ${values}`,
      params
    );
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

  const bodyRegionsOf = async (entryId: number): Promise<Record<string, BodyRegionFeeling>> => {
    const rows = await driver.query<{ region: string; dysphoria: number | null; euphoria: number | null }>(
      'SELECT region, dysphoria, euphoria FROM entry_body_region WHERE entry_id = ?',
      [entryId]
    );
    return Object.fromEntries(rows.map((r) => [r.region, { dysphoria: r.dysphoria, euphoria: r.euphoria }]));
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

  const videoCountOf = async (entryId: number): Promise<number> => {
    const rows = await driver.query<{ n: number }>('SELECT COUNT(*) AS n FROM video_note WHERE entry_id = ?', [
      entryId
    ]);
    return rows[0].n;
  };

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

  const videosToRemove = async (entryId: number | null, ids: string[]): Promise<RemovedVideoRow[]> =>
    Promise.all(
      [...new Set(ids)].map(async (id) => {
        const rows = await driver.query<RemovedVideoRow>(
          'SELECT uuid, entry_id, file_path FROM video_note WHERE uuid = ?',
          [id]
        );
        if (!rows[0]) throw new Error(`unknown video note: ${id}`);
        if (entryId == null) throw new Error(`video note ${id} does not belong to a new entry`);
        if (rows[0].entry_id !== entryId) throw new Error(`video note ${id} does not belong to entry: ${entryId}`);
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
    const videos = new Map<number, VideoNote[]>();
    const bodyRegions = new Map<number, Record<string, BodyRegionFeeling>>();

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
      for (const [entryId, forEntry] of await videosByEntry(driver, ids)) videos.set(entryId, forEntry);

      const bodyRegionRows = await driver.query<{
        entry_id: number;
        region: string;
        dysphoria: number | null;
        euphoria: number | null;
      }>(
        `SELECT entry_id, region, dysphoria, euphoria FROM entry_body_region WHERE entry_id IN (${placeholders})`,
        ids
      );
      for (const row of bodyRegionRows) {
        const forEntry = bodyRegions.get(row.entry_id) ?? {};
        forEntry[row.region] = { dysphoria: row.dysphoria, euphoria: row.euphoria };
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
      videos: videos.get(row.id) ?? [],
      bodyRegions: bodyRegions.get(row.id) ?? {},
      starred: bool(row.starred),
      presentationId: row.presentation_id
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

  const resolveContextual = async (input: EntryInput) => {
    let tryoutRowId: number | null = null;
    if (input.tryoutFeltSense) {
      if (
        !Number.isInteger(input.tryoutFeltSense.mood) ||
        input.tryoutFeltSense.mood < 1 ||
        input.tryoutFeltSense.mood > 5
      ) {
        throw new Error(`invalid mood: ${input.tryoutFeltSense.mood}`);
      }
      tryoutRowId = await rowidByUuid(driver, 'tryout', input.tryoutFeltSense.tryoutId);
    }

    let procedureRowId: number | null = null;
    let stagedProcedurePhoto: StagedPhoto | null = null;
    if (input.procedureRecovery) {
      procedureRowId = await rowidByUuid(driver, 'procedure', input.procedureRecovery.procedureId);
      if (input.procedureRecovery.photo) {
        stagedProcedurePhoto = await stagePhoto(files, input.procedureRecovery.photo);
      }
    }

    if (input.effectMarker) {
      const known = await driver.query<{ key: string }>(
        'SELECT key FROM personal_effect_type WHERE key = ?',
        [input.effectMarker.effect]
      );
      if (known.length === 0) throw new Error(`unknown personal effect type: ${input.effectMarker.effect}`);
    }

    return { tryoutRowId, procedureRowId, stagedProcedurePhoto };
  };

  const commitContextual = async (
    input: EntryInput,
    resolved: { tryoutRowId: number | null; procedureRowId: number | null; stagedProcedurePhoto: StagedPhoto | null },
    epochDay: number
  ) => {
    if (input.tryoutFeltSense && resolved.tryoutRowId != null) {
      await driver.run(
        'INSERT INTO felt_sense (uuid, tryout_id, milestone_id, epoch_day, mood, note, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
        [
          mintUuid(),
          resolved.tryoutRowId,
          input.tryoutFeltSense.epochDay ?? epochDay,
          input.tryoutFeltSense.mood,
          input.tryoutFeltSense.note ?? null,
          now()
        ]
      );
    }

    if (input.doseLog) {
      const dose = input.doseLog;
      const doseUuid = mintUuid();
      const doseTimestamp = dose.timestamp ?? input.timestamp ?? startOfDayTimestamp(epochDay);
      const doseRoute = dose.route ?? 'oral';
      const doseStatus = dose.status ?? 'taken';
      await driver.run(
        `INSERT INTO dose_event (timestamp, route, dose, dose_unit, injection_site, vehicle, application_site,
                                 status, scheduled_dose, scheduled_route, scheduled_timestamp, drug, updated_at, uuid)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
        [
          doseTimestamp,
          doseRoute,
          dose.dose,
          dose.doseUnit,
          dose.injectionSite ?? null,
          dose.vehicle ?? null,
          dose.applicationSite ?? null,
          doseStatus,
          dose.drug ?? null,
          now(),
          doseUuid
        ]
      );
      if (dose.drug) {
        await driver.run(
          'UPDATE medication_stock SET quantity = MAX(0, quantity - ?), updated_at = ? WHERE drug = ?',
          [dose.dose, now(), dose.drug.trim()]
        );
      }
    }

    if (input.procedureRecovery && resolved.procedureRowId != null) {
      if (resolved.stagedProcedurePhoto) {
        await driver.run(
          'INSERT INTO procedure_photo (uuid, procedure_id, epoch_day, file_path, updated_at) VALUES (?, ?, ?, ?, ?)',
          [
            resolved.stagedProcedurePhoto.id,
            resolved.procedureRowId,
            epochDay,
            resolved.stagedProcedurePhoto.fileName,
            now()
          ]
        );
      }
      if (input.procedureRecovery.notes != null && input.procedureRecovery.notes.trim() !== '') {
        const procRows = await driver.query<{ notes: string }>(
          'SELECT notes FROM procedure WHERE id = ?',
          [resolved.procedureRowId]
        );
        const existingNotes = procRows[0]?.notes ?? '';
        const newNotes = existingNotes
          ? `${existingNotes}\n${input.procedureRecovery.notes}`
          : input.procedureRecovery.notes;
        await driver.run('UPDATE procedure SET notes = ?, updated_at = ? WHERE id = ?', [
          newNotes,
          now(),
          resolved.procedureRowId
        ]);
      }
    }

    if (input.effectMarker) {
      const marker = input.effectMarker;
      const markerDay = marker.firstNoticedEpochDay ?? epochDay;
      const existing = await driver.query<{ uuid: string }>(
        'SELECT uuid FROM personal_effect WHERE effect = ?',
        [marker.effect]
      );
      if (existing.length > 0) {
        await driver.run(
          'UPDATE personal_effect SET first_noticed_epoch_day = ?, updated_at = ? WHERE effect = ?',
          [markerDay, now(), marker.effect]
        );
      } else {
        await driver.run(
          'INSERT INTO personal_effect (uuid, effect, first_noticed_epoch_day, updated_at) VALUES (?, ?, ?, ?)',
          [mintUuid(), marker.effect, markerDay, now()]
        );
      }
    }

    if (input.cycleEvent) {
      const cycle = input.cycleEvent;
      const cycleDay = cycle.epochDay ?? epochDay;
      await driver.run('INSERT INTO cycle_event (uuid, kind, epoch_day, updated_at) VALUES (?, ?, ?, ?)', [
        mintUuid(),
        cycle.kind,
        cycleDay,
        now()
      ]);
    }
  };

  /* The newest bad moment, at whatever width the caller needs it: the two
     reads below differ only in their SELECT list, and the rule for what
     counts as a bad moment (ticket 50, ADR-0040) has no business being
     written twice. */
  const latestBadMomentRow = <Row extends Record<string, unknown> = EntryRow,>(
    columns: string,
    dysphoriaTagIds: readonly string[]
  ): Promise<Row[]> => {
    const placeholders = dysphoriaTagIds.map(() => '?').join(', ');
    const tagClause =
      dysphoriaTagIds.length > 0
        ? `OR EXISTS (
            SELECT 1 FROM entry_tag et JOIN tag t ON t.id = et.tag_id
            WHERE et.entry_id = e.id AND COALESCE(t.key, t.uuid) IN (${placeholders})
          )`
        : '';
    return driver.query<Row>(
      `SELECT ${columns} FROM entry e
       WHERE e.trashed_at IS NULL
         AND (
           (e.mood IS NOT NULL AND e.mood <= ?)
           ${tagClause}
           OR EXISTS (
             SELECT 1 FROM entry_body_region ebr
             WHERE ebr.entry_id = e.id AND ebr.dysphoria >= ?
           )
         )
       ORDER BY e.id DESC
       LIMIT 1`,
      [BAD_MOMENT_MOOD_CEILING, ...dysphoriaTagIds, BAD_MOMENT_REGION_DYSPHORIA_FLOOR]
    );
  };

  return {
    async getEntry(id) {
      const rows = await driver.query<EntryRow>(
        'SELECT id, epoch_day, timestamp, mood, note, starred, presentation_id FROM entry WHERE id = ? AND trashed_at IS NULL',
        [id]
      );
      return rows[0] && (await hydrate(rows))[0];
    },

    async entriesForDay(epochDay) {
      const rows = await driver.query<EntryRow>(
        `SELECT id, epoch_day, timestamp, mood, note, starred, presentation_id FROM entry
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
        `SELECT id, epoch_day, timestamp, mood, note, starred, presentation_id FROM entry
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
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred, e.presentation_id FROM entry e
         JOIN entry_tag et ON et.entry_id = e.id
         JOIN tag t ON t.id = et.tag_id
         WHERE COALESCE(t.key, t.uuid) = ? AND e.trashed_at IS NULL
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         LIMIT ?`,
        [tagId, limit]
      );
      return hydrate(rows);
    },

    async counterevidencePool(tagIds, limit) {
      // EXISTS rather than a JOIN: a starred entry carrying several other
      // tags would otherwise arrive once per tag row, since the tag match
      // itself has to live in the WHERE clause (an entry need not carry
      // any of `tagIds` at all to qualify here) rather than the JOIN
      // condition. Trashed entries are excluded the same way every other
      // read here is (phase 5 ticket 19) - a trashed entry is not
      // counterevidence for anything until it is restored.
      //
      // The body-region clause (phase 5 ticket 44) needs no day-level
      // aggregation the way isGoodDay's does: this is already a per-entry
      // check, so any one of an entry's logged regions clearing the floor
      // is enough, the same inclusive floor and the same constant isGoodDay
      // reads.
      const placeholders = tagIds.map(() => '?').join(', ');
      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred, e.presentation_id FROM entry e
         WHERE e.trashed_at IS NULL
           AND (
             e.starred = 1
             OR EXISTS (
               SELECT 1 FROM entry_tag et JOIN tag t ON t.id = et.tag_id
               WHERE et.entry_id = e.id AND COALESCE(t.key, t.uuid) IN (${placeholders})
             )
             OR EXISTS (
               SELECT 1 FROM entry_body_region ebr
               WHERE ebr.entry_id = e.id AND ebr.euphoria >= ?
             )
           )
         ORDER BY e.epoch_day DESC, e.timestamp DESC, e.id DESC
         LIMIT ?`,
        [...tagIds, GOOD_DAY_REGION_EUPHORIA_FLOOR, limit]
      );
      return hydrate(rows);
    },

    async latestBadMomentEntry(dysphoriaTagIds = DYSPHORIA_TAG_KEYS) {
      const rows = await latestBadMomentRow(
        'e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred, e.presentation_id',
        dysphoriaTagIds
      );
      if (rows.length === 0) return undefined;
      const hydrated = await hydrate(rows);
      return hydrated[0];
    },

    async latestBadMomentEntryId(dysphoriaTagIds = DYSPHORIA_TAG_KEYS) {
      const rows = await latestBadMomentRow<{ id: number }>('e.id', dysphoriaTagIds);
      return rows[0]?.id;
    },

    async searchEntries(query, matchingTagIds, filtersOrLimit, limit) {
      const args = searchArgs(filtersOrLimit, limit);
      const matches = searchMatches(query, matchingTagIds, args.filters);
      if (!matches) return [];

      const rows = await driver.query<EntryRow>(
        `SELECT e.id, e.epoch_day, e.timestamp, e.mood, e.note, e.starred, e.presentation_id FROM entry e
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
        `SELECT id, epoch_day, timestamp, mood, note, starred, presentation_id, trashed_at FROM entry
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
            'SELECT id, epoch_day, timestamp, mood, note, presentation_id FROM entry WHERE id = ? AND trashed_at IS NULL',
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
        const attachingVideos = input.attachVideos ?? [];
        const removedVideos = await videosToRemove(current.id, input.removeVideoIds ?? []);
        assertHasContent({
          mood,
          note: input.note ?? current.note ?? '',
          dimCount: Object.keys(mergedDims).length,
          tagCount: tags.length,
          photoCount: (await photoCountOf(current.id)) - removedPhotos.length + attaching.length,
          recordingCount:
            (await recordingCountOf(current.id)) - removedRecordings.length + attachingRecordings.length,
          videoCount: (await videoCountOf(current.id)) - removedVideos.length + attachingVideos.length,
          bodyRegionCount: countLoggedRegions(bodyRegions)
        });

        // Resolved before the transaction so an unknown key aborts cleanly.
        const dimIds = await resolveDimensionIds(input.dims ?? {});
        const tagIds = input.tags && (await resolveTagIds(input.tags));
        if (input.bodyRegions) await assertKnownBodyRegions(input.bodyRegions);
        // undefined leaves the entry's current presentation alone; an
        // explicit null clears it, and only a non-null value is checked
        // against the table.
        const presentationId = input.presentationId !== undefined ? input.presentationId : current.presentation_id;
        if (presentationId !== null) await assertKnownPresentation(presentationId);
        const contextual = await resolveContextual(input);
        // The note that will be stored, whether this edit supplied one or
        // not - reindexing on input.note alone would blank the index for an
        // edit that only touched the mood.
        const note = input.note ?? current.note ?? '';
        const stagedPhotos: StagedPhoto[] = [];
        for (const photo of attaching) stagedPhotos.push(await stagePhoto(files, photo));
        const stagedRecordings: StagedRecording[] = [];
        for (const bytes of attachingRecordings) stagedRecordings.push(await stageRecording(files, bytes));
        const stagedVideos: StagedVideo[] = [];
        for (const bytes of attachingVideos) stagedVideos.push(await stageVideo(files, bytes));

        const targetEpochDay = input.epochDay ?? current.epoch_day;
        await driver.transaction(async () => {
          await driver.run(
            'UPDATE entry SET epoch_day = ?, timestamp = ?, mood = ?, note = ?, presentation_id = ?, updated_at = ? WHERE id = ?',
            [
              targetEpochDay,
              input.timestamp ?? current.timestamp,
              mood,
              note,
              presentationId,
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
          for (const video of removedVideos) {
            await driver.run('DELETE FROM video_note WHERE uuid = ? AND entry_id = ?', [video.uuid, current.id]);
          }
          for (const video of stagedVideos) {
            await insertStagedVideo(driver, current.id, video);
          }
          await commitContextual(input, contextual, targetEpochDay);
        });
        await removeFilesAfterCommit(files, removedPhotos);
        await removeRecordingFilesAfterCommit(files, removedRecordings);
        await removeVideoFilesAfterCommit(files, removedVideos);
        return current.id;
      }

      if (input.epochDay == null) throw new Error('a new entry needs an epochDay');
      const dims = input.dims ?? {};
      const tags = input.tags ?? [];
      const bodyRegions = input.bodyRegions ?? {};
      const attachingNew = input.attachPhotos ?? [];
      const attachingRecordingsNew = input.attachRecordings ?? [];
      const attachingVideosNew = input.attachVideos ?? [];
      const mood = input.mood;
      if (mood == null) throw new Error('an entry needs a mood');
      await photosToRemove(null, input.removePhotoIds ?? []);
      await recordingsToRemove(null, input.removeRecordingIds ?? []);
      await videosToRemove(null, input.removeVideoIds ?? []);
      assertHasContent({
        mood,
        note: input.note ?? '',
        dimCount: Object.keys(dims).length,
        tagCount: tags.length,
        photoCount: attachingNew.length,
        recordingCount: attachingRecordingsNew.length,
        videoCount: attachingVideosNew.length,
        bodyRegionCount: countLoggedRegions(bodyRegions)
      });
      const dimIds = await resolveDimensionIds(dims);
      const tagIds = await resolveTagIds(tags);
      await assertKnownBodyRegions(bodyRegions);
      const presentationId = input.presentationId ?? null;
      if (presentationId !== null) await assertKnownPresentation(presentationId);
      const contextual = await resolveContextual(input);
      const stagedPhotos: StagedPhoto[] = [];
      for (const photo of attachingNew) stagedPhotos.push(await stagePhoto(files, photo));
      const stagedRecordings: StagedRecording[] = [];
      for (const bytes of attachingRecordingsNew) stagedRecordings.push(await stageRecording(files, bytes));
      const stagedVideos: StagedVideo[] = [];
      for (const bytes of attachingVideosNew) stagedVideos.push(await stageVideo(files, bytes));

      const uuid = mintUuid();
      return driver.transaction(async () => {
        await driver.run(
          'INSERT INTO entry (uuid, epoch_day, timestamp, mood, note, presentation_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uuid, input.epochDay, input.timestamp ?? now(), mood, input.note ?? '', presentationId, now()]
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
        for (const video of stagedVideos) {
          await insertStagedVideo(driver, entryId, video);
        }
        await commitContextual(input, contextual, input.epochDay!);
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
    },

    async countAll() {
      const rows = await driver.query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM entry WHERE trashed_at IS NULL'
      );
      return rows[0].n;
    },

    async lastWriteEpochDay(todayEpochDay) {
      const rows = await driver.query<{ day: number | null }>(
        'SELECT MAX(epoch_day) AS day FROM entry WHERE trashed_at IS NULL AND epoch_day <= ?',
        [todayEpochDay]
      );
      return rows[0]?.day ?? null;
    },

    async noteEntries() {
      const rows = await driver.query<{ epoch_day: number; note: string; presentation_id: string | null }>(
        `SELECT epoch_day, note, presentation_id FROM entry
         WHERE trashed_at IS NULL AND note IS NOT NULL AND note != ''`
      );
      return rows.map((row) => ({
        epochDay: row.epoch_day,
        note: row.note,
        presentationId: row.presentation_id
      }));
    }
  };
}

/** Reclaims every entry trashed more than TRASH_WINDOW_DAYS ago, the same
    hard delete deleteEntry used to do directly (dimension values, tag
    links, body regions, photo/recording rows and files), run once at boot
    after migrations (boot.ts), mirroring sweepOrphanPhotos's shape.

    Returns how many entries it took. The caller announces the write when that
    is not zero (phase 5 audit ticket 02): this runs after the screens are live
    now, so a Trash list already on screen would otherwise keep showing rows
    that are gone. */
export async function purgeExpiredTrash(driver: SqliteDriver, files: PhotoFileStore): Promise<number> {
  /* Not alongside a write, the same rule and the same mechanism the orphan
     sweep now works under (watchJournalWrites, journal-busy.ts): this reads
     which entries are past the window and then deletes them, and since it
     moved off boot's critical path a restore could land in that gap - which
     would delete an entry somebody had just taken back out of the trash. An
     entry that stays trashed one more boot has 30 days of grace behind it;
     one deleted after a restore is gone. */
  const writes = watchJournalWrites();
  try {
    return await purgeTrashedBefore(driver, files, writes.sawWrite);
  } finally {
    writes.stop();
  }
}

async function purgeTrashedBefore(
  driver: SqliteDriver,
  files: PhotoFileStore,
  sawWrite: () => boolean
): Promise<number> {
  if (sawWrite()) return 0;
  const cutoff = now() - TRASH_WINDOW_MS;
  const expired = await driver.query<{ id: number }>(
    'SELECT id FROM entry WHERE trashed_at IS NOT NULL AND trashed_at <= ?',
    [cutoff]
  );
  if (expired.length === 0) return 0;
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
  const videos = await driver.query<{ file_path: string }>(
    `SELECT file_path FROM video_note WHERE entry_id IN (${placeholders})`,
    ids
  );

  // The last moment before this is irreversible.
  if (sawWrite()) return 0;
  await driver.transaction(async () => {
    await driver.run(`DELETE FROM photo WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM voice_recording WHERE entry_id IN (${placeholders})`, ids);
    await driver.run(`DELETE FROM video_note WHERE entry_id IN (${placeholders})`, ids);
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
  await removeVideoFilesOf(files, videos);
  return ids.length;
}

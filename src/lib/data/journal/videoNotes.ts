/* Video note staging (ticket 22, CONTEXT: "Video note"). voiceRecordings.ts's
   twin, and for now a parallel copy rather than a shared generic over the two
   tables: what they have in common today is a uuid, a file and an entry, and
   a rename on one must not silently change what the other stores.

   Worth being honest about: with photo, voice_recording and video_note this
   is the third file-carrying entry table, so the rule of three is reached and
   the copy is no longer obviously the cheaper option. Extracting it now would
   mean rewriting voiceRecordings.ts and photos.ts in the same change - and
   photos.ts genuinely differs, with a nullable owner pair and a thumbnail
   sibling - so the extraction belongs in its own ticket rather than smuggled
   into this one.

   Entry-only, like a recording and unlike photos.ts: ticket 22 excludes
   milestones, so there is one owner column and no owner to resolve - the
   caller (entries.ts) already holds a real entry id by the time it stages a
   note.

   The same file-before-row / row-before-file ordering photos.ts's header
   states applies here, over the same injected PhotoFileStore: a video note
   is exactly the kind of binary blob that store already exists to carry.
   No normalize() step either, but for a different reason than a recording's:
   a video note IS capped and re-encoded (limits.ts), just not here - that
   needs a canvas, so it happens in the editor before these bytes arrive,
   the same division of labour normalizePhoto/photos.ts already draws. */

import type { SqliteDriver } from '../sqlite/driver';
import type { VideoNote } from '../types';
import { videoFileName } from '../videoNotes/names';
import type { PhotoFileStore } from '../photos/photoFileStore';
import { mintUuid, now } from './support';

type VideoRow = { uuid: string; file_path: string };

export type StagedVideo = { id: string; fileName: string };

/** A video note placed in time, mirroring DatedRecording. Entry-only
    (CONTEXT: "Video note"), so unlike DatedPhoto there is no owner name to
    carry - a note's date is always its entry's epoch day, no COALESCE. */
export interface DatedVideo extends VideoNote {
  epochDay: number;
}

export interface VideoArea {
  /** Every video note in the journal, oldest first, mirroring
      VoiceArea.inJournal. */
  inJournal(): Promise<DatedVideo[]>;
}

const toVideo = (row: VideoRow): VideoNote => ({ id: row.uuid, fileName: row.file_path });

/** Video note rows by entry, oldest first within each entry - one query for a
    whole page rather than one per row, the same rule photosByEntry follows.
    Entries with no notes are absent from the map; the caller supplies the
    empty list. */
export async function videosByEntry(driver: SqliteDriver, entryIds: number[]): Promise<Map<number, VideoNote[]>> {
  const byEntry = new Map<number, VideoNote[]>();
  if (entryIds.length === 0) return byEntry;
  const rows = await driver.query<VideoRow & { entry_id: number }>(
    `SELECT entry_id, uuid, file_path FROM video_note
     WHERE entry_id IN (${entryIds.map(() => '?').join(', ')})
     ORDER BY order_index, id`,
    entryIds
  );
  for (const row of rows) {
    const videos = byEntry.get(row.entry_id);
    if (videos) videos.push(toVideo(row));
    else byEntry.set(row.entry_id, [toVideo(row)]);
  }
  return byEntry;
}

/** Deletes every file the given video note rows owned. Called after the rows
    are gone, mirroring photos.ts's removeFilesOf: a failure here must not
    resurrect them, and what it leaves behind is the sweep's to reclaim. */
export async function removeVideoFilesOf(files: PhotoFileStore, rows: { file_path: string }[]): Promise<void> {
  for (const row of rows) await files.remove(row.file_path);
}

/** Best-effort cleanup after an owner save has committed, the same reasoning
    removeFilesAfterCommit (photos.ts) gives: the rows are already gone, so a
    file-store failure here must not make a completed save look unsuccessful.
    The boot orphan sweep retries the leftovers. */
export async function removeVideoFilesAfterCommit(
  files: PhotoFileStore,
  rows: { file_path: string }[]
): Promise<void> {
  try {
    await removeVideoFilesOf(files, rows);
  } catch {
    // sweepOrphanPhotos() owns retries.
  }
}

async function nextOrderIndex(driver: SqliteDriver, entryId: number): Promise<number> {
  const rows = await driver.query<{ next: number }>(
    'SELECT COALESCE(MAX(order_index) + 1, 0) AS next FROM video_note WHERE entry_id = ?',
    [entryId]
  );
  return rows[0].next;
}

/** Writes the note's file, then returns what the row needs (files land
    before the row that names them - see photos.ts's header). */
export async function stageVideo(files: PhotoFileStore, bytes: Uint8Array): Promise<StagedVideo> {
  const uuid = mintUuid();
  const fileName = videoFileName(uuid);
  await files.write(fileName, bytes);
  return { id: uuid, fileName };
}

export async function insertStagedVideo(
  driver: SqliteDriver,
  entryId: number,
  video: StagedVideo
): Promise<string> {
  const orderIndex = await nextOrderIndex(driver, entryId);
  await driver.run(
    `INSERT INTO video_note (uuid, entry_id, file_path, order_index, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [video.id, entryId, video.fileName, orderIndex, now()]
  );
  return video.id;
}

export function makeVideoArea(driver: SqliteDriver): VideoArea {
  return {
    async inJournal() {
      // Excludes a trashed entry's notes the same way every other
      // entry-owned read does (phase 5 ticket 19).
      const rows = await driver.query<VideoRow & { epoch_day: number }>(
        `SELECT v.uuid, v.file_path, e.epoch_day AS epoch_day
         FROM video_note v
         JOIN entry e ON e.id = v.entry_id
         WHERE e.trashed_at IS NULL
         ORDER BY epoch_day, v.order_index, v.id`
      );
      return rows.map((row) => ({ ...toVideo(row), epochDay: row.epoch_day }));
    }
  };
}

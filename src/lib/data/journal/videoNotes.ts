/* Stage video notes for an existing entry using PhotoFileStore. As in
   photos.ts, write the file before inserting its row and remove the row
   before freeing the file. Video notes have one owner column; photos
   also support milestones and have thumbnails.

   The editor caps and re-encodes video through limits.ts before staging,
   where the canvas is available. Keep storage separate from voice
   recordings so each format can change independently. */

import type { SqliteDriver } from '../sqlite/driver';
import { afterCommit } from '../sqlite/transactor';
import { unownedNames } from './fileOwnership';
import { markOrphanSweepDue } from '../sqlite/orphan-sweep-schedule';
import type { VideoNote } from '../types';
import { videoFileName } from '../videoNotes/names';
import type { PhotoFileStore } from '../photos/photo-file-store';
import { mintUuid, now } from './support';

type VideoRow = { uuid: string; file_path: string };

export type StagedVideo = { id: string; fileName: string };

/** A video note placed in time, mirroring DatedRecording. Entry-only
, so unlike DatedPhoto there is no owner name to
    carry - a note's date is always its entry's epoch day, no COALESCE. */
interface DatedVideo extends VideoNote {
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
async function removeVideoFiles(files: PhotoFileStore, names: string[]): Promise<void> {
  for (const name of names) await files.remove(name);
}

export async function removeVideoFilesOf(driver: SqliteDriver, files: PhotoFileStore, rows: { file_path: string }[]): Promise<void> {
  const names = await unownedNames(driver, rows.map((row) => row.file_path));
  await afterCommit(driver, () => removeVideoFiles(files, names), markOrphanSweepDue);
}

/** Best-effort cleanup after an owner save has committed, the same reasoning
    removeFilesAfterCommit (photos.ts) gives: the rows are already gone, so a
    file-store failure here must not make a completed save look unsuccessful.
    The boot orphan sweep retries the leftovers. */
export async function removeVideoFilesAfterCommit(
  driver: SqliteDriver,
  files: PhotoFileStore,
  rows: { file_path: string }[]
): Promise<void> {
  const names = await unownedNames(driver, rows.map((row) => row.file_path));
  await afterCommit(driver, async () => {
    try {
      await removeVideoFiles(files, names);
    } catch {
      markOrphanSweepDue();
    }
  });
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
      // entry-owned read does.
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

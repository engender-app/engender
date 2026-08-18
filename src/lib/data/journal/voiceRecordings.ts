/* Voice recording staging (ticket 24, CONTEXT: "Voice recording"). Entry-only,
   unlike photos.ts: ticket 24 excludes milestones, so there is one owner
   column and no owner to resolve - the caller (entries.ts) already holds a
   real entry id by the time it stages a recording, the same way it already
   holds one when it stages a photo.

   The same file-before-row / row-before-file ordering photos.ts's header
   states applies here, over the same injected PhotoFileStore: a recording is
   exactly the kind of binary blob that store already exists to carry, so
   this reuses it rather than standing up a second one. No thumbnail and
   no normalize() step (out of scope: no client-side audio effects) - a
   recording is the bytes MediaRecorder produced, written through as-is. */

import type { SqliteDriver } from '../sqlite/driver';
import type { VoiceRecording } from '../types';
import { voiceFileName } from '../voiceRecordings/names';
import type { PhotoFileStore } from './journal';
import { mintUuid, now } from './support';

type RecordingRow = { uuid: string; file_path: string };

export type StagedRecording = { id: string; fileName: string };

const toRecording = (row: RecordingRow): VoiceRecording => ({ id: row.uuid, fileName: row.file_path });

/** Recording rows by entry, oldest first within each entry - one query for a
    whole page rather than one per row, the same rule photosByEntry follows.
    Entries with no recordings are absent from the map; the caller supplies
    the empty list. */
export async function recordingsByEntry(
  driver: SqliteDriver,
  entryIds: number[]
): Promise<Map<number, VoiceRecording[]>> {
  const byEntry = new Map<number, VoiceRecording[]>();
  if (entryIds.length === 0) return byEntry;
  const rows = await driver.query<RecordingRow & { entry_id: number }>(
    `SELECT entry_id, uuid, file_path FROM voice_recording
     WHERE entry_id IN (${entryIds.map(() => '?').join(', ')})
     ORDER BY order_index, id`,
    entryIds
  );
  for (const row of rows) {
    const recordings = byEntry.get(row.entry_id);
    if (recordings) recordings.push(toRecording(row));
    else byEntry.set(row.entry_id, [toRecording(row)]);
  }
  return byEntry;
}

/** Deletes every file the given recording rows owned. Called after the rows
    are gone, mirroring photos.ts's removeFilesOf: a failure here must not
    resurrect them, and what it leaves behind is the sweep's to reclaim. */
export async function removeRecordingFilesOf(files: PhotoFileStore, rows: { file_path: string }[]): Promise<void> {
  for (const row of rows) await files.remove(row.file_path);
}

/** Best-effort cleanup after an owner save has committed, the same reasoning
    removeFilesAfterCommit (photos.ts) gives: the rows are already gone, so a
    file-store failure here must not make a completed save look unsuccessful.
    The boot orphan sweep retries the leftovers. */
export async function removeRecordingFilesAfterCommit(
  files: PhotoFileStore,
  rows: { file_path: string }[]
): Promise<void> {
  try {
    await removeRecordingFilesOf(files, rows);
  } catch {
    // sweepOrphanPhotos() owns retries.
  }
}

async function nextOrderIndex(driver: SqliteDriver, entryId: number): Promise<number> {
  const rows = await driver.query<{ next: number }>(
    'SELECT COALESCE(MAX(order_index) + 1, 0) AS next FROM voice_recording WHERE entry_id = ?',
    [entryId]
  );
  return rows[0].next;
}

/** Writes the recording's file, then returns what the row needs (files land
    before the row that names them - see photos.ts's header). A function
    rather than only something entries.ts inlines, so the file-before-row
    order lives in one place rather than being re-typed at each call site. */
export async function stageRecording(files: PhotoFileStore, bytes: Uint8Array): Promise<StagedRecording> {
  const uuid = mintUuid();
  const fileName = voiceFileName(uuid);
  await files.write(fileName, bytes);
  return { id: uuid, fileName };
}

export async function insertStagedRecording(
  driver: SqliteDriver,
  entryId: number,
  recording: StagedRecording
): Promise<string> {
  const orderIndex = await nextOrderIndex(driver, entryId);
  await driver.run(
    `INSERT INTO voice_recording (uuid, entry_id, file_path, order_index, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [recording.id, entryId, recording.fileName, orderIndex, now()]
  );
  return recording.id;
}

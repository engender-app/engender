import type { ArchiveJournal } from '../archive/payload';
import { CorruptArchiveError } from '../archive/wire';
import type { SqliteReader } from '../sqlite/driver';
import { filesOf } from '../photos/names';
import { documentFilesOf } from './documents';

export type PhotoRow = {
  uuid: string;
  file_path: string;
  entry_id: number | null;
  milestone_id: number | null;
  starred: number;
  epoch_day_override: number | null;
};
export type RecordingRow = { uuid: string; file_path: string; entry_id: number };
export type VideoRow = { uuid: string; file_path: string; entry_id: number };
export type HairPhotoRow = { uuid: string; epoch_day: number; file_path: string };
export type HairRemovalPhotoRow = { uuid: string; session_id: number; file_path: string };
export type ProcedurePhotoRow = { uuid: string; procedure_id: number; epoch_day: number; file_path: string };
export type TryoutPhotoRow = { uuid: string; tryout_id: number; epoch_day: number; file_path: string };

type DocumentFileRow = { file_path: string };
type BenchmarkFileRow = { passage_file_path: string; vowel_file_path: string | null };

type ArchiveClaim = { owner: string[]; names: string[] };
const claim = (owner: string[], names: string[]): ArchiveClaim => ({ owner, names });

function owner<Row extends Record<string, unknown>>(
  table: string,
  fileColumns: string[],
  archiveQuery: string,
  names: (row: Row) => string[],
  archiveClaims: (journal: ArchiveJournal) => ArchiveClaim[]
) {
  return {
    table,
    fileColumns,
    archiveClaims,
    async read(driver: SqliteReader, scope: 'archive' | 'cleanup') {
      const rows = await driver.query<Row>(scope === 'archive'
        ? archiveQuery
        : `SELECT ${fileColumns.join(', ')} FROM ${table}`);
      return { rows, names: rows.flatMap(names) };
    }
  };
}

const photoNames = (row: { file_path: string }) => filesOf(row.file_path);
const singleName = (row: { file_path: string }) => [row.file_path];
const documentNames = (row: DocumentFileRow) => documentFilesOf(row.file_path);
const benchmarkNames = (row: BenchmarkFileRow) =>
  row.vowel_file_path ? [row.passage_file_path, row.vowel_file_path] : [row.passage_file_path];

// Archive reads omit trash; cleanup retains every current owner, including trash.
export const FILE_OWNERS = {
  photos: owner<PhotoRow>(
    'photo', ['file_path'],
    `SELECT p.uuid, p.file_path, p.entry_id, p.milestone_id, p.starred, p.epoch_day_override FROM photo p
       LEFT JOIN entry e ON e.id = p.entry_id
       WHERE p.entry_id IS NULL OR e.trashed_at IS NULL
       ORDER BY p.order_index, p.id`,
    photoNames,
    (journal) => [
      ...journal.entries.flatMap((entry) => entry.photos.map((photo) =>
        claim(['entry', entry.uuid, photo.id], photoNames({ file_path: photo.fileName })))),
      ...journal.milestones.flatMap((milestone) => milestone.photo
        ? [claim(['milestone', milestone.id, milestone.photo.id], photoNames({ file_path: milestone.photo.fileName }))]
        : [])
    ]
  ),
  hairPhotos: owner<HairPhotoRow>(
    'hair_photo', ['file_path'],
    'SELECT uuid, epoch_day, file_path FROM hair_photo ORDER BY epoch_day, id',
    photoNames,
    (journal) => journal.hairPhotos.map((photo) => claim([photo.id], photoNames({ file_path: photo.fileName })))
  ),
  hairRemovalPhotos: owner<HairRemovalPhotoRow>(
    'hair_removal_photo', ['file_path'],
    'SELECT uuid, session_id, file_path FROM hair_removal_photo ORDER BY session_id, id',
    photoNames,
    (journal) => journal.hairRemovalSessions.flatMap((session) => session.photos.map((photo) =>
      claim([session.id, photo.id], photoNames({ file_path: photo.fileName }))))
  ),
  procedurePhotos: owner<ProcedurePhotoRow>(
    'procedure_photo', ['file_path'],
    'SELECT uuid, procedure_id, epoch_day, file_path FROM procedure_photo ORDER BY procedure_id, epoch_day, id',
    photoNames,
    (journal) => journal.procedures.flatMap((procedure) => procedure.photos.map((photo) =>
      claim([procedure.id, photo.id], photoNames({ file_path: photo.fileName }))))
  ),
  tryoutPhotos: owner<TryoutPhotoRow>(
    'tryout_photo', ['file_path'],
    'SELECT uuid, tryout_id, epoch_day, file_path FROM tryout_photo ORDER BY tryout_id, epoch_day, id',
    photoNames,
    (journal) => journal.tryouts.flatMap((tryout) => tryout.photos.map((photo) =>
      claim([tryout.id, photo.id], photoNames({ file_path: photo.fileName }))))
  ),
  documentFiles: owner<DocumentFileRow>(
    'document', ['file_path'],
    'SELECT file_path FROM document ORDER BY epoch_day, id',
    documentNames,
    (journal) => journal.documents.map((document) => claim([document.id], documentNames({ file_path: document.fileName })))
  ),
  recordings: owner<RecordingRow>(
    'voice_recording', ['file_path'],
    `SELECT v.uuid, v.file_path, v.entry_id FROM voice_recording v
       JOIN entry e ON e.id = v.entry_id
       WHERE e.trashed_at IS NULL
       ORDER BY v.order_index, v.id`,
    singleName,
    (journal) => journal.entries.flatMap((entry) => (entry.recordings ?? []).map((recording) =>
      claim([entry.uuid, recording.id], singleName({ file_path: recording.fileName }))))
  ),
  videos: owner<VideoRow>(
    'video_note', ['file_path'],
    `SELECT n.uuid, n.file_path, n.entry_id FROM video_note n
       JOIN entry e ON e.id = n.entry_id
       WHERE e.trashed_at IS NULL
       ORDER BY n.order_index, n.id`,
    singleName,
    (journal) => journal.entries.flatMap((entry) => (entry.videos ?? []).map((video) =>
      claim([entry.uuid, video.id], singleName({ file_path: video.fileName }))))
  ),
  benchmarkFiles: owner<BenchmarkFileRow>(
    'voice_benchmark', ['passage_file_path', 'vowel_file_path'],
    'SELECT passage_file_path, vowel_file_path FROM voice_benchmark ORDER BY epoch_day, id',
    benchmarkNames,
    (journal) => journal.voiceBenchmarks.map((benchmark) => claim([benchmark.id], benchmarkNames({
      passage_file_path: benchmark.passageFileName, vowel_file_path: benchmark.vowelFileName
    })))
  ),
};

type OwnershipRead = {
  [Key in keyof typeof FILE_OWNERS]: Awaited<ReturnType<(typeof FILE_OWNERS)[Key]['read']>>['rows'];
};

export async function readFileOwnership(driver: SqliteReader, scope: 'archive' | 'cleanup') {
  const entries = await Promise.all(Object.entries(FILE_OWNERS).map(async ([key, owner]) => {
    const result = await owner.read(driver, scope);
    return { key, ...result };
  }));
  return {
    rows: Object.fromEntries(entries.map(({ key, rows }) => [key, rows])) as OwnershipRead,
    names: entries.flatMap(({ names }) => names)
  };
}

/** The row validator runs first. Missing files remain valid placeholders;
 * names claimed by different deletion owners do not. Derived names count too. */
export function assertArchiveFileOwnership(journal: ArchiveJournal): void {
  const claimed = new Map<string, string>();
  for (const [kind, owner] of Object.entries(FILE_OWNERS)) {
    for (const { owner: path, names } of owner.archiveClaims(journal)) {
      // Include parent identity for nested rows and encode components without delimiter ambiguity.
      const identity = JSON.stringify([kind, ...path]);
      for (const name of names) {
        const previous = claimed.get(name);
        if (previous !== undefined && previous !== identity) {
          throw new CorruptArchiveError('the archive assigns one attachment to different owners');
        }
        claimed.set(name, identity);
      }
    }
  }
}

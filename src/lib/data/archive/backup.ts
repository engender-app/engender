/* Backup health (ticket 15, PRD F21): every way a copy of the journal can
   leave the device, and the timestamp that says one did.

   The paths are a list rather than three call sites, because the promise
   F21 makes is about all of them at once - Home tells someone their
   journal is safe on the strength of `lastBackupAt`, so a path that
   forgets to stamp it is a screen that lies. Adding a path means adding it
   to EXPORT_PATHS, which is what backup.test.ts enumerates: a new one is
   under the timestamp test the moment it exists, and one that isn't in the
   list isn't wired to the screen either.

   Android's scheduled auto-export joins this list when the shell lands.
   It is the same shape - produce a file, hand it off, stamp the time -
   with a Keystore-wrapped key and a SAF folder in place of the share
   sheet.

   Nothing here writes a preference. The recorder is passed in: this module
   is under Node-tier tests and the preference store is a Svelte $state
   projection, and the seam is honest anyway - what a delivered export
   means for the journal's settings is the screen's business. */

import { epochDayFromTimestamp, todayEpochDay } from '../epochDay';
import type { PreferenceValues } from '../prefs/catalogue';
import type { ArchiveSnapshot } from '../journal/archive';
import { ARCHIVE_FILE_EXTENSION } from './container';
import { exportFileName, type Delivery } from './deliver';
import { packArchive } from './pack';
import { journalCsv, journalJson, type PlainNaming } from './plain';
import { portablePreferences } from './payload';

export type { Delivery };

/** Every way a backup leaves the app (F21). */
export const EXPORT_PATHS = ['encrypted', 'csv', 'json'] as const;

export type ExportPath = (typeof EXPORT_PATHS)[number];

export interface ExportSource {
  /** The journal in the shape an archive carries it, and a reader for its
      photo files. Taken already open so the screen reads it once. */
  snapshot: ArchiveSnapshot;
  preferences: PreferenceValues;
  /** The encrypted path's password. The plain paths have none - that is
      what the warning in front of them is about (F22). */
  password: string;
  /** Wording for built-in rows, for the paths that write words. */
  naming: PlainNaming;
}

/** A file on its way off the device. The body is a stream so the encrypted
    path stays bounded (ADR-0007); the plain paths are one piece. */
export interface ExportFile {
  fileName: string;
  type: string;
  body: AsyncIterable<Uint8Array>;
}

async function* onePiece(text: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(text);
}

const PRODUCERS: Record<ExportPath, (source: ExportSource) => ExportFile> = {
  encrypted: (source) => ({
    fileName: exportFileName(source.preferences.name, ARCHIVE_FILE_EXTENSION),
    type: 'application/octet-stream',
    body: packArchive(
      {
        journal: source.snapshot.journal,
        // Portable preferences only (ADR-0003): restoring a year-old PIN
        // hash over the current one would lock someone out of an app with
        // no recovery path.
        preferences: portablePreferences(source.preferences),
        files: source.snapshot.files,
        readFile: source.snapshot.readFile
      },
      source.password
    )
  }),
  csv: (source) => ({
    fileName: exportFileName(source.preferences.name, '.csv'),
    type: 'text/csv',
    body: onePiece(journalCsv(source.snapshot.journal, source.naming))
  }),
  json: (source) => ({
    fileName: exportFileName(source.preferences.name, '.json'),
    type: 'application/json',
    body: onePiece(journalJson(source.snapshot.journal, portablePreferences(source.preferences)))
  })
};

export interface ExportDeps {
  deliver(file: ExportFile): Promise<Delivery>;
  /** Called with epoch millis once a file has actually left. */
  recordBackup(at: number): void;
}

export async function runExport(path: ExportPath, source: ExportSource, deps: ExportDeps): Promise<Delivery> {
  const delivery = await deps.deliver(PRODUCERS[path](source));
  // A cancelled share sheet is not a backup. Stamping it would tell
  // someone they have a copy of their journal that does not exist.
  if (delivery !== 'cancelled') deps.recordBackup(Date.now());
  return delivery;
}

/** Older than this and Home says so (F21). */
export const BACKUP_STALE_DAYS = 30;

/** How many local days ago the last export was, or null if there has never
    been one. `lastBackupAt` is epoch millis and this is a count of calendar
    days (ADR-0001), so the two are never the same number. */
export function backupAgeDays(lastBackupAt: number | null, today: number = todayEpochDay()): number | null {
  return lastBackupAt === null ? null : today - epochDayFromTimestamp(lastBackupAt);
}

export function backupIsStale(lastBackupAt: number | null, today: number = todayEpochDay()): boolean {
  const age = backupAgeDays(lastBackupAt, today);
  return age !== null && age > BACKUP_STALE_DAYS;
}

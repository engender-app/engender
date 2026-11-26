/* List delivery paths that update `lastBackupAt` after a copy leaves
   the device. Register each in `EXPORT_PATHS` so backup.test.ts checks
   its timestamp. `backupHealth.ts` decides when the timestamp is stale.
   Android scheduled exports deliver to an SAF folder using a
   Keystore-wrapped key.

   Pass in the timestamp recorder so this module stays testable in
   Node without a Svelte preference store. */

import type { PreferenceValues } from '../prefs/catalogue';
import type { ArchiveSnapshot } from '../journal/archive';
import { ARCHIVE_FILE_EXTENSION } from './container';
import { deliverFile, exportFileName, type Delivery } from './deliver';
import { packArchive, type PackWatch } from './pack';
import { journalCsv, journalJson, type PlainNaming } from './plain';
import { portablePreferences } from './payload';

export type { Delivery };

/** Every way a backup leaves the app (F21). */
/* EXPORT_PATHS stays exported only for its own test (AU-09 test-only review). */
export const EXPORT_PATHS = ['encrypted', 'csv', 'json'] as const;

export type ExportPath = (typeof EXPORT_PATHS)[number];

/* ExportSource stays exported only for its own test (AU-09 test-only review). */
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
/* OutgoingFile stays exported only for its own test (AU-09 test-only review). */
export interface OutgoingFile {
  recordBackup?: boolean;
  fileName: string;
  type: string;
  body: AsyncIterable<Uint8Array>;
}

async function* onePiece(text: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(text);
}

const PRODUCERS: Record<ExportPath, (source: ExportSource, watch: PackWatch) => OutgoingFile> = {
  encrypted: (source, watch) => ({
    fileName: exportFileName(source.preferences.name, ARCHIVE_FILE_EXTENSION, undefined, source.preferences.disguise),
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
      source.password,
      undefined,
      watch
    )
  }),
  csv: (source) => ({
    fileName: exportFileName(source.preferences.name, '.csv', undefined, source.preferences.disguise),
    type: 'text/csv',
    body: onePiece(journalCsv(source.snapshot.journal, source.naming))
  }),
  json: (source) => ({
    fileName: exportFileName(source.preferences.name, '.json', undefined, source.preferences.disguise),
    type: 'application/json',
    body: onePiece(journalJson(source.snapshot.journal, portablePreferences(source.preferences)))
  })
};

interface ExportDeps {
  /** Called with epoch millis once a file has actually left. */
  recordBackup(at: number): void;
  /** The share sheet and the download (deliver.ts), which is what this
      swaps out under test. Not a screen's to pass: a caller that supplied
      its own way of handing a file over would be an export path that
      never came through here. */
  deliver?(file: OutgoingFile): Promise<Delivery>;
  /** How far the encrypted path has packed, and a way to stop it. The plain paths ignore it: journalCsv and
      journalJson are one string each, produced before the body is pulled,
      so there is no unit of work to count and nothing to interrupt
      between. Their bar runs indeterminate. */
  watch?: PackWatch;
}

export async function runExport(path: ExportPath, source: ExportSource, deps: ExportDeps): Promise<Delivery> {
  const delivery = await (deps.deliver ?? deliverFile)({ ...PRODUCERS[path](source, deps.watch ?? {}), recordBackup: true });
  // A cancelled share sheet is not a backup. Stamping it would tell
  // someone they have a copy of their journal that does not exist.
  if (delivery !== 'cancelled') deps.recordBackup(Date.now());
  return delivery;
}

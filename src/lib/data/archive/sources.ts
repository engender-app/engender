/* Register every external source once with detect, parse and resolve
   before the ordinary merge. Check that the declarations cover the closed
   ArchiveSourceName set. Pass bytes so a source can read a ZIP or decode
   text itself. Detection can inspect the header. */

import { daylioPreview, REQUIRED_COLUMNS as DAYLIO_REQUIRED_COLUMNS, detectDaylio, type DaylioNaming } from './daylio';
import { REQUIRED_FIELDS as DAYLIO_BACKUP_REQUIRED_FIELDS, daylioBackupPreview, detectDaylioBackup } from './daylioBackup';
import type { ArchiveJournal } from './payload';

type ArchiveSourceName = 'daylio' | 'daylio-backup';

/* ArchiveSource stays exported only for its own test (AU-09 test-only review). */
export interface ArchiveSource {
  name: ArchiveSourceName;
  /** The fields or columns this source's file must carry, for a caller that
      wants to name what a near-miss file is missing. Empty for a source
      with no fixed set, such as a zip container that carries whatever the
      other app put in it. */
  requiredFields: readonly string[];
  /** A non-throwing sniff: does this file look like this source's own kind
      at all? Never the full structural validation - that stays in
      `preview`, which throws by naming the row, field or record (the
      failure contract every source shares, spec's own "3").

      Synchronous, so a caller can pick a source without awaiting one: a
      sniff reads a header or a signature, never a whole file. */
  detect(file: Uint8Array): boolean;
  /** Resolves the file into the exact work a commit would do - a preview is
      never an instruction to re-parse a file that may have changed by then
      (ADR-0002's own reasoning for Daylio, which every source now shares).
      Only the journal: a source with richer preview data exposes its own
      preview function for a caller that wants that; this is the lowest
      common shape every source can produce.
      `naming` is source-specific context (Daylio's tag-label lookup);
      erased to `unknown` here because the registry
      holds every source at once.

      The journal is the part every source has in common. A source with
      more to report - which moods it resolved, what it could not bring
      across - offers its own richer preview to the screen that imports it,
      the way `daylioBackupPreview` does. */
  preview(file: Uint8Array, existing: ArchiveJournal, naming: unknown): Promise<ArchiveJournal>;
}

/** Enough of a text file to sniff a header from, so detection does not
    decode a whole journal to read its first line. */
const HEAD_BYTES = 4096;

const text = (file: Uint8Array) => new TextDecoder().decode(file);

const SOURCES = [
  {
    name: 'daylio',
    requiredFields: DAYLIO_REQUIRED_COLUMNS,
    detect: (file) => detectDaylio(text(file.subarray(0, HEAD_BYTES))),
    async preview(file, existing, naming) {
      return (await daylioPreview(text(file), existing, naming as DaylioNaming)).journal;
    }
  },
  {
    name: 'daylio-backup',
    requiredFields: DAYLIO_BACKUP_REQUIRED_FIELDS,
    detect: detectDaylioBackup,
    async preview(file, existing, naming) {
      return (await daylioBackupPreview(file, existing, naming as DaylioNaming)).journal;
    }
  }
] as const satisfies readonly ArchiveSource[];

/* A source name with no entry above would compile with nothing that ever
   imports it, silently. This line makes that a compile error instead -
   archiveSections.ts's own AssertNoneUnregistered, over sources rather than
   sections. */
type Unregistered = Exclude<ArchiveSourceName, (typeof SOURCES)[number]['name']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
type EverySourceRegistered = AssertNoneUnregistered<Unregistered>;

/* ARCHIVE_SOURCES stays exported only for its own test (AU-09 test-only
   review). */
export const ARCHIVE_SOURCES: readonly ArchiveSource[] = SOURCES;

/* UnrecognizedArchiveSourceError stays exported only for its own test (AU-09
   test-only review). */
export class UnrecognizedArchiveSourceError extends Error {
  constructor() {
    super('no known source recognises this file');
    this.name = 'UnrecognizedArchiveSourceError';
  }
}

/** The first source whose `detect` claims the file, or null. Takes the
    registry as a parameter, the same way archiveSections.ts's
    `orderedSections` does, so a test can run real detection over a
    shortened list rather than restating `filter`. */
export function recognizeSource(
  file: Uint8Array,
  sources: readonly ArchiveSource[] = ARCHIVE_SOURCES
): ArchiveSource | null {
  return sources.find((candidate) => candidate.detect(file)) ?? null;
}

/** `recognizeSource`, declined by name rather than by returning null - no
    source's `preview` is ever reached for a file nothing detects ("no
    fallback to guessing"). */
/* requireSource stays exported only for its own test (AU-09 test-only review). */
export function requireSource(file: Uint8Array, sources: readonly ArchiveSource[] = ARCHIVE_SOURCES): ArchiveSource {
  const found = recognizeSource(file, sources);
  if (!found) throw new UnrecognizedArchiveSourceError();
  return found;
}

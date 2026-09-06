/* The source registry (phase 7 ticket 02). Every external file this app can
   absorb declares itself once, here, instead of arriving as a bespoke
   importer with its own looser rules. `daylio.ts` already is the shape every
   source now follows - detect, parse, resolve, hand off to the ordinary
   merge - and this file is what lets the next source be one entry beside it
   rather than a second subsystem.

   Follows archiveSections.ts's own pattern: a closed set of names
   (`ArchiveSourceName`), one array declaring an entry for each, and a
   compile-time check that nothing in the set is left out of the array.

   A source is handed bytes rather than text (phase 7 ticket 09). Daylio's
   own `.daylio` backup is a zip, and so is Day One's export, so a registry
   that could only offer a string could not hold either; a text source
   decodes for itself - which is cheaper than it looks, because detection
   reads a header rather than a whole file. */

import { daylioPreview, REQUIRED_COLUMNS as DAYLIO_REQUIRED_COLUMNS, detectDaylio, type DaylioNaming } from './daylio';
import { REQUIRED_FIELDS as DAYLIO_BACKUP_REQUIRED_FIELDS, daylioBackupPreview, detectDaylioBackup } from './daylioBackup';
import { REQUIRED_COLUMNS as DAYONE_REQUIRED_COLUMNS, dayonePreview, detectDayOne } from './dayone';
import { detectTransTracks, transTracksPreview } from './transtracks';
import {
  REQUIRED_COLUMNS as TRACK_AND_GRAPH_REQUIRED_COLUMNS,
  detectTrackAndGraph,
  trackAndGraphPreview
} from './trackAndGraph';
import { detectPixels, pixelsPreview } from './pixels';
import type { ArchiveJournal } from './payload';

type ArchiveSourceName = 'daylio' | 'daylio-backup' | 'dayone' | 'transtracks' | 'trackAndGraph' | 'pixels';

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
      Only the journal: a source with richer preview data (Daylio's mood
      mappings, TransTracks' and Day One's raw photo bytes) exposes its own
      preview function for a caller that wants that; this is the lowest
      common shape every source can produce.
      `naming` is source-specific context (Daylio's own tag-label lookup,
      which Day One reuses); erased to `unknown` here because the registry
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
  },
  {
    name: 'dayone',
    requiredFields: DAYONE_REQUIRED_COLUMNS,
    detect: detectDayOne,
    async preview(file, existing, naming) {
      return (await dayonePreview(file, existing, naming as DaylioNaming)).journal;
    }
  },
  {
    name: 'transtracks',
    requiredFields: [],
    detect: detectTransTracks,
    async preview(file, existing) {
      return (await transTracksPreview(file, existing)).journal;
    }
  },
  {
    name: 'trackAndGraph',
    requiredFields: TRACK_AND_GRAPH_REQUIRED_COLUMNS,
    detect: (file) => detectTrackAndGraph(text(file.subarray(0, HEAD_BYTES))),
    async preview(file, existing) {
      return (await trackAndGraphPreview(text(file), existing)).journal;
    }
  },
  {
    name: 'pixels',
    requiredFields: [],
    // A bare JSON array cannot be sniffed from a HEAD_BYTES prefix the way a
    // CSV header or zip signature can - slicing a JSON document anywhere but
    // its end breaks its closing bracket - so detectPixels reads the file
    // it is actually given, the same as detectTransTracks does for its zip.
    detect: detectPixels,
    async preview(file, existing) {
      return (await pixelsPreview(file, existing)).journal;
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

/* The source registry (phase 7 ticket 02). Every external file this app can
   absorb declares itself once, here, instead of arriving as a bespoke
   importer with its own looser rules. `daylio.ts` already is the shape every
   source now follows - detect, parse, resolve, hand off to the ordinary
   merge - and this file is what lets the next source be one entry beside it
   rather than a second subsystem.

   Follows archiveSections.ts's own pattern: a closed set of names
   (`ArchiveSourceName`), one array declaring an entry for each, and a
   compile-time check that nothing in the set is left out of the array.

   `detect`/`preview` read a file's raw bytes rather than decoded text
   (ticket 11's own widening: Daylio's CSV is genuinely textual, but a Day
   One export is a zip, and there is no lossless way to hold arbitrary
   binary in a JS string). Daylio's own module still takes and returns
   text - `detectDaylio`/`daylioPreview` are unchanged - so only the
   registry entry below decodes for it. */

import { daylioPreview, REQUIRED_COLUMNS as DAYLIO_REQUIRED_COLUMNS, detectDaylio, type DaylioNaming } from './daylio';
import { dayonePreview, REQUIRED_COLUMNS as DAYONE_REQUIRED_COLUMNS, detectDayOne, type DayOneNaming, type PhotoNormalizer } from './dayone';
import type { ArchiveJournal } from './payload';

export type ArchiveSourceName = 'daylio' | 'dayone';

/** Day One's own context bundle: a source's `preview` takes one opaque
    `naming` parameter (below), and this is what Day One's needs beyond
    Daylio's tag-label lookup - a way to turn a photo's raw bytes into what
    a photo row owns, which only a browser caller can supply
    (dayone.ts's own `PhotoNormalizer` doc comment says why). */
export interface DayOneContext {
  naming: DayOneNaming;
  normalize: PhotoNormalizer;
}

export interface ArchiveSource {
  name: ArchiveSourceName;
  /** The fields or columns this source's file must carry, for a caller that
      wants to name what a near-miss file is missing. */
  requiredColumns: readonly string[];
  /** A non-throwing sniff: does this file look like this source's own kind
      at all? Never the full structural validation - that stays in
      `preview`, which throws by naming the row or column (the failure
      contract every source shares, spec's own "3"). */
  detect(bytes: Uint8Array): boolean;
  /** Resolves the file into the exact work a commit would do - a preview is
      never an instruction to re-parse a file that may have changed by then
      (ADR-0002's own reasoning for Daylio, which every source now shares).
      `naming` is source-specific context (Daylio's own tag-label lookup,
      Day One's `DayOneContext`); erased to `unknown` here because the
      registry holds every source at once. */
  preview(bytes: Uint8Array, existing: ArchiveJournal, naming: unknown): Promise<ArchiveJournal>;
}

const SOURCES = [
  {
    name: 'daylio',
    requiredColumns: DAYLIO_REQUIRED_COLUMNS,
    detect: (bytes) => detectDaylio(new TextDecoder().decode(bytes)),
    async preview(bytes, existing, naming) {
      return (await daylioPreview(new TextDecoder().decode(bytes), existing, naming as DaylioNaming)).journal;
    }
  },
  {
    name: 'dayone',
    requiredColumns: DAYONE_REQUIRED_COLUMNS,
    detect: detectDayOne,
    async preview(bytes, existing, context) {
      const { naming, normalize } = context as DayOneContext;
      return (await dayonePreview(bytes, existing, naming, normalize)).journal;
    }
  }
] as const satisfies readonly ArchiveSource[];

/* A source name with no entry above would compile with nothing that ever
   imports it, silently. This line makes that a compile error instead -
   archiveSections.ts's own AssertNoneUnregistered, over sources rather than
   sections. */
type Unregistered = Exclude<ArchiveSourceName, (typeof SOURCES)[number]['name']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EverySourceRegistered = AssertNoneUnregistered<Unregistered>;

export const ARCHIVE_SOURCES: readonly ArchiveSource[] = SOURCES;

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
  bytes: Uint8Array,
  sources: readonly ArchiveSource[] = ARCHIVE_SOURCES
): ArchiveSource | null {
  return sources.find((candidate) => candidate.detect(bytes)) ?? null;
}

/** `recognizeSource`, declined by name rather than by returning null - no
    source's `preview` is ever reached for a file nothing detects ("no
    fallback to guessing"). */
export function requireSource(bytes: Uint8Array, sources: readonly ArchiveSource[] = ARCHIVE_SOURCES): ArchiveSource {
  const found = recognizeSource(bytes, sources);
  if (!found) throw new UnrecognizedArchiveSourceError();
  return found;
}

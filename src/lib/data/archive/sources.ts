/* The source registry (phase 7 ticket 02). Every external file this app can
   absorb declares itself once, here, instead of arriving as a bespoke
   importer with its own looser rules. `daylio.ts` already is the shape every
   source now follows - detect, parse, resolve, hand off to the ordinary
   merge - and this file is what lets the next source be one entry beside it
   rather than a second subsystem.

   Follows archiveSections.ts's own pattern: a closed set of names
   (`ArchiveSourceName`), one array declaring an entry for each, and a
   compile-time check that nothing in the set is left out of the array. */

import { daylioPreview, REQUIRED_COLUMNS as DAYLIO_REQUIRED_COLUMNS, detectDaylio, type DaylioNaming } from './daylio';
import type { ArchiveJournal } from './payload';

export type ArchiveSourceName = 'daylio';

export interface ArchiveSource {
  name: ArchiveSourceName;
  /** The fields or columns this source's file must carry, for a caller that
      wants to name what a near-miss file is missing. */
  requiredColumns: readonly string[];
  /** A non-throwing sniff: does this file look like this source's own kind
      at all? Never the full structural validation - that stays in
      `preview`, which throws by naming the row or column (the failure
      contract every source shares, spec's own "3"). */
  detect(text: string): boolean;
  /** Resolves the file into the exact work a commit would do - a preview is
      never an instruction to re-parse a file that may have changed by then
      (ADR-0002's own reasoning for Daylio, which every source now shares).
      `naming` is source-specific context (Daylio's own tag-label lookup);
      erased to `unknown` here because the registry holds every source at
      once. */
  preview(text: string, existing: ArchiveJournal, naming: unknown): Promise<ArchiveJournal>;
}

const SOURCES = [
  {
    name: 'daylio',
    requiredColumns: DAYLIO_REQUIRED_COLUMNS,
    detect: detectDaylio,
    async preview(text, existing, naming) {
      return (await daylioPreview(text, existing, naming as DaylioNaming)).journal;
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
  text: string,
  sources: readonly ArchiveSource[] = ARCHIVE_SOURCES
): ArchiveSource | null {
  return sources.find((candidate) => candidate.detect(text)) ?? null;
}

/** `recognizeSource`, declined by name rather than by returning null - no
    source's `preview` is ever reached for a file nothing detects ("no
    fallback to guessing"). */
export function requireSource(text: string, sources: readonly ArchiveSource[] = ARCHIVE_SOURCES): ArchiveSource {
  const found = recognizeSource(text, sources);
  if (!found) throw new UnrecognizedArchiveSourceError();
  return found;
}

/* The plain export (ticket 15, PRD F22): the journal as CSV or JSON, with
   no encryption anywhere near it. The screen puts it behind a warning and a
   confirm; this file only knows how to write the two files.

   It reads the same snapshot the encrypted archive is packed from, so
   there is one description of what a journal holds rather than two that
   drift. What it does not reuse is the archive's identity: uuids and file
   names mean nothing in a spreadsheet, and there is no plain import path
   to match rows for (F22). The CSV is what a person reads, so it carries
   words - dimension names, tag labels, values in native units (ADR-0012).

   Built-in rows are stored as bare keys with no wording at all
   (builtins.ts), so the names have to come from the message catalogue.
   They arrive as functions rather than as an import: labels.ts is
   paraglide, and nothing the Node tier touches may import it (ADR-0016). */

import { dateInputValueFromEpochDay } from '../epochDay';
import { ARCHIVE_FORMAT_VERSION } from './container';
import type { ArchiveEntry, ArchiveJournal, PortablePreferences } from './payload';

/** How a built-in gets its wording. Both signatures are labels.ts's, so the
    screen hands its own lookups straight over. */
export interface PlainNaming {
  dimensionName(key: string): string;
  tagLabel(id: string): string;
}

/** RFC 4180 quoting: a field is quoted when it holds a delimiter, a quote
    or a line break, and a quote inside it is doubled. A note is free text
    with all three in it sooner or later, which is the one thing a
    hand-rolled CSV always gets wrong. Rows are separated by a bare LF
    rather than the RFC's CRLF - every spreadsheet reads both, and a note's
    own newlines are LF, so one file with two conventions in it would be
    stranger than one that consistently uses the shorter. */
function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const csvRow = (fields: string[]) => fields.map(csvField).join(',');

/** Wall-clock local time, the same clock the entry was logged against - the
    day it belongs to is the epoch day beside it, never this (CONTEXT:
    Timestamp). */
function localTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One column per gender dimension anything was ever logged against, in the
    journal's own order. Custom and hidden dimensions are in it on the same
    terms as built-in ones: hiding a dimension removes it from the pickers
    and changes nothing about the entries that already carry it (CONTEXT:
    Hidden). A dimension nobody has used is left out rather than exported as
    a column of blanks. */
function dimensionColumns(journal: ArchiveJournal, naming: PlainNaming) {
  const used = new Set(journal.entries.flatMap((e) => Object.keys(e.dims)));
  return journal.dimensions
    .filter((d) => used.has(d.key))
    .map((d) => ({ key: d.key, header: d.builtIn ? naming.dimensionName(d.key) : d.name }));
}

const entryRow = (entry: ArchiveEntry, columns: { key: string }[], tags: Map<string, string>) => [
  dateInputValueFromEpochDay(entry.epochDay),
  localTime(entry.timestamp),
  entry.mood === null ? '' : String(entry.mood),
  ...columns.map((c) => (c.key in entry.dims ? String(entry.dims[c.key]) : '')),
  // Semicolons, so the one field that can hold several things does not read
  // as several fields to a person scanning the column.
  entry.tags.map((id) => tags.get(id) ?? id).join('; '),
  entry.note
];

export function journalCsv(journal: ArchiveJournal, naming: PlainNaming): string {
  const columns = dimensionColumns(journal, naming);
  const tags = new Map(
    journal.tagGroups.flatMap((g) => g.tags.map((t) => [t.id, t.builtIn ? naming.tagLabel(t.id) : t.label] as const))
  );

  const header = ['date', 'time', 'mood', ...columns.map((c) => c.header), 'tags', 'note'];
  return [header, ...journal.entries.map((e) => entryRow(e, columns, tags))]
    .map(csvRow)
    .join('\n')
    .concat('\n');
}

/** The full structure, which is the archive's payload without the parts
    only the archive can carry: the photo files travel as bytes in an
    archive body (pack.ts) and cannot travel in a text file at all, so the
    entries name their photos here and that is all. The format version is
    the archive's, because the shape is the archive's. */
export function journalJson(journal: ArchiveJournal, preferences: PortablePreferences): string {
  return JSON.stringify({ formatVersion: ARCHIVE_FORMAT_VERSION, journal, preferences }, null, 2);
}

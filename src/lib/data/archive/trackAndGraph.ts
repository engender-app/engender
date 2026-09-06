/* Track & Graph CSV becomes an archive-shaped merge, the same division of
   labour daylio.ts set: parsing and resolving happen here, writing stays in
   the journal's archive area so preview cannot partially mutate the
   database on its way to finding a bad row (PRD F28).

   Track & Graph has no identity of its own beyond a feature name resolved
   by string and an epoch-milli timestamp, so the uuid below is a content
   hash over the tuple that actually identifies a reading - feature name,
   timestamp and value - the same shape contentUuid() already gives Daylio.
   A renamed tracker between two exports reads as a new one; that is the
   source's own property (its own identity is feature-name-keyed), not a
   bug to fix here.

   Every feature becomes its own *custom* ArchiveMeasurementType, never a
   built-in: matched against this device's existing customs by folded name
   so a re-import reuses the same type key rather than minting a duplicate
   type with nothing pointing at it (the failure a name-only match, not
   content-hashed, would otherwise let through).

   Track & Graph has no unit anywhere in its own format, so every value
   imports with an empty unit - guessing one out of a feature name is
   exactly the class of thing this app's import contract forbids - except a
   duration, which is seconds by construction. */

import { dateInputValueFromEpochDay, epochDayFromDateInputValue } from '../epochDay';
import { foldText } from '../fold';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { contentUuid, mintUuid } from '../journal/support';
import type { ArchiveJournal, ArchiveMeasurement, ArchiveMeasurementType } from './payload';

/* TrackAndGraphCsvError stays exported only for its own test (AU-09 test-only
   review). */
export class TrackAndGraphCsvError extends Error {
  constructor(message: string) {
    super(`Track & Graph CSV ${message}`);
    this.name = 'TrackAndGraphCsvError';
  }
}

/** Exported for the source registry (ticket 02). Column order does not
    matter and extra columns are tolerated - this only names what a near-miss
    file is missing. */
export const REQUIRED_COLUMNS = ['FeatureName', 'Timestamp', 'Value'] as const;
const OPTIONAL_COLUMNS = ['Label', 'Note'] as const;
const KNOWN_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS].map((column) => column.toLowerCase());

export interface TrackAndGraphPreview {
  /** Net additions, not raw CSV totals - what commit reports. */
  measurementCount: number;
  newTypeCount: number;
  /** `Label` and/or `Note`, when the header carries them: read and dropped,
      named here rather than silently discarded (Mapping's own rule). */
  ignoredColumns: string[];
  /** Any header column beyond the five this source knows, in the file's own
      casing - tolerated rather than fatal ("extra columns tolerated"). */
  unrecognizedColumns: string[];
  /** The resolved merge payload. A preview is the exact work committed,
      never an instruction to re-parse a file that may have changed by then. */
  journal: ArchiveJournal;
}

/* RFC 4180 fields, including doubled quotes and line breaks inside a quoted
   field. Strict after a closing quote so damaged input fails here rather
   than being reinterpreted as a different row. Duplicated from daylio.ts's
   own tokenizer rather than shared: the two error out under different
   names, and this is the only piece either module would have in common. */
function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;

  const finishField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (csv[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
        afterQuote = true;
      }
      continue;
    }

    if (afterQuote && char !== ',' && char !== '\r' && char !== '\n') {
      throw new TrackAndGraphCsvError('has text after a closing quoted field');
    }
    if (char === ',' && !quoted) {
      finishField();
    } else if (char === '\n') {
      finishRow();
    } else if (char === '\r') {
      if (csv[i + 1] === '\n') i += 1;
      finishRow();
    } else if (char === '"') {
      if (field !== '') throw new TrackAndGraphCsvError('has a quote inside an unquoted field');
      quoted = true;
    } else {
      field += char;
    }
  }

  if (quoted) throw new TrackAndGraphCsvError('has an unclosed quoted field');
  if (field !== '' || row.length > 0) finishRow();
  return rows;
}

interface TrackAndGraphRow {
  featureName: string;
  timestamp: string;
  value: string;
}

interface ParsedHeader {
  rows: TrackAndGraphRow[];
  ignoredColumns: string[];
  unrecognizedColumns: string[];
}

function parseRows(csv: string): ParsedHeader {
  const rows = csvRows(csv.replace(/^\uFEFF/, ''));
  if (rows.length === 0) throw new TrackAndGraphCsvError('is empty');
  const rawHeaders = rows[0].map((header) => header.trim());
  const headers = rawHeaders.map((header) => header.toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required.toLowerCase())) {
      throw new TrackAndGraphCsvError(`is missing the ${required} column (requires ${REQUIRED_COLUMNS.join(', ')})`);
    }
  }
  if (new Set(headers).size !== headers.length) throw new TrackAndGraphCsvError('has a duplicate column');

  const ignoredColumns = OPTIONAL_COLUMNS.filter((column) => headers.includes(column.toLowerCase()));
  const unrecognizedColumns = rawHeaders.filter((_, index) => !KNOWN_COLUMNS.includes(headers[index]));

  const featureIndex = headers.indexOf('featurename');
  const timestampIndex = headers.indexOf('timestamp');
  const valueIndex = headers.indexOf('value');

  const dataRows = rows.slice(1).map((fields, index) => {
    if (fields.length !== headers.length) {
      throw new TrackAndGraphCsvError(`row ${index + 2} has ${fields.length} fields; expected ${headers.length}`);
    }
    return { featureName: fields[featureIndex], timestamp: fields[timestampIndex], value: fields[valueIndex] };
  });

  return { rows: dataRows, ignoredColumns, unrecognizedColumns };
}

/** The source registry's own sniff (ticket 02): does the header look like
    Track & Graph's, with no commitment to the rest of the file parsing. */
export function detectTrackAndGraph(text: string): boolean {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const firstLine = withoutBom.split(/\r\n|\r|\n/, 1)[0] ?? '';
  try {
    const headers = csvRows(firstLine)[0]?.map((header) => header.trim().toLowerCase()) ?? [];
    return REQUIRED_COLUMNS.every((required) => headers.includes(required.toLowerCase()));
  } catch {
    return false;
  }
}

/** `Timestamp` is `OffsetDateTime.toString()`: the wall-clock date is the
    literal `YYYY-MM-DD` prefix, however it is offset - the offset says how
    to read the clock, not which IANA zone it happened in, so there is
    nothing to convert (spec's own "Dates"). Round-tripped through
    `dateInputValueFromEpochDay` the way daylio.ts's own `localDay` guards
    against an impossible calendar date such as day 32. */
function localDay(timestamp: string, rowNumber: number): number {
  const match = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(timestamp.trim());
  const datePart = match?.[1] ?? null;
  const epochDay = datePart ? epochDayFromDateInputValue(datePart) : null;
  if (epochDay === null || dateInputValueFromEpochDay(epochDay) !== datePart) {
    throw new TrackAndGraphCsvError(`row ${rowNumber} has an invalid Timestamp: ${timestamp || '(empty)'}`);
  }
  return epochDay;
}

interface TrackAndGraphValue {
  value: number;
  /** `seconds` for a duration, by construction; empty for everything else -
      this source has no unit anywhere in its own format (spec's own
      "Units: do not infer them"). */
  unit: string;
}

/* Track & Graph's `parseToRecordData` is the real spec for `Value`, and it
   is not just a number (spec's own "The value grammar"):

     - no colon: a plain double
     - a prefix matching H:MM:SS (each part optionally signed): a duration,
       in seconds
     - more colons past that prefix: the same duration, with a trailing
       label this source drops - Label and Note have no destination
       (Mapping's own rule), and neither does an in-band one, so the
       explicit Label column never has anything to lose to
     - exactly one colon otherwise: the legacy `value:label`, value before
       the colon, and the same dropped label after it

   Checked in this order because the duration pattern requires two colons a
   single `value:label` string never has. */
const DURATION_PREFIX = /^(-?\d*):(-?\d{2}):(-?\d{2})/;

/* parseTrackAndGraphValue stays exported only for its own test (AU-09
   test-only review). */
export function parseTrackAndGraphValue(raw: string): TrackAndGraphValue | null {
  const trimmed = raw.trim();
  const duration = DURATION_PREFIX.exec(trimmed);
  if (duration) {
    const [, hours, minutes, seconds] = duration.map((part) => Number(part || '0'));
    if ([hours, minutes, seconds].some(Number.isNaN)) return null;
    return { value: hours * 3600 + minutes * 60 + seconds, unit: 'seconds' };
  }

  const colonIndex = trimmed.indexOf(':');
  const numeric = colonIndex === -1 ? trimmed : trimmed.slice(0, colonIndex);
  if (numeric === '') return null;
  const value = Number(numeric);
  if (Number.isNaN(value)) return null;
  return { value, unit: '' };
}

/** Existing *custom* types only, folded by name (tagMatches' own pattern in
    daylio.ts) - never a built-in, however the name reads, because every
    Track & Graph feature is mapped to a custom type by the spec's own rule.
    Matching by name is what lets a re-import reuse the type a first import
    minted instead of creating a same-named duplicate nothing points at. */
function customTypeMatches(journal: ArchiveJournal): Map<string, string> {
  const matches = new Map<string, string>();
  for (const type of journal.measurementTypes) {
    if (type.builtIn) continue;
    const folded = foldText(type.name);
    if (!matches.has(folded)) matches.set(folded, type.key);
  }
  return matches;
}

export async function trackAndGraphPreview(csv: string, existing: ArchiveJournal): Promise<TrackAndGraphPreview> {
  const { rows, ignoredColumns, unrecognizedColumns } = parseRows(csv);
  const existingMeasurements = new Set(existing.measurements.map((measurement) => measurement.id));
  const seenMeasurements = new Set<string>();
  const typeKeys = customTypeMatches(existing);
  const newTypes = new Map<string, ArchiveMeasurementType>();
  const measurements: ArchiveMeasurement[] = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const featureName = row.featureName.trim();
    if (!featureName) throw new TrackAndGraphCsvError(`row ${rowNumber} has an empty FeatureName`);
    const epochDay = localDay(row.timestamp, rowNumber);
    const parsed = parseTrackAndGraphValue(row.value);
    if (!parsed) throw new TrackAndGraphCsvError(`row ${rowNumber} has an invalid Value: ${row.value || '(empty)'}`);

    const uuid = await contentUuid([featureName, row.timestamp, row.value]);
    if (existingMeasurements.has(uuid) || seenMeasurements.has(uuid)) continue;
    seenMeasurements.add(uuid);

    const folded = foldText(featureName);
    let typeKey = typeKeys.get(folded) ?? newTypes.get(folded)?.key;
    if (!typeKey) {
      typeKey = mintUuid();
      newTypes.set(folded, { key: typeKey, name: featureName, builtIn: false, hidden: false });
    }

    measurements.push({ id: uuid, type: typeKey, epochDay, value: parsed.value, unit: parsed.unit });
  }

  return {
    measurementCount: measurements.length,
    newTypeCount: newTypes.size,
    ignoredColumns: [...ignoredColumns],
    unrecognizedColumns,
    journal: { ...emptyArchiveJournal(), measurementTypes: [...newTypes.values()], measurements }
  };
}

/* Daylio CSV becomes an archive-shaped merge, but only after a caller has
   inspected this module's preview. Parsing and resolving happen here;
   writing stays in the journal's archive area so preview cannot partially
   mutate the database on its way to finding a bad row (PRD F28).

   Daylio has no row identity. The UUID below is derived from the fields the
   ticket names: local date, local time, mood label and composed note. The
   same export therefore reaches restore.ts with the same entry identities
   every time, and its ordinary skip-existing merge makes re-import a no-op
   (ADR-0002). */

import { dateInputValueFromEpochDay, epochDayFromDateInputValue, localDateFromEpochDay } from '../epochDay';
import { entryIsEmpty } from '../entryContent';
import { foldText } from '../fold';
import { mintUuid } from '../journal/support';
import type { ArchiveEntry, ArchiveJournal, ArchiveTag, ArchiveTagGroup } from './payload';

export interface DaylioNaming {
  /** Every label a built-in tag has in supported locales. Custom tag labels
      come from the journal snapshot itself. */
  tagLabels(id: string): readonly string[];
}

export interface DaylioMoodMapping {
  label: string;
  mood: number | null;
}

export interface DaylioPreview {
  /** Net additions, not raw CSV totals. These are what commit reports. */
  entryCount: number;
  matchedTagCount: number;
  newTagCount: number;
  moodMappings: DaylioMoodMapping[];
  unmappedMoodLabels: string[];
  /** The resolved merge payload. A preview is the exact work committed,
      rather than an instruction to parse a possibly changed file again. */
  journal: ArchiveJournal;
}

export interface DaylioCommitResult {
  entriesAdded: number;
  tagsAdded: number;
}

export class DaylioCsvError extends Error {
  constructor(message: string) {
    super(`Daylio CSV ${message}`);
    this.name = 'DaylioCsvError';
  }
}

const MOODS = new Map<string, number>([
  ['awful', 1],
  ['okropnie', 1],
  ['bad', 2],
  ['źle', 2],
  ['meh', 3],
  ['tak sobie', 3],
  ['good', 4],
  ['dobrze', 4],
  ['rad', 5],
  ['świetnie', 5]
]);

const REQUIRED_COLUMNS = ['full_date', 'time', 'mood', 'activities', 'note_title', 'note'] as const;

type DaylioRow = Record<(typeof REQUIRED_COLUMNS)[number], string>;

/** RFC 4180 fields, including doubled quotes and line breaks inside a quoted
    note. Strict after a closing quote so damaged input fails here rather
    than being reinterpreted as a different journal entry. */
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
      throw new DaylioCsvError('has text after a closing quoted field');
    }
    if (char === ',' && !quoted) {
      finishField();
    } else if (char === '\n') {
      finishRow();
    } else if (char === '\r') {
      if (csv[i + 1] === '\n') i += 1;
      finishRow();
    } else if (char === '"') {
      if (field !== '') throw new DaylioCsvError('has a quote inside an unquoted field');
      quoted = true;
    } else {
      field += char;
    }
  }

  if (quoted) throw new DaylioCsvError('has an unclosed quoted field');
  if (field !== '' || row.length > 0) finishRow();
  return rows;
}

function parseRows(csv: string): DaylioRow[] {
  const rows = csvRows(csv.replace(/^\uFEFF/, ''));
  if (rows.length === 0) throw new DaylioCsvError('is empty');
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  for (const required of REQUIRED_COLUMNS) {
    if (!headers.includes(required)) throw new DaylioCsvError(`is missing the ${required} column`);
  }
  if (new Set(headers).size !== headers.length) throw new DaylioCsvError('has a duplicate column');

  return rows.slice(1).map((fields, index) => {
    if (fields.length !== headers.length) {
      throw new DaylioCsvError(`row ${index + 2} has ${fields.length} fields; expected ${headers.length}`);
    }
    return Object.fromEntries(REQUIRED_COLUMNS.map((column) => [column, fields[headers.indexOf(column)]])) as DaylioRow;
  });
}

function localDay(value: string, rowNumber: number): number {
  const epochDay = /^\d{4}-\d{2}-\d{2}$/.test(value) ? epochDayFromDateInputValue(value) : null;
  if (epochDay === null || dateInputValueFromEpochDay(epochDay) !== value) {
    throw new DaylioCsvError(`row ${rowNumber} has an invalid full_date: ${value || '(empty)'}`);
  }
  return epochDay;
}

function localTime(value: string, epochDay: number, rowNumber: number): { timestamp: number; identity: string } {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(value.trim());
  if (!match) throw new DaylioCsvError(`row ${rowNumber} has an invalid time: ${value || '(empty)'}`);
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const meridiem = match[4]?.toUpperCase();

  if (minute > 59 || second > 59 || (meridiem ? hour < 1 || hour > 12 : hour > 23)) {
    throw new DaylioCsvError(`row ${rowNumber} has an invalid time: ${value}`);
  }
  if (meridiem) hour = (hour % 12) + (meridiem === 'PM' ? 12 : 0);

  const date = localDateFromEpochDay(epochDay);
  date.setHours(hour, minute, second, 0);
  return {
    timestamp: date.getTime(),
    identity: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`
  };
}

const nonBlank = (value: string): boolean => value.trim().length > 0;

function noteOf(row: DaylioRow): string {
  return [row.note_title, row.note].filter(nonBlank).join('\n');
}

function activitiesOf(row: DaylioRow): string[] {
  const byFold = new Map<string, string>();
  for (const label of row.activities.split('|').map((activity) => activity.trim()).filter(Boolean)) {
    if (!byFold.has(foldText(label))) byFold.set(foldText(label), label);
  }
  return [...byFold.values()];
}

async function entryUuid(date: string, time: string, mood: string, note: string): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([date, time, mood, note]));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16);
  // A name-derived UUID: version 5 and RFC 4122 variant bits, with SHA-256
  // supplying the deterministic bytes rather than SHA-1.
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function tagMatches(journal: ArchiveJournal, naming: DaylioNaming): Map<string, string> {
  const matches = new Map<string, string>();
  for (const tag of journal.tagGroups.flatMap((group) => group.tags)) {
    const labels = tag.builtIn ? [...naming.tagLabels(tag.id), tag.label] : [tag.label];
    for (const label of labels.filter(nonBlank)) {
      const folded = foldText(label);
      if (!matches.has(folded)) matches.set(folded, tag.id);
    }
  }
  return matches;
}

const emptyImportJournal = (tagGroup: ArchiveTagGroup, entries: ArchiveEntry[]): ArchiveJournal => ({
  dimensions: [],
  presets: [],
  tagGroups: [tagGroup],
  entries,
  milestones: [],
  labResults: [],
  measurements: [],
  reminders: [],
  tallyEvents: [],
  regimenEpisodes: []
});

export async function daylioPreview(
  csv: string,
  existing: ArchiveJournal,
  naming: DaylioNaming
): Promise<DaylioPreview> {
  const rows = parseRows(csv);
  const existingEntries = new Set(existing.entries.map((entry) => entry.uuid));
  const moodMappings = new Map<string, number | null>();
  const candidates: { entry: ArchiveEntry; activities: string[] }[] = [];
  const seenEntries = new Set<string>();

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;
    const epochDay = localDay(row.full_date, rowNumber);
    const time = localTime(row.time, epochDay, rowNumber);
    const moodLabel = row.mood.trim();
    // Unlike activities, moods do not fold to near-matches: a user's custom
    // label must not be guessed from how much it resembles a default one.
    const mood = moodLabel ? (MOODS.get(moodLabel.toLocaleLowerCase()) ?? null) : null;
    if (moodLabel && !moodMappings.has(moodLabel)) moodMappings.set(moodLabel, mood);
    const note = noteOf(row);
    const activities = activitiesOf(row);
    const uuid = await entryUuid(row.full_date, time.identity, moodLabel, note);
    const entry: ArchiveEntry = {
      uuid,
      epochDay,
      timestamp: time.timestamp,
      mood,
      note,
      dims: {},
      tags: [],
      photos: [],
      bodyRegions: {}
    };

    if (
      !moodLabel &&
      entryIsEmpty({ mood, note, dimCount: 0, tagCount: activities.length, photoCount: 0, bodyRegionCount: 0 })
    ) {
      throw new DaylioCsvError(`row ${rowNumber} has no mood, activities or note`);
    }
    if (!existingEntries.has(uuid) && !seenEntries.has(uuid)) {
      candidates.push({ entry, activities });
      seenEntries.add(uuid);
    }
  }

  const matches = tagMatches(existing, naming);
  const matchedActivities = new Set<string>();
  const newTags = new Map<string, ArchiveTag>();
  for (const candidate of candidates) {
    for (const label of candidate.activities) {
      const folded = foldText(label);
      const matched = matches.get(folded);
      if (matched) {
        candidate.entry.tags.push(matched);
        matchedActivities.add(folded);
        continue;
      }
      let tag = newTags.get(folded);
      if (!tag) {
        tag = { id: mintUuid(), label, builtIn: false, hidden: false };
        newTags.set(folded, tag);
      }
      candidate.entry.tags.push(tag.id);
    }
  }

  const mappings = [...moodMappings].map(([label, mood]) => ({ label, mood }));
  const imported: ArchiveTagGroup = {
    key: 'imported',
    name: '',
    enabled: true,
    builtIn: true,
    tags: [...newTags.values()]
  };
  return {
    entryCount: candidates.length,
    matchedTagCount: matchedActivities.size,
    newTagCount: newTags.size,
    moodMappings: mappings,
    unmappedMoodLabels: mappings.filter((mapping) => mapping.mood === null).map((mapping) => mapping.label),
    journal: emptyImportJournal(imported, candidates.map((candidate) => candidate.entry))
  };
}
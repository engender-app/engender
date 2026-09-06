/* Pixels' export has no version and no schema documented anywhere but the
   sample ticket 17 preserved: the vendor never wrote it down, and the app's
   own source has since been deleted. Parsing and resolving happen here, the
   same division daylio.ts and transtracks.ts already keep; writing stays in
   the journal's archive area.

   Two decisions this source has to make where the file underdetermines the
   answer:

   - Mood scale direction. `scores` is a 1-5 range with no documented
     endpoints. A third-party dashboard built against real Pixels exports
     (github.com/rachelgould/pixels-dashboard, gatsby/src/components/
     barChart.js) maps score-1 through score-5 to a five-emoji legend
     ["😭","😥","😐","😊","😁"] in index order - 1 is the sobbing face, 5 is
     the beaming one. That is independent of this app's own vendor and
     agrees with this app's own scale (daylio.ts's MOODS: awful=1 ... rad=5),
     so a Pixels score maps to `mood` with no inversion.

   - Multiple scores a day ("subpixels"). `scores` can hold more than one
     value; ArchiveEntry has room for exactly one mood a day, so this source
     averages them and rounds to the nearest whole number.
     `averagedRecordCount` names how many records that touched, so a real
     import shows it happened rather than only a comment saying so.

   Identity is a content hash over (date, type, scores, notes) - there is no
   id field to reuse (ticket 17's "Identity") - via journal/support.ts's
   contentUuid(), the same shared hash daylio.ts and trackAndGraph.ts already
   call over their own identifying tuples. Two distinct same-day records
   with identical content are therefore indistinguishable and merge into
   one - a property of the source, not a bug to fix.

   Tag groups are namespaced `pixels:<type>` rather than the type string
   verbatim: this app's own built-in vocabulary already has tag groups keyed
   'emotions' and 'activities' (vocabulary/builtins.ts) for an unrelated,
   dimension-linked set of tags, and Pixels' same-named groups must never
   land in them by accident. A new tag inside a group matches this device's
   existing ones by folded label first, the same way daylio.ts's
   tagMatches() does, and mints a fresh id (mintUuid) only when nothing
   matches - which is what makes a repeated import of the same file add
   nothing twice over. */

import { dateInputValueFromEpochDay, epochDayFromDateInputValue, startOfDayTimestamp } from '../epochDay';
import { foldText } from '../fold';
import { emptyArchiveJournal } from '../journal/archiveSections';
import { contentUuid, mintUuid } from '../journal/support';
import type { ArchiveEntry, ArchiveJournal, ArchiveTagGroup } from './payload';

/* PixelsBackupError stays exported only for its own test (AU-09 test-only
   review). */
export class PixelsBackupError extends Error {
  constructor(message: string) {
    super(`Pixels backup ${message}`);
    this.name = 'PixelsBackupError';
  }
}

export interface PixelsPreview {
  /** Net additions, not raw file totals - what commit reports. */
  entryCount: number;
  matchedTagCount: number;
  newTagCount: number;
  /** Every `type` value this file carried besides `MOOD`, named rather than
      guessed at (spec's "no fallback to guessing"). A record of an
      unrecognised type is skipped, never fatal. */
  unrecognizedTypes: string[];
  /** How many records had more than one `scores` element and were averaged
      into the entry's one `mood`, rounded to the nearest whole number - the
      decision this source makes where the file does not (ticket 17). */
  averagedRecordCount: number;
  /** The resolved merge payload. A preview is the exact work committed,
      never an instruction to re-read a file that may have changed by then. */
  journal: ArchiveJournal;
}

interface RawRecord {
  date: unknown;
  type: unknown;
  scores: unknown;
  notes: unknown;
  tags: unknown;
}

/** A non-throwing sniff (sources.ts's own contract): a bare JSON array whose
    first record, if any, carries the two fields ticket 17 calls "the only
    structural guard available" - a string `date` and a string `type`. An
    empty array is Pixels' own shape for a fresh export, so it detects too.
    Never the full structural validation - that stays in `pixelsPreview`,
    which throws by naming the record. */
export function detectPixels(file: Uint8Array): boolean {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(file));
    if (!Array.isArray(parsed)) return false;
    if (parsed.length === 0) return true;
    const first = parsed[0] as Record<string, unknown> | null;
    return first !== null && typeof first === 'object' && typeof first.date === 'string' && typeof first.type === 'string';
  } catch {
    return false;
  }
}

function parseRecords(file: Uint8Array): RawRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(file));
  } catch {
    throw new PixelsBackupError('is not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new PixelsBackupError('is not a JSON array');
  return parsed.map((raw, index) => {
    if (raw === null || typeof raw !== 'object') throw new PixelsBackupError(`record ${index} is not an object`);
    return raw as RawRecord;
  });
}

function requireString(value: unknown, field: string, index: number): string {
  if (typeof value !== 'string' || value === '') {
    throw new PixelsBackupError(`record ${index} is missing its ${field}`);
  }
  return value;
}

/** `scores` is the one MOOD field ticket 17 does not put in the "date and
    type are the only structural guard" camp: a record missing it, or
    carrying something that is not a non-empty array of numbers, is not
    unlike a record with no notes and no tags (spec's own leniency) - it
    still has a real day and a real identity, so it imports with no mood
    rather than taking the whole file down over one absent field. */
function parseScores(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0 || !value.every((score) => typeof score === 'number')) {
    return null;
  }
  return value as number[];
}

/** `date` is `YYYY-M-D`, variable-width month and day (ticket 17) - looser
    than daylio.ts's `localDay`, which requires zero-padding and so cannot be
    reused here. Canonicalized then round-tripped through the same epoch-day
    arithmetic: a month or day that rolls over (`2026-13-1` becomes 1 January
    2027) changes what comes back out, which is what catches it without this
    module inventing its own calendar validation. */
const PIXELS_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

function pixelsLocalDay(value: unknown, index: number): number {
  const text = typeof value === 'string' ? value : '';
  const match = PIXELS_DATE.exec(text);
  const canonical = match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : null;
  const epochDay = canonical ? epochDayFromDateInputValue(canonical) : null;
  if (epochDay === null || dateInputValueFromEpochDay(epochDay) !== canonical) {
    throw new PixelsBackupError(`record ${index} has an invalid date: ${text || '(empty)'}`);
  }
  return epochDay;
}

function pixelsGroupKey(type: string): string {
  return `pixels:${type}`;
}

/** Folded label -> tag id, one map per tag group key already in the
    journal - the same shape daylio.ts's tagMatches() builds, scoped to one
    group instead of the whole vocabulary since Pixels' own groups only ever
    match themselves. */
function existingTagMatches(existing: ArchiveJournal): Map<string, Map<string, string>> {
  const byGroup = new Map<string, Map<string, string>>();
  for (const group of existing.tagGroups) {
    const labels = new Map<string, string>();
    for (const tag of group.tags) labels.set(foldText(tag.label), tag.id);
    byGroup.set(group.key, labels);
  }
  return byGroup;
}

const emptyImportJournal = (tagGroups: ArchiveTagGroup[], entries: ArchiveEntry[]): ArchiveJournal => ({
  ...emptyArchiveJournal(),
  tagGroups,
  entries
});

export async function pixelsPreview(file: Uint8Array, existing: ArchiveJournal): Promise<PixelsPreview> {
  const records = parseRecords(file);
  const existingEntries = new Set(existing.entries.map((entry) => entry.uuid));
  const matches = existingTagMatches(existing);
  const groupsByKey = new Map<string, ArchiveTagGroup>();
  const seenLabelsThisImport = new Map<string, Map<string, string>>();
  const unrecognizedTypes = new Set<string>();
  const entries: ArchiveEntry[] = [];
  const seenEntryUuids = new Set<string>();
  let matchedTagCount = 0;
  let newTagCount = 0;
  let averagedRecordCount = 0;

  // New within this one file, matched to an existing tag by folded label
  // first, minting a fresh id only when nothing matches - so a repeated
  // import of the same file resolves the same tag id it did the first time.
  function tagIdFor(type: string, label: string): string {
    const groupKey = pixelsGroupKey(type);
    const folded = foldText(label);
    let seenInGroup = seenLabelsThisImport.get(groupKey);
    if (!seenInGroup) {
      seenInGroup = new Map();
      seenLabelsThisImport.set(groupKey, seenInGroup);
    }
    const already = seenInGroup.get(folded);
    if (already) return already;

    const existingId = matches.get(groupKey)?.get(folded);
    if (existingId) {
      matchedTagCount += 1;
      seenInGroup.set(folded, existingId);
      return existingId;
    }

    const id = mintUuid();
    newTagCount += 1;
    seenInGroup.set(folded, id);
    let group = groupsByKey.get(groupKey);
    if (!group) {
      group = { key: groupKey, name: type, enabled: true, builtIn: false, tags: [] };
      groupsByKey.set(groupKey, group);
    }
    group.tags.push({ id, label, builtIn: false, hidden: false });
    return id;
  }

  for (const [index, raw] of records.entries()) {
    // `type` is required on every record: it is what detectPixels itself
    // relies on to recognise the file at all, so a record missing it
    // entirely is malformed rather than merely an unfamiliar record kind.
    const type = requireString(raw.type, 'type', index);
    if (type !== 'MOOD') {
      unrecognizedTypes.add(type);
      continue;
    }

    const epochDay = pixelsLocalDay(raw.date, index);
    const date = raw.date as string;
    const scores = parseScores(raw.scores);
    if (scores && scores.length > 1) averagedRecordCount += 1;
    const mood = scores ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
    const notes = typeof raw.notes === 'string' ? raw.notes : '';

    const tagIds: string[] = [];
    for (const rawGroup of Array.isArray(raw.tags) ? raw.tags : []) {
      if (rawGroup === null || typeof rawGroup !== 'object') continue;
      const groupType = (rawGroup as Record<string, unknown>).type;
      const rawEntries = (rawGroup as Record<string, unknown>).entries;
      if (typeof groupType !== 'string' || groupType === '' || !Array.isArray(rawEntries)) continue;
      for (const rawLabel of rawEntries) {
        if (typeof rawLabel !== 'string' || rawLabel === '') continue;
        tagIds.push(tagIdFor(groupType, rawLabel));
      }
    }

    const uuid = await contentUuid([date, type, scores, notes]);
    if (existingEntries.has(uuid) || seenEntryUuids.has(uuid)) continue;
    seenEntryUuids.add(uuid);
    entries.push({
      uuid,
      epochDay,
      timestamp: startOfDayTimestamp(epochDay),
      mood,
      note: notes,
      dims: {},
      tags: tagIds,
      photos: [],
      recordings: [],
      videos: [],
      bodyRegions: {},
      starred: false,
      presentationId: null
    });
  }

  return {
    entryCount: entries.length,
    matchedTagCount,
    newTagCount,
    unrecognizedTypes: [...unrecognizedTypes],
    averagedRecordCount,
    journal: emptyImportJournal([...groupsByKey.values()], entries)
  };
}

/* The journal book (phase 5 ticket 17, CONTEXT: "Journal book"): everything
   a person chose to put in a keepsake print of a chosen range, assembled in
   one read. A view over rows entries, milestones, the doubt journal and side
   effects own, the same way clinicianSummary.ts is a view over its own five
   areas - nothing here is stored, and nothing here computes a figure one of
   those areas does not already produce (ADR-0010).

   This is not a second clinician summary and deliberately does not reuse
   that area's section registry. The audience is the person themselves, the
   sections have nothing in common with a doctor's five, and the difference
   that matters is the one the registry has no room for: a book carries what
   was *chosen*, section by section, rather than everything the range holds.

   Which is why an unchosen type is not read at all rather than read and
   left undrawn. The inclusion below decides what the SQL asks for, so a
   book that was told to leave out doubt entries has no doubt entry in it to
   leak - and an entry's photos and tags are stripped here rather than in
   the markup, so the screen has nothing to opt back in by accident.

   Wording is not here (ADR-0016): the inclusion picker's labels live in
   vocabulary/journalBookLabels.ts, keyed the same way. */

import type { DoubtEntry, Entry, Milestone, Photo, SideEffect } from '../types';
import type { DoubtJournalArea } from './doubtJournal';
import type { EntriesArea } from './entries';
import type { MilestonesArea } from './milestones';
import type { SideEffectsArea } from './sideEffects';
import type { StatsArea } from './stats';

/** What a book may carry, each answered before it is generated. Photos and
    tags qualify entries rather than standing alone: a photo belongs to the
    entry it was taken for, and printing one without the day it came from
    would be a contact sheet, not a book. */
export interface JournalBookInclusion {
  entries: boolean;
  photos: boolean;
  tags: boolean;
  milestones: boolean;
  doubtEntries: boolean;
  sideEffects: boolean;
  openingPage: boolean;
}

export type JournalBookInclusionKey = keyof JournalBookInclusion;

/** The picker's order, so the screen never hand-lists the choices: the safe
    minimal set first, then the opening page, then the three a book does not
    take unless it is asked to. */
export const JOURNAL_BOOK_INCLUSION_KEYS: readonly JournalBookInclusionKey[] = [
  'entries',
  'photos',
  'milestones',
  'openingPage',
  'tags',
  'doubtEntries',
  'sideEffects'
];

/** What a book covers before anyone touches the picker: an entry's own words
    and photos, and the milestones of the range.

    Everything else starts off. An archive is encrypted and stays on the
    device; this is the one export meant to be printed, handed over or left
    on a shelf, so the types that say the most about a bad week - a doubt
    entry, a side effect's severity, a dysphoria or euphoria tag - are opted
    into rather than out of. */
export const JOURNAL_BOOK_DEFAULT_INCLUSION: JournalBookInclusion = {
  entries: true,
  photos: true,
  tags: false,
  milestones: true,
  doubtEntries: false,
  sideEffects: false,
  openingPage: false
};

/** An entry as a book prints it. Narrower than `Entry` on purpose: the
    fields a book has no page for - dimension values, body regions,
    recordings, video notes, the starred flag - are not carried at all, so
    the only way one reaches paper is a later ticket widening this type. */
export interface JournalBookEntry {
  id: number;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  /** Empty unless photos were included. */
  photos: Photo[];
  /** Tag ids, empty unless tags were included. Named at display time, the
      way every other screen names a built-in tag (ADR-0016). */
  tags: string[];
}

/** The wrapped-style opening page's numbers (ticket 16's card takes stats,
    not a journal). Read off the recap seam so the cover of a book says what
    the wrapped screens say about the same range. */
export interface JournalBookOpening {
  entryCount: number;
  bestStreak: number;
  milestoneCount: number;
}

export interface JournalBook {
  fromEpochDay: number;
  toEpochDay: number;
  /** Oldest first, all of them: a book is bound in the order it was lived,
      unlike every on-screen list in the app. */
  entries: JournalBookEntry[];
  milestones: Milestone[];
  doubtEntries: DoubtEntry[];
  sideEffects: SideEffect[];
  /** Null unless the opening page was asked for. */
  opening: JournalBookOpening | null;
}

export interface JournalBookAreas {
  entries: EntriesArea;
  milestones: MilestonesArea;
  doubtJournal: DoubtJournalArea;
  sideEffects: SideEffectsArea;
  stats: StatsArea;
}

/* searchEntries with no query and no tags is the entries area's own range
   read - the search screen's path with its two date filters set and nothing
   else, which is what tryouts already reaches for. It excludes trashed
   entries, as every read there does (ticket 19), and answers newest first,
   so a book turns it around. */
async function readEntries(
  { entries }: JournalBookAreas,
  fromEpochDay: number,
  toEpochDay: number,
  inclusion: JournalBookInclusion
): Promise<JournalBookEntry[]> {
  const found = await entries.searchEntries('', [], {
    startEpochDay: fromEpochDay,
    endEpochDay: toEpochDay
  });
  return [...found].reverse().map((entry: Entry) => ({
    id: entry.id,
    epochDay: entry.epochDay,
    timestamp: entry.timestamp,
    mood: entry.mood,
    note: entry.note,
    photos: inclusion.photos ? entry.photos : [],
    tags: inclusion.tags ? entry.tags : []
  }));
}

/* milestones.ts has no range read (nothing else needs one - the milestones
   screen shows the whole list), so the range is applied here. Selecting
   rows, not computing a figure, the same way clinicianSummary.ts filters
   lab results. */
async function readMilestones(
  { milestones }: JournalBookAreas,
  fromEpochDay: number,
  toEpochDay: number
): Promise<Milestone[]> {
  const all = await milestones.getMilestones();
  return all.filter((milestone) => milestone.epochDay >= fromEpochDay && milestone.epochDay <= toEpochDay);
}

async function readOpening(
  { stats }: JournalBookAreas,
  fromEpochDay: number,
  toEpochDay: number
): Promise<JournalBookOpening> {
  const recap = await stats.recap(fromEpochDay, toEpochDay);
  return {
    entryCount: recap.entryCount,
    bestStreak: recap.bestStreak,
    milestoneCount: recap.milestones.length
  };
}

export interface JournalBookArea {
  /** Everything the inclusion asks for, for `[fromEpochDay, toEpochDay]`.
      Nothing is stored: reopening the screen rebuilds the book from the
      rows as they stand then. */
  getBook(fromEpochDay: number, toEpochDay: number, inclusion: JournalBookInclusion): Promise<JournalBook>;
}

export function makeJournalBookArea(areas: JournalBookAreas): JournalBookArea {
  return {
    async getBook(fromEpochDay, toEpochDay, inclusion) {
      // Concurrent because the parts are independent - none of them reads
      // what another produced.
      const [entries, milestones, doubtEntries, sideEffects, opening] = await Promise.all([
        inclusion.entries ? readEntries(areas, fromEpochDay, toEpochDay, inclusion) : [],
        inclusion.milestones ? readMilestones(areas, fromEpochDay, toEpochDay) : [],
        inclusion.doubtEntries ? areas.doubtJournal.getEntriesInRange(fromEpochDay, toEpochDay) : [],
        inclusion.sideEffects ? areas.sideEffects.getSideEffectsInRange(fromEpochDay, toEpochDay) : [],
        inclusion.openingPage ? readOpening(areas, fromEpochDay, toEpochDay) : null
      ]);
      return { fromEpochDay, toEpochDay, entries, milestones, doubtEntries, sideEffects, opening };
    }
  };
}

/* The last write in every area (phase 8 features ticket 03, ADR-0027,
   ADR-0010).

   Four features want the same fact and none of them could have it cheaply:
   the return surface (what was last written where, to say anything about a
   gap), the hub's live lines (eighteen times on one screen), the
   finished-area suggestion, and Home's cap. What existed instead was six
   one-off latest reads and a habit of computing recency in memory over a
   full fetch - `liveTiles.ts` read every measurement ever stored with a
   range of zero to 999999 and looped to find the newest one.

   A registry mirroring the shape `day.ts` and `textSearch.ts` already use,
   for the reason those two are (ADR-0027, ADR-0031): the alternative is a
   hand-written list a new area is silently missing from, with no test able
   to notice. Unlike those two, this registry's key is `ArchiveSectionName`
   itself rather than a second, similarly-shaped type - day.ts's own
   `DaySectionKey` diverges from the archive's names in three places
   (`procedureRecords`/`procedures`, `tryoutPhotos`/`tryouts`,
   `feltSense`/`feltSenseEntries`), which is exactly the drift ticket 13
   asked this registry to avoid: "the key is the area key space ticket 13
   settles, so this registry and the area record agree by construction."

   What one entry declares:

     key     the area, named by its archive section (ADR-0027) - the same
             space `area_state` rows are keyed by (areaState.ts)
     tables  the tables its read touches, so a future live wrapper's
             dependency list is derived from the registry rather than
             maintained beside it (writes.ts, the same single-sourcing
             DAY_TABLES gets)
     read    one bounded `MAX`, through that area's own method - never a
             fetched list reduced in JS, and never a raw SQL string written
             here: the date column differs per table between an epoch day, a
             timestamp and a span start, and guessing at columns from this
             seam is what day.ts's own comment already refused

   Explicitly not a generic table-name-driven query, for the reason above.

   Every read is bounded by `todayEpochDay` and no module reads a clock: a
   row dated after today - a clock-skewed import, a bad write - is excluded
   rather than trusted as "the last write". The registry's own tests prove
   this rather than assuming it (a future row is seeded and checked to fall
   away).

   Registered areas mirror day.ts's own set of dated-record areas exactly,
   since day.ts already settled which areas hold a dated write worth asking
   about and which do not - a reference-data area, a span, a schedule or an
   area with no date of its own answers "when was this last written" no
   better than it answers "what happened on this day". `LAST_WRITE_OPT_OUTS`
   below is that same reasoning, restated for this registry's own
   completeness check rather than copied from day.ts's.

   No consumer reads this yet (tickets 04/05 here, and the UX spec's Home and
   hub tickets); nothing about this module's shape is allowed to bend toward
   whichever arrives first. */

import type { TableName } from '../live/writes';
import type { ArchiveSectionName } from './archiveSections';
import type { CycleEventsArea } from './cycleEvents';
import type { DocumentsArea } from './documents';
import type { DosesArea } from './doses';
import type { EntriesArea } from './entries';
import type { FeltSenseArea } from './feltSense';
import type { HairProgressArea } from './hairProgress';
import type { HairRemovalArea } from './hairRemoval';
import type { LabsArea } from './labs';
import type { MeasurementsArea } from './measurements';
import type { MilestonesArea } from './milestones';
import type { PersonalEffectsArea } from './personalEffects';
import type { ProceduresArea } from './procedures';
import type { SideEffectsArea } from './sideEffects';
import type { SizeRecordsArea } from './sizeRecords';
import type { TaperArea } from './taper';
import type { TallyArea } from './tally';
import type { TryoutsArea } from './tryouts';
import type { VoiceBenchmarksArea } from './voiceBenchmarks';
import type { WearSessionsArea } from './wearSessions';

/** The areas a last-write read may reach through: the ones `openJournal`
    already built, so a read asks exactly what its own screen would. */
export interface LastWriteAreas {
  entries: EntriesArea;
  milestones: MilestonesArea;
  doses: DosesArea;
  labs: LabsArea;
  voiceBenchmarks: VoiceBenchmarksArea;
  measurements: MeasurementsArea;
  sizeRecords: SizeRecordsArea;
  taper: TaperArea;
  sideEffects: SideEffectsArea;
  personalEffects: PersonalEffectsArea;
  cycleEvents: CycleEventsArea;
  tally: TallyArea;
  wearSessions: WearSessionsArea;
  feltSense: FeltSenseArea;
  hairProgress: HairProgressArea;
  hairRemoval: HairRemovalArea;
  procedures: ProceduresArea;
  tryouts: TryoutsArea;
  documents: DocumentsArea;
}

/** What every entry's read is given: the areas, and the day nothing may be
    dated after. */
export interface LastWriteReading extends LastWriteAreas {
  todayEpochDay: number;
}

/** One area's declaration of its last write. Erased over its own area
    dependency, the same reason `DaySection` is: the list holds every area at
    once, and a test registers an area this file has never named. */
export interface LastWriteEntry {
  key: string;
  tables: readonly TableName[];
  read(reading: LastWriteReading): Promise<number | null>;
}

/** Keeps the declaration site honest: `key` has to be a real archive
    section, and `read` has to return one day or null - never a list. */
function entry<Key extends ArchiveSectionName>(declared: {
  key: Key;
  tables: readonly TableName[];
  read(reading: LastWriteReading): Promise<number | null>;
}) {
  return declared;
}

const ENTRIES = [
  entry({
    key: 'entries',
    tables: ['entry'],
    read: ({ entries, todayEpochDay }) => entries.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'milestones',
    tables: ['milestone'],
    read: ({ milestones, todayEpochDay }) => milestones.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'doseEvents',
    tables: ['dose'],
    read: ({ doses, todayEpochDay }) => doses.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'labResults',
    tables: ['lab'],
    read: ({ labs, todayEpochDay }) => labs.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'voiceBenchmarks',
    tables: ['voiceBenchmark'],
    read: ({ voiceBenchmarks, todayEpochDay }) => voiceBenchmarks.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'measurements',
    tables: ['measurement'],
    read: ({ measurements, todayEpochDay }) => measurements.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'sizeRecords',
    tables: ['sizeRecord'],
    read: ({ sizeRecords, todayEpochDay }) => sizeRecords.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'taperSessions',
    tables: ['taper'],
    read: ({ taper, todayEpochDay }) => taper.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'sideEffects',
    tables: ['sideEffect'],
    read: ({ sideEffects, todayEpochDay }) => sideEffects.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'personalEffects',
    tables: ['personalEffect'],
    read: ({ personalEffects, todayEpochDay }) => personalEffects.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'cycleEvents',
    tables: ['cycleEvent'],
    read: ({ cycleEvents, todayEpochDay }) => cycleEvents.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'tallyEvents',
    tables: ['tally'],
    read: ({ tally, todayEpochDay }) => tally.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'wearSessions',
    tables: ['wearSession'],
    read: ({ wearSessions, todayEpochDay }) => wearSessions.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'feltSenseEntries',
    tables: ['feltSense'],
    read: ({ feltSense, todayEpochDay }) => feltSense.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'hairStages',
    tables: ['hairProgress'],
    read: ({ hairProgress, todayEpochDay }) => hairProgress.lastStageWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'hairPhotos',
    tables: ['hairProgress'],
    read: ({ hairProgress, todayEpochDay }) => hairProgress.lastPhotoWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'hairRemovalSessions',
    tables: ['hairRemoval'],
    read: ({ hairRemoval, todayEpochDay }) => hairRemoval.lastWriteEpochDay(todayEpochDay)
  }),
  /* Consults and recovery photos only, the same exclusion getDayRecords
     makes (day.ts): a procedure's own surgeryEpochDay reaches the day view
     as the milestone ADR-0045 mints, and asking this registry about it would
     answer a question procedures.ts itself refuses to. */
  entry({
    key: 'procedures',
    tables: ['procedure'],
    read: ({ procedures, todayEpochDay }) => procedures.lastWriteEpochDay(todayEpochDay)
  }),
  /* Photos only, the same exclusion getPhotosOnDay makes: a tryout's own
     start/end days are a span and not a dated write, and its felt-sense
     history is `feltSenseEntries`'s own registered area. */
  entry({
    key: 'tryouts',
    tables: ['tryout'],
    read: ({ tryouts, todayEpochDay }) => tryouts.lastWriteEpochDay(todayEpochDay)
  }),
  /* Documents (phase 8 features ticket 52). Dated by the day the paper is
     from rather than the day it was filed, so this answers "the newest
     paper on file" and not "when was one last added" - which is what the
     return surface wants of it, the same as every other entry here. The
     hub row above it states what is behind it rather than reporting this
     reading (hubRows.ts says why). */
  entry({
    key: 'documents',
    tables: ['document'],
    read: ({ documents, todayEpochDay }) => documents.lastWriteEpochDay(todayEpochDay)
  })
] as const;

/** Every area this registry answers for. */
export type LastWriteKey = (typeof ENTRIES)[number]['key'];

/** Every area that deliberately has **no** last write, and why - the full
    `Record` over whatever `ENTRIES` above does not name, the shape
    `DAY_OPT_OUTS` uses (day.ts). An archive section added anywhere else is a
    compile error here until somebody either registers an entry for it or
    writes down why it has none.

    Restating day.ts's own reasoning for this registry's own question rather
    than reusing its list: an area with no dated record to show on a day has
    no dated write to report the last of, either. */
export const LAST_WRITE_OPT_OUTS: Record<Exclude<ArchiveSectionName, LastWriteKey>, string> = {
  dimensions: 'reference data, not a written stream',
  presets: 'reference data, not a written stream',
  tagGroups: 'reference data, not a written stream',
  affirmations: 'reference data, not a written stream',
  bodyRegions: 'reference data, not a written stream',
  presentations: 'reference data, not a written stream',
  entryTemplates: 'reference data, not a written stream',
  measurementTypes: 'reference data, not a written stream',
  effectCategories: 'reference data, not a written stream',
  personalEffectTypes: 'reference data, not a written stream',

  regimenEpisodes: 'a span: what was being taken across a stretch of days, not a single write to date',
  doseSchedules: 'a schedule: what is meant to happen, never something written on a day',
  taper: 'a schedule: what is meant to happen, never something written on a day (ticket 12)',
  dosePauses: 'a span: a break declared across days',
  journalingPauses: 'a span: a break declared across days',
  eras: 'a span the person named, not a record of one day',
  reminders: 'a schedule: an intention for a future day, not a record of one already written',
  medicationStock: 'a running count, dated by when it was last reported rather than by a day someone lived',

  eraMutes: 'no date of its own: a uuid naming a muted era',
  roadmapChecks: 'no date of its own',
  roadmapGoals: 'no date of its own',
  checklists: 'no date of its own',

  // ADR-0037/0040: a Safe Space artefact, not a diary record with a day to
  // report a gap about.
  counterevidenceSnapshots: 'a Safe Space artefact, not a diary record',
  comfortItems: 'a Safe Space artefact with no date of its own',
  // A letter is met on its unlock day (letterStatus.ts); asking when it was
  // last written is a second way to meet it before the seal does.
  letters: 'sealed until its unlock day',
  // Phase 8 features ticket 10: sealed until the day after it was taken;
  // asking when one was last taken is a second way to meet its figures
  // before the seal does, the same risk letters' own opt-out above guards
  // against - independent of whether the area is finishable (areaState.ts
  // answers that separately).
  voicePracticeTakes: 'sealed until the day after it was taken',
  // This device's own bookkeeping about where an import came from, dated by
  // when the import ran rather than by anything the person wrote.
  importLog: 'device bookkeeping, dated by when the import ran, not a diary record',
  // The record of which areas are hidden or finished; asking it for its own
  // last write answers nothing a consumer of this registry could use.
  areaStates: 'the record of which areas are finished, not itself a stream to ask about',
  savedQuestions: 'a tool the person built for themselves, not a record of something that happened',
  // A revisit is met on its target day (ADR-0045: the arrival offers and
  // never mints); asking when one was last set is a second way to meet it
  // before that day does, the same risk letters' own opt-out above guards
  // against.
  revisits: 'sealed until the day chosen to see the entry again',
  // Mirrors day.ts's own opt-out (phase 8 features ticket 07): a margin
  // note is not a stream any of this registry's four consumers reports a
  // gap about - it is drawn wherever the entry it annotates is, and asking
  // "when was one last written" answers nothing the return surface or the
  // hub would use it for.
  marginNotes: 'drawn beside the entry it annotates, not a stream of its own to report a gap about',
  wordIgnore: 'reference data, not a written stream'
};

export const LAST_WRITE_ENTRIES: readonly LastWriteEntry[] = ENTRIES;

/** Every table any entry reads, de-duplicated - the same single-sourcing
    reasoning `DAY_TABLES` gives, for whichever live wrapper reaches for it
    next (this ticket ships none). */
export const LAST_WRITE_TABLES: TableName[] = [...new Set(ENTRIES.flatMap((e) => e.tables))];

/** Every registered area's last write, assembled concurrently - the areas
    are independent, so nothing here waits on another entry's read. One call
    answers for every area at once, which is the whole point: the hub needs
    all of them together, and eighteen separate live queries on one screen is
    what the budget refuses. */
async function assembleLastWrites(
  reading: LastWriteReading,
  entries: readonly LastWriteEntry[] = LAST_WRITE_ENTRIES
): Promise<Record<LastWriteKey, number | null>> {
  const days = await Promise.all(entries.map((e) => e.read(reading)));
  const result: Record<string, number | null> = {};
  entries.forEach((e, index) => {
    result[e.key] = days[index];
  });
  /* The cast is the price of `LastWriteEntry` being erased over its own area
     dependency, the same price assembleDay pays (day.ts) and for the same
     reason: it is what lets one list hold every area and lets a test
     register an area this file has never heard of. */
  return result as Record<LastWriteKey, number | null>;
}

export interface LastWriteArea {
  /** The day of the most recent write in every registered area, at or
      before `todayEpochDay`. Reads only - nothing here writes. */
  getLastWrites(todayEpochDay: number): Promise<Record<LastWriteKey, number | null>>;
}

/** The entry list is a parameter, defaulting to the registry, so a test can
    register an entry of its own and read through the same path a consumer
    would. */
export function makeLastWriteArea(
  areas: LastWriteAreas,
  entries: readonly LastWriteEntry[] = LAST_WRITE_ENTRIES
): LastWriteArea {
  return {
    getLastWrites: (todayEpochDay) => assembleLastWrites({ ...areas, todayEpochDay }, entries)
  };
}

/* Find each dated area's last write through a bounded MAX in its own
   read path (ADR-0027, ADR-0010). Each area chooses the relevant date
   column. Its declaration also exposes the tables it reads.

   Key the registry by ArchiveSectionName, the same keys used by
   area_state. Cover the dated areas or give a reason in
   LAST_WRITE_OPT_OUTS. Bound each read by todayEpochDay so a
   future-dated record cannot drive recency. Home, the More hub,
   AreaFinish and the return surface share the result. */

import { epochDayFromTimestamp, startOfDayTimestamp } from '../epochDay';
import type { SqliteDriver } from '../sqlite/driver';
import type { TableName } from '../live/writes';
import type { ArchiveSectionName } from './archiveSections';
import type { AppointmentsArea } from './appointments';
import type { CycleEventsArea } from './cycleEvents';
import type { DocumentsArea } from './documents';
import type { DosesArea } from './doses';
import type { EntriesArea } from './entries';
import type { FeltSenseArea } from './feltSense';
import type { HairRemovalArea } from './hairRemoval';
import type { ProgressPhotosArea } from './progressPhotos';
import type { LabsArea } from './labs';
import type { MilestonesArea } from './milestones';
import type { PersonalEffectsArea } from './personalEffects';
import type { ProceduresArea } from './procedures';
import type { SideEffectsArea } from './sideEffects';
import type { TaperArea } from './taper';
import type { TryoutsArea } from './tryouts';
import type { VoiceBenchmarksArea } from './voiceBenchmarks';
import type { WearSessionsArea } from './wearSessions';

/** The areas a last-write read may reach through: the ones `openJournal`
    already built, so a read asks exactly what its own screen would. */
interface LastWriteAreas {
  entries: EntriesArea;
  milestones: MilestonesArea;
  doses: DosesArea;
  labs: LabsArea;
  voiceBenchmarks: VoiceBenchmarksArea;
  taper: TaperArea;
  sideEffects: SideEffectsArea;
  personalEffects: PersonalEffectsArea;
  cycleEvents: CycleEventsArea;
  wearSessions: WearSessionsArea;
  feltSense: FeltSenseArea;
  hairRemoval: HairRemovalArea;
  progressPhotos: ProgressPhotosArea;
  appointments: AppointmentsArea;
  procedures: ProceduresArea;
  tryouts: TryoutsArea;
  documents: DocumentsArea;
}

/** What every entry's read is given: the areas, and the day nothing may be
    dated after. */
interface LastWriteReading extends LastWriteAreas {
  todayEpochDay: number;
}

/** One area's declaration of its last write. Erased over its own area
    dependency, the same reason `DaySection` is: the list holds every area at
    once, and a test registers an area this file has never named. */
/* LastWriteEntry stays exported only for its own test (AU-09 test-only
   review). */
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
    key: 'progressPhotos',
    tables: ['progressPhoto'],
    read: ({ progressPhotos, todayEpochDay }) => progressPhotos.lastWriteEpochDay(todayEpochDay)
  }),
  entry({
    key: 'hairRemovalSessions',
    tables: ['hairRemoval'],
    read: ({ hairRemoval, todayEpochDay }) => hairRemoval.lastWriteEpochDay(todayEpochDay)
  }),
  /* An appointment still ahead is not a write, which `lastWriteEpochDay`
     enforces with the same `<= today` every entry here does - and it is
     also why this area joins `comingBack.ts`'s planned areas, so booking
     the next visit cannot close the person's own return gap (ADR-0066). */
  entry({
    key: 'appointments',
    tables: ['appointment'],
    read: ({ appointments, todayEpochDay }) => appointments.lastWriteEpochDay(todayEpochDay)
  }),
  /* Its consults and its recovery photos, which is what the surgery hub row
     reports: a journey whose only activity was booking the next visit has
     not gone quiet. Reads the appointments a second time, after the entry
     above, on purpose - the two answer different questions, and both are
     planned areas so neither reaches the return gap. The exclusion this
     shares with getDayRecords (day.ts) is the other one: a procedure's own
     surgeryEpochDay reaches the day view as the milestone ADR-0045 mints,
     and asking this registry about it would answer a question procedures.ts
     itself refuses to. */
  entry({
    key: 'procedures',
    tables: ['procedure', 'appointment'],
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
  /* Documents. Dated by the day the paper is
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
/* LAST_WRITE_OPT_OUTS stays exported only for its own test (AU-09 test-only
   review). */
export const LAST_WRITE_OPT_OUTS: Record<Exclude<ArchiveSectionName, LastWriteKey>, string> = {
  dimensions: 'reference data, not a written stream',
  presets: 'reference data, not a written stream',
  tagGroups: 'reference data, not a written stream',
  bodyRegions: 'reference data, not a written stream',
  progressPoses: 'reference data, not a written stream',
  presentations: 'reference data, not a written stream',
  effectCategories: 'reference data, not a written stream',
  personalEffectTypes: 'reference data, not a written stream',

  regimenEpisodes: 'a span: what was being taken across a stretch of days, not a single write to date',
  doseSchedules: 'a schedule: what is meant to happen, never something written on a day',
  taper: 'a schedule: what is meant to happen, never something written on a day (ticket 12)',
  dosePauses: 'a span: a break declared across days',
  eras: 'a span the person named, not a record of one day',
  reminders: 'a schedule: an intention for a future day, not a record of one already written',
  medicationStock: 'a running count, dated by when it was last reported rather than by a day someone lived',

  eraMutes: 'no date of its own: a uuid naming a muted era',
  roadmapChecks: 'no date of its own',
  roadmapCategories: 'no date of its own',
  roadmapGoals: 'no date of its own',
  roadmapInstitutions: 'no date of its own',
  roadmapInstitutionChanges: 'part of the roadmap, which has no hub date',
  checklists: 'no date of its own',
  providers: 'no date of its own: notes on somebody the person sees (functional-audit ticket 27)',

  // ADR-0037/0040: a Safe Space artefact, not a diary record with a day to
  // report a gap about.
  comfortItems: 'a Safe Space artefact with no date of its own',
  // A letter is met on its unlock day (letterStatus.ts); asking when it was
  // last written is a second way to meet it before the seal does.
  letters: 'sealed until its unlock day',
  // Sealed until the day after it was taken;
  // asking when one was last taken is a second way to meet its figures
  // before the seal does, the same risk letters' own opt-out above guards
  // against - independent of whether the area is finishable (areaState.ts
  // answers that separately).
  voicePracticeTakes: 'sealed until the day after it was taken',
  // This device's own bookkeeping about where an import came from, dated by
  // when the import ran rather than by anything the person wrote.
  importLog: 'device bookkeeping, dated by when the import ran, not a diary record',
  deletions: 'which records were deleted, for an archive Merge to carry; not a diary record',
  // The record of which areas are hidden or finished; asking it for its own
  // last write answers nothing a consumer of this registry could use.
  areaStates: 'the record of which areas are finished, not itself a stream to ask about',
  // Mirrors day.ts's own opt-out: a margin
  // note is not a stream any of this registry's four consumers reports a
  // gap about - it is drawn wherever the entry it annotates is, and asking
  // "when was one last written" answers nothing the return surface or the
  // hub would use it for.
  marginNotes: 'drawn beside the entry it annotates, not a stream of its own to report a gap about'
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
  /** Distinct entry and dose days in the last year, bounded by today. */
  getWritingDays(todayEpochDay: number): Promise<number[]>;
  /** The day of the most recent write in every registered area, at or
      before `todayEpochDay`. Reads only - nothing here writes. */
  getLastWrites(todayEpochDay: number): Promise<Record<LastWriteKey, number | null>>;
  /** Read only the requested areas; omitted areas have no entry in the answer. */
  getLastWrites(todayEpochDay: number, keys: readonly LastWriteKey[]): Promise<Partial<Record<LastWriteKey, number | null>>>;
}

/** The entry list is a parameter, defaulting to the registry, so a test can
    register an entry of its own and read through the same path a consumer
    would. */
export function makeLastWriteArea(
  areas: LastWriteAreas,
  driver: SqliteDriver,
  entries: readonly LastWriteEntry[] = LAST_WRITE_ENTRIES
): LastWriteArea {
  return {
    async getWritingDays(todayEpochDay) {
      const rows = await driver.query<{ epoch_day: number | null; timestamp: number | null }>(
        `SELECT DISTINCT epoch_day, NULL AS timestamp FROM entry WHERE epoch_day > ? AND epoch_day <= ?
         UNION ALL
         SELECT NULL AS epoch_day, timestamp FROM dose_event WHERE timestamp >= ? AND timestamp < ?`,
        [todayEpochDay - 365, todayEpochDay, startOfDayTimestamp(todayEpochDay - 364), startOfDayTimestamp(todayEpochDay + 1)]
      );
      // Dose timestamps use the device's local day, as every dose screen does.
      return [...new Set(rows.map(row => row.epoch_day ?? epochDayFromTimestamp(row.timestamp!)))].sort((a, b) => a - b);
    },
    getLastWrites: (todayEpochDay, keys?: readonly LastWriteKey[]) =>
      assembleLastWrites(
        { ...areas, todayEpochDay },
        keys === undefined ? entries : entries.filter((entry) => keys.includes(entry.key as LastWriteKey))
      )
  };
}

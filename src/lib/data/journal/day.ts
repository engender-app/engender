/* Read every registered area for a single epoch day (ADR-0001). Each registry entry names
   its DayRecords key, the Archive sections it covers, the SQL tables it reads and the
   area's own read method. The declaration order also sets screen order.

   The coverage assertion catches dated areas absent from the registry or DAY_OPT_OUTS. SQL
   dependencies come from the same declarations. A day reads individual records, including
   photos and felt sense, while the clinician summary has its own disclosure rules. getDay
   writes nothing. vocabulary/dayLabels.ts supplies headings. */

import type { TableName } from '../live/writes';
import type {
  CycleEvent,
  DoseEvent,
  Entry,
  HairRemovalSession,
  JournalDocument,
  LabResult,
  Milestone,
  PersonalEffect,
  SideEffect,
  VoiceBenchmark,
  WearSession
} from '../types';
import type { ArchiveSectionName } from './archiveSections';
import type { AppointmentsArea, AppointmentDayRecord } from './appointments';
import type { CycleEventsArea } from './cycleEvents';
import type { DocumentsArea } from './documents';
import type { DosesArea } from './doses';
import type { EntriesArea } from './entries';
import type { FeltSenseArea, FeltSenseOnDay } from './feltSense';
import type { HairRemovalArea } from './hairRemoval';
import type { LabsArea } from './labs';
import type { MilestonesArea } from './milestones';
import type { PersonalEffectsArea } from './personalEffects';
import type { ProceduresArea, ProcedureDayRecord } from './procedures';
import type { SideEffectsArea } from './sideEffects';
import type { DayTaperSession, TaperArea } from './taper';
import type { TryoutsArea, TryoutPhotoOnDay } from './tryouts';
import type { VoiceBenchmarksArea } from './voiceBenchmarks';
import type { WearSessionsArea } from './wearSessions';

/** Everything one day holds, one key per registered section.

    Entries first because the entry is the day's centre and everything else
    is context around it; the rest are declared in the order the screen
    reads them out. */
export interface DayRecords {
  entries: Entry[];
  milestones: Milestone[];
  doses: DoseEvent[];
  labResults: LabResult[];
  voiceBenchmarks: VoiceBenchmark[];
  taperSessions: DayTaperSession[];
  sideEffects: SideEffect[];
  personalEffects: PersonalEffect[];
  cycleEvents: CycleEvent[];
  wearSessions: WearSession[];
  feltSense: FeltSenseOnDay[];
  hairRemovalSessions: HairRemovalSession[];
  appointments: AppointmentDayRecord[];
  procedureRecords: ProcedureDayRecord[];
  tryoutPhotos: TryoutPhotoOnDay[];
  documents: JournalDocument[];
}

export type DaySectionKey = keyof DayRecords;

/** The areas a section may read through: the ones `openJournal` already
    built, so a section reads exactly what its own screen does. One type
    rather than seventeen parameters, because every section is handed all of
    them and the section that registers next will want an eighteenth. */
interface DayAreas {
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
  appointments: AppointmentsArea;
  procedures: ProceduresArea;
  tryouts: TryoutsArea;
  documents: DocumentsArea;
}

/** What every section's read is given: the areas, and the day to read. */
interface DayReading extends DayAreas {
  epochDay: number;
}

/** One area's declaration that its records show on a day. Erased over what
    it reads, because the list holds every section at once and because a
    test registers sections `DayRecords` has never heard of. */
/* DaySection stays exported only for its own test (AU-09 test-only review). */
export interface DaySection {
  key: string;
  covers: readonly string[];
  tables: readonly TableName[];
  read(reading: DayReading): Promise<unknown[]>;
}

/** Keeps two things honest at the declaration site: the read has to return
    what `DayRecords` says the section holds, and `covers` has to keep its
    literal names.

    `Covers` is a `const` parameter for that second reason. Declared as a
    plain `readonly ArchiveSectionName[]` it widens to every section name,
    which makes `Covered` below the whole union, `Exclude` empty, and the
    opt-out record accept anything at all - a compile-time check that
    silently checks nothing. */
function section<Key extends DaySectionKey, const Covers extends readonly ArchiveSectionName[]>(declared: {
  key: Key;
  covers: Covers;
  tables: readonly TableName[];
  read(reading: DayReading): Promise<DayRecords[Key]>;
}) {
  return declared;
}

const SECTIONS = [
  section({
    key: 'entries',
    covers: ['entries'],
    // What a hydrated entry actually reads, which writes.ts already states
    // once for every entry read there is.
    tables: ['entry', 'dimension', 'tag', 'photo', 'voiceRecording', 'videoNote'],
    read: ({ entries, epochDay }) => entries.entriesForDay(epochDay)
  }),
  section({
    key: 'milestones',
    covers: ['milestones'],
    tables: ['milestone', 'photo', 'procedure', 'tryout', 'roadmapGoal'],
    read: ({ milestones, epochDay }) => milestones.getMilestonesOnDay(epochDay)
  }),
  section({
    key: 'doses',
    covers: ['doseEvents'],
    tables: ['dose'],
    read: ({ doses, epochDay }) => doses.getDoses(epochDay, epochDay)
  }),
  section({
    key: 'labResults',
    covers: ['labResults'],
    tables: ['lab'],
    read: ({ labs, epochDay }) => labs.getResultsOnDay(epochDay)
  }),
  /* A standardized take, recorded on a day the way a lab draw is. Next to the lab results because it is the same
     kind of record: a number measured under controlled conditions, reported
     and not read. */
  section({
    key: 'voiceBenchmarks',
    covers: ['voiceBenchmarks'],
    tables: ['voiceBenchmark'],
    read: ({ voiceBenchmarks, epochDay }) => voiceBenchmarks.getBenchmarksOnDay(epochDay)
  }),
  section({
    key: 'taperSessions',
    covers: ['taperSessions'],
    tables: ['taper', 'procedure'],
    // Numbered against the schedule's count for the day, so a times-a-day
    // stage reads "session 2 of 3" here.
    read: ({ taper, epochDay }) => taper.getDaySessions(epochDay)
  }),
  section({
    key: 'sideEffects',
    covers: ['sideEffects'],
    tables: ['sideEffect'],
    read: ({ sideEffects, epochDay }) => sideEffects.getSideEffectsInRange(epochDay, epochDay)
  }),
  section({
    key: 'personalEffects',
    covers: ['personalEffects'],
    tables: ['personalEffect'],
    read: ({ personalEffects, epochDay }) => personalEffects.getMarkersFirstNoticedOn(epochDay)
  }),
  section({
    key: 'cycleEvents',
    covers: ['cycleEvents'],
    tables: ['cycleEvent'],
    read: ({ cycleEvents, epochDay }) => cycleEvents.getCycleEventsInRange(epochDay, epochDay)
  }),
  section({
    key: 'wearSessions',
    covers: ['wearSessions'],
    tables: ['wearSession'],
    read: ({ wearSessions, epochDay }) => wearSessions.getSessions(epochDay, epochDay)
  }),
  section({
    key: 'feltSense',
    covers: ['feltSenseEntries'],
    // Its tryout's table as well as its own: a row says which tryout it
    // belongs to, so renaming one changes what it reads.
    tables: ['feltSense', 'tryout'],
    read: ({ feltSense, epochDay }) => feltSense.onDay(epochDay)
  }),
  section({
    key: 'hairRemovalSessions',
    covers: ['hairRemovalSessions'],
    tables: ['hairRemoval'],
    read: ({ hairRemoval, epochDay }) => hairRemoval.getSessionsOnDay(epochDay)
  }),
  /* An appointment happened on a day, which is the whole of what it is.
     Both cases come through here, the one that belongs to a
     surgery journey included: `getDayRecords` names the procedure on the
     row where there is one, so a consult reaches a day once rather than
     twice, and `procedureRecords` below is the recovery photos alone. */
  section({
    key: 'appointments',
    covers: ['appointments'],
    tables: ['appointment', 'procedure'],
    read: ({ appointments, epochDay }) => appointments.getDayRecords(epochDay)
  }),
  /* The last two cover an area whose own record is a span - a procedure runs
     for months, a tryout for weeks - so what each one registers is the dated
     records that area holds rather than the journey itself. That is the
     "a span or a schedule" rule below applied at the level of a row instead
     of an area: a recovery photo happened on a day, the operation it belongs
     to did not. */
  section({
    key: 'procedureRecords',
    covers: ['procedures'],
    tables: ['procedure'],
    read: ({ procedures, epochDay }) => procedures.getDayRecords(epochDay)
  }),
  section({
    key: 'tryoutPhotos',
    covers: ['tryouts'],
    tables: ['tryout'],
    read: ({ tryouts, epochDay }) => tryouts.getPhotosOnDay(epochDay)
  }),
  /* A document is dated by the day the paper is from rather than the day it
     was scanned in (ADR-0065), which is what puts an opinion from 1994 in
     1994 - and is the reason this section exists at all. The row says the
     title and goes to the document's own screen; the page image stays
     behind that tap (dayRows.ts). */
  section({
    key: 'documents',
    covers: ['documents'],
    tables: ['document'],
    read: ({ documents, epochDay }) => documents.getDocumentsOnDay(epochDay)
  })
] as const;

/* A part of `DayRecords` with no entry above would be missing from every
   day the screen shows, silently. This line makes that a compile error
   instead. */
type Unregistered = Exclude<DaySectionKey, (typeof SECTIONS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
type EverySectionRegistered = AssertNoneUnregistered<Unregistered>;

/** Which archive sections the registry above accounts for. */
type Covered = (typeof SECTIONS)[number]['covers'][number];

/**
 * Require every Archive section to have a day read or an explicit
 * DAY_OPT_OUTS entry (ADR-0027). Reference data has no day. A span
 * or schedule describes a period. An updated_at on a checklist or
 * roadmap tick is bookkeeping, rather than a day record.
 *
 * Photos, voice recordings and video notes travel inside their
 * owner's Archive section and appear on that owner's day.
 */
/* DAY_OPT_OUTS stays exported only for its own test (AU-09 test-only review). */
export const DAY_OPT_OUTS: Record<Exclude<ArchiveSectionName, Covered>, string> = {
  dimensions: 'reference data',
  presets: 'reference data',
  tagGroups: 'reference data',
  bodyRegions: 'reference data',
  progressPoses: 'reference data',
  presentations: 'reference data',
  effectCategories: 'reference data',
  personalEffectTypes: 'reference data',

  regimenEpisodes: 'a span: what was being taken across a stretch of days',
  doseSchedules: 'a schedule: what was meant to happen, not what did',
  taper: 'a schedule: what was meant to happen, not what did (ticket 12)',
  dosePauses: 'a span: a break declared across days',
  eras: 'a span: a stretch of days the person named, and not a record of one',
  eraMutes: 'no date of its own: a uuid naming a muted era',
  providers: 'no date of its own: notes on somebody the person sees, named on the appointment rows that are (ticket 27)',
  reminders: 'a schedule: an intention for a future day',
  medicationStock: 'a running count, dated by when it was last reported',

  roadmapChecks: 'no date of its own',
  roadmapCategories: 'no date of its own',
  roadmapGoals: 'no date of its own',
  roadmapInstitutions: 'no date of its own',
  // Dated, but read on the roadmap, where one institution's changes sit
  // together in order.
  roadmapInstitutionChanges: 'read on the roadmap with the rest of its institution',
  checklists: 'no date of its own',

  // Safe Space reads its own snapshots (ADR-0037) outside the ordinary diary.
  // The comfort list belongs to that screen too and has no date.
  comfortItems: 'a Safe Space artefact with no date of its own',
  // A letter is written to be met on its unlock day (letterStatus.ts). A day
  // view listing the day it was written is a second place to meet it, out of
  // the order the seal exists to keep.
  letters: 'sealed until its unlock day',
  // Sealed until the day after it was taken
  // (voicePracticeTakes.ts), so a day-view row would be a second place to
  // meet its figures before the seal does - the same risk letters' own
  // opt-out above guards against, independent of whether the area is
  // finishable (areaState.ts joins it to voiceBenchmarks on that separate
  // question, and says why there).
  voicePracticeTakes: 'sealed until the day after it was taken',

  // This device's own bookkeeping about where an import
  // came from, dated by when the import ran rather than by anything the
  // person did that day - the settings screen it reads into is where it
  // belongs, the same reasoning `medicationStock` gives.
  importLog: 'device bookkeeping, dated by when the import ran, not a diary record',
  deletions: 'which records were deleted, for an archive Merge to carry; not a diary record',

  // `finished_epoch_day` is a day, but it is
  // the day a person stopped adding to a stream rather than something they
  // did that day - a statement about their practice of tracking. Where the
  // date belongs on a dated surface is a chart annotation beside the regimen
  // changes and pauses (chartAnnotations.ts), not a record in a day's list.
  areaStates: 'a statement about the practice of tracking, not a record of a day',
  // A margin note is drawn beside the entry it
  // annotates, on this screen among others (DayRecords.svelte's own batched
  // read, not a hydrated field of Entry - entries.ts stays untouched by this
  // ticket). Keyed by the day it was written on, a margin note would need a
  // second section here just to point back at its entry; keyed by the day
  // it belongs to, it already is one - the entry's own row.
  marginNotes: 'drawn beside the entry it annotates, not as a section of its own',

  // Bug 25: read pose by pose on its own timeline
  // and in the photo library, which is where a progress photo is looked at.
  progressPhotos: 'its own pose timeline and the photo library are where it is read'
};

/* DAY_SECTIONS stays exported only for its own test (AU-09 test-only review). */
export const DAY_SECTIONS: readonly DaySection[] = SECTIONS;

/** Every section's key, in the order they read - what the screen walks to
    lay a day out, so it never names a section itself. */
export const DAY_SECTION_KEYS: readonly DaySectionKey[] = SECTIONS.map((s) => s.key);

/** Every table any section reads, de-duplicated: what `journal.day.getDay`
    depends on, single-sourced here because this is the module that knows.
    writes.ts imports it rather than hand-maintaining a copy, so a section
    added above cannot silently miss its invalidation - the same reasoning
    reconcile.ts's RECONCILE_TABLES gives. */
export const DAY_TABLES: TableName[] = [...new Set(SECTIONS.flatMap((s) => s.tables))];

/** Every registered section read for one day. Concurrent because the
    sections are independent - none of them reads what another produced. */
async function assembleDay(
  reading: DayReading,
  sections: readonly DaySection[] = DAY_SECTIONS
): Promise<DayRecords> {
  const contents = await Promise.all(sections.map((s) => s.read(reading)));
  const day: Record<string, unknown> = {};
  sections.forEach((s, index) => {
    day[s.key] = contents[index];
  });
  /* The double cast is the price of `DaySection` being erased over its row
     type, which is what lets one list hold every section and lets a test
     register a section `DayRecords` has never heard of. The declaration site
     is where the types are checked (`section` below); this is assembly.
     clinicianSummary.ts pays the same price for the same reason. */
  return day as unknown as DayRecords;
}

export interface DayArea {
  /** Everything recorded on one epoch day, section by section. Reads only
       - opening a day writes nothing. */
  getDay(epochDay: number): Promise<DayRecords>;
}

/** The section list is a parameter, defaulting to the registry, so a test
    can register a section of its own and read a day back through the same
    path the screen reads it through. */
export function makeDayArea(areas: DayAreas, sections: readonly DaySection[] = DAY_SECTIONS): DayArea {
  return {
    getDay: (epochDay) => assembleDay({ ...areas, epochDay }, sections)
  };
}

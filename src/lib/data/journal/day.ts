/* What one day holds, across every area that records something dated
   (phase 5 deepening ticket 21, ADR-0001, CONTEXT: "Day").

   Ticket 04 unified where a day is captured: one editor commits the note,
   the mood, the scales, the body map, the photos, the dose, the felt sense,
   the recovery note, the physical change and the cycle event in a single
   transaction (ADR-0044). Nothing unified where a day is read back, so
   `/day/[day]` showed the entries and everything else was findable only by
   opening the screen that owns it and scrolling to the right date.

   This is the read side of that, and it is a registry for the reason the
   two registries before it are (ADR-0027, ADR-0031): the alternative is a
   hand-written list of imports that a new dated area is silently missing
   from, with no test able to notice.

   A third registry rather than an extension of either, and the ticket asks
   for that check to be made rather than assumed. Neither fits. The archive
   registry (ADR-0027) is keyed on `ArchiveJournal` and moves whole tables in
   both directions with a restore order over them; a day asks one table for
   one epoch day and never writes. The clinician summary (ADR-0031) is keyed
   on `ClinicianSummary`, reads a *range*, and deliberately carries the parts
   a doctor needs - it excludes entries, photographs, tally events and
   felt-sense, which are four of the things a day is most about, and adding
   them for this would change what a printed summary discloses. So the shape
   is copied and the list is not, and what ties this one to the archive
   registry instead is `covers` below: the archive registry is what makes an
   area exist at all, so it is the right thing to be checked against.

   What one entry declares:

     key     where the section's rows land in `DayRecords`
     covers  which archive sections this one accounts for, which is what
             makes "every dated area is registered" checkable rather than
             remembered - see DAY_OPT_OUTS below
     tables  the tables its read touches, so the live layer's dependency
             list for `getDay` is derived from the registry rather than
             maintained beside it (writes.ts, the same single-sourcing
             RECONCILE_TABLES gets)
     read    how the area's rows for one day come out, through that area's
             own read path

   The order sections are declared in is the order they are read in and the
   order the screen lays them out. Nothing is computed here: each read
   selects its own area's rows for one epoch day and stops, so the day view
   introduces no figure the screen that owns those rows does not already
   show (ADR-0010).

   It is a pure read. Writing a day still happens in the editor and in each
   area's own screen; `getDay` performs no write, and day.test.ts holds that
   against the driver rather than leaving it to be noticed.

   Wording is not here. Section titles live in
   vocabulary/dayLabels.ts, keyed by section, the same split
   clinicianSummary.ts keeps and for the same reason: this file stays
   Node-tier safe by importing no paraglide (ADR-0016). */

import type { TableName } from '../live/writes';
import type {
  CycleEvent,
  DoseEvent,
  Entry,
  HairRemovalSession,
  HairStage,
  LabResult,
  Measurement,
  Milestone,
  PersonalEffect,
  SideEffect,
  SizeRecord,
  TallyEvent,
  TaperSession,
  VoiceBenchmark,
  WearSession
} from '../types';
import type { ArchiveSectionName } from './archiveSections';
import type { CycleEventsArea } from './cycleEvents';
import type { DosesArea } from './doses';
import type { EntriesArea } from './entries';
import type { FeltSenseArea, FeltSenseOnDay } from './feltSense';
import type { HairProgressArea, HairPhoto } from './hairProgress';
import type { HairRemovalArea } from './hairRemoval';
import type { LabsArea } from './labs';
import type { MeasurementsArea } from './measurements';
import type { MilestonesArea } from './milestones';
import type { PersonalEffectsArea } from './personalEffects';
import type { ProceduresArea, ProcedureDayRecord } from './procedures';
import type { SideEffectsArea } from './sideEffects';
import type { SizeRecordsArea } from './sizeRecords';
import type { TaperArea } from './taper';
import type { TallyArea } from './tally';
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
  measurements: Measurement[];
  sizeRecords: SizeRecord[];
  taperSessions: TaperSession[];
  sideEffects: SideEffect[];
  personalEffects: PersonalEffect[];
  cycleEvents: CycleEvent[];
  tallyEvents: TallyEvent[];
  wearSessions: WearSession[];
  feltSense: FeltSenseOnDay[];
  hairStages: HairStage[];
  hairPhotos: HairPhoto[];
  hairRemovalSessions: HairRemovalSession[];
  procedureRecords: ProcedureDayRecord[];
  tryoutPhotos: TryoutPhotoOnDay[];
}

export type DaySectionKey = keyof DayRecords;

/** The areas a section may read through: the ones `openJournal` already
    built, so a section reads exactly what its own screen does. One type
    rather than seventeen parameters, because every section is handed all of
    them and the section that registers next will want an eighteenth. */
export interface DayAreas {
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
}

/** What every section's read is given: the areas, and the day to read. */
export interface DayReading extends DayAreas {
  epochDay: number;
}

/** One area's declaration that its records show on a day. Erased over what
    it reads, because the list holds every section at once and because a
    test registers sections `DayRecords` has never heard of. */
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
    tables: ['milestone', 'photo'],
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
  /* A standardized take, recorded on a day the way a lab draw is (phase 5
     deepening ticket 15). Next to the lab results because it is the same
     kind of record: a number measured under controlled conditions, reported
     and not read. */
  section({
    key: 'voiceBenchmarks',
    covers: ['voiceBenchmarks'],
    tables: ['voiceBenchmark'],
    read: ({ voiceBenchmarks, epochDay }) => voiceBenchmarks.getBenchmarksOnDay(epochDay)
  }),
  section({
    key: 'measurements',
    covers: ['measurements'],
    tables: ['measurement'],
    read: ({ measurements, epochDay }) => measurements.getMeasurementsInRange(epochDay, epochDay)
  }),
  section({
    key: 'sizeRecords',
    covers: ['sizeRecords'],
    tables: ['sizeRecord'],
    read: ({ sizeRecords, epochDay }) => sizeRecords.getRecordsOnDay(epochDay)
  }),
  section({
    key: 'taperSessions',
    covers: ['taperSessions'],
    tables: ['taper'],
    read: ({ taper, epochDay }) => taper.getSessionsOnDay(epochDay)
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
    key: 'tallyEvents',
    covers: ['tallyEvents'],
    tables: ['tally'],
    read: ({ tally, epochDay }) => tally.getEventsOnDay(epochDay)
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
    // Its owners' tables as well as its own: a row says which tryout or
    // milestone it belongs to, so renaming either changes what it reads.
    tables: ['feltSense', 'tryout', 'milestone'],
    read: ({ feltSense, epochDay }) => feltSense.onDay(epochDay)
  }),
  section({
    key: 'hairStages',
    covers: ['hairStages'],
    tables: ['hairProgress'],
    read: ({ hairProgress, epochDay }) => hairProgress.getStagesOnDay(epochDay)
  }),
  section({
    key: 'hairPhotos',
    covers: ['hairPhotos'],
    tables: ['hairProgress'],
    read: ({ hairProgress, epochDay }) => hairProgress.getPhotosOnDay(epochDay)
  }),
  section({
    key: 'hairRemovalSessions',
    covers: ['hairRemovalSessions'],
    tables: ['hairRemoval'],
    read: ({ hairRemoval, epochDay }) => hairRemoval.getSessionsOnDay(epochDay)
  }),
  /* The last two cover an area whose own record is a span - a procedure runs
     for months, a tryout for weeks - so what each one registers is the dated
     records that area holds rather than the journey itself. That is the
     "a span or a schedule" rule below applied at the level of a row instead
     of an area: a consult and a recovery photo happened on a day, the
     operation they belong to did not. */
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
  })
] as const;

/* A part of `DayRecords` with no entry above would be missing from every
   day the screen shows, silently. This line makes that a compile error
   instead. */
type Unregistered = Exclude<DaySectionKey, (typeof SECTIONS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EverySectionRegistered = AssertNoneUnregistered<Unregistered>;

/** Which archive sections the registry above accounts for. */
type Covered = (typeof SECTIONS)[number]['covers'][number];

/** Every dated area that deliberately does **not** show on a day, and why.

    This is the ticket's "registered nowhere" check, and it is a full
    `Record` over whatever the registry above does not cover: an area added
    to the archive registry - which is what makes an area exist at all
    (ADR-0027) - is a compile error here until somebody either registers a
    day section for it or writes down why it has none. Nobody has to
    remember the check; the only way past it is to state an answer.

    Four reasons, and each one is a rule rather than a case:

    *Reference data.* Vocabulary the app records with, not a record of any
    day. A tag group is not something that happened.

    *A span or a schedule.* It describes what was true across a stretch of
    days, not what happened on one - and a day view that listed every
    episode, pause and reminder covering a day would say the same thing on
    every day of a two-year course. The screen's title is what happened in
    this day.

    *No date of its own.* A roadmap tick and a checklist item carry only an
    `updated_at`, which is bookkeeping and not a day someone lived.

    *Its own reason*, for the two that need one. Photos, voice recordings
    and video notes appear on none of these lists because they are not
    archive sections at all: they travel inside the entry or the milestone
    that owns them, which is exactly how they reach the day view too. */
export const DAY_OPT_OUTS: Record<Exclude<ArchiveSectionName, Covered>, string> = {
  dimensions: 'reference data',
  presets: 'reference data',
  tagGroups: 'reference data',
  affirmations: 'reference data',
  bodyRegions: 'reference data',
  presentations: 'reference data',
  entryTemplates: 'reference data',
  measurementTypes: 'reference data',
  effectCategories: 'reference data',
  personalEffectTypes: 'reference data',

  regimenEpisodes: 'a span: what was being taken across a stretch of days',
  doseSchedules: 'a schedule: what was meant to happen, not what did',
  taper: 'a schedule: what was meant to happen, not what did (ticket 12)',
  dosePauses: 'a span: a break declared across days',
  journalingPauses: 'a span: a break declared across days',
  eras: 'a span: a stretch of days the person named, and not a record of one',
  eraMutes: 'no date of its own: a uuid naming a muted era',
  reminders: 'a schedule: an intention for a future day',
  medicationStock: 'a running count, dated by when it was last reported',

  roadmapChecks: 'no date of its own',
  roadmapTracks: 'no date of its own',
  roadmapGoals: 'no date of its own',
  checklists: 'no date of its own',

  // ADR-0037 and ADR-0040: Safe Space is a crisis-mode read someone opens
  // when they need it, and a snapshot is the evidence it showed them. Listing
  // it among a day's records files a bad hour into the ordinary diary, and
  // rereading it is the counterevidence screen's own business.
  counterevidenceSnapshots: 'a Safe Space artefact, not a diary record',
  // Phase 6 ticket 14: the same reason, and it also carries no date at all -
  // a comfort item is a standing line in a list, not something that
  // happened on a day.
  comfortItems: 'a Safe Space artefact with no date of its own',
  // A letter is written to be met on its unlock day (letterStatus.ts). A day
  // view listing the day it was written is a second place to meet it, out of
  // the order the seal exists to keep.
  letters: 'sealed until its unlock day',
  // Phase 8 features ticket 10: sealed until the day after it was taken
  // (voicePracticeTakes.ts), so a day-view row would be a second place to
  // meet its figures before the seal does - the same risk letters' own
  // opt-out above guards against, independent of whether the area is
  // finishable (areaState.ts joins it to voiceBenchmarks on that separate
  // question, and says why there).
  voicePracticeTakes: 'sealed until the day after it was taken',

  // Phase 7 ticket 03: this device's own bookkeeping about where an import
  // came from, dated by when the import ran rather than by anything the
  // person did that day - the settings screen it reads into is where it
  // belongs, the same reasoning `medicationStock` gives.
  importLog: 'device bookkeeping, dated by when the import ran, not a diary record',

  // Phase 8 deepening ticket 13: `finished_epoch_day` is a day, but it is
  // the day a person stopped adding to a stream rather than something they
  // did that day - a statement about their practice of tracking. Where the
  // date belongs on a dated surface is a chart annotation beside the regimen
  // changes and pauses (chartAnnotations.ts), not a record in a day's list.
  areaStates: 'a statement about the practice of tracking, not a record of a day',
  savedQuestions: 'a name for a search, not a record of a day it belongs to',
  revisits: 'a schedule: sealed until the day chosen to see the entry again',
  // Phase 8 features ticket 07: a margin note is drawn beside the entry it
  // annotates, on this screen among others (DayRecords.svelte's own batched
  // read, not a hydrated field of Entry - entries.ts stays untouched by this
  // ticket). Keyed by the day it was written on, a margin note would need a
  // second section here just to point back at its entry; keyed by the day
  // it belongs to, it already is one - the entry's own row.
  marginNotes: 'drawn beside the entry it annotates, not as a section of its own',
  // A word someone has told the words screen to stop counting is not a
  // thing that happened on a day - the same reference-data reason
  // dimensions/tagGroups get above (phase 8 features ticket 48).
  wordIgnore: 'reference data'
};

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
      (phase 5 deepening ticket 21) - opening a day writes nothing. */
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

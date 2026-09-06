/* What is coming up: one read, and five kinds of fact earn a mark (phase 8
   features ticket 61, ADR-0067, CONTEXT: "Coming up").

   `dayAhead(from, to)` is a registry in the shape `day.ts` and `lastWrite.ts`
   already share: a key, the tables it touches, a read, and an opt-out record
   naming every excluded area with a reason. A **range**, not a horizon - the
   calendar asks for a month, Home for today, a day view for one day, and no
   single number is right for all three (`careSpine.ts`'s 120 days stay
   `careSpine`'s own).

   `DAY_AHEAD_OPT_OUTS` below is `day.ts`'s own opt-out record inverted: most
   of what a day view refuses to show because it is a schedule, a span or
   reference data is refused here for the same reason, restated for "a day
   still to come" instead of "something that already happened". Five areas
   flip the other way: `appointments`, `procedures`, `milestones`, `letters`
   and `doseSchedules` say nothing about a day that already happened but do
   say something about one still ahead, so they are covered here and opted
   out nowhere else that asks the forward question.

   What one section declares:

     key     the mark's own kind, which is also the whole of what a mark
             says - never a countdown, a due date or a verdict
     covers  which archive sections this one accounts for, the same
             completeness check DAY_OPT_OUTS uses (day.ts)
     tables  the tables its read touches, single-sourced here the same
             reason DAY_TABLES/LAST_WRITE_TABLES are
     read    every day in range this kind has a fact for, through that
             area's own read path - never a raw SQL string written here,
             for the reason lastWrite.ts's own header gives

   Every read is bounded below by `todayEpochDay`, the same discipline
   lastWrite.ts holds above it: a day already passed is `day.ts`'s question,
   not this one's, so a fact whose day has gone by never earns a mark here
   even when the range asked for includes it. Nothing here reads a clock -
   `todayEpochDay` arrives as an argument, the same as every pure module
   above this seam. */

import { activeEpisodesAt } from '../regimenEpisode';
import { expectedSlots, isDailySchedule, pauseCoversDay } from '../doseSchedule';
import { startOfDayTimestamp } from '../epochDay';
import type { TableName } from '../live/writes';
import type { ArchiveSectionName } from './archiveSections';
import type { AppointmentsArea } from './appointments';
import type { DosesArea } from './doses';
import type { LettersArea } from './letters';
import type { MilestonesArea } from './milestones';
import type { ProceduresArea } from './procedures';
import type { RegimenArea } from './regimen';

/** The five kinds a mark comes in, and nothing else - the ADR's own list.
    A mark carries no other information: never which appointment, never
    which letter, never an amount or a status. */
export type DayAheadMarkKind = 'appointment' | 'surgery' | 'milestone' | 'letterUnlock' | 'doseSlot';

/** A day and a kind, in the words `careSpine.ts`'s own `SpineMark` already
    uses for the rail it owns - no countdown, no due date, no verdict here
    either. More than one may share a day; the grid caps what it draws at
    one and puts the rest behind the day it links to. */
export interface DayAheadMark {
  kind: DayAheadMarkKind;
  epochDay: number;
}

/** The areas a mark's read may reach through: the ones `openJournal`
    already built, so a read asks exactly what its own screen would. */
interface DayAheadAreas {
  appointments: AppointmentsArea;
  procedures: ProceduresArea;
  milestones: MilestonesArea;
  letters: LettersArea;
  regimen: RegimenArea;
  doses: DosesArea;
}

/** What every kind's read is given: the areas, the range asked for, and the
    day nothing may be dated before. */
interface DayAheadReading extends DayAheadAreas {
  fromEpochDay: number;
  toEpochDay: number;
  todayEpochDay: number;
}

/** One kind's declaration of which days in range carry its mark. Erased
    over its own area dependency, the same reason `DaySection` and
    `LastWriteEntry` are: the list holds every kind at once, and a test
    registers a kind this file has never named. */
/* DayAheadSection stays exported only for its own test (AU-09 test-only
   review). */
export interface DayAheadSection {
  key: string;
  covers: readonly string[];
  tables: readonly TableName[];
  read(reading: DayAheadReading): Promise<number[]>;
}

/** Keeps the declaration site honest, the same reason `day.ts`'s `section`
    does: `covers` has to keep its literal names rather than widening to
    every archive section, which is what would make the opt-out record's own
    check below pass by accepting anything. */
function section<Key extends DayAheadMarkKind, const Covers extends readonly ArchiveSectionName[]>(declared: {
  key: Key;
  covers: Covers;
  tables: readonly TableName[];
  read(reading: DayAheadReading): Promise<number[]>;
}) {
  return declared;
}

/** Distinct days, sorted - every read below funnels through this so a
    schedule's several same-day slots or two letters unlocking together
    still report their one day once. */
function distinctSorted(days: readonly number[]): number[] {
  return [...new Set(days)].sort((a, b) => a - b);
}

/** The range asked for, floored at today - null where nothing in it is still
    ahead. Every read below starts here rather than repeating the floor
    itself: a fact dated before today is `day.ts`'s question, never this
    one's, whatever the range asked for reaches back to. */
function stillAhead({
  fromEpochDay,
  toEpochDay,
  todayEpochDay
}: Pick<DayAheadReading, 'fromEpochDay' | 'toEpochDay' | 'todayEpochDay'>): { from: number; to: number } | null {
  const from = Math.max(fromEpochDay, todayEpochDay);
  return from > toEpochDay ? null : { from, to: toEpochDay };
}

const SECTIONS = [
  /* An appointment still ahead (ADR-0066's general case, ticket 57).
     `getAppointments()` reads the whole small table the same way the care
     page reads a journal's whole episode list - nothing here adds a second,
     bounded query for a table that never holds more than a handful of
     rows across a lifetime. */
  section({
    key: 'appointment',
    covers: ['appointments'],
    tables: ['appointment'],
    read: async (reading) => {
      const range = stillAhead(reading);
      if (!range) return [];
      const rows = await reading.appointments.getAppointments();
      return distinctSorted(
        rows.filter((a) => a.epochDay >= range.from && a.epochDay <= range.to).map((a) => a.epochDay)
      );
    }
  }),
  /* A surgery date still ahead. Its own kind rather than folded into
     `milestone` below, per the ADR: a court hearing and a milestone read
     the same way to a person, but the ticket names "a surgery date" and
     "a milestone whose day is still ahead" as two of the five, so the
     milestone section excludes a procedure-linked row (ADR-0045 mints one
     for every surgery date) to keep the two from marking the same fact
     twice. */
  section({
    key: 'surgery',
    covers: ['procedures'],
    tables: ['procedure'],
    read: async (reading) => {
      const range = stillAhead(reading);
      if (!range) return [];
      const rows = await reading.procedures.getProcedures();
      return distinctSorted(
        rows
          .filter((p): p is typeof p & { surgeryEpochDay: number } => p.surgeryEpochDay !== null)
          .filter((p) => p.surgeryEpochDay >= range.from && p.surgeryEpochDay <= range.to)
          .map((p) => p.surgeryEpochDay)
      );
    }
  }),
  /* A milestone whose day is still ahead - every one except a procedure's
     own surgery date, which the section above already answers for. */
  section({
    key: 'milestone',
    covers: ['milestones'],
    tables: ['milestone'],
    read: async (reading) => {
      const range = stillAhead(reading);
      if (!range) return [];
      const rows = await reading.milestones.getMilestones();
      return distinctSorted(
        rows
          .filter((m) => m.procedureId === null)
          .filter((m) => m.epochDay >= range.from && m.epochDay <= range.to)
          .map((m) => m.epochDay)
      );
    }
  }),
  /* A letter's unlock day, and never which letter: `getUnlockDaysInRange`
     (letters.ts) reads only the day, so this section could not name one
     even if it tried. */
  section({
    key: 'letterUnlock',
    covers: ['letters'],
    tables: ['letter'],
    read: async (reading) => {
      const range = stillAhead(reading);
      if (!range) return [];
      return reading.letters.getUnlockDaysInRange(range.from, range.to);
    }
  }),
  /* A dose slot, only where the active schedule is not daily (ADR-0067): a
     daily slot would mark every cell a calendar could draw, which is
     wallpaper rather than information. Every active episode is asked, not
     only the one `careSpine.ts` puts on its rail - two concurrent
     schedules each still earn their own weekly mark, the ambiguity
     `chooseRailEpisode` exists for being a question about one rail's
     drawing, not about which days matter. A pause suppresses a slot the
     same way it does everywhere else a schedule is read against one
     (doseSchedule.ts's own `adherence`). */
  section({
    key: 'doseSlot',
    covers: ['doseSchedules'],
    tables: ['regimen', 'dose'],
    read: async (reading) => {
      const range = stillAhead(reading);
      if (!range) return [];
      const { regimen, doses, todayEpochDay } = reading;
      const [episodes, schedules, pauses] = await Promise.all([
        regimen.getEpisodes(),
        doses.getSchedules(),
        doses.getPauses()
      ]);
      const active = activeEpisodesAt(episodes, startOfDayTimestamp(todayEpochDay));
      const days: number[] = [];
      for (const episode of active) {
        const schedule = schedules.find((s) => s.episodeId === episode.id);
        if (!schedule || isDailySchedule(schedule)) continue;
        const ownPauses = pauses.filter((p) => p.episodeId === episode.id);
        for (const slot of expectedSlots(schedule, episode.startEpochDay, range.from, range.to)) {
          if (ownPauses.some((pause) => pauseCoversDay(pause, slot.epochDay))) continue;
          days.push(slot.epochDay);
        }
      }
      return distinctSorted(days);
    }
  })
] as const;

/* A part of `DayAheadMarkKind` with no entry above would silently mark
   nothing, ever - the same "registry tests must be able to fail" discipline
   day.ts's own `EverySectionRegistered` holds itself to. */
type UnregisteredKind = Exclude<DayAheadMarkKind, (typeof SECTIONS)[number]['key']>;
type AssertNoneUnregisteredKind<Missing extends never> = Missing;
export type EveryKindRegistered = AssertNoneUnregisteredKind<UnregisteredKind>;

/** Which archive sections the five kinds above account for. */
type Covered = (typeof SECTIONS)[number]['covers'][number];

/** Every area that deliberately produces **no** mark, and why - the full
    `Record` over whatever the five kinds above do not cover, `day.ts`'s own
    `DAY_OPT_OUTS` discipline restated for the forward question. An area
    added to the archive registry (ADR-0027) is a compile error here until
    somebody either gives it a section above or writes down why it has
    none.

    Most reasons below are `day.ts`'s own, inverted: a record written on the
    day it happened has no day still ahead to report, the same way an area
    with no day at all has no day already passed to report. Where a reason
    is this registry's own rather than a restatement, a comment says so -
    the six the ADR spends a paragraph on each get one. */
/* DAY_AHEAD_OPT_OUTS stays exported only for its own test (AU-09 test-only
   review). */
export const DAY_AHEAD_OPT_OUTS: Record<Exclude<ArchiveSectionName, Covered>, string> = {
  dimensions: 'reference data, not a day still to come',
  presets: 'reference data, not a day still to come',
  tagGroups: 'reference data, not a day still to come',
  affirmations: 'reference data, not a day still to come',
  bodyRegions: 'reference data, not a day still to come',
  presentations: 'reference data, not a day still to come',
  entryTemplates: 'reference data, not a day still to come',
  measurementTypes: 'reference data, not a day still to come',
  effectCategories: 'reference data, not a day still to come',
  personalEffectTypes: 'reference data, not a day still to come',

  entries: 'written on the day it happened, never ahead of it',
  documents: 'added on the day it was imported, not scheduled ahead of time',
  labResults: 'recorded when drawn, not scheduled ahead of time',
  measurements: 'recorded when taken, not scheduled ahead of time',
  taperSessions:
    "recorded when it happened - the taper's own future sessions are what taper above already excludes",
  sizeRecords: 'recorded when taken, not scheduled ahead of time',
  sideEffects: 'noted when it started, not scheduled ahead of time',
  cycleEvents: 'logged when it happened, not scheduled ahead of time',
  personalEffects: 'noted when first seen, not scheduled ahead of time',
  tallyEvents: 'logged when it happened, not scheduled ahead of time',
  hairStages: 'recorded when assessed, not scheduled ahead of time',
  doseEvents: "logged when it happened, not scheduled ahead of time - a schedule's own future slots are doseSlot above",
  wearSessions: 'recorded when it started (or is still running), not scheduled ahead of time',
  voiceBenchmarks: 'recorded when taken, not scheduled ahead of time',
  feltSenseEntries: 'recorded when it happened, not scheduled ahead of time',

  regimenEpisodes: 'a span: what is being taken across a stretch of days, not a single day still ahead',
  dosePauses: 'a span: a break declared across days',
  journalingPauses: 'a span: a break declared across days',
  eras: 'a span the person named, not a single day still ahead',
  tryouts:
    'a span with no day still ahead of its own - its photos are recorded when taken, the same reasoning voiceBenchmarks gets',

  // ADR-0067: grouped with a daily dose slot for the same reason - an
  // expected session lands on nearly every day, which is not information.
  taper: "a schedule: an expected session lands on nearly every day, which is not information (the same reason a daily dose slot earns none)",
  // ADR-0067: already a notification of its own.
  reminders: 'already a notification; drawing it here too turns the calendar into a to-do list',
  // ADR-0067: a projection off a trailing rate, not a date - already legible
  // on the care spine, where its own nature as a moving projection is clear.
  medicationStock: 'a projection off a trailing rate, not a date - already on the care spine',
  // ADR-0067: hairPhotoSchedule.ts computes a next due day, but refuses due
  // framing on the hair-progress screen itself, and a calendar mark is a due
  // date whatever the copy calls it.
  hairPhotos:
    'the next fixed-position photo is computed, but a calendar mark is a due date whatever the copy says (ADR-0067)',
  // The screen this row belongs to refuses due framing outright
  // (hairRemovalSchedule.ts's own header), so there is no due day to carry
  // forward even before the calendar-mark objection above applies.
  hairRemovalSessions: 'recorded when it happened; hairRemovalSchedule.ts refuses due framing on purpose',

  eraMutes: 'no date of its own: a uuid naming a muted era',
  roadmapChecks: 'no date of its own',
  roadmapTracks: 'no date of its own',
  roadmapGoals: 'no date of its own',
  checklists: 'no date of its own',

  counterevidenceSnapshots: 'a Safe Space artefact, not a day still to come',
  comfortItems: 'a Safe Space artefact with no date of its own',
  // A letter's own mark is what "sealed until its unlock day" earns
  // (letterUnlock above); a practice take stays sealed with no forward
  // mark of its own, the same restraint day.ts and lastWrite.ts both hold.
  voicePracticeTakes: 'a past take, sealed until the day after it happened - not a day still ahead',
  importLog: 'device bookkeeping, dated by when the import ran, not a day still to come',
  areaStates: 'a statement about the practice of tracking, not a day still to come',
  savedQuestions: 'a name for a search, not a day still to come',
  // ADR-0067, the one most likely to be reopened: marking a sealed entry
  // forward turns an arrival into a countdown to the person's own past,
  // which is the opposite of what the resurfacing consent layer exists for.
  revisits: "sealed until the day chosen to see the entry again - marking it forward would turn an arrival into a countdown to the person's own past",
  marginNotes: 'drawn beside the entry it annotates, not a day still to come of its own',
  wordIgnore: 'reference data, not a day still to come'
};

/* DAY_AHEAD_SECTIONS stays exported only for its own test (AU-09 test-only
   review). */
export const DAY_AHEAD_SECTIONS: readonly DayAheadSection[] = SECTIONS;

/** Every table any section reads, de-duplicated - the same single-sourcing
    reasoning `DAY_TABLES`/`LAST_WRITE_TABLES` give, for the live layer's own
    dependency list (writes.ts). */
export const DAY_AHEAD_TABLES: TableName[] = [...new Set(SECTIONS.flatMap((s) => s.tables))];

/** Every kind's marks for the range, assembled concurrently - the kinds are
    independent, the same reason `assembleDay`/`assembleLastWrites` run their
    own sections concurrently. */
async function assembleDayAhead(
  reading: DayAheadReading,
  sections: readonly DayAheadSection[] = DAY_AHEAD_SECTIONS
): Promise<DayAheadMark[]> {
  const results = await Promise.all(sections.map((s) => s.read(reading)));
  const marks: DayAheadMark[] = [];
  sections.forEach((s, index) => {
    // The cast is the price of `DayAheadSection` being erased over its own
    // area dependency, the same price `assembleDay`/`assembleLastWrites` pay
    // for the same reason: it is what lets one list hold every kind and lets
    // a test register a kind this file has never heard of.
    const kind = s.key as DayAheadMarkKind;
    for (const epochDay of results[index]) marks.push({ kind, epochDay });
  });
  marks.sort((a, b) => a.epochDay - b.epochDay);
  return marks;
}

export interface DayAheadArea {
  /** Every mark from `fromEpochDay` to `toEpochDay` inclusive, clamped below
      by `todayEpochDay` so a day already passed never earns one even when
      the range asked for reaches back before today. Reads only. */
  getDayAhead(fromEpochDay: number, toEpochDay: number, todayEpochDay: number): Promise<DayAheadMark[]>;
}

/** The section list is a parameter, defaulting to the registry, so a test
    can register a section of its own and read through the same path a
    screen would. */
export function makeDayAheadArea(
  areas: DayAheadAreas,
  sections: readonly DayAheadSection[] = DAY_AHEAD_SECTIONS
): DayAheadArea {
  return {
    getDayAhead: (fromEpochDay, toEpochDay, todayEpochDay) =>
      assembleDayAhead({ ...areas, fromEpochDay, toEpochDay, todayEpochDay }, sections)
  };
}

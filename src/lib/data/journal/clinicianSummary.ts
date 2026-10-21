/* The clinician visit summary (phase 4 ticket 12, CONTEXT: "Clinician
   summary section", "Regimen episode", "Dose event", "Analyte", "Side
   effect"). A view over rows regimen, doses, labs, exposure, sideEffects,
   cycleEvents, checklists, procedures and areaStates own, not another owner
   for any of them - the whole point of this area is that it introduces no
   figure the tickets it draws from do not already produce (ADR-0010).
   Selecting which rows fall in the requested range is the only work done
   here; nothing is aggregated, interpreted or stored.

   Which parts the summary has is one registry (ADR-0031). Every part the
   printed page carries, from the personal details at its top to the
   appointment prep list, is one entry below, and the screen draws exactly
   these entries in exactly this order. Until functional-audit ticket 38 a
   second, hand-wired dossier layer sat on top of this one with its own keys
   and its own switch names; it is folded in here. One entry declares:

     key    where the part lands in `ClinicianSummary['sections']`, what its
            include switch is keyed by, and what the screen looks its name
            and its rows snippet up by
     read   how the part is read, through its own area's existing read path
     tables the tables that read touches; their union is
            CLINICIAN_SUMMARY_TABLES, the live layer's dependency list for
            `getSummary`, and a test holds the two equal
     order  where it is declared, which is the order it prints in

   Wording is not here. Names live in vocabulary/clinicianSummaryLabels.ts,
   keyed by section, the same split roadmap.ts and builtins.ts keep and for
   the same reason: this file stays Node-tier safe by importing no paraglide
   (ADR-0002, ADR-0016).

   What a section computes stays inside its own read function. Each one
   still calls the area that owns the rows and filters to the range; the
   registry decides which sections exist and in what order they print,
   never what any one of them means. */

import type { TableName } from '../live/writes';
import { finishedGroups, type AreaGroupKey } from '../areaGroups';
import type {
  ChecklistItem,
  CycleEvent,
  DoseEvent,
  LabResult,
  Procedure,
  RegimenEpisode,
  SideEffect
} from '../types';
import { todayEpochDay } from '../epochDay';
import { attributeDrug, sameDrug } from '../regimenEpisode';
import { spanCoversDay, spanOverlapsRange } from '../span';
import type { AreaStatesArea } from './areaStates';
import type { ChecklistsArea } from './checklists';
import type { CycleEventsArea } from './cycleEvents';
import type { DosesArea } from './doses';
import type { ExposureArea, ExposureCounters } from './exposure';
import type { LabsArea } from './labs';
import type { ProceduresArea } from './procedures';
import type { RegimenArea } from './regimen';
import type { SideEffectsArea } from './sideEffects';

/** The person as the summary prints them: only what they typed for this
    summary or already committed. An active pronoun tryout is by definition
    not yet adopted, so it never fills this - a clinical document is not the
    place for an in-progress experiment. */
export interface ClinicianSummaryDemographics {
  name: string;
  pronouns: string | null;
  dob: string | null;
}

/** The regimen part: every episode overlapping the range (its own stored
    end day, types.ts), the ones still running on the range's last day, and
    the dose log for the range. */
interface ClinicianSummaryRegimen {
  current: RegimenEpisode[];
  history: RegimenEpisode[];
  doses: DoseEvent[];
}

/** A procedure as the summary prints it (phase 5 ticket 07): the record
    itself, plus the two things it owns elsewhere - its recovery checklist's
    items (an ordinary owned Checklist) and the days its recovery photos were
    taken. Both are read through their own areas' paths; the photo days are
    the rows' own dates rather than a count or a span, and the printed page
    carries no image, only when one exists. */
export interface ClinicianSummaryProcedure extends Procedure {
  checklistItems: ChecklistItem[];
  photoEpochDays: number[];
}

/** A stream the person has said they are done with, and the day they said it
    ended (phase 8 features ticket 04, ADR-0052). Named by hub row rather than
    by archive section, because that is what the reader recognises and because
    hair progress is two sections finished together. */
interface ClinicianSummaryFinishedArea {
  key: AreaGroupKey;
  epochDay: number;
}

/** What each part holds when it is included. */
interface ClinicianSummaryContents {
  demographics: ClinicianSummaryDemographics;
  regimen: ClinicianSummaryRegimen;
  exposure: ExposureCounters;
  labs: LabResult[];
  sideEffects: SideEffect[];
  cycleEvents: CycleEvent[];
  /** The appointment prep list's items (phase 5 ticket 11), as they stand
      right now - not range-filtered, since the list has no date of its own
      to filter by. */
  appointmentPrep: ChecklistItem[];
  /** Every procedure and its recovery log (phase 5 ticket 07), not
      range-filtered - see readProcedures below. */
  procedures: ClinicianSummaryProcedure[];
  /** Which streams have ended and when (phase 8 features ticket 04). A
      stopped treatment then reads as a decision with a date rather than as
      missing data. Not range-filtered, for the reason `procedures` is not:
      a course that ended before the window is exactly what explains a flat
      stretch inside it. */
  finishedAreas: ClinicianSummaryFinishedArea[];
}

export type ClinicianSummarySectionKey = keyof ClinicianSummaryContents;

/** Each part, or null when the person switched it off for this print. */
export type ClinicianSummarySections = {
  [Key in ClinicianSummarySectionKey]: ClinicianSummaryContents[Key] | null;
};

export interface ClinicianSummary {
  fromEpochDay: number;
  toEpochDay: number;
  generatedAtEpochDay: number;
  sections: ClinicianSummarySections;
}

/** Which parts this print carries. Every one of them is on by default; the
    switches on the summary's sheet are this record. */
export type ClinicianSummaryInclusion = Record<ClinicianSummarySectionKey, boolean>;

/** The areas a section may read through: the ones `openJournal` already
    built, so a section reads exactly what its own screen does. One type
    rather than a parameter each, because every section is handed all of
    them and the section that registers next will want another. */
interface ClinicianSummaryAreas {
  areaStates: AreaStatesArea;
  regimen: RegimenArea;
  doses: DosesArea;
  labs: LabsArea;
  exposure: ExposureArea;
  sideEffects: SideEffectsArea;
  cycleEvents: CycleEventsArea;
  checklists: ChecklistsArea;
  procedures: ProceduresArea;
}

/** What every section's read is given: the areas, the range to read for,
    the drugs a visit's printout has turned off (phase 8 features ticket 39)
    and the personal details typed for this print. Most sections ignore most
    of it. */
interface ClinicianSummaryReading extends ClinicianSummaryAreas {
  fromEpochDay: number;
  toEpochDay: number;
  excludedDrugs: ReadonlySet<string>;
  demographics: Partial<ClinicianSummaryDemographics>;
}

/** One part of the summary's declaration that it prints. Erased over what
    it reads, because the list holds every section at once and because a
    test registers sections `ClinicianSummary` has never heard of. */
/* ClinicianSummarySection stays exported only for its own test (AU-09
   test-only review). */
export interface ClinicianSummarySection {
  key: string;
  tables: readonly TableName[];
  read(reading: ClinicianSummaryReading): Promise<unknown>;
}

/** Keeps the read honest at the declaration site: it has to return what
    `ClinicianSummaryContents` says the section holds. */
function section<Key extends ClinicianSummarySectionKey>(declared: {
  key: Key;
  tables: readonly TableName[];
  read(reading: ClinicianSummaryReading): Promise<ClinicianSummaryContents[Key]>;
}) {
  return declared;
}

function excludesDrug(excludedDrugs: ReadonlySet<string>, drug: string): boolean {
  return [...excludedDrugs].some((excluded) => sameDrug(excluded, drug));
}

/* Only committed values (see ClinicianSummaryDemographics). Reads no row:
   the name is a preference and the other two are typed on the summary's
   own sheet, so they arrive with the reading. */
async function readDemographics({ demographics }: ClinicianSummaryReading): Promise<ClinicianSummaryDemographics> {
  return {
    name: demographics.name ?? '',
    pronouns: demographics.pronouns ?? null,
    dob: demographics.dob ?? null
  };
}

/* An episode belongs in the history if any part of its dated range overlaps
   the window - the same overlap exposureCounters.ts's own overlapDays
   tests, kept here as a filter rather than a count. Composed with the
   drug exclusion (phase 8 features ticket 39) in the same `.filter` rather
   than as a second pass over the list. */
async function readRegimenEpisodes({ regimen, fromEpochDay, toEpochDay, excludedDrugs }: ClinicianSummaryReading) {
  const episodes = await regimen.getEpisodes();
  return episodes.filter(
    (episode) => spanOverlapsRange(episode, fromEpochDay, toEpochDay) && !excludesDrug(excludedDrugs, episode.drug)
  );
}

/* A dose event usually names no drug of its own, so which drug it counts
   against is resolved against the episode history exactly the way
   exposureCounters.ts's cumulativeDoseTotals already resolves it
   (attributeDrug) - reusing that question rather than re-deriving "which
   drug was this dose" a second way. A dose attributeDrug cannot resolve at
   all (`drug: null`) names no excluded drug either, so it stays. */
async function readDoses({ doses, regimen, fromEpochDay, toEpochDay, excludedDrugs }: ClinicianSummaryReading) {
  const [events, episodes] = await Promise.all([doses.getDoses(fromEpochDay, toEpochDay), regimen.getEpisodes()]);
  return events.filter((dose) => {
    const { drug } = attributeDrug(episodes, dose);
    return drug === null || !excludesDrug(excludedDrugs, drug);
  });
}

/* The episodes and the dose log print as one part under one switch, so they
   are one section. "Current" is the episodes still running on the range's
   last day, picked out of the same history rather than read again. */
async function readRegimen(reading: ClinicianSummaryReading): Promise<ClinicianSummaryRegimen> {
  const [history, doses] = await Promise.all([readRegimenEpisodes(reading), readDoses(reading)]);
  return {
    current: history.filter((episode) => spanCoversDay(episode, reading.toEpochDay)),
    history,
    doses
  };
}

/* Exposure counters, with the excluded drugs' rows dropped from the two
   parts keyed by drug (phase 8 features ticket 39). `routeDays` is not
   filtered: it is a route total, not a drug total (daysOnEachRoute merges
   across whatever episodes used that route), and this ticket does not
   conflate the two any more than it conflates an analyte with a drug.
   `excludedDoses` stays as-is for the same reason - it counts doses the
   drug log itself could not attribute, which a drug toggle does not
   change. */
async function readExposure({ exposure, fromEpochDay, toEpochDay, excludedDrugs }: ClinicianSummaryReading) {
  const counters = await exposure.getCounters(fromEpochDay, toEpochDay);
  return {
    ...counters,
    doseTotals: counters.doseTotals.filter((total) => !excludesDrug(excludedDrugs, total.drug)),
    regimenDays: counters.regimenDays.filter((days) => !excludesDrug(excludedDrugs, days.drug))
  };
}

/* Shared bounded read for the clinician summary and appointment prep. */
export async function readLabResultsInRange(labs: LabsArea, fromEpochDay: number, toEpochDay: number) {
  return labs.getResultsInRange(fromEpochDay, toEpochDay);
}

/* Every procedure, unfiltered. A dose or a lab result is an event on a day,
   so a range picks which ones to print; a procedure is an ongoing journey
   whose recovery log keeps running, and filtering it out because the
   operation fell before the window would hide the very thing a post-op
   follow-up is about. So this selects nothing, the same way the appointment
   prep list prints whatever it currently holds.

   Each part still comes from the area that owns it, through that area's own
   read path: the record from procedures.getProcedures(), the checklist from
   procedures.getChecklist() (which is checklists.getChecklistByOwner()), and
   the photo days from procedures.getPhotos(). Nothing here computes a figure
   one of them does not already produce - the day counter a screen shows is
   derived at the point of display (recoveryDay.ts), off the surgery date
   printed here.

   Decision (ticket 19): "since last appointment" is a range like any
   other, picked the same way any other pair of dates is - it does not
   filter this section either, for the reason above, not a new one. */
async function readProcedures({ procedures }: ClinicianSummaryReading): Promise<ClinicianSummaryProcedure[]> {
  const records = await procedures.getProcedures();
  return Promise.all(
    records.map(async (procedure) => ({
      ...procedure,
      checklistItems: (await procedures.getChecklist(procedure.id))?.items ?? [],
      photoEpochDays: (await procedures.getPhotos(procedure.id)).map((photo) => photo.epochDay)
    }))
  );
}

/* The appointment prep list has no date to filter by - it prints whatever it
   currently holds, the same way its own screen shows it, rather than a slice
   of some range (ticket 11).

   Decision (ticket 19): "since last appointment" does not filter this
   section either - the list has no date under any range, and the range
   this ticket adds is a shortcut for picking two dates, not a new kind of
   range with its own rules. */
async function readAppointmentPrep({ checklists }: ClinicianSummaryReading) {
  const checklist = await checklists.getStandaloneChecklist();
  return checklist?.items ?? [];
}

const SECTIONS = [
  section({ key: 'demographics', tables: [], read: readDemographics }),
  // The regimen table for the dose log too: a dose event usually names no
  // drug of its own, so telling its rows apart needs the episode history.
  section({ key: 'regimen', tables: ['regimen', 'dose'], read: readRegimen }),
  section({
    key: 'exposure',
    // Every counter is recomputed from the dose log and the episode history
    // on each read (exposure.ts), so this section depends on both.
    tables: ['dose', 'regimen'],
    read: readExposure
  }),
  section({
    key: 'labs',
    tables: ['lab'],
    read: ({ labs, fromEpochDay, toEpochDay }) => readLabResultsInRange(labs, fromEpochDay, toEpochDay)
  }),
  section({
    key: 'sideEffects',
    tables: ['sideEffect'],
    read: ({ sideEffects, fromEpochDay, toEpochDay }) => sideEffects.getSideEffectsInRange(fromEpochDay, toEpochDay)
  }),
  section({
    key: 'cycleEvents',
    tables: ['cycleEvent'],
    read: ({ cycleEvents, fromEpochDay, toEpochDay }) => cycleEvents.getCycleEventsInRange(fromEpochDay, toEpochDay)
  }),
  section({ key: 'appointmentPrep', tables: ['checklist'], read: readAppointmentPrep }),
  section({
    key: 'procedures',
    // 'appointment' because a journey prints its consults, which are
    // appointments pointing at it (ticket 57). The summary's own "since
    // your last appointment" range is not this section's - it lives in the
    // route itself (clinician-summary/+page.svelte), reading
    // appointments.ts's mostRecentPastAppointment since ticket 58.
    //
    // The recovery checklist as well as the procedure: an item ticked off on
    // it changes what this section prints, and that checklist is an ordinary
    // `checklists` record owned by the procedure (procedures.ts).
    tables: ['procedure', 'appointment', 'checklist'],
    read: readProcedures
  }),
  section({
    key: 'finishedAreas',
    tables: ['areaState'],
    read: async ({ areaStates }) => finishedGroups(await areaStates.getAreaStates())
  })
] as const;

/* A part of `ClinicianSummaryContents` with no entry above would be missing
   from every summary the screen prints, silently. This line makes that a
   compile error instead. */
type Unregistered = Exclude<ClinicianSummarySectionKey, (typeof SECTIONS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EverySectionRegistered = AssertNoneUnregistered<Unregistered>;

/* CLINICIAN_SUMMARY_SECTIONS stays exported only for its own test (AU-09
   test-only review). */
export const CLINICIAN_SUMMARY_SECTIONS: readonly ClinicianSummarySection[] = SECTIONS;

/** Every part's key, in the order the parts print: what the screen walks to
    draw the page and to list the include switches. */
export const CLINICIAN_SUMMARY_SECTION_KEYS: readonly ClinicianSummarySectionKey[] = SECTIONS.map((s) => s.key);

export const EVERY_CLINICIAN_SUMMARY_SECTION: ClinicianSummaryInclusion = Object.fromEntries(
  CLINICIAN_SUMMARY_SECTION_KEYS.map((key) => [key, true])
) as ClinicianSummaryInclusion;

import { CLINICIAN_SUMMARY_TABLES } from '../live/writes';
export { CLINICIAN_SUMMARY_TABLES };

export interface ClinicianSummaryOptions {
  /** Parts switched off for this print. A part left out reads as null and
      costs no read. Defaults to every part. */
  inclusion?: Partial<ClinicianSummaryInclusion>;
  /** Drugs left out of the regimen and exposure parts (phase 8 features
      ticket 39) - a printing choice about this visit, not portable journal
      data (ADR-0003). Defaults to none. */
  excludedDrugs?: ReadonlySet<string>;
  demographics?: Partial<ClinicianSummaryDemographics>;
  generatedAtEpochDay?: number;
}

/** Every included section read for one range, in the order they print.
    Concurrent because the sections are independent - none of them reads
    what another produced. */
async function assembleClinicianSummary(
  areas: ClinicianSummaryAreas,
  fromEpochDay: number,
  toEpochDay: number,
  options: ClinicianSummaryOptions,
  sections: readonly ClinicianSummarySection[]
): Promise<ClinicianSummary> {
  const reading: ClinicianSummaryReading = {
    ...areas,
    fromEpochDay,
    toEpochDay,
    excludedDrugs: options.excludedDrugs ?? new Set(),
    demographics: options.demographics ?? {}
  };
  const inclusion: Partial<Record<string, boolean>> = { ...options.inclusion };
  const included = sections.filter((s) => inclusion[s.key] !== false);
  const contents = await Promise.all(included.map((s) => s.read(reading)));
  const read = new Map(included.map((s, index) => [s.key, contents[index]]));
  const assembled: Record<string, unknown> = {};
  for (const s of sections) assembled[s.key] = read.has(s.key) ? read.get(s.key) : null;
  return {
    fromEpochDay,
    toEpochDay,
    generatedAtEpochDay: options.generatedAtEpochDay ?? todayEpochDay(),
    sections: assembled as ClinicianSummarySections
  };
}

export interface ClinicianSummaryArea {
  /** Every registered section the options include, read for
      `[fromEpochDay, toEpochDay]` and assembled for printing - nothing here
      is stored (phase 4 ticket 12). */
  getSummary(fromEpochDay: number, toEpochDay: number, options?: ClinicianSummaryOptions): Promise<ClinicianSummary>;
}

/** The section list is a parameter, defaulting to the registry, so a test
    can register a section of its own and read a summary back through the
    same path the screen reads it through. */
export function makeClinicianSummaryArea(
  areas: ClinicianSummaryAreas,
  sections: readonly ClinicianSummarySection[] = CLINICIAN_SUMMARY_SECTIONS
): ClinicianSummaryArea {
  return {
    getSummary: (fromEpochDay, toEpochDay, options = {}) =>
      assembleClinicianSummary(areas, fromEpochDay, toEpochDay, options, sections)
  };
}

/* Printing choices the summary's sheet makes, kept beside the registry they
   choose from. */

/** Every distinct drug name across every regimen episode the person has
    ever logged, active or past - what the drug-inclusion toggle on the
    range sheet lists (phase 8 features ticket 39). Unbounded rather than
    scoped to whatever range a summary itself reads for: the toggle is a
    device preference set once, not a per-print control, so a drug outside
    today's chosen range still gets a switch. */
export function regimenDrugNames(episodes: readonly RegimenEpisode[]): string[] {
  const names: string[] = [];
  for (const episode of episodes) {
    if (!names.some((name) => sameDrug(name, episode.drug))) names.push(episode.drug);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** Saved exclusions can use a spelling hidden by the deduplicated choices. */
export function excludedClinicianDrugs(
  drugNames: readonly string[],
  preferences: Partial<Record<string, boolean>>
): Set<string> {
  const saved = Object.entries(preferences);
  return new Set(drugNames.filter((drug) => saved.some(([name, excluded]) => excluded && sameDrug(name, drug))));
}

/** Update old spellings too, so an earlier exclusion cannot override this pick. */
export function withClinicianDrugIncluded(
  preferences: Partial<Record<string, boolean>>,
  drug: string,
  included: boolean
): Partial<Record<string, boolean>> {
  const next = { ...preferences, [drug]: !included };
  for (const name of Object.keys(preferences)) {
    if (sameDrug(name, drug)) next[name] = !included;
  }
  return next;
}

const spacedWords = (text: string) =>
  ` ${text.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).join(' ')} `;

/** The ester a regimen row should name beside its drug, or null when there
    is none or the drug's own name already says it ("Estradiol valerate"
    with the ester "valerate" printed the ester twice, after-release 22).
    Whole words only, so a name that merely starts with the ester still
    gets it. */
export function regimenEsterNote(drug: string, ester: string | null): string | null {
  const note = ester?.trim();
  if (!note) return null;
  return spacedWords(drug).includes(spacedWords(note)) ? null : note;
}

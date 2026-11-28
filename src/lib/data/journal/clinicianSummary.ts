/* Read the clinician summary through the journal areas that own its rows (ADR-0010). Each
   section filters to the requested range without introducing a stored or interpreted
   result.

   The registry fixes print order, section keys and include switches. A section declares its
   area's read and tables. Their union is CLINICIAN_SUMMARY_TABLES, the live dependency
   list. Localized names live in vocabulary/clinicianSummaryLabels.ts. */

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
import { daysOnEachRoute } from '../exposureCounters';
import { attributeDrug, sameDrug } from '../regimenEpisode';
import { spanCoversDay, spanOverlapsRange } from '../span';
import type { AreaStatesArea } from './areaStates';
import type { ChecklistsArea } from './checklists';
import type { CycleEventsArea } from './cycleEvents';
import type { DosesArea } from './doses';
import type { EffectCategoriesArea } from './effectCategories';
import type { ExposureArea, ExposureCounters } from './exposure';
import type { LabsArea } from './labs';
import type { PersonalEffectsArea } from './personalEffects';
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

/** A procedure as the summary prints it: the record
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
    ended (ADR-0052). Named by hub row rather than
    by archive section, because that is what the reader recognises and because
    voice is two sections finished together. */
interface ClinicianSummaryFinishedArea {
  key: AreaGroupKey;
  epochDay: number;
}

/** A change the person has noticed, as the summary prints it: the marker's effect and its first-noticed day, with
    the catalogue's stored name. A built-in's printed name is the
    vocabulary's, looked up by key on the page, because this file speaks
    no paraglide; a custom one is the name the person gave it. */
export interface ClinicianSummaryChange {
  effect: string;
  name: string;
  builtIn: boolean;
  firstNoticedEpochDay: number;
}

/** What each part holds when it is included. */
interface ClinicianSummaryContents {
  demographics: ClinicianSummaryDemographics;
  regimen: ClinicianSummaryRegimen;
  exposure: ExposureCounters;
  labs: LabResult[];
  /** Side effects active at any point in the range, ongoing or resolved. */
  sideEffects: SideEffect[];
  /** Every change marked so far that the timeline shows, oldest first -
      not range-filtered, see readChangesNoticed below. */
  personalEffects: ClinicianSummaryChange[];
  cycleEvents: CycleEvent[];
  /** The appointment prep list's items, as they stand
      right now - not range-filtered, since the list has no date of its own
      to filter by. */
  appointmentPrep: ChecklistItem[];
  /** Every procedure and its recovery log, not
      range-filtered - see readProcedures below. */
  procedures: ClinicianSummaryProcedure[];
  /** Which streams have ended and when. A
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
  personalEffects: PersonalEffectsArea;
  effectCategories: EffectCategoriesArea;
}

/** What every section's read is given: the areas, the range to read for,
    the drugs a visit's printout has turned off
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
/* ClinicianSummarySection stays exported only for its own test. */
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
   drug exclusion in the same `.filter` rather
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

/* Exposure counters, with the excluded drugs' rows dropped. Route days are a route total,
   not a drug total (daysOnEachRoute merges across whatever episodes used that route), so
   they are recounted by that same function over the printed drugs' episodes only: they kept
   every drug, and with a drug that is not HRT off by default an SSRI's oral days still
   reached the page as "oral" days. `excludedDoses` stays as-is - it counts doses the drug
   log itself could not attribute, which a drug toggle does not change. */
async function readExposure({ exposure, regimen, fromEpochDay, toEpochDay, excludedDrugs }: ClinicianSummaryReading) {
  const counters = await exposure.getCounters(fromEpochDay, toEpochDay);
  if (excludedDrugs.size === 0) return counters;
  const printed = (await regimen.getEpisodes()).filter((episode) => !excludesDrug(excludedDrugs, episode.drug));
  return {
    ...counters,
    doseTotals: counters.doseTotals.filter((total) => !excludesDrug(excludedDrugs, total.drug)),
    routeDays: daysOnEachRoute(printed, fromEpochDay, toEpochDay),
    regimenDays: counters.regimenDays.filter((days) => !excludesDrug(excludedDrugs, days.drug))
  };
}

/* A side effect is a span from the day it began to the day it resolved,
   open while it goes on. It belongs on the
   page if it was active on any day of the range: one that began before the
   range and is still going on is exactly what a visit needs to hear about,
   and one that resolved before the range began is not. The span arithmetic
   is span.ts's, as for regimen episodes. */
async function readSideEffects({ sideEffects, fromEpochDay, toEpochDay }: ClinicianSummaryReading) {
  const all = await sideEffects.getSideEffects();
  return all.filter((effect) =>
    spanOverlapsRange({ startEpochDay: effect.epochDay, endEpochDay: effect.resolvedEpochDay }, fromEpochDay, toEpochDay)
  );
}

/* Changes noticed. Every personal effect a
   first-noticed day is marked for, oldest first. Not range-filtered, for
   the reason procedures are not: a marker is one row per effect whose day
   is replaced in place, so it records what has changed so far rather than
   an event inside a window, and a change first noticed before the window
   is still one the person has. Only what the changes timeline draws: an
   effect hidden, or in a category switched off, stays off the page the way
   it stays off the axis (reference.svelte.ts's visiblePersonalEffectTypes
   asks the same two questions). A marker naming a key the catalogue no
   longer has prints under that key, as the timeline names it. */
async function readChangesNoticed({ personalEffects, effectCategories }: ClinicianSummaryReading) {
  const [markers, types, categories] = await Promise.all([
    personalEffects.getMarkers(),
    personalEffects.getEffectTypes(),
    effectCategories.getEffectCategories()
  ]);
  const off = new Set(categories.filter((category) => !category.enabled).map((category) => category.key));
  const changes: ClinicianSummaryChange[] = [];
  for (const marker of markers) {
    const type = types.find((candidate) => candidate.key === marker.effect);
    if (type && (type.hidden || (type.categoryKey !== null && off.has(type.categoryKey)))) continue;
    changes.push({
      effect: marker.effect,
      name: type?.name ?? marker.effect,
      builtIn: type?.builtIn ?? false,
      firstNoticedEpochDay: marker.firstNoticedEpochDay
    });
  }
  return changes.sort((a, b) => a.firstNoticedEpochDay - b.firstNoticedEpochDay || a.effect.localeCompare(b.effect));
}

/* Shared bounded read for the clinician summary and appointment prep. */
export async function readLabResultsInRange(labs: LabsArea, fromEpochDay: number, toEpochDay: number) {
  return labs.getResultsInRange(fromEpochDay, toEpochDay);
}

/* Print every procedure because a recovery can continue beyond the
   date range, including since-last-appointment. Read the record,
   checklist and photo dates from their own area APIs. recoveryDay.ts
   derives the display counter from the printed operation date. */
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
   of some range.

   Decision: "since last appointment" does not filter this
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
  section({ key: 'sideEffects', tables: ['sideEffect'], read: readSideEffects }),
  section({
    key: 'personalEffects',
    // The catalogue and its categories too: hiding an effect or switching
    // its category off takes its row off the page.
    tables: ['personalEffect', 'personalEffectType', 'effectCategory'],
    read: readChangesNoticed
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
    // appointments pointing at it. The summary's own "since
    // your last appointment" range is not this section's - it lives in the
    // route itself (clinician-summary/+page.svelte), reading
    // appointments.ts's mostRecentPastAppointment.
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

/* CLINICIAN_SUMMARY_SECTIONS stays exported only for its own test. */
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
  /** Drugs left out of the regimen and exposure parts - a printing choice about this visit, not portable journal
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
      is stored. */
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
    range sheet lists. Unbounded rather than
    scoped to whatever range a summary itself reads for: the toggle is a
    device preference set once, not a per-print control, so a drug outside
    today's chosen range still gets a switch. */
export function regimenDrugNames(episodes: readonly Pick<RegimenEpisode, 'drug'>[]): string[] {
  const names: string[] = [];
  for (const episode of episodes) {
    if (!names.some((name) => sameDrug(name, episode.drug))) names.push(episode.drug);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/** The drugs this print leaves out. A drug the person has switched on or off
    keeps that choice, under any spelling the deduplicated choices hide. One
    never touched is off when it is not HRT:
    the summary is the one thing made to leave the device, so an SSRI or
    PrEP should not reach an endocrinologist unless the person says so. A
    drug name with any HRT episode counts as HRT. */
export function excludedClinicianDrugs(
  episodes: readonly Pick<RegimenEpisode, 'drug' | 'drugClass'>[],
  preferences: Partial<Record<string, boolean>>
): Set<string> {
  const saved = Object.entries(preferences);
  return new Set(
    regimenDrugNames(episodes).filter((drug) => {
      const choices = saved.filter(([name]) => sameDrug(name, drug));
      if (choices.length > 0) return choices.some(([, excluded]) => excluded);
      return !episodes.some((episode) => episode.drugClass === 'hrt' && sameDrug(episode.drug, drug));
    })
  );
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

/** The ester a regimen row should name beside its drug, or null when there is none or the
    drug's own name already says it ("Estradiol valerate" with the ester "valerate" printed
    the ester twice). Whole words only, so a name that merely starts with the ester still
    gets it. */
export function regimenEsterNote(drug: string, ester: string | null): string | null {
  const note = ester?.trim();
  if (!note) return null;
  return spacedWords(drug).includes(spacedWords(note)) ? null : note;
}

/* The clinician visit summary (phase 4 ticket 12, CONTEXT: "Clinician
   summary section", "Regimen episode", "Dose event", "Analyte", "Side
   effect"). A view over rows regimen, doses, labs, exposure and sideEffects
   own, not a sixth owner for any of them - the whole point of this area is
   that it introduces no figure the tickets it draws from do not already
   produce (ADR-0010). Selecting which rows fall in the requested range is
   the only work done here; nothing is aggregated, interpreted or stored.

   Which parts the summary has is a registry rather than a hardcoded
   assembly (phase 5 ticket 06, ADR-0031). One entry declares three things:

     key    where the part lands in `ClinicianSummary`, and what the screen
            looks its title up by
     read   how the part is read, through its own area's existing read path
     order  where it is declared, which is the order it prints in

   Wording is not here. Titles live in vocabulary/clinicianSummaryLabels.ts,
   keyed by section, the same split roadmap.ts and builtins.ts keep and for
   the same reason: this file stays Node-tier safe by importing no paraglide
   (ADR-0002, ADR-0016).

   What a section computes stays inside its own read function. Each one
   still calls the area that owns the rows and filters to the range; the
   registry decides which sections exist and in what order they print,
   never what any one of them means. */

import { episodeEndEpochDay } from '../regimenEpisode';
import type { ChecklistItem, DoseEvent, LabResult, RegimenEpisode, SideEffect } from '../types';
import type { ChecklistsArea } from './checklists';
import type { DosesArea } from './doses';
import type { ExposureArea, ExposureCounters } from './exposure';
import type { LabsArea } from './labs';
import type { RegimenArea } from './regimen';
import type { SideEffectsArea } from './sideEffects';

/** A regimen episode plus its derived end day (regimenEpisode.ts), computed
    against the full episode history before the range filter runs - so a
    superseded episode still in range reports the day it ended rather than
    reading as ongoing just because the episode that superseded it fell
    outside the window. */
export interface ClinicianSummaryEpisode extends RegimenEpisode {
  endEpochDay: number | null;
}

export interface ClinicianSummary {
  regimenEpisodes: ClinicianSummaryEpisode[];
  doses: DoseEvent[];
  labResults: LabResult[];
  exposure: ExposureCounters;
  sideEffects: SideEffect[];
  /** The appointment prep list's items (phase 5 ticket 11), as they stand
      right now - not range-filtered like the sections above it, since the
      list has no date of its own to filter by. */
  appointmentPrepItems: ChecklistItem[];
}

export type ClinicianSummarySectionKey = keyof ClinicianSummary;

/** The areas a section may read through: the ones `openJournal` already
    built, so a section reads exactly what its own screen does. One type
    rather than five parameters, because every section is handed all of them
    and the section that registers next will want a sixth. */
export interface ClinicianSummaryAreas {
  regimen: RegimenArea;
  doses: DosesArea;
  labs: LabsArea;
  exposure: ExposureArea;
  sideEffects: SideEffectsArea;
  checklists: ChecklistsArea;
}

/** What every section's read is given: the areas, and the range to read
    for. */
export interface ClinicianSummaryReading extends ClinicianSummaryAreas {
  fromEpochDay: number;
  toEpochDay: number;
}

/** One part of the summary's declaration that it prints. Erased over what
    it reads, because the list holds every section at once and because a
    test registers sections `ClinicianSummary` has never heard of. */
export interface ClinicianSummarySection {
  key: string;
  read(reading: ClinicianSummaryReading): Promise<unknown>;
}

/** Keeps the read honest at the declaration site: it has to return what
    `ClinicianSummary` says the section holds. */
function section<Key extends ClinicianSummarySectionKey>(declared: {
  key: Key;
  read(reading: ClinicianSummaryReading): Promise<ClinicianSummary[Key]>;
}) {
  return declared;
}

/* episodes is regimen.getEpisodes()'s own order - ascending by
   startEpochDay - which episodeEndEpochDay requires (regimenEpisode.ts).
   Each episode's end is derived against that full, correctly-ordered
   history first, so a superseded episode still in range keeps the end day
   its successor gives it even though that successor itself may fall outside
   the window. An episode belongs in the history if any part of its dated
   range overlaps the window - the same overlap exposureCounters.ts's own
   overlapDays tests, kept here as a filter rather than a count. */
async function readRegimenEpisodes({ regimen, fromEpochDay, toEpochDay }: ClinicianSummaryReading) {
  const episodes = await regimen.getEpisodes();
  return episodes
    .map((episode, index) => ({ ...episode, endEpochDay: episodeEndEpochDay(episodes, index) }))
    .filter((episode) => episode.startEpochDay <= toEpochDay && (episode.endEpochDay === null || episode.endEpochDay >= fromEpochDay));
}

/* labs.ts has no cross-analyte range read (unlike doses and side effects),
   so every used analyte's results are read and the range filter applied
   here - selecting rows, not computing a new figure. */
async function readLabResults({ labs, fromEpochDay, toEpochDay }: ClinicianSummaryReading) {
  const analytes = await labs.getUsedAnalytes();
  const resultsByAnalyte = await Promise.all(analytes.map((a) => labs.getResults(a)));
  return resultsByAnalyte
    .flat()
    .filter((result) => result.epochDay >= fromEpochDay && result.epochDay <= toEpochDay)
    .sort((a, b) => a.epochDay - b.epochDay);
}

/* The appointment prep list has no date to filter by - it prints whatever it
   currently holds, the same way its own screen shows it, rather than a slice
   of some range (ticket 11). Declared last so it prints as the summary's
   final page. */
async function readAppointmentPrepItems({ checklists }: ClinicianSummaryReading) {
  const checklist = await checklists.getStandaloneChecklist();
  return checklist?.items ?? [];
}

const SECTIONS = [
  section({ key: 'regimenEpisodes', read: readRegimenEpisodes }),
  section({ key: 'doses', read: ({ doses, fromEpochDay, toEpochDay }) => doses.getDoses(fromEpochDay, toEpochDay) }),
  section({ key: 'labResults', read: readLabResults }),
  section({ key: 'exposure', read: ({ exposure, fromEpochDay, toEpochDay }) => exposure.getCounters(fromEpochDay, toEpochDay) }),
  section({
    key: 'sideEffects',
    read: ({ sideEffects, fromEpochDay, toEpochDay }) => sideEffects.getSideEffectsInRange(fromEpochDay, toEpochDay)
  }),
  section({ key: 'appointmentPrepItems', read: readAppointmentPrepItems })
] as const;

/* A part of `ClinicianSummary` with no entry above would be missing from
   every summary the screen prints, silently. This line makes that a compile
   error instead. */
type Unregistered = Exclude<ClinicianSummarySectionKey, (typeof SECTIONS)[number]['key']>;
type AssertNoneUnregistered<Missing extends never> = Missing;
export type EverySectionRegistered = AssertNoneUnregistered<Unregistered>;

export const CLINICIAN_SUMMARY_SECTIONS: readonly ClinicianSummarySection[] = SECTIONS;

/** Every section's key, in the order they print - what the screen walks to
    lay a summary out, so it never names a section itself. */
export const CLINICIAN_SUMMARY_SECTION_KEYS: readonly ClinicianSummarySectionKey[] = SECTIONS.map((s) => s.key);

/** Every section read for one range, in the order they print. Concurrent
    because the sections are independent - none of them reads what another
    produced. */
async function assembleClinicianSummary(
  reading: ClinicianSummaryReading,
  sections: readonly ClinicianSummarySection[] = CLINICIAN_SUMMARY_SECTIONS
): Promise<ClinicianSummary> {
  const contents = await Promise.all(sections.map((s) => s.read(reading)));
  const summary: Record<string, unknown> = {};
  sections.forEach((s, index) => {
    summary[s.key] = contents[index];
  });
  return summary as unknown as ClinicianSummary;
}

export interface ClinicianSummaryArea {
  /** Every registered section read for `[fromEpochDay, toEpochDay]` and
      assembled for printing - nothing here is stored (phase 4 ticket 12). */
  getSummary(fromEpochDay: number, toEpochDay: number): Promise<ClinicianSummary>;
}

/** The section list is a parameter, defaulting to the registry, so a test
    can register a section of its own and read a summary back through the
    same path the screen reads it through. */
export function makeClinicianSummaryArea(
  areas: ClinicianSummaryAreas,
  sections: readonly ClinicianSummarySection[] = CLINICIAN_SUMMARY_SECTIONS
): ClinicianSummaryArea {
  return {
    getSummary: (fromEpochDay, toEpochDay) => assembleClinicianSummary({ ...areas, fromEpochDay, toEpochDay }, sections)
  };
}

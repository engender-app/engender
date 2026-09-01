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

import type { ChecklistItem, DoseEvent, LabResult, Procedure, RegimenEpisode, SideEffect } from '../types';
import type { ChecklistsArea } from './checklists';
import type { DosesArea } from './doses';
import type { ExposureArea, ExposureCounters } from './exposure';
import type { LabsArea } from './labs';
import type { ProceduresArea } from './procedures';
import type { RegimenArea } from './regimen';
import type { SideEffectsArea } from './sideEffects';

/** A regimen episode as the summary prints it - its own stored end day
    (types.ts), unchanged: an episode's end no longer needs deriving
    against the full history the way it did before ticket 38 stored it. */
export type ClinicianSummaryEpisode = RegimenEpisode;

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

export interface ClinicianSummary {
  regimenEpisodes: ClinicianSummaryEpisode[];
  doses: DoseEvent[];
  labResults: LabResult[];
  exposure: ExposureCounters;
  sideEffects: SideEffect[];
  /** Every procedure and its recovery log (phase 5 ticket 07), not
      range-filtered - see readProcedures below. */
  procedures: ClinicianSummaryProcedure[];
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
  procedures: ProceduresArea;
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

/* An episode belongs in the history if any part of its dated range overlaps
   the window - the same overlap exposureCounters.ts's own overlapDays
   tests, kept here as a filter rather than a count. */
async function readRegimenEpisodes({ regimen, fromEpochDay, toEpochDay }: ClinicianSummaryReading) {
  const episodes = await regimen.getEpisodes();
  return episodes.filter(
    (episode) => episode.startEpochDay <= toEpochDay && (episode.endEpochDay === null || episode.endEpochDay >= fromEpochDay)
  );
}

/* labs.ts has no cross-analyte range read (unlike doses and side effects),
   so every used analyte's results are read and the range filter applied
   here - selecting rows, not computing a new figure.

   Exported (phase 5 deepening ticket 25): the appointment prep screen wants
   the same "every analyte, one range" read for its own "since last time"
   section, and this is that read's one home rather than a second copy of
   it - the registry's own reasoning for keeping a section's logic inside
   its read function, extended to a second caller. */
export async function readLabResultsInRange(labs: LabsArea, fromEpochDay: number, toEpochDay: number) {
  const analytes = await labs.getUsedAnalytes();
  const resultsByAnalyte = await Promise.all(analytes.map((a) => labs.getResults(a)));
  return resultsByAnalyte
    .flat()
    .filter((result) => result.epochDay >= fromEpochDay && result.epochDay <= toEpochDay)
    .sort((a, b) => a.epochDay - b.epochDay);
}

/* Every procedure, unfiltered. A dose or a lab result is an event on a day,
   so a range picks which ones to print; a procedure is an ongoing journey
   whose recovery log keeps running, and filtering it out because the
   operation fell before the window would hide the very thing a post-op
   follow-up is about. So this selects nothing, the same way the appointment
   prep list below prints whatever it currently holds.

   Each part still comes from the area that owns it, through that area's own
   read path: the record from procedures.getProcedures(), the checklist from
   procedures.getChecklist() (which is checklists.getChecklistByOwner()), and
   the photo days from procedures.getPhotos(). Nothing here computes a figure
   one of them does not already produce - the day counter a screen shows is
   derived at the point of display (recoveryDay.ts), off the surgery date
   printed here. */
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
   of some range (ticket 11). Declared last so it prints as the summary's
   final page. */
async function readAppointmentPrepItems({ checklists }: ClinicianSummaryReading) {
  const checklist = await checklists.getStandaloneChecklist();
  return checklist?.items ?? [];
}

const SECTIONS = [
  section({ key: 'regimenEpisodes', read: readRegimenEpisodes }),
  section({ key: 'doses', read: ({ doses, fromEpochDay, toEpochDay }) => doses.getDoses(fromEpochDay, toEpochDay) }),
  section({ key: 'labResults', read: ({ labs, fromEpochDay, toEpochDay }) => readLabResultsInRange(labs, fromEpochDay, toEpochDay) }),
  section({ key: 'exposure', read: ({ exposure, fromEpochDay, toEpochDay }) => exposure.getCounters(fromEpochDay, toEpochDay) }),
  section({
    key: 'sideEffects',
    read: ({ sideEffects, fromEpochDay, toEpochDay }) => sideEffects.getSideEffectsInRange(fromEpochDay, toEpochDay)
  }),
  section({ key: 'procedures', read: readProcedures }),
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

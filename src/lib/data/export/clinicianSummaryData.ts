/* Data assembly and filtering for the clinician visit dossier export
   (phase 5 ticket 09, ADR-0031, ADR-0010, ADR-0012).

   Synthesizes patient demographics, current regimen and dosage history,
   cumulative exposure counters, lab results with post-dose timing context,
   side effects, cycle events, and appointment prep questions into a single
   structured clinical package.

   Reuses the clinicianSummary area registry (ADR-0031) for base clinical reads,
   adding patient demographics and cycle events. When a section is unticked in
   inclusion, it is redacted (omitted as null) from the assembled dossier.

   Node-tier safe: imports no paraglide (ADR-0016). Display wording lives in
   vocabulary and components. */

import type {
  ChecklistItem,
  CycleEvent,
  DoseEvent,
  LabResult,
  RegimenEpisode,
  SideEffect
} from '../types';
import type { ExposureCounters } from '../journal/exposure';
import type { ClinicianSummaryFinishedArea, ClinicianSummaryProcedure } from '../journal/clinicianSummary';
import type { Journal } from '../journal/journal';
import { todayEpochDay } from '../epochDay';
import { spanCoversDay } from '../span';

export interface PatientDemographics {
  name: string;
  pronouns: string | null;
  dob: string | null;
}

export interface ClinicianDossierInclusion {
  demographics: boolean;
  regimen: boolean;
  exposure: boolean;
  labs: boolean;
  sideEffects: boolean;
  cycleEvents: boolean;
  appointmentPrep: boolean;
  procedures: boolean;
  /** Which streams have ended (phase 8 features ticket 04). Its own switch
      like every other part: whether a doctor is told that somebody stopped
      dilating is the person's to decide before the page is printed. */
  finishedAreas: boolean;
}

export type ClinicianDossierInclusionKey = keyof ClinicianDossierInclusion;

export const CLINICIAN_DOSSIER_INCLUSION_KEYS: readonly ClinicianDossierInclusionKey[] = [
  'demographics',
  'regimen',
  'exposure',
  'labs',
  'sideEffects',
  'cycleEvents',
  'appointmentPrep',
  'procedures',
  'finishedAreas'
] as const;

export const DEFAULT_CLINICIAN_DOSSIER_INCLUSION: ClinicianDossierInclusion = {
  demographics: true,
  regimen: true,
  exposure: true,
  labs: true,
  sideEffects: true,
  cycleEvents: true,
  appointmentPrep: true,
  procedures: true,
  finishedAreas: true
};

export interface ClinicianDossierRegimenData {
  current: RegimenEpisode[];
  history: RegimenEpisode[];
  doses: DoseEvent[];
}

export interface ClinicianDossier {
  fromEpochDay: number;
  toEpochDay: number;
  generatedAtEpochDay: number;
  demographics: PatientDemographics | null;
  regimen: ClinicianDossierRegimenData | null;
  exposure: ExposureCounters | null;
  labs: LabResult[] | null;
  sideEffects: SideEffect[] | null;
  cycleEvents: CycleEvent[] | null;
  appointmentPrep: ChecklistItem[] | null;
  procedures: ClinicianSummaryProcedure[] | null;
  finishedAreas: ClinicianSummaryFinishedArea[] | null;
  inclusion: ClinicianDossierInclusion;
}

export interface AssembleClinicianDossierParams {
  fromEpochDay: number;
  toEpochDay: number;
  generatedAtEpochDay?: number;
  demographics?: Partial<PatientDemographics>;
  inclusion?: Partial<ClinicianDossierInclusion>;
  /** Drugs left out of the regimen, dose-history and exposure sections
      (phase 8 features ticket 39, ADR-0031) - a printing choice about this
      visit, not portable journal data (ADR-0003). Defaults to none. */
  excludedDrugs?: ReadonlySet<string>;
}

/** Every distinct drug name across every regimen episode the person has
    ever logged, active or past - what the drug-inclusion toggle on the
    range sheet lists (phase 8 features ticket 39). Unbounded rather than
    scoped to whatever range a dossier itself reads for: the toggle is a
    device preference set once, not a per-print control, so a drug outside
    today's chosen range still gets a switch. */
export function regimenDrugNames(episodes: readonly RegimenEpisode[]): string[] {
  return [...new Set(episodes.map((episode) => episode.drug))].sort((a, b) => a.localeCompare(b));
}

/** Assembles all requested sections for the given range into a structured
    clinical dossier. Unselected sections are omitted as null. */
export async function assembleClinicianDossier(
  journal: Journal,
  params: AssembleClinicianDossierParams
): Promise<ClinicianDossier> {
  const { fromEpochDay, toEpochDay } = params;
  const generatedAtEpochDay = params.generatedAtEpochDay ?? todayEpochDay();
  const inclusion: ClinicianDossierInclusion = {
    ...DEFAULT_CLINICIAN_DOSSIER_INCLUSION,
    ...params.inclusion
  };

  // Base summary reads through the ADR-0031 registered clinicianSummary area
  const summary = await journal.clinicianSummary.getSummary(fromEpochDay, toEpochDay, params.excludedDrugs);

  // Demographics: only committed values. An active pronoun tryout is by
  // definition not yet adopted, so it never fills this field - a clinical
  // document is not the place for an in-progress experiment.
  let demographics: PatientDemographics | null = null;
  if (inclusion.demographics) {
    demographics = {
      name: params.demographics?.name ?? '',
      pronouns: params.demographics?.pronouns ?? null,
      dob: params.demographics?.dob ?? null
    };
  }

  // Regimen & Doses
  let regimenData: ClinicianDossierRegimenData | null = null;
  if (inclusion.regimen) {
    const history = summary.regimenEpisodes;
    const current = history.filter((episode) => spanCoversDay(episode, toEpochDay));

    regimenData = {
      current,
      history,
      doses: summary.doses
    };
  }

  // Exposure
  const exposure: ExposureCounters | null = inclusion.exposure ? summary.exposure : null;

  // Labs
  const labs: LabResult[] | null = inclusion.labs ? summary.labResults : null;

  // Side Effects
  const sideEffects: SideEffect[] | null = inclusion.sideEffects ? summary.sideEffects : null;

  // Cycle Events
  let cycleEvents: CycleEvent[] | null = null;
  if (inclusion.cycleEvents) {
    cycleEvents = await journal.cycleEvents.getCycleEventsInRange(fromEpochDay, toEpochDay);
  }

  // Appointment Prep Items
  const appointmentPrep: ChecklistItem[] | null = inclusion.appointmentPrep
    ? summary.appointmentPrepItems
    : null;

  // Procedures
  const procedures: ClinicianSummaryProcedure[] | null = inclusion.procedures
    ? summary.procedures
    : null;

  // Streams the person has finished, and when
  const finishedAreas: ClinicianSummaryFinishedArea[] | null = inclusion.finishedAreas
    ? summary.finishedAreas
    : null;

  return {
    fromEpochDay,
    toEpochDay,
    generatedAtEpochDay,
    demographics,
    regimen: regimenData,
    exposure,
    labs,
    sideEffects,
    cycleEvents,
    appointmentPrep,
    procedures,
    finishedAreas,
    inclusion
  };
}

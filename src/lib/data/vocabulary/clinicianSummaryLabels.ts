/* The wording of the clinician-summary dossier's parts (phase 5 ticket 06,
   ADR-0031), here rather than in the registry for the reason its neighbours
   give: the wording speaks paraglide, and nothing the Node tier touches may
   import that (ADR-0016).

   A full Record over the inclusion keys: adding a part without a name is a
   typecheck failure rather than a raw key in a control. */

import { m } from '$lib/paraglide/messages';
import type { ClinicianDossierInclusionKey } from '$lib/data/export/clinicianSummaryData';

const DOSSIER_PART_NAME: Record<ClinicianDossierInclusionKey, () => string> = {
  demographics: m.clinician_summary_part_demographics,
  regimen: m.clinician_summary_part_regimen,
  exposure: m.clinician_summary_part_exposure,
  labs: m.clinician_summary_part_labs,
  sideEffects: m.clinician_summary_part_side_effects,
  cycleEvents: m.clinician_summary_part_cycle_events,
  appointmentPrep: m.clinician_summary_part_appointment_prep,
  procedures: m.clinician_summary_part_procedures,
  finishedAreas: m.clinician_summary_part_finished_areas
};

/** What a dossier section is called in inclusion controls. */
export const clinicianDossierPartName = (key: ClinicianDossierInclusionKey): string => DOSSIER_PART_NAME[key]();


/* What each part of the clinician summary is called: one name per registered section, used
   as the heading it prints under, its table's label and its include switch. Here rather
   than in the registry for the reason its neighbours give: the wording speaks paraglide,
   and nothing the Node tier touches may import that.

   A full Record over the section keys: registering a part without a name is a typecheck
   failure rather than a raw key on the page. */

import { m } from '$lib/paraglide/messages';
import type { ClinicianSummarySectionKey } from '$lib/data/journal/clinicianSummary';

const SECTION_NAME: Record<ClinicianSummarySectionKey, () => string> = {
  demographics: m.clinician_summary_section_demographics,
  regimen: m.clinician_summary_section_regimen,
  exposure: m.clinician_summary_section_exposure,
  labs: m.clinician_summary_section_labs,
  sideEffects: m.clinician_summary_section_side_effects,
  personalEffects: m.clinician_summary_section_personal_effects,
  cycleEvents: m.clinician_summary_section_cycle_events,
  appointmentPrep: m.appointment_prep_title,
  procedures: m.clinician_summary_section_procedures,
  finishedAreas: m.clinician_summary_section_finished_areas
};

/** What a summary section is called, on paper and on its switch. */
export const clinicianSummarySectionName = (key: ClinicianSummarySectionKey): string => SECTION_NAME[key]();

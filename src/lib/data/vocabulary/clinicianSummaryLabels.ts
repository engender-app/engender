/* The heading each clinician-summary section prints under (phase 5 ticket
   06, ADR-0031), here rather than in the registry for the reason its
   neighbours give: the wording speaks paraglide, and nothing the Node tier
   touches may import that (ADR-0016). clinicianSummary.ts holds the keys
   and the reads; this is where they get their words.

   Every heading is one the section's own screen already uses, so a printed
   summary and the screen a reader compares it against say the same thing.

   A full Record over the section keys: registering a section without giving
   it a heading is a typecheck failure rather than a raw key on a page handed
   to a doctor. */

import { m } from '$lib/paraglide/messages';
import type { ClinicianSummarySectionKey } from '$lib/data/journal/clinicianSummary';

const SECTION_TITLE: Record<ClinicianSummarySectionKey, () => string> = {
  regimenEpisodes: m.regimen,
  doses: m.doses,
  labResults: m.lab_results,
  exposure: m.exposure_title,
  sideEffects: m.side_effects,
  appointmentPrepItems: m.appointment_prep_title
};

/** What a section prints as its heading. */
export const clinicianSummarySectionTitle = (key: ClinicianSummarySectionKey): string => SECTION_TITLE[key]();

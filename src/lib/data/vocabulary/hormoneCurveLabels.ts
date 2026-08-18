/* Display wording for the hormone curve's closed vocabulary (phase 4 ticket
   10), here rather than beside the model for the reason doseLabels.ts gives:
   the wording speaks paraglide and nothing the Node tier imports may
   (ADR-0016). hormoneEster.ts holds the vocabulary and stays free of it.

   Typed against the union derived from INJECTABLE_ESTERS, the rule labels.ts
   sets out: adding an ester without adding its message is a typecheck
   failure rather than a raw key on screen.

   One message per ester rather than "estradiol" plus an ester word, because
   Polish puts the ester first and inflects the drug after it ("walerianian
   estradiolu"), so a "{drug} {ester}" template would be wrong in every
   Polish name. */

import { m } from '$lib/paraglide/messages';
import type { InjectableEster } from '$lib/data/hormoneEster';

/** The same shape labels.ts declares, so a message that later takes inputs or
    a locale override still fits this record. */
type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

const ESTER_LABELS: Record<InjectableEster, Message> = {
  benzoate: m.curve_ester_benzoate,
  valerate: m.curve_ester_valerate,
  cypionate: m.curve_ester_cypionate,
  enanthate: m.curve_ester_enanthate,
  'polyestradiol-phosphate': m.curve_ester_polyestradiol_phosphate,
  undecylate: m.curve_ester_undecylate
};

export const esterLabel = (ester: InjectableEster): string => ESTER_LABELS[ester]();

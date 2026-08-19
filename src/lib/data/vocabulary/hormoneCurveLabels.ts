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
import type { CurveDrug } from '$lib/data/hormoneDrug';
import type { InjectableEster } from '$lib/data/hormoneEster';
import type { QualitativeCurveKey, QualitativeRoute } from '$lib/data/hormoneCurveQualitative';
import { routeLabel } from './doseLabels';

/** The same shape labels.ts declares, so a message that later takes inputs or
    a locale override still fits this record. */
type Message = (inputs?: {}, options?: { locale?: 'en' | 'pl' }) => string;

const ESTER_LABELS: Record<InjectableEster, Message> = {
  benzoate: m.curve_ester_benzoate,
  valerate: m.curve_ester_valerate,
  cypionate: m.curve_ester_cypionate,
  enanthate: m.curve_ester_enanthate
};

export const esterLabel = (ester: InjectableEster): string => ESTER_LABELS[ester]();

/** The wording for each hormone-and-route pair the qualitative curve draws
    (phase 5 ticket 01). One message per pair rather than a "{drug} {route}"
    template, for exactly the reason the ester labels above are: the Polish
    route words are adverbs ("doustnie", "podjęzykowo"), so pairing one with a
    drug name would be wrong in every Polish label. "Estradiol doustny" is an
    adjective agreeing with the drug, which a template cannot produce.

    Typed against QualitativeCurveKey, which is derived from
    QUALITATIVE_ROUTES_BY_DRUG - so giving a hormone a new route without giving
    the pair a message is a typecheck failure rather than a raw key on screen.
    The Partial half of the type is what lets the lookup below be total: it
    takes any drug and route a curve could carry, while the Record half still
    demands every pair that actually ships. */
const QUALITATIVE_LABELS: Record<QualitativeCurveKey, Message> &
  Partial<Record<`${CurveDrug}:${QualitativeRoute}`, Message>> = {
  'estradiol:oral': m.curve_qual_estradiol_oral,
  'estradiol:sublingual': m.curve_qual_estradiol_sublingual,
  'estradiol:patch': m.curve_qual_estradiol_patch,
  'estradiol:gel': m.curve_qual_estradiol_gel,
  'testosterone:gel': m.curve_qual_testosterone_gel
};

/** What one qualitative curve is called. Falls back to the bare route wording
    for a pair with no message, which the type above makes unreachable for any
    pair the model can actually produce. */
export function qualitativeCurveLabel(drug: CurveDrug, route: QualitativeRoute): string {
  const message = QUALITATIVE_LABELS[`${drug}:${route}`];
  return message ? message() : routeLabel(route);
}

/** Just the hormone's name, for the places that name one without naming a
    route - the per-hormone scale-factor status lines. */
const DRUG_LABELS: Record<CurveDrug, Message> = {
  estradiol: m.curve_drug_estradiol,
  testosterone: m.curve_drug_testosterone
};

export const curveDrugLabel = (drug: CurveDrug): string => DRUG_LABELS[drug]();

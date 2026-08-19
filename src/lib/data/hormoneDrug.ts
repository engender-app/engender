/* Which of the two hormones a regimen episode's curve is of (phase 5 ticket
   01). Pure, above the journal seam and free of paraglide (ADR-0016), like
   the two ester vocabularies it sits between.

   Both curve kinds need this same question answered and neither ester
   vocabulary can answer it: hormoneEster.ts knows estradiol and
   hormoneTestosteroneEster.ts knows testosterone, and the point of keeping
   them apart is that neither reads the other's names. This is the one place
   that asks both, for the callers that have to route a dose to one hormone or
   the other before any ester or route matters.

   A drug is deliberately not the same thing as an ester here. The
   qualitative routes have no ester to read at all (CONTEXT: "Qualitative
   curve"), so the drug is the whole answer for them. */

import { baseUnitFor, type PreferredUnitAnalyte } from './labs/units';
import { isEstradiolDrug } from './hormoneEster';
import { isTestosteroneDrug } from './hormoneTestosteroneEster';

/** The hormones this app draws a curve of. These are also the analyte names
    ADR-0026's allowlist uses, which is not a coincidence worth hiding: a
    curve's analyte is the drug it models, so the same string asks the allowlist
    for a conversion and names the drug. The `satisfies` pins that claim rather
    than leaving it to the comment - a curve drug the allowlist does not measure
    is a typecheck failure. */
export const CURVE_DRUGS = ['estradiol', 'testosterone'] as const satisfies readonly PreferredUnitAnalyte[];

export type CurveDrug = (typeof CURVE_DRUGS)[number];

/** The unit a hormone's curve is drawn in - the unit its published parameters
    were published in, not a unit anyone chose here. Read from ADR-0026's
    allowlist rather than restated, so there is one place saying what estradiol
    is measured in; that is also what lets a modelled value convert for display
    exactly the way one of the user's own results does. The `satisfies` above is
    what guarantees this can be asked at all: every curve drug is an analyte the
    allowlist knows. */
export function curveUnit(drug: CurveDrug): string {
  return baseUnitFor(drug);
}

/** Which hormone `drug` names, or null when it is neither and there is
    nothing to draw. Estradiol is asked first, so a field that loosely names
    both has a defined answer rather than one that depends on word order -
    one episode is one drug, and either answer stays inside a hormone this app
    has parameters for. */
export function resolveCurveDrug(drug: string): CurveDrug | null {
  if (isEstradiolDrug(drug)) return 'estradiol';
  if (isTestosteroneDrug(drug)) return 'testosterone';
  return null;
}

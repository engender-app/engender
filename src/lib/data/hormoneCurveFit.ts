/* The two guards the hormone curve needs before any pharmacokinetics happen
   (phase 4 ticket 10): what a logged dose is in milligrams, and how far the
   population-level curve has to move to sit on the user's own lab points.

   Pure, above the journal seam, no paraglide (ADR-0016), the same shape as
   the other derived modules beside it. Split out from hormoneCurve.ts
   because neither of these knows anything about an ester or a compartment:
   they are arithmetic over what was logged. */

/** Units this app can read as milligrams. A dose amount is native text
    (ADR-0012), so this is an allowlist and not a parser - the same
    fail-closed rule ADR-0026 applies to a lab unit. */
const MILLIGRAM_UNITS = ['mg', 'mgs', 'milligram', 'milligrams', 'miligram', 'miligramy'];

/** The dose in milligrams, or null when the unit is not one that says
    milligrams. A dose logged by volume ("0.5 mL") is the common case for
    null: the schema records no concentration, so there is no milligram
    figure to be had and inventing one from a typical ampoule strength would
    be a guess drawn as a curve. */
export function doseMilligrams(dose: number, doseUnit: string): number | null {
  if (!Number.isFinite(dose) || dose <= 0) return null;
  return MILLIGRAM_UNITS.includes(doseUnit.trim().toLowerCase()) ? dose : null;
}

/** One of the user's own lab results beside what the population-level curve
    said for that same moment. */
export interface FitPair {
  /** The band's midpoint at the draw, in the model's own unit. */
  modelled: number;
  /** The lab result, converted to the model's unit. */
  observed: number;
}

/** How much to multiply the whole curve by so it sits as close as possible
    to the user's own points: least squares through the origin, which is the
    one-parameter fit a scale factor is. Null when there is nothing to fit
    against, which is a different answer from 1 - one says the curve was
    never fitted, the other says it was and the user matches the population.

    Deliberately not a refit of the per-ester compartment parameters. Those
    are the literature's (hormoneCurveModels.ts) and stay as published; this
    moves the amplitude and nothing else. */
export function fitScaleFactor(pairs: readonly FitPair[]): number | null {
  let numerator = 0;
  let denominator = 0;

  for (const { modelled, observed } of pairs) {
    if (!Number.isFinite(modelled) || !Number.isFinite(observed)) continue;
    if (modelled <= 0 || observed <= 0) continue;
    numerator += modelled * observed;
    denominator += modelled * modelled;
  }

  return denominator > 0 ? numerator / denominator : null;
}

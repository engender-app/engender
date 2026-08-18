/* The qualitative-shape hormone curve for oral, sublingual, patch and gel
   estradiol (phase 4 ticket 11, CONTEXT: "Qualitative curve"). Pure, above
   the journal seam and free of paraglide (ADR-0016), the same shape as
   hormoneCurve.ts beside it.

   Ticket 10's three-compartment model exists because estrannaise.js
   publishes a posterior fit for each injectable ester - a real measure of
   how a population's levels actually move. No comparable published fit
   exists for these four routes in the same form, so there is nothing to fit
   here and this file does not pretend otherwise: each route gets one fixed,
   invented rise/plateau/fall shape, scaled by dose and superposed across the
   dose log the same way an injection is. The shape is illustrative only -
   ordered by well-known relative pharmacology (oral estradiol is cut down by
   first-pass metabolism and clears faster than a transdermal route; a patch
   is worn for days at a time; sublingual bypasses first-pass and both rises
   and falls quicker than swallowing the same tablet would) but invented for
   the purpose, not read off a study. Nothing here is a band and nothing here
   has an uncertainty width, because there is no posterior to draw one from.

   Two things this deliberately does not do, mirroring hormoneCurve.ts's own
   list. It never produces a range - QualitativeCurvePoint has no `lower`/
   `upper` to add one to. And it never claims a route's shape came from
   anywhere but this file: there is no source line for it on screen, unlike
   the injectable model's estrannaise.js credit. */

import { doseMilligrams } from './hormoneCurveFit';
import { isEstradiolDrug } from './hormoneEster';
import { fractionalEpochDay } from './hormoneCurve';
import { resolveEpisodeAt } from './regimenEpisode';
import type { DoseEvent, RegimenEpisode } from './types';

/** The routes ticket 11 draws a qualitative curve for. Injectable routes
    (im, sc) are ticket 10's and excluded here the same way this ticket's own
    doses are excluded from esterCurves (hormoneCurve.test.ts). */
export const QUALITATIVE_ROUTES = ['oral', 'sublingual', 'patch', 'gel'] as const;

export type QualitativeRoute = (typeof QUALITATIVE_ROUTES)[number];

interface ShapeParams {
  riseHours: number;
  plateauHours: number;
  fallHours: number;
}

/** One invented trapezoid per route: a linear rise to a peak of 1 per
    milligram, a plateau at that peak, then a linear fall back to zero.
    Ordered by relative pharmacology, not fitted to anything:

    - oral: rapid rise and a short plateau, then a fall over the rest of the
      day - first-pass metabolism cuts a swallowed dose down quickly.
    - sublingual: faster rise and fall than oral, because it bypasses
      first-pass metabolism and is typically redosed more than once a day.
    - patch: the slowest of the four to rise and the longest to plateau - a
      transdermal depot that is meant to be worn for days between changes.
    - gel: rises a little slower than sublingual, plateaus while it
      is being absorbed off the skin over the day, then fades by the next
      application. */
const SHAPES: Record<QualitativeRoute, ShapeParams> = {
  oral: { riseHours: 2, plateauHours: 3, fallHours: 15 },
  sublingual: { riseHours: 1, plateauHours: 2, fallHours: 9 },
  patch: { riseHours: 24, plateauHours: 72, fallHours: 24 },
  gel: { riseHours: 3, plateauHours: 6, fallHours: 15 }
};

/** One sampled slice of the curve. Two fields and no third: a `lower` or
    `upper` here is how the band this ticket rules out would get built by
    accident later. */
export interface QualitativeCurvePoint {
  /** Fractional epoch day, the same axis hormoneCurve.ts's band uses. */
  day: number;
  value: number;
}

export interface QualitativeCurve {
  route: QualitativeRoute;
  points: QualitativeCurvePoint[];
  /** How many logged doses went into it. */
  doseCount: number;
}

export interface QualitativeCurves {
  curves: QualitativeCurve[];
  /** Doses left out because their amount was not in milligrams - a patch or
      gel logged as "1 application" as often as an injection logged by
      volume. Counted so a screen can say the curve is missing doses rather
      than quietly drawing a low one. */
  dosesWithoutMilligrams: number;
}

export interface QualitativeCurveInput {
  doses: readonly DoseEvent[];
  episodes: readonly RegimenEpisode[];
  fromEpochDay: number;
  toEpochDay: number;
}

const SHAPE_SAMPLES = 361;

function isQualitativeRoute(route: DoseEvent['route']): route is QualitativeRoute {
  return route === 'oral' || route === 'sublingual' || route === 'patch' || route === 'gel';
}

/** The trapezoid's own value, in shape units per milligram, `hoursSince` the
    dose. Zero before it and zero well after the fall finishes. */
function singleDoseShape(milligrams: number, { riseHours, plateauHours, fallHours }: ShapeParams, hoursSince: number): number {
  if (hoursSince < 0) return 0;
  if (hoursSince < riseHours) return milligrams * (hoursSince / riseHours);
  if (hoursSince < riseHours + plateauHours) return milligrams;
  const intoFall = hoursSince - riseHours - plateauHours;
  if (intoFall < fallHours) return milligrams * (1 - intoFall / fallHours);
  return 0;
}

/** Five half-widths of a route's own shape - past that a dose has fully
    fallen back to zero and cannot still be contributing. The basis for
    QUALITATIVE_LOOKBACK_DAYS below. */
function reachDays(shape: ShapeParams): number {
  return (shape.riseHours + shape.plateauHours + shape.fallHours) / 24;
}

/** How far back the dose log has to be read for the curve over a window to
    be right, the same reason hormoneCurve.ts reads CURVE_LOOKBACK_DAYS back:
    a dose before the window opens is most of what its first hours are made
    of. Far shorter than the injectable model's, because these routes act
    over hours and days rather than weeks. */
export const QUALITATIVE_LOOKBACK_DAYS = Math.ceil(Math.max(...Object.values(SHAPES).map(reachDays)));

function curveFor(
  shape: ShapeParams,
  allDoses: readonly { day: number; milligrams: number }[],
  fromEpochDay: number,
  toEpochDay: number
): QualitativeCurvePoint[] {
  const reach = reachDays(shape);
  const doses = allDoses.filter((dose) => dose.day >= fromEpochDay - reach);

  /* Through the end of the last day, matching hormoneCurve.ts's own band. */
  const end = toEpochDay + 1;
  const step = (end - fromEpochDay) / (SHAPE_SAMPLES - 1);
  const days = Array.from({ length: SHAPE_SAMPLES }, (_, i) => (i === SHAPE_SAMPLES - 1 ? end : fromEpochDay + i * step));

  return days.map((day) => ({
    day,
    value: doses.reduce((sum, dose) => sum + singleDoseShape(dose.milligrams, shape, (day - dose.day) * 24), 0)
  }));
}

/** One qualitative curve per route dosed in `[fromEpochDay, toEpochDay]`, in
    QUALITATIVE_ROUTES order. Each dose resolves its own episode for its
    drug, the same way an injection does (hormoneCurve.ts). */
export function qualitativeCurves(input: QualitativeCurveInput): QualitativeCurves {
  const { doses, episodes, fromEpochDay, toEpochDay } = input;

  const dosesByRoute = new Map<QualitativeRoute, { day: number; milligrams: number }[]>();
  let dosesWithoutMilligrams = 0;

  for (const dose of doses) {
    if (!isQualitativeRoute(dose.route)) continue;
    if (dose.status === 'skipped') continue;

    const episode = resolveEpisodeAt(episodes, dose.timestamp);
    if (!episode || !isEstradiolDrug(episode.drug)) continue;

    const milligrams = doseMilligrams(dose.dose, dose.doseUnit);
    if (milligrams === null) {
      dosesWithoutMilligrams += 1;
      continue;
    }

    const entry = { day: fractionalEpochDay(dose.timestamp), milligrams };
    const existing = dosesByRoute.get(dose.route);
    if (existing) existing.push(entry);
    else dosesByRoute.set(dose.route, [entry]);
  }

  const curves = QUALITATIVE_ROUTES.filter((route) => dosesByRoute.has(route)).map((route) => ({
    route,
    points: curveFor(SHAPES[route], dosesByRoute.get(route)!, fromEpochDay, toEpochDay),
    doseCount: dosesByRoute.get(route)!.length
  }));

  return { curves, dosesWithoutMilligrams };
}

/** The same curves with every value multiplied by `factor` - the per-user
    scale factor from fitScaleFactorToLabs, applied after the fact for the
    same reason scaleCurves applies it after the fact in hormoneCurve.ts: the
    factor is fitted against the unscaled curve, and a multiply over the
    finished points is the plainest statement that the shape itself was not
    touched. */
export function scaleQualitativeCurves(curves: readonly QualitativeCurve[], factor: number): QualitativeCurve[] {
  return curves.map((curve) => ({
    ...curve,
    points: curve.points.map((point) => ({ day: point.day, value: point.value * factor }))
  }));
}

/** The curve's own value at `day`, interpolated between the two samples
    either side of it, or null when `day` falls outside it. Used both for
    fitting (journal/hormoneCurveQualitative.ts) and for the screen's
    reading of where the curve has got to - unlike bandMidpointAt, drawing a
    line through these values is exactly what this curve is. */
export function qualitativeValueAt(curve: QualitativeCurve, day: number): number | null {
  const points = curve.points;
  if (points.length === 0 || day < points[0].day || day > points[points.length - 1].day) return null;

  const next = points.findIndex((point) => point.day >= day);
  if (next <= 0) return points[Math.max(next, 0)].value;

  const before = points[next - 1];
  const after = points[next];
  const span = after.day - before.day;
  if (span <= 0) return after.value;
  return before.value + (after.value - before.value) * ((day - before.day) / span);
}

/** The last sample of the window - what the screen shows when no result of
    the user's own is picked out. */
export function latestQualitativeValue(curve: QualitativeCurve): number | null {
  return curve.points[curve.points.length - 1]?.value ?? null;
}

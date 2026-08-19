/* The qualitative-shape hormone curve for the non-injectable routes (phase 4
   ticket 11, widened to testosterone by phase 5 ticket 01; CONTEXT:
   "Qualitative curve"). Pure, above the journal seam and free of paraglide
   (ADR-0016), the same shape as hormoneCurve.ts beside it.

   One call draws one hormone. Estradiol gets all four routes; testosterone
   gets gel, on the same invented shape, and nothing else
   (QUALITATIVE_ROUTES_BY_DRUG says why).

   Ticket 10's three-compartment model exists because estrannaise.js
   publishes a posterior fit for each injectable ester - a real measure of
   how a population's levels actually move. No comparable published fit
   exists for these routes in the same form, so there is nothing to fit
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
import { resolveCurveDrug, type CurveDrug } from './hormoneDrug';
import { fractionalEpochDay } from './hormoneCurve';
import { resolveEpisodeAt } from './regimenEpisode';
import type { DoseEvent, RegimenEpisode } from './types';

/** The routes ticket 11 draws a qualitative curve for. Injectable routes
    (im, sc) are ticket 10's and excluded here the same way this ticket's own
    doses are excluded from esterCurves (hormoneCurve.test.ts). */
export const QUALITATIVE_ROUTES = ['oral', 'sublingual', 'patch', 'gel'] as const;

export type QualitativeRoute = (typeof QUALITATIVE_ROUTES)[number];

/** Which routes each hormone actually gets a shape for (phase 5 ticket 01).
    Not every route belongs to both drugs, and the shapes below are the reason:
    each one was argued from a particular route's relative pharmacology, so
    lending it to a route that behaves differently would draw something wrong
    rather than something rough.

    Testosterone gets gel and nothing else. A testosterone gel is applied once
    a day and absorbed off the skin over that day, which is the same story the
    gel shape was invented for, so it reuses that shape unchanged.

    The other three are not testosterone's. Oral testosterone undecanoate is a
    lymphatic-absorption story with a food dependency no trapezoid here
    describes - meal fat alone moves its average level 2.4-fold - and
    sublingual testosterone is not a route in use. A testosterone patch is
    changed daily where this patch shape is a multi-day depot, so borrowing it
    would draw something wrong rather than something rough. That last one is a
    scope decision and not a shortage of evidence: the 2011 Androderm label
    (FDA NDA 020489 s025, a US government work) publishes an observed mean
    concentration-time table good enough to argue a daily shape from, and a
    later ticket wanting a testosterone patch curve should start there rather
    than from this table. Adding it means a shape per hormone and route, not
    per route as here.

    Injectable testosterone gets nothing at all, which is ticket 01's own
    answer rather than an omission: no published testosterone fit clears the
    band bar (hormoneTestosteroneEster.ts argues each ester), and the ticket
    reserves this curve for the non-injectable routes. So an injection of
    testosterone resolves to no curve rather than to a shape standing in for a
    band, and hormoneTestosteroneEster.test.ts pins that. */
export const QUALITATIVE_ROUTES_BY_DRUG = {
  estradiol: ['oral', 'sublingual', 'patch', 'gel'],
  testosterone: ['gel']
} as const satisfies Record<CurveDrug, readonly QualitativeRoute[]>;

/** The hormone-and-route pairs that actually get drawn, as one union. Derived
    from the table above rather than listed again, so a route added or removed
    there carries through - which is what makes the wording record in
    vocabulary/hormoneCurveLabels.ts fail to typecheck when a new pair has no
    message, the rule labels.ts sets out. */
export type QualitativeCurveKey = {
  [D in CurveDrug]: `${D}:${(typeof QUALITATIVE_ROUTES_BY_DRUG)[D][number]}`;
}[CurveDrug];

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
      application. The one shape both hormones use: a testosterone gel is
      applied once a day and absorbed off the skin over that day too, so the
      story this trapezoid was invented for is the same one. It carries no
      drug-specific claim to get wrong either way - it is unitless until a
      per-user scale factor calibrates it against that reader's own results
      for that hormone. */
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
  /** Which hormone to draw. One call answers for one drug, because almost
      everything downstream of a curve differs between the two: the unit its
      height means anything in, the analyte a scale factor is fitted against,
      the axis two curves may share. Asking per drug keeps each of those a
      single unambiguous value instead of a pair the caller has to keep
      straight. */
  drug: CurveDrug;
  doses: readonly DoseEvent[];
  episodes: readonly RegimenEpisode[];
  fromEpochDay: number;
  toEpochDay: number;
}

const SHAPE_SAMPLES = 361;

function isQualitativeRoute(route: DoseEvent['route']): route is QualitativeRoute {
  return (QUALITATIVE_ROUTES as readonly string[]).includes(route);
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
  const { drug, doses, episodes, fromEpochDay, toEpochDay } = input;
  /* Widened from the literal tuple the table declares: the tuples are there so
     QualitativeCurveKey can be derived from them, and nothing here needs to
     know which drug's list this is. */
  const routes: readonly QualitativeRoute[] = QUALITATIVE_ROUTES_BY_DRUG[drug];

  const dosesByRoute = new Map<QualitativeRoute, { day: number; milligrams: number }[]>();
  let dosesWithoutMilligrams = 0;

  for (const dose of doses) {
    if (!isQualitativeRoute(dose.route)) continue;
    if (dose.status === 'skipped') continue;

    const episode = resolveEpisodeAt(episodes, dose.timestamp);
    if (!episode) continue;
    /* The asked-for hormone and no other. A gel dose of one drug must never
       add height to the other's gel curve, which is the whole reason the two
       vocabularies are kept apart. */
    if (resolveCurveDrug(episode.drug) !== drug) continue;
    if (!routes.includes(dose.route)) continue;

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

  const curves = routes
    .filter((route) => dosesByRoute.has(route))
    .map((route) => ({
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

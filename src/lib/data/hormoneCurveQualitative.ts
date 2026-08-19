/* The qualitative-shape hormone curve (phase 4 ticket 11, widened to
   testosterone by phase 5 ticket 01; CONTEXT: "Qualitative curve"). Pure, above
   the journal seam and free of paraglide (ADR-0016), the same shape as
   hormoneCurve.ts beside it.

   One call draws one hormone. Estradiol gets its four non-injectable routes,
   because its injections have a published posterior and get the fitted band
   instead; testosterone gets injections, patch and gel, because none of its
   esters has a fit that band could rest on. QUALITATIVE_CURVE_KEYS is the whole
   list and says why for each.

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
import { resolveInjectableEster } from './hormoneEster';
import { resolveTestosteroneEster } from './hormoneTestosteroneEster';
import { fractionalEpochDay } from './hormoneCurve';
import { resolveEpisodeAt } from './regimenEpisode';
import type { DoseEvent, RegimenEpisode } from './types';

/** What each qualitative curve is a curve of (phase 5 ticket 01). One closed
    vocabulary, because a route alone stopped identifying a curve once
    testosterone arrived: the same route belongs to both hormones, and injected
    testosterone picks its shape by ester rather than by route.

    So a key is a hormone plus whichever of the two actually decides the shape.
    For every non-injectable route that is the route. For injected testosterone
    it is the ester, and one key covers both esters that share a shape
    (INJECTABLE_TESTOSTERONE_ESTERS) rather than one key each, because they are
    one shape and a second key would imply a distinction the shape does not
    make.

    Estradiol has no `injected` key and never will: its injections have a real
    published posterior and get hormoneCurve.ts's fitted band. Testosterone's do
    not, which is the whole reason its injections are here instead. */
export const QUALITATIVE_CURVE_KEYS = [
  'estradiol:oral',
  'estradiol:sublingual',
  'estradiol:patch',
  'estradiol:gel',
  'testosterone:injected',
  'testosterone:patch',
  'testosterone:gel'
] as const;

export type QualitativeCurveKey = (typeof QUALITATIVE_CURVE_KEYS)[number];

/** Which hormone a key belongs to, read off the key rather than stored beside
    it so the two cannot disagree. */
export function drugOfKey(key: QualitativeCurveKey): CurveDrug {
  return key.split(':')[0] as CurveDrug;
}

interface ShapeParams {
  riseHours: number;
  plateauHours: number;
  fallHours: number;
}

/** One trapezoid per key: a linear rise to a peak of 1 per milligram, a plateau
    at that peak, then a linear fall back to zero.

    The four estradiol shapes are invented, ordered by relative pharmacology and
    not fitted to anything:

    - oral: rapid rise and a short plateau, then a fall over the rest of the
      day - first-pass metabolism cuts a swallowed dose down quickly.
    - sublingual: faster rise and fall than oral, because it bypasses
      first-pass metabolism and is typically redosed more than once a day.
    - patch: the slowest of the four to rise and the longest to plateau - a
      transdermal depot that is meant to be worn for days between changes.
    - gel: rises a little slower than sublingual, plateaus while it is being
      absorbed off the skin over the day, then fades by the next application.

    Testosterone's three are anchored to published observed profiles, which is
    better provenance than the estradiol four have but still not a fit: an
    observed mean time course says where the shape goes, not how closely any one
    person follows it. That is the line this whole file sits on, so these stay
    single unitless lines with no width, exactly like the four above.

    - testosterone:gel reuses estradiol's gel shape unchanged. A testosterone
      gel is applied once a day and absorbed off the skin over that day, which
      is the story that trapezoid was invented for.
    - testosterone:patch is its own shape rather than estradiol's, because a
      testosterone patch is changed daily where the estradiol patch is a
      multi-day depot. Argued from the 2011 Androderm label's observed mean
      table (FDA NDA 020489 s025, a US government work): peaking around 8 to 12
      hours and still near 60% of peak when the patch comes off at 24, which is
      the 8/4/30 below.
    - testosterone:injected covers cypionate and enanthate. Argued from the
      cypionate model's own published profile (Bi 2018, cited in
      hormoneTestosteroneEster.ts): a peak a day or two after the injection and
      a decline to roughly 44% of it by day seven, which is the 36/12/216
      below. Enanthate is slower but close enough to share it, and the shape
      claims nothing numeric either way. */
const SHAPES: Record<QualitativeCurveKey, ShapeParams> = {
  'estradiol:oral': { riseHours: 2, plateauHours: 3, fallHours: 15 },
  'estradiol:sublingual': { riseHours: 1, plateauHours: 2, fallHours: 9 },
  'estradiol:patch': { riseHours: 24, plateauHours: 72, fallHours: 24 },
  'estradiol:gel': { riseHours: 3, plateauHours: 6, fallHours: 15 },
  'testosterone:injected': { riseHours: 36, plateauHours: 12, fallHours: 216 },
  'testosterone:patch': { riseHours: 8, plateauHours: 4, fallHours: 30 },
  'testosterone:gel': { riseHours: 3, plateauHours: 6, fallHours: 15 }
};

/** Which curve a dose belongs on, or null when this app draws none for it.

    Every fail-closed answer in this file funnels through here. Estradiol
    injections go to the band instead. Testosterone by mouth or under the tongue
    has no shape argued for it - oral testosterone undecanoate is a
    lymphatic-absorption story with a food dependency no trapezoid describes,
    since meal fat alone moves its average level 2.4-fold, and sublingual
    testosterone is not a route in use. A testosterone injection on an ester
    without a shape (undecanoate, a Sustanon-type blend, propionate) gets
    nothing rather than the shape of an ester that behaves differently. */
export function resolveQualitativeKey(
  episode: Pick<RegimenEpisode, 'drug' | 'ester'>,
  route: DoseEvent['route']
): QualitativeCurveKey | null {
  const drug = resolveCurveDrug(episode.drug);
  if (!drug) return null;

  if (route === 'im' || route === 'sc') {
    if (drug !== 'testosterone') return null;
    return resolveTestosteroneEster(episode) ? 'testosterone:injected' : null;
  }

  if (drug === 'estradiol') return `estradiol:${route}`;
  return route === 'gel' || route === 'patch' ? `testosterone:${route}` : null;
}

/** One sampled slice of the curve. Two fields and no third: a `lower` or
    `upper` here is how the band this ticket rules out would get built by
    accident later. */
export interface QualitativeCurvePoint {
  /** Fractional epoch day, the same axis hormoneCurve.ts's band uses. */
  day: number;
  value: number;
}

export interface QualitativeCurve {
  /** What this is a curve of. Replaces the bare route a curve carried while
      estradiol was the only drug: a route no longer identifies one. */
  key: QualitativeCurveKey;
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

/** The whole width of a shape - past that a dose has fully fallen back to zero
    and cannot still be contributing. The basis for QUALITATIVE_LOOKBACK_DAYS
    below. */
function reachDays(shape: ShapeParams): number {
  return (shape.riseHours + shape.plateauHours + shape.fallHours) / 24;
}

/** How far back the dose log has to be read for the curve over a window to
    be right, the same reason hormoneCurve.ts reads CURVE_LOOKBACK_DAYS back:
    a dose before the window opens is most of what its first hours are made
    of. Set by the widest shape, which is testosterone's injected one - the rest
    act over hours and days where an injection acts over a week and more. */
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

/** One qualitative curve per key dosed in `[fromEpochDay, toEpochDay]`, in
    QUALITATIVE_CURVE_KEYS order. Each dose resolves its own episode for its
    drug and ester, the same way an injection does (hormoneCurve.ts). */
export function qualitativeCurves(input: QualitativeCurveInput): QualitativeCurves {
  const { drug, doses, episodes, fromEpochDay, toEpochDay } = input;

  const dosesByKey = new Map<QualitativeCurveKey, { day: number; milligrams: number }[]>();
  let dosesWithoutMilligrams = 0;

  for (const dose of doses) {
    if (dose.status === 'skipped') continue;

    const episode = resolveEpisodeAt(episodes, dose.timestamp);
    if (!episode) continue;

    /* The asked-for hormone and no other. A dose of one must never add height
       to the other's curve, which is the whole reason the two ester
       vocabularies are kept apart. */
    const key = resolveQualitativeKey(episode, dose.route);
    if (!key || drugOfKey(key) !== drug) continue;

    const milligrams = doseMilligrams(dose.dose, dose.doseUnit);
    if (milligrams === null) {
      dosesWithoutMilligrams += 1;
      continue;
    }

    const entry = { day: fractionalEpochDay(dose.timestamp), milligrams };
    const existing = dosesByKey.get(key);
    if (existing) existing.push(entry);
    else dosesByKey.set(key, [entry]);
  }

  /* Ordered by the key vocabulary rather than by first use, so the cards keep
     the same order on screen however the dose log is arranged. */
  const curves = QUALITATIVE_CURVE_KEYS.filter((key) => dosesByKey.has(key)).map((key) => ({
    key,
    points: curveFor(SHAPES[key], dosesByKey.get(key)!, fromEpochDay, toEpochDay),
    doseCount: dosesByKey.get(key)!.length
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

/** How many doses in the window this app draws no curve for at all - neither
    the fitted band nor a shape.

    Deliberately drug-agnostic, unlike everything else here: the question it
    answers is about the whole screen rather than one hormone. The empty state
    needs it to tell two very different silences apart. Nothing logged yet is the
    reader's next step, and pointing them at the dose log helps. A log full of
    doses on an ester this app has no curve for is this app's limit, and the same
    invitation would be asking someone to do again what they have already done.

    Counts doses, not esters, because that is what the reader recognizes: they
    know how many injections they gave, not how many vocabularies missed. */
export function dosesWithNoCurve(input: Omit<QualitativeCurveInput, 'drug'>): number {
  const { doses, episodes, fromEpochDay, toEpochDay } = input;
  let count = 0;

  for (const dose of doses) {
    if (dose.status === 'skipped') continue;
    const day = fractionalEpochDay(dose.timestamp);
    if (day < fromEpochDay || day > toEpochDay + 1) continue;

    const episode = resolveEpisodeAt(episodes, dose.timestamp);
    if (!episode) continue;

    /* Either model drawing it is enough. The band is checked through the same
       resolver esterCurves uses, so the two cannot disagree about whether an
       estradiol injection is drawn. */
    if (resolveInjectableEster(episode) && (dose.route === 'im' || dose.route === 'sc')) continue;
    if (resolveQualitativeKey(episode, dose.route)) continue;

    count += 1;
  }

  return count;
}

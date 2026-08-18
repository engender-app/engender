/* The injectable-ester hormone curve (phase 4 ticket 10, CONTEXT: "Hormone
   curve"). Pure, above the journal seam, no clock and no paraglide
   (ADR-0016), like exposureCounters.ts beside it: the curve is recomputed
   from the dose log and the regimen episode history every time it is asked
   for and nothing about it is stored (ADR-0010).

   The model is the three-compartment first-order cascade - ester in the
   injection depot, ester in serum, estradiol in serum - whose single-dose
   solution is

     C(t) = dose * d * k1 * k2 * (  e^-k1t / ((k1-k2)(k1-k3))
                                  - e^-k2t / ((k1-k2)(k2-k3))
                                  + e^-k3t / ((k1-k3)(k2-k3)) )

   for t >= 0 and 0 before the injection. Repeated injections are plain
   superposition of shifted single-dose curves, and `dose` multiplies the
   whole thing, which is where linear dose scaling within an ester comes
   from - it is the equation's own shape, not an extra step. Parameters and
   their provenance are in hormoneCurveModels.ts.

   Two things this deliberately does not do.

   It never produces a single value for a moment in time. Every answer is a
   band, because the parameters are a posterior and not a measurement: the
   5th and 95th percentile across the 313 samples, taken over the whole
   superposed curve per sample so the band stays a set of plausible curves
   rather than an envelope of unrelated points. bandMidpointAt exists for
   the scale-factor fit and says in its own doc that it is not for drawing.

   It does not handle the case of two rate constants being equal, which
   makes the denominators above zero. The published posteriors do not go
   there: across all 1565 samples the closest two rate constants come within
   0.52% of each other, which is far from the cancellation that would need
   the limit forms. A guard that cannot fire would just be a claim that this
   was checked, so the check is written down here instead. */

import { doseMilligrams } from './hormoneCurveFit';
import { INJECTABLE_ESTERS, isHypotheticalEster, resolveInjectableEster, type InjectableEster } from './hormoneEster';
import { ESTER_POSTERIORS, type PkSample } from './hormoneCurveModels';
import { epochDayFromTimestamp, startOfDayTimestamp } from './epochDay';
import { resolveEpisodeAt } from './regimenEpisode';
import type { DoseEvent, RegimenEpisode } from './types';

/** The unit the model works in. Not a lab result's unit: a lab result keeps
    whatever was logged, and the two are reconciled where they meet
    (ADR-0026, secondaryLabValue). */
export const CURVE_UNIT = 'pg/mL';

/** The analyte this curve is of, as ADR-0026's allowlist spells it. Named
    here so the screen can ask that allowlist for a pmol/L reading of a
    modelled value without a bare 'estradiol' literal at the call site - the
    conversion is the same fixed physical factor either way, and this ticket
    adds no second path for it. */
export const CURVE_ANALYTE = 'estradiol';

/** The percentiles the band's edges are. estrannaise publishes its own
    ranges as p5/p95 (menstrualCycleData), so the band matches the source's
    own way of expressing one. */
export const BAND_PERCENTILES: readonly [number, number] = [5, 95];

/** How many points the band is sampled at, across whatever window was
    asked for. A count rather than a fixed step, so a year-long window costs
    the same as a month - at the price of smoothing the peaks, which is the
    honest trade at that zoom. At the default 90-day window this is a sample
    every six hours. */
const BAND_SAMPLES = 361;

const DAY_MS = 86400000;

/** One sampled slice of the band. Three fields and no fourth: a `value` or
    `median` here is how a single-line presentation would get built by
    accident, and this ticket rules one out. */
export interface CurveBandPoint {
  /** Fractional epoch day. */
  day: number;
  lower: number;
  upper: number;
}

export interface EsterCurve {
  ester: InjectableEster;
  /** True for undecylate, whose fit rests on so little data that it barely
      constrains anything (isHypotheticalEster). Every screen drawing this
      has to say so. */
  hypothetical: boolean;
  band: CurveBandPoint[];
  /** How many logged doses went into it. */
  doseCount: number;
}

export interface HormoneCurves {
  curves: EsterCurve[];
  /** Esters that were injected in the window but that this app has no
      parameters for - polyestradiol phosphate. Named rather than dropped, so
      a screen can say why there is no curve instead of showing nothing. */
  unmodelledEsters: InjectableEster[];
  /** Injections left out because their amount was not in milligrams, most
      often logged by volume. Counted so a screen can say the curve is
      missing doses rather than quietly drawing a low one. */
  dosesWithoutMilligrams: number;
  /** Subcutaneous injections that went into a band built from intramuscular
      parameters. Every published fit behind this model is intramuscular and
      there are none for the subcutaneous route, so those doses are drawn on
      the assumption that a depot behaves the same either way. That is an
      assumption and not a finding, so it is counted here and said on screen
      rather than left implicit. */
  subcutaneousDoses: number;
}

export interface CurveInput {
  doses: readonly DoseEvent[];
  episodes: readonly RegimenEpisode[];
  fromEpochDay: number;
  toEpochDay: number;
}

/** Where a moment falls on the curve's time axis: the epoch day it belongs
    to plus how far through that day it is. Local, because an epoch day is a
    local calendar day (ADR-0001) and a dose's timestamp is a real instant.

    Not in epochDay.ts: an epoch day there is a whole local day by
    definition, and a fractional one is a different idea that only the
    pharmacokinetics needs - hours matter to a curve and to nothing else in
    the app. Exported because the curve's own axis is the one a lab point has
    to be placed on too (journal/hormoneCurve.ts). */
export function fractionalEpochDay(timestamp: number): number {
  const day = epochDayFromTimestamp(timestamp);
  return day + (timestamp - startOfDayTimestamp(day)) / DAY_MS;
}

/** The cascade's single-dose solution, in pg/mL, milligrams in and days
    since the injection. Zero before it: nothing is in the body yet. */
function singleDose(milligrams: number, [d, k1, k2, k3]: PkSample, days: number): number {
  if (days < 0) return 0;
  return (
    milligrams *
    d *
    k1 *
    k2 *
    (Math.exp(-k1 * days) / ((k1 - k2) * (k1 - k3)) -
      Math.exp(-k2 * days) / ((k1 - k2) * (k2 - k3)) +
      Math.exp(-k3 * days) / ((k1 - k3) * (k2 - k3)))
  );
}

/** Five half-lives of a sample's slowest compartment - past that its
    contribution is under 4% of its peak and the curve has effectively
    returned to where it started. The basis for CURVE_LOOKBACK_DAYS below,
    and asserted against every published sample in hormoneCurve.test.ts. */
export function settlingDays([, k1, k2, k3]: PkSample): number {
  return (5 * Math.LN2) / Math.min(k1, k2, k3);
}

/** How far back the dose log has to be read for the curve over a window to
    be right: an injection before the window opens is most of what the
    window's first days are made of.

    A year, which is comfortably more than the four fitted esters need - the
    slowest sample any of them has settles in 63 days, and a test pins that.
    Not derived from the posteriors as a maximum, which is what it looks like
    it should be: undecylate's posterior runs out to samples whose slowest
    compartment has a half-life over three years, and taking the maximum
    across all of them asks for 6302 days of dose log to draw a 90-day chart.

    That gap is not a rounding problem, it is the thing that makes
    undecylate's curve hypothetical. Its fit rests on a handful of injections
    followed for about a fortnight, which is nothing next to an ester that
    acts for months, so almost nothing in the posterior pins its tail down -
    at the far end of it a dose given two years ago is still two-thirds of
    its own peak. A year of lookback truncates that tail. The screen already
    says the curve is hypothetical and this is one more reason it has to. */
export const CURVE_LOOKBACK_DAYS = 365;

function percentile(sorted: readonly number[], p: number): number {
  const at = ((sorted.length - 1) * p) / 100;
  const low = Math.floor(at);
  const high = Math.min(low + 1, sorted.length - 1);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

/** The band for one ester's injections: every posterior sample is run over
    the whole window as one curve, and the percentiles are taken across those
    curves. Per sample rather than per point on purpose - a person has one
    pharmacokinetic profile, not a fresh one every six hours, so the band's
    edges have to be made of whole plausible curves. */
function bandFor(
  samples: readonly PkSample[],
  allInjections: readonly { day: number; milligrams: number }[],
  fromEpochDay: number,
  toEpochDay: number
): CurveBandPoint[] {
  /* Only the injections that can still be contributing. The caller hands
     over a year of them (CURVE_LOOKBACK_DAYS) because it cannot know the
     ester before it reads them, but a valerate injection is spent in twenty
     days, and every one older than that would otherwise cost 313 evaluations
     per sampled point to add nothing. Measured: this is the difference
     between roughly 250ms and 60ms for a 90-day window of weekly injections,
     on a desktop - and the phone this runs on is several times slower.
     Conservative on purpose: the slowest sample in the posterior sets the
     reach, not the typical one. */
  const reach = Math.max(...samples.map(settlingDays));
  const injections = allInjections.filter((injection) => injection.day >= fromEpochDay - reach);

  /* Through the END of the last day, not up to its midnight. An epoch day is
     a whole local day (ADR-0001), so a band that stopped at `toEpochDay`
     stopped at 00:00 this morning: an injection given today would have
     contributed nothing to a chart that still drew a curve, and the readout
     would have been labelled with today's date for a value at midnight. */
  const end = toEpochDay + 1;
  const step = (end - fromEpochDay) / (BAND_SAMPLES - 1);
  /* The last sample is pinned to `end` rather than left as
     `from + 360 * step`, which lands a few float-epsilons past it. Not
     cosmetic: bandMidpointAt answers null outside the band, so a lab point
     drawn at exactly the end of the window would have fallen off it. */
  const days = Array.from({ length: BAND_SAMPLES }, (_, i) =>
    i === BAND_SAMPLES - 1 ? end : fromEpochDay + i * step
  );

  /* One row per sampled day, filled sample by sample, so the percentile at
     a day is taken over the 313 whole curves rather than over anything
     recombined. */
  const atDay: number[][] = days.map(() => []);
  for (const sample of samples) {
    for (const [i, day] of days.entries()) {
      let total = 0;
      for (const injection of injections) total += singleDose(injection.milligrams, sample, day - injection.day);
      atDay[i].push(total);
    }
  }

  const [lowPercentile, highPercentile] = BAND_PERCENTILES;
  return days.map((day, i) => {
    const sorted = atDay[i].sort((a, b) => a - b);
    return { day, lower: percentile(sorted, lowPercentile), upper: percentile(sorted, highPercentile) };
  });
}

/** One band per injectable estradiol ester injected in `[fromEpochDay,
    toEpochDay]`, in INJECTABLE_ESTERS order.

    `doses` should reach back CURVE_LOOKBACK_DAYS before the window: doses
    outside it still feed the curve, only the sampling is bounded. Each dose
    resolves its own episode for its ester (regimenEpisode.ts), so backdating
    a dose or correcting an episode underneath it moves which curve the dose
    belongs to with nothing stored to rewrite. */
export function esterCurves(input: CurveInput): HormoneCurves {
  const { doses, episodes, fromEpochDay, toEpochDay } = input;

  const injections = new Map<InjectableEster, { day: number; milligrams: number }[]>();
  const unmodelled = new Set<InjectableEster>();
  let dosesWithoutMilligrams = 0;
  let subcutaneousDoses = 0;

  for (const dose of doses) {
    if (dose.route !== 'im' && dose.route !== 'sc') continue;
    if (dose.status === 'skipped') continue;

    const episode = resolveEpisodeAt(episodes, dose.timestamp);
    if (!episode) continue;
    const ester = resolveInjectableEster(episode);
    if (!ester) continue;

    if (!ESTER_POSTERIORS[ester]) {
      unmodelled.add(ester);
      continue;
    }

    const milligrams = doseMilligrams(dose.dose, dose.doseUnit);
    if (milligrams === null) {
      dosesWithoutMilligrams += 1;
      continue;
    }

    if (dose.route === 'sc') subcutaneousDoses += 1;

    const existing = injections.get(ester);
    const injection = { day: fractionalEpochDay(dose.timestamp), milligrams };
    if (existing) existing.push(injection);
    else injections.set(ester, [injection]);
  }

  const curves = INJECTABLE_ESTERS.filter((ester) => injections.has(ester)).map((ester) => ({
    ester,
    hypothetical: isHypotheticalEster(ester),
    band: bandFor(ESTER_POSTERIORS[ester]!, injections.get(ester)!, fromEpochDay, toEpochDay),
    doseCount: injections.get(ester)!.length
  }));

  return {
    curves,
    unmodelledEsters: INJECTABLE_ESTERS.filter((ester) => unmodelled.has(ester)),
    dosesWithoutMilligrams,
    subcutaneousDoses
  };
}

/** The same curves with every band multiplied by `factor` - the per-user
    scale factor from fitScaleFactor (hormoneCurveFit.ts), applied after the
    fact rather than passed into esterCurves.

    Two reasons it is a separate step. The factor is fitted against the
    unscaled band, so scaling inside esterCurves would mean computing the
    whole thing twice. And the factor moves the amplitude and only the
    amplitude: doing it as a multiply over the finished band is the plainest
    statement that the published per-ester parameters were not touched. */
export function scaleCurves(curves: readonly EsterCurve[], factor: number): EsterCurve[] {
  return curves.map((curve) => ({
    ...curve,
    band: curve.band.map((point) => ({
      day: point.day,
      lower: point.lower * factor,
      upper: point.upper * factor
    }))
  }));
}

/** The band's own range at `day`: the first sample at or after it, or the
    last one when `day` is past the end. Null for an empty band.

    Here rather than in the screen that reads it, for the reason every other
    derived module gives: it is arithmetic over a band and it is testable in
    the Node tier, where a helper inside a Svelte file is not. */
export function bandRangeAt(curve: EsterCurve, day: number): CurveBandPoint | null {
  if (curve.band.length === 0) return null;
  return curve.band.find((point) => point.day >= day) ?? curve.band[curve.band.length - 1];
}

/** The last slice of the band - where the curve has got to by the end of the
    window. What the screen shows when no result of the user's own is picked
    out. */
export function latestBandPoint(curve: EsterCurve): CurveBandPoint | null {
  return curve.band[curve.band.length - 1] ?? null;
}

/** The middle of the band at `day`, interpolated between the two samples
    either side of it, or null when `day` falls outside the band.

    For fitting a scale factor against the user's own lab points
    (fitScaleFactor) and for nothing else. Not a prediction and not for
    drawing: a line through these midpoints is exactly the single-line
    presentation this ticket exists to avoid. */
export function bandMidpointAt(curve: EsterCurve, day: number): number | null {
  const band = curve.band;
  if (band.length === 0 || day < band[0].day || day > band[band.length - 1].day) return null;

  const middle = (point: CurveBandPoint) => (point.lower + point.upper) / 2;
  const next = band.findIndex((point) => point.day >= day);
  if (next <= 0) return middle(band[Math.max(next, 0)]);

  const before = band[next - 1];
  const after = band[next];
  const span = after.day - before.day;
  if (span <= 0) return middle(after);
  return middle(before) + (middle(after) - middle(before)) * ((day - before.day) / span);
}

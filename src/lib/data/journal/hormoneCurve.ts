/* The hormone curve area (phase 4 ticket 10, CONTEXT: "Hormone curve"). A
   view stitched together from rows `doses`, `regimen` and `labs` own, the
   same way exposure.ts is: this area owns no table, reads no driver, and
   stores nothing (ADR-0010). Every band is recomputed from the dose log on
   every read.

   The lab results are the point of the screen rather than a decoration on
   it. The model is a population-level estimate and a lab result is a
   measurement of one person, so the results are what the curve is drawn
   around: they carry their own native value and unit (ADR-0026) and they are
   what the optional scale factor is fitted to. Nothing here compares a
   result to a target, because there is no target in this app to compare it
   to. */

import { convertLabValue } from '../labs/units';
import {
  CURVE_LOOKBACK_DAYS,
  CURVE_UNIT,
  bandMidpointAt,
  esterCurves,
  fractionalEpochDay,
  scaleCurves,
  type EsterCurve
} from '../hormoneCurve';
import { fitScaleFactor, type FitPair } from '../hormoneCurveFit';
import { resolveInjectableEster, type InjectableEster } from '../hormoneEster';
import { resolveEpisodeAt } from '../regimenEpisode';
import { drawInstant } from '../labTiming';
import { startOfDayTimestamp, timestampAtLocalTime } from '../epochDay';
import type { LabResult } from '../types';
import type { DosesArea } from './doses';
import type { LabsArea } from './labs';
import type { RegimenArea } from './regimen';

/** One of the user's own results, placed on the curve's axis. */
export interface CurveLabPoint {
  /** The result as logged. What a screen shows comes from here, so the
      native value and unit stay primary (ADR-0026). */
  result: LabResult;
  /** Where it sits on the curve's fractional-epoch-day axis. */
  day: number;
  /** The same result in the model's unit, for placing it against the band
      and for fitting. Never what is displayed. */
  value: number;
  /** Which ester's chart it belongs on: the one in effect at the draw,
      resolved the same way a dose's is. Null when no episode covers the draw
      or its ester is not one this app knows - such a result belongs to no
      ester in particular and is shown against all of them. */
  ester: InjectableEster | null;
}

export interface HormoneCurveView {
  curves: EsterCurve[];
  dosesWithoutMilligrams: number;
  /** Subcutaneous injections drawn against intramuscular parameters, which
      is an assumption the screen has to state (hormoneCurve.ts). */
  subcutaneousDoses: number;
  labPoints: CurveLabPoint[];
  /** Estradiol results in the window whose unit is outside ADR-0026's
      allowlist, so there is no honest way to place them against a pg/mL
      band. Counted rather than converted by guesswork. */
  labPointsOffAxis: number;
  /** The factor every band was multiplied by, or null when the bands are the
      published population-level ones. */
  scaleFactor: number | null;
  /** How many of the user's own points the factor was fitted from. */
  fitPointCount: number;
}

export interface HormoneCurveArea {
  /** The bands over `[fromEpochDay, toEpochDay]` with the user's own results
      overlaid. `fitToOwnLabs` asks for the scale factor to be fitted and
      applied; declining leaves the published curve exactly as it is, and it
      still renders. */
  getCurves(params: {
    fromEpochDay: number;
    toEpochDay: number;
    fitToOwnLabs: boolean;
  }): Promise<HormoneCurveView>;
}

/** Which analytes this curve can be drawn against: the ones ADR-0026's
    allowlist measures in the model's own unit, which is estradiol and
    nothing else. Asked of the allowlist rather than by comparing the analyte
    name, so a result logged as "Estradiol" counts the same as one logged as
    "estradiol" - the same identity rule the conversion itself uses. */
function measuredInCurveUnit(analyte: string): boolean {
  return convertLabValue(analyte, 1, CURVE_UNIT, CURVE_UNIT) !== null;
}

/** Where a draw sits on the curve's axis. A recorded draw time is used as
    it stands; without one the draw is placed at midday, because an epoch day
    is a whole day and midday is the least wrong single point in it. That
    approximation is the reason ticket 03 refuses to derive an hours figure
    without a draw time - it matters more the faster the ester, and it is
    worth knowing that an untimed draw against a benzoate curve is placed
    rather than measured. */
function drawDay(result: LabResult): number {
  return fractionalEpochDay(drawInstant(result) ?? timestampAtLocalTime(result.epochDay, '12:00'));
}

export function makeHormoneCurveArea(
  doses: DosesArea,
  regimen: RegimenArea,
  labs: LabsArea
): HormoneCurveArea {
  return {
    async getCurves({ fromEpochDay, toEpochDay, fitToOwnLabs }) {
      /* The dose log is read back past the window: an injection given before
         it opens is most of what the window's first days are made of. */
      const [doseEvents, episodes, usedAnalytes] = await Promise.all([
        doses.getDoses(fromEpochDay - CURVE_LOOKBACK_DAYS, toEpochDay),
        regimen.getEpisodes(),
        labs.getUsedAnalytes()
      ]);

      const analytes = usedAnalytes.filter(measuredInCurveUnit);
      const results = (await Promise.all(analytes.map((analyte) => labs.getResults(analyte)))).flat();

      const labPoints: CurveLabPoint[] = [];
      let labPointsOffAxis = 0;
      for (const result of results) {
        if (result.epochDay < fromEpochDay || result.epochDay > toEpochDay) continue;
        const value = convertLabValue(result.analyte, result.value, result.unit, CURVE_UNIT);
        if (value === null) {
          labPointsOffAxis += 1;
          continue;
        }
        const episode = resolveEpisodeAt(episodes, drawInstant(result) ?? startOfDayTimestamp(result.epochDay));
        labPoints.push({
          result,
          day: drawDay(result),
          value,
          ester: episode ? resolveInjectableEster(episode) : null
        });
      }
      labPoints.sort((a, b) => a.day - b.day);

      const population = esterCurves({ doses: doseEvents, episodes, fromEpochDay, toEpochDay });

      /* A factor is only worth fitting when the model is drawing everything
         that went in. An injection logged by volume leaves the bands
         knowingly low, and a fit against them would blame the difference on
         the person's own response and quietly scale the whole curve up. */
      const modelIsComplete = population.dosesWithoutMilligrams === 0;

      const pairs: FitPair[] = [];
      if (fitToOwnLabs && modelIsComplete) {
        for (const point of labPoints) {
          /* Summed across the esters drawn, because a lab result measures
             one bloodstream: someone who changed ester mid-window has both
             contributing to the number their lab reported. */
          let modelled = 0;
          for (const curve of population.curves) modelled += bandMidpointAt(curve, point.day) ?? 0;
          pairs.push({ modelled, observed: point.value });
        }
      }

      const fit = pairs.length > 0 ? fitScaleFactor(pairs) : null;

      return {
        curves: fit === null ? population.curves : scaleCurves(population.curves, fit.factor),
        dosesWithoutMilligrams: population.dosesWithoutMilligrams,
        subcutaneousDoses: population.subcutaneousDoses,
        labPoints,
        labPointsOffAxis,
        scaleFactor: fit?.factor ?? null,
        fitPointCount: fit?.pointsUsed ?? 0
      };
    }
  };
}

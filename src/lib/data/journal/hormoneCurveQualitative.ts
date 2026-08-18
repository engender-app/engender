/* The qualitative curve area (phase 4 ticket 11, CONTEXT: "Qualitative
   curve"). A view stitched together from rows `doses`, `regimen` and `labs`
   own, the same shape as journal/hormoneCurve.ts beside it: this area owns
   no table, reads no driver, and stores nothing (ADR-0010). Every curve is
   recomputed from the dose log on every read.

   One difference from journal/hormoneCurve.ts worth stating up front: a lab
   result here is never attributed to one route. An ester is read off the
   regimen episode's own drug/ester text (hormoneEster.ts), but nothing in
   the schema says which of these four routes an episode is for - `.route` on
   a regimen episode is free text for a person's own use, not the closed
   vocabulary a dose event's `.route` is (types.ts). Guessing a route out of
   that free text would be exactly the kind of invented precision this
   ticket's curves already avoid in their shape; instead every on-axis result
   is shown against every qualitative curve drawn, the same fallback
   hormoneCurve.ts uses for a result it cannot attribute to an ester at
   all. */

import { convertLabValue } from '../labs/units';
import { CURVE_UNIT, fractionalEpochDay } from '../hormoneCurve';
import { fitScaleFactorToLabs } from '../hormoneCurveFit';
import {
  QUALITATIVE_LOOKBACK_DAYS,
  qualitativeCurves,
  qualitativeValueAt,
  scaleQualitativeCurves,
  type QualitativeCurve
} from '../hormoneCurveQualitative';
import { drawInstant } from '../labTiming';
import { timestampAtLocalTime } from '../epochDay';
import type { LabResult } from '../types';
import type { DosesArea } from './doses';
import type { LabsArea } from './labs';
import type { RegimenArea } from './regimen';

/** One of the user's own results, placed on the curve's axis. Shown against
    every curve drawn (see the file header) rather than carrying a route of
    its own. */
export interface QualitativeCurveLabPoint {
  /** The result as logged. What a screen shows comes from here, so the
      native value and unit stay primary (ADR-0026). */
  result: LabResult;
  /** Where it sits on the curve's fractional-epoch-day axis. */
  day: number;
  /** The same result in the model's unit, for placing it against the curve
      and for fitting. Never what is displayed. */
  value: number;
}

export interface QualitativeCurveView {
  curves: QualitativeCurve[];
  /** Doses left out because their amount was not in milligrams. */
  dosesWithoutMilligrams: number;
  labPoints: QualitativeCurveLabPoint[];
  /** Estradiol results in the window whose unit is outside ADR-0026's
      allowlist, so there is no honest way to place them against the curve. */
  labPointsOffAxis: number;
  /** The factor every curve was multiplied by, or null when the curves are
      the published (invented-shape) ones with no fit applied. */
  scaleFactor: number | null;
  /** How many of the user's own points the factor was fitted from. */
  fitPointCount: number;
}

export interface QualitativeCurveArea {
  /** The curves over `[fromEpochDay, toEpochDay]` with the user's own
      results overlaid. `fitToOwnLabs` asks for the scale factor to be fitted
      and applied; declining leaves the invented shape exactly as it is, and
      it still renders. */
  getCurves(params: {
    fromEpochDay: number;
    toEpochDay: number;
    fitToOwnLabs: boolean;
  }): Promise<QualitativeCurveView>;
}

/** Which analytes this curve can be drawn against - estradiol, the same as
    the injectable model, since both curves describe the same hormone by a
    different route. */
function measuredInCurveUnit(analyte: string): boolean {
  return convertLabValue(analyte, 1, CURVE_UNIT, CURVE_UNIT) !== null;
}

/** Where a draw sits on the curve's axis, matching hormoneCurve.ts's own
    drawDay: a recorded draw time is used as it stands, and an untimed draw
    is placed at midday. */
function drawDay(result: LabResult): number {
  return fractionalEpochDay(drawInstant(result) ?? timestampAtLocalTime(result.epochDay, '12:00'));
}

export function makeQualitativeCurveArea(
  doses: DosesArea,
  regimen: RegimenArea,
  labs: LabsArea
): QualitativeCurveArea {
  return {
    async getCurves({ fromEpochDay, toEpochDay, fitToOwnLabs }) {
      /* The dose log is read back past the window: a dose given before it
         opens is most of what the window's first hours are made of. */
      const [doseEvents, episodes, usedAnalytes] = await Promise.all([
        doses.getDoses(fromEpochDay - QUALITATIVE_LOOKBACK_DAYS, toEpochDay),
        regimen.getEpisodes(),
        labs.getUsedAnalytes()
      ]);

      const analytes = usedAnalytes.filter(measuredInCurveUnit);
      const results = (await Promise.all(analytes.map((analyte) => labs.getResults(analyte)))).flat();

      const labPoints: QualitativeCurveLabPoint[] = [];
      let labPointsOffAxis = 0;
      for (const result of results) {
        if (result.epochDay < fromEpochDay || result.epochDay > toEpochDay) continue;
        const value = convertLabValue(result.analyte, result.value, result.unit, CURVE_UNIT);
        if (value === null) {
          labPointsOffAxis += 1;
          continue;
        }
        labPoints.push({ result, day: drawDay(result), value });
      }
      labPoints.sort((a, b) => a.day - b.day);

      const population = qualitativeCurves({ doses: doseEvents, episodes, fromEpochDay, toEpochDay });

      /* Same rule as the injectable model: a fit is only worth taking when
         every dose that went in is drawn. A dose left out for its unit
         leaves the curve knowingly low, and fitting against it would blame
         the gap on the person's own response. */
      const modelIsComplete = population.dosesWithoutMilligrams === 0;

      /* Summed across the routes drawn, for the same reason hormoneCurve.ts
         sums across esters: a lab result measures one bloodstream. */
      const modelledAt = (day: number) =>
        population.curves.reduce((sum, curve) => sum + (qualitativeValueAt(curve, day) ?? 0), 0);
      const fit = fitToOwnLabs && modelIsComplete ? fitScaleFactorToLabs(labPoints, modelledAt) : null;

      return {
        curves: fit === null ? population.curves : scaleQualitativeCurves(population.curves, fit.factor),
        dosesWithoutMilligrams: population.dosesWithoutMilligrams,
        labPoints,
        labPointsOffAxis,
        scaleFactor: fit?.factor ?? null,
        fitPointCount: fit?.pointsUsed ?? 0
      };
    }
  };
}

/* The hormone curve area (phase 4 tickets 10 and 11, CONTEXT: "Hormone
   curve"). A view stitched together from rows `doses`, `regimen` and `labs`
   own, the same way exposure.ts is: this area owns no table, reads no driver,
   and stores nothing (ADR-0010). Every curve is recomputed from the dose log
   on every read.

   One area and one call for both kinds of curve (phase 5 deepening ticket
   17). CONTEXT is explicit that a hormone curve is "drawn one of two ways
   depending on how good the published evidence for it is": injectable
   estradiol on one of the four esters gets hormoneCurve.ts's fitted band, and
   everything else this app draws gets hormoneCurveQualitative.ts's
   illustrative shape. Both classes need the same seven steps over the same
   rows - filter the used analytes through ADR-0026's allowlist, fan out the
   reads, clip to the window, convert or count off the axis, sort by day, gate
   the fit on the model drawing every dose that went in, sum the modelled
   values across the curves drawn - and they were written twice, in the same
   order, with drawDay byte-identical in both. They happen once here, and the
   screen's three reads of the dose log are one.

   Two branches rather than a descriptor per model, and that was the open
   question this ticket had to answer before abstracting. A CurveModel
   descriptor (lookbackDays, build, valueAt, scale) registered per evidence
   class only earns its indirection if a third class is coming, and none is.
   The split is by evidence quality and CONTEXT names exactly two grades of
   it; what changes over time is which drug sits in which grade - a
   testosterone ester that one day gets a publishable posterior moves from the
   shape to the band - and both of those moves are edits to the two ester
   vocabularies, not a third arm here. The esters that earn no curve at all
   (polyestradiol phosphate, undecanoate, the blends, propionate) get none on
   purpose, and CONTEXT says why for each. So: two branches, named for the two
   things CONTEXT names, and the duplication gone.

   What this area holds beyond the two models is what the screen used to: the
   axis maximum, which decides whether a clipped lab result goes missing and
   whether two unfitted shapes may share a scale; the unit, which may not be
   printed at all until a fit gives a shape's height a meaning; and the
   ester-matching rule that puts a result on a chart. Those were untested
   arithmetic inside a Svelte file, which is the half of this screen where a
   number can quietly go wrong.

   The lab results are the point of the screen rather than a decoration on
   it. The model is a population-level estimate and a lab result is a
   measurement of one person, so the results are what the curves are drawn
   around: they carry their own native value and unit (ADR-0026) and they are
   what the optional scale factor is fitted to. Nothing here compares a
   result to a target, because there is no target in this app to compare it
   to.

   The two ester vocabularies stay apart, as CONTEXT requires: hormoneEster.ts
   knows estradiol's four and hormoneTestosteroneEster.ts knows testosterone's
   two, and neither reads the other's names. This file asks each question
   through the module that owns it - resolveInjectableEster for the band,
   resolveQualitativeKey for the shape - and never forms one list. */

import { convertLabValue } from '../labs/units';
import { CURVE_DRUGS, curveUnit, type CurveDrug } from '../hormoneDrug';
import {
  CURVE_LOOKBACK_DAYS,
  bandMidpointAt,
  esterCurves,
  fractionalEpochDay,
  scaleCurves,
  type EsterCurve,
  type HormoneCurves
} from '../hormoneCurve';
import { fitScaleFactorToLabs } from '../hormoneCurveFit';
import {
  QUALITATIVE_LOOKBACK_DAYS,
  dosesWithNoCurve,
  qualitativeCurves,
  qualitativeValueAt,
  scaleQualitativeCurves,
  type QualitativeCurve,
  type QualitativeCurves
} from '../hormoneCurveQualitative';
import { resolveInjectableEster, type InjectableEster } from '../hormoneEster';
import { activeEpisodesAt } from '../regimenEpisode';
import { drawInstant } from '../labTiming';
import { startOfDayTimestamp, timestampAtLocalTime } from '../epochDay';
import type { DoseEvent, LabResult } from '../types';
import type { DosesArea } from './doses';
import type { LabsArea } from './labs';
import type { RegimenArea } from './regimen';
import { createModelMemo } from './curveModelMemo';

/** One of the user's own results, placed on a curve's axis. */
export interface CurveLabPoint {
  /** The result as logged. What a screen shows comes from here, so the
      native value and unit stay primary (ADR-0026). */
  result: LabResult;
  /** Where it sits on the curve's fractional-epoch-day axis. */
  day: number;
  /** The same result in the model's unit, for placing it against the curve
      and for fitting. Never what is displayed. */
  value: number;
}

/** A result on the band's axis, plus which ester's chart it belongs on: the
    sole episode in effect at the draw. A lab result carries no drug of its
    own to break a tie the way a dose's optional `drug` can (types.ts), so
    null covers three cases alike - no episode covers the draw, more than one
    does, or the one that resolved has no ester this app knows. */
export interface EsterLabPoint extends CurveLabPoint {
  ester: InjectableEster | null;
}

/** One ester's chart: the band, and the results that belong on it. */
export interface EsterChart extends EsterCurve {
  /** Those drawn while this ester was the one being injected, plus any the
      dose log cannot attribute to an ester at all - those belong to no chart
      in particular, so they go on all of them rather than disappearing. With
      one ester that is every result either way. */
  labPoints: EsterLabPoint[];
}

export interface InjectableCurves {
  charts: EsterChart[];
  /** One scale across every chart here, so two esters drawn one under the
      other can be read against each other. Headroom above the tallest thing
      on any of them, whether that is a band or one of the user's own
      results: a result clipped off the top would be the one number here that
      matters most going missing. 400 where there is nothing to scale to. */
  axisMax: number;
  /** Every result on the band's axis, ungrouped - what the factor below was
      fitted from, and one bloodstream's worth of measurements rather than one
      chart's. */
  labPoints: EsterLabPoint[];
  dosesWithoutMilligrams: number;
  /** Subcutaneous injections drawn against intramuscular parameters, which
      is an assumption the screen has to state (hormoneCurve.ts). */
  subcutaneousDoses: number;
  /** The factor every band was multiplied by, or null when the bands are the
      published population-level ones. */
  scaleFactor: number | null;
  /** How many of the user's own points the factor was fitted from. */
  fitPointCount: number;
}

/** One illustrative shape, with the axis it is drawn against. */
export interface QualitativeChart extends QualitativeCurve {
  /** Shared across this hormone's charts once a fit gives their height a
      real meaning in that hormone's unit; before that, scaled to this
      curve's own tallest point instead. Unfitted, the number on one curve
      has nothing to do with the number on another, and a shared scale would
      imply a comparison this app has no basis for. */
  axisMax: number;
}

/** One hormone's illustrative curves. Per hormone rather than across both,
    because the two are drawn in different units: putting a pg/mL curve and a
    ng/dL curve on one axis would be a comparison with no meaning at all, fit
    or no fit. */
export interface QualitativeSection {
  drug: CurveDrug;
  charts: QualitativeChart[];
  /** This hormone's own unit, and null until a fit has calibrated the
      amplitude against the user's own results: before that the heights are
      an invented amplitude with no honest unit, and printing one beside them
      would claim a precision the qualitative curve exists to avoid. */
  unit: string | null;
  scaleFactor: number | null;
  fitPointCount: number;
  /** Doses of this hormone left out because their amount was not in
      milligrams - what its own fit line says when there is no factor. */
  dosesWithoutMilligrams: number;
  /** This hormone's results on its own axis. Not drawn - a qualitative curve
      carries no result marks, because there is nothing honest to overlay
      them onto - but they are what its factor was fitted from. */
  labPoints: CurveLabPoint[];
}

export interface HormoneCurveView {
  injectable: InjectableCurves;
  /** One entry per hormone with something to draw, in CURVE_DRUGS order. */
  qualitative: {
    sections: QualitativeSection[];
    /** Summed across both hormones: a reader wants one number for "doses the
        shapes are missing", not one per hormone. */
    dosesWithoutMilligrams: number;
  };
  /** Results in the window whose unit is outside ADR-0026's allowlist, so
      there is no honest way to place them against any curve here. Counted
      rather than converted by guesswork, and counted once: a result's
      analyte belongs to one hormone, so this is one number for the screen
      rather than the same result reported under each curve it missed. */
  labPointsOffAxis: number;
  /** Doses in the window this app draws no curve for at all, by either
      model. What the empty state reads to tell "nothing logged yet" apart
      from "logged, and outside what this app draws". */
  dosesNoCurveAnywhere: number;
}

export interface HormoneCurveArea {
  /** Every curve over `[fromEpochDay, toEpochDay]` with the user's own
      results placed against it. `fitToOwnLabs` asks for the scale factor to
      be fitted and applied; declining leaves the published band and the
      invented shape exactly as they are, and both still render. */
  getCurves(params: {
    fromEpochDay: number;
    toEpochDay: number;
    fitToOwnLabs: boolean;
  }): Promise<HormoneCurveView>;
}

/** How far back the dose log has to be read for both classes at once - the
    wider of the two reaches rather than the band's, taken from them rather
    than assumed, so replacing either model's parameters moves this with it.
    Each model is then handed the doses inside its own reach: the model
    filters by reach itself when it draws, but its "left out for its unit"
    tally counts what it was given, and a shape has no business counting a
    dose from two months before a window it cannot reach into. */
const LOOKBACK_DAYS = Math.max(CURVE_LOOKBACK_DAYS, QUALITATIVE_LOOKBACK_DAYS);

/** Which analytes a hormone's curve can be drawn against: the ones ADR-0026's
    allowlist measures in that hormone's own unit. Asked of the allowlist
    rather than by comparing the analyte name, so a result logged as
    "Estradiol" counts the same as one logged as "estradiol" - the same
    identity rule the conversion itself uses.

    That this also keeps an estradiol result off a testosterone curve is a
    property of the allowlist, not an extra check here: pg/mL belongs to
    estradiol alone and ng/dL to testosterone alone, so asking for a
    conversion into one hormone's own unit answers no for every other
    analyte. A test pins that, so an allowlist that ever gave two analytes the
    same unit fails there rather than quietly crossing two curves. */
function measuredInCurveUnit(analyte: string, drug: CurveDrug): boolean {
  const unit = curveUnit(drug);
  return convertLabValue(analyte, 1, unit, unit) !== null;
}

/** Where a draw sits on a curve's axis. A recorded draw time is used as it
    stands; without one the draw is placed at midday, because an epoch day is
    a whole day and midday is the least wrong single point in it. That
    approximation is the reason ticket 03 refuses to derive an hours figure
    without a draw time - it matters more the faster the ester, and it is
    worth knowing that an untimed draw against a benzoate curve is placed
    rather than measured. */
function drawDay(result: LabResult): number {
  return fractionalEpochDay(drawInstant(result) ?? timestampAtLocalTime(result.epochDay, '12:00'));
}

/** Headroom above the tallest number on the axis, or null when there is
    nothing on it. The one arithmetic rule both classes share and the one a
    clipped result would go missing through, so it is written once. */
function axisTop(values: readonly number[]): number | null {
  let top = 0;
  for (const value of values) if (value > top) top = value;
  return top > 0 ? top * 1.1 : null;
}

export function makeHormoneCurveArea(
  doses: DosesArea,
  regimen: RegimenArea,
  labs: LabsArea
): HormoneCurveArea {
  /* One journal, one cache per model (ticket 04) - see curveModelMemo.ts for
     what these guard and why they are keyed and invalidated the way they are.
     The shape cache is keyed by drug as well as window: one call draws both
     hormones, and each is a separate model run over the same dose log. */
  const bandCache = createModelMemo<HormoneCurves>();
  const shapeCache = createModelMemo<QualitativeCurves>();

  return {
    async getCurves({ fromEpochDay, toEpochDay, fitToOwnLabs }) {
      /* The dose log is read back past the window: a dose given before it
         opens is most of what the window's first days are made of. */
      const [doseEvents, episodes, usedAnalytes] = await Promise.all([
        doses.getDoses(fromEpochDay - LOOKBACK_DAYS, toEpochDay),
        regimen.getEpisodes(),
        labs.getUsedAnalytes()
      ]);

      /* One read per analyte any curve here could be drawn against, rather
         than one per analyte per curve. Which of them a given hormone may
         actually be placed against is asked below, per hormone: a
         testosterone result reaching the estradiol pass would be counted off
         its axis rather than ignored. */
      const analytes = usedAnalytes.filter((analyte) =>
        CURVE_DRUGS.some((drug) => measuredInCurveUnit(analyte, drug))
      );
      const resultsByAnalyte = new Map(
        await Promise.all(
          analytes.map(async (analyte) => [analyte, await labs.getResults(analyte)] as const)
        )
      );

      /** One hormone's results, clipped to the window, converted onto its own
          axis and ordered along it - or counted off the axis where its unit
          does not convert. */
      const place = (drug: CurveDrug): { points: CurveLabPoint[]; offAxis: number } => {
        const unit = curveUnit(drug);
        const points: CurveLabPoint[] = [];
        let offAxis = 0;

        for (const analyte of analytes) {
          if (!measuredInCurveUnit(analyte, drug)) continue;
          for (const result of resultsByAnalyte.get(analyte) ?? []) {
            if (result.epochDay < fromEpochDay || result.epochDay > toEpochDay) continue;
            const value = convertLabValue(result.analyte, result.value, result.unit, unit);
            if (value === null) {
              offAxis += 1;
              continue;
            }
            points.push({ result, day: drawDay(result), value });
          }
        }
        points.sort((a, b) => a.day - b.day);
        return { points, offAxis };
      };

      /** A factor, or null. Only worth fitting when the model is drawing
          everything that went in: a dose logged by volume leaves the curve
          knowingly low, and a fit against it would blame the difference on
          the person's own response and quietly scale the whole thing up. */
      const fit = (
        complete: boolean,
        points: readonly CurveLabPoint[],
        modelledAt: (day: number) => number
      ) => (fitToOwnLabs && complete ? fitScaleFactorToLabs(points, modelledAt) : null);

      const placed = new Map(CURVE_DRUGS.map((drug) => [drug, place(drug)]));

      // --- the band: injectable estradiol on one of the four esters --------

      const estradiol = placed.get('estradiol')!;
      /* The ester a result belongs to, resolved from the episode in effect at
         the draw rather than from anything stored on the result. */
      const esterAt = (result: LabResult): InjectableEster | null => {
        const active = activeEpisodesAt(episodes, drawInstant(result) ?? startOfDayTimestamp(result.epochDay));
        const episode = active.length === 1 ? active[0] : null;
        return episode ? resolveInjectableEster(episode) : null;
      };
      const bandLabPoints: EsterLabPoint[] = estradiol.points.map((point) => ({
        ...point,
        ester: esterAt(point.result)
      }));

      const population = bandCache.remember(`${fromEpochDay}:${toEpochDay}`, [doseEvents, episodes], () =>
        esterCurves({ doses: doseEvents, episodes, fromEpochDay, toEpochDay })
      );
      /* Summed across the esters drawn, because a lab result measures one
         bloodstream: someone who changed ester mid-window has both
         contributing to the number their lab reported. */
      const bandFit = fit(population.dosesWithoutMilligrams === 0, bandLabPoints, (day) =>
        population.curves.reduce((sum, curve) => sum + (bandMidpointAt(curve, day) ?? 0), 0)
      );
      const bands = bandFit === null ? population.curves : scaleCurves(population.curves, bandFit.factor);

      const injectable: InjectableCurves = {
        charts: bands.map((curve) => ({
          ...curve,
          labPoints: bandLabPoints.filter((point) => point.ester === curve.ester || point.ester === null)
        })),
        axisMax:
          axisTop([
            ...bands.flatMap((curve) => curve.band.map((point) => point.upper)),
            ...bandLabPoints.map((point) => point.value)
          ]) ?? 400,
        labPoints: bandLabPoints,
        dosesWithoutMilligrams: population.dosesWithoutMilligrams,
        subcutaneousDoses: population.subcutaneousDoses,
        scaleFactor: bandFit?.factor ?? null,
        fitPointCount: bandFit?.pointsUsed ?? 0
      };

      // --- the shapes: one hormone at a time, in their own units ----------

      /* Inside the shapes' own reach - see LOOKBACK_DAYS. */
      const shapeDoses: DoseEvent[] = doseEvents.filter(
        (dose) => dose.timestamp >= startOfDayTimestamp(fromEpochDay - QUALITATIVE_LOOKBACK_DAYS)
      );

      const sections: QualitativeSection[] = [];
      let qualitativeDosesWithoutMilligrams = 0;

      for (const drug of CURVE_DRUGS) {
        const own = placed.get(drug)!;
        const shapes = shapeCache.remember(
          `${drug}:${fromEpochDay}:${toEpochDay}`,
          [shapeDoses, episodes],
          () => qualitativeCurves({ drug, doses: shapeDoses, episodes, fromEpochDay, toEpochDay })
        );
        qualitativeDosesWithoutMilligrams += shapes.dosesWithoutMilligrams;
        if (shapes.curves.length === 0) continue;

        /* Summed across the routes drawn, for the same reason the band sums
           across esters. Across this hormone's routes only - the other
           hormone's curves are a different model run, in a different unit,
           fitted against a different analyte. */
        const shapeFit = fit(shapes.dosesWithoutMilligrams === 0, own.points, (day) =>
          shapes.curves.reduce((sum, curve) => sum + (qualitativeValueAt(curve, day) ?? 0), 0)
        );
        const curves = shapeFit === null ? shapes.curves : scaleQualitativeCurves(shapes.curves, shapeFit.factor);
        const shared = shapeFit === null ? null : axisTop(curves.flatMap((c) => c.points.map((p) => p.value)));

        sections.push({
          drug,
          charts: curves.map((curve) => ({
            ...curve,
            axisMax: shared ?? axisTop(curve.points.map((point) => point.value)) ?? 1
          })),
          unit: shapeFit === null ? null : curveUnit(drug),
          scaleFactor: shapeFit?.factor ?? null,
          fitPointCount: shapeFit?.pointsUsed ?? 0,
          dosesWithoutMilligrams: shapes.dosesWithoutMilligrams,
          labPoints: own.points
        });
      }

      return {
        injectable,
        qualitative: { sections, dosesWithoutMilligrams: qualitativeDosesWithoutMilligrams },
        labPointsOffAxis: CURVE_DRUGS.reduce((sum, drug) => sum + placed.get(drug)!.offAxis, 0),
        dosesNoCurveAnywhere: dosesWithNoCurve({ doses: doseEvents, episodes, fromEpochDay, toEpochDay })
      };
    }
  };
}

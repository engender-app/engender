/* The one query behind every annotated chart (phase 5 deepening ticket 23).

   Six areas already store dated things a chart can be read against, and
   before this a chart that wanted them would have had to open six areas of
   its own and decide what to keep. This is the one place that does it, so a
   screen asks one question and gets back what happened in a range.

   A view over rows other areas own, the way `exposure` and `clinicianSummary`
   are: it stores nothing, writes nothing, and owns no table. Nothing here is
   an archive section for the same reason - there is no data of its own to
   travel, and the six areas behind it each carry their own rows already
   (ADR-0027).

   Two of the seven kinds are derived rather than read, and both follow from
   dates that are stored (ADR-0010):

     recovery   the stretch after a procedure's surgery day, as long as
                Home's own recovery tile counts one for
                (SURGERY_RECOVERY_CUTOFF_DAYS). One constant for the app's
                answer to "how long is active recovery", not a second one
                here.
     dosePause  named by the drug of the episode it hangs off, because
                "pause" alone on a chart with two regimens on it does not
                say which regimen paused.
     era        a point at the day a bounded era starts (phase 6 ticket 03):
                the boundary a reader wants a chart's own change to sit
                against, computed here rather than stored, the same as
                everything else eraRange resolves at read time (ADR-0010).
                An open start has no day to mark.

   What is deliberately not here, and why:

     dose schedule changes  the ticket asks for them and the schema has
                            nowhere to get them: `dose_schedule` is one row
                            per episode with an `updated_at`, so editing a
                            schedule overwrites the old one and no history
                            survives. A DosePause is the dated schedule fact
                            that does exist, and it is drawn. Recording
                            schedule history would be a new stored thing,
                            which this ticket rules out.
     entries                every logged day would be an annotation, and the
                            line on the chart is already made of them.
     consults               a date in a procedure's history that says nothing
                            about the range a chart covers.

   ## The hormone curve's own markers (phase 8 features ticket 15)

   getCurveMarkers is a second selection over four more areas, and it is
   deliberately not part of getAnnotations. Every chart that opted into
   annotations would otherwise start drawing these, and the ticket rules out
   rendering any of it on /stats. So a screen asks for the markers by name,
   and today exactly one does.

   Two of the four kinds are records with a day on them - a side effect, an
   injection - and are drawn wherever they fall. The other two are not
   records at all but days that stood out: a tally count or a body-region
   reading above that person's own recent spread, with the threshold and the
   reason for it in data/ownSpread.ts. Nothing here compares anything to a
   number from outside the journal.

   Every marker carries the address of the record it stands for, following
   searchHitRows.ts's rule - the record where there is a screen for one, the
   screen that owns it otherwise. A body-region reading is the one with a
   record of its own to reach, since it is logged on an Entry. */

import { annotationsInRange, type ChartAnnotation, type ChartAnnotationSource } from '../../charts/annotations';
import { isInjectionDose } from '../doseSchedule';
import { epochDayFromTimestamp } from '../epochDay';
import { OWN_SPREAD_WINDOW_DAYS, aboveOwnSpread, type DayValue } from '../ownSpread';
import { SURGERY_RECOVERY_CUTOFF_DAYS } from '../recoveryDay';
import type { DosesArea } from './doses';
import type { ErasArea } from './eras';
import type { JournalingPausesArea } from './journalingPauses';
import type { MilestonesArea } from './milestones';
import type { ProceduresArea } from './procedures';
import type { RegimenArea } from './regimen';
import type { SideEffectsArea } from './sideEffects';
import type { RegionReading, StatsArea } from './stats';
import type { TryoutsArea } from './tryouts';

export interface ChartAnnotationsArea {
  /** What happened between two days, clipped to them and ordered by where it
      sits. `todayEpochDay` is the caller's, not a clock's: a stretch that has
      not ended reaches to today and the schema stores no end for one. */
  getAnnotations(fromEpochDay: number, toEpochDay: number, todayEpochDay: number): Promise<ChartAnnotation[]>;
  /** The hormone curve's four extra kinds over the same range, in the same
      shape, and never mixed into getAnnotations - see the header. A caller
      concatenates the two where it wants both. */
  getCurveMarkers(fromEpochDay: number, toEpochDay: number, todayEpochDay: number): Promise<ChartAnnotation[]>;
}

interface Areas {
  milestones: MilestonesArea;
  regimen: RegimenArea;
  doses: DosesArea;
  journalingPauses: JournalingPausesArea;
  tryouts: TryoutsArea;
  procedures: ProceduresArea;
  eras: ErasArea;
  sideEffects: SideEffectsArea;
  stats: StatsArea;
}

export function makeChartAnnotationsArea(areas: Areas): ChartAnnotationsArea {
  return {
    async getAnnotations(fromEpochDay, toEpochDay, todayEpochDay) {
      const [milestones, episodes, dosePauses, journalingPauses, tryouts, procedures, eras] = await Promise.all([
        areas.milestones.getMilestones(),
        areas.regimen.getEpisodes(),
        areas.doses.getPauses(),
        areas.journalingPauses.getPauses(),
        areas.tryouts.getTryouts(),
        areas.procedures.getProcedures(),
        areas.eras.getEras()
      ]);

      const drugOf = new Map(episodes.map((episode) => [episode.id, episode.drug]));
      const sources: ChartAnnotationSource[] = [
        ...milestones.map((milestone) => ({
          id: milestone.id,
          kind: 'milestone' as const,
          name: milestone.name,
          startEpochDay: milestone.epochDay,
          endEpochDay: null
        })),
        ...episodes.map((episode) => ({
          id: episode.id,
          kind: 'regimen' as const,
          name: episode.drug,
          startEpochDay: episode.startEpochDay,
          endEpochDay: episode.endEpochDay
        })),
        ...dosePauses.map((pause) => ({
          id: pause.id,
          kind: 'dosePause' as const,
          name: drugOf.get(pause.episodeId) ?? null,
          startEpochDay: pause.startEpochDay,
          endEpochDay: pause.endEpochDay
        })),
        ...journalingPauses.map((pause) => ({
          id: pause.id,
          kind: 'journalingPause' as const,
          name: null,
          startEpochDay: pause.startEpochDay,
          endEpochDay: pause.endEpochDay
        })),
        ...tryouts.map((tryout) => ({
          id: tryout.id,
          kind: 'tryout' as const,
          name: tryout.label,
          startEpochDay: tryout.startEpochDay,
          endEpochDay: tryout.endEpochDay
        })),
        ...eras
          .filter((era) => era.startEpochDay !== null)
          .map((era) => ({
            id: era.id,
            kind: 'era' as const,
            name: era.name,
            startEpochDay: era.startEpochDay as number,
            endEpochDay: null
          }))
      ];

      for (const procedure of procedures) {
        // A procedure usually exists for months before it has a date, and one
        // with no date has no day to mark and no window to draw.
        if (procedure.surgeryEpochDay === null) continue;
        sources.push({
          id: procedure.id,
          kind: 'surgery',
          name: procedure.name,
          startEpochDay: procedure.surgeryEpochDay,
          endEpochDay: null
        });
        // From the day after: the operation is its own mark, and a window
        // that started on the same day would draw a band under it.
        sources.push({
          id: `${procedure.id}-recovery`,
          kind: 'recovery',
          name: procedure.name,
          startEpochDay: procedure.surgeryEpochDay + 1,
          endEpochDay: procedure.surgeryEpochDay + SURGERY_RECOVERY_CUTOFF_DAYS
        });
      }

      return annotationsInRange(sources, { from: fromEpochDay, to: toEpochDay, today: todayEpochDay });
    },

    async getCurveMarkers(fromEpochDay, toEpochDay, todayEpochDay) {
      /* How far back everything is read from. The days that stood out are
         judged against the person's own recent spread, and that window can
         reach further back than the chart does, so one read covers both and
         the fence is computed over the whole of it (ownSpread.ts). */
      const readFrom = Math.min(fromEpochDay, todayEpochDay - OWN_SPREAD_WINDOW_DAYS + 1);
      const readTo = Math.max(toEpochDay, todayEpochDay);

      const [sideEffects, doses, misgendered, correctlyGendered, dysphoria, euphoria] = await Promise.all([
        areas.sideEffects.getSideEffectsInRange(fromEpochDay, toEpochDay),
        areas.doses.getDoses(fromEpochDay, toEpochDay),
        areas.stats.tallyTrend('misgendered', readFrom, readTo),
        areas.stats.tallyTrend('correctly_gendered', readFrom, readTo),
        areas.stats.bodyRegionReadings('dysphoria', readFrom, readTo),
        areas.stats.bodyRegionReadings('euphoria', readFrom, readTo)
      ]);

      const sources: ChartAnnotationSource[] = [
        ...sideEffects.map((effect) => ({
          id: effect.id,
          kind: 'sideEffect' as const,
          name: effect.name,
          startEpochDay: effect.epochDay,
          endEpochDay: null,
          // No screen for one side effect, so the screen that owns them
          // (searchHitRows.ts's rule, and dayRows.ts sends its row there too).
          href: '/settings/side-effects'
        })),
        /* Injections only, and never a skipped one: the band was built from
           exactly these doses (data/hormoneCurve.ts skips the same), so a
           mark under a peak the curve does not have would read as the chart
           disagreeing with itself. An oral or topical dose is not what
           somebody is looking for beside an injectable ester's curve. */
        ...doses
          .filter((dose) => isInjectionDose(dose) && dose.status !== 'skipped')
          .map((dose) => ({
            id: dose.id,
            kind: 'injection' as const,
            // The dose's own drug where it names one, which is null on almost
            // every dose (types.ts). Attribution is not re-run here: it needs
            // the episode history, and a mark that named a drug the dose does
            // not would be a claim rather than a label.
            name: dose.drug,
            startEpochDay: epochDayFromTimestamp(dose.timestamp),
            endEpochDay: null,
            href: '/doses'
          })),
        ...standoutDays(misgendered, todayEpochDay).map((day) => ({
          id: `tally-misgendered-${day}`,
          kind: 'tallyMisgendered' as const,
          name: null,
          startEpochDay: day,
          endEpochDay: null,
          href: '/tally'
        })),
        ...standoutDays(correctlyGendered, todayEpochDay).map((day) => ({
          id: `tally-correctly-gendered-${day}`,
          kind: 'tallyCorrectlyGendered' as const,
          name: null,
          startEpochDay: day,
          endEpochDay: null,
          href: '/tally'
        })),
        ...standoutReadings(dysphoria, todayEpochDay, 'bodyRegionDysphoria'),
        ...standoutReadings(euphoria, todayEpochDay, 'bodyRegionEuphoria')
      ];

      return annotationsInRange(sources, { from: fromEpochDay, to: toEpochDay, today: todayEpochDay });
    }
  };
}

/** The days a counter stood above the person's own recent spread.

    A day with no taps is absent from the trend rather than present as a
    zero, which is what the fence wants: the spread is over the counts on the
    days somebody logged one, not over every day in the calendar. Counting
    the silent days as zeroes would drag the quartiles to zero and mark every
    day anything happened at all. */
function standoutDays(trend: readonly { day: number; value: number }[], todayEpochDay: number): number[] {
  const readings: DayValue[] = trend.map((point) => ({ epochDay: point.day, value: point.value }));
  return aboveOwnSpread(readings, todayEpochDay).map((reading) => reading.epochDay);
}

/** The readings that stood above the person's own recent spread, judged one
    region at a time.

    Per region and not over all of them together: the regions somebody logs
    are not one scale. Chest readings that sit around 70 and hand readings
    that sit around 10 pooled into one sample give a fence in the middle,
    which marks every ordinary chest reading and no hand reading however far
    it moved. */
function standoutReadings(
  readings: readonly RegionReading[],
  todayEpochDay: number,
  kind: 'bodyRegionDysphoria' | 'bodyRegionEuphoria'
): ChartAnnotationSource[] {
  const byRegion = new Map<string, RegionReading[]>();
  for (const reading of readings) {
    const found = byRegion.get(reading.region);
    if (found) found.push(reading);
    else byRegion.set(reading.region, [reading]);
  }

  const sources: ChartAnnotationSource[] = [];
  for (const [region, ofRegion] of byRegion) {
    // Two readings of one region on one day are two markers, each keeping
    // its own entry, and the layer gathers them into one mark if they land
    // on the same pixel.
    for (const reading of aboveOwnSpread(ofRegion, todayEpochDay)) {
      sources.push({
        id: `${kind}-${region}-${reading.entryId}`,
        kind,
        // The region's domain id. Its words live in paraglide, which this
        // tier does not import (ADR-0016, ADR-0024), so the screen resolves
        // the name.
        name: region,
        startEpochDay: reading.epochDay,
        endEpochDay: null,
        href: `/entry/${reading.entryId}`
      });
    }
  }
  return sources;
}

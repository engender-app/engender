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
                            about the range a chart covers. */

import { annotationsInRange, type ChartAnnotation, type ChartAnnotationSource } from '../../charts/annotations';
import { SURGERY_RECOVERY_CUTOFF_DAYS } from '../recoveryDay';
import type { DosesArea } from './doses';
import type { ErasArea } from './eras';
import type { JournalingPausesArea } from './journalingPauses';
import type { MilestonesArea } from './milestones';
import type { ProceduresArea } from './procedures';
import type { RegimenArea } from './regimen';
import type { TryoutsArea } from './tryouts';

export interface ChartAnnotationsArea {
  /** What happened between two days, clipped to them and ordered by where it
      sits. `todayEpochDay` is the caller's, not a clock's: a stretch that has
      not ended reaches to today and the schema stores no end for one. */
  getAnnotations(fromEpochDay: number, toEpochDay: number, todayEpochDay: number): Promise<ChartAnnotation[]>;
}

interface Areas {
  milestones: MilestonesArea;
  regimen: RegimenArea;
  doses: DosesArea;
  journalingPauses: JournalingPausesArea;
  tryouts: TryoutsArea;
  procedures: ProceduresArea;
  eras: ErasArea;
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
    }
  };
}

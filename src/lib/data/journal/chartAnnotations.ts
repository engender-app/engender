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

   ## Past appointments (phase 8 features ticket 59, ADR-0066)

   Every past appointment draws through this same seam, named by the
   person's own kind - a consult included, since it is now an appointment
   row like any other rather than a fact reachable only through the
   procedure it happens to name. `todayEpochDay` decides past from future
   here rather than being left to `annotationsInRange`: an appointment is a
   point, and nothing else in this file's selection filters a point kind by
   whether it has happened yet, so an appointment still ahead would draw
   like one that already did unless this seam said otherwise. Future
   appointments are the calendar's mark to draw (ticket 61), not a chart's.

 */

import {
  annotationsInRange,
  type ChartAnnotation,
  type ChartAnnotationDetail,
  type ChartAnnotationSource
} from '../../charts/annotations';
import { finishedGroups, suspendedGroups } from '../areaGroups';
import { SURGERY_RECOVERY_CUTOFF_DAYS } from '../recoveryDay';
import type { AppointmentsArea } from './appointments';
import type { AreaStatesArea } from './areaStates';
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
  appointments: AppointmentsArea;
  areaStates: AreaStatesArea;
  milestones: MilestonesArea;
  regimen: RegimenArea;
  doses: DosesArea;
  journalingPauses: JournalingPausesArea;
  tryouts: TryoutsArea;
  procedures: ProceduresArea;
  eras: ErasArea;
}

/** A record's own words as a tick's line, or nothing where there are none
    (phase 11 UI/UX ticket 49).

    One place decides what counts as written: a description nobody filled in
    arrives as an empty string, an appointment's note as null, and a
    procedure's notes as whatever survived a person clearing the field. The
    kit draws no empty line because none reaches it. */
function writtenNote(text: string | null | undefined): ChartAnnotationDetail | undefined {
  const written = text?.trim();
  return written ? { type: 'note', text: written } : undefined;
}

export function makeChartAnnotationsArea(areas: Areas): ChartAnnotationsArea {
  return {
    async getAnnotations(fromEpochDay, toEpochDay, todayEpochDay) {
      const [milestones, episodes, dosePauses, journalingPauses, tryouts, procedures, eras, areaStates, appointments] =
        await Promise.all([
          areas.milestones.getMilestones(),
          areas.regimen.getEpisodes(),
          areas.doses.getPauses(),
          areas.journalingPauses.getPauses(),
          areas.tryouts.getTryouts(),
          areas.procedures.getProcedures(),
          areas.eras.getEras(),
          areas.areaStates.getAreaStates(),
          areas.appointments.getAppointments()
        ]);

      const drugOf = new Map(episodes.map((episode) => [episode.id, episode.drug]));
      const sources: ChartAnnotationSource[] = [
        ...milestones.map((milestone) => ({
          id: milestone.id,
          kind: 'milestone' as const,
          name: milestone.name,
          startEpochDay: milestone.epochDay,
          endEpochDay: null,
          detail: writtenNote(milestone.description)
        })),
        ...episodes.map((episode) => ({
          id: episode.id,
          kind: 'regimen' as const,
          name: episode.drug,
          startEpochDay: episode.startEpochDay,
          endEpochDay: episode.endEpochDay,
          // Ticket 43: null on every episode still open, and on every one
          // ended before the ticket shipped.
          endReason: episode.endReason
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
          })),
        /* Past appointments (phase 8 features ticket 59, ADR-0066). Filtered
           here rather than left to annotationsInRange: a point kind is kept
           by that function whenever its one day falls in the chart's range,
           and an appointment still ahead is not a day that has fallen
           anywhere yet. `name` is the appointment's own kind, or null where
           the person typed none - kit/chartAnnotation.ts's neutral word is
           what a null name falls back to, the same as every other kind. */
        ...appointments
          .filter((appointment) => appointment.epochDay <= todayEpochDay)
          .map((appointment) => ({
            id: appointment.id,
            kind: 'appointment' as const,
            name: appointment.kind,
            startEpochDay: appointment.epochDay,
            endEpochDay: null,
            detail: writtenNote(appointment.note)
          })),
        /* The day a stream ended (phase 8 features ticket 04). One mark per
           hub row rather than one per archive section, because hair progress
           is two sections finished in one gesture and two ticks on the same
           day would be the query disagreeing with the record. `name` is the
           group's key; the words are kit/chartAnnotation.ts's.

           No `href`. Every screen this can draw on is already the screen of
           some area, and a mark that navigated somewhere else would be a way
           out of the chart it is annotating - the same call the milestone
           mark makes. */
        ...finishedGroups(areaStates).map((group) => ({
          id: `finished-${group.key}`,
          kind: 'finishedArea' as const,
          name: group.key,
          startEpochDay: group.epochDay,
          endEpochDay: null
        })),
        /* The day an area was paused (phase 8 features ticket 51). Same
           shape as the finished mark above, and for the same reason - a flat
           stretch after this day needs explaining as a pause rather than as
           a gap nobody logged. Only ever produced for `SUSPENDABLE_GROUPS`
           in this build (areaGroups.ts), but read generically the same way
           `finishedGroups` is. */
        ...suspendedGroups(areaStates).map((group) => ({
          id: `suspended-${group.key}`,
          kind: 'suspendedArea' as const,
          name: group.key,
          startEpochDay: group.epochDay,
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
          endEpochDay: null,
          detail: writtenNote(procedure.notes)
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

/* Read dated context for a chart range from the existing journal
   areas (ADR-0010). This view owns no data or Archive section.
   Recovery uses SURGERY_RECOVERY_CUTOFF_DAYS. Name a dose pause by
   its episode's drug. Mark only era starts with a day.

   Include past appointments, including consults, under the
   journal's own kind (ADR-0066). Filter them by todayEpochDay
   before converting them to points. The calendar carries future
   visits. Schedule changes have no stored history, and entry days
   already appear in the plotted data. */

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
  tryouts: TryoutsArea;
  procedures: ProceduresArea;
  eras: ErasArea;
}

/** A record's own words as a tick's line, or nothing where there are none.

    One place decides what counts as written: a description nobody filled in arrives as an
    empty string, an appointment's note as null, and a procedure's notes as whatever
    survived a person clearing the field. The kit draws no empty line because none reaches
    it. */
function writtenNote(text: string | null | undefined): ChartAnnotationDetail | undefined {
  const written = text?.trim();
  return written ? { type: 'note', text: written } : undefined;
}

export function makeChartAnnotationsArea(areas: Areas): ChartAnnotationsArea {
  return {
    async getAnnotations(fromEpochDay, toEpochDay, todayEpochDay) {
      const [milestones, episodes, dosePauses, tryouts, procedures, eras, areaStates, appointments] =
        await Promise.all([
          areas.milestones.getMilestones(),
          areas.regimen.getEpisodes(),
          areas.doses.getPauses(),
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
          // Null on every episode still open, and on every one
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
        /* Past appointments (ADR-0066). Filtered
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
        /* The day a stream ended. One mark per
           hub row rather than one per archive section, because voice
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
        /* The day an area was paused. Same
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

/* Pure logic for the journaling pause (phase 5 ticket 21, CONTEXT:
   "Journaling pause"). Kept separate from journal/journalingPauses.ts (the
   CRUD area) the same way doseSchedule.ts's pauseCoversDay sits beside
   doses.ts - so the check-in suppression (platform-sync.ts), the chart's
   pause band and Home's own pause tile all read the same rule rather than
   three copies of "does this range cover this day" drifting apart.

   pauseCoversDay delegates to span.ts's spanCoversDay (phase 8 deepening
   ticket 11); the arithmetic lives once. */

import { spanCoversDay } from './span';

interface JournalingPauseRange {
  id?: string;
  startEpochDay: number;
  endEpochDay: number | null;
}

/** Whether `day` falls inside the range, with a null end meaning still
    running - the same reasoning doseSchedule.ts's pauseCoversDay gives for
    DosePause. */
export function pauseCoversDay(pause: JournalingPauseRange, day: number): boolean {
  return spanCoversDay(pause, day);
}

/** Whether any pause covers `day`. What the live-tile grid and
    platform-sync ask to decide whether to go quiet. */
export function isPausedOn(pauses: readonly JournalingPauseRange[], day: number): boolean {
  return pauses.some((pause) => pauseCoversDay(pause, day));
}

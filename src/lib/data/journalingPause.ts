/* Pure logic for the journaling pause (phase 5 ticket 21, CONTEXT: "Streak" -
   amended). Kept separate from journal/journalingPauses.ts (the CRUD area)
   the same way doseSchedule.ts's pauseCoversDay sits beside doses.ts - so
   `Streak`'s amended computation (journal/stats.ts) and the check-in/Home
   suppression checks (platform-sync.ts, the Home screen) all read the same
   rule rather than three copies of "does this range cover this day" drifting
   apart. */

export interface JournalingPauseRange {
  startEpochDay: number;
  endEpochDay: number | null;
}

/** Whether `day` falls inside the range, with a null end meaning still
    running - the same reasoning doseSchedule.ts's pauseCoversDay gives for
    DosePause. */
export function pauseCoversDay(pause: JournalingPauseRange, day: number): boolean {
  if (day < pause.startEpochDay) return false;
  return pause.endEpochDay === null || day <= pause.endEpochDay;
}

/** Whether any pause covers `day`. What Home and platform-sync ask to decide
    whether to go quiet; `journal/stats.ts`'s streak() asks the same question
    once per day it walks back through. */
export function isPausedOn(pauses: readonly JournalingPauseRange[], day: number): boolean {
  return pauses.some((pause) => pauseCoversDay(pause, day));
}

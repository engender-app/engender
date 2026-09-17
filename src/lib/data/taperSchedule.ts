/* Expected dilation sessions, from a taper's stages (phase 8 features
   ticket 12, CONTEXT: "Taper"). Pure, kept above the journal seam next to
   doseSchedule.ts for the same reason: a session is a question about a
   schedule and a day, not a row anyone stores (ADR-0010). Nothing here
   reads a clock or a database.

   Deliberately no verdict, the same refusal doseSchedule.ts makes: this
   answers "what day was a session expected", and stops. Whether one was
   logged against it, and what that means, is the screen's own question. */

import type { Procedure, Taper, TaperStage } from './types';

/** Whether a procedure is one dilation can follow (audit item 7): the
    surgery screen's own gate for offering the Dilation row at all
    (surgery/+page.svelte), and the schedule editor's own gate for which
    procedures it offers a taper to name (dilation/+page.svelte). Only a
    `custom` kind carries its own opt-in - none of the compiled-in kinds
    can be guessed to include dilation except vaginoplasty (types.ts's own
    note on `Procedure`). Named once so the two screens and schema v83's
    migration cannot drift on what "eligible" means. */
export function dilationEligible(procedure: Pick<Procedure, 'kind' | 'dilationOptIn'>): boolean {
  return procedure.kind === 'vaginoplasty' || (procedure.kind === 'custom' && procedure.dilationOptIn);
}

/** The days `stages` expects a session on, starting at `startEpochDay` and
    stopping at `todayEpochDay` - never past it, since a taper has no
    schedule for a day that has not arrived yet.

    Stages run back to back: the next one's first day is the day after the
    previous one's last, in the order they are declared, regardless of that
    stage's own frequency. A stage with `everyNDays` under 1 expects no
    sessions but still holds its `days` for the stages after it, the way a
    rest stretch a surgeon writes into the plan would - and a stage with no
    days at all contributes nothing and is skipped outright, rather than
    either treated as an error a typed-in plan has no way to raise. */
export function expectedSessionDays(
  taper: Pick<Taper, 'startEpochDay' | 'stages'>,
  todayEpochDay: number
): number[] {
  const days: number[] = [];
  let cursor = taper.startEpochDay;

  for (const stage of taper.stages) {
    if (stage.days < 1) continue;

    if (stage.everyNDays >= 1) {
      for (let day = cursor; day < cursor + stage.days; day += stage.everyNDays) {
        if (day > todayEpochDay) return days;
        if (day >= taper.startEpochDay) days.push(day);
      }
    }

    cursor += stage.days;
  }

  return days;
}

export type { TaperStage };

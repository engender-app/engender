/* Where a procedure's recovery stands against a given day (phase 5 ticket
   07). Pure and kept above the journal seam next to milestoneStatus.ts for
   the same two reasons: nothing here is stored (ADR-0010 - the schema holds
   the surgery date and nothing derived from it, and which day is "today" is
   a local calendar question the data layer has no business answering), and
   the arithmetic wants one home while the wording stays with the screens.

   A surgery date can sit either side of today: it is usually set at the
   consult, months before the operation. So this counts down as readily as it
   counts up, rather than reporting a negative number of days since. What it
   never does is judge the number - no expected duration, no phase, nothing
   about being ahead of or behind anything, which the ticket rules out
   explicitly and daysSinceLastSession (hairRemovalSchedule.ts) already
   refuses for the same reason. */

/** How far a procedure is from its surgery date, or that it has none yet.
    `surgeryDay` is its own case rather than `since` with zero days because
    the wording differs, the same split milestoneStatus gives `today`. */
export type RecoveryDay =
  | { type: 'unscheduled' }
  | { type: 'upcoming'; days: number }
  | { type: 'surgeryDay' }
  | { type: 'since'; days: number };

export function recoveryDay(surgeryEpochDay: number | null, todayEpochDay: number): RecoveryDay {
  if (surgeryEpochDay === null) return { type: 'unscheduled' };
  if (surgeryEpochDay > todayEpochDay) return { type: 'upcoming', days: surgeryEpochDay - todayEpochDay };
  if (surgeryEpochDay === todayEpochDay) return { type: 'surgeryDay' };
  return { type: 'since', days: todayEpochDay - surgeryEpochDay };
}

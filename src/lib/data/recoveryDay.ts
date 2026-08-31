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

/** How long a completed procedure continues to show its recovery day on Home
    before dropping away on its own (phase 5 ticket 47). 90 days covers the
    standard active post-operative recovery window (initial wound healing,
    follow-up checks, lifting of restrictions) across major gender-affirming
    procedures; beyond ~3 months, recovery is long-term and no longer active
    news on Home. */
export const SURGERY_RECOVERY_CUTOFF_DAYS = 90;

/** Selects the nearest active procedure for Home's live tile (ticket 47).
    A procedure qualifies if it has a surgery date set and is either
    upcoming, on surgery day, or within the active recovery cutoff.
    With multiple candidates, the nearest one by distance to today wins. */
export function activeSurgeryProcedure<T extends { surgeryEpochDay: number | null }>(
  procedures: readonly T[],
  todayEpochDay: number,
  cutoffDays = SURGERY_RECOVERY_CUTOFF_DAYS
): T | null {
  const candidates: { procedure: T; distance: number }[] = [];

  for (const procedure of procedures) {
    if (procedure.surgeryEpochDay === null) continue;
    const status = recoveryDay(procedure.surgeryEpochDay, todayEpochDay);
    if (status.type === 'unscheduled') continue;
    if (status.type === 'since' && status.days > cutoffDays) continue;

    const distance = status.type === 'surgeryDay' ? 0 : status.days;
    candidates.push({ procedure, distance });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    return (a.procedure.surgeryEpochDay ?? 0) - (b.procedure.surgeryEpochDay ?? 0);
  });

  return candidates[0].procedure;
}

/** The 5 lifecycle phases of a surgical procedure (phase 5 ticket 12).
    - `planning`: no surgery date set yet (consult questions, prep checklist, insurance)
    - `pre_op`: surgery date set in future (countdown, packing list, pre-op clearance)
    - `surgery_day`: surgery day is today (prompt for milestone recording)
    - `recovery`: 1..90 days post-op (Post-Op Day X badge, feelings diary, wound photo album)
    - `archived`: >90 days post-op (permanent surgical history record)
*/
export type ProcedurePhase = 'planning' | 'pre_op' | 'surgery_day' | 'recovery' | 'archived';

export function procedurePhase(
  surgeryEpochDay: number | null,
  today: number,
  cutoffDays = SURGERY_RECOVERY_CUTOFF_DAYS
): ProcedurePhase {
  if (surgeryEpochDay === null) return 'planning';
  if (surgeryEpochDay > today) return 'pre_op';
  if (surgeryEpochDay === today) return 'surgery_day';
  const days = today - surgeryEpochDay;
  if (days <= cutoffDays) return 'recovery';
  return 'archived';
}


/* Taken and Skip on a fired medication reminder (functional audit ticket 20,
   CONTEXT: "Dose reminder").

   The notification's two buttons run while the journal may well be locked,
   and a locked journal cannot be written: its key only exists once the
   person unlocks. So the native side keeps each tap as a pending action in
   the reminders store, encrypted under its own key (ReminderPayloadStore),
   and this file applies them the next time the journal is open. The person
   is told there, one toast per action.

   Applying reads the journal as it is now, not as it was at the tap: a dose
   logged by hand in between already fills the slot, and the action then
   writes nothing. That is also what makes a replay harmless, if the app
   dies between writing a dose and clearing the action that wrote it. */

import { epochDayFromTimestamp } from '../data/epochDay';
import { matchDoseRoute, type RouteOption } from '../data/doseSchedule';
import type { Journal } from '../data/journal/journal';
import { activeEpisodesAt, sameDrug } from '../data/regimenEpisode';
import { previousOccurrence, type ReminderRule } from '../data/reminderRule';

export type DoseActionKind = 'taken' | 'skipped';

/** One tap on a notification button, as the native side keeps it. */
export interface PendingDoseAction {
  id: string;
  reminderId: string;
  /** The reminder's drug when the notification was posted. */
  drug: string;
  action: DoseActionKind;
  /** When the notification was posted: which firing the tap answers. */
  postedAt: number;
  /** When the button was tapped. */
  at: number;
  /** The reminder's rule as it stood when the notification was posted. A
      rule edited before the tap must not move the slot the tap answers.
      Absent only if the native side could not read one, and then the
      reminder's current rule stands in. */
  rule?: ReminderRule;
}

export type DoseActionOutcome = {
  id: string;
  drug: string;
  action: DoseActionKind;
  /** The day of the slot the action was for. */
  slotEpochDay: number;
} & (
  | { result: 'logged'; doseId: string }
  /** The slot already held a dose, so nothing was written. */
  | { result: 'already' }
  /** A Skip on a day the schedule expected nothing. */
  | { result: 'nothingDue' }
  /** No regimen for the drug was running that day, so there was nothing to
      take the route and the amount from. */
  | { result: 'noRegimen' }
  /** More than one regimen for the drug was running that day, so which one
      the dose belongs to is the person's call, made in the dose log. */
  | { result: 'multipleRegimens' }
);

type DoseActionJournal = Pick<Journal, 'reminders' | 'doses'>;

/** Writes what one pending action means into the journal, or nothing, and
    says which. `routeWords` is ROUTE_OPTIONS (doseLabels.ts), handed in for
    the reason matchDoseRoute gives. */
export async function applyPendingDoseAction(
  journal: DoseActionJournal,
  action: PendingDoseAction,
  routeWords: readonly RouteOption[]
): Promise<DoseActionOutcome> {
  const reminder = (await journal.reminders.getReminders()).find((r) => r.id === action.reminderId);
  const rule = action.rule ?? reminder;
  const fired = rule ? previousOccurrence(rule, new Date(action.postedAt)) : null;
  const firedAt = fired?.getTime() ?? action.postedAt;
  const slotEpochDay = epochDayFromTimestamp(firedAt);
  /* The tap is when the dose was taken, unless it came on a later day: then
     the slot's own day keeps it, at the time the reminder was set for. */
  const timestamp = epochDayFromTimestamp(action.at) === slotEpochDay ? action.at : firedAt;
  const base = { id: action.id, drug: action.drug, action: action.action, slotEpochDay };

  const found = await journal.doses.getComparison({ fromEpochDay: slotEpochDay, toEpochDay: slotEpochDay, drug: action.drug });
  if (found.reason === 'multipleEpisodes') return { ...base, result: 'multipleRegimens' };
  if (found.reason === 'noEpisode' || !sameDrug(found.activeEpisode.drug, action.drug)) {
    return { ...base, result: 'noRegimen' };
  }
  const episode = found.activeEpisode;
  let amount = { dose: episode.dose, doseUnit: episode.doseUnit };

  if (found.reason === null) {
    const rows = found.comparison.rows.filter((row) => row.slot.epochDay === slotEpochDay);
    const open = rows.find((row) => row.dose === null);
    if (open) {
      if (open.slot.amount) amount = open.slot.amount;
    } else {
      /* A schedule that logs its own doses may have written this one before
         the journal was opened. Skip is the person saying otherwise, which
         is the same correction the dose log's own skip makes. */
      const written = rows.find((row) => row.dose?.source === 'schedule' && row.dose.status !== 'skipped')?.dose;
      if (action.action === 'skipped' && written) {
        const doseId = await journal.doses.upsertDose({
          id: written.id,
          timestamp: written.timestamp,
          route: written.route,
          dose: written.dose,
          doseUnit: written.doseUnit,
          status: 'skipped',
          scheduled: written.scheduled,
          drug: written.drug,
          source: 'schedule'
        });
        return { ...base, result: 'logged', doseId };
      }
      if (rows.length > 0) return { ...base, result: 'already' };
      if (action.action === 'skipped') return { ...base, result: 'nothingDue' };
    }
  }

  /* Without a slot to be full, a replay is caught by the dose it wrote. */
  const same = (await journal.doses.getDoses(slotEpochDay, slotEpochDay)).find(
    (dose) => dose.timestamp === timestamp && dose.status === action.action && sameDrug(dose.drug ?? '', episode.drug)
  );
  if (same) return { ...base, result: 'already' };

  const doseId = await journal.doses.upsertDose({
    timestamp,
    route: matchDoseRoute(episode.route, routeWords) ?? 'oral',
    dose: amount.dose,
    doseUnit: amount.doseUnit,
    status: action.action,
    drug: episode.drug,
    source: 'person',
    context: 'reminder'
  });
  return { ...base, result: 'logged', doseId };
}

const DOSE_REMINDER_ROUTE = /^\/care\/doses\?add=1&reminder=([a-z0-9-]+)$/;

/** Where tapping a medication reminder's notification lands: the dose log,
    add form open, on the regimen that is running for its drug. The
    notification only carries the reminder's id, so the drug is looked up
    here, once the journal is open. Any other route comes back unchanged. */
export async function resolveDoseReminderRoute(
  route: string,
  journal: Pick<Journal, 'reminders' | 'regimen'>,
  now: number
): Promise<string> {
  const match = DOSE_REMINDER_ROUTE.exec(route);
  if (!match) return route;
  const reminder = (await journal.reminders.getReminders()).find((r) => r.id === match[1]);
  if (!reminder?.drug) return '/care/doses?add=1';
  const episode = activeEpisodesAt(await journal.regimen.getEpisodes(), now).find((e) => sameDrug(e.drug, reminder.drug!));
  return episode ? `/care/doses?add=1&episode=${episode.id}` : '/care/doses?add=1';
}

/* Deciding what, if anything, changes about a drug's auto-managed run-out
   reminder (phase 4 ticket 04, box 4). Pure: given the drug's stock
   bookkeeping, its projection, and whatever Reminder currently carries its
   `auto_source` marker, decide once whether to create one, move it, drop
   it, or leave it alone. journal/stock.ts calls this identically from
   every write that can move a projection - upsertEntry as well as the
   dose-log writes it is asked to react to - which is the only way this
   avoids two copies of the decision drifting apart, the same reason
   reminderRule.ts's nextOccurrence() is shared by the editor's preview and
   the scheduler.

   THE HANDOFF. A one-off Reminder legitimately fits an approaching run-out
   - the schema's CHECK requires a concrete epoch_day when recurrence is
   NULL - but nothing about the row says "the stock projection put this
   here, not you". That is `auto_source` (migrations.ts v7): a nullable
   column the general reminders editor never sets, so any save from that
   screen clears it - the moment a person edits their own copy, this stops
   touching it. A person's own DELETE looks the same from in here: the
   marker's row is simply gone. Both converge on one signal -
   `everCreated` true and no matching reminder found - and get the same
   answer: mark the drug dismissed and stop, rather than recreate a prompt
   somebody just silenced.

   The one way back in is recording a fresh stock count: stock.ts's
   upsertEntry clears `dismissed` there, because that is a deliberate act,
   not a background dose write - re-arming on it is not the silent
   recreation this module exists to avoid.

   WHEN THE ROW APPEARS, VERSUS WHEN IT FIRES. There is no separate
   "getting close" threshold gating creation: as soon as a projection
   exists at all, exactly one reminder is kept for the drug, dated
   `RUN_OUT_LEAD_DAYS` before the projected run-out (or today, once that
   would otherwise be in the past). A projection recorded far out just
   means today's answer is a reminder dated far out too, the same as any
   one-off a person could date themselves - nothing about the Reminder
   mechanism distinguishes "created early" from "created late". Gating
   creation on a second, nearer threshold was tried and rejected: reusing
   `RUN_OUT_LEAD_DAYS` for both "how close before we start tracking" and
   "how many days before run-out the prompt fires" means the two coincide
   the moment tracking starts, so the very first prompt anyone would ever
   get is dated today - never the future date the acceptance criteria
   describe. One threshold, used once, avoids that. */

import { RUN_OUT_LEAD_DAYS, type StockProjection } from './stockProjection';

export interface StockReminderState {
  /** Whether an auto reminder has ever been created for this drug. */
  everCreated: boolean;
  /** Set once a person's own edit or delete took the reminder over; while
      this is true this module makes no more decisions for the drug, until
      a fresh stock entry clears it (stock.ts). */
  dismissed: boolean;
}

/** The Reminder row currently carrying this drug's `auto_source` marker,
    if any. */
export interface StockReminderRow {
  id: string;
  epochDay: number;
}

export type StockReminderAction =
  | { kind: 'none' }
  | { kind: 'mark-dismissed' }
  | { kind: 'clear'; reminderId: string }
  | { kind: 'create'; epochDay: number }
  | { kind: 'update'; reminderId: string; epochDay: number };

/** One decision for one drug. `existing` must already be looked up by
    `auto_source` - this function does not know how, only what it means to
    find one or not. */
export function reconcileStockReminder(
  state: StockReminderState,
  projection: StockProjection,
  existing: StockReminderRow | null,
  asOfEpochDay: number
): StockReminderAction {
  if (state.dismissed) return { kind: 'none' };
  if (state.everCreated && !existing) return { kind: 'mark-dismissed' };

  const runOutEpochDay = projection.runOutEpochDay;
  if (runOutEpochDay === null) {
    return existing ? { kind: 'clear', reminderId: existing.id } : { kind: 'none' };
  }

  const epochDay = Math.max(asOfEpochDay, runOutEpochDay - RUN_OUT_LEAD_DAYS);
  if (existing) {
    return existing.epochDay === epochDay ? { kind: 'none' } : { kind: 'update', reminderId: existing.id, epochDay };
  }
  return { kind: 'create', epochDay };
}

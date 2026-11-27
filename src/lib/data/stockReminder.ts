/* Decide whether to create, move or drop a drug's projected run-out
   reminder. All writes that affect the projection call this rule.

   Use auto_source to distinguish the managed reminder. Saving it in the
   reminder editor clears the marker. If a marker has existed and now
   has no matching row, treat editing or deletion as dismissal. Only a
   fresh stock count clears that dismissal.

   Keep one reminder once a projection exists. Schedule it
   RUN_OUT_LEAD_DAYS before run-out, clamped at today. A second
   creation threshold would make the first reminder fire immediately. */

import { RUN_OUT_LEAD_DAYS, type StockProjection } from './stockProjection';

interface StockReminderState {
  /** Whether an auto reminder has ever been created for this drug. */
  everCreated: boolean;
  /** Set once a person's own edit or delete took the reminder over; while
      this is true this module makes no more decisions for the drug, until
      a fresh stock entry clears it (stock.ts). */
  dismissed: boolean;
}

/** The Reminder row currently carrying this drug's `auto_source` marker,
    if any. */
interface StockReminderRow {
  id: string;
  epochDay: number;
}

type StockReminderAction =
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

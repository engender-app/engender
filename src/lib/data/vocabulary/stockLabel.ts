/* The wording for a medication stock projection (phase 5 deepening ticket
   06): one place that turns a StockProjection into what a person reads, so
   /settings/stock, /doses and the entry editor's quick-log chip say the same
   thing the same way (ADR-0046). Moved here from /settings/stock, which had
   it first and only. */

import { m } from '$lib/paraglide/messages';
import { fmtDay } from '../dates';
import { RUN_OUT_LEAD_DAYS, type StockProjection } from '../stockProjection';

/** "N unit left" - the one sentence for a remaining count, in mg, vials,
    pills or whatever the entry's own unit says. Also stands alone: the
    quick-log chip states only this, deliberately dropping the run-out
    reading (see stockRunOutLabel's doc). */
export function stockRemainingLabel(remaining: number, unit: string): string {
  return m.stock_remaining({ count: remaining, unit });
}

export interface StockRunOutLabel {
  text: string;
  /** Whether this reading takes the warn treatment - run out already, or
      inside RUN_OUT_LEAD_DAYS. Never true for a reading the chip shows,
      because the chip states a quantity and does not warn. */
  warn: boolean;
}

/** The run-out half of the reading: unknown, already out, soon, or a dated
    projection - never a bare day count, which would need recomputing on
    every visit the way a stored balance would (ADR-0046). */
export function stockRunOutLabel(projection: StockProjection, asOfEpochDay: number): StockRunOutLabel {
  const { remaining, runOutEpochDay } = projection;
  const warn = remaining <= 0 || (runOutEpochDay !== null && runOutEpochDay - asOfEpochDay <= RUN_OUT_LEAD_DAYS);

  if (runOutEpochDay === null) return { text: m.stock_run_out_unknown(), warn };
  if (remaining <= 0) return { text: m.stock_run_out_now(), warn };

  const date = fmtDay(runOutEpochDay, { day: 'numeric', month: 'short', year: 'numeric' });
  const text = runOutEpochDay - asOfEpochDay <= RUN_OUT_LEAD_DAYS ? m.stock_run_out_soon({ date }) : m.stock_run_out({ date });
  return { text, warn };
}

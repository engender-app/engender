/* The wording for a medication stock projection (phase 5 deepening ticket
   06): one place that turns a StockProjection into what a person reads, so
   /settings/stock, /doses and the entry editor's quick-log chip say the same
   thing the same way (ADR-0046). Moved here from /settings/stock, which had
   it first and only. */

import { m } from '$lib/paraglide/messages';
import { fmtDay } from '../dates';
import { RUN_OUT_LEAD_DAYS, type StockProjection } from '../stockProjection';
import { inUseWindowEndEpochDay, isPastInUseWindow, type InUseWindow } from '../inUseWindow';

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

const fmtWindowDay = (epochDay: number): string => fmtDay(epochDay, { day: 'numeric', month: 'short', year: 'numeric' });

/** "Opened {date}" - null when no opened date was typed, the same way a
    falsy line is one ListRow's subtitle does not have. */
export function stockOpenedLabel(openedEpochDay: number | null): string | null {
  return openedEpochDay === null ? null : m.stock_opened_line({ date: fmtWindowDay(openedEpochDay) });
}

/** The in-use window's own line, plain either side of it (ticket 13: no
    adjective for a container past its window, unlike stockRunOutLabel's
    `warn`). Null when nothing was typed to project from. */
export function stockWindowLabel(window: InUseWindow, asOfEpochDay: number): string | null {
  const end = inUseWindowEndEpochDay(window);
  if (end === null) return null;
  const date = fmtWindowDay(end);
  return isPastInUseWindow(window, asOfEpochDay) ? m.stock_window_past({ date }) : m.stock_window_until({ date });
}

/** Opened and its window folded into one row line rather than two - the
    same "·" join `dlb_tag_counts`/`exposure_dose_total_sub` already use to
    chain two facts, and one fewer line for a row that already carries the
    stock projection's own three. Null when no opened date was typed. */
export function stockOpenedWindowLine(
  entry: { openedEpochDay: number | null; inUseWindowDays: number | null; inUseEndEpochDay: number | null },
  asOfEpochDay: number
): string | null {
  if (entry.openedEpochDay === null) return null;
  const opened = stockOpenedLabel(entry.openedEpochDay)!;
  const window = stockWindowLabel({ ...entry, openedEpochDay: entry.openedEpochDay }, asOfEpochDay);
  return window === null ? opened : `${opened} · ${window}`;
}

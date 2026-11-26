/* The wording for a medication stock projection: one place that turns a StockProjection into what a person reads, so
   /settings/stock, /doses and the entry editor's quick-log chip say the same
   thing the same way (ADR-0046). Moved here from /settings/stock, which had
   it first and only. */

import { m } from '$lib/paraglide/messages';
import { fmtDay, intlLocale } from '../dates';
import { RUN_OUT_LEAD_DAYS, type StockProjection } from '../stockProjection';
import { inUseWindowEndEpochDay, isPastInUseWindow, type InUseWindow } from '../inUseWindow';

/** "N unit left" - the one sentence for a remaining count, in mg, vials,
    pills or whatever the entry's own unit says. Also stands alone: the
    quick-log chip states only this, deliberately dropping the run-out
    reading (see stockRunOutLabel's doc).

    The count can be a fraction once a unit holds several doses (1.4 vials),
    so it is rounded to two places and localized: a Polish reader expects
    "1,4", not "1.4". */
export function stockRemainingLabel(remaining: number, unit: string): string {
  const count = new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(remaining);
  return m.stock_remaining({ count, unit });
}

interface StockRunOutLabel {
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
function stockOpenedLabel(openedEpochDay: number | null): string | null {
  return openedEpochDay === null ? null : m.stock_opened_line({ date: fmtWindowDay(openedEpochDay) });
}

/** The in-use window's own line, plain either side of it (ticket 13: no
    adjective for a container past its window, unlike stockRunOutLabel's
    `warn`). Null when nothing was typed to project from. */
function stockWindowLabel(window: InUseWindow, asOfEpochDay: number): string | null {
  const end = inUseWindowEndEpochDay(window);
  if (end === null) return null;
  const date = fmtWindowDay(end);
  return isPastInUseWindow(window, asOfEpochDay) ? m.stock_window_past({ date }) : m.stock_window_until({ date });
}

/** Choose Home's stock notice title and body together. Counts at zero
    or below are already out, regardless of lead time. Otherwise use
    the reorder-by date when lead time is set, or projected run-out
    date when it is absent. Dates avoid a misleading countdown.

    The caller formats the date so these branches stay testable in
    Node without Paraglide (ADR-0016). */
export function stockNotice(
  row: { projection: { remaining: number }; entry: { drug: string; leadTimeDays: number | null } },
  date: string
): { title: string; body: string } {
  const { drug, leadTimeDays } = row.entry;
  if (row.projection.remaining <= 0) return { title: m.notice_stock_low_title(), body: m.notice_stock_out_body({ drug }) };
  if (leadTimeDays !== null) return { title: m.notice_stock_reorder_title(), body: m.notice_stock_reorder_body({ drug, date }) };
  return { title: m.notice_stock_low_title(), body: m.notice_stock_projected_body({ drug, date }) };
}

/** The supply's expiry day and the pharmacy note, one row line joined with
    the same "·". Logged and shown, never
    advised on: a past date reads "Expired", in the same plain style as the
    window line, with no warn treatment and no suggestion. Null when neither
    was typed. */
export function stockSupplyLine(
  entry: { expiryEpochDay: number | null; pharmacyNote: string | null },
  asOfEpochDay: number
): string | null {
  const parts: string[] = [];
  if (entry.expiryEpochDay !== null) {
    const date = fmtWindowDay(entry.expiryEpochDay);
    parts.push(entry.expiryEpochDay < asOfEpochDay ? m.stock_expired_line({ date }) : m.stock_expiry_line({ date }));
  }
  if (entry.pharmacyNote) parts.push(entry.pharmacyNote);
  return parts.length ? parts.join(' · ') : null;
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

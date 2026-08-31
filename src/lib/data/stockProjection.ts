/* Remaining medication stock and its run-out projection (phase 4 ticket 04,
   CONTEXT: "Medication stock", "Run-out projection", "Regimen episode",
   "Dose event", "Dose pause"). Pure, kept above the journal seam beside
   doseSchedule.ts and labTiming.ts: nothing here reads a clock or a
   database, and both figures are derived on read rather than stored
   (ADR-0046, generalizing ADR-0010's rule against stored derived state) -
   the schema comment at medication_stock's own migration (v7) argues why a
   decremented number would drift the way `reminder.trigger_time` did, and
   why that is not ticket 03's stored-context exception: every dose this
   projects over is still sitting in `dose_event`, unlike the dose log a lab
   draw's context was measured against.

   Scoped by drug (free text on RegimenEpisode.drug), matched exactly the
   way an analyte's unit or a lab provider is (CONTEXT: "Analyte", "Lab
   provider") - not by regimen episode, because a dose or route change on
   the same drug starts a new episode, and an episode-scoped count would go
   stale on the very next adjustment.

   The trailing consumption rate deliberately does not reach for
   dose_schedule or dose_pause, the way labTiming.ts's day-of-interval does
   not reach for dose_schedule: a schedule is optional and one per episode,
   so a figure that depended on one would silently go missing for someone
   who has never set one (labTiming.ts's own reasoning). Working the pause
   case through shows a second reason, in the opposite direction from the
   one that reasoning might suggest: excluding a pause's days from the
   trailing window - mirroring how adherence() excludes them from the
   expected-slot count - raises the rate back to the non-paused pace and
   projects an EARLIER run-out, which is backwards. Nothing is being
   consumed while a pause runs, so the stock lasts longer in calendar time,
   not less. Leaving every calendar day in the denominator - counting a
   pause exactly like a run of skipped doses, both zero-consumption days
   that pull the average down - is what pushes the date later, which is
   the direction box 3 asks for. */

import { epochDayFromTimestamp } from './epochDay';
import { attributeDrug } from './regimenEpisode';
import type { DoseEvent, RegimenEpisode } from './types';

/** How many trailing days of the dose log the consumption rate is
    estimated from, capped at how long the current stock entry has been in
    effect when that is shorter - there is nothing to estimate from before
    the count was recorded. */
export const TRAILING_WINDOW_DAYS = 30;

/** How many days before a projected run-out an Android prompt is dated
    (stockReminder.ts) - and today, once that would otherwise fall in the
    past. Arbitrary but has to be something; five days is enough notice to
    reorder. Not a threshold for whether to create the prompt at all -
    stockReminder.ts's header explains why reusing this figure as both
    would date the very first prompt anyone gets today, never the future
    day the acceptance criteria describe. */
export const RUN_OUT_LEAD_DAYS = 5;

export interface StockEntry {
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
}

export interface StockProjection {
  /** `quantity` minus every non-skipped dose logged against this drug on
      or after `recordedEpochDay`. Can go negative - the count that was
      recorded has already been outrun. */
  remaining: number;
  /** Non-skipped doses per calendar day over the trailing window, or null
      when the window held no calendar days to average over (a stock entry
      recorded after `asOfEpochDay`, which only backdating could produce). */
  dailyRate: number | null;
  /** The projected run-out day. `asOfEpochDay` itself once `remaining` is
      already at or below zero. Null when there is no rate to project
      from, or the rate is zero - nothing consumed in the window, so at
      this pace the stock never runs out. */
  runOutEpochDay: number | null;
  /** Doses in `[stock.recordedEpochDay, asOfEpochDay]` left out of every
      stock's count because more than one concurrent regimen episode was
      active and the dose named no drug of its own to break the tie (phase
      5 ticket 38). Whole-window rather than this drug's own, since an
      ambiguous dose cannot be told apart for any drug, not just this one -
      the same figure appears on every entry's projection for the window it
      shares. */
  excludedDoses: number;
}

const isConsuming = (dose: DoseEvent) => dose.status !== 'skipped';

const drugsMatch = (a: string, b: string) => a.trim() === b.trim();

/** Whether `dose` counts against `stock`'s drug: taken or changed - a
    skipped dose used nothing - and attributed (regimenEpisode.ts) to this
    drug, not necessarily to the episode active when the stock was
    recorded. */
function consumesStock(dose: DoseEvent, stock: StockEntry, episodes: readonly RegimenEpisode[]): boolean {
  if (!isConsuming(dose)) return false;
  const { drug } = attributeDrug(episodes, dose);
  return drug !== null && drugsMatch(drug, stock.drug);
}

/** `stock`'s projection as of `asOfEpochDay`. `doses` need only cover
    `[stock.recordedEpochDay, asOfEpochDay]` - nothing outside that range
    is read - and need not already be scoped to this drug: this function
    does that itself, via `episodes`, the way doseSchedule.ts's callers are
    trusted to have scoped theirs to one episode (this one instead resolves
    per dose, since a drug can span more than one). */
export function projectStock(
  stock: StockEntry,
  doses: readonly DoseEvent[],
  episodes: readonly RegimenEpisode[],
  asOfEpochDay: number
): StockProjection {
  const inWindow = (dose: DoseEvent) => {
    const day = epochDayFromTimestamp(dose.timestamp);
    return day >= stock.recordedEpochDay && day <= asOfEpochDay;
  };

  const consumed = doses.filter((dose) => inWindow(dose) && consumesStock(dose, stock, episodes));
  const remaining = stock.quantity - consumed.length;
  const excludedDoses = doses.filter(
    (dose) => inWindow(dose) && isConsuming(dose) && attributeDrug(episodes, dose).ambiguous
  ).length;

  const windowStart = Math.max(stock.recordedEpochDay, asOfEpochDay - TRAILING_WINDOW_DAYS + 1);
  const windowDays = asOfEpochDay - windowStart + 1;
  const consumedInWindow = consumed.filter((dose) => epochDayFromTimestamp(dose.timestamp) >= windowStart);
  const dailyRate = windowDays > 0 ? consumedInWindow.length / windowDays : null;

  if (remaining <= 0) return { remaining, dailyRate, runOutEpochDay: asOfEpochDay, excludedDoses };
  if (!dailyRate) return { remaining, dailyRate, runOutEpochDay: null, excludedDoses };
  return { remaining, dailyRate, runOutEpochDay: asOfEpochDay + Math.ceil(remaining / dailyRate), excludedDoses };
}

/** Threshold in days below which a medication stock triggers a low-stock notice. */
export const STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS = 7;
export const STOCK_NOTICE_SNOOZE_STORAGE_KEY = 'stock_notice_snooze_until';
export const STOCK_NOTICE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

function resolveStorage(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

export function isStockNoticeSnoozed(nowMs: number = Date.now(), storage?: Storage): boolean {
  const s = resolveStorage(storage);
  if (!s) return false;
  try {
    const raw = s.getItem(STOCK_NOTICE_SNOOZE_STORAGE_KEY);
    if (!raw) return false;
    const until = Number(raw);
    return !Number.isNaN(until) && nowMs < until;
  } catch {
    return false;
  }
}

export function snoozeStockNotice(nowMs: number = Date.now(), storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.setItem(STOCK_NOTICE_SNOOZE_STORAGE_KEY, String(nowMs + STOCK_NOTICE_SNOOZE_DURATION_MS));
  } catch {
    // Storage write failure ignored gracefully.
  }
}

export function clearStockNoticeSnooze(storage?: Storage): void {
  const s = resolveStorage(storage);
  if (!s) return;
  try {
    s.removeItem(STOCK_NOTICE_SNOOZE_STORAGE_KEY);
  } catch {
    // Storage remove failure ignored gracefully.
  }
}

export function isStockDepletingSoon(
  projection: StockProjection,
  asOfEpochDay: number,
  thresholdDays?: number
): boolean;
export function isStockDepletingSoon(
  stock: StockEntry,
  doses: readonly DoseEvent[],
  episodes: readonly RegimenEpisode[],
  asOfEpochDay: number,
  thresholdDays?: number
): boolean;
export function isStockDepletingSoon(
  stockOrProjection: StockEntry | StockProjection,
  dosesOrAsOf: readonly DoseEvent[] | number,
  episodesOrThreshold?: readonly RegimenEpisode[] | number,
  asOfEpochDayArg?: number,
  thresholdDaysArg: number = STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS
): boolean {
  if ('remaining' in stockOrProjection && typeof dosesOrAsOf === 'number') {
    const projection = stockOrProjection;
    const asOfEpochDay = dosesOrAsOf;
    const thresholdDays =
      typeof episodesOrThreshold === 'number' ? episodesOrThreshold : STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS;
    if (projection.runOutEpochDay === null) return false;
    return projection.runOutEpochDay - asOfEpochDay <= thresholdDays;
  }
  const stock = stockOrProjection as StockEntry;
  const doses = dosesOrAsOf as readonly DoseEvent[];
  const episodes = episodesOrThreshold as readonly RegimenEpisode[];
  const asOfEpochDay = asOfEpochDayArg!;
  const thresholdDays = thresholdDaysArg ?? STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS;
  const projection = projectStock(stock, doses, episodes, asOfEpochDay);
  if (projection.runOutEpochDay === null) return false;
  return projection.runOutEpochDay - asOfEpochDay <= thresholdDays;
}

export interface DepletingStockInfo<T = StockEntry> {
  entry: T;
  projection: StockProjection;
  daysRemaining: number;
}

export function depletingStocks<T extends { drug: string }>(
  rows: readonly { entry: T; projection: StockProjection }[],
  asOfEpochDay: number,
  thresholdDays: number = STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS
): DepletingStockInfo<T>[] {
  const result: DepletingStockInfo<T>[] = [];
  for (const { entry, projection } of rows) {
    if (isStockDepletingSoon(projection, asOfEpochDay, thresholdDays)) {
      const daysRemaining = Math.max(0, projection.runOutEpochDay! - asOfEpochDay);
      result.push({ entry, projection, daysRemaining });
    }
  }
  return result.sort((a, b) => a.daysRemaining - b.daysRemaining || a.entry.drug.localeCompare(b.entry.drug));
}


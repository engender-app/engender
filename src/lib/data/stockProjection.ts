/* Remaining medication stock and its run-out projection (phase 4 ticket 04,
   CONTEXT: pending - "Regimen episode", "Dose event", "Dose pause"). Pure,
   kept above the journal seam beside doseSchedule.ts and labTiming.ts:
   nothing here reads a clock or a database, and both figures are derived
   on read rather than stored (ADR-0010) - the schema comment at
   medication_stock's own migration (v7) argues why a decremented number
   would drift the way `reminder.trigger_time` did, and why that is not
   ticket 03's stored-context exception: every dose this projects over is
   still sitting in `dose_event`, unlike the dose log a lab draw's context
   was measured against.

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
import { resolveEpisodeAt } from './regimenEpisode';
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
}

const isConsuming = (dose: DoseEvent) => dose.status !== 'skipped';

const drugsMatch = (a: string, b: string) => a.trim() === b.trim();

/** Whether `dose` counts against `stock`'s drug: taken or changed - a
    skipped dose used nothing - and resolved (regimenEpisode.ts) to an
    episode naming this drug, not necessarily the episode active when the
    stock was recorded. */
function consumesStock(dose: DoseEvent, stock: StockEntry, episodes: readonly RegimenEpisode[]): boolean {
  if (!isConsuming(dose)) return false;
  const episode = resolveEpisodeAt(episodes, dose.timestamp);
  return episode !== null && drugsMatch(episode.drug, stock.drug);
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
  const consumed = doses.filter((dose) => {
    const day = epochDayFromTimestamp(dose.timestamp);
    return day >= stock.recordedEpochDay && day <= asOfEpochDay && consumesStock(dose, stock, episodes);
  });
  const remaining = stock.quantity - consumed.length;

  const windowStart = Math.max(stock.recordedEpochDay, asOfEpochDay - TRAILING_WINDOW_DAYS + 1);
  const windowDays = asOfEpochDay - windowStart + 1;
  const consumedInWindow = consumed.filter((dose) => epochDayFromTimestamp(dose.timestamp) >= windowStart);
  const dailyRate = windowDays > 0 ? consumedInWindow.length / windowDays : null;

  if (remaining <= 0) return { remaining, dailyRate, runOutEpochDay: asOfEpochDay };
  if (!dailyRate) return { remaining, dailyRate, runOutEpochDay: null };
  return { remaining, dailyRate, runOutEpochDay: asOfEpochDay + Math.ceil(remaining / dailyRate) };
}

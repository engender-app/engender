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
   the direction box 3 asks for. The decision behind this paragraph is
   ADR-0055, which restates it from ADR-0032; the streak half of that older
   one is gone. */

import { epochDayFromTimestamp } from './epochDay';
import { attributeDrug, drugSpans } from './regimenEpisode';
import { rangesFromCuts } from './span';
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

/** The first day of the trailing window the consumption rate is estimated
    over: `TRAILING_WINDOW_DAYS` back from `asOfEpochDay`, or the day the
    count was recorded when that is later - there is nothing to estimate
    from before the count. */
export function trailingWindowStart(stock: StockEntry, asOfEpochDay: number): number {
  return Math.max(stock.recordedEpochDay, asOfEpochDay - TRAILING_WINDOW_DAYS + 1);
}

/** The three figures a projection is made of, however they were counted.
    All three are counts of doses, never the doses themselves: a projection
    needs to know how many, not which. */
export interface StockDoseCounts {
  /** Doses consuming this drug's stock over `[recordedEpochDay,
      asOfEpochDay]` - taken or changed, and attributed to this drug. */
  consumed: number;
  /** Those of them falling on or after `trailingWindowStart`. */
  consumedInTrailingWindow: number;
  /** Consuming doses in the same window that named no drug while more than
      one concurrent episode was active, so no drug's count reflects them. */
  excluded: number;
}

/** `stock`'s projection from counts already taken over its window. The
    whole of the rule about what a projection means - a `remaining` free to
    go negative, a rate averaged over calendar days including the ones that
    consumed nothing, a run-out day at `asOfEpochDay` once the count is
    already outrun - lives here, so the two ways of arriving at the counts
    cannot drift apart. */
export function projectStockFromCounts(
  stock: StockEntry,
  counts: StockDoseCounts,
  asOfEpochDay: number
): StockProjection {
  const remaining = stock.quantity - counts.consumed;
  const excludedDoses = counts.excluded;

  const windowDays = asOfEpochDay - trailingWindowStart(stock, asOfEpochDay) + 1;
  const dailyRate = windowDays > 0 ? counts.consumedInTrailingWindow / windowDays : null;

  if (remaining <= 0) return { remaining, dailyRate, runOutEpochDay: asOfEpochDay, excludedDoses };
  if (!dailyRate) return { remaining, dailyRate, runOutEpochDay: null, excludedDoses };
  return { remaining, dailyRate, runOutEpochDay: asOfEpochDay + Math.ceil(remaining / dailyRate), excludedDoses };
}

/** How many non-skipped doses carry each stored `drug` value in each of
    the ranges asked for. Declared structurally rather than imported from
    the doses area, so this module still depends on nothing below the
    journal seam: `DosesArea.countConsumingDosesByDrug` satisfies it. */
export type DrugDoseCounter = (
  ranges: readonly { fromEpochDay: number; toEpochDay: number }[]
) => Promise<readonly { drug: string | null; countsByRange: readonly number[] }[]>;

/** Every entry's projection as of `asOfEpochDay`, in the order given,
    without ever holding a dose.

    `count` is asked one question, over ranges chosen here: the window is
    cut wherever any entry's answer could change - where a drug-less dose
    starts attributing differently (`drugSpans`), where a count was taken,
    and where a trailing rate window opens. Each range therefore sits inside
    exactly one attribution span, so a range's drug-less doses all belong to
    the same drug or to none, and each entry's three figures are sums over
    the ranges from its count day onward.

    Still pure in the sense this module means: no clock and no database, only
    a function that answers a counting question. What `count` must not be is
    a source of the attribution rule - it is handed date windows and reports
    what the `drug` column holds, and the resolving happens here. */
export async function projectEveryStock(
  entries: readonly StockEntry[],
  episodes: readonly RegimenEpisode[],
  asOfEpochDay: number,
  count: DrugDoseCounter
): Promise<StockProjection[]> {
  if (entries.length === 0) return [];

  const from = Math.min(...entries.map((entry) => entry.recordedEpochDay), asOfEpochDay);
  const spans = drugSpans(episodes, from, asOfEpochDay);
  const ranges = rangesFromCuts(
    [
      ...spans.map((span) => span.fromEpochDay),
      ...entries.flatMap((entry) => [entry.recordedEpochDay, trailingWindowStart(entry, asOfEpochDay)])
    ],
    from,
    asOfEpochDay
  );

  /* Every range starts on a cut, and the spans cover the same window with
     no gap, so each range does sit inside one - a missing span would mean
     the two cut sets had come apart, which is this module's own bug and not
     something to paper over with a zero. */
  const spanForRange = ranges.map((range) => {
    const span = spans.find((s) => range.fromEpochDay >= s.fromEpochDay && range.fromEpochDay <= s.toEpochDay);
    if (!span) throw new Error(`no attribution span covers day ${range.fromEpochDay}`);
    return span;
  });

  /* Doses that named a drug are keyed by that name, trimmed the way a drug
     is matched everywhere else; doses that named none are kept apart,
     because which drug they count against is the span's answer rather than
     their own. A falsy `drug` is what attributeDrug treats as naming
     nothing, so the same test decides it here. */
  const namedByRange = ranges.map(() => new Map<string, number>());
  const unnamedByRange = ranges.map(() => 0);
  for (const row of await count(ranges)) {
    row.countsByRange.forEach((n, index) => {
      if (!row.drug) {
        unnamedByRange[index] += n;
        return;
      }
      const key = row.drug.trim();
      namedByRange[index].set(key, (namedByRange[index].get(key) ?? 0) + n);
    });
  }

  return entries.map((entry) => {
    const drug = entry.drug.trim();
    const windowStart = trailingWindowStart(entry, asOfEpochDay);
    const counts: StockDoseCounts = { consumed: 0, consumedInTrailingWindow: 0, excluded: 0 };

    for (const [index, range] of ranges.entries()) {
      if (range.fromEpochDay < entry.recordedEpochDay) continue;
      const span = spanForRange[index];
      const unnamed = unnamedByRange[index];
      const attributed =
        (namedByRange[index].get(drug) ?? 0) + (span.drug !== null && span.drug.trim() === drug ? unnamed : 0);

      counts.consumed += attributed;
      if (range.fromEpochDay >= windowStart) counts.consumedInTrailingWindow += attributed;
      if (span.ambiguous) counts.excluded += unnamed;
    }

    return projectStockFromCounts(entry, counts, asOfEpochDay);
  });
}

/** `stock`'s projection as of `asOfEpochDay`, counting the doses itself.
    `doses` need only cover `[stock.recordedEpochDay, asOfEpochDay]` -
    nothing outside that range is read - and need not already be scoped to
    this drug: this function does that itself, via `episodes`, the way
    doseSchedule.ts's callers are trusted to have scoped theirs to one
    episode (this one instead resolves per dose, since a drug can span more
    than one).

    For a caller holding the doses already. A caller that would have to
    fetch a decade of them to count three numbers should ask its area for
    the counts and use `projectStockFromCounts` instead (stock.ts). */
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

  const windowStart = trailingWindowStart(stock, asOfEpochDay);
  const consumed = doses.filter((dose) => inWindow(dose) && consumesStock(dose, stock, episodes));

  return projectStockFromCounts(
    stock,
    {
      consumed: consumed.length,
      consumedInTrailingWindow: consumed.filter((dose) => epochDayFromTimestamp(dose.timestamp) >= windowStart)
        .length,
      excluded: doses.filter(
        (dose) => inWindow(dose) && isConsuming(dose) && attributeDrug(episodes, dose).ambiguous
      ).length
    },
    asOfEpochDay
  );
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


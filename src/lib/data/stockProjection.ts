/* Derive remaining medication stock and run-out from stored dose events
   (ADR-0046). A stored balance could drift. Match stock by drug rather than
   episode so a dose or route change preserves the count.

   Average consumption over every calendar day in the trailing window.
   Paused and skipped days count as zero, so a pause extends projected
   supply (ADR-0055). The calculation also works without a dose schedule
   or a pause record. The caller supplies dates and storage. */

import { epochDayFromTimestamp } from './epochDay';
import { attributeDrug, drugSpans, drugNameKey, sameDrug } from './regimenEpisode';
import { rangesFromCuts } from './span';
import type { DoseEvent, RegimenEpisode } from './types';
import { clearSnooze, isTileSnoozed, snoozeTile } from './liveTilesSnooze';
import type { AcknowledgementStore } from './acknowledgements';

/** How many trailing days of the dose log the consumption rate is
    estimated from, capped at how long the current stock entry has been in
    effect when that is shorter - there is nothing to estimate from before
    the count was recorded. */
/* TRAILING_WINDOW_DAYS stays exported only for its own test. */
export const TRAILING_WINDOW_DAYS = 30;

/** How many days before a projected run-out an Android prompt is dated
    (stockReminder.ts) - and today, once that would otherwise fall in the
    past. Arbitrary but has to be something; five days is enough notice to
    reorder. Not a threshold for whether to create the prompt at all -
    stockReminder.ts's header explains why reusing this figure as both
    would date the very first prompt anyone gets today, never the future
    day the acceptance criteria describe. */
export const RUN_OUT_LEAD_DAYS = 5;

/* StockEntry stays exported only for its own test. */
export interface StockEntry {
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
  /** How many doses one unit holds: five doses to
      a vial, 28 to a blister. Null or missing means one dose per unit, the
      only reading there was before. */
  dosesPerUnit?: number | null;
}

/** The doses one unit of `stock` holds: its own figure when one was typed
    and is usable, one otherwise. */
export const dosesInOneUnit = (stock: Pick<StockEntry, 'dosesPerUnit'>): number =>
  stock.dosesPerUnit != null && stock.dosesPerUnit > 0 ? stock.dosesPerUnit : 1;

export interface StockProjection {
  /** `quantity` minus every non-skipped dose logged against this drug on
      or after `recordedEpochDay`, in the entry's own unit: each dose takes
      1 / `dosesPerUnit` of a unit. Can go negative - the count that was
      recorded has already been outrun. */
  remaining: number;
  /** Units used per calendar day over the trailing window (non-skipped
      doses per day, divided by `dosesPerUnit`), or null
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
      active and the dose named no drug of its own to break the tie. Whole-window rather than this drug's own, since an
      ambiguous dose cannot be told apart for any drug, not just this one -
      the same figure appears on every entry's projection for the window it
      shares. */
  excludedDoses: number;
}

const isConsuming = (dose: DoseEvent) => dose.status !== 'skipped';

/** Whether `dose` counts against `stock`'s drug: taken or changed - a
    skipped dose used nothing - and attributed (regimenEpisode.ts) to this
    drug, not necessarily to the episode active when the stock was
    recorded. */
function consumesStock(dose: DoseEvent, stock: StockEntry, episodes: readonly RegimenEpisode[]): boolean {
  if (!isConsuming(dose)) return false;
  const { drug } = attributeDrug(episodes, dose);
  return drug !== null && sameDrug(drug, stock.drug);
}

/** The first day of the trailing window the consumption rate is estimated
    over: `TRAILING_WINDOW_DAYS` back from `asOfEpochDay`, or the day the
    count was recorded when that is later - there is nothing to estimate
    from before the count. */
function trailingWindowStart(stock: StockEntry, asOfEpochDay: number): number {
  return Math.max(stock.recordedEpochDay, asOfEpochDay - TRAILING_WINDOW_DAYS + 1);
}

/** The three figures a projection is made of, however they were counted.
    All three are counts of doses, never the doses themselves: a projection
    needs to know how many, not which. */
interface StockDoseCounts {
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
function projectStockFromCounts(
  stock: StockEntry,
  counts: StockDoseCounts,
  asOfEpochDay: number
): StockProjection {
  /* Worked in doses and turned into units only at the end, so the run-out
     day comes out of whole-number arithmetic: 7 doses left at 3 doses in
     21 days is 7 * 21 / 3 = 49 days, where dividing by a rate of 3/21
     first lands a hair over 49 and ceil() adds a day. */
  const perUnit = dosesInOneUnit(stock);
  const remainingDoses = stock.quantity * perUnit - counts.consumed;
  const remaining = remainingDoses / perUnit;
  const excludedDoses = counts.excluded;

  const windowDays = asOfEpochDay - trailingWindowStart(stock, asOfEpochDay) + 1;
  const dailyRate = windowDays > 0 ? counts.consumedInTrailingWindow / windowDays / perUnit : null;

  // Asked of the dose count, not the divided figure, so a fractional
  // quantity cannot leave 1e-16 standing in for "out".
  if (remainingDoses <= 0) return { remaining, dailyRate, runOutEpochDay: asOfEpochDay, excludedDoses };
  if (!dailyRate) return { remaining, dailyRate, runOutEpochDay: null, excludedDoses };
  const daysLeft = Math.ceil((remainingDoses * windowDays) / counts.consumedInTrailingWindow);
  return { remaining, dailyRate, runOutEpochDay: asOfEpochDay + daysLeft, excludedDoses };
}

/** How many non-skipped doses carry each stored `drug` value in each of
    the ranges asked for. Declared structurally rather than imported from
    the doses area, so this module still depends on nothing below the
    journal seam: `DosesArea.countConsumingDosesByDrug` satisfies it. */
/* DrugDoseCounter stays exported only for its own test. */
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

  /* Doses that named a drug are keyed by that name, normalized the way a drug
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
      const key = drugNameKey(row.drug);
      namedByRange[index].set(key, (namedByRange[index].get(key) ?? 0) + n);
    });
  }

  return entries.map((entry) => {
    const drug = drugNameKey(entry.drug);
    const windowStart = trailingWindowStart(entry, asOfEpochDay);
    const counts: StockDoseCounts = { consumed: 0, consumedInTrailingWindow: 0, excluded: 0 };

    for (const [index, range] of ranges.entries()) {
      if (range.fromEpochDay < entry.recordedEpochDay) continue;
      const span = spanForRange[index];
      const unnamed = unnamedByRange[index];
      const attributed =
        (namedByRange[index].get(drug) ?? 0) + (span.drug !== null && sameDrug(span.drug, drug) ? unnamed : 0);

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
/* projectStock stays exported for its own test, and cross-checked in stock.test.ts. */
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

/** The day an order has to be placed: `runOutEpochDay` minus `leadTimeDays` where a lead
    time is set, the run-out day itself where none is set. Null wherever `runOutEpochDay` is
    null - there is nothing to place an order ahead of. Kept separate from
    `projectStockFromCounts` rather than folded into `StockProjection`, so the run-out
    projection itself stays exactly what it was before a lead time existed (ADR-0046). */
export function reorderByEpochDay(runOutEpochDay: number | null, leadTimeDays: number | null): number | null {
  if (runOutEpochDay === null) return null;
  if (leadTimeDays === null) return runOutEpochDay;
  return runOutEpochDay - leadTimeDays;
}

/** Threshold in days below which a medication stock triggers a low-stock notice. */
/* STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS stays exported only for its own test. */
export const STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS = 7;
/* The notice's 24-hour snooze is the `stock-notice` tile's snooze in the encrypted
   acknowledgements preference. It sat in plaintext localStorage before, where a key that
   exists only after somebody dismissed a running-out medication notice said so to anyone
   with the device's files; the first unlock moves an old one over (acknowledgements.ts). */
const STOCK_NOTICE_TILE = 'stock-notice';
const STOCK_NOTICE_SNOOZE_DURATION_MS = 24 * 60 * 60 * 1000;

export function isStockNoticeSnoozed(store: AcknowledgementStore, nowMs: number = Date.now()): boolean {
  return isTileSnoozed(STOCK_NOTICE_TILE, store, nowMs);
}

export function snoozeStockNotice(store: AcknowledgementStore, nowMs: number = Date.now()): void {
  snoozeTile(STOCK_NOTICE_TILE, store, STOCK_NOTICE_SNOOZE_DURATION_MS, nowMs);
}

/* clearStockNoticeSnooze stays exported for its own test, and cross-checked in
   stock-notice.test.ts. */
export function clearStockNoticeSnooze(store: AcknowledgementStore): void {
  clearSnooze(STOCK_NOTICE_TILE, store);
}

/* isStockDepletingSoon stays exported for its own test, and cross-checked in
   stock-notice.test.ts. */
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

interface DepletingStockInfo<T = StockEntry> {
  entry: T;
  projection: StockProjection;
  /** The day this reading is gated and sorted on: `reorderByEpochDay` where a row carries
      one, the projection's own run-out day otherwise. Named so a caller can print the exact
      date it was judged against rather than recomputing a third answer. */
  actionableEpochDay: number;
  daysRemaining: number;
}

export function depletingStocks<T extends { drug: string }>(
  rows: readonly { entry: T; projection: StockProjection; reorderByEpochDay?: number | null }[],
  asOfEpochDay: number,
  thresholdDays: number = STOCK_DEPLETION_NOTICE_THRESHOLD_DAYS
): DepletingStockInfo<T>[] {
  const result: DepletingStockInfo<T>[] = [];
  for (const { entry, projection, reorderByEpochDay } of rows) {
    const actionableEpochDay = reorderByEpochDay ?? projection.runOutEpochDay;
    if (actionableEpochDay === null) continue;
    if (actionableEpochDay - asOfEpochDay <= thresholdDays) {
      const daysRemaining = Math.max(0, actionableEpochDay - asOfEpochDay);
      result.push({ entry, projection, actionableEpochDay, daysRemaining });
    }
  }
  return result.sort((a, b) => a.daysRemaining - b.daysRemaining || a.entry.drug.localeCompare(b.entry.drug));
}


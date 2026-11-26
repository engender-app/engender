/* What the Look back span cost: the Cost
   reading's arithmetic, kept out of the component so it is tested as
   arithmetic.

   It stands on ticket 30's seam: `journal.costs.getCosts()` hands over
   every costed record with its day, and every figure here is made by
   costTotalsByCurrency, which totals inside one currency and rounds to two
   places. So a currency is the outer grouping and nothing below it ever
   meets another currency: the split by area and the split by refunded
   state are both splits of one currency's total (ADR-0097, never summed
   across currencies).

   A record belongs to the span by its own day. One with no day - a wait
   that has none yet, a procedure with no date - has no place in any span,
   so it is left out and counted, and the screen says how many. A refund
   noted without an amount carries no money and adds nothing. */

import { costTotalsByCurrency } from './cost';
import type { CostRecord, CostSource } from './journal/costs';
import type { Span } from './lookBackSpan';

/** The areas in the order the reading lists them: the order the app's own
    areas come in, so the list reads the same in every currency. */
const COST_AREAS: readonly CostSource[] = ['hairRemoval', 'appointment', 'procedure', 'lab', 'stock'];

interface CostAreaTotal {
  source: CostSource;
  total: number;
  /** The part of `total` that was refunded. */
  refunded: number;
  count: number;
}

interface CostReadingCurrency {
  currency: string;
  total: number;
  refunded: number;
  /** `total` less `refunded`, rounded the same way. */
  notRefunded: number;
  count: number;
  /** Only the areas that hold an amount in this currency. */
  byArea: CostAreaTotal[];
}

export interface CostReading {
  /** The most-used currency first, then by code. Empty when the span holds
      no amount at all, which is the reading's "absent" (Look back's
      emptiness rule). */
  currencies: CostReadingCurrency[];
  /** Records with an amount and no day, which no span can hold. */
  undated: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function costReading(records: readonly CostRecord[], span: Span): CostReading {
  const priced = records.filter((record) => record.cost.amount !== null && record.cost.currency !== null);
  const inSpan = priced.filter((record) => record.epochDay !== null && record.epochDay >= span.start && record.epochDay <= span.end);
  const currencies = costTotalsByCurrency(inSpan.map((record) => record.cost)).map((whole) => {
    const own = inSpan.filter((record) => record.cost.currency === whole.currency);
    const byArea = COST_AREAS.flatMap((source) =>
      costTotalsByCurrency(own.filter((record) => record.source === source).map((record) => record.cost)).map(
        ({ total, refunded, count }) => ({ source, total, refunded, count })
      )
    );
    return { ...whole, notRefunded: round(whole.total - whole.refunded), byArea };
  });
  currencies.sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
  return { currencies, undated: priced.filter((record) => record.epochDay === null).length };
}

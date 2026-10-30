/* A cost as a row reads it (functional audit ticket 30): the amount in its
   own currency, as the app's locale writes money, then "Refunded" when it
   was. One line for every record that carries a cost, so a session, a
   visit, a draw, a procedure and the stock row say it the same way. Never
   a sum: totals go through costTotalsByCurrency (cost.ts). */

import { m } from '$lib/paraglide/messages';
import { intlLocale } from '../dates';
import { formatAmount, type Cost } from '../cost';

/** "250,00 zł · Zwrócono", "€80.50", "Refunded" alone, or null for none. */
export function costLine(cost: Cost): string | null {
  const parts: string[] = [];
  if (cost.amount !== null && cost.currency !== null) parts.push(formatAmount(cost.amount, cost.currency, intlLocale()));
  if (cost.refunded) parts.push(m.cost_refunded());
  return parts.length ? parts.join(' · ') : null;
}

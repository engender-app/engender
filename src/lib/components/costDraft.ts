/* A cost as an editor holds it (functional audit ticket 30): the amount as
   the person types it, so "250,50" survives a keystroke that does not yet
   parse, and the currency the select shows even while the amount is blank.
   CostField.svelte binds to this; costFromDraft is what an editor saves. */

import { NO_COST, parseAmount, type Cost } from '../data/cost';

export interface CostDraft {
  amount: string;
  currency: string;
  refunded: boolean;
}

export function blankCostDraft(defaultCurrency: string): CostDraft {
  return { amount: '', currency: defaultCurrency, refunded: false };
}

/** A stored cost to edit. Its amount is written the way `locale` writes a
    number, without grouping, so it parses back unchanged. */
export function costDraftFrom(cost: Cost, defaultCurrency: string, locale: string): CostDraft {
  if (cost.amount === null) return { ...blankCostDraft(defaultCurrency), refunded: cost.refunded };
  const amount = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }).format(cost.amount);
  return { amount, currency: cost.currency ?? defaultCurrency, refunded: cost.refunded };
}

/** Blank is fine; anything else has to be one amount. */
export function costDraftOk(draft: CostDraft): boolean {
  return !draft.amount.trim() || parseAmount(draft.amount) !== null;
}

/** What the editor saves. Call it only once costDraftOk holds. */
export function costFromDraft(draft: CostDraft): Cost {
  const amount = draft.amount.trim() ? parseAmount(draft.amount) : null;
  if (amount === null) return draft.refunded ? { amount: null, currency: null, refunded: true } : NO_COST;
  return { amount, currency: draft.currency, refunded: draft.refunded };
}

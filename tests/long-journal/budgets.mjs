/* The regression budget (phase 2 ticket 20), and the rule for reading it.

   Three numbers per measurement, each with a different job:

     baselineMs           what the ten-year run actually measured, on the
                          machine and browser named in budgets.json.
     budgetMs             what CI fails on. Set well above the baseline on
                          purpose: a shared runner is not a quiet laptop,
                          and a gate that trips on a 20 percent wobble gets
                          disabled within a week. This one is here to catch
                          a pagination-shaped regression - work that grew
                          with the journal - not noise.
     targetMs             what a person waiting for that screen can stand.
                          Nothing to do with the baseline. A measurement
                          whose baseline is over its target is a release
                          problem and gets its own ticket with the
                          measurement attached; optimization is not this
                          ticket's job.

   Memory is recorded and printed, and deliberately not gated on the web:
   two runs over the identical fixture put the Archive export's heap delta
   at 58.4MB and then 7.5MB, because a delta measures where the collector
   happened to be rather than what the operation needs. A gate on that is
   noise, and a noisy gate gets switched off. `heapBudgetBytes` is null
   here for that reason and the check below still honours one, so a
   platform that answers more steadily - Android, once ticket 11 lands -
   can set one without this changing.

   A measurement with no entry here is a breach rather than a pass. The
   alternative fails open: adding a measurement to measure.ts and
   forgetting the budget would leave CI quietly not watching it. */

import { readFileSync } from 'node:fs';

/**
 * @typedef {object} Budget
 * @property {string} what
 * @property {number} baselineMs
 * @property {number} budgetMs
 * @property {number} targetMs
 * @property {number | null} heapBaselineBytes
 * @property {number | null} heapBudgetBytes
 */

/**
 * @typedef {object} Budgets
 * @property {string} measuredOn
 * @property {string} fixture
 * @property {Record<string, Budget>} measurements
 */

/** @type {Budgets} */
export const budgets = JSON.parse(readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'));

/**
 * Everything the run exceeded, one line each, ready to print.
 *
 * @param {{ name: string, ms: number, heapBytes: number | null }[]} measurements
 * @param {Record<string, Budget>} [table] the budgets to judge against,
 *   defaulting to the recorded ones. Only the tests pass their own.
 * @returns {string[]}
 */
export function breaches(measurements, table = budgets.measurements) {
  /** @type {string[]} */
  const found = [];

  for (const m of measurements) {
    const budget = table[m.name];
    if (!budget) {
      found.push(`${m.name} has no budget - add one to budgets.json or CI is not watching it`);
      continue;
    }
    if (m.ms > budget.budgetMs) {
      found.push(`${m.name}: ${Math.round(m.ms)}ms over a budget of ${budget.budgetMs}ms (baseline ${budget.baselineMs}ms)`);
    }
    if (budget.heapBudgetBytes !== null && m.heapBytes !== null && m.heapBytes > budget.heapBudgetBytes) {
      found.push(
        `${m.name}: ${mb(m.heapBytes)} of heap over a budget of ${mb(budget.heapBudgetBytes)} (baseline ${mb(budget.heapBaselineBytes ?? 0)})`
      );
    }
  }

  return found;
}

/**
 * Measurements whose baseline is already past what a person can wait for.
 * Each one is an optimization ticket, not something to fix here.
 *
 * @returns {string[]}
 */
export function overTarget() {
  return Object.entries(budgets.measurements)
    .filter(([, b]) => b.baselineMs > b.targetMs)
    .map(([name, b]) => `${name}: baseline ${b.baselineMs}ms against a target of ${b.targetMs}ms`);
}

/** @param {number} bytes */
const mb = (bytes) => `${(bytes / 1_048_576).toFixed(1)}MB`;

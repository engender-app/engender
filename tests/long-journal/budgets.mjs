/* The regression budget (phase 2 ticket 20), and the rule for reading it.

   Three numbers per measurement, each with a different job:

     baselineMs           what the ten-year run actually measured, on the
                          machine and browser named in budgets.json.
     budgetMs             what CI fails on: five times the baseline, with a
                          200ms floor. Set that far above the baseline
                          because the baseline came off a quiet desktop and
                          the gate runs on a shared ubuntu-latest runner,
                          which is the slower machine by an unknown factor.
                          A gate that trips on that difference gets disabled
                          within a week. This one is here to catch a
                          pagination-shaped regression - work that grew with
                          the journal, which arrives as a multiple rather
                          than a percentage - not noise. If CI turns out to
                          be quieter than feared, re-record from a CI run
                          and tighten it; widening it further is not the
                          answer.
     targetMs             what a person waiting for that screen can stand.
                          Nothing to do with the baseline. A measurement
                          whose baseline is over its target is a release
                          problem and gets its own ticket with the
                          measurement attached; optimization is not this
                          ticket's job.

  Memory is intentionally not watched here.

  The desktop probe can be launched with flags that expose gc() and
  performance.memory, but Android WebView does not expose those in this
  harness. That leaves one platform sampling and one not, and the sampled
  deltas swing with collector timing enough to be noisy (the same fixture
  produced 58.4MB and then 7.5MB for Archive export). A noisy gate gets
  switched off, and a one-platform gate gives false confidence.

  If this suite starts watching memory again, it needs one stable
  measurement API that works in both harnesses without launch-only flags,
  then a rerun on device to set real baselines.

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
 * @param {{ name: string, ms: number }[]} measurements
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
  }

  return found;
}

/**
 * Measurements whose baseline is already past what a person can wait for.
 * Each one is an optimization ticket, not something to fix here.
 *
 * @param {Record<string, Budget>} [table] as `breaches`.
 * @returns {string[]}
 */
export function overTarget(table = budgets.measurements) {
  return Object.entries(table)
    .filter(([, b]) => b.baselineMs > b.targetMs)
    .map(([name, b]) => `${name}: baseline ${b.baselineMs}ms against a target of ${b.targetMs}ms`);
}

/** @param {number} bytes */
export const mb = (bytes) => `${(bytes / 1_048_576).toFixed(1)}MB`;

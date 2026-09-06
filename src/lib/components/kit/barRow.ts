/* One row of the horizontal bar chart, and the rule for what its length is
   measured against.

   The type lived here already - the rows are built by the screens and by
   $lib/data/wrappedDisplay, and a `.ts` file cannot import a type out of a
   `.svelte` one. The denominator moved in beside it (phase 8 audit ticket
   23): it used to sit inside BarRows.svelte and Distribution.svelte, reachable
   only by an eye on a gallery render (ADR-0016, the Node tier cannot reach a
   component), and it had already been got wrong twice that way. Same split
   kit/role.ts already makes: the drawing is the component's, what a share is
   of is not. The length itself, `share`, is charts/share.ts - two callers
   here in the kit and one in the ring's arithmetic, and none of the three
   wants what tests/chart-library-graph.test.ts keeps out of their way. */

import { share } from '../../charts/share';

export interface BarRow {
  key: string;
  name: string;
  /** Under the name: a count, a unit, a period. */
  note?: string;
  /** The reading, formatted by the caller. */
  value: string;
  /** What the bar's length is drawn from. */
  amount: number;
}

/** What BarRows.svelte's track's full length is measured against - see the
    component's own prop doc for what `leader` and `track` mean. */
export type BarMeasure = 'leader' | 'track';

export interface DrawnBar extends BarRow {
  /** This bar's length, 0-100 - already decided by the measure. */
  share: number;
  /** Whether this is the section's stripe at full strength. Only possible
      under `leader`: `track` has no bar to lead, every row is a position in
      its own range. */
  isLeader: boolean;
}

function tallest(amounts: number[]): number {
  return Math.max(0, ...amounts);
}

/** Each row's bar length and leader flag, decided by `measure` rather than
    left for BarRows.svelte to work out. */
export function drawBars(rows: BarRow[], measure: BarMeasure): DrawnBar[] {
  const amounts = rows.map((row) => row.amount);
  const top = measure === 'track' ? 1 : tallest(amounts);
  return rows.map((row) => ({
    ...row,
    share: share(row.amount, top),
    isLeader: measure === 'leader' && row.amount === top && top > 0
  }));
}

/** Each amount's share of the tallest amount in the set, 0-100. The same
    rule as BarRows' `leader` measure, for a caller - Distribution.svelte -
    whose columns aren't BarRow rows and have no `track` mode of their own. */
export function leaderShares(amounts: number[]): number[] {
  const top = tallest(amounts);
  return amounts.map((amount) => share(amount, top));
}

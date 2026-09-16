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
type BarMeasure = 'leader' | 'track';

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

/** Below this share, a leader bar reads as a dot rather than a length - the
    complaint carpet ticket 20 was filed against (a tag that moved a
    0-to-100 scale by a few points, beside one that moved it by eighty,
    drew a sliver nobody could see). Strava's zone bars and Weather's
    monthly-average bars answer the same shape of problem the same way: a
    real nonzero reading always draws a visible nub, and only readings
    below the floor are stretched to it. It is a floor and not a second
    measure - every share at or above it is untouched, so this is a
    guarantee about legibility, not a rule about what a bar means. Applies
    only under `leader`: `track` rows are already a position in a known
    range and a floor there would misstate the position. */
const LEADER_FLOOR_SHARE = 8;

/** Each row's bar length and leader flag, decided by `measure` rather than
    left for BarRows.svelte to work out. */
export function drawBars(rows: BarRow[], measure: BarMeasure): DrawnBar[] {
  const amounts = rows.map((row) => row.amount);
  const top = measure === 'track' ? 1 : tallest(amounts);
  return rows.map((row) => {
    const raw = share(row.amount, top);
    return {
      ...row,
      share: measure === 'leader' && raw > 0 ? Math.max(raw, LEADER_FLOOR_SHARE) : raw,
      isLeader: measure === 'leader' && row.amount === top && top > 0
    };
  });
}

/** Each amount's share of the tallest amount in the set, 0-100. The same
    rule as BarRows' `leader` measure, for a caller - Distribution.svelte -
    whose columns aren't BarRow rows and have no `track` mode of their own. */
export function leaderShares(amounts: number[]): number[] {
  const top = tallest(amounts);
  return amounts.map((amount) => share(amount, top));
}

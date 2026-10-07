/* What a tally card says when there is too little to draw (after-release
   27, audit UI-12). The area chart needs two positions for a line; with one
   it drew a lone ring in an empty plot, which read as a chart that had not
   loaded. Under that threshold the card says the count in words, and the
   day or days it fell on.

   Node-tier safe: no clock, no paraglide. The words and the dates are the
   screen's. */

import { MIN_PLOT_POSITIONS } from '../charts/annotations';

export type TallyWords =
  | { kind: 'none' }
  | { kind: 'once'; day: number }
  | { kind: 'one-day'; count: number; day: number }
  | { kind: 'span'; count: number; from: number; to: number };

/** The sentence for a tally series, or null when it has enough plotted
    positions to draw. `rows` are the days with taps, oldest first, as
    `stats.tallyTrend` answers; `positions` is how many the chart would
    plot after bucketing them to its grain. */
export function tallyInWords(rows: readonly { day: number; value: number }[], positions: number): TallyWords | null {
  if (positions >= MIN_PLOT_POSITIONS) return null;
  if (!rows.length) return { kind: 'none' };
  const count = rows.reduce((sum, row) => sum + row.value, 0);
  const first = rows[0].day;
  const last = rows[rows.length - 1].day;
  if (first !== last) return { kind: 'span', count, from: first, to: last };
  return count === 1 ? { kind: 'once', day: first } : { kind: 'one-day', count, day: first };
}

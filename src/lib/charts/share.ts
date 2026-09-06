/* One reading's length against another, and nothing else.

   Its own module because its three callers are not one another's: two are
   the kit's bars (components/kit/barRow.ts and kit/OrderedStrip.svelte) and
   one is the ring's arithmetic (charts/parts.ts), and none of them draws a
   line. It sat in charts/geometry.ts until phase 9 audit ticket 02, which is
   how a kit helper that draws no chart came to carry d3-shape in its import
   graph for three lines of arithmetic. Nothing is imported here, and that is
   the point - tests/chart-library-graph.test.ts holds the rule that came out
   of it. */

/** A bar's width as a percentage of the largest value beside it. The bars
    carry their own values as text, so this is length only. */
export function share(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return (value / max) * 100;
}

/* One reading's length against another, and nothing else.

   Its own module because none of its three callers draws a line: two are the
   kit's bars (components/kit/barRow.ts and kit/OrderedStrip.svelte) and one
   is the ring's arithmetic (charts/parts.ts). It lived in charts/geometry.ts
   until phase 9 audit ticket 02, back when that module opened with a
   d3-shape import. Nothing is imported here, and that is the point -
   tests/chart-library-graph.test.ts holds the rule and the reasoning. */

/** A bar's width as a percentage of the largest value beside it. The bars
    carry their own values as text, so this is length only. */
export function share(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return (value / max) * 100;
}

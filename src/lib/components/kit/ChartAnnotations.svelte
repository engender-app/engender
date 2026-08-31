<script lang="ts">
  /* What was happening around the readings (phase 5 deepening ticket 23).

     A layer inside the area chart's own plot rather than a second chart laid
     over it, which is what makes it belong to the chart: it is drawn in the
     same coordinate space, revealed by the same wipe on the way in, and
     clipped by nothing of its own.

     Two marks, because there are two kinds of thing to say.

     A stretch is a band, drawn behind the fill. Neutral ink at a few percent
     rather than a colour of its own: the fill is already the flag palette's
     role colour and there are eight of those times two themes, so an
     annotation drawn in any hue would be readable against some of them and
     lost against the rest. Ink is the one thing every palette shares, and a
     wash of it darkens the card without competing with the line. The band's
     start carries a 1px edge, but only where that day is really inside the
     range: an episode that began before the chart did gets no edge, because
     the left side of that band is where the chart starts and not where
     anything happened.

     A moment is a tick off the baseline, a fifth of the plot's height. Not
     floor to ceiling: a full-height line is the loudest thing on a chart, it
     crosses the data it is supposed to be context for, and three of them on
     adjacent days is a thicket. It is also already spoken for - the scrub
     draws a dotted full-height line, and a second full-height line in the
     same chart would read as a second scrub. Where several land together the
     tick doubles, which says "more than one here" without a number: a count
     drawn on a plot is a label, and labels on marks are what this design
     spent its legibility budget avoiding.

     Nothing here is tabbable and nothing carries a title: the marks are
     decoration to the accessibility tree, and the annotations are read as a
     list beside the chart instead (AreaChart.svelte). Same reasoning the
     chart's own marks carry - there is nothing here to tab to. */
  import type { PlacedAnnotations } from '$lib/charts/annotations';

  let {
    placed,
    height
  }: {
    /** Already laid out against the plot's own positions. */
    placed: PlacedAnnotations;
    /** The plot's height in pixels, inside its padding. */
    height: number;
  } = $props();

  /** How far a mark rises off the baseline, as a share of the plot's height.
      A fifth: tall enough to be a mark rather than a speck, short enough that
      the line's own shape is never what it is drawn over. */
  const MARK_HEIGHT = 0.2;
  /** How far the second line of a doubled mark sits from the first. */
  const DOUBLE_GAP = 3;
</script>

<g class="kit-annotations" aria-hidden="true">
  {#each placed.bands as band (band.key)}
    <rect class="kit-annotation-band" x={band.x1} y="0" width={Math.max(band.x2 - band.x1, 1)} {height} />
    {#each band.edges as edge, i (i)}
      <line class="kit-annotation-edge" x1={edge} x2={edge} y1="0" y2={height} />
    {/each}
  {/each}

  {#each placed.marks as mark (mark.key)}
    <line
      class="kit-annotation-mark"
      x1={mark.x}
      x2={mark.x}
      y1={height}
      y2={height - height * MARK_HEIGHT}
    />
    {#if mark.annotations.length > 1}
      <line
        class="kit-annotation-mark"
        x1={mark.x + DOUBLE_GAP}
        x2={mark.x + DOUBLE_GAP}
        y1={height}
        y2={height - height * MARK_HEIGHT + DOUBLE_GAP}
      />
    {/if}
  {/each}
</g>

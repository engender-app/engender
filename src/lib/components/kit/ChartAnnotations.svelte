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

     A moment is a mark off the baseline, a fifth of the plot's height. Two
     registers, and they never meet: what began is written along the top,
     what happened is written along the bottom, and the readings run between
     them untouched. Not floor to ceiling: a full-height line is the loudest thing on a chart, it
     crosses the data it is supposed to be context for, and three of them on
     adjacent days is a thicket. It is also already spoken for - the scrub
     draws a dotted full-height line, and a second full-height line in the
     same chart would read as a second scrub. Where several land together the
     tick doubles, which says "more than one here" without a number: a count
     drawn on a plot is a label, and labels on marks are what this design
     spent its legibility budget avoiding.

     Every mark can be pointed at, and says what it is when it is (Alicja,
     2026-09-01: "there should be a hover action with a label displayed for
     each moment"). Both registers answer, not only the baseline: the day a
     stretch began is a moment too, and half the marks on a chart going dead
     under the pointer reads as a bug rather than as a rule.

     Two things follow from a mark being 1.5px of ink. The thing a pointer
     finds is an invisible target around it, not the mark. And the hover is
     reported upward rather than drawn here: a label wants wrapping, the
     card's own type and a pill behind it, and SVG text has none of those.

     The targets exist only where hovering is real. A finger has no hover, and
     on a touch screen these would swallow the drag that scrubs the chart -
     which is how the same names are read there, so the rule costs a touch
     reader nothing.

     Nothing here is tabbable and nothing carries a title: the marks are
     decoration to the accessibility tree, and the annotations are read as a
     list beside the chart instead (AreaChart.svelte). Same reasoning the
     chart's own marks carry - there is nothing here to tab to, and a hover is
     an addition for whoever has a pointer rather than the only way to the
     words. */
  import type {
    AnnotationEdge,
    AnnotationMark,
    ChartAnnotation,
    PlacedAnnotations
  } from '$lib/charts/annotations';

  /** Where a hovered mark sits and what it stands for. `above` is which side
      of `y` the label belongs on, and it is the register the mark is in: a
      moment is written above its own mark, a stretch's start below its own. */
  export interface HoveredAnnotations {
    x: number;
    y: number;
    above: boolean;
    annotations: ChartAnnotation[];
  }

  let {
    placed,
    height,
    onHover
  }: {
    /** Already laid out against the plot's own positions. */
    placed: PlacedAnnotations;
    /** The plot's height in pixels, inside its padding. */
    height: number;
    /** What the pointer is on, or null when it is on none of them. */
    onHover?: (hovered: HoveredAnnotations | null) => void;
  } = $props();

  /** How far a mark rises off the baseline, as a share of the plot's height.
      A fifth: tall enough to be a mark rather than a speck, short enough that
      the line's own shape is never what it is drawn over. */
  const MARK_HEIGHT = 0.2;
  /** How far the second line of a doubled mark sits from the first. */
  const DOUBLE_GAP = 3;
  /** How wide a pointer target is. Two adjacent targets cannot fight over the
      same pixels however wide this is, because two marks closer than
      MIN_MARK_GAP are already one mark - so it is chosen for the hand rather
      than against its neighbours. */
  const HIT_WIDTH = 18;

  /* Where each register's marks end, once for the layer rather than once per
     mark. They are also the line a label stands off, which is why the hover
     target carries them upward rather than the chart recomputing them. */
  let foot = $derived(height * MARK_HEIGHT);
  let head = $derived(height - foot);

  /* Built here rather than in an `{@const}`: kit-surfaces.test.ts reads a
     component's copy with a regex that cannot see past a nested brace, so an
     object literal in the markup reads as inline text. Same trap the chart's
     own scrub handlers are named for. */
  const edgeTarget = (edge: AnnotationEdge): HoveredAnnotations => ({
    x: edge.x,
    y: foot,
    above: false,
    annotations: [edge.annotation]
  });
  const markTarget = (mark: AnnotationMark): HoveredAnnotations => ({
    x: mark.x,
    y: head,
    above: true,
    annotations: mark.annotations
  });

  let hovered = $state<string | null>(null);

  function enter(key: string, target: HoveredAnnotations) {
    hovered = key;
    onHover?.(target);
  }

  /* Keyed, because a pointer crossing from one mark straight into the next
     fires the new mark's enter before the old one's leave, and an unkeyed
     leave would then clear the label that had just arrived. */
  function leave(key: string) {
    if (hovered !== key) return;
    hovered = null;
    onHover?.(null);
  }
</script>

<g class="kit-annotations" aria-hidden="true">
  {#each placed.bands as band (band.key)}
    <rect class="kit-annotation-band" x={band.x1} y="0" width={Math.max(band.x2 - band.x1, 1)} {height} />
    {#each band.edges as edge (edge.annotation.id)}
      <line
        class="kit-annotation-edge"
        class:is-hovered={hovered === edge.annotation.id}
        x1={edge.x}
        x2={edge.x}
        y1="0"
        y2={foot}
      />
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- No role, and no keyboard equivalent either: the whole layer is
           aria-hidden decoration, the pointer target draws nothing and holds
           nothing, and every word it reveals is already in the list beside
           the chart. A role here would put a shape into the tree that has
           nothing to say to anyone who is not pointing at it. -->
      <rect
        class="kit-annotation-hit"
        x={edge.x - HIT_WIDTH / 2}
        y="0"
        width={HIT_WIDTH}
        height={foot}
        onpointerenter={() => enter(edge.annotation.id, edgeTarget(edge))}
        onpointerleave={() => leave(edge.annotation.id)}
      />
    {/each}
  {/each}

  {#each placed.marks as mark (mark.key)}
    <line
      class="kit-annotation-mark"
      class:is-hovered={hovered === mark.key}
      x1={mark.x}
      x2={mark.x}
      y1={height}
      y2={head}
    />
    {#if mark.annotations.length > 1}
      <line
        class="kit-annotation-mark"
        class:is-hovered={hovered === mark.key}
        x1={mark.x + DOUBLE_GAP}
        x2={mark.x + DOUBLE_GAP}
        y1={height}
        y2={head + DOUBLE_GAP}
      />
    {/if}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <rect
      class="kit-annotation-hit"
      x={mark.x - HIT_WIDTH / 2}
      y={head}
      width={HIT_WIDTH}
      height={height - head}
      onpointerenter={() => enter(mark.key, markTarget(mark))}
      onpointerleave={() => leave(mark.key)}
    />
  {/each}
</g>

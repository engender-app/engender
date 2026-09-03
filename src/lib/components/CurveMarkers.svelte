<script lang="ts" module>
  import type { AnnotationMark as Mark, ChartAnnotation as Annotation } from '$lib/charts/annotations';

  /** What a chart has to be handed to draw a marker layer, as one type
      rather than four props twice over: both curve charts take exactly this
      set and forward it whole, and a fifth prop added here should not be
      four edits. */
  export interface CurveMarkerProps {
    /** Already selected for the range and ordered by where they sit. Empty,
        or either callback missing, and no layer is drawn at all: a marker's
        whole purpose is going to the record it stands for, so one nothing
        can answer is a tick with nowhere to go. */
    markers?: readonly Annotation[];
    /** The key of the gathered mark that is open in the readout. */
    selectedMarker?: string | null;
    onSelectMarker?: (mark: Mark) => void;
    /** The accessible name for one mark. A control with no name cannot be
        announced, and every one of these is a control. */
    markLabel?: (mark: Mark) => string;
  }

  /** Whether a chart handed those props has a layer to draw. */
  export function drawsMarkers(props: CurveMarkerProps): boolean {
    return (
      props.onSelectMarker !== undefined &&
      props.markLabel !== undefined &&
      (props.markers?.length ?? 0) > 0
    );
  }
</script>

<script lang="ts">
  /* What else was logged on the days a hormone curve covers (phase 8
     features ticket 15).

     A `<g>` composed into the two curve charts' own plots, the way
     kit/ChartAnnotations.svelte is composed into the area chart's - same
     model behind it (charts/annotations.ts: the kinds, the range, the
     gathering), same ink, same proportion off the baseline.

     Not that component reused, for one reason that runs through everything
     here: these marks are tapped, and the kit's are not. The kit layer is
     aria-hidden decoration whose words arrive on hover and are read as a
     list beside the chart, which is right for a milestone somebody cannot
     do anything about. Every mark here stands for a record with a screen,
     so each one is a control: focusable, named, and answering a tap by
     handing the record's address to the readout under the card. Teaching
     the kit layer to be both would put an interaction model five other
     charts do not want into all of them.

     One register and no hue. Six kinds land here and none of them is drawn
     differently from the others, which is the same call the kit layer's own
     header argues: the flag palettes give eight role colours across two
     themes, so a hue that reads on one is lost on another, and ink is the
     only thing every palette shares. Shape would be free of that, but six
     shapes at 1.5px on a 390px phone is a legend nobody can hold. So the
     marks say where, and the readout says what.

     Where two marks land closer than the model's own gap they gather into
     one doubled tick carrying both, and the readout names all of it. A
     weekly injection over six months is twenty-six of these, which reads as
     the rhythm it is rather than as twenty-six separate claims. */

  import { placeAnnotations, type AnnotationMark, type ChartAnnotation } from '$lib/charts/annotations';

  let {
    markers,
    fromDay,
    toDay,
    left,
    right,
    bottom,
    plotHeight,
    selected = null,
    onSelect,
    markLabel
  }: {
    /** Already selected for the range and ordered by where they sit. */
    markers: readonly ChartAnnotation[];
    /** The days the plot's left and right edges stand for. Both charts here
        scale time linearly across the window rather than bucketing it, so
        two endpoints describe the axis completely. */
    fromDay: number;
    toDay: number;
    /** Where the plot starts and ends across the viewBox, past the gutter
        the axis labels sit in. */
    left: number;
    right: number;
    /** The plot's floor, which the marks stand on. */
    bottom: number;
    /** How tall the plot is, for the proportion a mark rises by. */
    plotHeight: number;
    /** The key of the gathered mark that is open in the readout. */
    selected?: string | null;
    /** The whole mark and not its key: a gathered mark carries every
        annotation that landed on it, and a caller handed only the key would
        have to work out which ones those were a second time. Required here
        where CurveMarkerProps has it optional - a host decides whether to
        draw a layer at all, and by the time it does there is a handler. */
    onSelect: (mark: AnnotationMark) => void;
    markLabel: (mark: AnnotationMark) => string;
  } = $props();

  /** How far a mark rises off the baseline, as a share of the plot's height.

      An eighth, where the kit layer's own marks take a fifth. The kit's sit
      under a line chart, whose stroke is the strongest thing on the card; a
      hormone band is a pale wash, so at a fifth and the kit's weight two
      dozen marks read as a bar chart drawn over the curve rather than as a
      ruler under it. Shot at 180 days with a weekly injection - which is
      twenty-six of them - that is exactly what it looked like. */
  const MARK_HEIGHT = 0.125;
  /** How far the second line of a gathered mark sits from the first. */
  const DOUBLE_GAP = 3;
  /** How wide a tap target is at most, in viewBox units. The same trade the
      lab-point targets in HormoneBandChart make, and for the same reason:
      wider than the mark, narrower than 44px, because at 44px neighbouring
      marks steal each other's taps. Narrowed further where the neighbours
      are closer than this, so no two targets ever overlap. */
  const HIT_WIDTH = 18;
  /** How far a target reaches past the tick it belongs to, so a thumb that
      lands under the baseline still finds it. */
  const HIT_LIFT = 9;

  let head = $derived(bottom - plotHeight * MARK_HEIGHT);

  let placed = $derived.by(() => {
    // A window with no width has no position for anything to be at, and
    // pixelAt would put every mark on the left edge.
    if (toDay <= fromDay || right <= left) return [];
    const width = right - left;
    return placeAnnotations(markers, [{ x: fromDay }, { x: toDay }], width).marks.map((mark) => ({
      ...mark,
      x: left + mark.x
    }));
  });

  /** Each target reaches halfway to its neighbours, or HIT_WIDTH, whichever
      is less. Halving the gap rather than overlapping means the mark a tap
      lands on is always the nearest one, which is what a finger expects and
      what an overlap quietly breaks in favour of whichever drew last. */
  function hitBounds(index: number): { x: number; width: number } {
    const mark = placed[index];
    const previous = placed[index - 1];
    const next = placed[index + 1];
    const from = Math.max(mark.x - HIT_WIDTH / 2, previous ? (previous.x + mark.x) / 2 : left);
    const to = Math.min(mark.x + HIT_WIDTH / 2, next ? (mark.x + next.x) / 2 : right);
    return { x: from, width: Math.max(to - from, 1) };
  }

  /* Built here rather than in the markup: kit-surfaces.test.ts reads a
     component's copy with a regex that cannot see past a nested brace, and
     the same trap is worth staying out of anywhere. */
  const activate = (mark: AnnotationMark) => () => onSelect(mark);
  const activateOnKey = (mark: AnnotationMark) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(mark);
  };
</script>

<g class="curve-markers">
  {#each placed as mark, i (mark.key)}
    {@const hit = hitBounds(i)}
    <line
      class="curve-marker"
      class:is-selected={mark.key === selected}
      x1={mark.x}
      x2={mark.x}
      y1={bottom}
      y2={head}
    />
    {#if mark.annotations.length > 1}
      <line
        class="curve-marker"
        class:is-selected={mark.key === selected}
        x1={mark.x + DOUBLE_GAP}
        x2={mark.x + DOUBLE_GAP}
        y1={bottom}
        y2={head + DOUBLE_GAP}
      />
    {/if}
    <!-- components.css's own hit target, the one the lab-point marks in
         HormoneBandChart already use: transparent fill so the whole
         rectangle answers, and a focus ring in the accent when it is
         tabbed to. data-no-press because there is nothing visible here for
         a press to move. -->
    <rect
      class="chart-hit"
      x={hit.x}
      y={head - HIT_LIFT}
      width={hit.width}
      height={bottom - head + HIT_LIFT * 2}
      role="button"
      data-no-press
      tabindex="0"
      aria-label={markLabel(mark)}
      aria-pressed={mark.key === selected}
      onclick={activate(mark)}
      onkeydown={activateOnKey(mark)}
    />
  {/each}
</g>

<style>
  /* Mixed from --text rather than given a hue of its own, which is the kit
     layer's rule and holds for the same reason: eight palettes across two
     themes, and ink is the only thing all of them share.

     Lighter than the kit's 52% though, and thinner. A mark has to sit above
     the axis labels and below anything plotted, and what is plotted here is
     a 34%-opacity wash rather than a line - at the kit's weight the marks
     were the darkest thing on the card. */
  .curve-marker {
    stroke: color-mix(in oklab, var(--text) 30%, transparent);
    stroke-width: 1.25;
    stroke-linecap: round;
    /* --dur-fast is already 1ms under prefers-reduced-motion (theme/base.css),
       so this needs no media query of its own. */
    transition: stroke var(--dur-fast) var(--ease-out);
  }

  /* The mark answers its own tap. The readout under the card is the answer,
     and it is far enough from the plot that a mark going unchanged would
     leave nothing saying which of twenty was tapped. */
  .curve-marker.is-selected {
    stroke: var(--text);
  }

</style>

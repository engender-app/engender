<script lang="ts">
  /* The area chart: a whole range in one card, read by moving a finger
     across it.

     It used to be a timeline you scrolled - every reading kept a 14px slot,
     so a year was 365 slots and you read it a week at a time by dragging.
     That is the wrong trade on a phone (Alicja, 2026-08-25: "the graph
     shouldn't be scrollable"). A chart in a card is something you glance
     at, and a chart you have to drag has no shape at all until you have
     dragged all of it.

     So the range fits, and what changes with the range is the grain
     ($lib/charts/grain): a month is read day by day, a year week by week,
     several years month by month, chosen from how many positions a card can
     hold rather than from a table of ranges. The caller buckets and passes
     the result, because only the caller knows what a position means - an
     epoch day here, a position on a dosing cycle there.

     What replaces the scroll is a scrub. Drag anywhere on the plot and a
     dotted line follows the nearest reading with its value and its date
     above it. That is where an exact number comes from now; the gutter says
     what the ends of the scale are, and nothing else is written on the
     marks.

     Tier 3 (DIRECTION.md), twice. Switching range or metric re-tweens the
     line between the two datasets rather than tearing it down - the outgoing
     dataset is read onto the incoming one's own point count first, which is
     what makes a week and a year interpolable pairwise at all. And the first
     draw, which has nothing to tween from, uncovers from the left edge:
     oldest reading to newest, so a timeline is revealed in the direction
     time runs in and the ring on the latest reading is the last thing to
     appear. It plays once per arrival and takes the authored duration, on
     --ease-out, because at --dur-slow it read as a flicker rather than as a
     drawing (Alicja, same round: "a little slower and not linear").

     Under reduced motion both are an instant cut - tier 3's substitute, not
     tier 2's crossfade: a change inside a screen has no journey for a fade
     to stand in for. */
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import { areaPath } from '$lib/charts/areaPath';
  import {
    bridgeGaps,
    lerpSamples,
    resample,
    type Point,
    type Sample,
    type SeriesPoint
  } from '$lib/charts/geometry';
  import type { Role } from '$lib/theme/roles';
  import {
    MIN_PLOT_POSITIONS,
    annotationsAtPoint,
    placeAnnotations,
    type ChartAnnotation
  } from '$lib/charts/annotations';
  import ChartAnnotations, { type HoveredAnnotations } from './ChartAnnotations.svelte';
  import { annotationCaption, annotationLine, annotationReadout } from './chartAnnotation';
  import { wipe } from '$lib/motion/reveal';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';

  let {
    points,
    min = 0,
    max = 100,
    ariaLabel,
    from,
    to,
    formatValue = (v: number) => String(Math.round(v)),
    scrubLabel,
    annotations = [],
    name,
    overlay,
    highlight
  }: {
    /** Already bucketed to the grain the caller chose. */
    points: SeriesPoint[];
    min?: number;
    max?: number;
    /** What the whole chart is, for a screen reader. The marks are
        decoration to it: there is nothing here to tab to. */
    ariaLabel: string;
    /** The two ends of the range, formatted by the caller - dates are
        written against the active locale in $lib/data/dates, and a chart is
        not a second place that decides how this app writes a date. */
    from?: string;
    to?: string;
    /** How the value gutter and the scrub readout write a number. A
        percentage, a dose and a mood step are not written the same way, and
        the chart knows none of them. */
    formatValue?: (value: number) => string;
    /** What the scrubbed position is called - the day, the week, the
        position on a cycle. Same division of labour as `from` and `to`:
        the caller formats, the chart places. Without it the readout shows
        the value alone. */
    scrubLabel?: (point: SeriesPoint, index: number) => string;
    /** What was happening around these readings, in the same units `points`
        counts in - epoch days (charts/annotations.ts). Empty by default: a
        chart opts into annotations, and a chart that would be worse for them
        passes none. */
    annotations?: ChartAnnotation[];
    /** What this series is. Only read when a second metric shares the plot,
        where the heading no longer answers it on its own. */
    name?: string;
    /** A second metric on the same plot (phase 6 ticket 12).

        No `x` of its own: it is read onto `points`' positions by the caller
        (charts/grain.ts's alignSeries), so `values` is the same length and a
        `null` is a position this metric has no reading at. Aligning here
        instead would mean the chart deciding what a position is, which is
        the one thing the caller owns.

        Its own range, because that is the point of it: mood's 1 to 5 and a
        dimension's 0 to 100 are placed by where each sits inside its own
        bounds, and the two lines are then comparable in shape without
        either being rescaled into the other's units. That placement is the
        **Normalized value** and it is never shown - the plot prints no
        value gutter once there are two series on it, and every number
        anybody reads here comes back out of `formatValue` in the metric's
        own **Native units**. */
    overlay?: {
      values: Sample[];
      min: number;
      max: number;
      name: string;
      formatValue: (value: number) => string;
      /** Whether this line is placed against the first one's scale rather
          than its own. False for two metrics, which is what the two ranges
          above are for; true where the pair is one range with two ends -
          the top and the bottom of a pitch band, say (charts/ownSeries.ts).

          What it changes is the value gutter. The gutter goes when two
          lines are placed against two ranges, because printing one of the
          two beside both lines would have the other read against numbers
          that are not its own; with one range there is no such problem and
          the ends of the scale are the ends of both lines. */
      sharedScale?: boolean;
      /** A second stripe of the active flag, so a palette switch recolours
          both lines. Colour is never the only thing telling them apart: the
          second line is dashed and the legend under the plot repeats the
          dash beside the name.

          Drawn in the role's `paired` rather than its raw stripe: the flag's
          own colour wherever the stripe is one, and a visible version of it
          where the stripe is one of the flag's shades. A lone mark on a card
          owes no contrast ratio and takes the stripe exactly; two lines on
          one plot are the case that rule was not written for, and agender is
          where it shows - its flag's second band is #1A1A1A, which on a dark
          card is the card. See Role.paired in $lib/theme/roles. */
      role?: Role;
    };
    /** Which of `points` fall on a day logged under the chosen presentation
        (phase 8 features ticket 17, ADR-0048), and what colour to ring
        them in. `at` is aligned with `points` the same way `overlay.values`
        is - the caller places, this chart only draws - because only the
        caller knows what a position covers on a re-keyed axis
        ($lib/charts/presentationHighlight.ts).

        A ring around the existing dot, never a second mark: the chip
        highlights, it never adds a reading nobody logged (ADR-0030's rank,
        never gate, restated for a mark). Drawn regardless of how many
        points are on the plot - unlike the plain dots below, which give way
        to the line past sixty of them - because a chosen presentation
        covering most of a long range is exactly the case ticket 17 asks to
        still read clearly. */
    highlight?: {
      at: boolean[];
      role: Role;
    };
  } = $props();

  /* An overlay whose values do not line up with the positions they are
     supposed to share is not drawn. There is no honest way to place it, and
     a second line spread across the wrong dates is worse than one line. */
  let overlaid = $derived(overlay !== undefined && overlay.values.length === points.length);
  /* Whether the plot has one scale on it, whatever the number of lines -
     which is the question the value gutter is really asking. */
  let oneScale = $derived(!overlaid || overlay!.sharedScale === true);

  const HEIGHT = 132;
  /* Room for the ring on the latest reading and for the stroke at the top
     and bottom of the scale. */
  const PAD = 7;
  /* How far a hover label stands off the mark it names. Enough that the two
     read as a label and a mark rather than as one taller mark. */
  const LABEL_GAP = 6;

  /* Both series tween on one clock rather than one each. They are drawn on
     one plot and switched by one control, so two timelines would show up as
     the pair arriving out of step - and `moving`, which decides whether the
     geometry is smoothed yet, is one answer for the whole chart. */
  let target = $derived<Sample[][]>(
    overlaid ? [points.map((p) => p.y), overlay!.values] : [points.map((p) => p.y)]
  );
  let shown = $state<Sample[][]>([]);
  /* Straight segments while the line is moving, smoothed once it settles -
     see the note in $lib/charts/geometry. */
  let moving = $state(false);

  $effect(() => {
    const next = target;
    const previous = untrack(() => shown);
    const duration = motionDuration('--dur-slow');

    // Nothing to travel from on a first draw, and nothing to travel with
    // under reduced motion: arrive at the dataset instead. The first draw's
    // own arrival is the wipe below, not this.
    if (duration === 0 || previous.length === 0) {
      shown = next;
      return;
    }

    // The outgoing shape, counted the way the incoming one is counted.
    // Positions the outgoing dataset had no reading at are dropped before it
    // is resampled: a gap is an absence of shape, not a shape at zero.
    //
    // Per series, so a second scale arriving does not cut the line that was
    // already there. The two share their positions, so adding one re-counts
    // the other, and the first line moving to its new positions is a journey
    // it can take. The new line has no outgoing shape of its own and starts
    // where it ends; what marks its arrival is the fade in the markup.
    const start = next.map((series, i) =>
      previous[i]
        ? resample(
            previous[i]
              .map((y, j) => ({ x: j / Math.max(1, previous[i].length - 1), y }))
              .filter((point): point is Point => point.y !== null),
            series.length
          )
        : series
    );
    let frame = 0;
    const began = performance.now();
    moving = true;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      shown = next.map((series, i) => lerpSamples(start[i], series, EASE_OUT(t)));
      if (t < 1) frame = requestAnimationFrame(step);
      else moving = false;
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      moving = false;
    };
  });

  /* Measured in real pixels rather than stretched to fit: the ring on the
     latest reading has to stay a circle, and an SVG scaled non-uniformly
     turns every circle in it into an ellipse. */
  let width = $state(0);
  let plotWidth = $derived(Math.max(width, 1));
  let plotBox = $derived({ width: Math.max(plotWidth - PAD * 2, 1), height: HEIGHT - PAD * 2 });
  /* Drawn off the bridged shape and never read off it: a position one metric
     has no reading at is still somewhere its line passes through, and
     breaking there would draw a sparse metric as marks nobody can see. The
     numbers the readout shows come from the props, which carry only what was
     logged. */
  let path = $derived(areaPath(bridgeGaps(shown[0] ?? []), { ...plotBox, min, max }, !moving));
  /* Placed against its own bounds, which is what puts two metrics with
     different ranges on one plot at all. Read off `shown` rather than off
     `overlaid` so a frame where the two disagree - the props have changed
     and the tween has not run yet - draws nothing rather than drawing the
     second series against the first one's scale. */
  let overlayPath = $derived(
    shown.length > 1 && overlay
      ? areaPath(bridgeGaps(shown[1]), { ...plotBox, min: overlay.min, max: overlay.max }, !moving)
      : null
  );

  /* The settle crossfade. Swapping straight segments for the monotone curve
     is a real corner-rounding, not a redraw of the same shape, and doing it
     in the single frame `moving` goes false read as the line jumping into
     its resting state rather than arriving there (Alicja, 2026-08-28: "the
     graph line jumps to smoothed out state ... it needs to be smooth when
     it starts being drawn"). `dots`/`last` do not change between the two -
     only the curve interpolation between them does - so this only ever
     needs to fade the line and fill layers, and `path` above is already the
     settled, smooth geometry underneath by the time this plays: what fades
     is a snapshot of the last straight-segment frame, laid on top of it and
     faded to nothing, never a second live copy recomputed on every frame -
     rebuilding the smoothed curve that often is the cost geometry.ts's own
     note measured and ruled out. */
  let lastMovingPath = $state<{ line: string; fill: string; overlay: string } | null>(null);
  let wasMoving = false;

  $effect(() => {
    if (moving) lastMovingPath = { line: path.line, fill: path.fill, overlay: overlayPath?.line ?? '' };
    else if (wasMoving) lastMovingPath = null; // out:fade below plays it out
    wasMoving = moving;
  });

  /* The scrub. Held as an index rather than as a pixel, so it survives a
     resize and a re-tween without pointing at a position that has moved. */
  let scrub = $state<number | null>(null);
  /* What the finger is on: a position, and whichever of the two series has
     a reading there. Either may be missing - a position one metric was not
     being logged over is a real position on the plot, and the readout says
     the other metric's number and nothing where there is nothing. */
  let at = $derived.by(() => {
    if (scrub === null || !points[scrub]) return null;
    const dot = path.dots[scrub] ?? null;
    const overlayDot = overlayPath?.dots[scrub] ?? null;
    if (!dot && !overlayDot) return null;
    return {
      x: (dot ?? overlayDot)!.x,
      dot,
      overlayDot,
      point: points[scrub],
      /* Off the props rather than off `shown`. `shown` is the tween buffer:
         mid-flight it holds a number on its way between two datasets, and
         between the props changing and the effect running it holds the last
         dataset or nothing. Neither is a reading anybody logged. */
      value: points[scrub].y,
      overlayValue: overlaid ? (overlay?.values[scrub] ?? null) : null
    };
  });
  /* The dotted rule stops at the higher of the two marks: it exists to say
     where along the plot the finger is, and running it past the readings it
     is pointing at would draw the axis this chart does not have. */
  let scrubTop = $derived(
    at ? Math.min(...[at.dot?.y, at.overlayDot?.y].filter((y) => y !== undefined)) : 0
  );

  /* Laid out against the plot's own positions rather than against the
     calendar: the chart draws its buckets evenly spaced whatever the days
     behind them are, so an annotation has to be placed the same way or it
     lands beside the reading it belongs to. */
  /* Nothing is annotated on a chart with one reading on it: there is no
     distance for a band to have and no position for a mark to be at, so the
     caption would name things the plot never drew. The threshold is the
     placement's own, rather than a second copy of it here. */
  let shownAnnotations = $derived(points.length >= MIN_PLOT_POSITIONS ? annotations : []);
  let placed = $derived(placeAnnotations(shownAnnotations, points, Math.max(plotWidth - PAD * 2, 1)));
  /* What the pointer is on, and what to write beside it. A hover names one
     mark where the scrub names a whole bucket, which is the difference
     between pointing at a thing and reading a position - so this is its own
     label rather than a second way of filling the readout. */
  let hovered = $state<HoveredAnnotations | null>(null);

  /* The readout's own annotations go quiet while a mark is hovered. A mouse
     moving across the plot scrubs it as well as hovering, so both would
     otherwise write the same names twice on one card - and the two answer
     different questions anyway: the pill says what is at this position, the
     label says what this mark is. The value stays either way. */
  /* And with two metrics up they go quiet altogether. The readout carries a
     number per line then, and the pill would be six rows laid over a 132px
     plot - covering the marks it is answering about. What was happening is
     still named under the plot, where it was already named. */
  let atAnnotations = $derived(
    annotationReadout(
      scrub === null || hovered || overlaid
        ? []
        : annotationsAtPoint(shownAnnotations, points, scrub)
    )
  );
  let caption = $derived(annotationCaption(shownAnnotations));
  /* Named here rather than called in the markup, for the reason the scrub
     handlers above are: kit-surfaces.test.ts reads a component's copy with a
     regex, and a message call carrying an object argument is a nested brace
     it cannot see past - so the key itself reads as inline copy. */
  let restLabel = $derived(m.chart_annotations_and_more({ count: String(atAnnotations.rest) }));

  let hoveredLabels = $derived(annotationReadout(hovered?.annotations ?? []));
  let hoveredRest = $derived(m.chart_annotations_and_more({ count: String(hoveredLabels.rest) }));
  /* Centred on the mark, then held inside the plot: a mark near either end
     would otherwise carry its label off the card. Half the label's own
     maximum, which is the width the stylesheet caps it at. */
  const LABEL_HALF = 84;
  let hoveredLeft = $derived(
    Math.min(Math.max((hovered?.x ?? 0) + PAD, LABEL_HALF), Math.max(plotWidth - LABEL_HALF, LABEL_HALF))
  );

  /* Named rather than written inline. An arrow in an attribute is also an
     arrow to anything reading this markup with a regex, and
     tests/kit-surfaces.test.ts strips tags with one. */
  const scrubTo = (event: PointerEvent) => (scrub = nearest(event));
  const scrubIfHeld = (event: PointerEvent) => {
    if (scrub !== null || event.pointerType === 'mouse') scrub = nearest(event);
  };
  const clearScrub = () => (scrub = null);

  function nearest(event: PointerEvent) {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - box.left - PAD;
    const span = Math.max(box.width - PAD * 2, 1);
    const index = Math.round((x / span) * Math.max(path.dots.length - 1, 1));
    return Math.min(Math.max(index, 0), path.dots.length - 1);
  }
</script>

{#if path.last || overlayPath?.last}
  <!-- pan-y, not none: a drag across the plot scrubs it and a drag down the
       screen still scrolls the screen, which is the gesture a chart in the
       middle of a long page owes. -->
  <!-- role="img" with the chart's own name on it: the scrub is a way of
       reading the picture rather than a control with a value of its own, and
       the <svg> inside carries the same name for the tree that ignores the
       wrapper. There is nothing here to tab to, which is why the exact
       numbers also live in a list the screen offers separately. -->
  <div
    class="kit-area"
    class:has-overlay={overlaid}
    class:no-gutter={!oneScale}
    data-chart="area"
    role="img"
    aria-label={ariaLabel}
    style:--role-2={overlay?.role?.paired}
    style:--highlight={highlight?.role.mark}
    in:wipe={{ authored: true }}
    onpointerdown={scrubTo}
    onpointermove={scrubIfHeld}
    onpointerup={clearScrub}
    onpointercancel={clearScrub}
    onpointerleave={clearScrub}
  >
    <!-- The value gutter. No gridlines, no legend, no tick marks: the ends
         of the scale and its middle, and the marks carry the rest.

         Gone once a second metric shares the plot, because there is no
         longer one scale for it to be the ends of. Two metrics are placed by
         where each sits inside its own range, so a gutter here would be one
         of the two ranges printed beside both lines, and the other line
         would be read against numbers that are not its own. The scrub
         readout says both values in their own units instead.

         It stays for a pair placed against one range, though - the two ends
         of one band are the case that rule was not written for, and the
         ends of the scale are the ends of both lines. -->
    {#if oneScale}
      <div
        class="kit-area-scale"
        data-chart-scale
        aria-hidden="true"
        out:fade={{ duration: motionDuration('--dur-fast') }}
      >
        <span>{formatValue(max)}</span>
        <span>{formatValue(min + (max - min) / 2)}</span>
        <span>{formatValue(min)}</span>
      </div>
    {/if}

    <div class="kit-area-plot-wrap" bind:clientWidth={width}>
      <svg
        class="kit-area-plot"
        width={plotWidth}
        height={HEIGHT}
        viewBox="0 0 {plotWidth} {HEIGHT}"
        aria-hidden="true"
      >
        <g transform="translate({PAD}, {PAD})">
          <!-- Under the fill and the line, never over them: context sits
               behind the readings it is context for. -->
          <ChartAnnotations {placed} height={HEIGHT - PAD * 2} onHover={(next) => (hovered = next)} />
          <!-- The fill goes when a second metric arrives. A filled line
               beside an unfilled one reads as the reading and its footnote,
               and neither of these two is the other's footnote - so both are
               plain strokes of equal weight, and the second is dashed. -->
          {#if !overlaid}<path class="kit-area-fill" d={path.fill} />{/if}
          <path class="kit-area-line" d={path.line} />
          {#if overlayPath}
            <!-- Faded in and out rather than cut. It has no outgoing shape to
                 travel from - it was not on the plot a moment ago - so what
                 says it arrived is the arrival itself. Tier 3's substitute
                 under reduced motion is an instant cut, which motionDuration
                 gives it for free. -->
            <path
              class="kit-area-line is-overlay"
              d={overlayPath.line}
              in:fade={{ duration: motionDuration('--dur-med') }}
              out:fade={{ duration: motionDuration('--dur-fast') }}
            />
          {/if}
          {#if lastMovingPath}
            <!-- The settling frame, laid over the smoothed geometry
                 underneath and faded out rather than swapped in an instant -
                 see the note above `lastMovingPath`. -->
            {#if !overlaid}
              <path class="kit-area-fill" d={lastMovingPath.fill} out:fade={{ duration: motionDuration('--dur-med') }} />
            {/if}
            <path class="kit-area-line" d={lastMovingPath.line} out:fade={{ duration: motionDuration('--dur-med') }} />
            {#if lastMovingPath.overlay}
              <path
                class="kit-area-line is-overlay"
                d={lastMovingPath.overlay}
                out:fade={{ duration: motionDuration('--dur-med') }}
              />
            {/if}
          {/if}
          {#if path.dots.length <= 60 && !overlaid}
            <!-- A mark per reading, once there is room for one to be looked
                 at. Past that they are a dotted smear and the line says it
                 better on its own.

                 None at all with two series up: a mark per reading on one of
                 them and not the other would weight the pair, and on both it
                 is two dotted smears crossing each other. The two lines, the
                 dash and the scrub carry it. -->
            {#each path.dots.slice(0, -1) as dot, i (i)}
              {#if dot}<circle class="kit-area-dot" cx={dot.x} cy={dot.y} r="2.5" />{/if}
            {/each}
          {/if}
          {#if highlight && !overlaid}
            <!-- An outer ring around the existing mark, drawn whatever the
                 point count - ticket 17's own warning that this has to
                 still read when most of the range is highlighted is what
                 keeps this out of the <=60 gate above. Wider than both the
                 plain dot (r=2.5) and the latest-reading ring (r=5) it can
                 land on, so a highlighted last reading draws two visibly
                 concentric rings rather than one ring on top of another the
                 same size - and dashed, so the highlight still reads when a
                 presentation's role happens to be the chart's own role
                 (ticket 17's note: colour is not the only thing telling two
                 marks apart, the same reason the second series is dashed). -->
            {#each path.dots as dot, i (i)}
              {#if dot && highlight.at[i]}
                <circle class="kit-area-highlight" cx={dot.x} cy={dot.y} r="7.5" />
              {/if}
            {/each}
          {/if}
          {#if at}
            <!-- What a scroll used to be for: the exact reading under the
                 finger. Dotted, so it reads as a measurement laid over the
                 chart rather than as another mark drawn on it. -->
            <!-- From the baseline up to the reading and no further: a line
                 that carries on past the value is a gridline, and it made the
                 chart look like it had an axis it does not have (Alicja,
                 2026-08-25). With two series that is the higher of the two
                 marks, for the same reason. -->
            <line
              class="kit-area-scrub"
              x1={at.x}
              x2={at.x}
              y1={HEIGHT - PAD * 2}
              y2={scrubTop}
            />
            {#if at.dot}<circle class="kit-area-scrub-dot" cx={at.dot.x} cy={at.dot.y} r="4.5" />{/if}
            {#if at.overlayDot}
              <circle class="kit-area-scrub-dot is-overlay" cx={at.overlayDot.x} cy={at.overlayDot.y} r="4.5" />
            {/if}
          {/if}
          <!-- The latest reading, ringed on the line rather than annotated
               beside it: the mark is the label. One per series, because each
               line ends where its own metric was last logged and those are
               not the same day. -->
          {#if path.last}<circle class="kit-area-ring" cx={path.last.x} cy={path.last.y} r="5" />{/if}
          {#if overlayPath?.last}
            <circle
              class="kit-area-ring is-overlay"
              cx={overlayPath.last.x}
              cy={overlayPath.last.y}
              r="5"
              in:fade={{ duration: motionDuration('--dur-med') }}
            />
          {/if}
        </g>
      </svg>

      {#if hovered}
        <!-- Beside the mark rather than in the corner: a hover is somebody
             pointing at one thing, and an answer that appeared somewhere else
             on the card would not be an answer to that. Rises the short way
             it is written, which is toward the mark it belongs to. -->
        <div
          class="kit-area-annotation-label"
          data-annotation-label
          style:left="{hoveredLeft}px"
          style:top={hovered.above ? 'auto' : `${PAD + hovered.y + LABEL_GAP}px`}
          style:bottom={hovered.above ? `${HEIGHT - PAD - hovered.y + LABEL_GAP}px` : 'auto'}
          in:fly={{ y: hovered.above ? 4 : -4, duration: motionDuration('--dur-fast'), easing: EASE_OUT }}
        >
          {#each hoveredLabels.labels as label (label)}<span>{label}</span>{/each}
          {#if hoveredLabels.rest}<span>{hoveredRest}</span>{/if}
        </div>
      {/if}

      {#if at}
        <output class="kit-area-readout" data-chart-readout>
          {#if overlaid}
            <!-- Each series' own number, in its own units, named. This is
                 where the value gutter went: the two lines are placed
                 against their own ranges, so nothing on the plot can be read
                 off a shared scale, and the only honest place for a figure
                 is beside the name of the metric it belongs to. The position
                 is written once underneath, because it is one position. -->
            <span class="kit-area-readout-pair">
              {#if at.value !== null}
                <b>{formatValue(at.value)}</b>
                <span>{name ?? ''}</span>
              {/if}
              {#if at.overlayValue !== null && overlay}
                <b>{overlay.formatValue(at.overlayValue)}</b>
                <span>{overlay.name}</span>
              {/if}
              {#if scrubLabel && scrub !== null}
                <span class="kit-area-readout-at">{scrubLabel(at.point, scrub)}</span>
              {/if}
            </span>
          {:else if at.value !== null}
            <span class="kit-area-readout-value">
              <b>{formatValue(at.value)}</b>
              {#if scrubLabel && scrub !== null}<span>{scrubLabel(at.point, scrub)}</span>{/if}
            </span>
          {/if}
          <!-- What was going on at the position under the finger, stated
               beside the reading and never joined to it: the readout says
               both, and says nothing about the two being related. -->
          {#each atAnnotations.labels as label (label)}
            <span class="kit-area-readout-annotation">{label}</span>
          {/each}
          {#if atAnnotations.rest}
            <span class="kit-area-readout-annotation">{restLabel}</span>
          {/if}
        </output>
      {/if}
    </div>
  </div>

  {#if overlaid && overlay}
    <!-- Which line is which. DIRECTION.md's chart rules refuse a legend and
         name one exception, the wear trend's: that rule is about a
         single-series chart whose marks carry their own values, and two
         unnamed lines are not a chart. This is the same case - two metrics
         on two ranges against one axis - so it takes the same exception.

         The swatches are line segments repeating the plot's own strokes, one
         solid and one dashed, so the pairing holds for anybody who cannot
         separate the two colours. -->
    <!-- The stripe is set here as well as on the plot: the two are siblings
         rather than one inside the other, so a custom property declared on
         the plot does not reach the swatch that names its line. -->
    <p
      class="kit-area-legend"
      data-chart-legend
      aria-hidden="true"
      style:--role-2={overlay.role?.paired}
    >
      <span class="kit-area-legend-item"><span class="kit-area-legend-mark"></span>{name ?? ''}</span>
      <span class="kit-area-legend-item"
        ><span class="kit-area-legend-mark is-overlay"></span>{overlay.name}</span
      >
    </p>
  {/if}

  {#if from || to}
    <div class="kit-area-range" aria-hidden="true">
      <span>{from ?? ''}</span>
      <span>{to ?? ''}</span>
    </div>
  {/if}

  {#if shownAnnotations.length}
    <!-- What the marks are, once, under the plot. Names only: the dates are
         where the marks are, and a caption that repeated them would be a
         second axis written in words. -->
    <p class="kit-area-annotations" data-chart-annotations aria-hidden="true">{caption}</p>
    <!-- The same thing for somebody who cannot see where a mark sits. A
         scrub is a way of reading a picture, so it is no use here, and the
         chart's own numbers are already offered as a list by the screens
         that draw one. -->
    <!-- Named after the chart it belongs to: a screen drawing two charts off
         one range draws this list twice, and an unlabelled second copy is a
         list of dates with nothing saying what they are a list of. -->
    <ul class="visually-hidden" aria-label={ariaLabel}>
      {#each shownAnnotations as annotation (annotation.id)}
        <li>{annotationLine(annotation)}</li>
      {/each}
    </ul>
  {/if}
{:else}
  <p class="kit-chart-empty">{m.not_enough_data()}</p>
{/if}

<style>
  /* Whether the plot leaves a column for the value gutter, which is a
     question about the gutter and not about how many lines are up: a pair
     of lines placed against one range keeps its numbers (see `oneScale`),
     and a pair against two ranges has none to print. `.kit-area`'s own
     two-column grid is in kit.css with the rest of this chart; only the
     collapsed state is here, because a new single-consumer class in a
     shared sheet fails scripts/check-screens-classes.mjs and every class
     of this one's kind has exactly one consumer by construction. */
  .kit-area.no-gutter {
    grid-template-columns: minmax(0, 1fr);
  }
</style>

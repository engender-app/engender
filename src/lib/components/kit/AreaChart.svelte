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
  import { fade } from 'svelte/transition';
  import { m } from '$lib/paraglide/messages';
  import { areaPath, lerpSamples, resample, type Point } from '$lib/charts/geometry';
  import { annotationsAtPoint, placeAnnotations, type ChartAnnotation } from '$lib/charts/annotations';
  import ChartAnnotations from './ChartAnnotations.svelte';
  import { annotationCaption, annotationLabel, annotationLine } from './chartAnnotation';
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
    annotations = []
  }: {
    /** Already bucketed to the grain the caller chose. */
    points: Point[];
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
    scrubLabel?: (point: Point, index: number) => string;
    /** What was happening around these readings, in the same units `points`
        counts in - epoch days (charts/annotations.ts). Empty by default: a
        chart opts into annotations, and a chart that would be worse for them
        passes none. */
    annotations?: ChartAnnotation[];
  } = $props();

  const HEIGHT = 132;
  /* Room for the ring on the latest reading and for the stroke at the top
     and bottom of the scale. */
  const PAD = 7;

  let target = $derived(points.map((p) => p.y));
  let shown = $state<number[]>([]);
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
    const start = resample(
      previous.map((y, i) => ({ x: i / Math.max(1, previous.length - 1), y })),
      next.length
    );
    let frame = 0;
    const began = performance.now();
    moving = true;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      shown = lerpSamples(start, next, EASE_OUT(t));
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
  let path = $derived(
    areaPath(shown, { width: Math.max(plotWidth - PAD * 2, 1), height: HEIGHT - PAD * 2, min, max }, !moving)
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
  let lastMovingPath = $state<{ line: string; fill: string } | null>(null);
  let wasMoving = false;

  $effect(() => {
    if (moving) lastMovingPath = { line: path.line, fill: path.fill };
    else if (wasMoving) lastMovingPath = null; // out:fade below plays it out
    wasMoving = moving;
  });

  /* The scrub. Held as an index rather than as a pixel, so it survives a
     resize and a re-tween without pointing at a position that has moved. */
  let scrub = $state<number | null>(null);
  let at = $derived(scrub !== null && path.dots[scrub] ? { dot: path.dots[scrub], point: points[scrub] } : null);

  /* Laid out against the plot's own positions rather than against the
     calendar: the chart draws its buckets evenly spaced whatever the days
     behind them are, so an annotation has to be placed the same way or it
     lands beside the reading it belongs to. */
  /* Nothing is annotated on a chart with one reading on it: there is no
     distance for a band to have and no position for a mark to be at, so the
     caption would name things the plot never drew. */
  let shownAnnotations = $derived(points.length >= 2 ? annotations : []);
  let placed = $derived(placeAnnotations(shownAnnotations, points, Math.max(plotWidth - PAD * 2, 1)));
  let atAnnotations = $derived(scrub === null ? [] : annotationsAtPoint(shownAnnotations, points, scrub));
  let caption = $derived(annotationCaption(shownAnnotations));

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

{#if path.last}
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
    data-chart="area"
    role="img"
    aria-label={ariaLabel}
    in:wipe={{ authored: true }}
    onpointerdown={scrubTo}
    onpointermove={scrubIfHeld}
    onpointerup={clearScrub}
    onpointercancel={clearScrub}
    onpointerleave={clearScrub}
  >
    <!-- The value gutter. No gridlines, no legend, no tick marks: the ends
         of the scale and its middle, and the marks carry the rest. -->
    <div class="kit-area-scale" aria-hidden="true">
      <span>{formatValue(max)}</span>
      <span>{formatValue(min + (max - min) / 2)}</span>
      <span>{formatValue(min)}</span>
    </div>

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
          <ChartAnnotations {placed} height={HEIGHT - PAD * 2} />
          <path class="kit-area-fill" d={path.fill} />
          <path class="kit-area-line" d={path.line} />
          {#if lastMovingPath}
            <!-- The settling frame, laid over the smoothed geometry
                 underneath and faded out rather than swapped in an instant -
                 see the note above `lastMovingPath`. -->
            <path class="kit-area-fill" d={lastMovingPath.fill} out:fade={{ duration: motionDuration('--dur-med') }} />
            <path class="kit-area-line" d={lastMovingPath.line} out:fade={{ duration: motionDuration('--dur-med') }} />
          {/if}
          {#if path.dots.length <= 60}
            <!-- A mark per reading, once there is room for one to be looked
                 at. Past that they are a dotted smear and the line says it
                 better on its own. -->
            {#each path.dots.slice(0, -1) as dot, i (i)}
              <circle class="kit-area-dot" cx={dot.x} cy={dot.y} r="2.5" />
            {/each}
          {/if}
          {#if at}
            <!-- What a scroll used to be for: the exact reading under the
                 finger. Dotted, so it reads as a measurement laid over the
                 chart rather than as another mark drawn on it. -->
            <!-- From the baseline up to the reading and no further: a line
                 that carries on past the value is a gridline, and it made the
                 chart look like it had an axis it does not have (Alicja,
                 2026-08-25). -->
            <line
              class="kit-area-scrub"
              x1={at.dot.x}
              x2={at.dot.x}
              y1={HEIGHT - PAD * 2}
              y2={at.dot.y}
            />
            <circle class="kit-area-scrub-dot" cx={at.dot.x} cy={at.dot.y} r="4.5" />
          {/if}
          <!-- The latest reading, ringed on the line rather than annotated
               beside it: the mark is the label. -->
          <circle class="kit-area-ring" cx={path.last.x} cy={path.last.y} r="5" />
        </g>
      </svg>

      {#if at}
        <output class="kit-area-readout" data-chart-readout>
          <span class="kit-area-readout-value">
            <b>{formatValue(at.point.y)}</b>
            {#if scrubLabel && scrub !== null}<span>{scrubLabel(at.point, scrub)}</span>{/if}
          </span>
          <!-- What was going on at the position under the finger, stated
               beside the reading and never joined to it: the readout says
               both, and says nothing about the two being related. -->
          {#each atAnnotations as annotation (annotation.id)}
            <span class="kit-area-readout-annotation">{annotationLabel(annotation)}</span>
          {/each}
        </output>
      {/if}
    </div>
  </div>

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
    <ul class="visually-hidden">
      {#each shownAnnotations as annotation (annotation.id)}
        <li>{annotationLine(annotation)}</li>
      {/each}
    </ul>
  {/if}
{:else}
  <p class="kit-chart-empty">{m.not_enough_data()}</p>
{/if}

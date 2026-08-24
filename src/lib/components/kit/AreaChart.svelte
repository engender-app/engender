<script lang="ts">
  /* The area chart: a timeline you scroll rather than a range squashed into
     a card. Every reading keeps its own slot, so a year is read a week at a
     time by dragging, and a point is wide enough to be looked at instead of
     being one pixel of a smear.

     What is drawn: one line, a flat fill under it, a mark per reading, and
     the latest one ringed. The value scale sits in a gutter that does not
     scroll, because a scale that slides away with the data is not a scale.
     No gridlines and no legend - the marks carry their own values and the
     gutter says what the ends are.

     Tier 3 (DIRECTION.md): switching range or metric re-tweens the line
     between the two datasets rather than tearing it down. The outgoing
     dataset is read onto the incoming one's own point count first
     ($lib/charts/geometry), which is what makes a week and a year
     interpolable pairwise at all. Under reduced motion the tween is an
     instant cut - tier 3's substitute, not tier 2's crossfade: a change
     inside a screen has no journey for a fade to stand in for. */
  import { untrack } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { areaPath, bucket, lerpSamples, resample, type Point } from '$lib/charts/geometry';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';

  let {
    points,
    min = 0,
    max = 100,
    ariaLabel,
    from,
    to,
    formatValue = (v: number) => String(Math.round(v))
  }: {
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
    /** How the value gutter writes a number. A percentage, a dose and a
        mood step are not written the same way, and the chart knows none of
        them. */
    formatValue?: (value: number) => string;
  } = $props();

  /* A slot per reading, and a floor under how narrow one gets. 14px is
     wide enough that a finger scrolling the timeline lands between marks
     rather than on a smear of them; where a range is short enough to fit,
     the chart stretches to the card instead of leaving a gap. */
  const SLOT = 14;
  const HEIGHT = 132;
  /* Room for the ring on the latest reading and for the stroke at the top
     and bottom of the scale. The scroller clips, so the drawing is inset
     rather than allowed to overflow. */
  const PAD = 7;

  let capped = $derived(bucket(points));
  let target = $derived(capped.map((p) => p.y));
  let shown = $state<number[]>([]);
  /* Straight segments while the line is moving, smoothed once it settles -
     see the note in $lib/charts/geometry. */
  let moving = $state(false);

  $effect(() => {
    const next = target;
    const previous = untrack(() => shown);
    const duration = motionDuration('--dur-slow', 380);

    // Nothing to travel from on a first draw, and nothing to travel with
    // under reduced motion: arrive at the dataset instead.
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
  let viewport = $state(0);
  let plotWidth = $derived(Math.max(viewport, shown.length * SLOT));
  let path = $derived(
    areaPath(
      shown,
      { width: Math.max(plotWidth - PAD * 2, 1), height: HEIGHT - PAD * 2, min, max },
      !moving
    )
  );
  let scrolls = $derived(plotWidth > viewport + 1);
</script>

{#if path.last}
  <div class="kit-area" data-chart="area">
    <!-- The value gutter, outside the scroller on purpose. -->
    <div class="kit-area-scale" aria-hidden="true">
      <span>{formatValue(max)}</span>
      <span>{formatValue(min + (max - min) / 2)}</span>
      <span>{formatValue(min)}</span>
    </div>

    <div class="kit-area-scroll" bind:clientWidth={viewport}>
      <svg
        class="kit-area-plot"
        width={plotWidth}
        height={HEIGHT}
        viewBox="0 0 {plotWidth} {HEIGHT}"
        role="img"
        aria-label={ariaLabel}
      >
        <g transform="translate({PAD}, {PAD})">
        <path class="kit-area-fill" d={path.fill} />
        <path class="kit-area-line" d={path.line} />
        {#if scrolls}
          <!-- A mark per reading, once there is room for one to be looked
               at. Squashed into a card they would be a dotted smear. -->
          {#each path.dots.slice(0, -1) as dot, i (i)}
            <circle class="kit-area-dot" cx={dot.x} cy={dot.y} r="2.5" />
          {/each}
        {/if}
        <!-- The latest reading, ringed on the line rather than annotated
             beside it: the mark is the label. -->
        <circle class="kit-area-ring" cx={path.last.x} cy={path.last.y} r="5" />
        </g>
      </svg>
    </div>
  </div>

  {#if from || to}
    <div class="kit-area-range" aria-hidden="true">
      <span>{from ?? ''}</span>
      <span>{to ?? ''}</span>
    </div>
  {/if}
{:else}
  <p class="kit-chart-empty">{m.not_enough_data()}</p>
{/if}

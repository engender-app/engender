<script lang="ts">
  /* The area chart: one line, a flat fill under it, the latest reading
     ringed on the line, and the range written beneath. No gridlines, no
     legend, no axis furniture - the mark carries its own value.

     Tier 3 (DIRECTION.md): switching range or metric re-tweens the line
     between the two datasets rather than tearing it down and drawing a new
     one. Both datasets are read onto the same fixed grid first
     ($lib/charts/geometry), which is what makes a week and a year
     interpolable pairwise at all, and what caps the per-frame cost at the
     same number of points whichever range is showing.

     Under reduced motion the tween becomes an instant cut, which is tier
     3's substitute rather than tier 2's crossfade: a change inside a screen
     has no journey for a fade to stand in for. motionDuration() returns 0
     there, and this reads it per change rather than once, so turning the
     setting on takes effect on the next switch instead of on the next
     reload. */
  import { untrack } from 'svelte';
  import { m } from '$lib/paraglide/messages';
  import { areaPath, lerpSamples, resample, type Point } from '$lib/charts/geometry';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';

  let {
    points,
    min = 0,
    max = 100,
    ariaLabel,
    from,
    to
  }: {
    points: Point[];
    min?: number;
    max?: number;
    /** What the whole chart is, for a screen reader. The marks are
        decoration to it: there is nothing here to tab to. */
    ariaLabel: string;
    /** The two ends of the range, formatted by the caller - dates are
        written against the active locale in $lib/data/dates, and a chart
        is not a second place that decides how this app writes a date. */
    from?: string;
    to?: string;
  } = $props();

  /* The viewBox is measured in real pixels rather than stretched to fit,
     because the ring on the latest point has to stay a circle. An SVG
     scaled non-uniformly turns every circle in it into an ellipse, and the
     ring is the one mark in this chart that is a shape rather than a line.

     The height is the same 132px kit.css draws the box at; the width is
     whatever the card gives it, read back once it has one. Resizing
     re-derives the path and never re-tweens: the tween watches the data,
     which a rotation does not change. */
  const HEIGHT = 132;
  let width = $state(0);
  let box = $derived({ width: Math.max(width, 1), height: HEIGHT, min, max });

  let target = $derived(resample(points));
  let shown = $state<number[]>([]);

  $effect(() => {
    const next = target;
    const previous = untrack(() => shown);
    const duration = motionDuration('--dur-slow', 380);

    // First draw, a grid that changed shape, or reduced motion: arrive at
    // the new dataset rather than travelling to it.
    if (duration === 0 || previous.length !== next.length) {
      shown = next;
      return;
    }

    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      shown = lerpSamples(previous, next, EASE_OUT(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  let path = $derived(areaPath(shown, box));
</script>

{#if path.last}
  <svg
    class="kit-area"
    data-chart="area"
    viewBox="0 0 {box.width} {HEIGHT}"
    role="img"
    aria-label={ariaLabel}
    bind:clientWidth={width}
  >
    <path class="kit-area-fill" d={path.fill} />
    <path class="kit-area-line" d={path.line} />
    <!-- The latest reading, ringed on the line rather than annotated
         beside it: the mark is the label. -->
    <circle class="kit-area-ring" cx={path.last.x} cy={path.last.y} r="5" />
  </svg>
  {#if from || to}
    <div class="kit-area-scale" aria-hidden="true">
      <span>{from ?? ''}</span>
      <span>{to ?? ''}</span>
    </div>
  {/if}
{:else}
  <p class="kit-chart-empty">{m.not_enough_data()}</p>
{/if}

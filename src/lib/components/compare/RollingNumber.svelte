<script lang="ts">
  /* A figure that rolls to its new value when /compare's periods change,
on the tier-3 curve and duration, the
     way countUp.ts rolls a tile's count. Not countUp itself: that one
     rounds to whole numbers, and mood carries a decimal. The caller's
     `format` is applied on every frame, so the figure is always written the
     way it lands. The first value draws as it is; only a change rolls.
     Under reduced motion `--dur-slow` is 0 and the value lands at once. */
  import { untrack } from 'svelte';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';

  let { value, format }: { value: number; format: (n: number) => string } = $props();

  let shown = $state(untrack(() => value));

  $effect(() => {
    const to = value;
    const from = untrack(() => shown);
    const duration = motionDuration('--dur-slow');
    if (from === to || duration === 0) {
      shown = to;
      return;
    }
    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      shown = from + (to - from) * EASE_OUT(t);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });
</script>

<span class="compare-roll">{format(shown)}</span>

<style>
  .compare-roll {
    font-variant-numeric: tabular-nums;
  }
</style>

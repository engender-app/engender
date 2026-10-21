<script lang="ts">
  /* Saved benchmark trace and its own p10-p90 span on a fixed hertz axis.
     Older benchmarks without stored frames show a sentence instead. */
  import { m } from '$lib/paraglide/messages';
  import { decodePitchTrack } from '$lib/audio/track';
  import { pitchDensity } from '$lib/audio/density';
  import { pitchAxis } from '$lib/audio/bands';
  import type { Role } from '$lib/theme/roles';
  import PitchFigure from '$lib/components/PitchFigure.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { hzLabel } from '$lib/components/pitchBandCopy';
  import { wipe } from '$lib/motion/reveal';

  let {
    pitchTrack,
    medianHz,
    p10Hz,
    p90Hz,
    comfort = null,
    role,
    ...rest
  }: {
    /** The row's own column, as audio/track.ts encoded it. Null for a
        benchmark from before it existed. */
    pitchTrack: string | null;
    medianHz: number;
    p10Hz: number;
    p90Hz: number;
    comfort?: { lowHz: number; highHz: number } | null;
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  let trace = $derived(decodePitchTrack(pitchTrack));

  /** The axis holds the take's own figures whether or not its track
      survived, so the span and the median of an old benchmark are still
      drawn where they belong. */
  let axis = $derived(
    pitchAxis({ hz: [...(trace?.map((frame) => frame.hz) ?? []), medianHz, p10Hz, p90Hz], comfort })
  );

  /** Where the read sat, off the same decoded track the trace is drawn from
      (redesign ticket 42). One decode feeds both, and the figure is handed
      a shape rather than a track so it stays a drawing component. */
  let density = $derived(trace ? pitchDensity(trace, axis) : null);
</script>

<div class="vt" {...roleAttrs(role)} {...rest}>
  {#if trace}
    <div class="vt-draw" in:wipe>
      <PitchFigure
        {axis}
        {comfort}
        {trace}
        {density}
        span={{ lowHz: p10Hz, highHz: p90Hz }}
        {medianHz}
        tickLabel={hzLabel}
      />
      <!-- The take's median and span, stated beside its figure. -->
      <p class="vt-marks" data-vb-take-marks>
        {m.vb_take_marks({
          median: hzLabel(medianHz),
          low: hzLabel(p10Hz),
          high: hzLabel(p90Hz)
        })}
      </p>
    </div>
  {:else}
    <p class="vt-none" data-vb-no-track>{m.vb_take_no_track()}</p>
  {/if}
</div>

<style>
  .vt-draw {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .vt-marks {
    margin: 0;
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--text-2);
  }

  .vt-none {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--text-2);
  }
</style>

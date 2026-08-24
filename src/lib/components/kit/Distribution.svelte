<script lang="ts">
  /* A distribution in vertical bars across a fixed set of steps, on mood's
     own ramp (ADR-0025).

     The ramp is the one colour system in the app that is not derived from
     the flag palette, and it is the right one here: the bar for a step is
     that step's colour, so the distribution is read against the same scale
     the picker is chosen on. Reading it against the section's stripe
     instead would make the reader translate between two scales to see
     which bar is which mood. */
  import { share } from '$lib/charts/geometry';

  export interface DistributionStep {
    /** 1-5 on the mood ramp. */
    step: number;
    name: string;
    count: number;
  }

  let { steps }: { steps: DistributionStep[] } = $props();

  let top = $derived(Math.max(0, ...steps.map((s) => s.count)));
</script>

<div class="kit-dist" data-chart="distribution">
  {#each steps as step (step.step)}
    <div class="kit-dist-step" data-dist-step={step.step}>
      <b class="kit-dist-count">{step.count}</b>
      <span
        class="kit-dist-mark"
        style={`--bar-share: ${share(step.count, top)}; --dist-fill: var(--mood-${step.step})`}
      ></span>
      <span class="kit-dist-name">{step.name}</span>
    </div>
  {/each}
</div>

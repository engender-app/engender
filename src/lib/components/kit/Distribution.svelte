<script lang="ts">
  /* Each vertical bar uses its mood step's own fill so it matches
     the picker (ADR-0025). Pass the index to the stylesheet for a
     shared --stagger-step rise. */
  import { leaderShares } from './barRow';

  export interface DistributionStep {
    /** 1-5 on the mood ramp. */
    step: number;
    name: string;
    count: number;
  }

  let { steps }: { steps: DistributionStep[] } = $props();

  let shares = $derived(leaderShares(steps.map((s) => s.count)));
</script>

<div class="kit-dist" data-chart="distribution">
  {#each steps as step, i (step.step)}
    <div class="kit-dist-step" data-dist-step={step.step} style={`--bar-index: ${i}`}>
      <!-- The count and its column in one cell, bottom-aligned, so the
           number sits on the bar it belongs to. In a grid row of its own
           every count lined up along the top of the card instead, which read
           as a detached row of figures above a chart. -->
      <span class="kit-dist-stack">
        <b class="kit-dist-count">{step.count}</b>
        <span
          class="kit-dist-mark"
          style={`--bar-share: ${shares[i]}; --dist-fill: var(--mood-${step.step})`}
        ></span>
      </span>
      <span class="kit-dist-name">{step.name}</span>
    </div>
  {/each}
</div>

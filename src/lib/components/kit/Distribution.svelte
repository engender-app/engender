<script lang="ts">
  /* A distribution in vertical bars across a fixed set of steps, on mood's
     own ramp (ADR-0025).

     The ramp is the one colour system in the app that is not derived from
     the flag palette, and it is the right one here: the bar for a step is
     that step's colour, so the distribution is read against the same scale
     the picker is chosen on. Reading it against the section's stripe
     instead would make the reader translate between two scales to see
     which bar is which mood.

     Each step carries its own index, the same way a bar row does, and for
     the same reason: the columns rise as a set when the distribution
     arrives, each one --stagger-step behind the one to its left, and the
     pacing belongs to the stylesheet with every other duration in the app.
     This is the bar chart's entrance rather than a second one - a
     distribution is a set of bars, the argument ticket 20 recorded for
     BarRows is the same argument here (watching them draw is what makes the
     comparison legible before the numbers are read), and having one of the
     two rise and the other appear would read as an oversight in whichever
     of them was still. */
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

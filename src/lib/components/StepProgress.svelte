<script lang="ts">
  /* Show one segment per visible step and fill through the current one.
     The accessible name gives the count. Progress.svelte handles operations.

     If a step appears or disappears, animate its segment width. The fill
     moves on the step change's clock. */
  import { m } from '$lib/paraglide/messages';
  import { discloseWidth } from '$lib/motion/reveal';

  let { steps, at }: { steps: readonly string[]; at: string } = $props();
  let index = $derived(steps.indexOf(at));
</script>

<div class="step-progress" role="img" aria-label={m.entry_step_progress({ at: index + 1, count: steps.length })} data-step-progress>
  {#each steps as step, i (step)}
    <span class="step-progress-segment" class:is-reached={i <= index} data-step-segment={step} transition:discloseWidth></span>
  {/each}
</div>

<style>
  .step-progress {
    display: flex;
    gap: var(--space-1);
    align-items: center;
  }
  .step-progress-segment {
    width: var(--space-5);
    height: var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--outline);
    transition: background-color var(--dur-med) var(--ease-out);
  }
  .step-progress-segment.is-reached { background: var(--text); }
</style>

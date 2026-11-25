<script lang="ts">
  /* Where a person is in a new entry's steps (tester report 02, ticket 09):
     one segment per step they will see, filled up to the one they stand
     on. Segments rather than "2 of 4", so the walk reads as a short path
     and not a count of chores left; the count is the accessible name.

     Not Progress.svelte, which is for long-running work (DIRECTION.md,
     "Progress is one shared component", which leaves onboarding's step
     position out of it for the same reason).

     A step that appears or goes away while the person walks (a card the
     day offers arriving after its read) opens or closes its segment's
     width rather than cutting it in. The fill moves along the path on the
     step change's own clock. */
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

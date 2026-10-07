<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, dismissToast } from '$lib/stores/toasts.svelte';
  import { motionDistance, motionDuration } from '$lib/motion/tokens';
</script>

{#each toasts as t (t.id)}
  <div
    class="toast is-open"
    class:is-raised={t.raised}
    role={t.kind === 'failed' ? 'alert' : 'status'}
    data-toast
    data-toast-kind={t.kind}
    transition:fly={{ y: (t.raised ? -1 : 1) * motionDistance('--motion-distance-sm'), duration: motionDuration('--dur-med') }}
  >
    <span>{t.message}</span>
    {#if t.actionLabel}
      <button
        class="toast-action"
        data-toast-action
        onclick={() => {
          dismissToast(t.id);
          t.onAction?.();
        }}>{t.actionLabel}</button
      >
    {/if}
  </div>
{/each}

<style>
  /* A failure said while a sheet stays open (after-release 06): at the top,
     over the dimmed screen, rather than on the sheet's own buttons. It comes
     down from the edge it sits at. */
  .is-raised {
    top: calc(var(--inset-top) + var(--space-4));
    bottom: auto;
  }
</style>

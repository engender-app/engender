<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, dismissToast } from '$lib/stores/toasts.svelte';
  import { speech } from '$lib/stores/announcer.svelte';
  import { motionDistance, motionDuration } from '$lib/motion/tokens';
</script>

{#each toasts as t (t.id)}
  <div
    class="toast is-open"
    class:is-raised={t.raised}
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

<!-- The app's voice (announcer.ts): a toast is drawn above and said here,
     because a region inserted already holding its words is often not read
     at all. These two never leave the page. -->
<p class="visually-hidden" role="status" data-announce>{speech.polite}</p>
<p class="visually-hidden" role="alert" data-announce-urgent>{speech.assertive}</p>

<style>
  /* A failure said while a sheet stays open (after-release 06): at the top,
     over the dimmed screen, rather than on the sheet's own buttons. It comes
     down from the edge it sits at. */
  .is-raised {
    top: calc(var(--inset-top) + var(--space-4));
    bottom: auto;
  }
</style>

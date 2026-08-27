<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, dismissToast } from '$lib/stores/toasts.svelte';
  import { motionDistance, motionDuration } from '$lib/motion/tokens';
</script>

{#each toasts as t (t.id)}
  <div
    class="toast is-open"
    role="status"
    data-toast
    data-toast-kind={t.kind}
    transition:fly={{ y: motionDistance('--motion-distance-sm'), duration: motionDuration('--dur-med') }}
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

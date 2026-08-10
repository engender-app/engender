<script lang="ts">
  import { fly } from 'svelte/transition';
  import { toasts, dismissToast } from '$lib/stores/toasts.svelte';
</script>

{#each toasts as t (t.id)}
  <div class="toast is-open" role="status" transition:fly={{ y: 10, duration: 240 }}>
    <span>{t.message}</span>
    {#if t.actionLabel}
      <button
        class="toast-action"
        onclick={() => {
          dismissToast(t.id);
          t.onAction?.();
        }}>{t.actionLabel}</button
      >
    {/if}
  </div>
{/each}

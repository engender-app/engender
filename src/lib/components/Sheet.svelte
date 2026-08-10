<script lang="ts">
  import { fade, fly } from 'svelte/transition';
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title = '',
    onClose,
    children,
  }: { open?: boolean; title?: string; onClose?: () => void; children: Snippet } = $props();

  function close() {
    open = false;
    onClose?.();
  }

  function scrim(node: HTMLElement) {
    // Focus the first focusable control when the sheet opens.
    const el = node.querySelector<HTMLElement>('input, button, select, textarea, [tabindex]');
    el?.focus();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (open && e.key === 'Escape') close();
  }}
/>

{#if open}
  <div
    class="sheet-scrim is-open"
    role="presentation"
    transition:fade={{ duration: 200 }}
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      transition:fly={{ y: 24, duration: 240 }}
      {@attach scrim}
    >
      <div class="sheet-handle"></div>
      {@render children()}
    </div>
  </div>
{/if}

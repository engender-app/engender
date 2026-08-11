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

  /* Focus the field a sheet exists to fill; otherwise the sheet itself,
     which is where a dialog's focus belongs anyway - the label is read out
     and Tab walks in from the top. Never the first button: on the sheets
     that ask something irreversible that button is "yes", and a sheet that
     opens with "yes" under the cursor is one stray Enter from doing the
     thing it opened to warn about (ticket 15, F22). */
  function scrim(node: HTMLElement) {
    const field = node.querySelector<HTMLElement>('input, select, textarea');
    (field ?? node).focus();
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
      tabindex="-1"
      transition:fly={{ y: 24, duration: 240 }}
      {@attach scrim}
    >
      <div class="sheet-handle"></div>
      {@render children()}
    </div>
  </div>
{/if}

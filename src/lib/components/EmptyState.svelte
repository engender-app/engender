<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    text,
    action,
    level = 3,
  }: {
    title: string;
    text: string;
    action?: Snippet;
    /** The placing screen's to say: 2 where this stands straight under a
        screen's h1 (after-release 21, audit A11Y-13). */
    level?: 2 | 3;
  } = $props();
</script>

<div class="empty-state">
  <svelte:element this={`h${level}`}>{title}</svelte:element>
  <p>{text}</p>
  {#if action}{@render action()}{/if}
</div>

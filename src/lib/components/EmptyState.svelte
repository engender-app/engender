<script lang="ts">
  import RiveSlot from './RiveSlot.svelte';
  import type { Snippet } from 'svelte';

  let {
    title,
    text,
    action,
  }: { title: string; text: string; action?: Snippet } = $props();
</script>

<div class="empty-state">
  <RiveSlot height={140} />
  <h3>{title}</h3>
  <p>{text}</p>
  {#if action}{@render action()}{/if}
</div>

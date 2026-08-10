<script lang="ts">
  import RiveSlot from './RiveSlot.svelte';
  import type { Snippet } from 'svelte';

  let {
    riveLabel,
    title,
    text,
    action,
  }: { riveLabel: string; title: string; text: string; action?: Snippet } = $props();
</script>

<div class="empty-state">
  <RiveSlot label={riveLabel} height={140} />
  <h3>{title}</h3>
  <p>{text}</p>
  {#if action}{@render action()}{/if}
</div>

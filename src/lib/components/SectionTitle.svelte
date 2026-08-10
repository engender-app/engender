<script lang="ts">
  import type { Snippet } from 'svelte';

  let { text, aside }: { text: string; aside?: Snippet } = $props();
</script>

<div class="section-title">
  <h2>{text}</h2>
  {#if aside}<span class="section-aside">{@render aside()}</span>{/if}
</div>

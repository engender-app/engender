<script lang="ts">
  /* Journal book opening card. The content type has no journal text or photo. */
  import type { WrappedCardContent } from '$lib/data/wrappedCard';

  let { content }: { content: WrappedCardContent } = $props();
</script>

<div class="wrapped-card" data-wrapped-card>
  {#if content.paletteArt}
    <div class="wrapped-card-art" data-wrapped-card-art aria-hidden="true"></div>
  {/if}
  {#if content.stats.length}
    <div class="wrapped-stats" data-wrapped-card-stats>
      {#each content.stats as stat}
        <div class="wrapped-stat" data-wrapped-stat>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

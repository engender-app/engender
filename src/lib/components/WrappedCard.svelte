<script lang="ts">
  /* The shared wrapped-card renderer (ticket 16), behind ticket 17's book
     opening page and ticket 18's share card. One rendering path for both,
     so the visual object they describe under two names is only built once.

     Everything shown here was chosen by the caller before this component
     ever mounts - `WrappedCardContent` has no field for journal text or a
     photo, so there is nothing to opt back in accidentally. Picking what
     goes into `content` is each call site's own concern (an inclusion
     picker for one, an element picker for the other), not this
     component's. */
  import type { WrappedCardContent } from '$lib/data/wrappedCard';

  let { content }: { content: WrappedCardContent } = $props();
</script>

<div class="wrapped-card" data-wrapped-card>
  {#if content.paletteArt}
    <div class="wrapped-card-art" data-wrapped-card-art aria-hidden="true"></div>
  {/if}
  {#if content.stats.length}
    <div class="wrapped-stats" data-wrapped-card-stats>
      {#each content.stats as stat (stat.label)}
        <div class="wrapped-stat" data-wrapped-stat>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

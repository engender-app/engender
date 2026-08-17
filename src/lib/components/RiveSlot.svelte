<script lang="ts">
  import Icon from './Icon.svelte';

  let {
    height = 120,
    variant = 'bloom',
  }: { height?: number; variant?: 'bloom' | 'confetti' } = $props();
</script>

<!-- RV-002: this used to announce a description of an intended Rive asset
     ("confetti in flag colours") that never existed; the CSS fallback is
     now the only thing that ever rendered here (ticket 09). Every call site
     already states the same thing in an adjacent heading/body, so the
     accessible name was redundant on top of being wrong - dropped to
     decoration rather than rewritten. -->
<div class="rive-stage" style:height="{height}px" aria-hidden="true">
  {#if variant === 'confetti'}
    <div class="confetti" aria-hidden="true">
      {#each Array.from({ length: 14 }) as _, i (i)}
        <i class="cf cf-{i % 7}"></i>
      {/each}
    </div>
    <span class="bloom-core"><Icon name="sparkle" size={26} /></span>
  {:else}
    <div class="bloom" aria-hidden="true"><i></i><i></i><i></i></div>
    <span class="bloom-core"><Icon name="heart" size={24} /></span>
  {/if}
</div>

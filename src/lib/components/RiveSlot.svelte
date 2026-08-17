<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import Icon from './Icon.svelte';

  let {
    label,
    height = 120,
    variant = 'bloom',
  }: { label: string; height?: number; variant?: 'bloom' | 'confetti' } = $props();
</script>

<div class="rive-stage" style:height="{height}px" role="img" aria-label={m.rive_aria({ label })}>
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

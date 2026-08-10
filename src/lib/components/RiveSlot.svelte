<script lang="ts">
  import { Rive } from '@rive-app/canvas';
  import Icon from './Icon.svelte';

  let {
    label,
    src = '',
    height = 120,
    variant = 'bloom',
  }: { label: string; src?: string; height?: number; variant?: 'bloom' | 'confetti' } = $props();

  /* Real Rive wiring: when a .riv asset lands in static/rive/, pass its path
     as `src` and it plays; until then (or if loading fails) the animated
     CSS fallback below renders — the PRD's required static/graceful fallback. */
  let riveLoaded = $state(false);

  function attachRive(canvas: HTMLCanvasElement) {
    if (!src) return;
    let rive: Rive | undefined;
    fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error('missing asset');
        return res.arrayBuffer();
      })
      .then((buffer) => {
        rive = new Rive({
          buffer,
          canvas,
          autoplay: true,
          onLoad: () => (riveLoaded = true),
        });
      })
      .catch(() => (riveLoaded = false));
    return () => rive?.cleanup();
  }
</script>

<div class="rive-stage" style:height="{height}px" role="img" aria-label="{label} (animated illustration)">
  {#if src}
    <canvas {@attach attachRive} style:display={riveLoaded ? 'block' : 'none'} width="600" height={height * 2}
    ></canvas>
  {/if}
  {#if !riveLoaded}
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
  {/if}
  <span class="rive-chip" title={label}><Icon name="zap" size={12} /> Rive</span>
</div>

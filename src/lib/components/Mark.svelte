<script lang="ts">
  /* mark.ts supplies the same drawing that render-mark.mjs uses for
     shipped icons. Read activeFlag on unlocked screens. Reading CSS
     stripes on mount could race SQLite and use the previous flag.

     tile and launcher-round keep a black edge. mono draws in a single
     print ink. The print caller controls inclusion. Keep the mark
     still, as mark.test.ts requires. */
  import { markSvg, type MarkCrop } from './mark';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';

  let {
    size = 48,
    crop = 'tile' as MarkCrop,
    /* One ink and four rings: what a printed page and any single-colour
       reproduction take. `currentColor` rather than a hex, so the print
       stylesheet's own black is what reaches the paper. */
    mono = false,
    label
  }: { size?: number; crop?: MarkCrop; mono?: boolean; label?: string } = $props();

  /* A clip path needs an id and a document can hold two marks, so this is
     minted per instance rather than derived from the crop the way a
     generated file's is. */
  const clipId = $props.id();

  let svg = $derived(
    markSvg(activeFlag.stripes, crop, size, {
      ink: mono ? 'currentColor' : undefined,
      id: clipId,
      label
    })
  );
</script>

{#if mono || activeFlag.stripes.length > 0}
  <span class="mark" style={`--mark-size: ${size}px`}>{@html svg}</span>
{/if}

<style>
  .mark {
    display: inline-flex;
    width: var(--mark-size);
    height: var(--mark-size);
    flex: none;
  }
</style>

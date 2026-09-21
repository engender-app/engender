<script lang="ts">
  /* The app's mark on a screen or on a printed page (ticket 50).

     The drawing is mark.ts's and nothing is redrawn here, for the reason
     Icon.svelte gives about icons.ts: the same string is what
     scripts/render-mark.mjs writes into every shipped icon file, so the
     favicon, the launcher tile and this are provably one drawing rather
     than three that agree today.

     Three things this component decides, and they are the only three.

     The flag. On screen the mark takes the active flag, from the same
     source as everything else - $lib/theme/activeFlag, published by the
     shell in the effect that stamps the palette. Reading `--motif-stripes`
     here instead would race the palette arriving from SQLite on a cold
     start and silently draw the previous flag (activeFlag.svelte.ts says
     why at length).

     The disguise. Every surface that carries the mark falls back to type
     when disguise is on (ADR-0014, ticket 38's own constraint), so the
     component draws nothing at all rather than drawing something neutral.
     Read off the preference, the same belt-and-braces check Home makes on
     the sun.

     No tile. `bare` by default, because the tile belongs to the icon and
     not to the app: a white chip on every dark screen is not the app's
     surface language (DIRECTION rule 4).

     It does not move, on any surface. There is no entrance, no hover and no
     view-transition name here, and mark.test.ts reads this file to keep it
     that way. */
  import { markSvg, type MarkCrop } from './mark';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';

  let {
    size = 48,
    crop = 'bare' as MarkCrop,
    /* One ink and four rings: what a printed page and any single-colour
       reproduction take. `currentColor` rather than a hex, so the print
       stylesheet's own black is what reaches the paper. */
    mono = false,
    label
  }: { size?: number; crop?: MarkCrop; mono?: boolean; label?: string } = $props();

  let svg = $derived(
    markSvg(activeFlag.stripes, crop, size, { ink: mono ? 'currentColor' : undefined, label })
  );
</script>

{#if !prefs.disguise && (mono || activeFlag.stripes.length > 0)}
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

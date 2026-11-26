<script lang="ts">
  /* hostSaveBar moves this node beside the scroll region so layout
     reserves its full height. app.css owns the frame styling.

     Use one for a full-width action, row for equal peers, and stack
     for a primary with a way past it (DIRECTION.md rules 12 and 15). */
  import type { Snippet } from 'svelte';
  import { navigating } from '$app/state';
  import { hostSaveBar } from '$lib/stores/saveBar.svelte';

  let {
    children,
    arrange = 'one'
  }: { children: Snippet; arrange?: 'one' | 'row' | 'stack' } = $props();
</script>

<!-- The host animates the foot because Svelte outros hold the
     whole branch, which held old tab content for 380ms. Check cuts
     when each motion starts. Navigation cuts and in-screen changes
     travel.

     Keep variant classes literal so the source coverage census can
     see them. one is the base case. savebar-clearance-gallery.mjs
     covers savebar-row with a recorded take. -->
<div
  class="app-savebar"
  class:savebar-row={arrange === 'row'}
  class:savebar-stack={arrange === 'stack'}
  data-app-savebar
  use:hostSaveBar={{ cuts: () => !!navigating.to }}
>
  {@render children()}
</div>

<script lang="ts">
  /* Two-up destinations, each carrying its own data.

     Deliberately not four same-size icon-plus-heading-plus-text cards: the
     craft floor names that as the lazy page scaffold and the slop audit
     took it off the Stats screen, which is a list now. What earns a tile is
     having something to show on it. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    role,
    flagFill,
    children
  }: {
    role?: Role;
    /** The whole flag as a fill, from $lib/theme/roles. The tiles' numbers
        are drawn with it; the tiles themselves keep the section's one
        stripe, so a pair reads as one area of the screen. */
    flagFill?: string;
    children: Snippet;
  } = $props();
</script>

<div
  class="kit-tiles"
  data-tile-grid
  {...roleAttrs(role)}
  style:--flag-fill={flagFill}
>
  {@render children()}
</div>

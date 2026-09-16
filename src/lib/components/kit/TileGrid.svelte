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
    bar,
    children,
    ...rest
  }: {
    role?: Role;
    /** The band the bar under a tight tile's value is drawn in, from
        $lib/theme/roles' flagBarRole: another colour of the same flag, so
        the mark reads against the block rather than into it. The whole flag
        as a gradient was what the bar used to be, and on a block of one of
        that flag's own colours the matching band disappeared. */
    bar?: Role;
    children: Snippet;
    [attribute: string]: unknown;
  } = $props();
</script>

<div
  class="kit-tiles"
  data-kit-surface
  data-tile-grid
  {...roleAttrs(role)}
  style:--flag-bar={bar?.stripe}
  {...rest}
>
  {@render children()}
</div>

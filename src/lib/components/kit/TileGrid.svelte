<script lang="ts">
  /* Two-up destinations, each carrying its own data.

     Deliberately not four same-size icon-plus-heading-plus-text cards: the
     craft floor names that as the lazy page scaffold and the slop audit
     took it off the Stats screen, which is a list now. What earns a tile is
     having something to show on it. */
  import type { Snippet } from 'svelte';
  import { roleStyle } from './role';
  import type { Role } from '$lib/theme/roles';

  let { role, children }: { role?: Role; children: Snippet } = $props();
</script>

<div class="kit-tiles" data-tile-grid style={roleStyle(role)}>
  {@render children()}
</div>

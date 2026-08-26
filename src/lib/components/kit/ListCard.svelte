<script lang="ts">
  /* The list card: rows under one outline, each separated by a hairline
     that runs the card's full width. The card owns the shape and the edge;
     the rows own everything inside it.

     `role` is the flag stripe this area of the screen takes as its own
     (DIRECTION.md, "flag colour reaches the whole app, categorically"). It
     is set on the card rather than on every row so a card's rows cannot
     drift apart, and it inherits, which is the whole mechanism.

     No ARIA list role, which matches every list the app already ships: a
     run of links is announced as links, and role="list" here would put the
     burden of role="listitem" on whatever a screen renders inside. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    role,
    children
  }: {
    /** A role from $lib/theme/roles.ts. Omitted, the rows use the accent. */
    role?: Role;
    children: Snippet;
  } = $props();
</script>

<div class="kit-list" data-list-card {...roleAttrs(role)}>
  {@render children()}
</div>

<script lang="ts">
  /* The grid the reading tiles sit in (phase 11 ticket 07): two columns at
     390px, every row the height of its tallest tile, hairlines between -
     a list's rule (rule 4) read across two columns. The grid draws the
     lines and the tiles sit between them, so a tile absent for want of
     data leaves no gap and no orphaned rule: the next tile takes its place
     and the lines follow the count.

     The last odd tile stays half-width. Nine tiles is four rows and one on
     the fixture, and any tile can be the odd one on some span, so a rule
     that widened it would move a tile between two shapes as the span
     dragged (Alicja on the spike: no answer, so the page's own default).

     It carries the chart role (`roleAttrs`), which is what a tile's
     drawing takes its ink from - one stripe for every drawing on the door,
     the same index every chart on it has always shared. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    label,
    role,
    children,
    ...rest
  }: {
    /** What the group is, for anything that lists the page's landmarks. */
    label: string;
    role?: Role;
    children: Snippet;
    [attribute: string]: unknown;
  } = $props();
</script>

<nav class="kit-readings" data-kit-surface data-reading-grid aria-label={label} {...roleAttrs(role)} {...rest}>
  {@render children()}
</nav>

<style>
  .kit-readings {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }

  /* The right column starts past a hairline; the left keeps the screen's
     own inset as its edge. */
  .kit-readings > :global(:nth-child(2n)) {
    padding-left: var(--space-4);
    border-left: 1px solid var(--hairline);
  }

  .kit-readings > :global(:nth-child(2n + 1)) {
    padding-right: var(--space-4);
  }

  .kit-readings > :global(:nth-child(n + 3)) {
    border-top: 1px solid var(--hairline);
  }

  /* One column where two would leave a figure no room: the same threshold
     the tile pair stacks at. */
  @media (max-width: 300px) {
    .kit-readings {
      grid-template-columns: 1fr;
    }

    .kit-readings > :global(:nth-child(2n)) {
      padding-left: 0;
      border-left: 0;
    }

    .kit-readings > :global(:nth-child(2n + 1)) {
      padding-right: 0;
    }

    .kit-readings > :global(:nth-child(n + 2)) {
      border-top: 1px solid var(--hairline);
    }
  }
</style>

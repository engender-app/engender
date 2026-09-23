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
  import { settleCells } from './readingGrid';
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

<nav class="kit-readings" use:settleCells data-kit-surface data-reading-grid aria-label={label} {...roleAttrs(role)} {...rest}>
  {@render children()}
</nav>

<style>
  .kit-readings {
    /* The containing block a leaving tile is lifted into (readingGrid.ts). */
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr;
    border-top: 1px solid var(--hairline);
    border-bottom: 1px solid var(--hairline);
  }

  /* Keyed on the column each tile is written into (readingGrid.ts,
     `settleCells`) rather than on `:nth-child`: a tile fading out is still
     a child, and would shift every rule after it one place along. The
     right column starts past a hairline; the left keeps the screen's own
     inset as its edge. */
  .kit-readings > :global([data-col]:not([data-col='0'])) {
    padding-left: var(--space-4);
    border-left: 1px solid var(--hairline);
  }

  .kit-readings[data-cols='2'] > :global([data-col='0']) {
    padding-right: var(--space-4);
  }

  .kit-readings > :global([data-below]) {
    border-top: 1px solid var(--hairline);
  }

  /* One column where two would leave a figure no room: the same threshold
     the tile pair stacks at. The marks follow from the column count. */
  @media (max-width: 300px) {
    .kit-readings {
      grid-template-columns: 1fr;
    }
  }
</style>

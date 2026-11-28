<script lang="ts">
  /* The heading names the reading without interpreting its values.
     Keep the card to its marks and at most one control.
     Require the caller's heading level: h2 on the screen or h3
     under a section heading. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    heading,
    level,
    kind,
    role,
    control,
    children
  }: {
    /** What the chart shows. A noun phrase, from the catalogue. */
    heading: string;
    /** 2 where the card follows the screen's h1, 3 where it sits under a
        section's h2. */
    level: 2 | 3;
    /** For the walkthrough's handle: which chart this is. */
    kind?: string;
    role?: Role;
    /** One control, on the heading's line: which scale to plot, which
        period to show. */
    control?: Snippet;
    children: Snippet;
  } = $props();
</script>

<section class="kit-chart" data-kit-surface data-chart-card={kind} {...roleAttrs(role)}>
  <div class="kit-chart-head">
    <svelte:element this={`h${level}`}>{heading}</svelte:element>
    {#if control}{@render control()}{/if}
  </div>
  <div class="kit-chart-body">{@render children()}</div>
</section>

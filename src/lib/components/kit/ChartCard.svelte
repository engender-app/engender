<script lang="ts">
  /* The surface a chart sits on: a heading, at most one control, and the
     marks.

     The heading names what the chart shows and never what it means. "Day by
     day", not "Gender feeling moved from 50 to 80"; "Days at each mood", not
     "twelve good days and one awful one". PRODUCT.md says the app never
     interprets a value, and a headline is an interpretation - which is the
     one habit deliberately not taken from the charts this style is read off,
     where every chart is headed by a finding and a paragraph explaining it.

     So there is no prop here for that paragraph, and no slot under the marks
     for one. A screen that wants to say something about a reading has
     nowhere in this component to say it. */
  import type { Snippet } from 'svelte';
  import { roleAttrs } from './role';
  import type { Role } from '$lib/theme/roles';

  let {
    heading,
    kind,
    role,
    control,
    children
  }: {
    /** What the chart shows. A noun phrase, from the catalogue. */
    heading: string;
    /** For the walkthrough's handle (ADR-0029): which chart this is. */
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
    <h3>{heading}</h3>
    {#if control}{@render control()}{/if}
  </div>
  <div class="kit-chart-body">{@render children()}</div>
</section>

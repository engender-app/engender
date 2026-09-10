<script lang="ts">
  /* The "nothing logged in this range" text a chart card shows in place of
     its marks. `.kit-chart-empty` (kit.css) is sized to the chart body's own
     min-height so a card with no data holds the same height as one with
     some; a call site that hand-writes the class instead of using this
     component can drop it and get unstyled text with no card edge under it.

     A component rather than a ChartCard prop, because four of the seven
     call sites (stats/+page.svelte) put this text inside ReadGate's own
     `empty` snippet, one level below ChartCard - a prop on ChartCard has no
     way to reach there without ChartCard and ReadGate agreeing on load
     state through two separate reactive computations, which is a timing
     risk this ticket is not to take (ticket 16: no visual change). */
  import type { Snippet } from 'svelte';
  import { slideMonit } from '$lib/motion/reveal';

  let { children }: { children: Snippet } = $props();
</script>

<p class="kit-chart-empty" transition:slideMonit>{@render children()}</p>

<style>
  /* Nothing logged in this range. It sits in the space the marks would have
     taken rather than as a line where a chart's top edge would be, so a card
     with no data is the same height as a card with some and a screen of them
     does not concertina as the range changes. */
  .kit-chart-empty {
    display: grid;
    place-items: center;
    min-height: 88px;
    margin: 0;
    padding: var(--space-4) var(--space-2);
    color: var(--text-2);
    font-size: var(--text-sm);
    text-align: center;
    text-wrap: balance;
  }
</style>

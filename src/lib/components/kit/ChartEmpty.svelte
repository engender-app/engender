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

  let { children }: { children: Snippet } = $props();
</script>

<p class="kit-chart-empty">{@render children()}</p>

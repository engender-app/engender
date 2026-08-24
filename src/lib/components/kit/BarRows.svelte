<script lang="ts">
  /* Horizontal bars, each running the full width of the card with its label
     and its value on the line above it, rather than sitting in a right-hand
     column behind a label gutter. The bar is a length; the number beside it
     is the reading.

     Single hue (ADR-0012, and the same rule the chart style is read off):
     the longest bar is the section's stripe at full strength and every
     other bar is one diluted step of that same colour. One step, not a
     ramp - a per-bar gradient of intensity would rank them, and length
     already does that without colour having to.

     The leader is whichever bar is longest rather than whichever is first,
     so a caller that sorts alphabetically still colours the right one.

     Each bar carries its own index, which is what staggers the rise in
     kit.css. It is the row's position in the set rather than a delay in
     milliseconds: the pacing belongs to the stylesheet with every other
     duration in the app. */
  import { share } from '$lib/charts/geometry';

  export interface BarRow {
    key: string;
    name: string;
    /** Under the name: a count, a unit, a period. */
    note?: string;
    /** The reading, formatted by the caller. */
    value: string;
    /** What the bar's length is drawn from. */
    amount: number;
  }

  let { rows }: { rows: BarRow[] } = $props();

  let top = $derived(Math.max(0, ...rows.map((r) => r.amount)));
</script>

<div class="kit-bars" data-chart="bars">
  {#each rows as row, i (row.key)}
    <div class="kit-bar" data-bar-row={row.key} style={`--bar-index: ${i}`}>
      <div class="kit-bar-label">
        <span class="kit-bar-name">{row.name}</span>
        {#if row.note}<span class="kit-bar-value">{row.note}</span>{/if}
        <span class="kit-bar-value">{row.value}</span>
      </div>
      <div class="kit-bar-track">
        <span
          class="kit-bar-mark"
          class:is-leader={row.amount === top && top > 0}
          style={`--bar-share: ${share(row.amount, top)}`}
        ></span>
      </div>
    </div>
  {/each}
</div>

<script lang="ts">
  /* Each row uses its own metric's full range. Hollow marks days without
     the condition, filled marks days with it, and the thick segment shows
     their gap. Keep that mapping when the direction reverses. Colour
     assigns no rank (ADR-0012). */
  import type { Snippet } from 'svelte';
  import type { PairedRow } from './pairedRow';

  /* `figure` stands in for the row's gap text where the caller draws its own
     - /compare rolls the number between two periods. */
  let {
    rows,
    onPick,
    figure
  }: { rows: PairedRow[]; onPick?: (key: string) => void; figure?: Snippet<[PairedRow]> } = $props();

  /* Where a value sits along its own track, 0 to 1, clamped so a value
     outside the metric's stated range still lands on the track rather than
     off the end of it. */
  const at = (row: PairedRow, value: number) =>
    Math.min(1, Math.max(0, (value - row.min) / Math.max(row.max - row.min, 1)));
</script>

{#snippet body(row: PairedRow)}
  {@const without = row.without === null ? null : at(row, row.without)}
  {@const with_ = row.with === null ? null : at(row, row.with)}
  {@const from = Math.min(without ?? with_ ?? 0, with_ ?? without ?? 0)}
  {@const to = Math.max(without ?? with_ ?? 0, with_ ?? without ?? 0)}
  <div class="kit-paired-head">
    <span class="kit-paired-name" data-paired-name>{row.name}</span>
    <span class="kit-paired-gap" data-paired-gap>{#if figure}{@render figure(row)}{:else}{row.gap}{/if}</span>
  </div>
  <!-- Positions are fractions of the track, drawn as transforms and a clip
       rather than as insets, so a row whose values change carries its dots
       and its segment to the new places on the compositor. A side with no
       reading has no dot and no segment; the caller's note says why. -->
  <div class="kit-paired-track">
    <span class="kit-paired-span" class:is-none={without === null || with_ === null} style={`--from: ${from}; --to: ${to}`}></span>
    <span class="kit-paired-dot is-without" class:is-none={without === null} data-paired-dot="without" style={`--at: ${without ?? from}`}></span>
    <span class="kit-paired-dot is-with" class:is-none={with_ === null} data-paired-dot="with" style={`--at: ${with_ ?? from}`}></span>
  </div>
  {#if row.note}<span class="kit-paired-note" data-paired-note>{row.note}</span>{/if}
{/snippet}

<div class="kit-paired" data-chart="paired">
  {#each rows as row (row.key)}
    {#if onPick}
      <!-- Opts out of the default press the way BarRows' own open row does
           (kit.css, "press is opt-out"): this row fills the card's width
           rather than scaling to fit one, so the default press reads as the
           whole card flexing. -->
      <button
        type="button"
        class="kit-paired-row"
        data-paired-row={row.key}
        data-no-press
        onclick={() => onPick(row.key)}
      >
        {@render body(row)}
      </button>
    {:else}
      <div class="kit-paired-row" data-paired-row={row.key}>
        {@render body(row)}
      </div>
    {/if}
  {/each}
</div>

<style>
  /* A row is a drawing by default and a button where `onPick` makes it one -
     the same split BarRows takes. The button resets every default the
     element brings so it reads as the same row either way. */
  button.kit-paired-row {
    display: block;
    width: 100%;
    border: 0;
    background: none;
    padding: 0;
    font: inherit;
    text-align: left;
    color: inherit;
    cursor: pointer;
  }
</style>

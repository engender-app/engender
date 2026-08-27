<script lang="ts">
  /* A year of moods, a day at a time: three rows per month, a drawn face per
     day.

     It replaced twelve bars, one per month. Those said where the shape went;
     this says what the year was, and a month is still its own block so the
     shape is still legible.

     How big a face gets is decided by how many share a row, because a cell
     is square and the card\'s width is what it has. Eleven a row puts it at
     27px, which is inside the size ticket 31 tuned the faces to be read at;
     sixteen capped it at 17px however much room the month labels gave back,
     and 31 was 11px, which is enough area for a colour and not for a face -
     and a coloured square is the thing ADR-0025 warns about, since the ramp\'s
     steps are literal hexes chosen to be sat on and on the dark theme they
     are all dark (Alicja, 2026-08-25, twice).

     No legend. One was tried and taken out again: the faces are the picker's
     own, they are the same five a person chooses a mood from every day, and
     naming them under the grid was explaining the app to the reader
     (Alicja, 2026-08-25).

     A day that carried no mood is an empty outline. A day nobody logged is
     not a day at the bottom of the scale. */
  import type { MoodYear } from '$lib/charts/moodYear';
  import MoodFace from '../MoodFace.svelte';

  let {
    grid,
    monthName,
    dayLabel
  }: {
    grid: MoodYear;
    /** Month names come from the caller: dates are written against the
        active locale in $lib/data/dates, and a chart is not a second place
        that decides how this app writes one. */
    monthName: (month: number) => string;
    /** A cell\'s own name, for what a long press or a hover shows. */
    dayLabel: (epochDay: number, step: number | null) => string;
  } = $props();

  const CELL = 26;
</script>

<div class="kit-year" data-chart="mood-year">
  {#each grid.months as month, i (month)}
    <span class="kit-year-label" aria-hidden="true">{monthName(month)}</span>
    <!-- Fills in month by month rather than appearing whole (Alicja,
         2026-08-27: wrapped's year cadence "appears abruptly without
         animation" against week and month, both of which tween an
         AreaChart's points in - this grid has no such per-value motion of
         its own to borrow, so it wants an entrance of its own). Reuses
         .stagger-in/--stagger-step (components.css) rather than a new
         keyframe - the same primitive the skeleton cascade already uses
         for "several like things arriving as a set", which twelve months
         of one year are. -->
    <div class="kit-year-rows stagger-in" style="--stagger-i:{i}" data-year-month={month}>
      {#each grid.cells.filter((cell) => cell.month === month) as cell (cell.epochDay)}
        {#if cell.step === null}
          <span class="kit-year-cell is-empty" data-year-cell={cell.epochDay} title={dayLabel(cell.epochDay, null)}
          ></span>
        {:else}
          <span class="kit-year-cell" data-year-cell={cell.epochDay} title={dayLabel(cell.epochDay, cell.step)}>
            <MoodFace step={cell.step} size={CELL} />
          </span>
        {/if}
      {/each}
    </div>
  {/each}
</div>


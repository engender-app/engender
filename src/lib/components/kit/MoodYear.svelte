<script lang="ts">
  /* A year of moods, a day at a time: a row per month, a column per day of
     the month.

     It replaced twelve bars, one per month. Those said where the shape went;
     this says what the year was, which is what a yearly retrospective is
     for, and a month is still a row so the shape is still legible.

     Coloured on mood's own ramp (ADR-0025) - the one colour system in the app
     that is not the flag's, and the right one here for the same reason the
     distribution uses it: a mood is read against the same five steps the
     picker offers. A day that carried no mood is an outline rather than a
     colour, because a day nobody logged is not a day at the bottom of the
     scale.

     Every cell takes a hairline. The ramp's steps are literal hexes chosen
     so text clears 4.5:1 on top of them, which on the dark theme makes them
     all dark, and without an edge a run of them reads as one block rather
     than as a run of days. */
  import type { MoodYear } from '$lib/charts/moodYear';

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
</script>

<div class="kit-year" data-chart="mood-year" style={`--columns: ${grid.columns}`}>
  {#each grid.months as month (month)}
    <span class="kit-year-label" aria-hidden="true">{monthName(month)}</span>
    <div class="kit-year-row">
      {#each grid.cells.filter((cell) => cell.month === month) as cell (cell.epochDay)}
        <span
          class="kit-year-cell"
          class:is-empty={cell.step === null}
          data-year-cell={cell.epochDay}
          style={`--cell-fill: var(--mood-${cell.step ?? 3})`}
          title={dayLabel(cell.epochDay, cell.step)}
        ></span>
      {/each}
    </div>
  {/each}
</div>

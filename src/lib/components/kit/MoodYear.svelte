<script lang="ts">
  /* A year of moods, a day at a time: two rows per month, a drawn face per
     day.

     It replaced twelve bars, one per month. Those said where the shape went;
     this says what the year was, and a month is still its own block so the
     shape is still legible.

     Three sizes in, and the reason each one moved. Fifty-three week columns
     overflowed a 390px card at 5px a cell. Twelve rows of 31 fitted at 11px,
     which is enough area for a colour and not enough for a face - and a
     coloured square is the thing ADR-0025 warns about, since the ramp\'s
     steps are literal hexes chosen to be sat on and on the dark theme they
     are all dark. Two rows a month halves the columns to sixteen, which puts
     the cell near 17px: enough for the face the picker draws, so a day is
     read from its expression and not from a shade of teal (Alicja,
     2026-08-25).

     The legend is here for the same reason. Five faces with their names, once,
     under the grid - the chart rules refuse a legend that says which line is
     which, and this is not that: it is the scale itself, which the mood ramp
     has and no axis on this chart shows.

     A day that carried no mood is an empty outline. A day nobody logged is
     not a day at the bottom of the scale. */
  import type { MoodYear } from '$lib/charts/moodYear';
  import MoodFace from '../MoodFace.svelte';

  let {
    grid,
    monthName,
    dayLabel,
    steps
  }: {
    grid: MoodYear;
    /** Month names come from the caller: dates are written against the
        active locale in $lib/data/dates, and a chart is not a second place
        that decides how this app writes one. */
    monthName: (month: number) => string;
    /** A cell\'s own name, for what a long press or a hover shows. */
    dayLabel: (epochDay: number, step: number | null) => string;
    /** The five steps and their names, for the legend. The wording is the
        vocabulary\'s, so this component ships none. */
    steps: { step: number; name: string }[];
  } = $props();

  const CELL = 17;
</script>

<div class="kit-year" data-chart="mood-year">
  {#each grid.months as month (month)}
    <span class="kit-year-label" aria-hidden="true">{monthName(month)}</span>
    <div class="kit-year-rows">
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

<div class="kit-year-key" data-chart-key>
  {#each steps as step (step.step)}
    <span class="kit-year-key-item">
      <MoodFace step={step.step} size={18} />
      <span>{step.name}</span>
    </span>
  {/each}
</div>

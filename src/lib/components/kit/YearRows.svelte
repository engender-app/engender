<script lang="ts">
  /* A year of days as twelve shaded rows, one per month, a cell per day
     (phase 11 ticket 07).

     It was MoodYear: a drawn face per day, 365 svgs on one screen and about
     1900px of them, with the year's own figures pushed under it all (the
     whole-app audit's finding 7). A face said which of five moods a day
     was; a shaded cell says where the day sat on whichever scale the
     person has active, on that scale's single-hue ramp, and a row of them
     says at a glance where the gaps and the dark stretches were. Twelve
     rows of up to 31 cells is one screen-width, so a silent spring reads
     as a pale row and a month is still its own block.

     The ramp is the caller's (`fillAt`): mood's own hexes or the role's
     heat steps, resolved where the caller resolves them, so a chart is not
     a second place that decides how this app colours a value. A day that
     carried nothing is step 0 - the empty end of the ramp, which is what a
     day nobody logged has always been on the calendar. It is not a day at
     the bottom of the scale. */
  import type { YearRows } from '$lib/charts/yearRows';

  let {
    grid,
    monthName,
    dayLabel,
    fillAt
  }: {
    grid: YearRows;
    /** Month names come from the caller: dates are written against the
        active locale in $lib/data/dates. */
    monthName: (month: number) => string;
    /** A cell's own name, for what a long press or a hover shows. */
    dayLabel: (epochDay: number, value: number | null) => string;
    /** What a step is painted in, 0 for an empty day. */
    fillAt: (step: number) => string;
  } = $props();
</script>

<div class="kit-year" data-chart="year-rows" style={`--year-columns: ${grid.columns}`}>
  {#each grid.months as month, i (month)}
    <span class="kit-year-label" aria-hidden="true">{monthName(month)}</span>
    <!-- Fills in month by month rather than appearing whole: the grid has
         no per-value motion of its own to borrow, so it takes the skeleton
         cascade's own primitive for "several like things arriving as a
         set" (.stagger-in, components.css). -->
    <div class="kit-year-rows stagger-in" style="--stagger-i:{i}" data-year-month={month}>
      {#each grid.cells.filter((cell) => cell.month === month) as cell (cell.epochDay)}
        <span
          class="kit-year-cell"
          class:is-empty={cell.step === 0}
          data-year-cell={cell.epochDay}
          data-year-step={cell.step}
          title={dayLabel(cell.epochDay, cell.value)}
          style={`background: ${fillAt(cell.step)}`}
        ></span>
      {/each}
    </div>
  {/each}
</div>

<script lang="ts">
  /* Each month is a column, with one cell per day. fillAt supplies the
     caller's ramp; step 0 means no reading. kit.css wraps the months into
     bands of six or four at narrower widths.

     Hide this shade-only grid from assistive tech. The caller renders
     YearDaysList alongside it for access to each date and value. */
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
    /** A cell's own name, for what a hover shows. */
    dayLabel: (epochDay: number, value: number | null) => string;
    /** What a step is painted in, 0 for an empty day. */
    fillAt: (step: number) => string;
  } = $props();
</script>

<div class="kit-year" data-chart="year-rows" aria-hidden="true">
  <div data-year-months>
    {#each grid.months as month, i (month)}
      <div data-year-month={month}>
        <span class="kit-year-label">{monthName(month)}</span>
        <!-- Fills in month by month rather than appearing whole: the grid has
             no per-value motion of its own to borrow, so it takes the skeleton
             cascade's own primitive for "several like things arriving as a
             set" (.stagger-in, components.css). -->
        <div class="kit-year-rows stagger-in" style="--stagger-i:{i}">
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
      </div>
    {/each}
  </div>
</div>

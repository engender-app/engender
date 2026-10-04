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
     the bottom of the scale.

     The same days as a list (phase 14 pre-release ticket 30, accessibility
     audit A06). The cells are a picture: a day's date and value lived only
     in a `title`, which a screen reader does not reach and a finger or a
     keyboard cannot raise, and the ramp's steps are told apart by shade
     alone (WCAG 1.4.1). So the picture leaves the accessibility tree and a
     fold under it holds the year a month at a time, every day written out
     with its value or with "Nothing logged" - the words are the non-colour
     cue, and the empty days keep the hairline they already had in the
     picture. A month at a time rather than all 365 rows: two buttons step
     it, so the card is three tab stops rather than 365, and the fold stays
     one screen tall instead of opening half the document.

     The list holds 31 rows' worth whatever the month, laid down in columns,
     so February under January keeps its place and only the words crossfade
     (the spec's no-yank clause - the surface stays one object). Where a
     row's words wrap - large text, a long value - the months can still
     differ in height, and the slot travels between the two rather than
     snapping (`resize`). */
  import { m } from '$lib/paraglide/messages';
  import type { YearRows } from '$lib/charts/yearRows';
  import { disclose, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import Icon from '../Icon.svelte';

  let {
    grid,
    monthName,
    monthTitle,
    dayLabel,
    dayName,
    valueName,
    fillAt
  }: {
    grid: YearRows;
    /** Month names come from the caller: dates are written against the
        active locale in $lib/data/dates. Short, for the rows. */
    monthName: (month: number) => string;
    /** The month written out, for the list's own heading. */
    monthTitle: (month: number) => string;
    /** A cell's own name, for what a hover shows. */
    dayLabel: (epochDay: number, value: number | null) => string;
    /** A day in the list, under its month's heading: weekday and date. */
    dayName: (epochDay: number) => string;
    /** A logged day's value, in the scale's own units. */
    valueName: (value: number) => string;
    /** What a step is painted in, 0 for an empty day. */
    fillAt: (step: number) => string;
  } = $props();

  const id = $props.id();
  let open = $state(false);
  let shown = $state(0);
  let days = $derived(grid.cells.filter((cell) => cell.month === shown));

  function step(delta: number) {
    const next = shown + delta;
    if (next >= 0 && next <= 11) shown = next;
  }

  /* The words change and the surface does not, so the swap is opacity
     alone, both months over the same slot at once. Reduced motion keeps
     the fade at its crossfade length, which is about opacity and moves
     nothing (tokens.ts). */
  const swap = (_node: Element) => fadeOnly(isReducedMotion() ? crossfadeDuration() : motionDuration('--dur-fast'));
</script>

<div class="year-rows" data-chart="year-rows">
  <div class="kit-year" data-year-grid aria-hidden="true" style={`--year-columns: ${grid.columns}`}>
    {#each grid.months as month, i (month)}
      <span class="kit-year-label">{monthName(month)}</span>
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

  <!-- The fold SpanFacts.svelte gives the Look back rail: the same row of
       secondary ink with its chevron at the far edge, so the app's
       "this picture, as a list" disclosures read as one control. -->
  <button
    type="button"
    class="year-days-toggle"
    aria-expanded={open}
    aria-controls={`${id}-days`}
    data-year-days-toggle
    onclick={() => (open = !open)}
  >
    <span>{m.wrapped_year_days_disclosure()}</span>
    <span class="year-days-chev"><Icon name="chevronDown" size={18} /></span>
  </button>

  {#if open}
    <div class="disclosed" id={`${id}-days`} data-year-days transition:disclose>
      <div class="year-days-head">
        <!-- aria-disabled rather than disabled at the ends of the year: a
             disabled button drops the focus that just pressed it. -->
        <button
          type="button"
          class="icon-btn press"
          aria-label={m.prev_month()}
          aria-disabled={shown === 0}
          data-year-days-step="prev"
          onclick={() => step(-1)}
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <!-- The calendar's month line, for the same reason: the region
             stands still and only its contents change, so a step is
             announced once, as the month it landed on. -->
        <h4 class="year-days-month" id={`${id}-month`} data-year-days-month aria-live="polite">
          <span class="year-days-slot">
            {#key shown}
              <span in:swap out:swap>{monthTitle(shown)}</span>
            {/key}
          </span>
        </h4>
        <button
          type="button"
          class="icon-btn press"
          aria-label={m.next_month()}
          aria-disabled={shown === 11}
          data-year-days-step="next"
          onclick={() => step(1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>
      <div class="year-days-slot" use:resize>
        {#key shown}
          <ol class="year-days-list" aria-labelledby={`${id}-month`} data-year-days-list in:swap out:swap>
            {#each days as cell (cell.epochDay)}
              <li class="year-day" class:is-empty={cell.value === null} data-year-day={cell.epochDay}>
                <span class="year-day-swatch" style={`background: ${fillAt(cell.step)}`} aria-hidden="true"></span>
                <span class="year-day-name">{dayName(cell.epochDay)}</span>
                <span class="year-day-value">
                  {cell.value === null ? m.adherence_nothing_logged() : valueName(cell.value)}
                </span>
              </li>
            {/each}
          </ol>
        {/key}
      </div>
    </div>
  {/if}
</div>

<style>
  .year-rows {
    container-type: inline-size;
  }

  .year-days-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--touch-target);
    margin-top: var(--space-2);
    padding: var(--space-2) 0;
    border: 0;
    background: none;
    color: var(--text-2);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    cursor: pointer;
  }
  .year-days-chev {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    transition: transform var(--dur-med) var(--ease-out);
  }
  .year-days-toggle[aria-expanded='true'] .year-days-chev {
    transform: rotate(180deg);
  }

  .year-days-head {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
  }
  .year-days-month {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-align: center;
  }
  .year-days-head [aria-disabled='true'] {
    color: var(--text-2);
    cursor: default;
  }

  /* Both months in one cell of one grid for the length of the crossfade,
     so the leaving one never holds a place in the flow. */
  .year-days-slot {
    display: grid;
  }
  .year-days-slot > :global(*) {
    grid-area: 1 / 1;
  }

  /* 31 rows' worth whatever the month, so a step does not change the
     slot's height by itself: one column of 31 where the card is narrow (200% text, a
     195px screen), two of 16 where it is not, filled down the first column
     and then the second so the reading order is the date order. */
  .year-days-list {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(31, minmax(var(--year-day-row), auto));
    column-gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    --year-day-row: 2rem;
  }
  @container (min-width: 18rem) {
    .year-days-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      grid-template-rows: repeat(16, minmax(var(--year-day-row), auto));
    }
  }

  .year-day {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    font-size: var(--text-sm);
  }
  /* The cell the day is in the picture, so the list and the rows read as
     one drawing. */
  .year-day-swatch {
    flex: 0 0 auto;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 2px;
  }
  .year-day.is-empty .year-day-swatch {
    outline: 1px solid var(--hairline);
    outline-offset: -1px;
  }
  .year-day-name {
    color: var(--text-2);
    white-space: nowrap;
  }
  .year-day-value {
    margin-inline-start: auto;
    font-variant-numeric: tabular-nums;
    font-weight: var(--weight-bold);
    text-align: end;
  }
  .year-day.is-empty .year-day-value {
    color: var(--text-2);
    font-weight: inherit;
  }
</style>

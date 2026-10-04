<script lang="ts" module>
  export interface YearDaysFormat {
    /** The month written out, for the list's own heading. */
    monthTitle: (month: number) => string;
    /** A day under its month's heading: weekday and date. */
    dayName: (epochDay: number) => string;
    /** A logged day's value, in the scale's own units. */
    valueName: (value: number) => string;
  }
</script>

<script lang="ts">
  /* The year's days as words (phase 14 pre-release ticket 30, accessibility
     audit A06), drawn under YearRows.svelte's grid.

     The grid is a picture: its cells carry no names a screen reader reaches,
     a finger or a keyboard cannot raise a `title`, and the ramp's steps are
     told apart by shade alone (WCAG 1.4.1). This is the same days written
     out, in a fold so the card stays the chart until somebody asks: a month
     at a time, every day with its weekday and date and either its value or
     "Not logged". The written value is the non-colour way to read the ramp,
     and the swatch beside it ties each row back to its cell.

     A month at a time rather than all 365 rows: two buttons step it, so the
     open card is three tab stops, and the fold stays about a screen tall
     instead of opening half the document.

     The calendar steps its month with the same pair of icon buttons, but
     inline in its route rather than as a component, so this draws its own
     pair the same way rather than reusing one. */
  import { m } from '$lib/paraglide/messages';
  import type { YearRows } from '$lib/charts/yearRows';
  import { disclose, resize } from '$lib/motion/reveal';
  import { crossfadeDuration, fadeOnly, isReducedMotion, motionDuration } from '$lib/motion/tokens';
  import Icon from '../Icon.svelte';

  let {
    grid,
    format,
    fillAt
  }: {
    grid: YearRows;
    format: YearDaysFormat;
    /** The grid's own fill for a step, for the row's swatch. */
    fillAt: (step: number) => string;
  } = $props();

  const id = $props.id();
  let open = $state(false);
  let shown = $state(0);
  let days = $derived(grid.cells.filter((cell) => cell.month === shown));
  let title = $derived(format.monthTitle(shown));

  function stepMonth(delta: number) {
    const next = shown + delta;
    if (next >= 0 && next <= 11) shown = next;
  }

  /* The words change and the surface does not, so a month change is
     opacity alone, both months over the same slot at once. Reduced motion
     keeps the fade at its crossfade length, which moves nothing
     (tokens.ts). */
  const fadeWords = (_node: Element) =>
    fadeOnly(isReducedMotion() ? crossfadeDuration() : motionDuration('--dur-fast'));
</script>

<div class="year-days" data-year-days-fold>
  <button
    type="button"
    class="disclosure-toggle"
    aria-expanded={open}
    aria-controls={`${id}-days`}
    data-year-days-toggle
    onclick={() => (open = !open)}
  >
    <span>{m.wrapped_year_days_disclosure()}</span>
    <span class="disclosure-chev"><Icon name="chevronDown" size={18} /></span>
  </button>

  {#if open}
    <div class="disclosed" id={`${id}-days`} data-year-days transition:disclose>
      <div class="year-days-head">
        <!-- aria-disabled rather than disabled at the ends of the year: a
             disabled button drops the focus that just pressed it. -->
        <button
          type="button"
          class="icon-btn press year-days-step"
          aria-label={m.prev_month()}
          aria-disabled={shown === 0}
          data-year-days-step="prev"
          onclick={() => stepMonth(-1)}
        >
          <Icon name="chevronLeft" size={22} />
        </button>
        <!-- One node says the month to the accessibility tree, and it never
             leaves: a step replaces its text, so a polite live region
             announces the new month once. The crossfade is a picture of the
             same words, out of the tree, so the two months it holds for a
             moment are never both read. -->
        <h4 class="year-days-month" id={`${id}-month`}>
          <span class="visually-hidden" aria-live="polite" data-year-days-month>{title}</span>
          <span class="year-days-slot" aria-hidden="true">
            {#key shown}
              <span class="year-days-words" in:fadeWords out:fadeWords>{title}</span>
            {/key}
          </span>
        </h4>
        <button
          type="button"
          class="icon-btn press year-days-step"
          aria-label={m.next_month()}
          aria-disabled={shown === 11}
          data-year-days-step="next"
          onclick={() => stepMonth(1)}
        >
          <Icon name="chevronRight" size={22} />
        </button>
      </div>
      <div class="year-days-slot" use:resize>
        {#key shown}
          <ol
            class="year-days-list year-days-words"
            aria-labelledby={`${id}-month`}
            data-year-days-list
            in:fadeWords
            out:fadeWords
          >
            {#each days as cell (cell.epochDay)}
              <li class="year-day" class:is-empty={cell.value === null} data-year-day={cell.epochDay}>
                <span class="year-day-swatch" style={`background: ${fillAt(cell.step)}`} aria-hidden="true"></span>
                <span class="year-day-name">{format.dayName(cell.epochDay)}</span>
                <span class="year-day-value">
                  {cell.value === null ? m.wrapped_year_day_none() : format.valueName(cell.value)}
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
  .year-days {
    container-type: inline-size;
    margin-top: var(--space-2);
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

  /* The end of the year dims the way a disabled icon button does
     (components.css, .icon-btn:disabled), and travels there on the kit's
     own opacity transition (ticket 18 added it to .icon-btn). */
  .year-days-step[aria-disabled='true'] {
    opacity: 0.45;
    cursor: default;
  }
  .year-days-step[aria-disabled='true']:hover {
    background: none;
  }
  .year-days-step[aria-disabled='true']:active {
    transform: none;
  }

  /* Both months in one cell of one grid for the length of the crossfade,
     so the leaving one never holds a place in the flow. */
  .year-days-slot {
    display: grid;
  }
  .year-days-slot > :global(*) {
    grid-area: 1 / 1;
  }
  /* Kept on their own compositing layer at rest as well as while fading:
     dropping the layer when a fade ends re-rasters the text with a
     different antialiasing, which a frame-by-frame capture reads as every
     glyph changing in the frame after the fade is over. */
  .year-days-words {
    will-change: opacity;
  }

  /* 31 rows' worth whatever the month, so a step does not change the
     slot's height by itself: one column of 31 where the card is narrow
     (200% text, a 195px screen), two of 16 where it is not, filled down
     the first column and then the second so the reading order is the date
     order. Where a row's words wrap the months can still differ, and the
     slot travels between the two (`resize`). */
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
  .year-day-swatch {
    flex: 0 0 auto;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 2px;
  }
  /* One column is the narrow card - 200% text, a 195px screen - and there
     the swatch's 18px is what a Polish row needs to stay on one line. The
     grid above is the picture; the words carry the row on their own. */
  @container (max-width: calc(18rem - 0.02px)) {
    .year-day-swatch {
      display: none;
    }
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
  /* A step down, the size the grid's month labels take: the words for a
     day with nothing on it are the quiet half of the row, and at the
     regular size Polish "Nie zapisano" beside "niedz., 12" wraps a row
     at 390px and at 195px. */
  .year-day.is-empty .year-day-value {
    color: var(--text-2);
    font-weight: inherit;
    font-size: var(--text-xs);
  }
</style>

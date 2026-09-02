<script lang="ts">
  /* The month, as a grid of shaded days, plus the legend that says what the
     shading is (phase 5 ticket 22).

     **The hue is the flag's, not the accent's.** Ticket 20's review moved
     Home's week strip off the accent and onto the active flag's stripe, and
     said why in one line: "so a cell here and a calendar cell are the same
     scale in the flag's hue". A week cell and a calendar cell are the same
     reading of the same day, and two hues for one reading is the drift this
     phase is undoing. Both now shade on the same five steps
     ($lib/theme/roles.ts, HEAT_STEPS) and differ only in size.

     **The cell carries no writing, which is new.** It used to hold the
     date, and a ramp from the page's own surface up to a saturated stripe
     crosses the band where neither --text nor its opposite clears 4.5:1, so
     the ink had to be computed per step (roles.ts, held to the floor by
     tests/kit-roles.test.ts). Since ticket 11 a cell can carry two fills at
     once and the date sits under it instead - see below - so this file
     reads the ramp's fills and never its inks. The inks are still the week
     strip's and the legend's business, and roles.ts still computes them.

     Under disguise there is no flag to shade with (activeFlag.svelte.ts
     publishes none), so the fills fall back to the accent ramp's own tokens
     - which is exactly what this screen looked like before roles existed.

     **A day that covered ground is drawn as two, not averaged into one**
     (phase 6 unprompted ticket 11). Averaging is the app quietly
     overwriting a day that held a hard morning and a good evening, and the
     day that most needed to be legible is the one it flattened. So a day of
     two readings on different steps is split down the middle, a half per
     reading, and a day whose readings landed on one step stacks instead -
     there is no edge to draw between two halves of one colour. Three
     readings and up always stack: four bands at this size is a texture
     rather than four readings. The rule is ../data/statsCharts.ts's, and
     it has a test; this file only draws it.

     The form is Daylio's, which Alicja asked for by name on 2026-09-02
     against a screenshot of its month. Its calendar is the reason the date
     moved out from under the fill: a split cell has two fills under one
     number, and the computed per-step ink that keeps a date legible
     (roles.ts) can only answer to one of them. Two steps far enough apart
     leave no ink that clears 4.5:1 on both, so the number sits below the
     swatch on the page's own ground and the swatch carries no text at all.
     That is also what lets a stack peek out to the left without anything
     being written over.

     The legend lives here rather than on the screen because it names the
     same five steps: two things reading one ramp is how a legend ends up
     describing a chart it no longer matches. The mark is explained by the
     screen's hint instead, next to the sentence about the average, because
     the two are one claim about the same cell. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { heatLevel } from '$lib/data/metricRange';
  import { dayShape, type DayShape } from '$lib/data/statsCharts';
  import { spreadNote } from '$lib/data/wrappedDisplay';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { HEAT_STEPS, type Role } from '$lib/theme/roles';

  let {
    year,
    month,
    role
  }: {
    year: number;
    month: number /* 0-based */;
    /** The flag stripe the shading is drawn in. Omitted - under disguise,
        or before the flag has landed - the accent ramp's own tokens stand
        in. */
    role?: Role;
  } = $props();

  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** 1 to 4; level 0 is "nothing logged" and has its own end of the legend. */
  const SHADED = [...HEAT_STEPS.keys()].slice(1);

  let metricName = $derived(vocabulary.metricName);
  let legend = $derived(vocabulary.metricLegend);

  /* One lookup for a cell and for its legend swatch, so the two cannot
     disagree. `var(--heat-N)` rather than a colour because the fallback is
     the stylesheet's, hand-tuned per palette; the role's ramp is computed. */
  const fillAt = (level: number) => role?.heat[level].fill ?? `var(--heat-${level})`;

  /* The month, as two epoch days. Both queries below read them before their
     first await, so stepping to another month re-runs them. */
  let bounds = $derived({
    first: epochDayFromLocalDate(new Date(year, month, 1)),
    last: epochDayFromLocalDate(new Date(year, month + 1, 0))
  });

  /* Three queries for the whole month rather than three per day. They ask
     different questions: the swatch comes from the metric's average, the
     mark under it from that day's two ends, while whether a day is a link
     comes from whether anything was logged at all - a day of entries
     carrying no mood is still a day with entries. */
  let averages = liveList((j) => j.stats.dayAverages(vocabulary.activeMetric, bounds.first, bounds.last));
  let counts = liveList((j) => j.stats.entryCountsByDay(bounds.first, bounds.last));
  let spreads = liveList((j) => j.stats.daySpread(vocabulary.activeMetric, bounds.first, bounds.last));

  /* The three reads are one worker round trip, and the grid draws at its full
     size the whole time - a month is 30 cells of known shape, so there is
     nothing for a skeleton to stand in for and nothing to reflow. What does
     have to wait is the claim each cell makes: an empty `counts` result and a
     month with nothing logged look identical, so before the answer arrives
     every cell would tell a screen reader "no entries" for a day that has
     six. While it is loading a cell says the date and stops there. */
  let loading = $derived(averages.loading || counts.loading || spreads.loading);

  let cells = $derived.by(() => {
    // The day's value stays native; only the swatch it picks is normalized,
    // so a 0-10 dimension and mood shade comparably (ADR-0012).
    const range = vocabulary.rangeOf(vocabulary.activeMetric);
    const valueByDay = new Map(averages.rows.map((point) => [point.day, point.value]));
    const countByDay = new Map(counts.rows.map((point) => [point.day, point.count]));
    const spreadByDay = new Map(spreads.rows.map((point) => [point.day, point]));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
    const today = todayEpochDay();
    const out: {
      day: number;
      epochDay: number;
      level: number;
      count: number;
      /** Split, stacked or whole (../data/statsCharts.ts), or null for a
          day the metric was never logged on. Null while the read is in
          flight too: an unloaded month and a month of single-entry days
          look identical, and drawing every cell whole is a claim as much as
          splitting one is. */
      shape: DayShape | null;
      isToday: boolean;
      label: string;
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const epochDay = bounds.first + d - 1;
      const count = countByDay.get(epochDay) ?? 0;
      const spread = spreadByDay.get(epochDay);
      const date = fmtDay(epochDay, { day: 'numeric', month: 'long' });
      const shape = loading ? null : dayShape(spread, range);
      /* The same words the values sheet on /stats writes for the same day,
         in native units (ADR-0012). Only the drawing is normalized, and
         nothing normalized is ever read out.

         Read off the values rather than off `shape`, which is why the two
         can disagree: two readings two points apart share a step, so the
         cell stacks rather than splits and the words still say "from 50 to
         52". The cell is what a month can carry; the words are what the day
         actually was. */
      const ends = loading ? null : spreadNote(vocabulary.activeMetric, spread);
      out.push({
        day: d,
        epochDay,
        level: heatLevel(valueByDay.get(epochDay) ?? null, range),
        count,
        shape,
        isToday: epochDay === today,
        label: loading
          ? date
          : count
            ? `${m.heat_cell_entries({ date, count })}${ends ? `, ${ends}` : ''}`
            : m.heat_cell_none({ date }),
      });
    }
    return { startDow, days: out };
  });
</script>

<div class="cal-grid" role="grid" data-cal-grid aria-busy={loading}>
  {#each DOWS as d, i (i)}<span class="cal-dow" aria-hidden="true">{d}</span>{/each}
  {#each Array.from({ length: cells.startDow }) as _, i (i)}<span class="cal-day is-blank"></span>{/each}
  {#each cells.days as c (c.epochDay)}
    {#if c.count}
      <a
        class="cal-day has-entries press"
        class:is-today={c.isToday}
        data-hm-cell-filled
        href="/day/{c.epochDay}"
        aria-label={c.label}
      >
        {@render swatch(c)}
        <span class="cal-num">{c.day}</span>
      </a>
    {:else}
      <span class="cal-day" class:is-today={c.isToday} aria-label={c.label}>
        {@render swatch(c)}
        <span class="cal-num">{c.day}</span>
      </span>
    {/if}
  {/each}
</div>

<!-- The deck is drawn behind the swatch and peeks out to its left, which is
     the whole of what a stack says: how many readings, never how far apart
     they were. That question is answered by the split, and by the words the
     cell reads out. -->
{#snippet swatch(c: (typeof cells.days)[number])}
  <span class="cal-stack">
    {#if c.shape?.kind === 'stack'}
      {#each Array.from({ length: c.shape.cards - 1 }) as _, i (i)}
        <span
          class="cal-card"
          data-hm-cell-stack
          style="background:{fillAt(c.level)};--card:{i + 1}"
        ></span>
      {/each}
    {/if}
    <span class="cal-swatch" style="background:{fillAt(c.level)}">
      {#if c.shape?.kind === 'split'}
        <span class="cal-half" data-hm-cell-split style="background:{fillAt(c.shape.low)}"></span>
        <span class="cal-half is-high" style="background:{fillAt(c.shape.high)}"></span>
      {/if}
    </span>
  </span>
{/snippet}

<!-- The ends are the metric's own words, never "worst" and "best": neither
     end of binary <-> nonbinary is the better one, and colour that judges is
     the one thing this app cannot do (ADR-0012, F15). -->
<div
  class="cal-legend"
  data-cal-legend
  aria-label={m.heat_legend_aria({ metric: metricName, low: legend.low, high: legend.high })}
>
  <span class="cal-legend-scale">
    <span class="cal-legend-end">{legend.low}</span>
    {#each SHADED as level (level)}
      <span class="cal-legend-swatch" style="background:{fillAt(level)}"></span>
    {/each}
    <span class="cal-legend-end">{legend.high}</span>
  </span>
  <span class="cal-legend-none">
    <span class="cal-legend-swatch" style="background:{fillAt(0)}"></span>
    {m.legend_none()}
  </span>
</div>

<style>
  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 6px 8px;
    /* The gutter a deck is dealt into, held on the grid so the swatch, the
       cards and the day's padding cannot drift apart. */
    --deck: 9px;
  }
  .cal-dow {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-2);
    font-weight: var(--weight-bold);
  }
  .cal-day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-decoration: none;
    color: inherit;
    /* Inside the box rather than outside it, so the deck has somewhere to
       go without the tap target losing the width it had. */
    padding-left: var(--deck);
  }
  .cal-day.is-blank { visibility: hidden; }

  /* Every day is dealt the same gutter whether or not it has a deck, so a
     stacked day does not sit a few pixels off the grid its neighbours
     keep. */
  .cal-stack {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
  }
  .cal-card,
  .cal-swatch {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-xs);
    /* The empty cells carry the same edge the shaded ones get from their
       fill, so a month reads as a grid rather than as scattered colour - and
       so a day with nothing logged is still a day. It is what separates one
       card of a deck from the next, too. */
    border: 1px solid var(--outline);
  }
  .cal-card { left: calc(var(--card) * -3px); }
  .cal-swatch { background: var(--heat-0); overflow: hidden; }
  .cal-half {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 50%;
  }
  .cal-half.is-high { left: 50%; }
  /* Today, marked by an outline rather than by a fill, because the fill is
     already saying something else. Above the deck, so a stacked today is
     still ringed once. */
  .cal-day.is-today .cal-swatch { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* The date sits under the swatch rather than on it: a split cell has two
     fills and one number, and no ink clears the floor on both (see the note
     at the top of this file). On the page's own ground it always does. */
  .cal-num {
    font-size: var(--text-xs);
    line-height: 1.2;
    color: var(--text-2);
    font-weight: var(--weight-medium);
  }
  .cal-day.has-entries .cal-num { color: var(--text); }

  .cal-legend {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--text-2);
    margin-top: var(--space-4);
  }
  .cal-legend-scale { display: inline-flex; align-items: center; gap: 6px; }
  .cal-legend-none { display: inline-flex; align-items: center; gap: 5px; }
  .cal-legend-swatch {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    display: inline-block;
    border: 1px solid var(--outline);
  }
  .cal-legend-end { max-width: 9ch; }
</style>

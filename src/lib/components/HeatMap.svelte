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

     **The day number is why this needs more than the strip did.** A week
     cell has nothing written on it, so its fill answers to nothing. A
     calendar cell carries the date, and a ramp from the page's own surface
     up to a saturated stripe crosses the band where neither --text nor its
     opposite clears 4.5:1. palettes.css solved that for the accent ramp by
     hand, one --on-heat-N per palette and sometimes per theme; a role-hued
     ramp is that table times however many stripes each flag has, so the ink
     is computed per step instead and held to the floor by
     tests/kit-roles.test.ts.

     Under disguise there is no flag to shade with (activeFlag.svelte.ts
     publishes none), so the fills fall back to the accent ramp's own tokens
     - which is exactly what this screen looked like before roles existed,
     and is where those hand-tuned on-colours still earn their keep.

     The legend lives here rather than on the screen because it names the
     same five steps: two things reading one ramp is how a legend ends up
     describing a chart it no longer matches. */
  import { m } from '$lib/paraglide/messages';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { eraCoversDay } from '$lib/data/eras';
  import type { Era } from '$lib/data/types';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { heatLevel } from '$lib/data/metricRange';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { HEAT_STEPS, type Role } from '$lib/theme/roles';

  let {
    year,
    month,
    role,
    eras = []
  }: {
    year: number;
    month: number /* 0-based */;
    /** The flag stripe the shading is drawn in. Omitted - under disguise,
        or before the flag has landed - the accent ramp's own tokens stand
        in. */
    role?: Role;
    /** Which era each day belongs to (phase 6 ticket 03), each already
        carrying the role it draws in. Resolved by the caller, the same
        division of labour `role` above keeps: an era stores no colour of
        its own (ADR-0049), and under disguise there is no flag to draw one
        from - the caller hands over nothing rather than this component
        reaching for `activeFlag` itself. */
    eras?: { era: Era; role: Role }[];
  } = $props();

  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  /** 1 to 4; level 0 is "nothing logged" and has its own end of the legend. */
  const SHADED = [...HEAT_STEPS.keys()].slice(1);

  let metricName = $derived(vocabulary.metricName);
  let legend = $derived(vocabulary.metricLegend);

  /* One lookup for both, so a cell and its legend swatch cannot disagree.
     `var(--heat-N)` rather than a colour because the fallback is the
     stylesheet's, hand-tuned per palette; the role's ramp is computed. */
  const fillAt = (level: number) => role?.heat[level].fill ?? `var(--heat-${level})`;
  const inkAt = (level: number) => role?.heat[level].ink ?? `var(--on-heat-${level})`;

  /* The month, as two epoch days. Both queries below read them before their
     first await, so stepping to another month re-runs them. */
  let bounds = $derived({
    first: epochDayFromLocalDate(new Date(year, month, 1)),
    last: epochDayFromLocalDate(new Date(year, month + 1, 0))
  });

  /* Two queries for the whole month rather than two per day. They ask
     different questions: the swatch comes from the metric's average, while
     whether a day is a link comes from whether anything was logged at all -
     a day of entries carrying no mood is still a day with entries. */
  let averages = liveList((j) => j.stats.dayAverages(vocabulary.activeMetric, bounds.first, bounds.last));
  let counts = liveList((j) => j.stats.entryCountsByDay(bounds.first, bounds.last));

  /* Both reads are one worker round trip, and the grid draws at its full
     size the whole time - a month is 30 cells of known shape, so there is
     nothing for a skeleton to stand in for and nothing to reflow. What does
     have to wait is the claim each cell makes: an empty `counts` result and a
     month with nothing logged look identical, so before the answer arrives
     every cell would tell a screen reader "no entries" for a day that has
     six. While it is loading a cell says the date and stops there. */
  let loading = $derived(averages.loading || counts.loading);

  let cells = $derived.by(() => {
    // The day's value stays native; only the swatch it picks is normalized,
    // so a 0-10 dimension and mood shade comparably (ADR-0012).
    const range = vocabulary.rangeOf(vocabulary.activeMetric);
    const valueByDay = new Map(averages.rows.map((point) => [point.day, point.value]));
    const countByDay = new Map(counts.rows.map((point) => [point.day, point.count]));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDow = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday-first
    const today = todayEpochDay();
    const out: {
      day: number;
      epochDay: number;
      level: number;
      count: number;
      isToday: boolean;
      label: string;
      /** The era border a day draws, or none for a day in no era - a
          resting state rather than a gap (ADR-0049), so it draws like any
          other day. The first era covering the day, which the no-overlap
          invariant makes the only one, so a day spanning two named eras
          never happens - only a month doing so does, and each of its days
          still answers for itself. */
      eraName: string | null;
      eraMark: string | null;
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const epochDay = bounds.first + d - 1;
      const count = countByDay.get(epochDay) ?? 0;
      const covering = eras.find((e) => eraCoversDay(e.era, epochDay));
      out.push({
        day: d,
        epochDay,
        level: heatLevel(valueByDay.get(epochDay) ?? null, range),
        count,
        isToday: epochDay === today,
        label: loading
          ? fmtDay(epochDay, { day: 'numeric', month: 'long' })
          : count
            ? m.heat_cell_entries({ date: fmtDay(epochDay, { day: 'numeric', month: 'long' }), count })
            : m.heat_cell_none({ date: fmtDay(epochDay, { day: 'numeric', month: 'long' }) }),
        eraName: covering?.era.name ?? null,
        eraMark: covering?.role.mark ?? null
      });
    }
    return { startDow, days: out };
  });

  /* The eras actually in view, named once each for the strip under the
     grid - a month spanning two eras draws both, and a month in none draws
     no strip at all rather than an empty-state or "Uncategorized"
     (ADR-0049). */
  let eraLegend = $derived.by(() => {
    const seen = new Map<string, string>();
    for (const c of cells.days) {
      if (c.eraName && c.eraMark && !seen.has(c.eraName)) seen.set(c.eraName, c.eraMark);
    }
    return [...seen.entries()].map(([name, mark]) => ({ name, mark }));
  });
</script>

<div class="cal-grid" role="grid" data-cal-grid aria-busy={loading}>
  {#each DOWS as d, i (i)}<span class="cal-dow" aria-hidden="true">{d}</span>{/each}
  {#each Array.from({ length: cells.startDow }) as _, i (i)}<span class="cal-cell is-blank"></span>{/each}
  {#each cells.days as c (c.epochDay)}
    {#if c.count}
      <a
        class="cal-cell has-entries press"
        class:is-today={c.isToday}
        data-hm-cell-filled
        style="background:{fillAt(c.level)};color:{inkAt(c.level)};{c.eraMark ? `border-color:${c.eraMark};` : ''}"
        href="/day/{c.epochDay}"
        aria-label={c.label}><span class="cal-num">{c.day}</span></a
      >
    {:else}
      <span
        class="cal-cell"
        class:is-today={c.isToday}
        style={c.eraMark ? `border-color:${c.eraMark}` : undefined}
        aria-label={c.label}><span class="cal-num">{c.day}</span></span
      >
    {/if}
  {/each}
</div>

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

{#if eraLegend.length}
  <!-- Which era's border a day is drawing (phase 6 ticket 03), named next
       to its colour the same way the metric legend already is. A month in
       no era draws no strip at all, rather than an empty state or
       "Uncategorized" (ADR-0049). -->
  <div class="cal-era-legend" data-cal-era-legend>
    {#each eraLegend as e (e.name)}
      <span class="cal-era-legend-item">
        <span class="cal-legend-swatch" style="border-color:{e.mark}"></span>
        {e.name}
      </span>
    {/each}
  </div>
{/if}

<style>
  .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
  .cal-dow {
    text-align: center;
    font-size: var(--text-xs);
    color: var(--text-2);
    font-weight: var(--weight-bold);
  }
  .cal-cell {
    aspect-ratio: 1;
    border-radius: var(--radius-xs);
    background: var(--heat-0);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    text-decoration: none;
    /* The empty cells carry the same edge the shaded ones get from their fill,
       so a month reads as a grid rather than as scattered colour - and so a
       day with nothing logged is still a day. */
    border: 1px solid var(--outline);
  }
  .cal-cell.is-blank { background: none; border-color: transparent; }
  /* Today, marked by an outline rather than by a fill, because the fill is
     already saying something else. */
  .cal-cell.is-today { outline: 2px solid var(--accent); outline-offset: 1px; }
  .cal-num { font-size: var(--text-xs); color: inherit; font-weight: var(--weight-medium); }
  /* An unshaded cell has no ink of its own to inherit. */
  .cal-cell:not(.has-entries) .cal-num { color: var(--text-2); }

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

  .cal-era-legend {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--text-2);
    margin-top: var(--space-2);
  }
  .cal-era-legend-item { display: inline-flex; align-items: center; gap: 5px; }
</style>

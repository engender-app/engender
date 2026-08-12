<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { heatLevel } from '$lib/data/metricRange';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let { metric }: { metric: string } = $props();

  /* Read on every recompute rather than captured once, so a session left open
     across midnight moves the strip on with the next write instead of holding
     yesterday's week. */
  let week = $derived({ first: todayEpochDay() - 6, last: todayEpochDay() });

  /* One query for the week rather than one per day: seven round trips
     through the worker to draw seven squares is the shape of read the port
     exists to avoid. Empty until it lands, so the strip draws at its full
     size with every day at level 0 and never reflows. */
  let averages = liveQuery(['entry'], (j) => j.stats.dayAverages(metric, week.first, week.last));

  let days = $derived.by(() => {
    // Native value in, swatch out: the strip and the calendar shade the
    // same day the same way whatever the metric's range is (ADR-0012).
    const range = vocabulary.rangeOf(metric);
    const byDay = new Map((averages.value ?? []).map((point) => [point.day, point.value]));
    return Array.from({ length: 7 }, (_, idx) => {
      const day = week.first + idx;
      return {
        day,
        level: heatLevel(byDay.get(day) ?? null, range),
        isToday: day === week.last,
      };
    });
  });
</script>

<div class="week-strip">
  {#each days as d (d.day)}
    <span class="week-day" class:is-today={d.isToday}>
      <span
        class="week-cell"
        style="background:var(--heat-{d.level})"
        role="img"
        aria-label={d.level === 0
          ? m.week_cell_no_entry({ day: fmtDay(d.day, { weekday: 'long' }) })
          : m.week_cell_level({ day: fmtDay(d.day, { weekday: 'long' }), level: String(d.level) })}
      ></span>
      <span class="week-name">{fmtDay(d.day, { weekday: 'narrow' })}</span>
    </span>
  {/each}
</div>

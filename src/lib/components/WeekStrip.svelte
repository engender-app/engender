<script lang="ts">
  import { todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { heatLevel } from '$lib/data/metricRange';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let { metric }: { metric: string } = $props();

  const today = todayEpochDay();
  const FIRST_DAY = today - 6;

  /* One query for the week rather than one per day: seven round trips
     through the worker to draw seven squares is the shape of read the port
     exists to avoid. Empty until it lands, so the strip draws at its full
     size with every day at level 0 and never reflows. */
  let averages = liveQuery(['entry'], (j) => j.stats.dayAverages(metric, FIRST_DAY, today));

  let days = $derived.by(() => {
    // Native value in, swatch out: the strip and the calendar shade the
    // same day the same way whatever the metric's range is (ADR-0012).
    const range = vocabulary.rangeOf(metric);
    const byDay = new Map((averages.value ?? []).map((point) => [point.day, point.value]));
    return Array.from({ length: 7 }, (_, idx) => {
      const day = FIRST_DAY + idx;
      return {
        day,
        level: heatLevel(byDay.get(day) ?? null, range),
        isToday: day === today,
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
        aria-label="{fmtDay(d.day, { weekday: 'long' })}: {d.level === 0 ? 'no entry' : `level ${d.level} of 4`}"
      ></span>
      <span class="week-name">{fmtDay(d.day, { weekday: 'narrow' })}</span>
    </span>
  {/each}
</div>

<script lang="ts">
  import { todayEpochDay } from '$lib/data/epochDay';
  import { dayMetricValue } from '$lib/data/repositories/entries';
  import { fmtDay } from '$lib/data/dates';
  import { heatLevel } from '$lib/data/metricScale';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let { metric }: { metric: string } = $props();

  let days = $derived.by(() => {
    const today = todayEpochDay();
    // Native value in, swatch out: the strip and the calendar shade the
    // same day the same way whatever the metric's range is (ADR-0012).
    const scale = vocabulary.scaleOf(metric);
    return Array.from({ length: 7 }, (_, idx) => {
      const day = today - (6 - idx);
      return {
        day,
        level: heatLevel(dayMetricValue(day, metric), scale),
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

<script lang="ts">
  import { todayEpochDay } from '$lib/data/epochDay';
  import { dayMetricValue } from '$lib/data/repositories/entries';
  import { fmtDay } from '$lib/data/dates';

  let { metric }: { metric: string } = $props();

  let days = $derived.by(() => {
    const today = todayEpochDay();
    return Array.from({ length: 7 }, (_, idx) => {
      const day = today - (6 - idx);
      const v = dayMetricValue(day, metric);
      return {
        day,
        level: v == null ? 0 : Math.min(4, Math.max(1, Math.ceil((v / 100) * 4))),
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

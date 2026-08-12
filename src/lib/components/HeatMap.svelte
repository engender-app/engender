<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import { heatLevel } from '$lib/data/metricRange';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  let { year, month }: { year: number; month: number /* 0-based */ } = $props();

  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
  let averages = liveQuery(['entry'], (j) => j.stats.dayAverages(metricKey(prefs), bounds.first, bounds.last));
  let counts = liveQuery(['entry'], (j) => j.stats.entryCountsByDay(bounds.first, bounds.last));

  let cells = $derived.by(() => {
    // The day's value stays native; only the swatch it picks is normalized,
    // so a 0-10 dimension and mood shade comparably (ADR-0012).
    const range = vocabulary.rangeOf(metricKey(prefs));
    const valueByDay = new Map((averages.value ?? []).map((point) => [point.day, point.value]));
    const countByDay = new Map((counts.value ?? []).map((point) => [point.day, point.count]));
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
    }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const epochDay = bounds.first + d - 1;
      const count = countByDay.get(epochDay) ?? 0;
      out.push({
        day: d,
        epochDay,
        level: heatLevel(valueByDay.get(epochDay) ?? null, range),
        count,
        isToday: epochDay === today,
        label: count
          ? m.heat_cell_entries({ date: fmtDay(epochDay, { day: 'numeric', month: 'long' }), count })
          : m.heat_cell_none({ date: fmtDay(epochDay, { day: 'numeric', month: 'long' }) }),
      });
    }
    return { startDow, days: out };
  });
</script>

<div class="heatmap" role="grid">
  {#each DOWS as d, i (i)}<span class="hm-dow" aria-hidden="true">{d}</span>{/each}
  {#each Array.from({ length: cells.startDow }) as _, i (i)}<span class="hm-cell is-blank"></span>{/each}
  {#each cells.days as c (c.epochDay)}
    {#if c.count}
      <a
        class="hm-cell has-entries"
        class:is-today={c.isToday}
        style="background:var(--heat-{c.level})"
        href="/day/{c.epochDay}"
        aria-label={c.label}><span class="hm-num">{c.day}</span></a
      >
    {:else}
      <span class="hm-cell" class:is-today={c.isToday} aria-label={c.label}><span class="hm-num">{c.day}</span></span>
    {/if}
  {/each}
</div>

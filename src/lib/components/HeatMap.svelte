<script lang="ts">
  import { db } from '$lib/data/db.svelte';
  import { dayMetricValue } from '$lib/data/repositories/entries';
  import { fmtDay } from '$lib/data/dates';
  import { todayEpochDay, epochDayFromLocalDate } from '$lib/data/epochDay';

  let { year, month }: { year: number; month: number /* 0-based */ } = $props();

  const DOWS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  let cells = $derived.by(() => {
    const metric = db.prefs.colorMetric;
    const first = new Date(Date.UTC(year, month, 1));
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const startDow = (first.getUTCDay() + 6) % 7; // Monday-first
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
      const epochDay = epochDayFromLocalDate(new Date(year, month, d));
      const v = dayMetricValue(epochDay, metric);
      const level = v == null ? 0 : Math.min(4, Math.max(1, Math.ceil((v / 100) * 4)));
      const count = db.entries.filter((e) => e.epochDay === epochDay).length;
      out.push({
        day: d,
        epochDay,
        level,
        count,
        isToday: epochDay === today,
        label: `${fmtDay(epochDay, { day: 'numeric', month: 'long' })}${count ? `, ${count} entr${count === 1 ? 'y' : 'ies'}` : ', no entries'}`,
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

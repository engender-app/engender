<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { customInclusiveRange, dateInputValueFromEpochDay, epochDayFromDateInputValue, todayEpochDay } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import type { Journal } from '$lib/data/journal/journal';
  import Icon from '$lib/components/Icon.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';

  interface Period {
    start: number;
    end: number;
    label: string;
  }

  interface ComparisonSideStats {
    entryCount: number;
    averageMood: number | null;
    bestStreak: number;
    topTagLabel: string;
    dimensionAverages: { name: string; average: number | null }[];
  }

  let today = $derived(todayEpochDay());
  let todayInput = $derived(dateInputValueFromEpochDay(today));

  let aStart = $state('');
  let aEnd = $state('');
  let bStart = $state('');
  let bEnd = $state('');

  /* Every number below comes straight from the recap/day-average seam
     (ticket 10) two independent times, one per period - nothing here
     computes or renders a difference between the two (ticket 18). */
  function periodFrom(start: string, end: string): Period | null {
    const range = customInclusiveRange(epochDayFromDateInputValue(start), epochDayFromDateInputValue(end));
    if (!range || range.end > today) return null;
    return {
      ...range,
      label: `${fmtDay(range.start, { day: 'numeric', month: 'short' })} – ${fmtDay(range.end, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })}`
    };
  }

  let periodA = $derived(periodFrom(aStart, aEnd));
  let periodB = $derived(periodFrom(bStart, bEnd));

  async function sideStats(j: Journal, period: Period): Promise<ComparisonSideStats> {
    const recap = await j.stats.recap(period.start, period.end);
    const dims = vocabulary.activeDimensions;
    const series = await Promise.all(dims.map((d) => j.stats.dayAverages(d.key, period.start, period.end)));
    return {
      entryCount: recap.entryCount,
      averageMood: recap.averageMood,
      bestStreak: recap.bestStreak,
      topTagLabel: recap.topTags.length
        ? recap.topTags.map((t) => m.recap_tag_count({ label: vocabulary.tag(t.id)?.label ?? t.id, count: String(t.count) })).join(' · ')
        : m.recap_tags_none_range(),
      dimensionAverages: dims.map((d, i) => ({
        name: d.name,
        average: series[i].length ? series[i].reduce((sum, p) => sum + p.value, 0) / series[i].length : null
      }))
    };
  }

  let queryA = liveQuery(['entry', 'tag', 'dimension'], (j) => (periodA ? sideStats(j, periodA) : Promise.resolve(null)));
  let queryB = liveQuery(['entry', 'tag', 'dimension'], (j) => (periodB ? sideStats(j, periodB) : Promise.resolve(null)));

  const fmtMood = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const fmtDimension = (v: number | null) => (v == null ? '—' : String(Math.round(v)));
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/stats" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.compare_title()}</h1>
    <div class="header-action"></div>
  </header>

  <div class="compare-wrap">
    <div class="card compare-picker">
      <span class="row-title">{m.compare_period_a_label()}</span>
      <div class="compare-picker-grid">
        <label for="compare-a-start">{m.recap_custom_start_label()}</label>
        <input
          class="input"
          id="compare-a-start"
          type="date"
          bind:value={aStart}
          max={todayInput}
          aria-label={m.compare_start_label({ period: m.compare_period_a_label() })}
        />
        <label for="compare-a-end">{m.recap_custom_end_label()}</label>
        <input
          class="input"
          id="compare-a-end"
          type="date"
          bind:value={aEnd}
          min={aStart || undefined}
          max={todayInput}
          aria-label={m.compare_end_label({ period: m.compare_period_a_label() })}
        />
      </div>
      {#if !periodA}
        <p class="muted small" style="margin-top:var(--space-2)">{m.recap_custom_range_required()}</p>
      {/if}
    </div>

    <div class="card compare-picker">
      <span class="row-title">{m.compare_period_b_label()}</span>
      <div class="compare-picker-grid">
        <label for="compare-b-start">{m.recap_custom_start_label()}</label>
        <input
          class="input"
          id="compare-b-start"
          type="date"
          bind:value={bStart}
          max={todayInput}
          aria-label={m.compare_start_label({ period: m.compare_period_b_label() })}
        />
        <label for="compare-b-end">{m.recap_custom_end_label()}</label>
        <input
          class="input"
          id="compare-b-end"
          type="date"
          bind:value={bEnd}
          min={bStart || undefined}
          max={todayInput}
          aria-label={m.compare_end_label({ period: m.compare_period_b_label() })}
        />
      </div>
      {#if !periodB}
        <p class="muted small" style="margin-top:var(--space-2)">{m.recap_custom_range_required()}</p>
      {/if}
    </div>
  </div>

  {#if !periodA || !periodB}
    <p class="muted small" style="margin-top:var(--space-4)">{m.compare_empty()}</p>
  {:else if queryA.loading || queryB.loading || !queryA.value || !queryB.value}
    <Skeleton variant="line" count={5} />
  {:else}
    {@const a = queryA.value}
    {@const b = queryB.value}
    <div class="card compare-metrics" style="margin-top:var(--space-4)" data-compare-table>
      <div class="compare-metrics-row compare-metrics-header">
        <span></span>
        <span class="compare-period-label">{periodA.label}</span>
        <span class="compare-period-label">{periodB.label}</span>
      </div>
      <div class="compare-metrics-row">
        <span class="row-title">{m.compare_entries_label()}</span>
        <span>{a.entryCount}</span>
        <span>{b.entryCount}</span>
      </div>
      <div class="compare-metrics-row">
        <span class="row-title">{m.mood()}</span>
        <span>{fmtMood(a.averageMood)}</span>
        <span>{fmtMood(b.averageMood)}</span>
      </div>
      {#each vocabulary.activeDimensions as d, i (d.key)}
        <div class="compare-metrics-row">
          <span class="row-title">{d.name}</span>
          <span>{fmtDimension(a.dimensionAverages[i]?.average ?? null)}</span>
          <span>{fmtDimension(b.dimensionAverages[i]?.average ?? null)}</span>
        </div>
      {/each}
      <div class="compare-metrics-row">
        <span class="row-title">{m.compare_streak_label()}</span>
        <span>{m.n_days({ n: a.bestStreak })}</span>
        <span>{m.n_days({ n: b.bestStreak })}</span>
      </div>
      <div class="compare-metrics-row compare-metrics-tags">
        <span class="row-title">{m.recap_tags_title()}</span>
        <span class="small">{a.topTagLabel}</span>
        <span class="small">{b.topTagLabel}</span>
      </div>
    </div>
  {/if}
</div>

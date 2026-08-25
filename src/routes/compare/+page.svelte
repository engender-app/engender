<script lang="ts">
  /* Two periods side by side (phase 5 UX ticket 23's rebuild). Linked from
     the Stats hub's own list.

     Every number comes straight from the recap/day-average seam (ticket 10)
     two independent times, one per period. Nothing here computes a
     difference between the two, and that is the whole design of the screen:
     the reader compares, the app does not. A delta column would be the app
     saying which period was better, which is the one thing it never does
     (PRODUCT.md, ADR-0012).

     The two pickers stack rather than sitting in two columns. They shared
     `.compare-wrap` with the progress-photo comparison, which is a two-up
     grid built for two photographs; two date fields squeezed into half of a
     390px screen is not the same thing, and the two screens have nothing
     else in common. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import {
    customInclusiveRange,
    dateInputValueFromEpochDay,
    epochDayFromDateInputValue,
    todayEpochDay
  } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import type { Journal } from '$lib/data/journal/journal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import { roleStyle } from '$lib/components/kit/role';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
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

  function periodFrom(start: string, end: string): Period | null {
    const range = customInclusiveRange(epochDayFromDateInputValue(start), epochDayFromDateInputValue(end));
    if (!range || range.end > today) return null;
    return {
      ...range,
      label: `${fmtDay(range.start, { day: 'numeric', month: 'short' })} to ${fmtDay(range.end, {
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
        ? recap.topTags
            .map((t) =>
              m.recap_tag_count({ label: vocabulary.tag(t.id)?.label ?? t.id, count: String(t.count) })
            )
            .join(' · ')
        : m.recap_tags_none_range(),
      dimensionAverages: dims.map((d, i) => ({
        name: d.name,
        average: series[i].length ? series[i].reduce((sum, p) => sum + p.value, 0) / series[i].length : null
      }))
    };
  }

  let queryA = liveQuery(['entry', 'tag', 'dimension'], (j) =>
    periodA ? sideStats(j, periodA) : Promise.resolve(null)
  );
  let queryB = liveQuery(['entry', 'tag', 'dimension'], (j) =>
    periodB ? sideStats(j, periodB) : Promise.resolve(null)
  );

  const fmtMood = (v: number | null) => (v == null ? '—' : v.toFixed(1));
  const fmtDimension = (v: number | null) => (v == null ? '—' : String(Math.round(v)));
</script>

<div class="screen">
  <ScreenHeader title={m.compare_title()} subtitle={m.compare_sub()} screen="compare" back="/stats" />

  <SectionHeading text={m.compare_period_a_label()} />
  <div class="compare-picker" style={roleStyle(roleAt(activeFlag.roles, 0))}>
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
  </div>

  <SectionHeading text={m.compare_period_b_label()} />
  <div class="compare-picker" style={roleStyle(roleAt(activeFlag.roles, 1))}>
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
  </div>

  {#if !periodA || !periodB}
    <Notice icon="info" key="compare-empty" title={m.compare_empty()} />
  {:else if queryA.loading || queryB.loading || !queryA.value || !queryB.value}
    <Skeleton variant="line" count={5} />
  {:else}
    {@const a = queryA.value}
    {@const b = queryB.value}
    <!-- A table, because that is what two columns of the same readings is.
         No third column: the difference between the two is the reader's to
         draw, and a delta would be the app naming a winner. -->
    <div class="compare-metrics" data-compare-table>
      <div class="compare-metrics-row compare-metrics-header">
        <span></span>
        <span class="compare-period-label" data-compare-period-label>{periodA.label}</span>
        <span class="compare-period-label" data-compare-period-label>{periodB.label}</span>
      </div>
      <div class="compare-metrics-row" data-compare-metric="entries">
        <span class="compare-metric-name">{m.compare_entries_label()}</span>
        <span>{a.entryCount}</span>
        <span>{b.entryCount}</span>
      </div>
      <div class="compare-metrics-row" data-compare-metric="mood">
        <span class="compare-metric-name">{m.mood()}</span>
        <span>{fmtMood(a.averageMood)}</span>
        <span>{fmtMood(b.averageMood)}</span>
      </div>
      {#each vocabulary.activeDimensions as d, i (d.key)}
        <div class="compare-metrics-row" data-compare-metric={d.key}>
          <span class="compare-metric-name">{d.name}</span>
          <span>{fmtDimension(a.dimensionAverages[i]?.average ?? null)}</span>
          <span>{fmtDimension(b.dimensionAverages[i]?.average ?? null)}</span>
        </div>
      {/each}
      <div class="compare-metrics-row" data-compare-metric="streak">
        <span class="compare-metric-name">{m.compare_streak_label()}</span>
        <span>{m.n_days({ n: a.bestStreak })}</span>
        <span>{m.n_days({ n: b.bestStreak })}</span>
      </div>
      <div class="compare-metrics-row compare-metrics-tags" data-compare-metric="tags">
        <span class="compare-metric-name">{m.recap_tags_title()}</span>
        <span class="compare-metric-text">{a.topTagLabel}</span>
        <span class="compare-metric-text">{b.topTagLabel}</span>
      </div>
    </div>
  {/if}
</div>

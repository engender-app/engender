<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import { localDateFromEpochDay, todayEpochDay, previousCalendarMonthRange, previousCalendarYearRange } from '$lib/data/epochDay';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import Icon from '$lib/components/Icon.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { DayAverage } from '$lib/data/journal/stats';

  const RANGES = [7, 14, 30, 90, 180, 365];
  /** How many entries the sheet behind a tag insight lists. */
  const INSIGHT_ENTRIES = 20;
  let range = $state(30);

  /* A range is a length on screen and two epoch days to the journal, which
     never reads the clock for a domain answer (ticket 10). Inclusive of both
     ends, so "7 days" is today and the six before it - and read on recompute
     rather than captured, so a session open across midnight moves on. */
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let metrics = $derived([
    { key: 'mood', name: m.mood(), min: 1, max: 5 },
    ...vocabulary.activeDimensions.map((d) => ({ key: d.key, name: d.name, min: d.min, max: d.max })),
  ]);

  let streakQuery = liveQuery(['entry'], (j) => j.stats.streak(today));
  let streak = $derived(streakQuery.value ?? 0);

  /* One query for every chart on screen rather than one per metric: the
     charts differ only in which metric they plot, and asking per chart would
     mean a round trip per active dimension every time the range changes. */
  let seriesQuery = liveQuery(['entry', 'dimension'], async (j) => {
    const keys = metrics.map((mt) => mt.key);
    const [rangeFrom, rangeTo] = [from, today];
    const series = await Promise.all(keys.map((key) => j.stats.dayAverages(key, rangeFrom, rangeTo)));
    return new Map(keys.map((key, i) => [key, series[i]]));
  });
  let seriesFor = $derived((key: string): DayAverage[] => seriesQuery.value?.get(key) ?? []);

  let insightsQuery = liveQuery(['entry', 'tag'], (j) => j.stats.tagInsights(metricKey(prefs), from, today));
  let insights = $derived(insightsQuery.value ?? []);

  let lastMonthName = $derived.by(() => {
    const { year, month } = previousCalendarMonthRange(today);
    return fmtMonthName(year, month);
  });
  let lastYear = $derived(localDateFromEpochDay(today).getMonth() === 0 ? previousCalendarYearRange(today).year : null);

  let valueSheet = $state<{ name: string; key: string } | null>(null);
  let insightSheet = $state<{ label: string; id: string } | null>(null);

  // Native units both ways (ADR-0012): mood arrives on 1 to 5 and only
  // needs a decimal place, a dimension arrives in its own range. The /20
  // that used to be here undid a x20 that no longer happens.
  const fmtMetric = (v: number) => (prefs.metricKind === 'mood' ? v.toFixed(1) : String(Math.round(v)));

  let insightEntriesQuery = liveQuery(['entry', 'tag'], (j) => {
    const sheet = insightSheet;
    if (!sheet) return Promise.resolve([]);
    return j.entries.entriesWithTag(sheet.id, INSIGHT_ENTRIES);
  });
  let insightEntries = $derived(insightEntriesQuery.value ?? []);
</script>

<div class="screen">
  <header class="screen-header">
    <h1 class="screen-title">{m.stats_title({ days: String(range) })}</h1>
  </header>

  <div class="segmented" role="radiogroup" aria-label="Range" style="margin-bottom:var(--space-4)">
    {#each RANGES as r (r)}
      <button
        class="segment"
        class:is-active={r === range}
        role="radio"
        aria-checked={r === range}
        data-range={r}
        onclick={() => (range = r)}>{m.range_days({ days: String(r) })}</button
      >
    {/each}
  </div>

  {#if streak > 0}
    <div class="card spread" style="margin-bottom:var(--space-4)">
      <span class="row-text">
        <span class="row-title"><Icon name="sparkle" size={16} /> {streak} {m.streak_with_entry()}</span>
        <span class="row-subtitle">{m.streak_sub()}</span>
      </span>
    </div>
  {/if}

  {#if seriesQuery.loading}
    <Skeleton variant="block" count={2} />
  {:else}
    {#each metrics as mt, mi (mt.key)}
      {@const series = seriesFor(mt.key)}
      {@const avg = series.length ? series.reduce((a, p) => a + p.value, 0) / series.length : null}
      <button
        class="card chart-card"
        style={mi % 2 === 1 ? '--chart-line:var(--chart-line-2);--chart-fill:var(--chart-fill-2)' : ''}
        onclick={() => (valueSheet = { name: mt.name, key: mt.key })}
      >
        <div class="spread">
          <span class="chart-title">{mt.name}</span>
          <span class="chart-avg">
            {avg == null ? '—' : m.avg_label({ value: mt.key === 'mood' ? avg.toFixed(1) : String(Math.round(avg)) })}
          </span>
        </div>
        <LineChart points={series} min={mt.min} max={mt.max} />
      </button>
    {/each}
  {/if}

  <SectionTitle text={m.tag_insights()}>
    {#snippet aside()}{m.insights_sub({ metric: vocabulary.metricName })}{/snippet}
  </SectionTitle>
  {#if insightsQuery.loading}
    <Skeleton variant="line" count={3} />
  {:else if insights.length}
    <div class="list-group">
      {#each insights.slice(0, 6) as i (i.id)}
        {@const label = vocabulary.tag(i.id)?.label ?? i.id}
        <button class="list-row" onclick={() => (insightSheet = { label, id: i.id })}>
          <span class="row-text">
            <span class="row-title">{label}</span>
            <span class="row-subtitle">
              {i.count} entries · avg {fmtMetric(i.withAvg)} with · {fmtMetric(i.withoutAvg)} without
            </span>
          </span>
          <span class="insight-delta" class:is-neg={i.withAvg < i.withoutAvg}>
            {i.withAvg >= i.withoutAvg ? '+' : '−'}{fmtMetric(Math.abs(i.withAvg - i.withoutAvg))}
          </span>
        </button>
      {/each}
    </div>
    <p class="muted small" style="margin-top:var(--space-2)">{m.insights_note()}</p>
  {:else}
    <p class="muted small">{m.insights_empty()}</p>
  {/if}

  <SectionTitle text={m.recap()} />
  <a class="card spread recap-cta" href="/recap">
    <span class="row-text">
      <span class="row-title">{m.recap_your({ month: lastMonthName })}</span>
      <span class="row-subtitle">{m.recap_sub()}</span>
    </span>
    <Icon name="chevronRight" size={20} />
  </a>
  {#if lastYear !== null}
    <a class="card spread recap-cta" href="/recap?period=year" style="margin-top:var(--space-3)">
      <span class="row-text">
        <span class="row-title">Your {lastYear}</span>
        <span class="row-subtitle">A look back at the year you recorded.</span>
      </span>
      <Icon name="chevronRight" size={20} />
    </a>
  {/if}

  <Sheet open={valueSheet !== null} title={valueSheet?.name ?? ''} onClose={() => (valueSheet = null)}>
    {#if valueSheet}
      <h3>{m.values_title({ name: valueSheet.name })}</h3>
      <div class="value-list">
        {#each seriesFor(valueSheet.key).toReversed() as p (p.day)}
          <div class="value-row">
            <span>{fmtDay(p.day, { day: 'numeric', month: 'short' })}</span>
            <span class="muted small">{p.count > 1 ? m.avg_of({ count: String(p.count) }) : ''}</span>
            <strong>{valueSheet.key === 'mood' ? p.value.toFixed(1) : Math.round(p.value)}</strong>
          </div>
        {/each}
      </div>
      <button class="btn btn-ghost" onclick={() => (valueSheet = null)}><span>{m.done()}</span></button>
    {/if}
  </Sheet>

  <Sheet open={insightSheet !== null} title={insightSheet?.label ?? ''} onClose={() => (insightSheet = null)}>
    {#if insightSheet}
      <h3>{insightSheet.label}</h3>
      <div class="stack-3">
        {#each insightEntries as e (e.id)}
          <EntryCard entry={e} />
        {/each}
      </div>
      <button class="btn btn-ghost" style="margin-top:var(--space-3)" onclick={() => (insightSheet = null)}>
        <span>{m.done()}</span>
      </button>
    {/if}
  </Sheet>
</div>

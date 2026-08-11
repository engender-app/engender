<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { db } from '$lib/data/db.svelte';
  import { fmtDay, fmtMonthName } from '$lib/data/dates';
  import { todayEpochDay, previousCalendarMonthRange } from '$lib/data/epochDay';
  import { seriesForRange, tagInsights, streakDays } from '$lib/data/repositories/entries';
  import { activeDimensions } from '$lib/data/repositories/dimensions';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { metricKey } from '$lib/data/prefs/catalogue';
  import Icon from '$lib/components/Icon.svelte';
  import LineChart from '$lib/components/LineChart.svelte';
  import SectionTitle from '$lib/components/SectionTitle.svelte';
  import Sheet from '$lib/components/Sheet.svelte';
  import EntryCard from '$lib/components/EntryCard.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  let metrics = $derived([
    { key: 'mood', name: m.mood(), min: 1, max: 5 },
    ...activeDimensions().map((d) => ({ key: d.key, name: d.name, min: d.min, max: d.max })),
  ]);
  let streak = $derived(streakDays());
  let insights = $derived(tagInsights(range, metricKey(prefs)));
  let lastMonthName = $derived.by(() => {
    const { year, month } = previousCalendarMonthRange(todayEpochDay());
    return fmtMonthName(year, month);
  });

  let valueSheet = $state<{ name: string; key: string; series: ReturnType<typeof seriesForRange> } | null>(null);
  let insightSheet = $state<{ label: string; id: string } | null>(null);

  const fmtMetric = (v: number) => (prefs.metricKind === 'mood' ? (v / 20).toFixed(1) : String(Math.round(v)));

  let insightEntries = $derived.by(() => {
    const sheet = insightSheet;
    if (!sheet) return [];
    return db.entries
      .filter((e) => e.tags.includes(sheet.id))
      .sort((a, b) => b.epochDay - a.epochDay)
      .slice(0, 20);
  });
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

  {#each metrics as mt, mi (mt.key)}
    {@const series = seriesForRange(range, mt.key)}
    {@const avg = series.length ? series.reduce((a, p) => a + p.value, 0) / series.length : null}
    <button
      class="card chart-card"
      style={mi % 2 === 1 ? '--chart-line:var(--chart-line-2);--chart-fill:var(--chart-fill-2)' : ''}
      onclick={() => (valueSheet = { name: mt.name, key: mt.key, series })}
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

  <SectionTitle text={m.tag_insights()}>
    {#snippet aside()}{m.insights_sub({ metric: prefs.metricKind === 'mood' ? m.mood() : 'metric' })}{/snippet}
  </SectionTitle>
  {#if insights.length}
    <div class="list-group">
      {#each insights.slice(0, 6) as i (i.id)}
        <button class="list-row" onclick={() => (insightSheet = { label: i.label, id: i.id })}>
          <span class="row-text">
            <span class="row-title">{i.label}</span>
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

  <Sheet open={valueSheet !== null} title={valueSheet?.name ?? ''} onClose={() => (valueSheet = null)}>
    {#if valueSheet}
      <h3>{m.values_title({ name: valueSheet.name })}</h3>
      <div class="value-list">
        {#each [...valueSheet.series].reverse() as p (p.day)}
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

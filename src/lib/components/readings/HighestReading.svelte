<script lang="ts">
  /* Highest days on one of the person's own readings (phase 8 features
     ticket 20; phase 9 carpet ticket 11 gave it a chooser), a reading of
     its own since phase 11 ticket 07. Bar rows and not a list, because the
     reading somebody wants off ten high days is how far apart they were.
     Each row opens its day.

     The chooser writes this card's own state and not the stored metric two
     other screens shade by. `highestKey` is null until somebody moves it,
     and `highestMetricKey` decides what null means - euphoria where it is
     kept, the active scale otherwise.

     The tile's figure is the highest day's date, with its value and scale
     under it, and the top three as flat bars above. One read of one
     metric's series here, rather than the door's every-metric read: this
     reading ranks one scale at a time. */
  import { goto } from '$app/navigation';
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { highestMetricKey, rankHighestDays } from '$lib/data/highestDays';
  import { nativeAmount, nativeValue } from '$lib/data/wrappedDisplay';
  import { readingHref } from '$lib/data/lookBackReadings';
  import { metricChoices, shownMetric } from '$lib/data/metricChoices';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { BarRow } from '$lib/components/kit/barRow';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { crossfade } from '$lib/motion/reveal';

  let {
    span,
    today,
    view = 'screen',
    enoughEntries = true
  }: { span: Span; today: number; view?: 'tile' | 'screen'; enoughEntries?: boolean } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  const CHART_ROLE = 0;

  let metrics = $derived(metricChoices());
  let metricOptions = $derived(metrics.map((mt) => ({ value: mt.key, label: mt.name })));
  let shown = $derived(shownMetric(metrics));

  let highestKey = $state<string | null>(null);
  let highestRanks = $derived(highestMetricKey(highestKey, metrics.map((each) => each.key), shown.key));
  /* `?? shown` is the type's, not a case: every key highestMetricKey can
     answer with came out of `metrics`. */
  let highestMetric = $derived(metrics.find((mt) => mt.key === highestRanks) ?? shown);

  let seriesQuery = liveList((j) => j.stats.dayAverages(highestMetric.key, from, to));
  let highestRows = $derived<BarRow[]>(
    rankHighestDays(today, seriesQuery.rows).map((point) => ({
      key: String(point.day),
      name: fmtDay(point.day, { weekday: 'short', day: 'numeric', month: 'short' }),
      note: point.count > 1 ? m.avg_of({ count: String(point.count) }) : undefined,
      value: nativeValue(highestMetric.key, point.value),
      amount:
        (nativeAmount(highestMetric.key, point.value) - highestMetric.min) /
        Math.max(highestMetric.max - highestMetric.min, 1)
    }))
  );
  let topRow = $derived(highestRows[0]);
</script>

{#if view === 'tile'}
  {#if !seriesQuery.loading && enoughEntries && topRow}
    <ReadingTile
      key="highest"
      name={m.stats_highest_days()}
      href={readingHref('highest', span)}
      headline={topRow.name}
      note={`${topRow.value} ${highestMetric.name}`}
    >
      {#snippet drawing()}
        <span class="highest-bars">
          {#each highestRows.slice(0, 3) as row (row.key)}
            <span class="highest-bar" style={`width: ${Math.round(Math.max(row.amount, 0.04) * 100)}%`}></span>
          {/each}
        </span>
      {/snippet}
    </ReadingTile>
  {/if}
{:else}
  <ChartCard heading={m.stats_highest_days()} kind="highest-days" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    {#snippet control()}
      <ChartPicker
        key="highest-metric"
        label={m.stats_highest_days()}
        value={highestMetric.key}
        options={metricOptions}
        onPick={(value) => (highestKey = value)}
      />
    {/snippet}
    {#if seriesQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={3} /></div>
    {:else if enoughEntries && highestRows.length}
      <BarRows rows={highestRows} measure="track" form="inline" onPick={(key) => goto(`/day/${key}`)} />
      <p class="reading-note">{m.stats_highest_days_note()}</p>
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>
{/if}

<style>
  .highest-bars {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 4px;
    width: 100%;
    height: 100%;
  }

  .highest-bar {
    display: block;
    flex: 0 0 8px;
    border-radius: 2px;
    background: var(--ink);
  }

  .reading-note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }
</style>

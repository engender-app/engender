<script lang="ts">
  /* Day by day: the active scale over the span, with a second scale on
     offer, and where every scale sat over the period (phase 11 ticket 07,
     moved off the Look back door's scroll into a reading of its own).

     Two views of one read. On the door it is a tile: a 2px line of the
     series and the active scale's average as the figure. On its screen it
     is the two cards the door used to draw - the chart with its picker and
     the second-scale offer, and "Each scale, this period" under it, since
     that card reads the same series and was the chart's companion on the
     door - plus the hidden values list, which is the only path a screen
     reader has through the series.

     The chart fits the card, so what changes with the range is how coarsely
     it reads: 30 days day by day, a year week by week ($lib/charts/grain).
     The grain decides how the scrubbed position is named too - a week's
     reading is a week, and dating it to its Monday alone would be a day
     standing in for seven. The second scale is opt-in and empty by default:
     a comparison is a question somebody has to have first (phase 6 ticket
     12). Both series bucket separately and are read onto the first's
     positions, since the chart places by index. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { selectMetric } from '$lib/data/prefs/store.svelte';
  import { alignSeries, atGrain, type Grain } from '$lib/charts/grain';
  import { metricStandings } from '$lib/data/statsCharts';
  import { nativeAmount, nativeValue, spreadNote } from '$lib/data/wrappedDisplay';
  import { readingHref } from '$lib/data/lookBackReadings';
  import { metricChoices, shownMetric } from '$lib/data/metricChoices';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import type { DayAverage } from '$lib/data/journal/stats';
  import type { BarRow } from '$lib/components/kit/barRow';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
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
  }: {
    span: Span;
    today: number;
    view?: 'tile' | 'screen';
    /** The one floor every summary panel on the door shares
        (WRAPPED_ENTRY_FLOOR, read by the caller). */
    enoughEntries?: boolean;
  } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);
  let range = $derived(to - from + 1);

  /* Every chart on the door shares role 0 (stats/+page.svelte's own note:
     "colour that carries a value takes role 0"). */
  const CHART_ROLE = 0;

  let metrics = $derived(metricChoices());
  let metricOptions = $derived(metrics.map((mt) => ({ value: mt.key, label: mt.name })));
  let shown = $derived(shownMetric(metrics));

  let annotationsQuery = liveList((j) => j.chartAnnotations.getAnnotations(from, to, today));

  /* One query for every metric rather than one per chart: the plot draws
     one at a time but the scales card needs all of them. */
  let seriesQuery = liveQuery(async (j) => {
    const keys = metrics.map((mt) => mt.key);
    const [rangeFrom, rangeTo] = [from, to];
    const series = await Promise.all(keys.map((key) => j.stats.dayAverages(key, rangeFrom, rangeTo)));
    return new Map(keys.map((key, i) => [key, series[i]]));
  });
  let series = $derived(seriesQuery.value ?? new Map<string, DayAverage[]>());
  let seriesFor = $derived((key: string): DayAverage[] => series.get(key) ?? []);

  /* Where each scale sat over the period. The bar's length is where the
     average lands inside that metric's own range and the number beside it
     is native, which is the only honest way to put mood's 1-to-5 and a
     dimension's 0-to-100 on one card (statsCharts.ts). */
  let scaleRows = $derived<BarRow[]>(
    metricStandings(
      metrics.map((mt) => ({ key: mt.key, range: { min: mt.min, max: mt.max } })),
      seriesFor
    ).map((standing) => {
      const metric = metrics.find((mt) => mt.key === standing.key);
      return {
        key: standing.key,
        name: metric?.name ?? standing.key,
        note: m.n_days({ n: standing.days }),
        /* Empty rather than a dash on a scale nothing was logged against:
           docs/ui-copy.md has no dashes in it. */
        value: standing.value === null ? '' : nativeValue(standing.key, standing.value),
        amount: standing.share
      };
    })
  );
  let activeScaleRow = $derived(scaleRows.find((row) => row.key === shown.key));

  let compareKey = $state('');
  let comparing = $state(false);
  $effect(() => {
    if (compareKey && !metrics.some((mt) => mt.key === compareKey && mt.key !== shown.key)) {
      compareKey = '';
    }
  });
  let compared = $derived(metrics.find((mt) => mt.key === compareKey));
  let compareOptions = $derived([
    { value: '', label: m.stats_compare_none() },
    ...metricOptions.filter((option) => option.value !== shown.key)
  ]);

  /* Where the picked metric's days ran between, for the values list: the
     one place on this screen that prints a single day. */
  let spreadsQuery = liveList((j) => j.stats.daySpread(shown.key, from, to));
  let spreadByDay = $derived(
    spreadsQuery.loading
      ? new Map<number, (typeof spreadsQuery.rows)[number]>()
      : new Map(spreadsQuery.rows.map((point) => [point.day, point]))
  );

  /* Every reading in the range, as text: the plot is one image to a screen
     reader and a scrub is a way of reading a picture. A second scale joins
     this list as the day's note, and days only it carries get a row with
     an empty value, so the list never disagrees with the picture it stands
     in for. */
  let shownByDay = $derived(new Map(seriesFor(shown.key).map((point) => [point.day, point])));
  let comparedByDay = $derived(
    compared ? new Map(seriesFor(compared.key).map((point) => [point.day, point])) : null
  );
  let valueDays = $derived(
    [...new Set([...shownByDay.keys(), ...(comparedByDay?.keys() ?? [])])].sort((a, b) => b - a)
  );
  let valueRows = $derived<BarRow[]>(
    valueDays.map((day) => {
      const point = shownByDay.get(day);
      const second = comparedByDay?.get(day);
      const notes = [
        point && point.count > 1 ? m.avg_of({ count: String(point.count) }) : null,
        spreadNote(shown.key, spreadByDay.get(day)),
        compared && second
          ? m.values_second({ name: compared.name, value: nativeValue(compared.key, second.value) })
          : null
      ].filter(Boolean);
      return {
        key: String(day),
        name: fmtDay(day, { weekday: 'short', day: 'numeric', month: 'short' }),
        note: notes.length ? notes.join(' · ') : undefined,
        value: point ? nativeValue(shown.key, point.value) : '',
        amount: point ? (nativeAmount(shown.key, point.value) - shown.min) / Math.max(shown.max - shown.min, 1) : 0
      };
    })
  );

  let plotted = $derived(atGrain(seriesFor(shown.key).map((p) => ({ x: p.day, y: p.value })), range));
  let comparePlotted = $derived(
    compared ? atGrain(seriesFor(compared.key).map((p) => ({ x: p.day, y: p.value })), range) : null
  );
  let aligned = $derived(comparePlotted ? alignSeries(plotted.points, comparePlotted.points) : null);
  let comparedHasReadings = $derived(aligned?.some((row) => row.b !== null) ?? false);
  let valuesLabel = $derived(
    compared && comparedHasReadings
      ? m.values_two_title({ first: shown.name, second: compared.name })
      : m.values_title({ name: shown.name })
  );
  let compareRole = $derived(roleAt(activeFlag.roles, CHART_ROLE + 1));

  const GRAIN_SPAN: Record<Grain, number> = { day: 0, week: 6, month: 27 };
  const grainLabel = (grain: Grain) => (point: { x: number }) => {
    const short = { day: 'numeric', month: 'short' } as const;
    if (grain === 'day') return fmtDay(point.x, { weekday: 'short', ...short });
    if (grain === 'month') return fmtDay(point.x, { month: 'long', year: 'numeric' });
    return `${fmtDay(point.x, short)} - ${fmtDay(point.x + GRAIN_SPAN.week, short)}`;
  };

  /* The tile's line: the plotted series on the scale's own range, so a
     quiet stretch reads as a flat line and not as a range stretched to
     fill the box. Index along, value up, as the chart draws it. */
  const SPARK_W = 100;
  const SPARK_H = 36;
  let sparkline = $derived.by(() => {
    const points = plotted.points;
    if (points.length < 2) return '';
    const spread = Math.max(shown.max - shown.min, 1);
    return points
      .map((p, i) => {
        const x = (i / (points.length - 1)) * SPARK_W;
        const y = SPARK_H - 1 - ((nativeAmount(shown.key, p.y) - shown.min) / spread) * (SPARK_H - 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
</script>

{#if view === 'tile'}
  <!-- Absent, never empty: no series in the span, no tile. -->
  {#if !seriesQuery.loading && plotted.points.length}
    <ReadingTile
      key="day-by-day"
      name={m.stats_day_by_day()}
      href={readingHref('day-by-day', span)}
      headline={activeScaleRow?.value || undefined}
      note={m.lookback_facts_average({ name: shown.name })}
    >
      {#snippet drawing()}
        <svg viewBox="0 0 {SPARK_W} {SPARK_H}" preserveAspectRatio="none">
          <polyline
            points={sparkline}
            fill="none"
            stroke="var(--ink)"
            stroke-width="2"
            stroke-linecap="square"
            stroke-linejoin="miter"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      {/snippet}
    </ReadingTile>
  {/if}
{:else}
  <ChartCard heading={m.stats_day_by_day()} kind="day-by-day" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    {#snippet control()}
      <ChartPicker
        key="stats-metric"
        label={m.stats_day_by_day()}
        value={shown.key}
        options={metricOptions}
        onPick={(value) => selectMetric(value === 'mood' ? null : value)}
      />
    {/snippet}
    {#if seriesQuery.loading}
      <div out:crossfade><Skeleton variant="block" count={1} /></div>
    {:else}
      <AreaChart
        points={aligned ? aligned.map((row) => ({ x: row.x, y: row.a })) : plotted.points}
        min={shown.min}
        max={shown.max}
        name={shown.name}
        overlay={aligned && compared && comparedHasReadings
          ? {
              values: aligned.map((row) => row.b),
              min: compared.min,
              max: compared.max,
              name: compared.name,
              formatValue: (v) => nativeValue(compared.key, v),
              role: compareRole
            }
          : undefined}
        from={fmtDay(from, { day: 'numeric', month: 'short' })}
        to={fmtDay(to, { day: 'numeric', month: 'short' })}
        formatValue={(v) => nativeValue(shown.key, v)}
        scrubLabel={grainLabel(plotted.grain)}
        annotations={annotationsQuery.rows}
        ariaLabel={valuesLabel}
      />
      {#if compared && !comparedHasReadings}
        <p class="reading-note">{m.stats_compare_empty()}</p>
      {/if}
      <!-- The second scale, offered rather than presented, in one row that
           does not move: the offer and the picker it becomes. -->
      {#if metrics.length > 1 && plotted.points.length}
        <div class="reading-axes">
          <p class="reading-axis">
            {#if comparing || compared}
              <span id="stats-compare">{m.stats_compare_label()}</span>
              <ChartPicker
                key="stats-compare"
                labelledBy="stats-compare"
                value={compareKey}
                options={compareOptions}
                onPick={(value) => {
                  compareKey = value;
                  comparing = value !== '';
                }}
              />
            {:else}
              <button class="reading-compare-add" data-compare-open onclick={() => (comparing = true)}>
                {m.stats_compare_open()}
              </button>
            {/if}
          </p>
        </div>
      {/if}
    {/if}
  </ChartCard>
  {#if valueRows.length}
    <ul class="visually-hidden" data-values-list aria-label={valuesLabel}>
      {#each valueRows as row (row.key)}
        <li>{row.name}: {row.value}{row.note ? `, ${row.note}` : ''}</li>
      {/each}
    </ul>
  {/if}

  <ChartCard heading={m.stats_scales_now()} kind="scales" role={roleAt(activeFlag.roles, CHART_ROLE)}>
    {#if seriesQuery.loading}
      <div out:crossfade><Skeleton variant="line" count={3} /></div>
    {:else if enoughEntries}
      <BarRows rows={scaleRows} measure="track" />
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>
{/if}

<style>
  .reading-note {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .reading-axes {
    display: grid;
    gap: var(--space-1);
    margin-top: var(--space-3);
  }

  .reading-axis {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  /* Widened past the picker's own 52% cap: the other half of this row is
     one word (stats/+page.svelte's own reason, kept with the row). */
  .reading-axis :global(.kit-chart-pick) {
    max-width: 74%;
  }

  .reading-compare-add {
    min-height: var(--touch-target);
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent-ink);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    text-align: left;
    cursor: pointer;
  }
</style>

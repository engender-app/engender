<script lang="ts">
  /* Constellation's tile previews the span with faint points and
     a solid latest point. Detail offers scrub and play (ADR-0048).
     Require two enabled scales and a co-recorded point in the span.
     Draw entries without a mode uncoloured. planeAxes defaults to
     the pair with the most points without storing dimension keys. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { planeAxes, planePartners, plotPoints, type ConstellationPoint } from '$lib/data/constellationData';
  import { nativeValue } from '$lib/data/wrappedDisplay';
  import { readingHref } from '$lib/data/lookBackReadings';
  import type { Span } from '$lib/data/lookBackSpan';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import GenderConstellationChart from '$lib/components/GenderConstellationChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import ReadGate from '$lib/components/kit/ReadGate.svelte';
  import ReadingTile from '$lib/components/kit/ReadingTile.svelte';
  import { joinReadGroup } from '$lib/components/kit/readGroup.svelte';

  let { span, view = 'screen' }: { span: Span; view?: 'tile' | 'screen' } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);

  /* Which pairs of ticked scales have points in the span, so the pickers offer only those
     and the plane opens on the pair with the most. `picked` is what the person chose; the
     axes are that pair while it has points, and planeAxes' fallback otherwise - unticking a
     scale or moving the span lands on a pair that draws rather than on an empty plane. */
  let pairsQuery = liveList((j) => j.stats.constellationPairs(from, to));
  let activeKeys = $derived(vocabulary.activeDimensions.map((d) => d.key));
  let picked = $state({ x: '', y: '' });
  let axes = $derived(planeAxes(pairsQuery.rows, activeKeys, picked));
  let xKey = $derived(axes?.x ?? '');
  let yKey = $derived(axes?.y ?? '');

  let xScale = $derived(vocabulary.activeDimensions.find((d) => d.key === xKey));
  let yScale = $derived(vocabulary.activeDimensions.find((d) => d.key === yKey));
  let canPlot = $derived(xScale !== undefined && yScale !== undefined);
  const optionsOf = (keys: string[]) =>
    vocabulary.activeDimensions.filter((d) => keys.includes(d.key)).map((d) => ({ value: d.key, label: d.name }));
  let xOptions = $derived(optionsOf(planePartners(pairsQuery.rows, activeKeys, null)));
  let yOptions = $derived(optionsOf(planePartners(pairsQuery.rows, activeKeys, xKey)));

  /* Picking for x the scale already on y swaps the two; y only offers
     partners of x, so it never meets x. */
  const pickX = (key: string) => {
    picked = { x: key, y: key === yKey ? xKey : yKey };
  };
  const pickY = (key: string) => {
    picked = { x: xKey, y: key };
  };

  let constellationQuery = liveList((j) => {
    const [x, y] = [xKey, yKey];
    if (!canPlot) return Promise.resolve([]);
    return j.stats.constellationReadings(x, y, from, to);
  });
  /* Whether there is a tile is settled once this answers (ReadGroup). */
  joinReadGroup(() => !pairsQuery.loading && !constellationQuery.loading);
  let readings = $derived(new Map(constellationQuery.rows.map((r) => [r.id, r])));
  let points = $derived(
    xScale && yScale
      ? plotPoints(constellationQuery.rows, { min: xScale.min, max: xScale.max }, { min: yScale.min, max: yScale.max })
      : []
  );
  /* Every mode, hidden ones included: a point logged under a hidden
     presentation keeps its colour. */
  let modes = $derived(
    vocabulary.presentations.map((presentation) => ({
      id: presentation.id,
      name: presentation.name,
      role: roleAt(activeFlag.roles, presentation.roleIndex)
    }))
  );
  const dayLabel = (day: number) => fmtDay(day, { day: 'numeric', month: 'short' });
  const readingLabel = (point: ConstellationPoint) => {
    const raw = readings.get(point.id);
    return m.constellation_reading_aria({
      date: fmtDay(point.day, { weekday: 'long', day: 'numeric', month: 'long' }),
      xName: xScale?.name ?? '',
      x: nativeValue(xKey, raw?.x ?? 0),
      yName: yScale?.name ?? '',
      y: nativeValue(yKey, raw?.y ?? 0)
    });
  };

  const hoverLines = (point: ConstellationPoint) => {
    const raw = readings.get(point.id);
    return [
      fmtDay(point.day, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      m.values_second({ name: xScale?.name ?? '', value: nativeValue(xKey, raw?.x ?? 0) }),
      m.values_second({ name: yScale?.name ?? '', value: nativeValue(yKey, raw?.y ?? 0) })
    ];
  };

  /* The tile's plane: a square, y up as the chart draws it. */
  const PLANE = 100;
  const px = (x: number) => (x * PLANE).toFixed(1);
  const py = (y: number) => ((1 - y) * PLANE).toFixed(1);
  let head = $derived(points[points.length - 1]);
</script>

{#if view === 'tile'}
  {#if canPlot && !constellationQuery.loading && points.length}
    <ReadingTile key="plane" name={m.stats_constellation()} href={readingHref('plane', span)}>
      {#snippet drawing()}
        <svg viewBox="-2 -2 {PLANE + 4} {PLANE + 4}" preserveAspectRatio="xMinYMid meet">
          <path d="M{PLANE / 2} 0V{PLANE}M0 {PLANE / 2}H{PLANE}" stroke="var(--guide)" stroke-width="1" fill="none" vector-effect="non-scaling-stroke" />
          {#each points as point (point.id)}
            <circle cx={px(point.x)} cy={py(point.y)} r="2.5" fill="var(--ink)" opacity="0.55" />
          {/each}
          {#if head}
            <circle cx={px(head.x)} cy={py(head.y)} r="4" fill="var(--ink)" />
          {/if}
        </svg>
      {/snippet}
    </ReadingTile>
  {/if}
{:else}
  <!-- No role on the card: its marks already carry one role each, resolved
       from the mode they were logged under. -->
  <ChartCard level={2} heading={m.stats_constellation()} kind="constellation">
    {#if canPlot && xScale && yScale}
      <ReadGate read={constellationQuery} variant="block" count={1}>
        {#snippet rows()}
          <GenderConstellationChart
            {points}
            {modes}
            x={{ low: xScale.low, high: xScale.high }}
            y={{ low: yScale.low, high: yScale.high }}
            {dayLabel}
            {readingLabel}
            {hoverLines}
            scrubLabel={m.constellation_scrub()}
            ariaLabel={m.constellation_aria({ x: xScale.name, y: yScale.name })}
          />
        {/snippet}
        {#snippet empty()}
          <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
        {/snippet}
      </ReadGate>
      <!-- Under the plot: two controls is one more than a chart card's
           heading line holds. -->
      <div class="reading-axes">
        <p class="reading-axis">
          <span id="constellation-x">{m.constellation_x_label()}</span>
          <ChartPicker
            key="constellation-x"
            labelledBy="constellation-x"
            value={xKey}
            options={xOptions}
            onPick={pickX}
          />
        </p>
        <p class="reading-axis">
          <span id="constellation-y">{m.constellation_y_label()}</span>
          <ChartPicker
            key="constellation-y"
            labelledBy="constellation-y"
            value={yKey}
            options={yOptions}
            onPick={pickY}
          />
        </p>
      </div>
    {:else if activeKeys.length < 2}
      <ChartEmpty>{m.constellation_needs_scales()}</ChartEmpty>
    {:else}
      <ChartEmpty>{m.not_enough_data()}</ChartEmpty>
    {/if}
  </ChartCard>
{/if}

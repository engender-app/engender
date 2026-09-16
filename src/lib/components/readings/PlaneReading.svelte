<script lang="ts">
  /* Two scales at once: the constellation (phase 5 deepening ticket 19,
     ADR-0048), a reading of its own since phase 11 ticket 07. It was the
     deepest thing on the Look back door and sat 510px into the scroll,
     where nobody scrubbed it; on its own screen it opens at the door's span
     with the scrub and the play control it always had.

     Its tile has no figure (Alicja, on the spike: "drop the title - just
     show the small header and a bigger graph"): the reading is the shape,
     so the drawing takes the room a headline would - every point of the
     span faint, the last one solid, on a 1px cross for the two midlines.

     Gated on data and on nothing else: the reading exists once the journal
     holds a presentation, and there is no preference to turn it on. Its
     two axes are the person's own scales, defaulting to the first two they
     have ticked; no dimension key is written here. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay } from '$lib/data/dates';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { plotPoints, type ConstellationPoint } from '$lib/data/constellationData';
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

  let { span, view = 'screen' }: { span: Span; view?: 'tile' | 'screen' } = $props();

  let from = $derived(span.start);
  let to = $derived(span.end);

  let xKey = $state('');
  let yKey = $state('');

  /* Held to the ticked scales: unticking the scale an axis was on drops
     that axis to the first one still ticked. */
  $effect(() => {
    const active = vocabulary.activeDimensions;
    if (active.length < 2) return;
    if (!active.some((d) => d.key === xKey)) xKey = active[0].key;
    if (!active.some((d) => d.key === yKey) || yKey === xKey) {
      yKey = (active.find((d) => d.key !== xKey) ?? active[0]).key;
    }
  });

  let xScale = $derived(vocabulary.activeDimensions.find((d) => d.key === xKey));
  let yScale = $derived(vocabulary.activeDimensions.find((d) => d.key === yKey));
  let hasConstellation = $derived(vocabulary.presentations.length > 0);
  let canPlot = $derived(hasConstellation && xScale !== undefined && yScale !== undefined);

  /* Picking a scale that is already on the other axis swaps the two. */
  const pickX = (key: string) => {
    if (key === yKey) yKey = xKey;
    xKey = key;
  };
  const pickY = (key: string) => {
    if (key === xKey) xKey = yKey;
    yKey = key;
  };

  let constellationQuery = liveList((j) => {
    const [x, y] = [xKey, yKey];
    if (!canPlot) return Promise.resolve([]);
    return j.stats.constellationReadings(x, y, from, to);
  });
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
{:else if hasConstellation}
  <!-- No role on the card: its marks already carry one role each, resolved
       from the mode they were logged under. -->
  <ChartCard heading={m.stats_constellation()} kind="constellation">
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
            options={vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))}
            onPick={pickX}
          />
        </p>
        <p class="reading-axis">
          <span id="constellation-y">{m.constellation_y_label()}</span>
          <ChartPicker
            key="constellation-y"
            labelledBy="constellation-y"
            value={yKey}
            options={vocabulary.activeDimensions.map((d) => ({ value: d.key, label: d.name }))}
            onPick={pickY}
          />
        </p>
      </div>
    {:else}
      <ChartEmpty>{m.constellation_needs_scales()}</ChartEmpty>
    {/if}
  </ChartCard>
{:else}
  <ChartCard heading={m.stats_constellation()} kind="constellation">
    <ChartEmpty>{m.constellation_needs_scales()}</ChartEmpty>
  </ChartCard>
{/if}

<style>
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

  .reading-axis :global(.kit-chart-pick) {
    max-width: 74%;
  }
</style>

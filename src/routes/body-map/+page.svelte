<script lang="ts">
  /* One body region's dysphoria and euphoria over time (phase 5 UX ticket
     23's rebuild) and multi-track somatic breakdown inspector (deepening
     ticket 08).

     Two charts rather than one with two lines on it. The seam answers one
     axis per call and says why (stats.ts, ticket 31): the two are
     independent, a day can carry a euphoria and no dysphoria, so the two
     series have their own days and their own counts and nothing pairs them
     up. Drawn as an overlay they needed a legend to say which line was
     which, and DIRECTION.md's chart rules have no legend in them - the
     heading names the reading instead, one per card, which is also the
     honest shape for two things the screen never adds up.

     Tapping any hotspot on the 2D anatomical map, tapping any region chip,
     or tapping the inspect button opens the multi-track somatic inspector sheet. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { atGrain, type Grain } from '$lib/charts/grain';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN } from '$lib/data/bodyMap';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import BodyRegionInspectorSheet from '$lib/components/BodyRegionInspectorSheet.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  let regions = $derived(vocabulary.visibleBodyRegions);
  let region = $state(vocabulary.visibleBodyRegions[0]?.id ?? '');
  $effect(() => {
    if (regions.length && !regions.some((r) => r.id === region)) region = regions[0].id;
  });
  let regionName = $derived(regions.find((r) => r.id === region)?.name ?? '');

  let inspectorOpen = $state(false);

  function openInspector(regId: string) {
    region = regId;
    inspectorOpen = true;
  }

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let dysphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'dysphoria', from, today));
  let euphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'euphoria', from, today));
  let dysphoria = $derived(dysphoriaQuery.rows);
  let euphoria = $derived(euphoriaQuery.rows);

  let plottedDysphoria = $derived(atGrain(dysphoria.map((p) => ({ x: p.day, y: p.value })), range));
  let plottedEuphoria = $derived(atGrain(euphoria.map((p) => ({ x: p.day, y: p.value })), range));

  /* The chart fits the card, so what changes with the range is the grain
     ($lib/charts/grain): 30 days day by day, a year week by week. */
  const GRAIN_WEEK_SPAN = 6;
  const grainLabel = (grain: Grain) => (point: { x: number }) => {
    const short = { day: 'numeric', month: 'short' } as const;
    if (grain === 'day') return fmtDay(point.x, { weekday: 'short', ...short });
    if (grain === 'month') return fmtDay(point.x, { month: 'long', year: 'numeric' });
    return `${fmtDay(point.x, short)} - ${fmtDay(point.x + GRAIN_WEEK_SPAN, short)}`;
  };

  let rangeEnds = $derived({
    from: fmtDay(from, { day: 'numeric', month: 'short' }),
    to: fmtDay(today, { day: 'numeric', month: 'short' })
  });

  const HOTSPOTS: { region: string; top: number; left: number }[] = [
    { region: 'hairline', top: 7, left: 50 },
    { region: 'face_jaw', top: 15, left: 50 },
    { region: 'voice_throat', top: 24, left: 50 },
    { region: 'shoulders', top: 32, left: 24 },
    { region: 'chest', top: 38, left: 50 },
    { region: 'hips_waist', top: 48, left: 50 },
    { region: 'genitals', top: 57, left: 50 },
    { region: 'hands_feet', top: 88, left: 50 }
  ];
  let visibleHotspots = $derived(
    HOTSPOTS.filter((spot) => regions.some((r) => r.id === spot.region))
  );
</script>

<div class="screen">
  <ScreenHeader title={m.body_map_title()} subtitle={m.body_map_sub()} screen="body-map" back="/stats" />

  {#if regions.length}
    <!-- 2D Anatomical Map with tappable hotspot buttons -->
    <div class="body-map-figure-card" data-body-map-figure>
      <div class="body-map-container" role="group" aria-label={m.body_regions_group()}>
        <svg class="body-map-silhouette" viewBox="0 0 100 200" aria-hidden="true" focusable="false">
          <circle cx="50" cy="16" r="11" />
          <rect x="33" y="29" width="34" height="59" rx="12" />
          <rect x="19" y="34" width="12" height="52" rx="6" />
          <rect x="69" y="34" width="12" height="52" rx="6" />
          <rect x="32" y="82" width="36" height="16" rx="8" />
          <rect x="34" y="94" width="14" height="52" rx="7" />
          <rect x="52" y="94" width="14" height="52" rx="7" />
          <rect x="35" y="144" width="12" height="44" rx="6" />
          <rect x="53" y="144" width="12" height="44" rx="6" />
        </svg>

        {#each visibleHotspots as spot (spot.region)}
          {@const spotName = regions.find((r) => r.id === spot.region)?.name || spot.region}
          <button
            type="button"
            class="body-map-hotspot"
            class:is-active={region === spot.region}
            style="top:{spot.top}%;left:{spot.left}%;"
            aria-label={m.body_region_inspect_aria({ region: spotName })}
            data-region-hotspot={spot.region}
            onclick={() => openInspector(spot.region)}
          ></button>
        {/each}
      </div>

      <!-- Quick region selector tags -->
      <div class="body-map-chips-row" role="group" aria-label={m.body_regions_group()}>
        {#each regions as r (r.id)}
          <button
            type="button"
            class="tag-chip press"
            class:is-selected={r.id === region}
            data-region-chip={r.id}
            onclick={() => openInspector(r.id)}
          >
            {r.name}
          </button>
        {/each}
      </div>
    </div>

    <Segmented
      name={m.stats_range_group()}
      options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
      value={String(range)}
      onChange={(v) => (range = Number(v))}
      compact
      key="body-map-range"
    />

    {#if dysphoriaQuery.loading || euphoriaQuery.loading}
      <Skeleton variant="block" count={2} />
    {:else}
      <ChartCard
        heading={m.body_region_axis_dysphoria()}
        kind="body-dysphoria"
        role={roleAt(activeFlag.roles, 0)}
      >
        {#snippet control()}
          <div class="chart-controls-group">
            <ChartPicker
              key="body-region"
              label={m.body_regions_group()}
              value={region}
              options={regions.map((r) => ({ value: r.id, label: r.name }))}
              onPick={(value) => (region = value)}
            />
            <button
              type="button"
              class="btn btn-soft btn-sm inspector-trigger"
              onclick={() => openInspector(region)}
              aria-label={m.body_region_inspect_aria({ region: regionName })}
              data-open-inspector
            >
              <Icon name="search" size={16} />
              <span>{m.body_region_inspect_button()}</span>
            </button>
          </div>
        {/snippet}
        <AreaChart
          scrubLabel={grainLabel(plottedDysphoria.grain)}
          points={plottedDysphoria.points}
          min={BODY_REGION_INTENSITY_MIN}
          max={BODY_REGION_INTENSITY_MAX}
          from={rangeEnds.from}
          to={rangeEnds.to}
          ariaLabel={m.body_map_chart_aria({
            region: regionName,
            first: m.body_region_axis_dysphoria(),
            second: m.body_region_axis_euphoria()
          })}
        />
      </ChartCard>

      <ChartCard heading={m.body_region_axis_euphoria()} kind="body-euphoria" role={roleAt(activeFlag.roles, 0)}>
        <AreaChart
          scrubLabel={grainLabel(plottedEuphoria.grain)}
          points={plottedEuphoria.points}
          min={BODY_REGION_INTENSITY_MIN}
          max={BODY_REGION_INTENSITY_MAX}
          from={rangeEnds.from}
          to={rangeEnds.to}
          ariaLabel={m.body_map_chart_aria({
            region: regionName,
            first: m.body_region_axis_euphoria(),
            second: m.body_region_axis_dysphoria()
          })}
        />
      </ChartCard>
    {/if}
  {/if}

  <BodyRegionInspectorSheet
    bind:open={inspectorOpen}
    {region}
    onClose={() => (inspectorOpen = false)}
  />
</div>

<style>
  .body-map-figure-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--bg-surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    margin-bottom: var(--space-3);
  }

  .body-map-container {
    position: relative;
    width: 100%;
    max-width: 180px;
    aspect-ratio: 1 / 2;
    margin: 0 auto;
  }

  .body-map-silhouette {
    width: 100%;
    height: 100%;
    fill: var(--bg-surface-2);
    stroke: var(--border-subtle);
    stroke-width: 1.5;
  }

  .body-map-hotspot {
    position: absolute;
    transform: translate(-50%, -50%);
    width: var(--touch-target);
    height: var(--touch-target);
    min-width: 48px;
    min-height: 48px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
  }

  .body-map-hotspot::after {
    content: '';
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: var(--bg-surface-1);
    transition:
      background var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .body-map-hotspot:hover::after {
    transform: scale(1.2);
    background: var(--accent-subtle, var(--bg-surface-2));
  }

  .body-map-hotspot.is-active::after {
    background: var(--accent);
    transform: scale(1.25);
  }

  .body-map-chips-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
  }

  .chart-controls-group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .inspector-trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>

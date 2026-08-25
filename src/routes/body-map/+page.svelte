<script lang="ts">
  /* One body region's dysphoria and euphoria over time (phase 5 UX ticket
     23's rebuild). Linked from the Stats hub's own list.

     Two charts rather than one with two lines on it. The seam answers one
     axis per call and says why (stats.ts, ticket 31): the two are
     independent, a day can carry a euphoria and no dysphoria, so the two
     series have their own days and their own counts and nothing pairs them
     up. Drawn as an overlay they needed a legend to say which line was
     which, and DIRECTION.md's chart rules have no legend in them - the
     heading names the reading instead, one per card, which is also the
     honest shape for two things the screen never adds up.

     The region is the screen's one preference and gets one control, on the
     heading above both charts rather than a picker on each (DIRECTION.md,
     the calendar's own lesson). Ten regions in a segmented control was
     wider than the screen. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { liveQuery } from '$lib/data/live/journal.svelte';
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
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  let regions = $derived(vocabulary.visibleBodyRegions);
  let region = $state(vocabulary.visibleBodyRegions[0]?.id ?? '');
  $effect(() => {
    if (regions.length && !regions.some((r) => r.id === region)) region = regions[0].id;
  });
  let regionName = $derived(regions.find((r) => r.id === region)?.name ?? '');

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let dysphoriaQuery = liveQuery(['entry'], (j) => j.stats.bodyRegionTrend(region, 'dysphoria', from, today));
  let euphoriaQuery = liveQuery(['entry'], (j) => j.stats.bodyRegionTrend(region, 'euphoria', from, today));
  let dysphoria = $derived(dysphoriaQuery.value ?? []);
  let euphoria = $derived(euphoriaQuery.value ?? []);

  const points = (series: { day: number; value: number }[]) => series.map((p) => ({ x: p.day, y: p.value }));
  let rangeEnds = $derived({
    from: fmtDay(from, { day: 'numeric', month: 'short' }),
    to: fmtDay(today, { day: 'numeric', month: 'short' })
  });
</script>

<div class="screen">
  <ScreenHeader title={m.body_map_title()} subtitle={m.body_map_sub()} screen="body-map" back="/stats" />

  {#if regions.length}
    <SectionHeading text={regionName}>
      {#snippet action()}
        <ChartPicker
          key="body-region"
          label={m.body_regions_group()}
          value={region}
          options={regions.map((r) => ({ value: r.id, label: r.name }))}
          onPick={(value) => (region = value)}
        />
      {/snippet}
    </SectionHeading>

    <Segmented
      name={m.stats_range_group()}
      options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
      value={String(range)}
      onChange={(v) => (range = Number(v))}
    />

    {#if dysphoriaQuery.loading || euphoriaQuery.loading}
      <Skeleton variant="block" count={2} />
    {:else}
      <ChartCard
        heading={m.body_region_axis_dysphoria()}
        kind="body-dysphoria"
        role={roleAt(activeFlag.roles, 0)}
      >
        <AreaChart
          points={points(dysphoria)}
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
          points={points(euphoria)}
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
</div>

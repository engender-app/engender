<script lang="ts">
  /* The two tally counters over a switchable range (phase 5 UX ticket 23's
     rebuild). Linked from the Stats hub's own list; the buttons that log a
     tally live in quick add (ticket 18).

     Two charts, never one number. The counters never combine into a score
     (stats.ts, ticket 10) - no ratio, no difference, no direction named as
     progress - and two cards side by side is what that rule looks like on a
     screen. They do share a scale, though: a chart drawn to its own maximum
     would make one day's single tap as tall as another day's five, and the
     two are counts of the same kind of thing. */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let misgenderedQuery = liveQuery(['tally'], (j) => j.stats.tallyTrend('misgendered', from, today));
  let misgendered = $derived(misgenderedQuery.value ?? []);
  let correctlyGenderedQuery = liveQuery(['tally'], (j) => j.stats.tallyTrend('correctly_gendered', from, today));
  let correctlyGendered = $derived(correctlyGenderedQuery.value ?? []);

  let maxCount = $derived(
    Math.max(1, ...misgendered.map((p) => p.value), ...correctlyGendered.map((p) => p.value))
  );

  const points = (series: { day: number; value: number }[]) => series.map((p) => ({ x: p.day, y: p.value }));
  let rangeEnds = $derived({
    from: fmtDay(from, { day: 'numeric', month: 'short' }),
    to: fmtDay(today, { day: 'numeric', month: 'short' })
  });
  // A count is a whole number, whatever the scale's top happens to be.
  const whole = (v: number) => String(Math.round(v));
</script>

<div class="screen">
  <ScreenHeader title={m.tally_trend_title()} subtitle={m.tally_trend_sub()} screen="tally" back="/stats" />

  <Segmented
    name={m.stats_range_group()}
    options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
    value={String(range)}
    onChange={(v) => (range = Number(v))}
  />

  {#if misgenderedQuery.loading || correctlyGenderedQuery.loading}
    <Skeleton variant="block" count={2} />
  {:else}
    <ChartCard heading={m.tally_misgendered()} kind="tally-misgendered" role={roleAt(activeFlag.roles, 0)}>
      <AreaChart
        points={points(misgendered)}
        min={0}
        max={maxCount}
        from={rangeEnds.from}
        to={rangeEnds.to}
        formatValue={whole}
        ariaLabel={m.tally_misgendered()}
      />
    </ChartCard>

    <ChartCard
      heading={m.tally_correctly_gendered()}
      kind="tally-correctly-gendered"
      role={roleAt(activeFlag.roles, 1)}
    >
      <AreaChart
        points={points(correctlyGendered)}
        min={0}
        max={maxCount}
        from={rangeEnds.from}
        to={rangeEnds.to}
        formatValue={whole}
        ariaLabel={m.tally_correctly_gendered()}
      />
    </ChartCard>
  {/if}
</div>

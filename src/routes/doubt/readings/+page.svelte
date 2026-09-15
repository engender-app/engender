<script lang="ts">
  /* What the journal says, read off it (ADR-0040's "statistics that make
     the same point the entry list does in a different register"), lifted
     out of Safe space by phase 10 redesign ticket 47.

     Two tiles and two charts. They were the band a person had to scroll
     past to reach the breathing exercise, which is the whole reason that
     screen was rebuilt; they are worth keeping and they are not what
     somebody opens Safe space to find.

     Nothing here grades a day (ADR-0012), and the count is a count over the
     whole journal rather than a run of consecutive days: a streak is the
     one figure on this screen that could go down, and somebody arriving
     after a fortnight away would have been told their evidence was zero
     (phase 8 UX ticket 01).

     Purely a read (ADR-0037). */
  import { m } from '$lib/paraglide/messages';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { liveList, liveQuery } from '$lib/data/live/journal.svelte';
  import { EUPHORIA_TAG_KEYS } from '$lib/data/vocabulary/builtins';
  import { COUNTEREVIDENCE_LIMIT } from '$lib/data/counterevidence';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { atGrain } from '$lib/charts/grain';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import TileGrid from '$lib/components/kit/TileGrid.svelte';
  import Tile from '$lib/components/kit/Tile.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import BarRows from '$lib/components/kit/BarRows.svelte';
  import type { BarRow } from '$lib/components/kit/barRow';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { flagBarRole, roleAt, tileRoleAt } from '$lib/theme/roles';

  const TIMELINE_DAYS = 30;

  let today = $derived(todayEpochDay());
  let from = $derived(today - TIMELINE_DAYS + 1);

  let counterevidenceQuery = liveList((j) =>
    j.entries.counterevidencePool(EUPHORIA_TAG_KEYS, COUNTEREVIDENCE_LIMIT)
  );
  let counterevidence = $derived(counterevidenceQuery.rows);

  /* How much is written, in total (phase 8 UX ticket 01). A count over the
     whole journal only ever grows. */
  let entryCountQuery = liveQuery((j) => j.entries.countAll());
  let entryCount = $derived(entryCountQuery.value ?? 0);

  let dayAveragesQuery = liveList((j) => j.stats.dayAverages('mood', from, today));
  let rawPoints = $derived(dayAveragesQuery.rows.map((r) => ({ x: r.day, y: r.value })));
  let plotted = $derived(atGrain(rawPoints, TIMELINE_DAYS));

  let affirmingTagRows = $derived.by<BarRow[]>(() => {
    const counts = new Map<string, number>();
    for (const entry of counterevidence) {
      if (entry.tags) {
        for (const t of entry.tags) {
          counts.set(t, (counts.get(t) ?? 0) + 1);
        }
      }
    }
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return sorted.map(([tagId, count]) => ({
      key: tagId,
      name: vocabulary.tag(tagId)?.label ?? tagId,
      value: `${count}×`,
      amount: count
    }));
  });

  /* Three reads behind one gate rather than mounting section by section:
     SQLite resolution cascades across ~350ms, which popped the tiles in
     first and then displaced the charts under them (ticket 113). */
  let loading = $derived(
    counterevidenceQuery.loading || entryCountQuery.loading || dayAveragesQuery.loading
  );
</script>

<div class="screen">
  <ScreenHeader title={m.safe_space_stats_title()} back="/doubt" screen="safe-space-readings" />

  {#if loading}
    <div out:crossfade><Skeleton variant="card" count={2} /></div>
  {:else if entryCount === 0}
    <Notice
      icon="sparkle"
      key="safe-space-readings-empty"
      role={roleAt(activeFlag.roles, 0)}
      title={m.safe_space_readings_empty_title()}
      text={m.safe_space_readings_empty_body()}
    />
  {:else}
    <!-- `tileRoleAt` rather than `roleAt`: a tile is a block of the stripe
         undiluted, and index 1 on agender is its near-black band, which as a
         whole block is the page (phase 10 rule 3). -->
    <TileGrid
      role={tileRoleAt(activeFlag.roles, 1)}
      bar={flagBarRole(activeFlag.roles, tileRoleAt(activeFlag.roles, 1))}
      data-safe-space-stats
      data-tight
    >
      <Tile
        key="written"
        title={m.safe_space_stat_written_title()}
        value={String(entryCount)}
        note={m.safe_space_stat_written_note()}
        href="/calendar"
      />
      <Tile
        key="evidence"
        title={m.safe_space_stat_evidence_title()}
        value={String(counterevidence.length)}
        note={m.safe_space_stat_evidence_note()}
        href="/search/starred"
      />
    </TileGrid>

    <!-- 30-Day Continuity Timeline -->
    <ChartCard
      heading={m.safe_space_chart_timeline_title()}
      kind="timeline"
      role={roleAt(activeFlag.roles, 1)}
    >
      {#if plotted.points.length > 1}
        <AreaChart
          points={plotted.points}
          min={1}
          max={5}
          ariaLabel={m.safe_space_chart_timeline_title()}
          from={fmtDay(from, { day: 'numeric', month: 'short' })}
          to={fmtDay(today, { day: 'numeric', month: 'short' })}
        />
      {:else}
        <ChartEmpty>{m.safe_space_no_themes()}</ChartEmpty>
      {/if}
    </ChartCard>

    <!-- Affirming Themes Breakdown -->
    {#if affirmingTagRows.length > 0}
      <ChartCard
        heading={m.safe_space_chart_themes_title()}
        kind="affirming-themes"
        role={roleAt(activeFlag.roles, 2)}
      >
        <BarRows rows={affirmingTagRows} />
      </ChartCard>
    {/if}
  {/if}
</div>

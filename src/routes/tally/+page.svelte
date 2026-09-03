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
  import { liveList } from '$lib/data/live/journal.svelte';
  import { atGrain, type Grain } from '$lib/charts/grain';
  import { highlightedPositions } from '$lib/charts/presentationHighlight';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import PresentationChipRow from '$lib/components/PresentationChipRow.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());
  let from = $derived(today - range + 1);

  let misgenderedQuery = liveList((j) => j.stats.tallyTrend('misgendered', from, today));
  let misgendered = $derived(misgenderedQuery.rows);
  let correctlyGenderedQuery = liveList((j) => j.stats.tallyTrend('correctly_gendered', from, today));
  /* Both counters take the same annotations: they are two readings of the
     same days, and a thing that happened happened to both of them (ticket
     23). */
  let annotationsQuery = liveList((j) => j.chartAnnotations.getAnnotations(from, today, today));
  let correctlyGendered = $derived(correctlyGenderedQuery.rows);

  let maxCount = $derived(
    Math.max(1, ...misgendered.map((p) => p.value), ...correctlyGendered.map((p) => p.value))
  );

  let plottedMis = $derived(atGrain(misgendered.map((p) => ({ x: p.day, y: p.value })), range));
  let plottedCorrect = $derived(atGrain(correctlyGendered.map((p) => ({ x: p.day, y: p.value })), range));

  /* The presentation chip (ticket 17, ADR-0048): highlights, never
     filters, so both charts above keep drawing exactly what they draw
     today. One day-set query and one role shared by both, since they read
     one chip and one range; each chart maps that set onto its own points
     because the two counters do not necessarily share which days have a
     reading. */
  let selectedPresentation = $state<string | null>(null);
  let presentationDaysQuery = liveList((j) =>
    selectedPresentation ? j.stats.presentationDays(selectedPresentation, from, today) : Promise.resolve([])
  );
  let highlightRole = $derived.by(() => {
    if (!selectedPresentation) return undefined;
    const presentation = vocabulary.presentation(selectedPresentation);
    return presentation ? roleAt(activeFlag.roles, presentation.roleIndex) : undefined;
  });
  // Both charts share one grain (chooseGrain reads only `range`), so the
  // day set maps to chart positions once and each series reads its own hits.
  let highlightedAt = $derived(highlightedPositions(presentationDaysQuery.rows, null, plottedMis.grain));
  let highlightMis = $derived(
    highlightRole ? { at: plottedMis.points.map((p) => highlightedAt.has(p.x)), role: highlightRole } : undefined
  );
  let highlightCorrect = $derived(
    highlightRole ? { at: plottedCorrect.points.map((p) => highlightedAt.has(p.x)), role: highlightRole } : undefined
  );

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
    compact
    key="tally-range"
  />

  <PresentationChipRow value={selectedPresentation} onPick={(id) => (selectedPresentation = id)} />

  {#if misgenderedQuery.loading || correctlyGenderedQuery.loading}
    <Skeleton variant="block" count={2} />
  {:else}
    <ChartCard heading={m.tally_misgendered()} kind="tally-misgendered" role={roleAt(activeFlag.roles, 0)}>
      <AreaChart
        scrubLabel={grainLabel(plottedMis.grain)}
        points={plottedMis.points}
        min={0}
        max={maxCount}
        from={rangeEnds.from}
        to={rangeEnds.to}
        formatValue={whole}
        annotations={annotationsQuery.rows}
        highlight={highlightMis}
        ariaLabel={m.tally_misgendered()}
      />
    </ChartCard>

    <ChartCard
      heading={m.tally_correctly_gendered()}
      kind="tally-correctly-gendered"
      role={roleAt(activeFlag.roles, 0)}
    >
      <AreaChart
        scrubLabel={grainLabel(plottedCorrect.grain)}
        points={plottedCorrect.points}
        min={0}
        max={maxCount}
        from={rangeEnds.from}
        to={rangeEnds.to}
        formatValue={whole}
        annotations={annotationsQuery.rows}
        highlight={highlightCorrect}
        ariaLabel={m.tally_correctly_gendered()}
      />
    </ChartCard>
  {/if}
</div>

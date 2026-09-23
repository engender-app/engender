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
  import type { TallyKind } from '$lib/data/types';
  import { todayEpochDay } from '$lib/data/epochDay';
  import { fmtDay } from '$lib/data/dates';
  import { liveList, liveQuery, journal } from '$lib/data/live/journal.svelte';
  import { atGrain, type Grain } from '$lib/charts/grain';
  import { highlightedPositions } from '$lib/charts/presentationHighlight';
  import { presentationRole } from '$lib/data/vocabulary/entryPresentation';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import { crossfade } from '$lib/motion/reveal';
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
  let highlightRole = $derived(presentationRole(selectedPresentation));
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

  /* The two counters' own actions, beside their own charts (phase 11 ticket
     40): the same two operations quick add's fan runs (journal.tally.log at
     today, no context - CONTEXT: "Tally event"), plus the existing undo,
     which is the flat area's delete. Nothing here combines, edits or
     backdates a count: a tap is logged and never edited, so the only thing
     to reverse is the last tap of that kind, which `latestEvent` names.

     Reading never writes: both actions run from a button's onclick and
     nothing else - the charts, the range switch and the presentation chip
     all stay reads. */
  let misLatestQuery = liveQuery((j) => j.tally.latestEvent('misgendered'));
  let correctLatestQuery = liveQuery((j) => j.tally.latestEvent('correctly_gendered'));

  let announcement = $state('');
  /* The kind with a write in flight. Both of one kind's buttons wait on it,
     so two rapid undos cannot read the same `latestEvent` and spend the
     second on an id the first already deleted - the journal's delete is
     idempotent, so nothing would break, but the second tap would undo
     nothing while saying it did. */
  let busy = $state<TallyKind | null>(null);

  const kindName = (kind: TallyKind) =>
    kind === 'misgendered' ? m.tally_misgendered() : m.tally_correctly_gendered();

  /* The announcement is the changed value, not the fact of a tap: the
     counter's new size over the range on screen, read the same way the
     chart above the buttons reads it. Cleared before the write and set
     after it, which is what makes a second identical action speak again -
     a live region announces a change of text, and setting the same string
     twice is not one (quick add's status region runs the same rule). */
  async function speakCount(kind: TallyKind) {
    const rows = await journal.stats.tallyTrend(kind, from, today);
    const count = rows.reduce((sum, p) => sum + p.value, 0);
    announcement = m.tally_count_spoken({ kind: kindName(kind), count: String(count) });
  }

  async function run(kind: TallyKind, write: () => Promise<unknown>) {
    if (busy) return;
    busy = kind;
    announcement = '';
    try {
      await write();
      await speakCount(kind);
    } catch (error) {
      console.error(`tally: ${kind} was not written`, error);
      announcement = m.quick_add_failed();
    } finally {
      busy = null;
    }
  }

  const logTally = (kind: TallyKind) =>
    void run(kind, () => journal.tally.log({ epochDay: todayEpochDay(), kind }));

  /* Undo is whichever event is that kind's newest - never an id captured
     when the component mounted, so it stays correct across actions from
     quick add or Home while this screen is open: the live query re-reads on
     every tally write, whoever made it. */
  const undoTally = (kind: TallyKind) => {
    const latest = kind === 'misgendered' ? misLatestQuery.value : correctLatestQuery.value;
    if (!latest) return;
    void run(kind, () => journal.tally.deleteEvent(latest.id));
  };

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
    <div out:crossfade><Skeleton variant="block" count={2} /></div>
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

    <!-- This counter's own actions, under this counter's chart: the row sits
         beside the count it changes, so no label has to say which of the two
         it moves. Undo is enabled exactly while that kind has an event to
         remove - a zero count has nothing to undo, and a disabled button is
         how that is shown (.btn:disabled). -->
    <div class="tally-actions">
      <button
        class="btn btn-soft"
        data-tally-log="misgendered"
        disabled={busy === 'misgendered'}
        onclick={() => logTally('misgendered')}
      >
        {m.tally_log_misgendered()}
      </button>
      <button
        class="btn btn-ghost"
        data-tally-undo="misgendered"
        disabled={busy === 'misgendered' || !misLatestQuery.value}
        onclick={() => undoTally('misgendered')}
      >
        {m.tally_undo_misgendered()}
      </button>
    </div>

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

    <div class="tally-actions">
      <button
        class="btn btn-soft"
        data-tally-log="correctly_gendered"
        disabled={busy === 'correctly_gendered'}
        onclick={() => logTally('correctly_gendered')}
      >
        {m.tally_log_correctly_gendered()}
      </button>
      <button
        class="btn btn-ghost"
        data-tally-undo="correctly_gendered"
        disabled={busy === 'correctly_gendered' || !correctLatestQuery.value}
        onclick={() => undoTally('correctly_gendered')}
      >
        {m.tally_undo_correctly_gendered()}
      </button>
    </div>
  {/if}
</div>

<!-- The half of the action a sighted person watches the chart perform. Always
     in the DOM rather than rendered with the outcome, because a live region
     only announces a change of text inside a region that was already there
     (quick add's status region runs the same shape). -->
<p class="visually-hidden" role="status" aria-live="polite" data-tally-status>{announcement}</p>

<style>
  /* Two related actions, one row, and the row wraps rather than squeezing
     when the labels run long in Polish - both buttons keep the 48px floor
     (--touch-target on .btn), so a wrap is the only honest fit at 320px. */
  .tally-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
</style>

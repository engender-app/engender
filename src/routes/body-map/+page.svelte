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

     Redesign ticket 40 turned the figure into the reading. One region could
     be chosen four ways here - a hotspot, a chip, the picker in the first
     chart card's header, and an inspect button beside it - and all four
     opened the inspector sheet, so the map could not be browsed at all:
     every tap left the screen. Now exactly one control selects, a tap only
     says which region the charts describe, and the sheet is one explicit
     row under them. */
  import { m } from '$lib/paraglide/messages';
  import { FIRST_EPOCH_DAY, todayEpochDay } from '$lib/data/epochDay';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { plotDaySeriesGroup, type DayAxis } from '$lib/charts/dayAxis';
  import { PLOT_HEIGHT } from '$lib/charts/geometry';
  import { dayAxisState } from '$lib/components/kit/dayAxis.svelte';
  import {
    dayAxisEnds,
    dayAxisLabel,
    dayAxisOptions,
    dayAxisScrubLabel
  } from '$lib/components/kit/dayAxisLabel';
  import { crossfade, resize } from '$lib/motion/reveal';
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
  import BodyRegionMap from '$lib/components/BodyRegionMap.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import BodyRegionInspectorSheet from '$lib/components/BodyRegionInspectorSheet.svelte';

  const RANGES = [7, 14, 30, 90, 180, 365];
  let range = $state(30);

  /* Undefined is the unfiltered view (ADR-0048, ticket 18) - every entry,
     with and without a presentation, byte for byte what this screen showed
     before the filter existed. There is no "no presentation" option: an
     entry with none already reads back in the unfiltered view like every
     other entry, so it needs no filter of its own to reach. Gated on data
     rather than a preference - the control below is absent, not merely
     unfiltered, for anyone with no presentations. */
  let modeFilter = $state<string | undefined>(undefined);

  let regions = $derived(vocabulary.visibleBodyRegions);
  let region = $state(vocabulary.visibleBodyRegions[0]?.id ?? '');
  $effect(() => {
    if (regions.length && !regions.some((r) => r.id === region)) region = regions[0].id;
  });
  // A presentation hidden mid-session drops out of visiblePresentations
  // (CONTEXT: "Hidden") without deleting anything it was ever logged
  // against - falling back to the unfiltered view rather than silently
  // keeping a filter nothing can any longer select or clear.
  $effect(() => {
    if (modeFilter && !vocabulary.visiblePresentations.some((p) => p.id === modeFilter)) modeFilter = undefined;
  });
  let regionName = $derived(regions.find((r) => r.id === region)?.name ?? '');

  let inspectorOpen = $state(false);

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());

  /* Which axis the two charts are read on (ticket 16). Both take the same
     one: they are one region's two readings and a person switches axis to
     ask a question of the region, not of one of its halves. The queries,
     the fallback and the keying are the kit's (dayAxis.svelte.ts) - the
     wear trend offers the same axis and had the same twenty-five lines. */
  const readAxis = dayAxisState(() => today);

  /* A re-keyed axis reads the whole journal and says so, which is the same
     call the two interval cards on /stats make: the question needs every
     interval and every day either side of a surgery available, and the
     range picker above would otherwise hand it a slice near today that
     answers nothing. So the range control is swapped out rather than left
     to sit there doing nothing. */
  let from = $derived(readAxis.keying ? FIRST_EPOCH_DAY : today - range + 1);

  let dysphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'dysphoria', from, today, modeFilter));
  let euphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'euphoria', from, today, modeFilter));
  /* Both axes of one region over one range, so both take the same
     annotations (ticket 23) - and neither takes any on a re-keyed axis.
     An annotation is a calendar date and a position is not one: several
     calendar days collapse onto one position under the repeating rule, so
     a mark drawn there would claim a coincidence the data does not carry. */
  let annotationsQuery = liveList((j) =>
    readAxis.keying ? Promise.resolve([]) : j.chartAnnotations.getAnnotations(from, today, today)
  );
  let dysphoria = $derived(dysphoriaQuery.rows);
  let euphoria = $derived(euphoriaQuery.rows);

  /* One call for both series, so they fold onto one width and the two
     cards' axes cannot disagree ($lib/charts/dayAxis). */
  let plotted = $derived(plotDaySeriesGroup([dysphoria, euphoria], readAxis.keying, range));
  let plottedDysphoria = $derived(plotted[0]);
  let plottedEuphoria = $derived(plotted[1]);

  let rangeEnds = $derived(dayAxisEnds(plottedDysphoria, from, today));

  /* A screen reader is told which axis a reading is on, and only when it is
     not the one every chart starts on: ", read by Date" on the calendar
     axis would be a phrase appended to every chart on the screen to say
     nothing had changed. */
  let axisName = $derived(dayAxisLabel(readAxis.axis, readAxis.anchors));
  const withAxis = (reading: string) =>
    readAxis.keying ? m.chart_axis_reading_aria({ reading, axis: axisName }) : reading;

  /* The figure's role, which is the two chart cards' own - `/stats` gives
     its charts area index 0 too, so the figure, the two charts here and
     every chart over there are one colour. Under DIRECTION rule 3 a filled
     region is a chart mark, the third of the three places colour may live. */
  let figureRole = $derived(roleAt(activeFlag.roles, 0));

  /* What the figure paints: one reading per region that has any in the
     range, on the side it mostly sat on (stats.ts, bodyMap.ts). The same
     range and the same presentation filter the charts below take, so the
     figure and the charts can never disagree about which entries are in
     view. */
  let mapQuery = liveList((j) => j.stats.bodyRegionMap(from, today, modeFilter));
</script>

<div class="screen">
  <ScreenHeader title={m.body_map_title()} subtitle={m.body_map_sub()} screen="body-map" back="/stats" />

  {#if regions.length}
    <div class="body-map-figure-card" data-body-map-figure>
      <BodyRegionMap
        {regions}
        readings={mapQuery.rows}
        selected={region}
        role={figureRole}
        onSelect={(picked) => (region = picked)}
      />
    </div>

    <!-- The axis sits above the range, because it decides whether there is
         a range to pick. Absent for a journal that can only answer the
         calendar - no dose log with a completed interval in it and no
         procedure with a date - which is the same data gating the mode
         filter below makes. -->
    <div class="kit-reading-controls">
      {#if readAxis.axes.length > 1}
        <div class="kit-filter">
          <label class="kit-filter-label" for="body-map-axis">{m.chart_axis_label()}</label>
          <ChartPicker
            key="body-map-axis"
            id="body-map-axis"
            labelledBy="body-map-axis"
            value={readAxis.axis}
            options={dayAxisOptions(readAxis.axes, readAxis.anchors)}
            onPick={(value) => (readAxis.axis = value as DayAxis)}
          />
        </div>
      {/if}

    <!-- The range control and the whole-journal note share one slot. A
         re-keyed axis reads all history, so the range picker has nothing
         left to say and is swapped out rather than left sitting there
         inert. The swap travels: a pill row and a one-line note are
         different heights, so the slot animates its own resize, and the
         control that is leaving fades off its own footprint instead of
         popping (motion/reveal). -->
      <div class="kit-reading-slot" use:resize>
        {#if readAxis.keying}
          <p class="muted small kit-reading-note" out:crossfade>{m.chart_axis_all_history()}</p>
        {:else}
          <div out:crossfade>
            <Segmented
              name={m.stats_range_group()}
              options={RANGES.map((r) => ({ value: String(r), label: m.range_days({ days: String(r) }) }))}
              value={String(range)}
              onChange={(v) => (range = Number(v))}
              compact
              key="body-map-range"
            />
          </div>
        {/if}
      </div>
    </div>

    {#if vocabulary.visiblePresentations.length > 0}
      <div class="kit-filter">
        <label class="kit-filter-label" for="body-map-mode-filter">{m.presentation_label()}</label>
        <ChartPicker
          key="body-map-mode"
          id="body-map-mode-filter"
          labelledBy="body-map-mode-filter"
          value={modeFilter ?? 'all'}
          options={[
            { value: 'all', label: m.body_map_mode_filter_all() },
            ...vocabulary.visiblePresentations.map((p) => ({ value: p.id, label: p.name }))
          ]}
          onPick={(v) => (modeFilter = v === 'all' ? undefined : v)}
        />
      </div>
    {/if}

    <!-- Which region the two charts below describe. The figure says it in
         colour and this says it in words, which is also the equivalent the
         shapes owe a screen reader beyond their own names. Keyed, so the
         label eases in on a change rather than swapping in place (ticket
         25's ease-in). -->
    {#key region}
      <h2 class="body-map-reading-head" in:crossfade data-body-map-heading>
        {m.body_map_reading_heading({ region: regionName })}
      </h2>
    {/key}

    <!-- The block reserves its height, so picking a region with less data
         cannot shorten the page under the figure and pull the shapes up
         from under the finger that just tapped one. Two cards, each a
         chart at its fixed height plus its own heading and padding. -->
    <div class="body-map-charts" style="--plot-h:{PLOT_HEIGHT}px">
    {#if dysphoriaQuery.loading || euphoriaQuery.loading}
      <Skeleton variant="block" count={2} />
    {:else}
      <ChartCard heading={m.body_region_axis_dysphoria()} kind="body-dysphoria" role={figureRole}>
        {#key region}
        <div in:crossfade>
        <AreaChart
          scrubLabel={dayAxisScrubLabel(plottedDysphoria)}
          points={plottedDysphoria.points}
          min={BODY_REGION_INTENSITY_MIN}
          max={BODY_REGION_INTENSITY_MAX}
          from={rangeEnds.from}
          to={rangeEnds.to}
          annotations={annotationsQuery.rows}
          ariaLabel={withAxis(
            m.body_map_chart_aria({
              region: regionName,
              first: m.body_region_axis_dysphoria(),
              second: m.body_region_axis_euphoria()
            })
          )}
        />
        </div>
        {/key}
      </ChartCard>

      <ChartCard heading={m.body_region_axis_euphoria()} kind="body-euphoria" role={figureRole}>
        {#key region}
        <div in:crossfade>
        <AreaChart
          scrubLabel={dayAxisScrubLabel(plottedEuphoria)}
          points={plottedEuphoria.points}
          min={BODY_REGION_INTENSITY_MIN}
          max={BODY_REGION_INTENSITY_MAX}
          from={rangeEnds.from}
          to={rangeEnds.to}
          annotations={annotationsQuery.rows}
          ariaLabel={withAxis(
            m.body_map_chart_aria({
              region: regionName,
              first: m.body_region_axis_euphoria(),
              second: m.body_region_axis_dysphoria()
            })
          )}
        />
        </div>
        {/key}
      </ChartCard>
    {/if}
    </div>

    <!-- The sheet, behind one explicit row. It used to be what every tap on
         this screen did, which is why the map could not be browsed; it is a
         place to go now rather than the consequence of looking. -->
    <ListCard>
      <ListRow
        title={m.body_map_inspect_row()}
        subtitle={regionName}
        icon="search"
        key="body-region-inspector"
        onclick={() => (inspectorOpen = true)}
      />
    </ListCard>
  {/if}

  <BodyRegionInspectorSheet
    bind:open={inspectorOpen}
    {region}
    presentationId={modeFilter}
    onClose={() => (inspectorOpen = false)}
  />
</div>

<style>
  /* The figure's own card. The shapes are the drawing, so the card gives
     them room and nothing else - no silhouette to sit on, because
     whole_body is the ground now. */
  .body-map-figure-card {
    padding: var(--space-4) var(--space-3);
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    margin-bottom: var(--space-3);
  }

  /* Which region the charts describe. Rule 2's 17px, not a display size:
     the screen's title is the field's, and this is a line under a figure. */
  .body-map-reading-head {
    font-size: var(--text-base);
    font-weight: var(--weight-bold);
    margin: 0 0 var(--space-2);
  }

  /* Reserved, so picking a region with less data cannot shorten the page
     under the figure. Two chart cards at their own fixed height, plus the
     gap between them - the same floor the skeleton stands in while they
     load, which is why the swap into the real charts does not move
     anything either. */
  .body-map-charts {
    /* A chart card is its plot plus its own heading and padding. The plot
       is the kit's own number ($lib/charts/geometry), and the chrome is
       measured once here rather than guessed: kit.css pads the card and
       sets the heading's line box, and both are stated in tokens. */
    --chart-card-chrome: calc(var(--space-5) + var(--space-4) + 1.25em);
    min-height: calc(2 * (var(--plot-h) + var(--chart-card-chrome)) + var(--space-3));
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>

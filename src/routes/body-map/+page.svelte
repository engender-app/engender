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
     row under them.

     Redesign ticket 05 took the screen's own 7d-to-365d range picker off
     it: the only way here is Look back's list, at the same span/query
     shape /wrapped/range already reads (spanRangeQuery), so the range
     picker on this side would only ever disagree with the one the person
     just dragged. A direct visit with no query still gets a window - the
     door's own default of the last thirty days - rather than an empty
     screen. */
  import { page } from '$app/state';
  import { m } from '$lib/paraglide/messages';
  import { epochDayFromDateInputValue, FIRST_EPOCH_DAY, todayEpochDay } from '$lib/data/epochDay';
  import { DEFAULT_SPAN_DAYS } from '$lib/data/lookBackSpan';
  import { liveList } from '$lib/data/live/journal.svelte';
  import { plotDaySeriesGroup, type AxisPlot, type DayAxis } from '$lib/charts/dayAxis';
  import { PLOT_HEIGHT } from '$lib/charts/geometry';
  import { dayAxisState } from '$lib/components/kit/dayAxis.svelte';
  import {
    dayAxisEnds,
    dayAxisLabel,
    dayAxisOptions,
    dayAxisScrubLabel
  } from '$lib/components/kit/dayAxisLabel';
  import { crossfade, resize } from '$lib/motion/reveal';
  import { BODY_REGION_INTENSITY_MAX, BODY_REGION_INTENSITY_MIN, regionSummary } from '$lib/data/bodyMap';
  import { bodyRegionAxisName } from '$lib/data/vocabulary/labels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import BodyRegionMap from '$lib/components/BodyRegionMap.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import BodyRegionInspectorSheet from '$lib/components/BodyRegionInspectorSheet.svelte';

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

  /* The span, reached from Look back (redesign ticket 05) at the same query
     /wrapped/range reads (stats/+page.svelte's spanRangeQuery) - this screen
     only ever wants the two dates out of it. A direct visit with no query,
     or one that fails to parse, falls back to the door's own default
     window: the last DEFAULT_SPAN_DAYS days ending today. */
  let queryFrom = $derived(epochDayFromDateInputValue(page.url.searchParams.get('from') ?? ''));
  let queryTo = $derived(epochDayFromDateInputValue(page.url.searchParams.get('to') ?? ''));
  let hasSpan = $derived(queryFrom !== null && queryTo !== null && queryFrom <= queryTo);
  let spanFrom = $derived(hasSpan ? (queryFrom as number) : today - DEFAULT_SPAN_DAYS + 1);
  let spanTo = $derived(hasSpan ? (queryTo as number) : today);
  let spanDays = $derived(spanTo - spanFrom + 1);

  /* Which axis the two charts are read on (ticket 16). Both take the same
     one: they are one region's two readings and a person switches axis to
     ask a question of the region, not of one of its halves. The queries,
     the fallback and the keying are the kit's (dayAxis.svelte.ts) - the
     wear trend offers the same axis and had the same twenty-five lines. */
  const readAxis = dayAxisState(() => today);

  /* A re-keyed axis reads the whole journal and says so, which is the same
     call Care's own interval folds make: the question needs every interval
     and every day either side of a surgery available, and the span above
     would otherwise hand it a slice that answers nothing. So the note below
     swaps in instead of the span quietly doing nothing. */
  let from = $derived(readAxis.keying ? FIRST_EPOCH_DAY : spanFrom);

  let dysphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'dysphoria', from, spanTo, modeFilter));
  let euphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'euphoria', from, spanTo, modeFilter));
  /* Both axes of one region over one range, so both take the same
     annotations (ticket 23) - and neither takes any on a re-keyed axis.
     An annotation is a calendar date and a position is not one: several
     calendar days collapse onto one position under the repeating rule, so
     a mark drawn there would claim a coincidence the data does not carry. */
  let annotationsQuery = liveList((j) =>
    readAxis.keying ? Promise.resolve([]) : j.chartAnnotations.getAnnotations(from, spanTo, today)
  );
  let dysphoria = $derived(dysphoriaQuery.rows);
  let euphoria = $derived(euphoriaQuery.rows);

  /* One call for both series, so they fold onto one width and the two
     cards' axes cannot disagree ($lib/charts/dayAxis). */
  let plotted = $derived(plotDaySeriesGroup([dysphoria, euphoria], readAxis.keying, spanDays));
  let plottedDysphoria = $derived(plotted[0]);
  let plottedEuphoria = $derived(plotted[1]);

  let rangeEnds = $derived(dayAxisEnds(plottedDysphoria, from, spanTo));

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
  let mapQuery = liveList((j) => j.stats.bodyRegionMap(from, spanTo, modeFilter));

  /* What the figure is saying about the region that is picked, in words
     (phase 11 pre-production UI/UX ticket 30). Before this the screen named
     the pick once, in the heading over the two charts - which is under the
     mode filter and, on a 390px phone, under the fold - so a tap on a panel
     answered with a colour and nothing else, and the name of the thing you
     had just selected was somewhere you had to scroll to find.

     The same reading the panel is painted from, off one answer rather than a
     second pass over the same rows (bodyMap.ts's regionSummary): the fill,
     the accessible name on the button and this sentence can then only ever
     agree. A region the range never mentions is absent from the rows
     entirely, and says so - never a zero, which on this scale is a reading. */
  let selectedSummary = $derived(regionSummary(mapQuery.rows.find((r) => r.region === region)));
  let summaryText = $derived.by(() => {
    if (selectedSummary.kind === 'none') return m.body_map_selected_none();
    const sentence = m.body_map_selected_reading({
      count: selectedSummary.count,
      axis: bodyRegionAxisName(selectedSummary.axis),
      value: String(selectedSummary.value)
    });
    /* The second sentence rather than six more plural variants: whether a
       region went both ways does not inflect with how many readings it
       has. Joined here rather than in the markup, where Svelte eats the
       space in front of an `{#if}`. */
    return selectedSummary.mixed ? `${sentence} ${m.body_map_selected_mixed()}` : sentence;
  });

  /* The way down to the charts, and the way back up. An ordinary same-page
     link, so it is the browser's own anchor and Back is the way back - the
     shape the letters screen's jump to its open letters already uses. The
     span rides in the query and the region is this component's own state, so
     neither is touched by a navigation that only adds a hash; the charts it
     lands on are the ones the sentence above describes.

     The app scrolls its own region rather than the window
     (navigation/scroll-region.ts), so the position the map was read at is
     remembered here and put back when the hash goes. */
  let mapScroll: number | null = null;
  const scrollRegion = () => document.querySelector<HTMLElement>('[data-app-scroll-region]');

  function rememberMapScroll() {
    mapScroll = scrollRegion()?.scrollTop ?? 0;
  }

  $effect(() => {
    const onPop = () => {
      if (location.hash || mapScroll === null) return;
      const el = scrollRegion();
      if (el) el.scrollTop = mapScroll;
      mapScroll = null;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  });
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

      <!-- The pick, in words, on the figure's own card: the name, what the
           range has to say about that region, and the way down to its two
           charts. No hairline over it - the elsewhere cluster above ends on
           one already, and a second line a few pixels under the first reads
           as a mistake rather than as a boundary.

           Keyed on the region, so the words ease in on a pick rather than
           swapping in place, and the sentence's slot travels between its own
           two heights rather than stepping (ticket 25's ease-in, rule 10). -->
      <div class="body-map-selected" data-body-map-context>
        <div class="body-map-selected-line">
          <div class="body-map-selected-name-slot">
            {#key region}
              <h2 class="body-map-selected-name" in:crossfade data-body-map-selected>{regionName}</h2>
            {/key}
          </div>
          <a
            class="kit-heading-action"
            href="#body-map-charts"
            data-body-map-chart-jump
            onclick={rememberMapScroll}
          >
            {m.body_map_chart_jump()}
          </a>
        </div>

        <div class="body-map-selected-slot" use:resize>
          {#if mapQuery.loading}
            <Skeleton variant="line" count={1} />
          {:else}
            {#key region}
              <p class="muted small body-map-selected-summary" in:crossfade data-body-map-summary>
                {summaryText}
              </p>
            {/key}
          {/if}
        </div>
      </div>
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

    <!-- The range picker that used to sit in this slot is gone (redesign
         ticket 05): the screen takes its span from Look back now, the same
         way /compare takes its two. A re-keyed axis still reads all
         history regardless of that span, so the note it says so with keeps
         its own resize and crossfade - what used to swap out for the range
         picker now just leaves. -->
      <div class="kit-reading-slot" use:resize>
        {#if readAxis.keying}
          <p class="muted small kit-reading-note" out:crossfade>{m.chart_axis_all_history()}</p>
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
      <h2
        class="body-map-reading-head"
        id="body-map-charts"
        tabindex="-1"
        in:crossfade
        data-body-map-heading
      >
        {m.body_map_reading_heading({ region: regionName })}
      </h2>
    {/key}

    <!-- One card's series. The two cards differ in which of the two axes
         they draw and in which order the accessible name names them, and in
         nothing else - the crossfade on a region change, the shared ends and
         the annotations are one behaviour and belong in one place, not
         transcribed twice.

         Keyed on the region, so a pick crossfades the series rather than
         re-mounting the chart. -->
    {#snippet series(plottedSeries: AxisPlot, first: string, second: string)}
      {#key region}
        <div in:crossfade>
          <AreaChart
            scrubLabel={dayAxisScrubLabel(plottedSeries)}
            points={plottedSeries.points}
            min={BODY_REGION_INTENSITY_MIN}
            max={BODY_REGION_INTENSITY_MAX}
            from={rangeEnds.from}
            to={rangeEnds.to}
            annotations={annotationsQuery.rows}
            ariaLabel={withAxis(m.body_map_chart_aria({ region: regionName, first, second }))}
          />
        </div>
      {/key}
    {/snippet}

    <!-- The block reserves its height, so picking a region with less data
         cannot shorten the page under the figure and pull the shapes up
         from under the finger that just tapped one. Two cards, each a
         chart at its fixed height plus its own heading and padding. -->
    <div class="body-map-charts" style="--plot-h:{PLOT_HEIGHT}px" use:resize>
    {#if dysphoriaQuery.loading || euphoriaQuery.loading}
      <div out:crossfade><Skeleton variant="block" count={2} /></div>
    {:else}
      <ChartCard heading={m.body_region_axis_dysphoria()} kind="body-dysphoria" role={figureRole}>
        {@render series(
          plottedDysphoria,
          m.body_region_axis_dysphoria(),
          m.body_region_axis_euphoria()
        )}
      </ChartCard>

      <ChartCard heading={m.body_region_axis_euphoria()} kind="body-euphoria" role={figureRole}>
        {@render series(
          plottedEuphoria,
          m.body_region_axis_euphoria(),
          m.body_region_axis_dysphoria()
        )}
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

  /* The pick, in words (ticket 30). Under the drawing rather than beside it:
     at 390px there is no beside, and the card the figure is on is where the
     selection lives. */
  .body-map-selected {
    margin-top: var(--space-3);
  }

  .body-map-selected-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* The name's own box beside the link: a long name wraps inside it rather
     than pushing the link off the card, and the crossfade on a pick happens
     in here rather than against the row. */
  .body-map-selected-name-slot {
    flex: 1;
    min-width: 0;
  }

  /* Rule 2's 17px, the same size as the charts' own heading below: this is a
     line under a figure and not a screen's title. */
  .body-map-selected-name {
    font-size: var(--text-lg);
    font-weight: var(--weight-bold);
    margin: 0;
    overflow-wrap: anywhere;
  }

  .body-map-selected-summary {
    margin: 0;
  }

  /* Two sentences where a region went both ways and one where it did not, so
     the box travels between its heights instead of stepping (motion/reveal's
     `resize`, the same action the axis note above uses). */
  .body-map-selected-slot {
    margin-top: var(--space-1);
  }

  /* Which region the charts describe. Rule 2's 17px, not a display size:
     the screen's title is the field's, and this is a line under a figure. */
  .body-map-reading-head {
    font-size: var(--text-lg);
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
       stated in the tokens kit.css uses for it: the rule between two cards
       and its padding, and the heading's own line box.

       What this reserves is the whole block, not a card, because the two
       cards are not the same height as each other and neither is constant -
       an annotated series carries marks a bare one does not. Measured
       across four regions the block holds at 388px while the cards inside
       it go from 121+232 to 121+142, which is the point: the figure above
       does not move when the region under it changes. */
    --chart-card-chrome: calc(var(--space-5) + var(--space-4) + 1.25em);
    --charts-reserve: calc(2 * (var(--plot-h) + var(--chart-card-chrome)) + var(--space-3));
    min-height: var(--charts-reserve);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  /* The skeleton stands in the same footprint rather than its own. Two of
     the kit's blocks came to 474px against the charts' 388, so the block
     shrank by 86px the moment the data landed - the same jump under the
     figure that reserving the height exists to prevent, arriving by the
     other door.

     Stated as the reserve rather than as 100%: the block's own height is
     auto with a floor, so a percentage on a child of it resolves to auto
     and changes nothing, which is what the first attempt at this did.
     `clip` rather than `hidden`, because `hidden` makes a scroll container
     the browser will then scroll. */
  .body-map-charts :global([data-skeleton]) {
    height: var(--charts-reserve);
    overflow: clip;
  }
</style>

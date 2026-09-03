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
  import { liveList } from '$lib/data/live/journal.svelte';
  import { completedInjectionIntervals } from '$lib/data/intervalMoodPattern';
  import {
    CALENDAR_AXIS,
    availableAxes,
    keyingFor,
    plotDaySeriesGroup,
    type DayAxis
  } from '$lib/charts/dayAxis';
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
  import Icon from '$lib/components/Icon.svelte';
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

  function openInspector(regId: string) {
    region = regId;
    inspectorOpen = true;
  }

  // Same inclusive-range rule as the stats screen (ticket 10): the journal
  // never reads the clock for a domain answer, so `today` is re-derived
  // rather than captured.
  let today = $derived(todayEpochDay());

  /* Which axis the two charts are read on (ticket 16). Both take the same
     one: they are one region's two readings and a person switches axis to
     ask a question of the region, not of one of its halves. */
  let axis = $state<DayAxis>(CALENDAR_AXIS);

  /* All history, whatever the dose log holds, because what is on offer is
     "has this journal ever completed an injection interval" and a 30-day
     window rarely contains one. Procedures are read whole for the same
     reason: a surgery two years back still anchors an axis. */
  let dosesQuery = liveList((j) => j.doses.getDoses(Number.MIN_SAFE_INTEGER, today));
  let proceduresQuery = liveList((j) => j.procedures.getProcedures());

  let intervals = $derived(completedInjectionIntervals(dosesQuery.rows));
  let anchors = $derived(
    proceduresQuery.rows
      .filter((procedure) => procedure.surgeryEpochDay !== null)
      .map((procedure) => ({
        id: procedure.id,
        name: procedure.name,
        surgeryEpochDay: procedure.surgeryEpochDay as number
      }))
  );
  let axes = $derived(availableAxes(intervals, anchors));
  // A procedure deleted or a dose log emptied mid-session takes its axis
  // with it, the same fallback the mode filter above makes: back to the
  // reading this screen started with rather than to an axis nothing can
  // any longer select or clear.
  $effect(() => {
    if (!axes.includes(axis)) axis = CALENDAR_AXIS;
  });
  let keying = $derived(keyingFor(axis, intervals, anchors, today));

  /* A re-keyed axis reads the whole journal and says so, which is the same
     call the two interval cards on /stats make: the question needs every
     interval and every day either side of a surgery available, and the
     range picker above would otherwise hand it a slice near today that
     answers nothing. So the range control is swapped out rather than left
     to sit there doing nothing. */
  let from = $derived(keying ? Number.MIN_SAFE_INTEGER : today - range + 1);

  let dysphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'dysphoria', from, today, modeFilter));
  let euphoriaQuery = liveList((j) => j.stats.bodyRegionTrend(region, 'euphoria', from, today, modeFilter));
  /* Both axes of one region over one range, so both take the same
     annotations (ticket 23) - and neither takes any on a re-keyed axis.
     An annotation is a calendar date and a position is not one: several
     calendar days collapse onto one position under the repeating rule, so
     a mark drawn there would claim a coincidence the data does not carry. */
  let annotationsQuery = liveList((j) =>
    keying ? Promise.resolve([]) : j.chartAnnotations.getAnnotations(from, today, today)
  );
  let dysphoria = $derived(dysphoriaQuery.rows);
  let euphoria = $derived(euphoriaQuery.rows);

  /* One call for both series, so they fold onto one width and the two
     cards' axes cannot disagree ($lib/charts/dayAxis). */
  let plotted = $derived(plotDaySeriesGroup([dysphoria, euphoria], keying, range));
  let plottedDysphoria = $derived(plotted[0]);
  let plottedEuphoria = $derived(plotted[1]);

  let rangeEnds = $derived(dayAxisEnds(plottedDysphoria, from, today));

  /* A screen reader is told which axis a reading is on, and only when it is
     not the one every chart starts on: ", read by Date" on the calendar
     axis would be a phrase appended to every chart on the screen to say
     nothing had changed. */
  let axisName = $derived(dayAxisLabel(axis, anchors));
  const withAxis = (reading: string) =>
    keying ? m.chart_axis_reading_aria({ reading, axis: axisName }) : reading;

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

    <!-- The axis sits above the range, because it decides whether there is
         a range to pick. Absent for a journal that can only answer the
         calendar - no dose log with a completed interval in it and no
         procedure with a date - which is the same data gating the mode
         filter below makes. -->
    {#if axes.length > 1}
      <div class="kit-filter">
        <label class="kit-filter-label" for="body-map-axis">{m.chart_axis_label()}</label>
        <ChartPicker
          key="body-map-axis"
          id="body-map-axis"
          labelledBy="body-map-axis"
          value={axis}
          options={dayAxisOptions(axes, anchors)}
          onPick={(value) => (axis = value as DayAxis)}
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
      {#if keying}
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
      </ChartCard>

      <ChartCard heading={m.body_region_axis_euphoria()} kind="body-euphoria" role={roleAt(activeFlag.roles, 0)}>
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
      </ChartCard>
    {/if}
  {/if}

  <BodyRegionInspectorSheet
    bind:open={inspectorOpen}
    {region}
    presentationId={modeFilter}
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
    background: var(--surface);
    border: 1px solid var(--border);
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
    fill: var(--surface-2);
    stroke: var(--border);
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
    background: var(--surface);
    transition:
      background var(--dur-fast) var(--ease-out),
      transform var(--dur-fast) var(--ease-out);
  }

  .body-map-hotspot:hover::after {
    transform: scale(1.2);
    background: var(--accent-soft);
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

<script lang="ts">
  /* Modelled or illustrative estradiol or testosterone between doses, on
     the surface and chart kits (phase 5 UX ticket 25).

     The marks stay this screen's own. A band drawn from uncertainty samples
     with lab results sitting on top of it is not something the chart kit
     draws, and the alternative - two cards, one per layer - would take away
     the only thing the pair is for. What moves onto the kit is everything
     around them: the card is a chart card, the section headings are the
     kit's, and the fit switch is a list card rather than a `.list-group`
     holding one row.

     What must not move is what the screen says about itself. Every curve
     here is modelled or illustrative and says so - `curve_intro` at the
     top, `curve_legend_band` on the band, `curve_qual_notice` on the
     heading of every illustrative one - and no reading on it is
     interpreted anywhere. */
  /* The hormone curve screen (phase 4 tickets 10 and 11).

     Two rules run through the whole file. Nothing states or implies a target,
     an expected level or a normal one - there is no such number in this app
     to state. And the user's own results are the authority: a fitted curve
     is drawn around them and keeps their own unit (ADR-0026); an unfitted
     qualitative curve carries no results at all, because there is nothing
     honest to overlay them onto (journal/hormoneCurve.ts's `unit`).

     Two kinds of curve share this screen and must not be read as the same
     kind of evidence. Injectable esters get hormoneCurve.ts's fitted band,
     with a published posterior behind every parameter. Everything else gets
     hormoneCurveQualitative.ts's invented rise/plateau/fall shape, with
     nothing behind it but well-known relative pharmacology - its own
     heading, its own permanently-visible notice, a dashed line instead of a
     band, and no result marks on top of it.

     Both arrive in one read (phase 5 audit-deepening ticket 17), and the
     arithmetic that used to stand in this file - the axis maximum, whether
     two unfitted shapes may share a scale, whether a unit may be printed,
     which results belong on which ester's chart - is
     journal/hormoneCurve.ts's, where it has tests. What is left here is
     wording and marks. */

  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { CURVE_ANALYTE, CURVE_UNIT, bandRangeAt, latestBandPoint, type EsterCurve } from '$lib/data/hormoneCurve';
  import type { CurveLabPoint, QualitativeChart, QualitativeSection } from '$lib/data/journal/hormoneCurve';
  import type { InjectableEster } from '$lib/data/hormoneEster';
  import { latestQualitativeValue } from '$lib/data/hormoneCurveQualitative';
  import { curveDrugLabel, esterLabel, qualitativeCurveLabel } from '$lib/data/vocabulary/hormoneCurveLabels';
  import { vocabulary } from '$lib/data/vocabulary/vocabulary';
  import type { AnnotationMark } from '$lib/charts/annotations';
  import { annotationLabel, annotationLine } from '$lib/components/kit/chartAnnotation';
  import { secondaryLabValue } from '$lib/data/labs/units';
  import { labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { fmtDay, intlLocale } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import Icon from '$lib/components/Icon.svelte';
  import ScreenHeader from '$lib/components/ScreenHeader.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ListCard from '$lib/components/kit/ListCard.svelte';
  import ListRow from '$lib/components/kit/ListRow.svelte';
  import Notice from '$lib/components/kit/Notice.svelte';
  import SectionHeading from '$lib/components/kit/SectionHeading.svelte';
  import { crossfade } from '$lib/motion/reveal';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';
  import { roleAt } from '$lib/theme/roles';

  /* Colour that carries a value takes role 0 (DIRECTION.md); the fit switch
     takes the stripe after it. */
  const SECTION_ROLE = { charts: 0, fit: 1 };
  import HormoneBandChart from '$lib/components/HormoneBandChart.svelte';
  import QualitativeCurveChart from '$lib/components/QualitativeCurveChart.svelte';

  const WINDOWS = [30, 90, 180] as const;
  const WINDOW_LABELS = {
    30: m.curve_window_30,
    90: m.curve_window_90,
    180: m.curve_window_180
  };

  let windowDays = $state<(typeof WINDOWS)[number]>(90);
  const today = todayEpochDay();
  let fromEpochDay = $derived(today - windowDays + 1);

  /* One read for the whole screen: both evidence classes, both hormones, the
     results placed against each, and the axes they are drawn on
     (journal/hormoneCurve.ts). It used to be three queries which read the
     dose log three times between them. */
  let curveQuery = liveQuery((j) =>
    j.hormoneCurve.getCurves({
      fromEpochDay: today - windowDays + 1,
      toEpochDay: today,
      fitToOwnLabs: prefs.hormoneCurveFitToOwnLabs
    })
  );
  /* `?? null` and not a bare read: a LiveQuery's value is `T | undefined`
     until its first result lands, and stays undefined if the query errors
     (live/journal.svelte.ts), and the skeleton below covers both. */
  let view = $derived(curveQuery.value ?? null);

  /* What else was logged on the days the window covers (phase 8 features
     ticket 15). Its own read rather than a field on the curve view: the
     curve is arithmetic over the dose log and the lab results, and this is
     five other areas, so folding them together would re-run the whole
     pharmacokinetic fit every time somebody tapped a tally counter. */
  let markerQuery = liveQuery((j) =>
    j.chartAnnotations.getCurveMarkers(today - windowDays + 1, today, today)
  );

  /** A body-region marker travels with the region's id rather than its name,
      because the query is node-tier and a built-in region's words live in
      paraglide (ADR-0016, ADR-0024). This is where they are resolved, and a
      region an import carries that this build has no row for keeps its id
      rather than disappearing. */
  let regionNames = $derived(new Map(vocabulary.bodyRegions.map((region) => [region.id, region.name])));

  let markers = $derived(
    (markerQuery.value ?? []).map((marker) =>
      marker.name !== null && regionNames.has(marker.name)
        ? { ...marker, name: regionNames.get(marker.name) as string }
        : marker
    )
  );

  /** Localized, like every other number this app shows (labContextLabel.ts's
      fmtHours): a Polish reader expects "1 234", not "1,234". Bare
      toLocaleString would follow the browser's locale rather than the one
      chosen in Settings. */
  const round = (value: number): string =>
    new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 0 }).format(value);

  /** The user's own results, in their own unit first and the allowlisted
      conversion second (ADR-0026). Never the other way round. */
  function resultLines(point: CurveLabPoint): { native: string; converted: string | null; context: string } {
    const secondary = secondaryLabValue(point.result.analyte, point.result.value, point.result.unit);
    return {
      native: m.curve_value({ value: String(point.result.value), unit: point.result.unit }),
      converted: secondary ? m.curve_converted({ value: round(secondary.value), unit: secondary.unit }) : null,
      context: [point.result.timing ? labTimingLabel(point.result.timing) : '', point.result.provider.trim()]
        .filter(Boolean)
        .join(' · ')
    };
  }

  /** The band's own reading where the window ends, in the model's unit and
      then converted. The band is the thing being described, so its native
      unit is pg/mL - the unit the parameters were published in. */
  function bandLines(curve: EsterCurve): { native: string; converted: string | null } | null {
    const point = latestBandPoint(curve);
    if (!point) return null;

    const low = secondaryLabValue(CURVE_ANALYTE, point.lower, CURVE_UNIT);
    const high = secondaryLabValue(CURVE_ANALYTE, point.upper, CURVE_UNIT);
    return {
      native: m.curve_range_value({ low: round(point.lower), high: round(point.upper), unit: CURVE_UNIT }),
      converted:
        low && high
          ? m.curve_range_converted({ low: round(low.value), high: round(high.value), unit: low.unit })
          : null
    };
  }

  /** The qualitative curve's own reading at the end of the window, only once
      a fit has given the section a real unit (journal/hormoneCurve.ts: null
      unit means the heights are an invented amplitude and no number may be
      printed beside them). In that hormone's own unit, and converted by
      ADR-0026's allowlist the same way a result of the user's own is: a
      curve's analyte is the drug it models (hormoneDrug.ts). */
  function qualLines(
    section: QualitativeSection,
    chart: QualitativeChart
  ): { native: string; converted: string | null } | null {
    const value = latestQualitativeValue(chart);
    const unit = section.unit;
    if (value === null || unit === null) return null;

    const secondary = secondaryLabValue(section.drug, value, unit);
    return {
      native: m.curve_value({ value: round(value), unit }),
      converted: secondary ? m.curve_converted({ value: round(secondary.value), unit: secondary.unit }) : null
    };
  }

  /* Which result is picked out on which ester's chart, keyed by ester so two
     charts keep their own selection instead of fighting over one index they
     number differently. Tapping the picked result again clears it. */
  let picked = $state<Partial<Record<InjectableEster, number | null>>>({});

  function pickPoint(ester: InjectableEster, index: number) {
    picked = { ...picked, [ester]: picked[ester] === index ? null : index };
  }

  /* Which marker is open, keyed by chart the same way `picked` is - and
     separately from it, because a marker and a result are two different
     things to have tapped and one card can only say one of them at a time.
     Tapping the open marker again closes it. */
  let pickedMarker = $state<Record<string, AnnotationMark | null>>({});

  function pickMarker(chart: string, mark: AnnotationMark) {
    const open = pickedMarker[chart] ?? null;
    pickedMarker = { ...pickedMarker, [chart]: open?.key === mark.key ? null : mark };
    // A marker takes the readout over from a result, rather than the two
    // fighting for the same three lines.
    picked = {};
  }

  /** What one mark is called when a screen reader lands on it. Every
      annotation it gathered, not only the first: a doubled tick that
      announced one of three would be a control lying about what it opens. */
  const markLabel = (mark: AnnotationMark): string => mark.annotations.map(annotationLabel).join('; ');

  function toggleFit(next: boolean) {
    prefs.hormoneCurveFitToOwnLabs = next;
  }
</script>

<!-- The invitation to the dose log, passed only when logging could actually
     produce a curve. Someone whose doses are all on an ester this screen draws
     nothing for has already done the thing it would be asking for, and saying
     so again would put the limit on them rather than on this screen. -->
{#snippet doseLogAction()}
  <a class="btn btn-soft" href="/doses"><span>{m.curve_empty_action()}</span></a>
{/snippet}

<!-- What one mark stands for, and the way out to it (phase 8 features ticket
     15). The link and not the tick is where the tap-through lives: a tick is
     1.5px of ink on a plot that can hold two dozen of them, so a target big
     enough to open a record would swallow its neighbours. The tick answers
     the tap by saying which one it was, and the row below is what a thumb
     actually presses.

     Every annotation the mark gathered gets a row of its own, because a
     doubled tick standing for an injection and a headache on the same day
     leads to two different screens. -->
{#snippet markerReadout(mark: AnnotationMark, close: () => void)}
  <div class="spread">
    <p class="readout-label">{m.curve_marker_heading()}</p>
    <button class="icon-btn" aria-label={m.curve_marker_clear()} onclick={close}>
      <Icon name="x" size={18} />
    </button>
  </div>
  <ul class="marker-list">
    {#each mark.annotations as annotation (annotation.id)}
      <li>
        {#if annotation.href}
          <a class="marker-link" href={annotation.href}>{annotationLine(annotation)}</a>
        {:else}
          <span class="marker-link is-plain">{annotationLine(annotation)}</span>
        {/if}
      </li>
    {/each}
  </ul>
{/snippet}

<div class="screen">
  <ScreenHeader title={m.curve_title()} back="/more" />

  {#if curveQuery.loading || !view}
    <div out:crossfade><Skeleton variant="block" count={2} /></div>
  {:else if view.injectable.charts.length === 0 && view.qualitative.sections.length === 0}
    <!-- One empty state for every way of having no curve at all, across both
         kinds: nothing in the log adds up to either one. -->
    <!-- The invitation to the dose log only when logging could actually produce
         a curve. Someone whose doses are all on an ester this screen draws
         nothing for has already done the thing it would be asking for, and
         saying so again would put the limit on them rather than on this
         screen. -->
    {@const futile = view.dosesNoCurveAnywhere > 0}
    <Notice
      icon="curve"
      key="curve-empty"
      role={roleAt(activeFlag.roles, SECTION_ROLE.charts)}
      title={m.curve_empty_title()}
      text={m.curve_empty_body()}
      action={futile ? undefined : { label: m.curve_empty_action(), primary: true, href: '/doses' }}
    />
    {#if futile}
      <p class="muted small curve-note" data-no-curve-note>
        {m.curve_no_curve_note({ count: String(view.dosesNoCurveAnywhere) })}
      </p>
    {/if}
    {#if view.injectable.dosesWithoutMilligrams > 0}
      <p class="muted small curve-note">
        {m.curve_volume_note({ count: String(view.injectable.dosesWithoutMilligrams) })}
      </p>
    {/if}
    {#if view.labPointsOffAxis > 0}
      <p class="muted small curve-note">{m.curve_off_axis_note({ count: String(view.labPointsOffAxis) })}</p>
    {/if}
    {#if view.qualitative.dosesWithoutMilligrams > 0}
      <p class="muted small curve-note">
        {m.curve_qual_volume_note({ count: String(view.qualitative.dosesWithoutMilligrams) })}
      </p>
    {/if}
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.curve_intro()}</p>

    <Segmented
      name={m.curve_window_label()}
      options={WINDOWS.map((days) => ({ value: String(days), label: WINDOW_LABELS[days]() }))}
      value={String(windowDays)}
      onChange={(value) => (windowDays = Number(value) as (typeof WINDOWS)[number])}
      compact
      key="curve-window"
    />

    {#if view.injectable.charts.length > 0}
      <SectionHeading text={m.curve_injectable_heading()} />
      {#each view.injectable.charts as curve (curve.ester)}
        {@const points = curve.labPoints}
        {@const selected = picked[curve.ester] ?? null}
        {@const openMark = pickedMarker[curve.ester] ?? null}
        <ChartCard
          heading={esterLabel(curve.ester)}
          kind="curve-{curve.ester}"
          role={roleAt(activeFlag.roles, SECTION_ROLE.charts)}
        >
          <HormoneBandChart
            band={curve.band}
            labPoints={points}
            max={view.injectable.axisMax}
            formatValue={round}
            unitLabel={CURVE_UNIT}
            ariaLabel={m.curve_chart_aria({
              ester: esterLabel(curve.ester),
              from: fmtDay(fromEpochDay, { day: 'numeric', month: 'short' }),
              to: fmtDay(today, { day: 'numeric', month: 'short' }),
              count: String(points.length)
            })}
            {selected}
            onSelect={(index) => pickPoint(curve.ester, index)}
            pointLabel={(index) =>
              m.curve_point_aria({
                value: String(points[index].result.value),
                /* Never blank: a result only reaches this chart if its unit
                   converts, so there is no unitless case to substitute for -
                   and substituting CURVE_UNIT would announce a unit nobody
                   logged. */
                unit: points[index].result.unit,
                date: fmtDay(points[index].result.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
              })}
            {markers}
            selectedMarker={openMark?.key ?? null}
            onSelectMarker={(mark) => pickMarker(curve.ester, mark)}
            {markLabel}
          />

          <div class="curve-legend">
            <span class="legend-item"><span class="legend-band"></span>{m.curve_legend_band()}</span>
            <span class="legend-item"><span class="legend-result"></span>{m.curve_legend_results()}</span>
            {#if markers.length > 0}
              <span class="legend-item"><span class="legend-marker"></span>{m.curve_legend_markers()}</span>
            {/if}
          </div>

          <!-- The readout. aria-live because tapping a result changes text
               elsewhere on the screen, which a screen reader would otherwise
               not announce. -->
          <div class="curve-readout" aria-live="polite">
            {#if openMark}
              {@render markerReadout(openMark, () => pickMarker(curve.ester, openMark))}
            {:else if selected !== null && points[selected]}
              {@const lines = resultLines(points[selected])}
              <div class="spread">
                <p class="readout-label">
                  {m.curve_result_at({
                    date: fmtDay(points[selected].result.epochDay, { day: 'numeric', month: 'long', year: 'numeric' })
                  })}
                </p>
                <button class="icon-btn" aria-label={m.curve_point_clear()} onclick={() => pickPoint(curve.ester, selected)}>
                  <Icon name="x" size={18} />
                </button>
              </div>
              <p class="readout-value">{lines.native}</p>
              {#if lines.converted}<p class="muted small">{lines.converted}</p>{/if}
              {#if lines.context}<p class="muted small">{lines.context}</p>{/if}
            {:else}
              {@const lines = bandLines(curve)}
              {#if lines}
                <p class="readout-label">
                  {m.curve_band_at({ date: fmtDay(today, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                </p>
                <p class="readout-value">{lines.native}</p>
                {#if lines.converted}<p class="muted small">{lines.converted}</p>{/if}
              {/if}
            {/if}
          </div>
        </ChartCard>
      {/each}

      <p class="muted small curve-note">{m.curve_band_note()}</p>
    {/if}

    {#if markers.length > 0}
      <p class="muted small curve-note" data-curve-markers-note>{m.curve_markers_note()}</p>
    {/if}

    {#if view.qualitative.sections.length > 0}
      <SectionHeading text={m.curve_qual_heading()} />
      <!-- Keyed by hormone and route together: the same route on the two
           hormones is two cards, and a key of the route alone would collide. -->
      {#each view.qualitative.sections as section (section.drug)}
        {#each section.charts as curve (curve.key)}
          {@const lines = qualLines(section, curve)}
          {@const openMark = pickedMarker[curve.key] ?? null}
          <ChartCard
            heading={qualitativeCurveLabel(curve.key)}
            kind="curve-qual-{curve.key}"
            role={roleAt(activeFlag.roles, SECTION_ROLE.charts)}
          >
            {#snippet control()}
              <!-- On the heading's line, because it is what this heading
                   means: the shape under it is illustrative rather than
                   fitted to a published study. -->
              <span class="qual-notice">{m.curve_qual_notice()}</span>
            {/snippet}

            <QualitativeCurveChart
              points={curve.points}
              max={curve.axisMax}
              formatValue={round}
              unitLabel={section.unit}
              ariaLabel={m.curve_qual_chart_aria({
                curve: qualitativeCurveLabel(curve.key),
                from: fmtDay(fromEpochDay, { day: 'numeric', month: 'short' }),
                to: fmtDay(today, { day: 'numeric', month: 'short' })
              })}
              {markers}
              selectedMarker={openMark?.key ?? null}
              onSelectMarker={(mark) => pickMarker(curve.key, mark)}
              {markLabel}
            />

            <div class="curve-legend">
              <span class="legend-item"><span class="legend-qual-line"></span>{m.curve_qual_legend_line()}</span>
              {#if markers.length > 0}
                <span class="legend-item"><span class="legend-marker"></span>{m.curve_legend_markers()}</span>
              {/if}
            </div>

            <!-- The marker readout takes the card's own readout over while a
                 mark is open, the same way it does on a fitted chart: this
                 one's ordinary content is a single figure for today, and two
                 answers stacked would read as one contradicting itself. -->
            {#if openMark}
              <div class="curve-readout" aria-live="polite">
                {@render markerReadout(openMark, () => pickMarker(curve.key, openMark))}
              </div>
            {:else if lines}
              <div class="curve-readout">
                <p class="readout-label">
                  {m.curve_qual_readout_at({ date: fmtDay(today, { day: 'numeric', month: 'long', year: 'numeric' }) })}
                </p>
                <p class="readout-value">{lines.native}</p>
                {#if lines.converted}<p class="muted small">{lines.converted}</p>{/if}
              </div>
            {/if}
          </ChartCard>
        {/each}
      {/each}

      <p class="muted small curve-note">{m.curve_qual_note()}</p>
    {/if}

    <div class="curve-fit">
      <ListCard role={roleAt(activeFlag.roles, SECTION_ROLE.fit)}>
        <!-- Static rather than an ordinary ListRow: an ordinary one renders
             as a link or a button, and a button wrapping the switch's own
             button is a nested control. Same call ticket 24 made in
             Settings. -->
        <ListRow static data-curve-fit title={m.curve_fit_label()} subtitle={m.curve_fit_hint()}>
          {#snippet trailing()}
            <Switch checked={prefs.hormoneCurveFitToOwnLabs} onChange={toggleFit} label={m.curve_fit_label()} />
          {/snippet}
        </ListRow>
      </ListCard>
    </div>

    {#if prefs.hormoneCurveFitToOwnLabs && view.injectable.charts.length > 0}
      <p class="muted small curve-note" data-fit-status aria-live="polite">
        {#if view.injectable.scaleFactor !== null}
          {m.curve_fit_applied({
            count: String(view.injectable.fitPointCount),
            factor: view.injectable.scaleFactor.toFixed(2)
          })}
        {:else if view.injectable.dosesWithoutMilligrams > 0}
          {m.curve_fit_incomplete()}
        {:else}
          {m.curve_fit_no_points()}
        {/if}
      </p>
    {/if}
    {#if prefs.hormoneCurveFitToOwnLabs}
      <!-- One line per hormone drawn, each naming its own: two hormones are
           fitted separately, against their own analyte and in their own unit,
           so two unlabelled lines would read as one contradicting itself. -->
      {#each view.qualitative.sections as section (section.drug)}
        <p class="muted small curve-note" data-qual-fit-status={section.drug} aria-live="polite">
          {#if section.scaleFactor !== null}
            {m.curve_qual_fit_applied({
              drug: curveDrugLabel(section.drug),
              count: String(section.fitPointCount),
              factor: section.scaleFactor.toFixed(2)
            })}
          {:else if section.dosesWithoutMilligrams > 0}
            {m.curve_qual_fit_incomplete({ drug: curveDrugLabel(section.drug) })}
          {:else}
            {m.curve_qual_fit_no_points({ drug: curveDrugLabel(section.drug) })}
          {/if}
        </p>
      {/each}
    {/if}

    {#if view.injectable.dosesWithoutMilligrams > 0}
      <p class="muted small curve-note">
        {m.curve_volume_note({ count: String(view.injectable.dosesWithoutMilligrams) })}
      </p>
    {/if}
    <!-- One line for both classes: a result's analyte belongs to one hormone,
         so the area counts it once (journal/hormoneCurve.ts) where this screen
         used to print the same estradiol count twice, once per query. -->
    {#if view.labPointsOffAxis > 0}
      <p class="muted small curve-note">{m.curve_off_axis_note({ count: String(view.labPointsOffAxis) })}</p>
    {/if}
    {#if view.injectable.subcutaneousDoses > 0}
      <p class="muted small curve-note">{m.curve_sc_note({ count: String(view.injectable.subcutaneousDoses) })}</p>
    {/if}
    <!-- Also on the populated screen, not only when nothing drew: someone with
         an estradiol curve and undecanoate injections beside it would otherwise
         watch those doses vanish without a word. -->
    {#if view.dosesNoCurveAnywhere > 0}
      <p class="muted small curve-note" data-no-curve-note>
        {m.curve_no_curve_note({ count: String(view.dosesNoCurveAnywhere) })}
      </p>
    {/if}
    {#if view.qualitative.dosesWithoutMilligrams > 0}
      <p class="muted small curve-note">
        {m.curve_qual_volume_note({ count: String(view.qualitative.dosesWithoutMilligrams) })}
      </p>
    {/if}

    <p class="muted small curve-note" data-evidence-note>{m.curve_evidence_note()}</p>
    {#if view.injectable.charts.length > 0}
      <p class="muted small curve-note">{m.curve_source()}</p>
    {/if}
  {/if}
</div>

<style>
  /* Permanently visible, not tucked into a paragraph below the chart: the
     one thing a reader must not miss even glancing at this card alone. */
  .qual-notice {
    font-size: var(--text-xs);
    color: var(--text-2);
    background: color-mix(in oklab, var(--text-2) 14%, transparent);
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .curve-legend {
    display: flex;
    gap: var(--space-4);
    flex-wrap: wrap;
    margin-top: var(--space-3);
    font-size: var(--text-xs);
    color: var(--text-2);
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .legend-band {
    width: 16px;
    height: 10px;
    border-radius: 2px;
    background: color-mix(in oklab, var(--chart-line) 34%, transparent);
    border: 1px solid var(--chart-line);
  }

  .legend-result {
    width: 9px;
    height: 9px;
    background: var(--accent);
  }

  .legend-qual-line {
    width: 16px;
    height: 0;
    border-top: 1.75px dashed var(--text-2);
  }

  .curve-readout {
    margin-top: var(--space-3);
    min-height: 3.5rem;
  }

  /* The mark itself at legend size, not a shape that stands for one: the
     same ink and the same width CurveMarkers.svelte strokes it at. A border
     rather than a background collapsed to a bare rule with no box, because
     a zero-width flex item takes no space to draw the border on. */
  .legend-marker {
    width: 1.25px;
    height: 11px;
    border-radius: 1px;
    background: color-mix(in oklab, var(--text) 30%, transparent);
  }

  /* No margin of its own: the rows are 44px tall and their own leading is
     already the space under the heading, so a gap here put more air below
     the label than above it. */
  .marker-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* Full width and 44px tall, which is the whole reason the tap-through is
     here rather than on the tick. */
  .marker-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    color: var(--accent);
    text-decoration: none;
  }

  /* A marker with no record to open never occurs today - all six kinds carry
     an address - but the shape admits one, and a plain row is what it should
     read as rather than a link that goes nowhere. */
  .marker-link.is-plain {
    color: var(--text);
  }

  .readout-label {
    font-size: var(--text-xs);
    color: var(--text-2);
    margin: 0;
  }

  .readout-value {
    font-size: var(--text-md);
    margin: 2px 0 0;
  }

  .curve-note {
    margin-top: var(--space-3);
  }

  .curve-fit {
    margin-top: var(--space-4);
  }
</style>

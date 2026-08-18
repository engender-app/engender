<script lang="ts">
  /* The hormone curve screen (phase 4 ticket 10).

     Two rules run through the whole file. Nothing states or implies a target,
     an expected level or a normal one - there is no such number in this app
     to state. And the user's own results are the authority: the band is drawn
     around them, they keep the unit they were logged in (ADR-0026), and the
     only thing that ever moves is the band. */

  import { m } from '$lib/paraglide/messages';
  import { liveQuery } from '$lib/data/live/journal.svelte';
  import { prefs } from '$lib/data/prefs/store.svelte';
  import { CURVE_ANALYTE, CURVE_UNIT, bandRangeAt, latestBandPoint, type EsterCurve } from '$lib/data/hormoneCurve';
  import type { CurveLabPoint } from '$lib/data/journal/hormoneCurve';
  import type { InjectableEster } from '$lib/data/hormoneEster';
  import { esterLabel } from '$lib/data/vocabulary/hormoneCurveLabels';
  import { secondaryLabValue } from '$lib/data/labs/units';
  import { labTimingLabel } from '$lib/data/vocabulary/labContextLabel';
  import { fmtDay, intlLocale } from '$lib/data/dates';
  import { todayEpochDay } from '$lib/data/epochDay';
  import Icon from '$lib/components/Icon.svelte';
  import Segmented from '$lib/components/Segmented.svelte';
  import Switch from '$lib/components/Switch.svelte';
  import EmptyState from '$lib/components/EmptyState.svelte';
  import Skeleton from '$lib/components/Skeleton.svelte';
  import HormoneBandChart from '$lib/components/HormoneBandChart.svelte';

  const WINDOWS = [30, 90, 180] as const;
  const WINDOW_LABELS = {
    30: m.curve_window_30,
    90: m.curve_window_90,
    180: m.curve_window_180
  };

  let windowDays = $state<(typeof WINDOWS)[number]>(90);
  const today = todayEpochDay();
  let fromEpochDay = $derived(today - windowDays + 1);

  let curvesQuery = liveQuery(['dose', 'regimen', 'lab'], (j) =>
    j.hormoneCurve.getCurves({
      fromEpochDay: today - windowDays + 1,
      toEpochDay: today,
      fitToOwnLabs: prefs.hormoneCurveFitToOwnLabs
    })
  );
  let view = $derived(curvesQuery.value ?? null);

  /* One scale across every chart on the screen, so two esters drawn one under
     the other can be read against each other. Headroom above the tallest
     thing on it, whether that is the band or one of the user's own results -
     a result clipped off the top would be the one number here that matters
     most going missing. */
  let axisMax = $derived.by(() => {
    if (!view) return 400;
    const tops = [
      ...view.curves.flatMap((curve) => curve.band.map((point) => point.upper)),
      ...view.labPoints.map((point) => point.value)
    ];
    return tops.length ? Math.max(...tops) * 1.1 : 400;
  });

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

  /* Which result is picked out on which ester's chart, keyed by ester so two
     charts keep their own selection instead of fighting over one index they
     number differently. Tapping the picked result again clears it. */
  let picked = $state<Partial<Record<InjectableEster, number | null>>>({});

  function pickPoint(ester: InjectableEster, index: number) {
    picked = { ...picked, [ester]: picked[ester] === index ? null : index };
  }

  /** The results that belong on one ester's chart: those drawn while that
      ester was the one being injected, plus any the dose log cannot attribute
      to an ester at all - those belong to no chart in particular, so they go
      on all of them rather than disappearing. With one ester, that is every
      result either way. */
  function pointsFor(curve: EsterCurve): CurveLabPoint[] {
    if (!view) return [];
    return view.labPoints.filter((point) => point.ester === curve.ester || point.ester === null);
  }

  function toggleFit(next: boolean) {
    prefs.hormoneCurveFitToOwnLabs = next;
  }
</script>

<div class="screen">
  <header class="screen-header">
    <a class="icon-btn" href="/settings" aria-label={m.back()}><Icon name="arrowLeft" /></a>
    <h1 class="screen-title">{m.curve_title()}</h1>
  </header>

  {#if curvesQuery.loading || !view}
    <Skeleton variant="block" count={2} />
  {:else if view.curves.length === 0}
    <!-- One empty state for every way of having no curve, because they are
         all the same answer to the reader: nothing in the log is an ester
         this app draws, in a unit it can read. Saying "no injections logged
         yet" here would have been false for anyone on an ester it does not
         draw, or logging by volume. -->
    <EmptyState title={m.curve_empty_title()} text={m.curve_empty_body()}>
      {#snippet action()}
        <a class="btn btn-soft" href="/doses"><span>{m.curve_empty_action()}</span></a>
      {/snippet}
    </EmptyState>
    {#if view.dosesWithoutMilligrams > 0}
      <p class="muted small curve-note">{m.curve_volume_note({ count: String(view.dosesWithoutMilligrams) })}</p>
    {/if}
  {:else}
    <p class="muted small" style="margin-bottom:var(--space-4)">{m.curve_intro()}</p>

    <div class="field">
      <span class="field-label">{m.curve_window_label()}</span>
      <Segmented
        name={m.curve_window_label()}
        options={WINDOWS.map((days) => ({ value: String(days), label: WINDOW_LABELS[days]() }))}
        value={String(windowDays)}
        onChange={(value) => (windowDays = Number(value) as (typeof WINDOWS)[number])}
      />
    </div>

    {#each view.curves as curve (curve.ester)}
      {@const points = pointsFor(curve)}
      {@const selected = picked[curve.ester] ?? null}
      <div class="card curve-card">
        <h2 class="curve-ester">{esterLabel(curve.ester)}</h2>

        <HormoneBandChart
          band={curve.band}
          labPoints={points}
          max={axisMax}
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
        />

        <div class="curve-legend">
          <span class="legend-item"><span class="legend-band"></span>{m.curve_legend_band()}</span>
          <span class="legend-item"><span class="legend-result"></span>{m.curve_legend_results()}</span>
        </div>

        <!-- The readout. aria-live because tapping a result changes text
             elsewhere on the screen, which a screen reader would otherwise
             not announce. -->
        <div class="curve-readout" aria-live="polite">
          {#if selected !== null && points[selected]}
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

      </div>
    {/each}


    {#if view.curves.length > 0}
      <p class="muted small curve-note">{m.curve_band_note()}</p>

      <div class="list-group curve-fit">
        <div class="list-row">
          <span class="row-text">
            <span class="row-title">{m.curve_fit_label()}</span>
            <span class="row-subtitle">{m.curve_fit_hint()}</span>
          </span>
          <span class="row-trailing">
            <Switch checked={prefs.hormoneCurveFitToOwnLabs} onChange={toggleFit} label={m.curve_fit_label()} />
          </span>
        </div>
      </div>

      {#if prefs.hormoneCurveFitToOwnLabs}
        <p class="muted small curve-note" data-fit-status aria-live="polite">
          {#if view.scaleFactor !== null}
            {m.curve_fit_applied({ count: String(view.fitPointCount), factor: view.scaleFactor.toFixed(2) })}
          {:else if view.dosesWithoutMilligrams > 0}
            {m.curve_fit_incomplete()}
          {:else}
            {m.curve_fit_no_points()}
          {/if}
        </p>
      {/if}
    {/if}

    {#if view.dosesWithoutMilligrams > 0}
      <p class="muted small curve-note">{m.curve_volume_note({ count: String(view.dosesWithoutMilligrams) })}</p>
    {/if}
    {#if view.labPointsOffAxis > 0}
      <p class="muted small curve-note">{m.curve_off_axis_note({ count: String(view.labPointsOffAxis) })}</p>
    {/if}
    {#if view.subcutaneousDoses > 0}
      <p class="muted small curve-note">{m.curve_sc_note({ count: String(view.subcutaneousDoses) })}</p>
    {/if}

    <p class="muted small curve-note">{m.curve_source()}</p>
  {/if}
</div>

<style>
  .curve-card {
    margin-bottom: var(--space-4);
  }

  .curve-ester {
    font-size: var(--text-md);
    margin: 0 0 var(--space-3);
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

  .curve-readout {
    margin-top: var(--space-3);
    min-height: 3.5rem;
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

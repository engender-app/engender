<script lang="ts">
  /* One Own-series figure over every benchmark that can be read together
     (phase 8 features ticket 29, ADR-0060, ADR-0061).

     Six of the seven figures a benchmark reports have no dependable typical
     range, so there is nothing to compare them against but the person's
     own earlier takes. Ticket 27 says that in words on the reference
     screen; this is where the earlier takes actually appear.

     **One card with a picker rather than five cards.** Switching the
     figure is the switch somebody makes most, which is the case
     ChartPicker and the area chart's re-tween were built for - and five
     stacked charts on a 390px column is a screen nobody scrolls to the
     bottom of. The runs' own boundaries do not move when the figure does
     (they come from the passage and the chain, not from the numbers), so
     the plots stay mounted across a switch and the lines travel to the new
     figure instead of being torn down.

     **A break is a gap with a sentence in it.** Where the passage or the
     capture chain changes, the app will not join two takes, and what says
     so is a line of words between two plots rather than a dashed segment
     the reader has to interpret. Every plot is drawn against one scale, so
     a value sits at the same height above and below a break even though
     the two runs are not a line.

     **Two numbers are two plots unless they are two ends of one range.**
     The pitch band's top and bottom belong on one scale and read as a band
     there. The two formants do not: F1 near 620 Hz against F2 near 1740
     would draw F1 as a flat line on one scale, and placing each against
     its own bounds on one plot costs the value gutter (kit/AreaChart's own
     rule - one of two ranges printed beside both lines would have the
     other read against numbers that are not its own). A figure with no
     numbers on it at rest is the thing ticket 09's own rejected strip was:
     "no way to tell what it measures at all". So they get a plot each, and
     each plot keeps its hertz.

     **Nothing here draws a band, a target region or a worse-to-better
     colour**, and no axis is normalised: ADR-0060 is explicit that these
     five figures have no typical range the app may imply, and ADR-0012
     keeps every figure in the unit it was measured in. What the card offers
     instead of a verdict is the way into the reference screen's own
     section for whichever figure is showing. */
  import { m } from '$lib/paraglide/messages';
  import { fmtDay, fmtRangeEnds } from '$lib/data/dates';
  import type { ComponentProps } from 'svelte';
  import type { PaddedRange, SeriesPoint } from '$lib/charts/geometry';
  import {
    ownSeries,
    type BenchmarkForSeries,
    type OwnSeriesRun,
    type SeriesBreak
  } from '$lib/charts/ownSeries';
  import { metricHref, OWN_SERIES_METRICS, type OwnSeriesMetricKey } from '$lib/data/voice/metrics';
  import { metricName } from '$lib/data/voice/metricLabels';
  import AreaChart from '$lib/components/kit/AreaChart.svelte';
  import ChartCard from '$lib/components/kit/ChartCard.svelte';
  import ChartEmpty from '$lib/components/kit/ChartEmpty.svelte';
  import ChartPicker from '$lib/components/kit/ChartPicker.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import type { Role } from '$lib/theme/roles';

  let {
    benchmarks,
    role,
    pairedRole
  }: {
    /** Oldest first, the order the journal reads them in. */
    benchmarks: BenchmarkForSeries[];
    /** The section's own stripe. */
    role?: Role;
    /** A second stripe, for the second line of a two-line figure. Passed in
        rather than derived: the area chart draws an overlay in the role's
        `paired` colour, and a Role has no successor of its own to hand it -
        which stripe comes next is the screen's own question
        (stats/+page.svelte does the same for its compare line). */
    pairedRole?: Role;
  } = $props();

  /* The pitch range opens the card: it is the figure a person reading their
     own history has the most use for, and the two-ended one, so the card
     shows what it can do on arrival. */
  let figure = $state<OwnSeriesMetricKey>('span');

  let series = $derived(ownSeries(benchmarks, figure));
  /* The drawable half, as one object, so the plots read a scale that is
     known not to be null rather than each asking again. Null and an empty
     `runs` are the same state - see ownSeries' own contract - and this is
     the one place that says so. */
  let drawn = $derived(
    series.scale === null
      ? null
      : { runs: series.runs, breaks: series.breaks, scale: series.scale, secondScale: series.secondScale }
  );

  /** How each figure writes a number, in its own units (ADR-0012). The
      places match the figure list a take shows (VoiceFigures.svelte), so
      the same reading is written the same way on both surfaces. */
  const FORMAT: Record<OwnSeriesMetricKey, (value: number) => string> = {
    span: (value) => m.vb_hz({ value: value.toFixed(0) }),
    spread: (value) => m.vb_semitones({ value: value.toFixed(1) }),
    rate: (value) => m.vb_wpm({ value: value.toFixed(0) }),
    resonance: (value) => m.vb_hz({ value: value.toFixed(0) }),
    room: (value) => m.vb_db({ value: value.toFixed(0) }),
    scale: (value) => m.vb_scale_value({ value: value.toFixed(2) })
  };

  /** What the two lines of a two-line figure are called, in the legend and
      in the scrub readout. A figure with one line names nothing: the
      heading and the picker have already said what it is. */
  const LINES: Partial<Record<OwnSeriesMetricKey, { first: string; second: string }>> = {
    span: { first: m.vc_own_span_high(), second: m.vc_own_span_low() },
    resonance: { first: m.vc_own_resonance_first(), second: m.vc_own_resonance_second() }
  };

  const BREAK: Record<SeriesBreak, () => string> = {
    device: m.vc_own_break_device,
    processing: m.vc_own_break_processing,
    unrecorded: m.vc_own_break_unrecorded,
    passage: m.vc_own_break_passage
  };

  let format = $derived(FORMAT[figure]);
  let lines = $derived(LINES[figure]);
  let dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  /** What one plot draws: readings, the scale under them, and the name of
      the line where the figure has more than one. */
  interface Plot {
    points: SeriesPoint[];
    min: number;
    max: number;
    /** Written over the plot where a figure draws a plot per line, and
        absent where the picker above has already named the only one. */
    caption?: string;
    ariaLabel: string;
    /** The legend's name for the first line, only where a second shares
        the plot. */
    name?: string;
    overlay?: ComponentProps<typeof AreaChart>['overlay'];
  }

  /** How a run is drawn: one plot, one plot with two lines on it, or a plot
      per line.

      Built here rather than as three `<AreaChart>` blocks in the markup:
      the seven props they share are the same seven every time, and three
      copies of them is three places a change to the scrub label or the
      formatter can be missed. */
  function plotsOf(run: OwnSeriesRun, scale: PaddedRange, secondScale: PaddedRange | null): Plot[] {
    const label = metricName(figure);
    if (run.second === null || secondScale === null || !lines) {
      return [{ points: run.points, min: scale.min, max: scale.max, ariaLabel: label }];
    }

    const second = run.points.map((point, at) => ({ x: point.x, y: run.second![at] }));
    /* Two ends of one range read as a band on one plot, and the plot keeps
       its value gutter because both lines are placed against the same
       numbers. Two separate measures do not: F1 near 620 Hz against F2
       near 1740 would draw F1 flat on one scale, and placing each against
       its own bounds on one plot costs the gutter altogether
       (kit/AreaChart.svelte), which would leave the card with no hertz on
       it until a finger landed. */
    if (series.secondScaleShared) {
      return [
        {
          points: run.points,
          min: scale.min,
          max: scale.max,
          name: lines.first,
          ariaLabel: label,
          overlay: {
            values: run.second,
            min: secondScale.min,
            max: secondScale.max,
            name: lines.second,
            formatValue: format,
            sharedScale: true,
            role: pairedRole
          }
        }
      ];
    }

    return [
      { points: run.points, min: scale.min, max: scale.max, caption: lines.first, ariaLabel: `${label}: ${lines.first}` },
      {
        points: second,
        min: secondScale.min,
        max: secondScale.max,
        caption: lines.second,
        ariaLabel: `${label}: ${lines.second}`
      }
    ];
  }
</script>

<ChartCard heading={m.vc_own_heading()} kind="voice-own-series" {role}>
  {#snippet control()}
    <ChartPicker
      key="voice-own-figure"
      label={m.vc_own_heading()}
      value={figure}
      options={OWN_SERIES_METRICS.map((metric) => ({ value: metric.key, label: metricName(metric.key) }))}
      onPick={(picked) => (figure = picked as OwnSeriesMetricKey)}
    />
  {/snippet}

  {#if drawn}
    {#each drawn.runs as run, i (i)}
      {#if i > 0}
        <!-- The reason the line stopped, between the two runs it is about.
             Not a dotted join and not a silent one: a person who changed
             phone has lost the comparison, and the only honest thing the
             card can do is say which of the two things changed. -->
        <p class="vos-break" data-own-break={drawn.breaks[i - 1]}>{BREAK[drawn.breaks[i - 1]]()}</p>
      {/if}
      {@const ends = fmtRangeEnds(run.points[0].x, run.points[run.points.length - 1].x)}
      {#if !run.points.some((point) => point.y !== null)}
        <!-- A run whose takes all skipped the held vowel: the resonances
             and the room reading come off it, so the run has positions and
             no readings. Said in this figure's own words rather than
             through the chart's generic "not enough data", which is what a
             plot with nothing on it would print. One line checked, not
             two: a take measures both formants or neither. -->
        <p class="vos-unmeasured">{m.vb_not_measured()}</p>
      {:else}
        <!-- Keyed by position rather than by what it draws: switching to
             another figure with the same number of plots then re-tweens the
             lines that are already up instead of tearing them down. -->
        {#each plotsOf(run, drawn.scale, drawn.secondScale) as plot, line (line)}
          {#if plot.caption}<p class="vos-line">{plot.caption}</p>{/if}
          <AreaChart
            points={plot.points}
            min={plot.min}
            max={plot.max}
            from={ends.from}
            to={ends.to}
            formatValue={format}
            scrubLabel={(point) => dayLabel(point.x)}
            name={plot.name}
            ariaLabel={plot.ariaLabel}
            overlay={plot.overlay}
          />
        {/each}
      {/if}
    {/each}

    <!-- The way in, once, at the foot of the card: the figure showing has
         no band on it, and ADR-0060's own instruction is that a missing
         band nobody explains reads as an omission. Straight into that
         figure's own section rather than the top of the screen, which is
         what the per-figure anchors are for. -->
    <p class="vos-more">
      <a href={metricHref(figure)}>
        <span>{m.vm_title()}</span>
        <Icon name="chevronRight" size={16} />
      </a>
    </p>
  {:else if series.readings === 0}
    <!-- Different from "one take so far": the resonances and the room
         reading come off the held vowel, and a person who has skipped that
         step every time has no readings at all rather than too few. -->
    <ChartEmpty>{m.vc_own_never_measured()}</ChartEmpty>
  {:else}
    <ChartEmpty>{m.vc_trend_too_little()}</ChartEmpty>
  {/if}
</ChartCard>

<style>
  /* The break. Its own rule across the card rather than a gap, because a
     gap is what a reader interprets: the words are the mark, and the rule
     under them is only there to say where the two runs part. In --muted
     and at the small size, so it reads as the card telling you what it did
     not do rather than as a reading of its own. */
  .vos-break {
    margin: var(--space-4) 0 var(--space-3);
    padding-top: var(--space-3);
    border-top: 1px solid var(--hairline);
    color: var(--muted);
    font-size: var(--text-sm);
  }

  /* Which line a plot is, where a figure draws two of them on two scales.
     Quiet and small: the picker above has already said what the figure is,
     and this only says which half of it. */
  .vos-line {
    margin: var(--space-3) 0 var(--space-1);
    color: var(--muted);
    font-size: var(--text-sm);
  }

  /* A run with no reading of this figure, where its plot would be. The
     chart body's own text colour and size, so the card holds its shape
     rather than collapsing around a missing plot. */
  .vos-unmeasured {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
  }

  /* The same quiet line the figure list carries under a take
     (VoiceFigures.svelte's .vf-more), at the app's touch floor, with the
     chevron saying it leads somewhere. */
  .vos-more {
    margin: var(--space-3) 0 0;
  }

  .vos-more a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    color: var(--role-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }

  .vos-more a:hover span {
    text-decoration: underline;
    text-decoration-color: var(--role-mark);
    text-underline-offset: 3px;
  }
</style>

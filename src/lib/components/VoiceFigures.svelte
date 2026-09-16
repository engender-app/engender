<script lang="ts">
  /* What a take measured, and what each figure is measured against (phase 8
     features ticket 27, ADR-0060; redesign ticket 42).

     It was one definition list: seven names on the left, seven numbers on
     the right, one weight. That layout made a claim and the claim was
     false - it said the seven are the same kind of fact, and CONTEXT.md
     says they are two.

     **Pitch is the one figure that can be read against the world**, so it
     is the one that looks different: a block of the area's stripe with its
     value on it (rule 3), which is the tier split made visible in surface
     rather than explained in prose afterwards. Its own note sits in a foot
     of page colour along the bottom edge, because small text is what no
     band can carry.

     **The other six mean nothing on their own.** "+1.4 semitones" is not a
     fact about anybody until it is a fact about the same person's earlier
     takes, which is the only reference those figures have, and until this
     ticket the screen did not draw it. Each one is now a block: the name,
     the value, the person's own history under it with a ring on this take,
     and one line saying what that history is. The runs come from
     charts/ownSeries.ts, so a change of passage or of microphone breaks
     these lines exactly where it breaks the compare tab's (ADR-0061) - two
     surfaces cannot disagree about which takes go together.

     **One link at the foot rather than a sentence under each figure**, still
     Alicja's call from 2026-09-04: the sentences under the blocks say what a
     line is against, which is a fact about this screen, and never what a
     figure means, which is the reference screen's (ADR-0060 - it may teach,
     the figures may not instruct).

     Its own component rather than markup in the flow for the ordinary
     reason - the flow owns a microphone, a multi-step take and a quality
     gate, and none of that is needed to state these numbers - and for one
     specific one: the figure names come off the same registry keys the
     reference screen builds its sections from (data/voice/metrics.ts), so
     a name cannot be renamed on one surface and not the other.

     Nothing here reads anything into a voice (PRODUCT.md:109, ADR-0012). A
     number, its unit, what it is measured against, and where to go to find
     out what it is.

     Motion: tier 3. A history line draws in from the left ahead of its
     value, which is the direction time runs in every other chart in the app
     (rule 10); the values do not count up, because a count-up is for a
     count and hertz, decibels, semitones and a scaling factor are
     measurements. */
  import { m } from '$lib/paraglide/messages';
  import Icon from '$lib/components/Icon.svelte';
  import type { PassageFigures } from '$lib/audio/benchmark';
  import { noteName } from '$lib/audio/pitch';
  import type { Formants } from '$lib/audio/resonance';
  import { ownSeries, type BenchmarkForSeries } from '$lib/charts/ownSeries';
  import {
    metricHref,
    OWN_SERIES_METRICS,
    type OwnSeriesMetricKey
  } from '$lib/data/voice/metrics';
  import { metricName } from '$lib/data/voice/metricLabels';
  import { roleAttrs } from '$lib/components/kit/role';
  import type { Role } from '$lib/theme/roles';
  import { wipe } from '$lib/motion/reveal';

  let {
    figures,
    formants,
    snrDb,
    resonanceScale,
    series,
    role
  }: {
    figures: PassageFigures;
    /** Null where the vowel step was skipped or measured nothing, which a
        take can be while still clearing the gate. */
    formants: Formants | null;
    /** Null where there was no vowel take to measure the room from. */
    snrDb: number | null;
    /** The corner-vowel scaling factor (audio/vowelScale.ts, ticket 30).
        Null under two usable held vowels, the same as a benchmark that
        skipped them or held only "ah". */
    resonanceScale: number | null;
    /** Every take this screen may draw a history from, oldest first, with
        *this* take last - saved or not, since a summary is shown before the
        save and the reading it is about is the one the ring sits on.

        The whole history rather than the drawable part of it: which takes
        may be joined is `ownSeries`' question, not this component's, and
        answering it here would be a second copy of ADR-0061's rule. */
    series: readonly BenchmarkForSeries[];
    /** The area's own stripe. It is what the pitch block is filled with and
        what the history lines are drawn in. */
    role?: Role;
  } = $props();

  /** A figure as the screen states it: a fixed number of places, as text.
      Named for what it produces rather than for rounding, which is what it
      does on the way. */
  const figure = (value: number, places = 0) => value.toFixed(places);

  /** Each own-series figure's value on this take, or null where this take
      did not measure it. The same six keys the registry has, so a seventh
      figure with no value here does not compile. */
  let values = $derived<Record<OwnSeriesMetricKey, string | null>>({
    span: m.vb_hz_range({ low: figure(figures.f0P10Hz), high: figure(figures.f0P90Hz) }),
    spread: m.vb_semitones({ value: figure(figures.semitoneSd, 1) }),
    rate: m.vb_wpm({ value: figure(figures.wordsPerMinute) }),
    resonance: formants
      ? `${m.vb_hz({ value: figure(formants.f1Hz) })} · ${m.vb_hz({ value: figure(formants.f2Hz) })}`
      : null,
    room: snrDb === null ? null : m.vb_db({ value: figure(snrDb) }),
    scale: resonanceScale === null ? null : m.vb_scale_value({ value: figure(resonanceScale, 2) })
  });

  /* The history line's own box, in its own units. Stretched to the block's
     width, so the polyline carries non-scaling strokes and the ring is an
     HTML element placed over it rather than a circle in here - a circle in
     a box scaled this way is an ellipse (kit/AreaChart.svelte's own note on
     the same trap). */
  const SPARK_HEIGHT = 30;

  /** Half the ring's own width, which is the room the plot gives up at each
      end so the ring on the last reading is not cut in half by the block's
      edge. */
  const RING = '7px';

  interface Line {
    /** One polyline per unbroken stretch: a figure a take did not measure
        is a gap in the line, not a break in the series. */
    runs: string[];
    /** The second line, where the figure is two ends of one range. Absent
        where the figure's two numbers are two measures - F1 near 620 Hz
        against F2 near 1740 on one box would draw F1 flat, which is the
        same reason `ownSeries` gives those two their own scales. */
    second: string[] | null;
    /** Where this take sits on the line, as percentages, or null where this
        take did not measure the figure. */
    ring: { x: number; y: number } | null;
    /** How many takes this line draws. */
    readings: number;
  }

  /** What a figure has behind it. A line where there is one, and otherwise
      which of the two reasons there is not: no earlier take at all, or none
      this one may be joined to (ADR-0061). The two are different sentences
      because they are different facts, and an empty plot would be neither. */
  type History = Line | { none: 'first' | 'passage' | 'setup' | 'unread' };

  /** This figure's history: the run the current take belongs to, placed on
      the scale every run of it shares.

      Null where there is no line to draw - a first benchmark, or the first
      take on a new microphone. Those get a sentence rather than an empty
      plot, for the reason a trackless take gets one: an empty figure looks
      like a take with nothing in it. */
  function historyOf(key: OwnSeriesMetricKey): History {
    const computed = ownSeries(series, key);
    const scale = computed.scale;
    const lastBreak = computed.breaks[computed.breaks.length - 1];
    /* Which sentence a figure with no line gets. A passage change and a
       change of equipment are the app's two reasons for refusing to join
       two takes, and they are not the same sentence as having no earlier
       take at all. */
    const nothing = (joinable: boolean): History => ({
      none: joinable
        ? 'unread'
        : computed.breaks.length === 0
          ? 'first'
          : lastBreak === 'passage'
            ? 'passage'
            : 'setup'
    });
    const run = computed.runs[computed.runs.length - 1];
    /* Takes this one may be joined to, but not readings of this figure in
       them: a vowel step skipped every time, or a rate no reader could have
       reached and which `ownSeries` drops rather than draws (ticket 41).
       That is a different sentence from having no earlier take. */
    if (scale === null || computed.runs.length === 0) {
      return nothing(series.length > 1 && computed.breaks.length === 0);
    }

    const readings = run.points.filter((point) => point.y !== null).length;
    if (readings < 2) return nothing(run.points.length > 1);

    /* Placed by the day each take was recorded, so two months apart and two
       days apart do not look the same - except where every take in the run
       landed on one day, which is two benchmarks in one sitting and would
       otherwise collapse the whole line onto one x. */
    const first = run.points[0].x;
    const last = run.points[run.points.length - 1].x;
    const at =
      last === first
        ? (_x: number, index: number) => (index / (run.points.length - 1)) * 100
        : (x: number, _index: number) => ((x - first) / (last - first)) * 100;
    const height = (value: number) =>
      scale.max === scale.min
        ? SPARK_HEIGHT / 2
        : (1 - (value - scale.min) / (scale.max - scale.min)) * SPARK_HEIGHT;

    const draw = (samples: readonly (number | null)[]): string[] => {
      const segments: string[] = [];
      let current: string[] = [];
      samples.forEach((value, index) => {
        if (value === null) {
          if (current.length > 1) segments.push(current.join(' '));
          current = [];
          return;
        }
        current.push(`${at(run.points[index].x, index).toFixed(1)},${height(value).toFixed(1)}`);
      });
      if (current.length > 1) segments.push(current.join(' '));
      return segments;
    };

    const here = run.points[run.points.length - 1].y;
    return {
      runs: draw(run.points.map((point) => point.y)),
      /* Only where the two lines are the two ends of one range, which is
         the same test `ownSeries` applies before it will put two lines on
         one plot. */
      second: computed.secondScaleShared && run.second ? draw(run.second) : null,
      ring:
        here === null
          ? null
          : { x: at(last, run.points.length - 1), y: (height(here) / SPARK_HEIGHT) * 100 },
      readings
    };
  }

  let lines = $derived(
    Object.fromEntries(OWN_SERIES_METRICS.map((metric) => [metric.key, historyOf(metric.key)])) as
      Record<OwnSeriesMetricKey, History>
  );

  /* A genuine first take has the same sentence to make six times, and six
     copies of one sentence is noise rather than six facts. So it is said
     once under the group there, and per block only where the blocks differ
     - which is what happens as soon as one figure has a history and
     another does not. */
  let allFirst = $derived(
    OWN_SERIES_METRICS.every((metric) => {
      const line = lines[metric.key];
      return !('runs' in line) && line.none === 'first';
    })
  );

  /** What a figure with no line says. */
  const NOTHING = {
    first: m.vb_history_first,
    passage: m.vb_history_other_passage,
    setup: m.vb_history_other_setup,
    unread: m.vb_history_unread
  };
</script>

<div class="vf" data-vb-figures {...roleAttrs(role)}>
  <!-- The one figure with a published range behind it, and so the one
       figure that gets a block (rule 3). Its note is the musical note of
       the median, which is a readout and not a second reading, so it sits
       in the foot rather than on the stripe. -->
  <div class="vf-pitch" data-figure="pitch">
    <div class="vf-pitch-block">
      <p class="vf-pitch-name">{metricName('pitch')}</p>
      <p class="vf-pitch-value">{m.vb_hz({ value: figure(figures.f0MedianHz) })}</p>
    </div>
    <p class="vf-pitch-foot">{noteName(figures.f0MedianHz)}</p>
  </div>

  <div class="vf-grid">
    {#each OWN_SERIES_METRICS as metric (metric.key)}
      {@const line = lines[metric.key]}
      {@const value = values[metric.key]}
      <div class="vf-block" data-figure={metric.key}>
        <p class="vf-name">{metricName(metric.key)}</p>
        <p class="vf-value" class:is-absent={value === null}>{value ?? m.vb_not_measured()}</p>

        {#if 'runs' in line}
          <div class="vf-line" in:wipe|global={{ authored: true }}>
            <svg viewBox="0 0 100 {SPARK_HEIGHT}" preserveAspectRatio="none" aria-hidden="true">
              {#each line.runs as points, at (at)}
                <polyline class="vf-run" {points} vector-effect="non-scaling-stroke" />
              {/each}
              {#each line.second ?? [] as points, at (at)}
                <polyline class="vf-run is-second" {points} vector-effect="non-scaling-stroke" />
              {/each}
            </svg>
            {#if line.ring}
              <!-- Placed against the plot rather than against the box: a
                   percentage `left` resolves on the padding box, so a ring
                   at 100% would sit half outside the block the padding was
                   added to keep it inside. -->
              <span
                class="vf-ring"
                style="left: calc({RING} + (100% - {RING} * 2) * {(line.ring.x / 100).toFixed(4)}); top: {line.ring.y}%"
              ></span>
            {/if}
          </div>
          <p class="vf-against">{m.vb_history_run({ count: line.readings })}</p>
        {:else if !allFirst}
          <!-- Not an empty plot: the first take on a new microphone, or of
               another passage, has nothing behind it and says so. -->
          <p class="vf-against">{NOTHING[line.none]()}</p>
        {/if}
      </div>
    {/each}
  </div>

  {#if allFirst}
    <p class="vf-against vf-against-all">{m.vb_history_first()}</p>
  {/if}
</div>

<!-- The one way in. Outside the figures rather than as a last block of
     them: it is not a figure, and this is where ticket 27 put it. Its own
     words are the sheet's title, so the link says where it goes without a
     second string to keep in step. Opens on pitch (`metricHref`'s own
     lead figure) rather than the bare screen with nothing open, since
     ticket 17 folded the reference into a sheet a link has to name a
     section to open at all. -->
<p class="vf-more" {...roleAttrs(role)}>
  <a href={metricHref('pitch')}>
    <span>{m.vm_title()}</span>
    <Icon name="chevronRight" size={16} />
  </a>
</p>

<style>
  .vf {
    display: grid;
    gap: var(--space-5);
  }

  /* Rule 3's block behind a value: the stripe at its exact hex, its ink
     chosen against that hex, and the foot in page colour under it. The edge
     is drawn inside so a black block on a dark page still has one. */
  .vf-pitch-block {
    padding: var(--space-4);
    border: 1px solid var(--outline);
    border-radius: var(--r-block) var(--r-block) 0 0;
    background: var(--role-draw);
    color: var(--role-fill-ink);
  }

  .vf-pitch-name {
    margin: 0;
    font-size: 19px;
    font-weight: var(--weight-bold);
  }

  .vf-pitch-value {
    margin: var(--space-1) 0 0;
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  /* The foot spans the block's whole width, which is the rule whatever
     shape the block is. Small text lives here and nowhere on the stripe. */
  .vf-pitch-foot {
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--outline);
    border-top: 0;
    border-radius: 0 0 var(--r-block) var(--r-block);
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    font-variant-numeric: tabular-nums;
  }

  /* Two columns where there is room for two, one where there is not. At the
     390px floor that is one: a block carries a value, a line and a sentence,
     and half of 390 is not a column those three fit in. */
  .vf-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-5) var(--space-4);
  }

  /* Rule 10: a block arrives by uncovering rather than by fading from
     nothing, and the six take their turn in order. The same clip and the
     same step the kit's tiles use (kit.css's `kit-block-in`), so a figure
     block and a live tile arrive the same way; the duration clamp turns
     both into a cut under reduced motion. */
  .vf-block {
    animation: kit-block-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--figure-index, 0) * var(--stagger-step));
  }

  .vf-grid > :nth-child(2) { --figure-index: 1; }
  .vf-grid > :nth-child(3) { --figure-index: 2; }
  .vf-grid > :nth-child(4) { --figure-index: 3; }
  .vf-grid > :nth-child(5) { --figure-index: 4; }
  .vf-grid > :nth-child(6) { --figure-index: 5; }

  .vf-name {
    margin: 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .vf-value {
    margin: var(--space-1) 0 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-display);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .vf-value.is-absent {
    font-family: inherit;
    font-size: var(--text-base);
    font-weight: var(--weight-regular);
    letter-spacing: normal;
    color: var(--muted);
  }

  /* The ring sits on the last reading, which is the right edge of the plot,
     so the box carries its own radius as padding either side - otherwise
     half the ring is outside the block and the crop cuts it. */
  .vf-line {
    position: relative;
    margin-top: var(--space-2);
    height: 30px;
    /* The same 7px the ring is placed against - see RING in the script. */
    padding: 0 7px;
  }

  .vf-line svg {
    display: block;
    width: 100%;
    height: 100%;
    /* The ring sits on the last reading, which is the right edge, so the
       box keeps its own radius out of the way of it. */
    overflow: visible;
  }

  /* Rule 9: a series is 2px, square ends, mitred joins. */
  .vf-run {
    fill: none;
    stroke: var(--role-draw);
    stroke-width: 2;
    stroke-linecap: square;
    stroke-linejoin: miter;
  }

  .vf-run.is-second {
    stroke-dasharray: 7 5;
  }

  /* The ring on this take. An element over the plot rather than a circle
     inside it, because the plot is stretched to the block's width and a
     circle in a non-uniform box is an ellipse. */
  .vf-ring {
    position: absolute;
    width: 10px;
    height: 10px;
    border: 2px solid var(--role-draw);
    border-radius: 50%;
    background: var(--surface);
    transform: translate(-50%, -50%);
  }

  .vf-against-all {
    margin: 0;
  }

  .vf-against {
    margin: var(--space-2) 0 0;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
  }

  .vf-more {
    margin: var(--space-3) 0 0;
  }

  /* A quiet control rather than a run of coloured words, and a real touch
     target: the height comes from the app's own floor rather than from the
     line box of two words. The chevron says it leads somewhere, which is
     what stops the line reading as a caption on the figures above it. */
  .vf-more a {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch-target);
    color: var(--role-ink);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
    text-decoration: none;
  }

  .vf-more a:hover span {
    text-decoration: underline;
    text-decoration-color: var(--role-mark);
    text-underline-offset: 3px;
  }
</style>

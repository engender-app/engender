<script lang="ts">
  /* Pitch on a fixed hertz axis (ADR-0059). Live and saved takes share this
     drawing, including the person's optional comfort bracket. The trace
     and take marks describe pitch; frame marks describe recording quality. */
  import type { Snippet } from 'svelte';
  import type { PitchFrame } from '$lib/audio/pitch';
  import { densityAt, type DensitySample } from '$lib/audio/density';
  import {
    axisFraction,
    plainHzTicks,
    spreadLabels,
    type PitchAxis
  } from '$lib/audio/bands';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import { spread, wipe } from '$lib/motion/reveal';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';
  import { untrack } from 'svelte';

  let {
    axis,
    trace,
    traceWeight = 2.5,
    density = null,
    pair = null,
    span = null,
    medianHz = null,
    comfort = null,
    gate = null,
    ticks,
    tickLabel,
    underPlot,
    role,
    ...rest
  }: {
    axis: PitchAxis;
    /** The pitch to draw, oldest first. A null `hz` is a gap in the line
        rather than a leap across it, live or stored. */
    trace: readonly PitchFrame[];
    /** How heavily the trace is drawn. The live gauge spends this on the
        gate's steadiness reading; a stored take has one weight. */
    traceWeight?: number;
    /** Where the take's voiced frames sat, as a shape beside the time plot
        on this same axis (audio/density.ts, redesign ticket 42). Null for
        a figure with nothing to draw one from: a live take whose frames are
        still arriving, and every benchmark from before schema v58, whose
        frames were summarized and dropped.

        Computed by whoever decoded the track rather than here, so one decode
        feeds the trace, the shape and the marks (benchmark.ts's own note on
        a second caller downsampling its own copy). */
    density?: readonly DensitySample[] | null;
    /** Two takes on one axis, back to back across a shared spine: the
        earlier read's shape to the left of it, the later read's to the
        right.

        Its own prop rather than a second `density`, because it replaces the
        time plot rather than sitting beside one. Two traces stacked is what
        the compare view was, and two forty-second scribbles is not what
        somebody comparing two months of work is reading; the question there
        is where the voice sat, and that is one axis with two shapes on it.

        Never a verdict (ADR-0012): one hue both sides, no arrow, nothing
        that says which way is better. Which side is which is said in words
        under the figure, by whoever renders it. */
    pair?: {
      earlier: { density: readonly DensitySample[]; medianHz: number };
      later: { density: readonly DensitySample[]; medianHz: number };
    } | null;
    /** The take's own p10-p90, as the row keeps it. */
    span?: { lowHz: number; highHz: number } | null;
    medianHz?: number | null;
    /** The person's own comfort band. No default anywhere behind it. */
    comfort?: { lowHz: number; highHz: number } | null;
    /** What the recording conditions are doing, when something is being
        recorded. Null for a take that is already finished. */
    gate?: { roomFraction: number; roofWeight: number; clipping: boolean } | null;
    /** Frequencies to label; round hertz ticks when omitted. */
    ticks?: readonly number[];
    /** Tick text in hertz or semitones. */
    tickLabel: (hz: number) => string;
    /** Live gauge content under the plot. */
    underPlot?: Snippet;
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  /* The drawing box. A viewBox rather than pixels so the field is the width
     of whatever holds it, down to the 390px floor and up; every stroke in
     here carries vector-effect="non-scaling-stroke", so a weight stays the
     weight it was authored at however far the box has been stretched. */
  const WIDTH = 300;
  const HEIGHT = 100;

  /** Where a frequency lands in the box: the axis is log2 in Hz
      (audio/bands.ts), and this is the only place that turns its 0-to-1
      into a y. */
  const y = (hz: number) => (1 - axisFraction(hz, axis)) * HEIGHT;

  /** How much room one gutter number needs, in the box's own units. At the
      field's own height a --text-xs line is about nine of them. */
  const LABEL_GAP = 9;

  let edges = $derived.by(() => {
    const hzs = [...(ticks ?? plainHzTicks(axis))].sort((a, b) => a - b);
    const exact = hzs.map((hz) => y(hz));
    const nudged = spreadLabels(exact, LABEL_GAP, HEIGHT);
    return hzs.map((hz, index) => ({ hz, y: nudged[index] }));
  });

  /** The trace, as one polyline per unbroken voiced run. */
  let runs = $derived.by(() => {
    if (trace.length === 0) return [];
    const step = trace.length > 1 ? WIDTH / (trace.length - 1) : WIDTH;
    const segments: string[] = [];
    let current: string[] = [];

    trace.forEach((frame, index) => {
      if (frame.hz === null) {
        if (current.length > 1) segments.push(current.join(' '));
        current = [];
        return;
      }
      current.push(`${(index * step).toFixed(1)},${y(frame.hz).toFixed(1)}`);
    });
    if (current.length > 1) segments.push(current.join(' '));
    return segments;
  });

  /* The comfort bracket's spine, inset from the right edge by its own tick
     length so the ticks have somewhere to go. */
  const BRACKET_TICK = 8;
  const BRACKET_X = WIDTH - BRACKET_TICK - 6;

  /* The density's own box. Its horizontal units are a proportion and not a
     length, so the box is a fixed width in CSS and this viewBox never
     stretches the shape the way the time plot's deliberately does.

     The mode reaches 82 of the box's 100 units rather than all of them. A
     shape that ends exactly on the edge reads as clipped - as if the figure
     ran out of room rather than the voice running out of frames - and the
     18 units of air are what say the outline is the whole of it. */
  const DENSITY_UNITS = 100;
  const DENSITY_MODE = 82;

  /** The shape's outline, bottom of the axis upward. A polyline and not a
      filled region: a fill in this position, against washes that are
      themselves fills, is the one thing a mark here must not look like
      (ADR-0059). */
  let densityOutline = $derived(
    (density ?? [])
      .map((sample) => `${(sample.weight * DENSITY_MODE).toFixed(1)},${y(sample.hz).toFixed(1)}`)
      .join(' ')
  );

  /** How far out a mark reaches: to the outline at its own frequency, so
      the median and the span's two ends land on the shape rather than
      crossing it at a length of their own. */
  const markWidth = (hz: number) => densityAt(density ?? [], hz) * DENSITY_MODE;

  /* Changing which two takes are compared moves the shapes rather than
     cutting to the new pair (rule 10: every state change moves, and a chart
     re-ranging is named in it). Both sides always carry the same number of
     samples - `pitchDensity` draws every shape on one bin count - so the
     topology is identical and each bin can simply travel: its frequency, as
     the shared axis re-ranges under it, and how wide the shape is there.

     The same shape as kit/AreaChart's own re-tween, and for the same reason
     it is here rather than in the caller: the figure owns its geometry, so
     it owns the journey between two of them. */
  let shownPair = $state<typeof pair>(null);

  $effect(() => {
    const next = pair;
    const previous = untrack(() => shownPair);
    const duration = motionDuration('--dur-slow');

    /* Nothing to travel from on a first draw, nothing to travel with under
       reduced motion, and nothing to interpolate between two shapes drawn at
       different bin counts. The first draw's own arrival is the clip in the
       markup, not this. */
    const sameShape =
      previous !== null &&
      next !== null &&
      previous.earlier.density.length === next.earlier.density.length &&
      previous.later.density.length === next.later.density.length;
    if (duration === 0 || !sameShape || next === null) {
      shownPair = next;
      return;
    }

    const from = previous;
    const between = (a: DensitySample, b: DensitySample, t: number): DensitySample => ({
      hz: a.hz + (b.hz - a.hz) * t,
      weight: a.weight + (b.weight - a.weight) * t
    });
    const side = (which: 'earlier' | 'later', t: number) => ({
      density: next[which].density.map((sample, at) => between(from[which].density[at], sample, t)),
      medianHz:
        from[which].medianHz + (next[which].medianHz - from[which].medianHz) * t
    });

    let frame = 0;
    const began = performance.now();
    const step = (now: number) => {
      const t = EASE_OUT(Math.min(1, (now - began) / duration));
      shownPair = { earlier: side('earlier', t), later: side('later', t) };
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  });

  /* The paired box: the spine down its middle, one shape's width either
     side of it. Both sides take the same 82 units, so the two shapes are
     read against each other rather than against the edges they end near. */
  const PAIR_UNITS = DENSITY_UNITS * 2;
  const SPINE_X = DENSITY_UNITS;

  /** One side of the pair, outward from the spine. `direction` is -1 for the
      earlier take, which reads leftward, and 1 for the later one. */
  const sidePath = (samples: readonly DensitySample[], direction: -1 | 1) =>
    samples
      .map(
        (sample) =>
          `${(SPINE_X + direction * sample.weight * DENSITY_MODE).toFixed(1)},${y(sample.hz).toFixed(1)}`
      )
      .join(' ');

  const sideMark = (samples: readonly DensitySample[], hz: number, direction: -1 | 1) =>
    SPINE_X + direction * densityAt(samples, hz) * DENSITY_MODE;
</script>

<div class="pf" class:is-clipping={gate?.clipping} {...roleAttrs(role)} {...rest}>
  <div class="pf-plot">
    <!-- The gutter is HTML rather than SVG text: the box is stretched to
         whatever width it lands in, and stretched type is the one thing a
         non-uniform viewBox cannot be forgiven for. -->
    <div class="pf-gutter" aria-hidden="true">
      {#each edges as edge}
        <span class="pf-tick" style="top: {edge.y}%">{tickLabel(edge.hz)}</span>
      {/each}
    </div>

    <div class="pf-field">
      {#if shownPair}
        <!-- Two reads share one axis and spine. -->
        <svg
          class="pf-svg pf-pair"
          data-pitch-pair
          viewBox="0 0 {PAIR_UNITS} {HEIGHT}"
          preserveAspectRatio="none"
          aria-hidden="true"
          in:spread|global
        >

          <line class="pf-spine" x1={SPINE_X} y1="0" x2={SPINE_X} y2={HEIGHT} vector-effect="non-scaling-stroke" />

          {#each [{ side: shownPair.earlier, direction: -1 as const, which: 'earlier' }, { side: shownPair.later, direction: 1 as const, which: 'later' }] as read (read.which)}
            <line
              class="pf-median"
              data-pair-median={read.which}
              x1={SPINE_X}
              y1={y(read.side.medianHz)}
              x2={sideMark(read.side.density, read.side.medianHz, read.direction)}
              y2={y(read.side.medianHz)}
              vector-effect="non-scaling-stroke"
            />
            <polyline
              class="pf-casing is-outline"
              points={sidePath(read.side.density, read.direction)}
              vector-effect="non-scaling-stroke"
            />
            <polyline
              class="pf-outline"
              data-pair-outline={read.which}
              points={sidePath(read.side.density, read.direction)}
              vector-effect="non-scaling-stroke"
            />
          {/each}
        </svg>
      {:else}
      <svg
        class="pf-svg pf-time"
        viewBox="0 0 {WIDTH} {HEIGHT}"
        preserveAspectRatio="none"
        aria-hidden="true"
      >

        {#if span}
          <!-- The take's own span: p10 to p90 and not minimum to maximum,
               which is what the row stores and why (audio/pitch.ts). Drawn
               as its two edges, so it reads as a measurement of this take
               rather than as another region of the world. -->
          {#each [span.highHz, span.lowHz] as edge}
            <line
              class="pf-span"
              data-pitch-span
              x1="0"
              y1={y(edge)}
              x2={WIDTH}
              y2={y(edge)}
              vector-effect="non-scaling-stroke"
            />
          {/each}
        {/if}

        {#if medianHz !== null}
          <line
            class="pf-median"
            data-pitch-median
            x1="0"
            y1={y(medianHz)}
            x2={WIDTH}
            y2={y(medianHz)}
            vector-effect="non-scaling-stroke"
          />
        {/if}

        {#each runs as points, index (index)}
          <!-- The casing under the trace: the line's edge where the stripe
               cannot be found against the field on its own (kit.css's
               --role-edge), transparent where it can. -->
          <polyline
            class="pf-casing is-trace"
            {points}
            stroke-width={traceWeight + 2}
            vector-effect="non-scaling-stroke"
          />
          <polyline
            class="pf-trace"
            data-pitch-trace
            {points}
            stroke-width={traceWeight}
            vector-effect="non-scaling-stroke"
          />
        {/each}

        {#if comfort}
          <!-- The person's optional comfort bracket. -->
          <g class="pf-comfort" data-pitch-comfort>
            <line
              x1={BRACKET_X}
              y1={y(comfort.highHz)}
              x2={BRACKET_X}
              y2={y(comfort.lowHz)}
              vector-effect="non-scaling-stroke"
            />
            {#each [comfort.highHz, comfort.lowHz] as end}
              <line
                x1={BRACKET_X}
                y1={y(end)}
                x2={BRACKET_X + BRACKET_TICK}
                y2={y(end)}
                vector-effect="non-scaling-stroke"
              />
            {/each}
          </g>
        {/if}
      </svg>

      {#if density}
        <!-- Where the voice spent its time, on the same Hz as the plot
             beside it: the distribution the median and the p10-p90 span are
             three percentiles of, which until this ticket was never drawn.

             It opens from the spine outward rather than fading in, because
             the spine is the axis and the shape is what was measured off
             it; |global because the figure mounts inside its own {#if} and
             a local transition would never play. -->
        <svg
          class="pf-svg pf-density"
          data-pitch-density
          viewBox="0 0 {DENSITY_UNITS} {HEIGHT}"
          preserveAspectRatio="none"
          aria-hidden="true"
          in:wipe|global
        >

          <!-- The spine: a guide at rule 9's weight, and the line every
               mark is measured out from. -->
          <line class="pf-spine" x1="0" y1="0" x2="0" y2={HEIGHT} vector-effect="non-scaling-stroke" />

          {#if span}
            {#each [span.highHz, span.lowHz] as edge}
              <line
                class="pf-span"
                data-density-span
                x1="0"
                y1={y(edge)}
                x2={markWidth(edge)}
                y2={y(edge)}
                vector-effect="non-scaling-stroke"
              />
            {/each}
          {/if}

          {#if medianHz !== null}
            <line
              class="pf-median"
              data-density-median
              x1="0"
              y1={y(medianHz)}
              x2={markWidth(medianHz)}
              y2={y(medianHz)}
              vector-effect="non-scaling-stroke"
            />
          {/if}

          <polyline class="pf-casing is-outline" points={densityOutline} vector-effect="non-scaling-stroke" />
          <polyline class="pf-outline" points={densityOutline} vector-effect="non-scaling-stroke" />
        </svg>
      {/if}
      {/if}

      <!-- The frame: the level pressing on the ceiling, and the room
           crowding from below. Scaled rather than resized, so the duration
           clamp can flatten both to a cut. -->
      <span class="pf-roof" style="--pf-roof: {gate?.roofWeight ?? 1}"></span>
      <span class="pf-room" style="--pf-room: {gate?.roomFraction ?? 0}"></span>
    </div>
  </div>

  {#if underPlot}{@render underPlot()}{/if}

</div>

<style>
  .pf {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .pf-plot {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
  }

  /* The numbers beside the gridlines. A fixed width rather than a fitted
     one, so the field's left edge does not move between a three-digit and a
     two-digit label. */
  .pf-gutter {
    position: relative;
    flex: 0 0 auto;
    width: 3.4em;
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text-2);
  }

  .pf-tick {
    position: absolute;
    right: 0;
    transform: translateY(-50%);
    white-space: nowrap;
  }

  .pf-field {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    height: 148px;
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-block);
    overflow: hidden;
  }

  .pf-time {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* The shape's own box, and the one part of this figure whose width is
     fixed. The time plot is stretched to whatever the column gives it
     because neither of its axes is a length; the density's horizontal axis
     is a proportion of one read, and stretching a proportion is how a
     narrow phone would end up claiming a wider voice than a tablet. 72px is
     about a fifth of the 390px floor's field, which leaves the trace the
     width it needs to still be a passage. */
  .pf-density {
    flex: 0 0 72px;
  }

  .pf-svg {
    display: block;
    width: 100%;
    height: 100%;
    /* Pressing into the ceiling: the field sits 2px lower once the take is
       clipping, which is the only movement in here that is not a number
       changing. */
    transform: translateY(0);
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .pf.is-clipping .pf-svg {
    transform: translateY(2px);
  }

  .pf-trace {
    fill: none;
    /* --role-draw, the flag's own stripe: a drawn mark takes it
       undiluted, and the contrast-corrected version is for text and for a
       glyph on a tint of itself (kit.css). */
    stroke: var(--role-draw);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pf-span {
    stroke: var(--role-ink);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .pf-median {
    stroke: var(--role-ink);
    stroke-width: 2;
  }

  /* The shape itself: a measurement, so the stripe undiluted and at a
     series' own weight (rule 9), with square ends and mitred joins like
     every other series in the app. No fill - a filled region here would be
     the one thing this figure may not draw, a region in the hue that reads
     as somewhere to get to. */
  .pf-outline {
    fill: none;
    stroke: var(--role-draw);
    stroke-width: 2;
    stroke-linecap: square;
    stroke-linejoin: miter;
  }

  .pf-casing {
    fill: none;
    stroke: var(--role-edge);
  }

  .pf-casing.is-trace {
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .pf-casing.is-outline {
    stroke-width: 4;
    stroke-linecap: square;
    stroke-linejoin: miter;
  }

  /* The axis the shape is measured from. A guide, so 1px in --text-2 and
     never the series colour. */
  .pf-spine {
    stroke: var(--text-2);
    stroke-width: 1;
  }

  .pf-comfort line {
    stroke: var(--role-ink);
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .pf-roof,
  .pf-room {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--outline);
    transition: transform var(--dur-fast) var(--ease-out);
  }

  /* The level. Hairline while there is headroom, four times that once the
     take is against the rails. */
  .pf-roof {
    top: 0;
    transform-origin: top center;
    transform: scaleY(var(--pf-roof, 1));
  }

  .pf.is-clipping .pf-roof {
    background: var(--role-draw);
  }

  /* The room, crowding up from the floor. Full at 0 dB and gone by 24, so a
     take about to fail the gate's 15 dB shows the frame already well into
     the field. */
  .pf-room {
    bottom: 0;
    transform-origin: bottom center;
    transform: scaleY(calc(1 + var(--pf-room, 0) * 11));
  }

</style>

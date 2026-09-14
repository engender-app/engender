<script lang="ts">
  /* Pitch on an absolute axis: the field every voice picture in this app is
     drawn on (phase 8 features ticket 09, ADR-0059).

     One field, two subjects. The live gauge (VoiceGauge.svelte) hands it a
     trace that is still arriving and the gate's own readings; a finished
     take (VoiceTake.svelte) hands it a stored track, the span the row keeps
     and its median. Neither owns the geometry, because two components
     deciding independently where 165 Hz sits is two axes that drift.

     **The field is the voice; the frame is the recording.** Everything
     inside the plot is pitch - the bands, the trace, the span, the comfort
     bracket. The two things that are about the recording rather than about
     the voice live on the frame instead: the top edge thickens as the level
     approaches full scale, the bottom edge thickens as the room gets loud.
     They used to be a line and a rising fill *inside* the plot, which was
     defensible while the axis was relative and nothing else was drawn on
     it. On an absolute axis a room level is not a pitch, and a fill rising
     through the man band would be a mark in a place where its position
     means something it does not mean.

     **The world is filled; what is yours is drawn.** The two reference
     ranges are washes with no edge - ambient, cited, nothing to act on. The
     take's own span is a dashed outline with no fill and the median a solid
     line, and the comfort band is a bracket at the right edge. So a glance
     separates the two kinds of claim before any of the captions are read:
     a citation is a region, a decision is line work.

     **The middle band is drawn at less than either range, never more.**
     On sourced per-language figures the two ranges do not meet, so what
     sits between them is a gap: fewer speakers are there than in either
     range, and the fill says so at half a range's wash. A denser middle
     band would be the target zone ADR-0012 forbids, and the bare line two
     touching blocks would leave reads as a pass mark just as loudly, which
     is why the region is drawn at all. Where two ranges do coincide the
     same code draws the intersection, and the caption changes with it
     (bands.ts's `middleBand`).

     Two earlier builds of this band are worth not repeating. It was hatched
     first, on the reasoning that a denser region reads as a target: at the
     390px floor the band was eight pixels tall and vertical hairlines in
     eight pixels are a comb. Then it was the two washes overlapping, which
     only existed because the English man band had been widened past its
     source to manufacture an intersection - the per-language figures
     retired both the widening and the overlap.

     Nothing here is a verdict on a voice. There is one hue, the section's
     own flag stripe; no band is louder than another; nothing is red, green,
     or on a scale between them; and no mark says which way anything should
     go (PRODUCT.md's "No judgment encoded anywhere", and ADR-0012 as
     ADR-0059 narrows it).

     **Two axes, because the two steps ask different questions.** With a
     language it draws absolute hertz with that language's bands behind it,
     which is what somebody reading a passage is watching. With `language`
     null it draws whatever axis the caller hands it and labels the ticks in
     the caller's unit, and it draws no bands - which is what somebody
     holding one note is watching, since the task there is keeping a pitch
     rather than reaching one and a flat line is the whole answer.

     Both carry their scale in the gutter. There was briefly a third form -
     a 44px strip with no gutter and no bands on the action bar - and it
     drew a pitch trace nothing could be read off, which is the relative
     gauge this ticket exists to replace, in miniature (Alicja, 2026-09-04:
     "no way to tell what it measures at all"). A figure either carries its
     scale or is not drawn.

     Motion: tier 3. Data moves, the container does not, and only transform
     and opacity are animated - the two frame edges scale, so the app's
     duration clamp turns every reading into an instant cut under either
     reduced-motion path. The trace is redrawn rather than transitioned. */
  import type { Snippet } from 'svelte';
  import type { PitchFrame } from '$lib/audio/pitch';
  import { densityAt, type DensitySample } from '$lib/audio/density';
  import {
    axisFraction,
    bandEdges,
    referenceBands,
    spreadLabels,
    type BandLanguage,
    type PitchAxis
  } from '$lib/audio/bands';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import PitchBandsCaption from '$lib/components/PitchBandsCaption.svelte';
  import { wipe } from '$lib/motion/reveal';

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
    language,
    languageGuessed = false,
    underPlot,
    captionShared = false,
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
        right, with the cited bands running behind both (redesign ticket
        42).

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
    /** Which frequencies get a number in the gutter. Omitted with a
        language, where the band edges are the only values on the axis that
        mean anything and the figure knows them. */
    ticks?: readonly number[];
    /** How a tick is written, in the caller's locale and the caller's unit:
        hertz where the axis is absolute, signed semitones where it is a
        take's own note. */
    tickLabel: (hz: number) => string;
    /** Whose figures the bands are: the language of the passage being read,
        not the app's (bands.ts's `bandLanguageOf`). Pitch differs by
        language by more than it differs by gender within one, so a band
        drawn for the wrong population is worse than no band.

        Null draws no bands and, with them, no caption: a figure measuring a
        take against its own note cites nothing, so there is nothing for a
        source line to name. That is the only way to reach a bandless
        figure, which is what keeps ADR-0059's "never without its citation"
        rule from having a hole in it. */
    language: BandLanguage | null;
    /** True where that language is a guess, which the caption says. */
    languageGuessed?: boolean;
    /** True when whoever embedded this figure is rendering one
        PitchBandsCaption for it and its neighbour instead: two takes side
        by side would otherwise carry the same three paragraphs twice, in
        half the width. It is the only way to leave the caption off a figure
        that draws the bands, and not a way to leave it off altogether -
        ADR-0059 permits the bands only with their figures, their source and
        their caveat, and voice-figure-surfaces.test.ts holds every caller
        that sets this to also import the caption. */
    captionShared?: boolean;
    /** A mark that belongs to the field rather than to the page: the live
        gauge's run bar. It goes between the plot and the legend, because a
        bar sitting under three lines of citation reads as unrelated to the
        picture it is about. */
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

  let bands = $derived(
    language === null
      ? []
      : referenceBands(language).map((band) => ({
          key: band.key,
          top: y(band.highHz),
          height: y(band.lowHz) - y(band.highHz)
        }))
  );

  let middle = $derived(bands.find((band) => band.key === 'between'));

  /** How much room one gutter number needs, in the box's own units. At the
      field's own height a --text-xs line is about nine of them. */
  const LABEL_GAP = 9;

  /** The frequencies worth a number in the gutter: the band edges, which
      are the only values on this axis that mean anything. They get no
      gridline of their own - each one is already the edge of a wash, and a
      line on top of it would be furniture competing with the trace.

      The number is nudged off its own frequency where two of them would
      collide (bands.ts's spreadLabels): 165 and 180 Hz are six per cent of
      the axis apart, and at the 390px floor that is two numbers in the same
      eight pixels. */
  let edges = $derived.by(() => {
    const hzs =
      language === null ? [...(ticks ?? [])].sort((a, b) => b - a).reverse() : bandEdges(language);
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
      (ADR-0059's bands are citations and this is a measurement). */
  let densityOutline = $derived(
    (density ?? [])
      .map((sample) => `${(sample.weight * DENSITY_MODE).toFixed(1)},${y(sample.hz).toFixed(1)}`)
      .join(' ')
  );

  /** How far out a mark reaches: to the outline at its own frequency, so
      the median and the span's two ends land on the shape rather than
      crossing it at a length of their own. */
  const markWidth = (hz: number) => densityAt(density ?? [], hz) * DENSITY_MODE;

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
      {#each edges as edge (edge.hz)}
        <span class="pf-tick" style="top: {edge.y}%">{tickLabel(edge.hz)}</span>
      {/each}
    </div>

    <!-- The two typical ranges, each a wash in the hue over whatever is
         behind it. Over transparency rather than mixed into the ground, so
         that where two of them coincide the shared strip comes out at twice
         one wash by arithmetic rather than by a third colour somebody
         picked.

         One snippet drawn into both boxes rather than one set of rects per
         box: "the bands run across the plot and the density as one ground"
         is a claim two copies could stop making the day one of them gains a
         band the other does not. -->
    {#snippet ground(width: number)}
      {#each bands as band (band.key)}
        {#if band.key !== 'between'}
          <rect class="pf-band" x="0" y={band.top} {width} height={band.height} />
        {/if}
      {/each}

      {#if middle}
        <!-- The region between the two ranges, which on sourced figures is
             a gap rather than an intersection: fewer speakers sit here than
             in either range, so it is drawn at half a range's wash and
             never more. Its two bounds are the ranges' own facing edges,
             and they are what stop it reading as the line where two blocks
             touch. -->
        <g data-pitch-middle>
          <rect class="pf-middle" x="0" y={middle.top} {width} height={middle.height} />
          {#each [middle.top, middle.top + middle.height] as at (at)}
            <line class="pf-middle-edge" x1="0" y1={at} x2={width} y2={at} vector-effect="non-scaling-stroke" />
          {/each}
        </g>
      {/if}
    {/snippet}

    <div class="pf-field">
      {#if pair}
        <!-- Two reads on one axis. The bands are behind both, so "where I
             sat then, where I sit now, against the published figures" is
             one reading rather than two charts and a subtraction. -->
        <svg
          class="pf-svg pf-pair"
          data-pitch-pair
          viewBox="0 0 {PAIR_UNITS} {HEIGHT}"
          preserveAspectRatio="none"
          aria-hidden="true"
          in:wipe|global
        >
          {@render ground(PAIR_UNITS)}

          <line class="pf-spine" x1={SPINE_X} y1="0" x2={SPINE_X} y2={HEIGHT} vector-effect="non-scaling-stroke" />

          {#each [{ side: pair.earlier, direction: -1 as const, which: 'earlier' }, { side: pair.later, direction: 1 as const, which: 'later' }] as read (read.which)}
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
        {@render ground(WIDTH)}

        {#if span}
          <!-- The take's own span: p10 to p90 and not minimum to maximum,
               which is what the row stores and why (audio/pitch.ts). Drawn
               as its two edges, so it reads as a measurement of this take
               rather than as another region of the world. -->
          {#each [span.highHz, span.lowHz] as edge (edge)}
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
          <polyline
            class="pf-trace"
            data-pitch-trace
            {points}
            stroke-width={traceWeight}
            vector-effect="non-scaling-stroke"
          />
        {/each}

        {#if comfort}
          <!-- A bracket rather than a band: the person's own comfort range
               is a decision, and the reference ranges are citations. Same
               hue, different kind of mark. -->
          <g class="pf-comfort" data-pitch-comfort>
            <line
              x1={BRACKET_X}
              y1={y(comfort.highHz)}
              x2={BRACKET_X}
              y2={y(comfort.lowHz)}
              vector-effect="non-scaling-stroke"
            />
            {#each [comfort.highHz, comfort.lowHz] as end (end)}
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
          {@render ground(DENSITY_UNITS)}

          <!-- The spine: a guide at rule 9's weight, and the line every
               mark is measured out from. -->
          <line class="pf-spine" x1="0" y1="0" x2="0" y2={HEIGHT} vector-effect="non-scaling-stroke" />

          {#if span}
            {#each [span.highHz, span.lowHz] as edge (edge)}
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

  {#if language !== null && !captionShared}
    <PitchBandsCaption {language} {languageGuessed} />
  {/if}
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
    color: var(--muted);
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

  /* Over transparency rather than mixed into the ground, for two reasons:
     the overlap then falls out of the arithmetic instead of being a colour
     somebody picked, and a wash mixed into --bg is very nearly --surface on
     a dark theme, which is how the first build drew three bands nobody
     could see. */
  .pf-band {
    fill: color-mix(in oklab, var(--role-c) 18%, transparent);
  }

  .pf-middle {
    fill: color-mix(in oklab, var(--role-c) 9%, transparent);
  }

  .pf-middle-edge {
    stroke: color-mix(in oklab, var(--role-c) 30%, transparent);
    stroke-width: 1;
  }

  .pf-trace {
    fill: none;
    /* --role-draw, the flag's own stripe: a drawn mark takes the band
       undiluted, and the contrast-corrected version is for text and for a
       glyph on a tint of itself (kit.css). */
    stroke: var(--role-draw);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* The take's own two statements, in the hue's text weight rather than its
     stripe: they are closer to a written figure than to a drawn line, and
     the trace has to stay the loudest thing in the field.

     Four marks can land within a few pixels of each other - a voice at
     191 Hz puts its median, its span and the overlap's top edge inside one
     small stretch of the axis - so they are separated by weight as well as
     by kind: the trace at 2.5px in the stripe undiluted, the median at 2px
     in ink, the span at 1px dashed in ink, the band edges at 1px in 30% of
     the hue. Read down that ladder and the crowded case still resolves. */
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

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

     **The overlap is the two washes coinciding.** Where the two ranges
     coincide is its own band (the ticket, and ADR-0059), with its own
     bounds and its own caption, and it must not be a line where two blocks
     meet - a line there reads as a pass mark. Both washes are therefore
     drawn in the hue over transparency rather than mixed into the ground,
     so the strip they share is exactly twice one wash: the truthful
     rendering of "both of these are true here", arrived at by arithmetic
     rather than by a third colour somebody chose.

     The first build hatched it instead, on the reasoning that a denser
     region reads as a target. Hatching lost: 165 to 180 Hz is under six
     per cent of the axis, so at the 390px floor the band is eight pixels
     tall and vertical hairlines in eight pixels are a comb, not a texture.
     The hairline bounds and the caption carry "its own band" without
     needing one.

     Nothing here is a verdict on a voice. There is one hue, the section's
     own flag stripe; no band is louder than another; nothing is red, green,
     or on a scale between them; and no mark says which way anything should
     go (PRODUCT.md's "No judgment encoded anywhere", and ADR-0012 as
     ADR-0059 narrows it).

     Motion: tier 3. Data moves, the container does not, and only transform
     and opacity are animated - the two frame edges scale, so the app's
     duration clamp turns every reading into an instant cut under either
     reduced-motion path. The trace is redrawn rather than transitioned. */
  import type { Snippet } from 'svelte';
  import type { PitchFrame } from '$lib/audio/pitch';
  import { REFERENCE_BANDS, axisFraction, bandEdges, spreadLabels, type PitchAxis } from '$lib/audio/bands';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';
  import PitchBandsCaption from '$lib/components/PitchBandsCaption.svelte';

  let {
    axis,
    trace,
    traceWeight = 2.5,
    span = null,
    medianHz = null,
    comfort = null,
    gate = null,
    hzLabel,
    underPlot,
    captionShared = false,
    role,
    compact = false,
    ...rest
  }: {
    axis: PitchAxis;
    /** The pitch to draw, oldest first. A null `hz` is a gap in the line
        rather than a leap across it, live or stored. */
    trace: readonly PitchFrame[];
    /** How heavily the trace is drawn. The live gauge spends this on the
        gate's steadiness reading; a stored take has one weight. */
    traceWeight?: number;
    /** The take's own p10-p90, as the row keeps it. */
    span?: { lowHz: number; highHz: number } | null;
    medianHz?: number | null;
    /** The person's own comfort band. No default anywhere behind it. */
    comfort?: { lowHz: number; highHz: number } | null;
    /** What the recording conditions are doing, when something is being
        recorded. Null for a take that is already finished. */
    gate?: { roomFraction: number; roofWeight: number; clipping: boolean } | null;
    /** How a frequency is written in the gutter, in the caller's locale. */
    hzLabel: (hz: number) => string;
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
    /** The action bar's form: the field alone, at a third the height, under
        a screenful of text somebody is busy reading. */
    compact?: boolean;
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
    REFERENCE_BANDS.map((band) => ({
      key: band.key,
      top: y(band.highHz),
      height: y(band.lowHz) - y(band.highHz)
    }))
  );

  let overlap = $derived(bands.find((band) => band.key === 'overlap'));

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
    const hzs = bandEdges();
    const exact = hzs.map((hz) => y(hz));
    const nudged = spreadLabels(exact, LABEL_GAP);
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
</script>

<div
  class="pf"
  class:is-clipping={gate?.clipping}
  class:is-compact={compact}
  {...roleAttrs(role)}
  {...rest}
>
  <div class="pf-plot">
    {#if !compact}
      <!-- The gutter is HTML rather than SVG text: the box is stretched to
           whatever width it lands in, and stretched type is the one thing a
           non-uniform viewBox cannot be forgiven for. -->
      <div class="pf-gutter" aria-hidden="true">
        {#each edges as edge (edge.hz)}
          <span class="pf-tick" style="top: {edge.y}%">{hzLabel(edge.hz)}</span>
        {/each}
      </div>
    {/if}

    <div class="pf-field">
      <svg
        class="pf-svg"
        viewBox="0 0 {WIDTH} {HEIGHT}"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <!-- Both typical ranges, each a wash in the hue over whatever is
             behind it. The overlap needs no fill of its own: it is the
             strip where these two already coincide, so it comes out at
             twice one wash on its own. -->
        {#each bands as band (band.key)}
          {#if band.key !== 'overlap'}
            <rect class="pf-band" x="0" y={band.top} width={WIDTH} height={band.height} />
          {/if}
        {/each}

        {#if overlap}
          <!-- Its own bounds, so the strip is a band with two edges rather
               than a shade somebody has to notice. -->
          <g class="pf-overlap" data-pitch-overlap>
            {#each [overlap.top, overlap.top + overlap.height] as at (at)}
              <line x1="0" y1={at} x2={WIDTH} y2={at} vector-effect="non-scaling-stroke" />
            {/each}
          </g>
        {/if}

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

      <!-- The frame: the level pressing on the ceiling, and the room
           crowding from below. Scaled rather than resized, so the duration
           clamp can flatten both to a cut. -->
      <span class="pf-roof" style="--pf-roof: {gate?.roofWeight ?? 1}"></span>
      <span class="pf-room" style="--pf-room: {gate?.roomFraction ?? 0}"></span>
    </div>
  </div>

  {#if underPlot}{@render underPlot()}{/if}

  {#if !compact && !captionShared}
    <PitchBandsCaption />
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
    flex: 1 1 auto;
    min-width: 0;
    height: 148px;
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-input);
    overflow: hidden;
  }

  .pf.is-compact .pf-field {
    height: 44px;
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

  .pf-overlap line {
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

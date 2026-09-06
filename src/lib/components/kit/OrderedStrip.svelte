<script lang="ts">
  /* Parts of a whole where the order is the information (phase 8 UX ticket
     04, ADR-0058). Mood's five steps are the case it was written for, and
     anything on a scale takes this form rather than the ring.

     One bar, the scale's own steps left to right, each as wide as its
     share. What that buys over five separate columns is the comparison
     the columns could not make: mostly-the-middle-two is a shape here,
     one block of colour across the centre of the bar, where in a
     distribution it is two tall bars that have to be measured against the
     three short ones beside them. And what it buys over a ring is the
     order itself - a donut of mood puts step 1 next to step 5 and there
     is no arrangement of it that does not.

     Mood's own ramp (ADR-0025), same as the vertical distribution and for
     the same reason: the segment for a step is that step's colour, so the
     strip is read against the scale the moods were chosen on. The ramp is
     the one ordered scale in this app that owns colours; a future caller
     whose scale does not is the moment to widen this, not before.

     Every step is present even at zero, the way the distribution's
     columns are: the sequence is what is being read, and a step dropping
     out would slide the rest along under the wrong part of the scale.

     The percentages sit under the bar rather than inside it. Inside, they
     would be text on a mood fill, and the ramp's steps are literal hexes
     chosen to be sat on rather than written on - ADR-0025 had to hand-pick
     an ink for one heat step across two themes, and there are five steps
     here across four presets. Under the bar they are on the card, in the
     card's own text colour, and they still line up with what they label.
     A segment too narrow to hold its own number gets none: the reading is
     in its accessible label either way.

     One wipe left to right rather than five segments arriving. The
     direction is the scale's direction, so the entrance says the same
     thing the drawing does - and five segments growing in place would
     open gaps in a bar whose whole point is that it is continuous.

     Hover/tap reveals the count a segment's share is computed from
     (ticket 09), beside the percentage this already prints under narrow
     shares too where MIN_LABEL_SHARE would print nothing. Mouse-only for
     the enter/leave pair, the same gate Segmented.svelte's drag uses,
     because a touch has no hover to leave - its own pointerup is what
     toggles the tooltip instead, which is the "touch equivalent" ticket 09
     asks to have decided. Kept a decorative `role="img"` rather than a
     real button, same reasoning ChartAnnotations.svelte gives for its own
     hover: the full reading (name, share, count) already sits in the one
     aria-label whether or not anyone is pointing at it, so there is
     nothing behind the tooltip a keyboard-only reader is missing. */
  import { fly } from 'svelte/transition';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';
  import { share } from '$lib/charts/share';

  export interface StripStep {
    /** 1-5 on the mood ramp - the step's place in the scale's own order. */
    step: number;
    name: string;
    count: number;
  }

  let { steps }: { steps: StripStep[] } = $props();

  /* Under this, a percentage does not fit in its own segment. Ten percent
     of a card-width track is around 30px, which is what "34%" needs at
     --text-xs. */
  const MIN_LABEL_SHARE = 10;

  /* Each step's share worked out once. The three rows below all place
     against it - the segment's width, its label's cell, and whether that
     label fits at all - and reading it per row is the same arithmetic four
     times with four chances to disagree.

     The denominator here is the sum of every step, not the tallest one:
     this is a part-to-whole strip (ADR-0058), the same rule Donut's own
     whole is (charts/parts.ts's `slices`), and a different question from
     what BarRows and Distribution ask, where a row's length only means
     something next to the tallest row in the set. Left inline rather than
     moved to barRow.ts, since that module's rule doesn't fit this one; and
     left inline rather than moved to parts.ts, since this strip doesn't
     share the donut's cap/remainder machinery to make reusing it
     worthwhile. */
  let drawn = $derived.by(() => {
    const total = steps.reduce((sum, s) => sum + s.count, 0);
    let at = 0;
    return steps.map((step) => {
      const percent = share(step.count, total);
      const from = at;
      at += percent;
      return { ...step, percent, label: `${Math.round(percent)}%`, from };
    });
  });

  let hovered = $state<number | null>(null);

  function enter(e: PointerEvent, step: number) {
    if (e.pointerType === 'mouse') hovered = step;
  }
  function leave(e: PointerEvent, step: number) {
    if (e.pointerType === 'mouse' && hovered === step) hovered = null;
  }
  /* A finger has no hover, so its own pointerup is the toggle: tap a
     segment to show the tooltip, tap it again to hide it. Gated off
     'mouse' so a mouse click - already answered by the hover it followed -
     does not also fight the state the leave above is about to clear. */
  function tap(e: PointerEvent, step: number) {
    if (e.pointerType !== 'mouse') hovered = hovered === step ? null : step;
  }

  /* The tooltip's own left edge, in percent of the track: the hovered
     segment's midpoint, kept off the track's own edges so a pill near
     either end still reads on the card rather than running past it. */
  const TOOLTIP_MARGIN = 15;
  let hoveredStep = $derived(drawn.find((s) => s.step === hovered) ?? null);
  let tooltipLeft = $derived(
    hoveredStep
      ? Math.min(Math.max(hoveredStep.from + hoveredStep.percent / 2, TOOLTIP_MARGIN), 100 - TOOLTIP_MARGIN)
      : 0
  );
</script>

<div class="kit-ordered" data-chart="ordered-strip">
  <div class="kit-ordered-track">
    {#each drawn as step (step.step)}
      <!-- The segment is the only place the step's name reaches a screen
           reader: what is drawn is a width and a colour, and the ends
           caption below names two of the five. -->
      <span
        class="kit-ordered-seg"
        class:is-hovered={hovered === step.step}
        data-strip-step={step.step}
        role="img"
        aria-label={`${step.name} ${step.label} · ${step.count}`}
        style={`--bar-share: ${step.percent}; --dist-fill: var(--mood-${step.step})`}
        onpointerenter={(e) => enter(e, step.step)}
        onpointerleave={(e) => leave(e, step.step)}
        onpointerup={(e) => tap(e, step.step)}
      ></span>
    {/each}
  </div>

  {#if hoveredStep}
    <!-- Outside the track rather than inside it: the track clips to its
         own rounded corners (overflow: hidden), and a pill rising off the
         segment it names would clip with it. Positioned against this
         wrapper instead, which shares the track's own width and has
         nothing of its own to clip against. Beside the segment rather
         than in a corner, the same rule AreaChart's own hover label
         follows: a hover is somebody pointing at one thing, and count
         sits with percent so pointing at a share too narrow to print its
         own label under the track still answers both questions. -->
    <div
      class="kit-ordered-tooltip"
      data-strip-tooltip
      style={`left: ${tooltipLeft}%`}
      in:fly={{ y: 4, duration: motionDuration('--dur-fast'), easing: EASE_OUT }}
    >
      {hoveredStep.count} · {hoveredStep.label}
    </div>
  {/if}

  <p class="kit-ordered-shares" aria-hidden="true">
    {#each drawn as step (step.step)}
      <span class="kit-ordered-share" style={`--bar-share: ${step.percent}`}>
        {step.percent >= MIN_LABEL_SHARE ? step.label : ''}
      </span>
    {/each}
  </p>

  <!-- Which way the scale runs. The middle three steps are placed by the
       sequence; the two ends are what say what the sequence is of. -->
  <p class="kit-ordered-ends" aria-hidden="true">
    <span>{steps[0]?.name ?? ''}</span>
    <span>{steps[steps.length - 1]?.name ?? ''}</span>
  </p>
</div>

<style>
  /* Its own block rather than kit.css, for the reason Donut.svelte's says:
     one consumer per class. The single-hue law still reaches it -
     tests/kit-surfaces.test.ts reads the kit components' style blocks
     alongside the shared sheet. */
  .kit-ordered {
    /* The tooltip's own positioning context: it has to sit above the
       track without the track's overflow: hidden clipping it, and this
       wrapper's own top edge is the track's, since the track is its
       first child with nothing above it. */
    position: relative;
    /* ChartCard's own head-to-body gap (--space-3, 12px) collapses with
       this margin rather than adding to it (both are top margins with
       nothing - no border, no padding - between them), so this has to be
       the tooltip's whole clearance on its own, not a top-up: without it
       the tooltip overlapped the card's heading text (ticket 09 gallery
       screenshots). --space-7 covers the tooltip's own height (26px) plus
       its --space-1 gap above the track, with a couple of pixels left over. */
    margin-top: var(--space-7);
    animation: kit-ordered-in var(--dur-slow) var(--ease-out) both;
  }

  @keyframes kit-ordered-in {
    from { clip-path: inset(0 100% 0 0); }
  }

  .kit-ordered-track {
    display: flex;
    /* The break between two steps. The ramp's adjacent steps are one
       intensity apart, which at 26px tall is an edge that wants finding. */
    gap: 1px;
    height: 26px;
    border-radius: 8px;
    /* One outline around the whole bar rather than one per segment: the
       light end of the ramp on a light card is the card otherwise, and a
       border per step would draw four lines nobody asked for. */
    border: 1px solid var(--outline);
    background: var(--surface-2);
    overflow: hidden;
  }

  .kit-ordered-seg {
    width: calc(var(--bar-share) * 1%);
    background: var(--dist-fill, var(--role-draw));
    /* Carries from one dataset's shares to the next, the way a bar carries
       its width: a range change is a re-tween, not a redraw.

       Width, which is a layout property, and Impeccable's detector says so.
       Kept deliberately, same as .kit-bar-mark's width and .kit-dist-mark's
       height: five segments have to add up to the track, and a transform
       scales one over its neighbour instead of pushing it along. The cost
       is a layout pass on five 26px boxes when the range changes, which is
       not the shape that thrashes. background is here too, at its own
       shorter duration for the hover blend below: a share re-tweening is
       the slow entrance-grade motion, and a hover answering a pointer is
       not. */
    transition:
      width var(--dur-slow) var(--ease-out),
      background var(--dur-fast) var(--ease-out);
  }

  /* The hovered segment, blended toward the app's own ink rather than
     brightened: mood's ramp is picked to be sat on across four presets
     and two themes (ADR-0025), and a flat brightness multiplier reads
     right on some of those and washes out on others. Blending in --text
     instead darkens it on a light theme and lightens it on a dark one,
     which is a highlight either way - the same idiom
     .kit-annotation-mark.is-hovered already reads for the same reason. */
  .kit-ordered-seg.is-hovered {
    background: color-mix(in oklab, var(--dist-fill, var(--role-draw)) 85%, var(--text) 15%);
  }

  /* The pill a hover or a tap raises: name's already read off the segment
     below, so this carries what the track alone cannot - the count a
     share this narrow has no room to print for itself. Same recipe as
     kit.css's .kit-area-annotation-label, kept local rather than shared
     with it since this is still the surface kit's one-consumer-per-class
     rule and the two charts differ in every other way. */
  .kit-ordered-tooltip {
    position: absolute;
    bottom: calc(100% + var(--space-1));
    transform: translateX(-50%);
    padding: 3px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    border: 1px solid var(--outline);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    color: var(--text);
    white-space: nowrap;
    pointer-events: none;
  }

  /* The percentages, under their own segments rather than inside them: the
     ramp's steps are colours chosen to be sat on, not written on. */
  .kit-ordered-shares {
    display: flex;
    gap: 1px;
    margin: var(--space-1) 0 0;
  }

  .kit-ordered-share {
    width: calc(var(--bar-share) * 1%);
    overflow: hidden;
    text-align: center;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    transition-property: width;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--ease-out);
  }

  /* Which way the scale runs. Further off the bar than the percentages
     are: those belong to the segments above them and this names the scale,
     which at one shared gap read as a third row of loose text. */
  .kit-ordered-ends {
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    font-size: var(--text-xs);
    color: var(--text-2);
  }
</style>

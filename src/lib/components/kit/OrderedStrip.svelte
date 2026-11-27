<script lang="ts">
  /* This strip keeps a scale's steps in order. Segment widths
     show shares and use mood's fixed colours. Zero-share steps
     stay in the sequence. A single left-to-right wipe reveals the whole
     bar without gaps.

     Percentages sit below the fills, on the card's own ink. Narrow shares
     below MIN_LABEL_SHARE omit the printed percentage. The accessible
     label always gives the name, share and count.

     A mouse enters and leaves the tooltip. Touch toggles it on
     pointerup, since a finger has no hover to leave. The strip stays
     role=img because the label already exposes the full reading. */
  import { fly } from 'svelte/transition';
  import { EASE_OUT, motionDuration } from '$lib/motion/tokens';
  import { share } from '$lib/charts/share';

  export interface StripStep {
    /** 1-5 on the mood ramp - the step's place in the scale's own order. */
    step: number;
    name: string;
    count: number;
  }

  /* `countShort` is the count under its percentage (a second line, so a
     narrow card needs no more width), `countFull` the same count in words
     for the accessible label. Props, since kit components take no copy. */
  let {
    steps,
    countShort = String,
    countFull = String
  }: { steps: StripStep[]; countShort?: (count: number) => string; countFull?: (count: number) => string } = $props();

  /* Under this, a percentage does not fit in its own segment. Ten percent
     of a card-width track is around 30px, which is what "34%" needs at
     --text-xs. */
  const MIN_LABEL_SHARE = 10;

  /* Each step's share worked out once. The three rows below all place
     against it - the segment's width, its label's cell, and whether that
     label fits at all - and reading it per row is the same arithmetic four
     times with four chances to disagree.

     The denominator here is the sum of every step, not the tallest one:
     this is a part-to-whole strip, the same rule Donut's own
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
        aria-label={`${step.name} ${step.label} · ${countFull(step.count)}`}
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
        {#if step.percent >= MIN_LABEL_SHARE}
          {step.label}<span class="kit-ordered-count" data-strip-days>{countShort(step.count)}</span>
        {/if}
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
       screenshots). 32px covers the tooltip's own height (26px) plus its
       --space-1 gap above the track, with a couple of pixels left over. A
       literal rather than a spacing step, because this is clearance for a
       thing drawn over the track, not rhythm between two blocks - which is
       what the spacing scale's steps above 20 are reserved for. */
    margin-top: 32px;
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
    border-radius: var(--r-block);
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
     and two themes, and a flat brightness multiplier reads
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
    border-radius: var(--r-block);
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

  /* The day count under its percentage: the same narrow cell, a second
     line, so a 360px card needs no more width than the percentage did. */
  .kit-ordered-count {
    display: block;
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

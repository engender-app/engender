<script lang="ts">
  /* The quality gate, drawn while the take is still happening (phase 5
     deepening ticket 15).

     Four conditions hold at once for three seconds of held breath, and the
     obvious build is four indicator dots going on and off. That version
     tells somebody *that* a take failed and never what to do about it, and
     four things blinking independently is the shape of a fault panel. This
     is one object instead, and each condition is the same measurement the
     gate makes, drawn as itself:

       the trace   the pitch of the last two seconds, frame by frame.
                   Steadiness is a flat line and wandering is a wobbly one,
                   which is what a coefficient of variation *is*; a break in
                   the line is a frame that was not voiced.
       the ground  the room, rising from the bottom. The gap between it and
                   the trace is the signal-to-noise ratio, so a loud room is
                   visibly crowding the voice rather than lighting a warning.
       the roof    the level. It thickens as the peak approaches full scale
                   and goes solid when the take is clipping, and the figure
                   presses down into it - the physical read of a level that
                   has nowhere left to go.
       the run     the continuous voiced stretch, against what the step
                   needs. It retreats when voicing breaks, because the
                   measurement itself does: the gate counts the longest
                   unbroken run, so a take that stops really does start that
                   count again, and a bar that kept its ground would be
                   lying about what would be stored.

     Nothing here is a verdict on a voice (PRODUCT.md:109). Every mark is
     about the recording, and colour never carries the judgement: there is
     one hue, the section's own flag stripe, and what changes when a check
     fails is a shape and a weight. A red-to-green meter is exactly what
     ADR-0012 forbids, and it would be a worse readout anyway - the
     information is *which* condition and by how much, and hue cannot say
     that while it is busy saying good or bad.

     Motion: tier 3 (DIRECTION.md). Data moves, the container does not, and
     only transform and opacity are animated, so under either reduced-motion
     path the app's duration clamp turns every reading into an instant cut
     rather than a tween. The trace is redrawn rather than transitioned, and
     the advice underneath is words, so nothing here depends on movement to
     be readable. */
  import { m } from '$lib/paraglide/messages';
  import { MAX_F0_CV, PEAK_CEILING, type QualityReport } from '$lib/audio/quality';
  import type { PitchFrame } from '$lib/audio/pitch';
  import type { Role } from '$lib/theme/roles';
  import { roleAttrs } from '$lib/components/kit/role';

  let {
    frames,
    report,
    targetSeconds,
    label,
    advice,
    role,
    compact = false,
    ...rest
  }: {
    frames: readonly PitchFrame[];
    report: QualityReport | null;
    /** The continuous voicing this step is working towards. */
    targetSeconds: number;
    label: string;
    /** What to do differently, already in words - the readout's own text. */
    advice: string[];
    role?: Role;
    /** The passage step's form: the same figure at a third the height,
        sitting on the action bar under a screenful of text somebody is busy
        reading. The vowel step is where the figure is the thing being
        looked at, and there it gets its full size. */
    compact?: boolean;
    [attribute: string]: unknown;
  } = $props();

  /* The drawing box. A viewBox rather than pixels so the figure is the width
     of whatever surface holds it, down to the 390px floor and up. */
  const WIDTH = 300;
  const ROOF_Y = 10;
  const BASE_Y = 92;
  /** Where the trace may travel: the band between roof and ground. */
  const TRACE_TOP = 24;
  const TRACE_BOTTOM = 78;
  const TRACE_MID = (TRACE_TOP + TRACE_BOTTOM) / 2;
  /** Half the trace band, in semitones. Six is wide enough that ordinary
      speech does not slam into the edges and narrow enough that a wobble
      the gate would fail is plainly visible. */
  const SEMITONE_RANGE = 6;

  /** The reference the trace is drawn around: the median of what is on
      screen, so the line sits in the middle of the band wherever a voice
      happens to be. The figure never says which pitch is the right one. */
  let reference = $derived.by(() => {
    const voiced = frames.filter((frame) => frame.hz !== null).map((frame) => frame.hz as number);
    if (voiced.length === 0) return null;
    const sorted = [...voiced].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  });

  /** The trace, as one polyline per unbroken voiced run: a gap in the
      voicing is a gap in the line, not a straight leap across it. */
  let runs = $derived.by(() => {
    if (!reference || frames.length === 0) return [];
    const step = frames.length > 1 ? WIDTH / (frames.length - 1) : WIDTH;
    const segments: string[] = [];
    let current: string[] = [];

    frames.forEach((frame, index) => {
      if (frame.hz === null) {
        if (current.length > 1) segments.push(current.join(' '));
        current = [];
        return;
      }
      const semitones = Math.max(
        -SEMITONE_RANGE,
        Math.min(SEMITONE_RANGE, 12 * Math.log2(frame.hz / reference))
      );
      const y = TRACE_MID - (semitones / SEMITONE_RANGE) * ((TRACE_BOTTOM - TRACE_TOP) / 2);
      current.push(`${(index * step).toFixed(1)},${y.toFixed(1)}`);
    });
    if (current.length > 1) segments.push(current.join(' '));
    return segments;
  });

  /** The room, as a share of the trace band. Full at 0 dB, gone by 24 dB:
      the gate's floor is 15, so a take that is about to fail shows the
      ground already well up into the voice's own space. */
  let roomFraction = $derived(report ? Math.max(0, Math.min(1, 1 - report.snrDb / 24)) : 0);

  /** The roof's weight follows the peak: hairline while there is headroom,
      four pixels and solid once the take is against the rails. */
  let roofWeight = $derived(
    report ? 1 + Math.max(0, (report.peak - 0.5) / (PEAK_CEILING - 0.5)) * 3 : 1
  );
  let clipping = $derived(report?.failed.includes('clipping') ?? false);

  let runFraction = $derived(
    report ? Math.max(0, Math.min(1, report.longestVoicedSeconds / targetSeconds)) : 0
  );

  /** The held stretch in words, which is what carries this figure under
      either reduced-motion path: the marks stop moving, the sentence does
      not (DIRECTION.md's reduced-motion contract). */
  let heldLabel = $derived(
    m.vb_gauge_run({ seconds: (report?.longestVoicedSeconds ?? 0).toFixed(1) })
  );

  /** How far the take has wandered, as a share of what the gate allows.
      Drawn as the trace's own stroke width rather than as a fifth mark: a
      steady note draws a fine line and a wandering one draws a heavy,
      unsettled one. */
  let traceWeight = $derived(
    report?.f0Cv != null ? 2 + Math.min(1.6, report.f0Cv / MAX_F0_CV) * 1.4 : 2
  );
</script>

<div
  class="vg"
  class:is-clipping={clipping}
  class:is-compact={compact}
  {...roleAttrs(role)}
  {...rest}
>
  <div class="vg-top">
    <span class="vg-label">{label}</span>
    <span class="vg-held">{heldLabel}</span>
  </div>

  <svg class="vg-figure" viewBox="0 0 {WIDTH} 100" preserveAspectRatio="none" aria-hidden="true">
    <!-- The roof: always there, and heavier as the level climbs towards
         full scale. -->
    <line class="vg-roof" x1="0" y1={ROOF_Y} x2={WIDTH} y2={ROOF_Y} stroke-width={roofWeight} />

    <!-- The take's own middle, so a flat line is visibly flat against
         something rather than just low in an empty box. It is the median of
         what is on screen and says nothing about which pitch is the right
         one. -->
    <line class="vg-mid" x1="0" y1={TRACE_MID} x2={WIDTH} y2={TRACE_MID} />

    <!-- The room, rising from the base. Drawn at its full height and
         scaled, rather than re-laid-out: the performance contract animates
         transform and opacity and nothing else (DIRECTION.md). -->
    <rect
      class="vg-room"
      x="0"
      y={TRACE_TOP}
      width={WIDTH}
      height={BASE_Y - TRACE_TOP}
      style="--vg-room: {roomFraction}"
    />

    {#each runs as points, index (index)}
      <polyline class="vg-trace" {points} stroke-width={traceWeight} />
    {/each}

    <line class="vg-base" x1="0" y1={BASE_Y} x2={WIDTH} y2={BASE_Y} />
  </svg>

  <div class="vg-run" aria-hidden="true">
    <span class="vg-run-fill" style="--vg-run: {runFraction}"></span>
  </div>

  <p class="vg-advice" aria-live="polite">{advice.join(' ')}</p>
</div>

<style>
  .vg {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    background: var(--surface);
    border: 1px solid var(--outline);
    border-radius: var(--r-card);
    padding: var(--space-4);
  }

  /* On the action bar the frame would be a second card floating over the
     first, so the bar's version drops it and keeps the marks. */
  .vg.is-compact {
    background: none;
    border: 0;
    padding: 0;
    gap: var(--space-1);
  }

  .vg-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .vg-label {
    font-size: var(--text-sm);
    color: var(--muted);
  }

  .vg-held {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
  }

  .vg-mid {
    stroke: var(--role-wash);
    stroke-width: 1;
  }

  .vg-figure {
    width: 100%;
    height: 116px;
    display: block;
    /* Pressing into the ceiling: the whole figure sits 2px lower once the
       take is clipping, which is the only movement in here that is not a
       number changing. Transform, so the duration clamp can flatten it. */
    transform: translateY(0);
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .vg.is-clipping .vg-figure {
    transform: translateY(2px);
  }

  .vg.is-compact .vg-figure {
    height: 40px;
  }

  .vg-roof,
  .vg-base {
    stroke: var(--outline);
    stroke-linecap: round;
  }

  .vg-base {
    stroke-width: 1;
  }

  .vg.is-clipping .vg-roof {
    stroke: var(--role-draw);
  }

  .vg-room {
    fill: var(--role-wash);
    transform-box: fill-box;
    transform-origin: bottom;
    transform: scaleY(var(--vg-room, 0));
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .vg-trace {
    fill: none;
    /* --role-draw, the flag's own stripe: a drawn mark takes the band
       undiluted, and the contrast-corrected version is for text and for a
       glyph on a tint of itself (kit.css). */
    stroke: var(--role-draw);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .vg-run {
    height: 4px;
    border-radius: 999px;
    background: var(--role-wash);
    overflow: hidden;
  }

  .vg-run-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--role-draw);
    transform-origin: left center;
    transform: scaleX(var(--vg-run, 0));
    transition: transform var(--dur-fast) var(--ease-out);
  }

  .vg-advice {
    margin: 0;
    /* One line of room kept whether or not there is anything to say, so the
       figure does not jump up the screen the moment a check clears. */
    min-height: calc(var(--text-sm) * 1.5);
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--role-ink);
  }

  .vg-advice:empty {
    min-height: calc(var(--text-sm) * 1.5);
  }
</style>

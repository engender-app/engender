<script lang="ts">
  /* The quality gate, drawn while the take is still happening (phase 5
     deepening ticket 15), now on an absolute axis (phase 8 features
     ticket 09, ADR-0059).

     This is the only live audio component in the tree, deliberately: a
     second one drifts from the gate it is supposed to be showing, and the
     screen would then be encouraging a take the save rejects.

     It has one caller now, the practise tab, and that is the whole of where
     a live curve belongs. Making a benchmark draws none: a benchmark is a
     measurement and its picture is the take, drawn on the summary from the
     track that was just stored (Alicja, 2026-09-04: "for a benchmark, its
     enough to get a graph right after finishing it"). What a take shows
     while it runs is the gate's own findings in words, which is the half of
     this component that carried it under either reduced-motion path
     anyway.

     Four conditions hold at once for three seconds of held breath, and the
     obvious build is four indicator dots going on and off. That version
     tells somebody *that* a take failed and never what to do about it, and
     four things blinking independently is the shape of a fault panel. This
     is one object instead, and each condition is the same measurement the
     gate makes, drawn as itself:

       the trace   the pitch of the last two seconds, frame by frame,
                   against an absolute Hz axis with the reference bands
                   behind it (PitchFigure.svelte). A break in the line is a
                   frame that was not voiced.
       the floor   the room, thickening up from the field's bottom edge. The
                   gap between it and the trace is the signal-to-noise
                   ratio, so a loud room is visibly crowding the voice
                   rather than lighting a warning.
       the roof    the level. It thickens as the peak approaches full scale
                   and goes solid when the take is clipping, and the whole
                   field presses down into it - the physical read of a level
                   that has nowhere left to go.
       the run     the continuous voiced stretch, against what the step
                   needs. It retreats when voicing breaks, because the
                   measurement itself does: the gate counts the longest
                   unbroken run, so a take that stops really does start that
                   count again, and a bar that kept its ground would be
                   lying about what would be stored.

     **What the absolute axis changed, and what it did not.** The trace used
     to be plotted in semitones around the median of whatever was on screen,
     which put a steady voice in the middle of the box wherever it actually
     was. That is the half Alicja called confusing and it is gone. The
     hundred-millisecond poll behind it has *not* changed: the trace's
     smoothness comes from the tracker's 10 ms frames, all of which are
     drawn, not from how often the screen asks for them, so an absolute axis
     needs no more readings per second than a relative one did. The reason
     the poll is slower than an animation frame is written down in
     stores/voiceBenchmark.ts and still holds.

     Nothing here is a verdict on a voice. Every mark is about the recording,
     and colour never carries the judgement: there is one hue, the section's
     own flag stripe, and what changes when a check fails is a shape and a
     weight. A red-to-green meter is exactly what ADR-0012 forbids, and it
     would be a worse readout anyway - the information is *which* condition
     and by how much, and hue cannot say that while it is busy saying good
     or bad.

     Motion: tier 3. Data moves, the container does not, and only transform
     and opacity are animated, so under either reduced-motion path the app's
     duration clamp turns every reading into an instant cut rather than a
     tween. The advice underneath is words, so nothing here depends on
     movement to be readable. */
  import { m } from '$lib/paraglide/messages';
  import { MAX_F0_CV, PEAK_CEILING, type QualityReport } from '$lib/audio/quality';
  import type { PitchFrame } from '$lib/audio/pitch';
  import { DEFAULT_PITCH_AXIS, pitchAxis, type BandLanguage, type PitchAxis } from '$lib/audio/bands';
  import type { Role } from '$lib/theme/roles';
  import PitchFigure from '$lib/components/PitchFigure.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { hzLabel } from '$lib/components/pitchBandCopy';

  let {
    frames,
    report,
    targetSeconds,
    label,
    advice,
    comfort = null,
    language,
    languageGuessed = false,
    role,
    ...rest
  }: {
    frames: readonly PitchFrame[];
    report: QualityReport | null;
    /** The continuous voicing this step is working towards. */
    targetSeconds: number;
    label: string;
    /** What to do differently, already in words - the readout's own text. */
    advice: string[];
    /** The person's own comfort band, when they have set one. */
    comfort?: { lowHz: number; highHz: number } | null;
    /** Whose figures the bands are (bands.ts's `bandsFor`). */
    language: BandLanguage;
    languageGuessed?: boolean;
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  /** The absolute axis, widened once and never narrowed again.

      `pitchAxis` is a pure function of what it is given, and what it is
      given here is a rolling two-second window. Recomputed per reading that
      made the "absolute" axis quietly elastic: one octave-error frame
      widened the field, the bands slid, and two seconds later the frame
      scrolled out of the window and everything slid back. Bands that move
      are the whole defect this ticket set out to fix, so the widening is
      kept rather than re-derived - the axis only ever grows, and only while
      one take is on screen. */
  let widened = $state<PitchAxis>(DEFAULT_PITCH_AXIS);
  $effect(() => {
    const wanted = pitchAxis({ hz: frames.map((frame) => frame.hz), comfort });
    if (wanted.lowHz < widened.lowHz || wanted.highHz > widened.highHz) {
      widened = {
        lowHz: Math.min(widened.lowHz, wanted.lowHz),
        highHz: Math.max(widened.highHz, wanted.highHz)
      };
    }
  });

  /* A fresh take starts from the default again, or a single bad frame in one
     take would keep the field stretched for every take after it. */
  $effect(() => {
    if (frames.length === 0) widened = DEFAULT_PITCH_AXIS;
  });

  let axis = $derived(widened);

  /** The room, as a share of the field's own height. Full at 0 dB, gone by
      24 dB: the gate's floor is 15, so a take that is about to fail shows
      the frame already well up into the voice's own space. */
  let roomFraction = $derived(report ? Math.max(0, Math.min(1, 1 - report.snrDb / 24)) : 0);

  /** The roof's weight follows the peak: hairline while there is headroom,
      four times that once the take is against the rails. */
  let roofWeight = $derived(
    report ? 1 + Math.max(0, (report.peak - 0.5) / (PEAK_CEILING - 0.5)) * 3 : 1
  );
  let clipping = $derived(report?.failed.includes('clipping') ?? false);

  let runFraction = $derived(
    report ? Math.max(0, Math.min(1, report.longestVoicedSeconds / targetSeconds)) : 0
  );

  /** The held stretch in words, which is what carries this figure under
      either reduced-motion path: the marks stop moving, the sentence does
      not. */
  let heldLabel = $derived(
    m.vb_gauge_run({ seconds: (report?.longestVoicedSeconds ?? 0).toFixed(1) })
  );

  /** How far the take has wandered, as a share of what the gate allows.
      Drawn as the trace's own stroke width rather than as a fifth mark: a
      steady note draws a fine line and a wandering one draws a heavy,
      unsettled one. */
  let traceWeight = $derived(
    report?.f0Cv != null ? 2.5 + Math.min(1.6, report.f0Cv / MAX_F0_CV) * 1.4 : 2.5
  );
</script>

<!-- The role goes on once, here: kit.css derives what a stripe paints with
     from the custom properties, and they inherit, so the figure and the run
     bar inside read the same one rather than each taking their own (kit/
     role.ts). -->
<div class="vg" {...roleAttrs(role)} {...rest}>
  <div class="vg-top">
    <span class="vg-label">{label}</span>
    <span class="vg-held">{heldLabel}</span>
  </div>

  <PitchFigure
    {axis}
    {comfort}
    trace={frames}
    {traceWeight}
    gate={{ roomFraction, roofWeight, clipping }}
    tickLabel={hzLabel}
    {language}
    {languageGuessed}
  >
    {#snippet underPlot()}
      <div class="vg-run" aria-hidden="true">
        <span class="vg-run-fill" style="--vg-run: {runFraction}"></span>
      </div>
    {/snippet}
  </PitchFigure>

  <p class="vg-advice" aria-live="polite">{advice.join(' ')}</p>
</div>

<style>
  .vg {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
</style>

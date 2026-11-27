<script lang="ts">
  /* Live quality readout. Pitch uses a fixed hertz axis; the vowel step
     uses semitones around its own note. Recording checks change shape,
     never verdict colour (ADR-0012, ADR-0059). */
  import { m } from '$lib/paraglide/messages';
  import { MAX_F0_CV, PEAK_CEILING, type QualityReport } from '$lib/audio/quality';
  import type { PitchFrame } from '$lib/audio/pitch';
  import {
    DEFAULT_PITCH_AXIS,
    pitchAxis,
    semitonesFrom,
    plainHzTicks,
    steadinessAxis,
    steadinessTicks,
    type PitchAxis
  } from '$lib/audio/bands';
  import { median } from '$lib/audio/series';
  import type { Role } from '$lib/theme/roles';
  import PitchFigure from '$lib/components/PitchFigure.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { hzLabel, semitoneLabel } from '$lib/components/pitchBandCopy';

  let {
    frames,
    report,
    targetSeconds,
    label,
    advice,
    comfort = null,
    reading = 'pitch',
    role,
    ...rest
  }: {
    frames: readonly PitchFrame[];
    report: QualityReport | null;
    /** The continuous voicing this step is working towards, and null where
        the task has no hold in it - free speech on the practise tab, where
        a run meter under the trace was the hold task's readout on a task
        that is not a hold. Null draws no run bar and
        prints no held stretch. */
    targetSeconds: number | null;
    label: string;
    /** What to do differently, already in words - the readout's own text. */
    advice: string[];
    /** The person's own comfort band, when they have set one. */
    comfort?: { lowHz: number; highHz: number } | null;
    /** Which of the two questions this figure is answering.

        `pitch` is where the voice is: absolute hertz, with the person's
        optional comfort bracket.

        `steadiness` is whether one note is being held: semitones either
        side of the note itself. The vowel step's
        task is keeping a pitch rather than reaching one, so a flat line is
        the whole answer and an absolute scale is not what the eye is on
        (Alicja, 2026-09-04). */
    reading?: 'pitch' | 'steadiness';
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  /** The note a steadiness figure is centred on: the median of what is on
      screen, which is the pitch actually being held. */
  let heldHz = $derived.by(() => {
    const voiced = frames.filter((frame) => frame.hz !== null).map((frame) => frame.hz as number);
    return voiced.length === 0 ? null : median(voiced);
  });

  /** The absolute axis, widened once and never narrowed again.

      `pitchAxis` is a pure function of what it is given, and what it is
      given here is a rolling two-second window. Recomputed per reading that
      made the "absolute" axis quietly elastic: one octave-error frame
      widened the field, and two seconds later the frame scrolled out and
      the axis shrank. The widening is kept rather than re-derived: it only
      grows, and only while
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

  let steadiness = $derived(reading === 'steadiness' ? steadinessAxis(heldHz) : null);
  let axis = $derived(steadiness ?? widened);

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
    report && targetSeconds !== null
      ? Math.max(0, Math.min(1, report.longestVoicedSeconds / targetSeconds))
      : 0
  );

  /** The held stretch in words, which is what carries this figure under
      either reduced-motion path: the marks stop moving, the sentence does
      not. Null where there is no hold to report. */
  let heldLabel = $derived(
    targetSeconds === null
      ? null
      : m.vb_gauge_run({ seconds: (report?.longestVoicedSeconds ?? 0).toFixed(1) })
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
    {#if heldLabel !== null}<span class="vg-held">{heldLabel}</span>{/if}
  </div>

  <PitchFigure
    {axis}
    {comfort}
    trace={frames}
    {traceWeight}
    gate={{ roomFraction, roofWeight, clipping }}
    ticks={steadiness && heldHz !== null ? steadinessTicks(heldHz) : plainHzTicks(axis)}
    tickLabel={steadiness && heldHz !== null
      ? (hz) => semitoneLabel(semitonesFrom(heldHz, hz))
      : hzLabel}
  >
    {#snippet underPlot()}
      {#if targetSeconds !== null}
        <div class="vg-run" aria-hidden="true">
          <span class="vg-run-fill" style="--vg-run: {runFraction}"></span>
        </div>
      {/if}
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
    color: var(--text-2);
  }

  .vg-held {
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
    color: var(--role-ink);
  }

  .vg-run {
    height: 4px;
    border-radius: 2px;
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

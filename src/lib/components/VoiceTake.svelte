<script lang="ts">
  /* A finished benchmark, drawn (phase 8 features ticket 09, ADR-0059).

     The take the numbers came from: pitch over time from the stored track,
     the p10-p90 span as a band and the median as a line, on the same
     absolute axis and behind the same reference bands the live gauge used
     while it was being recorded (PitchFigure.svelte). That continuity is
     the point - a person reads their take against the picture they were
     just watching, not against a second chart with its own scale.

     The span is p10 to p90 and not minimum to maximum. That is what the row
     stores, audio/pitch.ts says why at length, and a true minimum would
     mostly display one creaky frame at the end of a sentence.

     **A benchmark with no track.** Every benchmark taken before schema v58
     has none, because the frames were summarized and dropped, and no amount
     of work brings them back. Those get a sentence saying so rather than an
     empty field: a chart with bands and no trace looks like a take that had
     no voice in it, which is a different and much worse claim.

     Motion: tier 3, one authored moment. The trace uncovers from the left,
     oldest to newest, so the take is drawn in the direction it was spoken -
     the same gesture AreaChart's first draw makes, and for the same reason.
     Under reduced motion it is an instant cut; the bands and the figures do
     not move at all. */
  import { m } from '$lib/paraglide/messages';
  import { decodePitchTrack } from '$lib/audio/track';
  import { pitchAxis, type BandLanguage } from '$lib/audio/bands';
  import type { Role } from '$lib/theme/roles';
  import PitchFigure from '$lib/components/PitchFigure.svelte';
  import { roleAttrs } from '$lib/components/kit/role';
  import { hzLabel } from '$lib/components/pitchBandCopy';
  import { wipe } from '$lib/motion/reveal';

  let {
    pitchTrack,
    medianHz,
    p10Hz,
    p90Hz,
    comfort = null,
    language,
    languageGuessed = false,
    captionShared = false,
    role,
    ...rest
  }: {
    /** The row's own column, as audio/track.ts encoded it. Null for a
        benchmark from before it existed. */
    pitchTrack: string | null;
    medianHz: number;
    p10Hz: number;
    p90Hz: number;
    comfort?: { lowHz: number; highHz: number } | null;
    /** Whose figures the bands are: the language of the passage this
        benchmark was read from, which the row stores (bands.ts's
        `bandLanguageOf`). */
    language: BandLanguage;
    languageGuessed?: boolean;
    /** Passed straight to the figure: two takes side by side share one
        caption (PitchBandsCaption.svelte). */
    captionShared?: boolean;
    role?: Role;
    [attribute: string]: unknown;
  } = $props();

  let trace = $derived(decodePitchTrack(pitchTrack));

  /** The axis holds the take's own figures whether or not its track
      survived, so the span and the median of an old benchmark are still
      drawn where they belong. */
  let axis = $derived(
    pitchAxis({ hz: [...(trace?.map((frame) => frame.hz) ?? []), medianHz, p10Hz, p90Hz], comfort })
  );
</script>

<div class="vt" {...roleAttrs(role)} {...rest}>
  {#if trace}
    <div class="vt-draw" in:wipe>
      <PitchFigure
        {axis}
        {comfort}
        {trace}
        span={{ lowHz: p10Hz, highHz: p90Hz }}
        {medianHz}
        tickLabel={hzLabel}
        {language}
        {languageGuessed}
        {captionShared}
      />
      <!-- The figure's own legend names the reference bands; these two marks
           are the take's, so they are named where the take is. Their values
           are in the line rather than beside a swatch, because the number is
           the thing somebody came for. -->
      <p class="vt-marks" data-vb-take-marks>
        {m.vb_take_marks({
          median: hzLabel(medianHz),
          low: hzLabel(p10Hz),
          high: hzLabel(p90Hz)
        })}
      </p>
    </div>
  {:else}
    <p class="vt-none" data-vb-no-track>{m.vb_take_no_track()}</p>
  {/if}
</div>

<style>
  .vt-draw {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .vt-marks {
    margin: 0;
    font-size: var(--text-xs);
    line-height: 1.5;
    color: var(--muted);
  }

  .vt-none {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--muted);
  }
</style>

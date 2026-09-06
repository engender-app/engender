<script lang="ts">
  /* The app's one progress bar (phase 9 audit ticket 11, ADR-0070).

     Before this there were three idioms and eight operations with none:
     `.rail` hand-wired at three call sites, conversion's callback through
     the boot state machine, and photo-journey's (done, total) shown as
     button-label text, against archive export, archive import and verify,
     the two Daylio imports, auto-export, OCR and the pre-migration restore,
     all of which showed a disabled button and a static word for operations
     measured in minutes.

     The shape is `.rail`'s (components.css), which is the point: this
     wraps that primitive rather than drawing a fourth one. What it adds is
     the timing - progress.svelte.ts holds the run - and the two states
     `.rail` alone cannot say: a sweep for an operation that does not know
     how much is left, and a number for one that does.

     Announcement is split on purpose. The sentence is the live region, so
     a stage change ("Copying photos" to "Writing your journal") is spoken;
     the percent sits in the bar's own aria-valuenow instead, where it is
     available without being read out four times a second. */
  import { m } from '$lib/paraglide/messages';
  import { progressPercent } from './progress';
  import type { ProgressRun } from './progress.svelte';

  let {
    run,
    label,
    handle
  }: {
    run: ProgressRun;
    /** What is happening, in a sentence. Changes as the operation moves
        between stages; the caller owns the wording. */
    label: string;
    /** The walkthrough's grip on this particular bar, since a screen can
        hold more than one. Required: the export screen carries five, and a
        bar with no handle is one no flow can wait on. */
    handle: string;
  } = $props();

  let percent = $derived(progressPercent(run.fraction));
</script>

{#if run.visible}
  <div class="progress" data-progress={handle}>
    <div class="progress-head">
      <span class="progress-label" role="status">{label}</span>
      {#if percent !== null}
        <span class="progress-percent">{m.progress_percent({ percent: String(percent) })}</span>
      {/if}
    </div>
    <div
      class="rail"
      class:is-sweeping={run.fraction === null}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
    >
      <!-- Two elements rather than one that swaps its transform. A run can
           begin indeterminate and become determinate part way - the lab
           scan does exactly that, sweeping while Tesseract loads and then
           filling once it is reading - and cancelling a running animation
           on an element that also carries a transform transition leaves
           the transition's start value up to the browser. In Chromium's
           reading the fill would flash to the track's full width for a
           frame before collapsing back to the first real fraction. A
           fresh element has no previous value to transition from, so it
           takes the fraction directly. -->
      {#if run.fraction === null}
        <i></i>
      {:else}
        <i style={`transform: scaleX(${run.fraction})`}></i>
      {/if}
    </div>
    {#if run.cancellable}
      <button
        class="btn btn-ghost press progress-stop"
        type="button"
        data-progress-stop
        disabled={run.stopping}
        onclick={() => run.cancel()}
      >
        <span>{run.stopping ? m.progress_stopping() : m.progress_stop()}</span>
      </button>
    {/if}
  </div>
{/if}

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  .progress-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .progress-label {
    color: var(--text-2);
    font-size: var(--text-sm);
  }
  /* At full text weight while the sentence beside it is secondary: the
     number is the fact and the sentence is what the fact is about, and a
     row where both are --text-2 makes the reader find the number rather
     than land on it. Tabular figures so it does not shuffle the sentence
     sideways every time it passes a 1. */
  .progress-percent {
    color: var(--text);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
  /* Under the bar and aligned to its right edge, where the percentage
     already is: the eye is on that side of the bar reading the number, and
     the way out belongs next to what it is a way out of rather than back
     under the sentence. Trimmed to the secondary weight of a way out - a
     `.btn`'s own padding is sized for a primary action and put "Stop"
     visibly inside the bar's left edge, which read as a stray word. The
     44px height is kept whole (SH-102): what shrinks is the padding and
     the type, never the target. */
  .progress-stop {
    align-self: flex-end;
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
  }

  /* The mark moves, not its container (DIRECTION.md, tier 3): a segment
     travelling the track, not a track that fills. Its own keyframe rather
     than `breathe` - that 7s pulse is Home's sun and belongs to Home alone
     (ADR-0050/0051, ADR-0070).

     Written as one transform with `linear` timing rather than an eased
     one, because the pass has to loop: an ease-out per cycle would land
     slowly and then snap back to full speed at the restart. The
     acceleration is in the keyframe spacing instead, and the segment
     stretches as it speeds up and settles back as it slows - it carries
     its own weight across rather than sliding at a constant width.

     It starts and ends off the track at both ends, so the loop's own cut
     happens where nothing is drawn and each pass reads as a separate
     sweep rather than as a treadmill. */
  .rail.is-sweeping i {
    transform-origin: left center;
    animation: progress-sweep var(--dur-sweep) linear infinite;
  }
  @keyframes progress-sweep {
    0% {
      transform: translateX(-50%) scaleX(0.45);
    }
    22% {
      transform: translateX(-22%) scaleX(0.5);
    }
    55% {
      transform: translateX(38%) scaleX(0.66);
    }
    78% {
      transform: translateX(78%) scaleX(0.5);
    }
    100% {
      transform: translateX(100%) scaleX(0.45);
    }
  }

  /* Substitute, not delete (the reduced-motion contract): the clamp would
     turn an infinite loop into a restart-every-millisecond strobe, which
     is MO-001's finding about `breathe`, so the sweep stops outright and
     what stands in for it is a full track. The operation is still visibly
     under way, the sentence still says which part of it, and nothing
     moves. */
  :global(html[data-a11y-motion='reduce']) .rail.is-sweeping i {
    animation: none;
    transform: none;
    opacity: 0.5;
  }
  @media (prefers-reduced-motion: reduce) {
    .rail.is-sweeping i {
      animation: none;
      transform: none;
      opacity: 0.5;
    }
  }
</style>

<script lang="ts">
  /* That a voice is arriving, on the one step that cannot show a graph
     (phase 8 features ticket 09, Alicja 2026-09-04: "during reading the
     passage, there should be some kind of a basic feedback to let the user
     know that their voice is being recorded successfully").

     **One variable, so it needs no scale.** Presence is true or not true at
     each moment and has no magnitude, which is exactly why it fits here:
     the pitch figure left this step because it needed 148px and a gutter to
     mean anything, and a mark that means something without either is the
     only kind that can replace it. The rail is the last two seconds, the
     filled stretches are where the tracker found a voice, and a gap is a
     gap. Nothing at all is an empty rail.

     **Not a level meter**, which is what a recorder usually shows. Loudness
     is not what "recording successfully" means here, and the gate already
     speaks to level and to the room in words a few lines below. A bar
     wobbling with volume answers a question nobody reading a passage aloud
     was asking; whether the words are landing is the one they were.

     **The reading it gives is honest in every state.** Reading a passage
     leaves gaps - breaths, commas, the ends of sentences - so a ribbon with
     gaps in it is a correct picture of a good take, and this is why it is
     spans rather than a single lamp that would blink at every comma. What a
     person is looking for is that the rail is not empty and not one long
     hole, and both of those are visible at a glance without a number
     anywhere.

     Motion: tier 3, and barely. The spans are data and are redrawn per
     reading, so there is nothing to tween and nothing for the duration
     clamp to flatten; under either reduced-motion path the ribbon behaves
     the same. The words beside it carry it for anybody who cannot see it at
     all, which is the same contract the figure it replaced was held to. */
  import { voicedSpans } from '$lib/audio/voicing';
  import type { PitchFrame } from '$lib/audio/pitch';

  let {
    frames,
    label,
    ...rest
  }: {
    /** The window on screen, oldest first. */
    frames: readonly PitchFrame[];
    /** What the row is, for a screen reader. The marks are decoration to
        it: the sentence beside the ribbon is what actually reports. */
    label: string;
    [attribute: string]: unknown;
  } = $props();

  let spans = $derived(voicedSpans(frames));
</script>

<div class="vr" role="img" aria-label={label} {...rest}>
  <div class="vr-rail">
    {#each spans as span, index (index)}
      <span
        class="vr-span"
        data-voicing-span
        style="left: {(span.from * 100).toFixed(2)}%; width: {((span.to - span.from) * 100).toFixed(2)}%"
      ></span>
    {/each}
  </div>
</div>

<style>
  .vr {
    /* The rail's own height, kept whether or not anything is on it, so the
       passage above never shifts as the voice comes and goes. */
    padding: var(--space-1) 0;
  }

  .vr-rail {
    position: relative;
    height: 6px;
    border-radius: 999px;
    background: var(--role-wash);
    overflow: hidden;
  }

  .vr-span {
    position: absolute;
    top: 0;
    bottom: 0;
    border-radius: inherit;
    background: var(--role-draw);
  }
</style>

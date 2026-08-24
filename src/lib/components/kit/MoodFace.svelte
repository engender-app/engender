<script lang="ts">
  /* Mood's face at kit scale: on an entry in a day card, and inside a chip
     in the picker row.

     `disc` is off where the surface behind the face is already the mood's
     own colour. A chip is a filled tile, so a filled circle on it would be
     invisible; what is left is the ink, which the ramp guarantees at 4.5:1
     because carrying --text is what the ramp was built for.

     Still, always. The picker in the entry editor blinks, which is fine for
     five faces a person is choosing between; a day card carries one per
     entry, and six blinking faces on one screen is an ambient loop the
     motion system spends nowhere but Home. */
  import { MOOD_MOUTHS } from './moodFace';

  let {
    step,
    size = 22,
    disc = true
  }: {
    /** 1 to 5 on the mood ramp. */
    step: number;
    size?: number;
    disc?: boolean;
  } = $props();
</script>

<svg
  class="kit-face"
  class:has-disc={disc}
  viewBox="0 0 24 24"
  style={`--face-size: ${size}px; --face-mood: var(--mood-${step})`}
  aria-hidden="true"
>
  {#if disc}<circle cx="12" cy="12" r="10" class="kit-face-disc" />{/if}
  <circle cx="8.6" cy="9.5" r="1.25" class="kit-face-eye" />
  <circle cx="15.4" cy="9.5" r="1.25" class="kit-face-eye" />
  <path d={MOOD_MOUTHS[step]} class="kit-face-mouth" />
</svg>

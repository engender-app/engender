<script lang="ts">
  /* One mood's face, drawn once (phase 5 ticket 18).

     It came out of MoodPicker when quick add needed the same five faces in
     its fan. The alternative was a flat coloured dot there, which is the
     thing DIRECTION.md warns about under "the mood ramp is built to be sat
     on, not to be a dot": the ramp's steps are chosen so --text clears
     4.5:1 on top of them, and on the dark theme they are all dark, so as
     small dots on a dark panel they have almost no separation from each
     other. The face carries the value; the fill only tints it.

     The mouths come from the kit's own table (ticket 20, kit/moodFace.ts),
     which landed on main while this was being built. Two faces now exist on
     purpose and they are not the same drawing: the kit's is for a day card
     and a chip, sized small with an optional disc, while this one wears the
     picker's classes and so keeps its blink, its hover lift and its
     selected pop. What they must not have is two copies of the geometry,
     and after the merge they do not. Whether the two should converge is the
     kit's call rather than this ticket's. */
  import { MOOD_MOUTHS } from './kit/moodFace';

  let { value, size = 44 }: { value: number; size?: number } = $props();
</script>

<svg
  viewBox="0 0 24 24"
  class="mood-face"
  style={`width:${size}px;height:${size}px`}
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="10" class="mood-face-bg" style="fill:var(--mood-{value})" />
  <circle cx="8.6" cy="9.5" r="1.25" class="mood-face-ink" />
  <circle cx="15.4" cy="9.5" r="1.25" class="mood-face-ink" />
  <path d={MOOD_MOUTHS[value]} class="mood-face-mouth" />
</svg>

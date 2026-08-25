<script lang="ts">
  /* One mood's face, drawn once, for every surface that shows one (phase 5
     ticket 31).

     ## The two components are now one

     Ticket 18 built this for quick add's fan; ticket 20's surface kit landed
     its own `kit/MoodFace.svelte` for a day card and a chip. The two shared
     `moodFace.ts` and nothing else: one carried the picker's classes and its
     blink, the other was still and took a `disc` prop, and ticket 18's own
     comment left the question of whether they should converge to the kit.

     They converge. The reason is the eyes: the moment the drawing changed at
     all, the same change had to be made twice, in two files, in two shapes -
     which is the drift the shared mouth table existed to prevent and did not.
     What actually differed between them was a size, a disc and whether the
     eyes blink, and all three are props. What is left is one drawing, one set
     of classes, and one place in the stylesheet.

     `blink` is off by default, which is the important half of that. A day
     card can carry six entries, and six blinking faces on one screen is an
     ambient loop - the app spends its one loop on the flag sun and nowhere
     else (DIRECTION.md, tier 0). The two surfaces that ask for it are the
     ones where five faces are being chosen between rather than read: the
     picker in the entry editor, and quick add's fan.

     The blink's stagger comes from the step rather than from the element's
     position in its parent, which is what lets any surface have it. It used
     to be four `:nth-child` rules under `.mood-btn`, so the fan's five faces
     blinked in unison and anything else that ever showed a row of them would
     have too. */
  import { MOOD_EYES, MOOD_EYE_RADIUS, MOOD_FACES } from './moodFace';

  let {
    step,
    size = 28,
    blink = false
  }: {
    /** 1 to 5 on the mood ramp. */
    step: number;
    size?: number;
    blink?: boolean;
  } = $props();

  let face = $derived(MOOD_FACES[step]);
</script>

<svg
  class="mood-face"
  class:is-alive={blink}
  viewBox="0 0 24 24"
  style={`--face-size: ${size}px; --face-mood: var(--mood-${step}); --blink-delay: ${(step - 1) * 0.6}s`}
  aria-hidden="true"
>
  <circle cx="12" cy="12" r="10" class="mood-face-disc" />
  {#if face.lids}
    <path d={face.lids} class="mood-face-eye is-lids" />
  {:else}
    {#each MOOD_EYES as eye (eye.cx)}
      <circle cx={eye.cx} cy={eye.cy} r={MOOD_EYE_RADIUS} class="mood-face-eye" />
    {/each}
  {/if}
  <path d={face.mouth} class="mood-face-mouth" />
</svg>

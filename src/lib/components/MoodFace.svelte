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

     `alive` is off by default, which is the important half of that. A day
     card can carry six entries, and six faces looking around on one screen is
     an ambient loop where nothing is being chosen. The surfaces that ask for
     it are the ones where five faces are being chosen between rather than
     read: the picker in the entry editor, Home's chips, and quick add's fan.

     ## The eyes, and the two groups they sit in (phase 9 carpet ticket 01)

     The prop used to be called `blink`, and it turned on a 4.6s loop that
     closed the lids and nothing else - the same loop on every face, so a row
     of five was one blink crossing it over and over. It is now `alive`, and
     what it turns on is a face that looks around the room: three positions per
     cycle, each arrived at behind a closed lid the way a real saccade is, on
     five periods and five delays that never agree (moodGlance.ts). ADR-0072
     has why the app now spends two ambient loops instead of one.

     The eyes sit in two nested groups because two different things move them
     and neither should have to know about the other. The outer one is the
     gaze: where the row says to look, which is the finger crossing it or the
     face that was just picked. The inner one is the idle glance, which is the
     face's own business and pauses the moment the row has something to say.
     One `transform` on one group would have made those two authors of the same
     property, which is the mistake `.mood-face` already documents about its
     own `scale` and `translate`. */
  import { GAZE_REACH } from '$lib/motion/magnifier';
  import { MOOD_GLANCE, blinkCycle } from '$lib/motion/moodGlance';
  import { MOOD_EYES, MOOD_EYE_RADIUS, MOOD_FACES } from './moodFace';

  let {
    step,
    size = 28,
    alive = false,
    gaze = null,
    disc = true
  }: {
    /** 1 to 5 on the mood ramp. */
    step: number;
    /** A number is pixels. A CSS length lets a fluid cell hand it "100%":
        the calendar's cells are a seventh of whatever width the screen has,
        so the one surface that cannot name a pixel size is the one that
        most wants a face (phase 6 unprompted ticket 11). */
    size?: number | string;
    /** Whether this face looks around and blinks when nothing is happening.
        On for the three surfaces where a mood is being chosen; off, and so
        perfectly still, everywhere a mood is only being read. */
    alive?: boolean;
    /** Where the row is telling this face to look, -1 (hard left) to 1 (hard
        right), or null for "nothing is happening, carry on".

        The two are a different state and not a spelling of the same one: 0 is
        a face being told to look straight ahead because the finger is right
        on it, and its idle glance holds still while that is true. null is a
        row nobody is touching, and the glance runs. */
    gaze?: number | null;
    /** Off where the surface behind the face is already the mood's colour,
        or is two of them. A split calendar cell draws its own halves and
        the disc would cover them; the face is then the eyes and the mouth
        alone, which is exactly what it is on Daylio's split days. */
    disc?: boolean;
  } = $props();

  let face = $derived(MOOD_FACES[step]);
  let length = $derived(typeof size === 'number' ? `${size}px` : size);
  let glance = $derived(MOOD_GLANCE[step]);
  let vars = $derived(
    [
      `--face-size: ${length}`,
      `--face-mood: var(--mood-${step})`,
      `--look-cycle: ${glance.cycle}s`,
      `--look-delay: ${glance.delay}s`,
      `--look-dir: ${glance.direction}`,
      `--blink-cycle: ${blinkCycle(step)}s`,
      `--gaze: ${gaze ?? 0}`
    ].join('; ')
  );
</script>

<svg
  class="mood-face"
  class:is-alive={alive}
  class:is-held={gaze !== null}
  viewBox="0 0 24 24"
  style={vars}
  aria-hidden="true"
>
  {#if disc}<circle cx="12" cy="12" r="10" class="mood-face-disc" />{/if}
  <!-- Outer: the row's gaze. Inner: the face's own glance. GAZE_REACH is the
       travel both are measured in, and mood-faces.test.ts holds the stylesheet
       to the same number so the drawing cannot be turned out of its disc. -->
  <g class="mood-face-gaze" style={`--gaze-reach: ${GAZE_REACH}px`}>
    <g class="mood-face-look">
      {#if face.lids}
        <path d={face.lids} class="mood-face-eye is-lids" />
      {:else}
        {#each MOOD_EYES as eye (eye.cx)}
          <circle cx={eye.cx} cy={eye.cy} r={MOOD_EYE_RADIUS} class="mood-face-eye" />
        {/each}
      {/if}
    </g>
  </g>
  <path d={face.mouth} class="mood-face-mouth" />
</svg>

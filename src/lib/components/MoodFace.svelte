<script lang="ts">
  /* Use one mood drawing across readers and pickers. Size, disc and
     animation are props. alive defaults off so a list of entries stays
     still. Pickers can opt in while the user is choosing a mood.

     The outer eye group follows the row's gaze, such as a moving finger
     or the selected face. The inner group runs the idle glance and
     pauses when the row supplies a gaze. Separate groups let both move
     without competing for a transform. moodGlance.ts assigns each face
     its own period and delay, with three gaze positions per cycle.
     Transitions happen behind closed lids (ADR-0071). */
  import { GAZE_REACH } from '$lib/motion/magnifier';
  import { MOOD_GLANCE, blinkCycle } from '$lib/motion/moodGlance';
  import { MOOD_BLOCK, MOOD_EYES, MOOD_EYE_RADIUS, MOOD_FACES } from './moodFace';

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
      `--face-ink: var(--mood-${step}-ink)`,
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
  <!-- A rounded block rather than a disc: the circle was the one
       shape phase 10's language does not use, and a block holds a bigger
       drawing at the same size. `disc` keeps its name - what it means is
       "draw your own background", and a split calendar cell still says no. -->
  {#if disc}
    <rect
      x={MOOD_BLOCK.x}
      y={MOOD_BLOCK.y}
      width={MOOD_BLOCK.size}
      height={MOOD_BLOCK.size}
      rx={MOOD_BLOCK.radius}
      class="mood-face-disc"
    />
  {/if}
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

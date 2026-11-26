<script lang="ts">
  /* Draw the active flag at the field's top right, one ring per stripe
     or a disc for Polish. Read activeFlag
     reactively. A mount-only read could capture the localStorage mirror
     before SQLite loads the palette.

     Index keys keep rings mounted through palette and theme changes,
     so the CSS entrance runs once per mount. Settings remounts on theme
     change to replay it. */
  import { sunRings } from '$lib/motion/flagSun';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';

  let rings = $derived(sunRings(activeFlag.stripes, activeFlag.dark, activeFlag.palette));

  /* Sample data-nav at mount. A door transition already opens the
     named rings on --dur-slow and needs fully drawn snapshots.
     The 700ms entrance would duplicate that motion and capture
     tiny rings. Sampling once prevents the entrance starting
     when the navigation attribute clears. Keep it on cold boot. */
  const carried = typeof document !== 'undefined' && 'nav' in document.documentElement.dataset;

  /* A gate draws this sun too (tester-report-02 ticket 07), and a gate
     arrives as a cut and keeps still while someone types a secret: no
     entrance and no breathing. Resting at scale 1 is also what Today's sun
     is on the frames the opening draws, since its breathing waits for its
     delay, so the held sun is one drawing on both sides. */
  let { still = false }: { still?: boolean } = $props();
</script>

<div class="sun" class:is-carried={carried} class:is-still={still} aria-hidden="true" data-flag-sun>
  {#each rings as ring, i (i)}
    <i
      class="sun-ring"
      style={`--d: ${ring.diameter}px; --c: ${ring.color}; --in-delay: ${ring.inDelay}s; --breathe-delay: ${ring.breatheDelay}s`}
    ></i>
  {/each}
</div>

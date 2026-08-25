<script lang="ts">
  /* Home's flag sun (ticket 19, DIRECTION.md's tier 0): the active flag as
     one concentric ring per stripe, centred on the screen's top right
     corner. Replaces PrideAurora, a blurred wash of the same stripes shown
     on ten screens, which is deleted rather than restyled (ADR-0035).

     The stripes and the theme come from $lib/theme/activeFlag, which the
     shell refreshes in the same effect that stamps the palette on <html>.
     This used to read them itself in onMount, on the reasoning that "/" is
     its own route and so remounts on every genuine visit - which is true,
     and still lost the race: on a cold start the palette arrives from SQLite
     after boot, so a mount that happened in between drew the flag the
     localStorage mirror had a moment earlier. Changing the palette in
     Settings and walking back to Home showed the old flag's sun until the
     app was restarted, on the one screen the flag is the point of.

     The entrance is still a plain CSS animation on mount, which is what
     makes it play once per visit and never on a reactive update within one.
     A palette change while Home is open redraws the rings in the new
     flag's colours without replaying it - the rings are keyed by index, so
     they keep their elements. */
  import { sunRings } from '$lib/motion/flagSun';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';

  let rings = $derived(sunRings(activeFlag.stripes, activeFlag.dark));
</script>

<div class="sun" aria-hidden="true">
  {#each rings as ring, i (i)}
    <i
      style={`--d: ${ring.diameter}px; --c: ${ring.color}; --in-delay: ${ring.inDelay}s; --breathe-delay: ${ring.breatheDelay}s`}
    ></i>
  {/each}
</div>

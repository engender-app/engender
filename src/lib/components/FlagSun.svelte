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

  /* A door change draws the sun's arrival itself, ring by ring on the
     door's own clock (redesign ticket 28): every ring is pulled out of the
     screen's snapshot under a name of its own and opened from nothing,
     outermost first, inside --dur-slow. The 700ms entrance below would then
     be a second arrival running underneath the first - and worse, the new
     side is captured the instant this mounts, so the photograph the
     transition animates would be of seven rings at no size at all.

     Read once, here, rather than as a reactive expression: `data-nav` is on
     <html> for the length of the transition and is taken off at the end of
     it, and an expression that noticed it going would restart the entrance
     the moment the door change finished. What this asks is "did I mount
     inside a navigation", which is answered at mount and never again. A
     cold start has no data-nav and keeps the authored entrance, which is
     the one place it was ever meant to play. */
  const carried = typeof document !== 'undefined' && 'nav' in document.documentElement.dataset;
</script>

<div class="sun" class:is-carried={carried} aria-hidden="true" data-flag-sun>
  {#each rings as ring, i (i)}
    <i
      class="sun-ring"
      style={`--d: ${ring.diameter}px; --c: ${ring.color}; --in-delay: ${ring.inDelay}s; --breathe-delay: ${ring.breatheDelay}s`}
    ></i>
  {/each}
</div>

<script lang="ts">
  /* Home's flag sun (ticket 19, DIRECTION.md's tier 0): the active flag as
     one concentric ring per stripe, centred on the screen's top right
     corner. Replaces PrideAurora, a blurred wash of the same stripes shown
     on ten screens, which is deleted rather than restyled (ADR-0035).

     Stripes and theme are read once, from the DOM, rather than tracked
     reactively against `prefs`: `--motif-stripes` is the one source of
     truth every palette-aware surface reads (no parallel TS table to drift
     out of sync), and the only way to see a different palette here is to
     leave Home and come back - which already remounts this component fresh,
     since "/" is its own route and SvelteKit destroys and recreates a
     page's components on every navigation to a different route. That is
     also the entrance's cue: a plain CSS animation on mount already plays
     once per genuine visit and never replays for a reactive update within
     the same visit, so there is nothing here tracking "did we just enter
     Home" beyond the component existing at all. */
  import { onMount } from 'svelte';
  import { parseMotifStripes, sunRings, type SunRing } from '$lib/motion/flagSun';

  let rings = $state<SunRing[]>([]);

  onMount(() => {
    const stripes = parseMotifStripes(
      getComputedStyle(document.documentElement).getPropertyValue('--motif-stripes')
    );
    const dark = document.documentElement.dataset.theme === 'dark';
    rings = sunRings(stripes, dark);
  });
</script>

<div class="sun" aria-hidden="true">
  {#each rings as ring, i (i)}
    <i
      style={`--d: ${ring.diameter}px; --c: ${ring.color}; --in-delay: ${ring.inDelay}s; --breathe-delay: ${ring.breatheDelay}s`}
    ></i>
  {/each}
</div>

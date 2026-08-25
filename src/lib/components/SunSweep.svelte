<script lang="ts">
  /* A stroke chasing the sun's edge, one per stripe, in the stripe's own
     colour (phase 5 ticket 26, Alicja 2026-08-25).

     The same law as the navigation bar's travelling pill, on a curve instead
     of a line: a segment lengthens as it accelerates away and has recovered
     by the time it lands, because a thing being carried stretches and a
     thing being drawn does not. On the bar that is a scale on the axis of
     travel; here the axis is the arc, so what stretches is the dash.

     Why a stroke rather than something the performance contract already
     covers. What the sun does on this screen is grow, and growth alone
     reads as one object getting bigger rather than as the app being
     assembled - the step changed, and the only thing that answered was a
     size. The sweep is what answers: each ring is redrawn along its own
     edge, outside in, on the same 0.11s offset the rings already arrive on.

     It costs a `stroke-dashoffset` and a `stroke-dasharray` on one short
     path per stripe, which is between three and seven paths over a 350px
     region. DIRECTION.md's performance contract names transform and opacity
     because of tier 3's chart re-tween interpolating a 365-point path on the
     main thread; five quarter-arcs are not that, and the alternative - a
     masked element rotating about the corner - costs a full-region mask
     repaint per frame to express the same idea worse.

     The whole thing rests invisible: the strokes exist to play and stop, so
     opacity 0 is where they live and where every pass ends. That is what
     makes the reduced-motion path free - no sweep runs, and nothing is
     stranded half-drawn, because half-drawn is not a state this can rest
     in. */

  import { SUN_OUTER, sunRings } from '$lib/motion/flagSun';
  import { activeFlag } from '$lib/theme/activeFlag.svelte';

  let {
    /** Changed by the screen to replay the sweep. Keyed on rather than
        watched, so a pass is a fresh set of elements and each animation runs
        exactly once with nothing to reset. Any value that differs from the
        last one starts a pass, which is why the screen hands it the step and
        the flag together: both are reasons for the sun to redraw itself, and
        a counter that only knew about one of them left the flag step's own
        tap unanswered. */
    pass = 0
  }: { pass?: number | string } = $props();

  const CENTRE = SUN_OUTER / 2;
  /* Outside the sun, not on it. The first pass traced each ring along its
     own edge in its own colour, which is a stroke painted on the thing it
     matches: invisible, every time, on every flag. They run past the outer
     edge instead, one per stripe, fanning outward - so what sweeps is the
     flag's colours across the page rather than a highlight nobody can see.

     Both numbers are in the SVG's own units, so they scale with the sun:
     the desktop layout multiplies the whole thing and the gap between the
     arcs grows with it rather than staying a phone-sized hairline. */
  const CLEARANCE = 7;
  const SPACING = 9;

  let rings = $derived(sunRings(activeFlag.stripes, activeFlag.dark));

  /* The quarter that shows. The sun's centre is the window's top right
     corner, so the visible quadrant is the one below and to the left of it:
     from the point due left of centre round to the point due below it. */
  function quarter(radius: number): string {
    return `M ${CENTRE - radius} ${CENTRE} A ${radius} ${radius} 0 0 0 ${CENTRE} ${CENTRE + radius}`;
  }

  /** A quarter circumference, which is how long a full sweep of one ring
      is and therefore what the dash pattern is measured against. */
  const arcLength = (radius: number) => (Math.PI * radius) / 2;
</script>

{#key pass}
  <svg
    class="sun-sweep"
    viewBox={`0 0 ${SUN_OUTER} ${SUN_OUTER}`}
    width={SUN_OUTER}
    height={SUN_OUTER}
    fill="none"
    aria-hidden="true"
  >
    {#each rings as ring, i (i)}
      {@const radius = CENTRE + CLEARANCE + i * SPACING}
      {@const arc = arcLength(radius)}
      <path
        d={quarter(radius)}
        stroke={ring.color}
        style={`--arc: ${arc}; --seg: ${arc * 0.18}; --seg-peak: ${arc * 0.34}; --in-delay: ${ring.inDelay}s`}
      />
    {/each}
  </svg>
{/key}

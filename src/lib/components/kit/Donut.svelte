<script lang="ts">
  /* Parts of a whole where the parts have no order (phase 8 UX ticket 04,
     ADR-0058): share by tag, share by presentation, share by injection
     site. The question is what proportion, and nothing about a tag comes
     before another tag.

     A ring is the wrong drawing for anything on a scale, which is the
     other half of the rule: a donut destroys order, so mood's five steps
     in a ring cannot show mostly-the-middle-two - the shape somebody
     most often wants off a mood distribution. That case is
     OrderedStrip.svelte.

     Single hue (ADR-0012), like every other mark in the kit: the section's
     own stripe, the largest arc at full strength and each smaller one a
     further step diluted into the card. The ladder descends with the arcs
     rather than against them, so intensity says nothing length has not
     already said - which is the objection BarRows records against tinting
     its bars, answered here by the sort rather than ignored. What the
     ladder does buy is the one thing a bar chart never needs: a segment
     that can be told from the segment beside it, and matched to its own
     name.

     Because it needs that match, this is the kit's second legend, and the
     first one that is not the area chart's. The rule it is arguing with
     (tests/kit-surfaces.test.ts) refuses a legend on a chart whose marks
     carry their own values - and an arc cannot. There is nowhere on a
     segment to write "estradiol, 34%" that stays inside it at every
     share, so the names sit beside the ring and the swatch is what joins
     them to it. The alternative was labels around the ring on leader
     lines, which at phone width collide as soon as two small shares land
     next to each other.

     The centre carries the total rather than being decorative, which is
     the other thing a ring has that bars do not: a hole. */
  import { arcs, sliced, type Part } from '$lib/charts/parts';

  let {
    parts,
    restName,
    total,
    note
  }: {
    parts: Part[];
    /** What the slice standing in for everything past the cap is called. */
    restName: string;
    /** The whole, formatted by the caller - the ring never reads the unit. */
    total: string;
    /** What the total counts: entries, days, doses. */
    note: string;
  } = $props();

  /* The ring's own units. A viewBox of 100 and a radius of 40 leaves the
     stroke room to sit inside the box at any rendered size, and the hole
     it leaves is 68 units wide, which is what the total has to fit in. */
  const R = 40;
  const CIRC = 2 * Math.PI * R;

  /* The tint ladder, one step per arc, largest first. Five values because
     MAX_SLICES is five - a sixth arc would need a step there is no room
     for between the last one and the card. */
  const WEIGHTS = ['100%', '86%', '72%', '58%', '44%'];

  let slices = $derived(sliced(parts, restName));
  let ring = $derived(
    arcs(
      slices.map((s) => s.share),
      CIRC
    )
  );

  /* A drawn arc may not be labelled 0%: a share under half a percent is
     still a reading somebody logged, and rounding it away would put a
     zero in the legend next to a segment that is visibly there. */
  const pct = (share: number) => (share > 0 && share < 1 ? '<1%' : `${Math.round(share)}%`);

  const round = (n: number) => Math.round(n * 1000) / 1000;
</script>

<div class="kit-donut" data-chart="donut">
  <div class="kit-donut-ring">
    <!-- The legend below is the reading; the ring is the same numbers drawn,
         and announcing both would read the distribution out twice. -->
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <!-- Rotated so the first arc starts at the top rather than at three
           o'clock, which is where a circle's own path begins. -->
      <g transform="rotate(-90 50 50)">
        <!-- The ring under the arcs, so the breaks between them read as
             breaks and a faint arc still sits on something. -->
        <circle class="kit-donut-track" cx="50" cy="50" r={R} />
        {#each slices as slice, i (slice.key)}
          <circle
            class="kit-donut-arc"
            cx="50"
            cy="50"
            r={R}
            style={`--arc-dash: ${round(ring[i].dash)}; --arc-rest: ${round(ring[i].rest)}; --arc-offset: ${round(ring[i].offset)}; --circ: ${round(CIRC)}; --slice-weight: ${WEIGHTS[i]}; --bar-index: ${i}`}
          ></circle>
        {/each}
      </g>
    </svg>
    <p class="kit-donut-total">
      <b class="kit-donut-whole" data-donut-total>{total}</b>
      <span class="kit-donut-note">{note}</span>
    </p>
  </div>

  <ul class="kit-donut-legend">
    {#each slices as slice, i (slice.key)}
      <li class="kit-donut-item" data-donut-slice={slice.key}>
        <span class="kit-donut-swatch" style={`--slice-weight: ${WEIGHTS[i]}`}></span>
        <span class="kit-donut-name">{slice.name}</span>
        <span class="kit-donut-share">{pct(slice.share)}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  /* Its own block rather than kit.css: every class here has exactly one
     consumer, which is what scripts/check-screens-classes.mjs asks to live
     beside its component - an unused rule is then a compiler warning
     instead of dead text in a shared sheet. The mark rules are still held
     to the kit's single-hue law; tests/kit-surfaces.test.ts reads the kit
     components' own style blocks alongside kit.css for exactly this.

     Ring and legend side by side, wrapping to stacked where the names need
     the width. Beside rather than below because a ring is square and a
     legend is five short lines - stacked, the card grew by the height of
     the legend for no reading it did not already have room for. */
  .kit-donut {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }

  .kit-donut-ring {
    position: relative;
    flex: 0 0 auto;
    width: 140px;
    height: 140px;
  }

  .kit-donut-ring svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* The ring under the arcs, so the breaks between them read as breaks and
     the faintest arc still sits on something rather than on the card. Same
     job .kit-dist-mark's hairline does for a tinted column. */
  .kit-donut-track {
    fill: none;
    stroke: var(--surface-2);
    stroke-width: 12;
  }

  .kit-donut-arc {
    fill: none;
    stroke: color-mix(in oklab, var(--role-draw) var(--slice-weight), var(--surface));
    stroke-width: 12;
    stroke-dasharray: var(--arc-dash) var(--arc-rest);
    stroke-dashoffset: var(--arc-offset);
    /* The ring draws itself on, arc by arc, on the horizontal bars' own
       stagger: a whole that arrives in parts is the reading. The keyframe
       interpolates the dash pattern from `0 --circ`, which is the same
       circumference the resting pair adds up to - a shorter pattern would
       repeat around the circle and a second arc would appear mid-entrance
       where there is no segment at all. */
    animation: kit-donut-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--bar-index, 0) * var(--stagger-step));
    /* And carries from one dataset's shares to the next, the way a bar
       carries its width - a picker changing what the ring counts is a
       re-tween, not a redraw. */
    transition-property: stroke-dasharray, stroke-dashoffset;
    transition-duration: var(--dur-slow);
    transition-timing-function: var(--ease-out);
  }

  @keyframes kit-donut-in {
    from { stroke-dasharray: 0 var(--circ); }
  }

  /* The hole, carrying the whole the arcs are shares of. Inset by a fifth
     each side so a long total wraps inside the ring rather than under it. */
  .kit-donut-total {
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0 20%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .kit-donut-whole {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: var(--weight-bold);
    letter-spacing: var(--display-track);
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .kit-donut-note {
    font-size: var(--text-xs);
    line-height: 1.2;
    color: var(--text-2);
  }

  /* The kit's second legend, and the first outside the area chart. An arc
     has nowhere to write its own name that stays inside it at every share,
     so the swatch is what joins a name to a segment. */
  .kit-donut-legend {
    flex: 1 1 150px;
    min-width: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--space-2);
  }

  .kit-donut-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .kit-donut-swatch {
    flex: 0 0 auto;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    border: 1px solid var(--outline);
    background: color-mix(in oklab, var(--role-draw) var(--slice-weight), var(--surface));
  }

  .kit-donut-name {
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kit-donut-share {
    margin-left: auto;
    font-size: var(--text-sm);
    font-weight: var(--weight-bold);
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>

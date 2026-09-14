<!-- The body map's figure (phase 10 redesign ticket 40).

     The body this screen has always drawn, with a point on each region and
     the reading in the point. Points rather than areas (Alicja, 2026-09-14:
     "no areas, just points to click"), and the same arrangement the app's
     other body map has always had - InjectionSiteMap draws twelve dots on a
     silhouette and shades each by how long ago its site was used - so the
     two maps differ only in the drawing under them, which is what the ticket
     asked for when it said to share the ramp and leave the artwork apart.

     What changed from the old figure is not the shape of it. It is that the
     dots carry the data, that every region has somewhere to be, that they
     land on the part of the body they name, and that a tap selects instead
     of leaving the screen:

     - The old `HOTSPOTS` table put `shoulders` on the left arm and
       `hands_feet` between the ankles, so the figure pointed at one thing
       and answered with another. Every point is checked against the piece of
       the silhouette it belongs to now (bodyRegionFigure.ts), so a
       coordinate cannot drift off its own body part unnoticed.
     - Two of the ten regions had no place at all, and a region somebody
       added themselves could never have one. `whole_body` is the body -
       literally what it means - and `body_facial_hair` and every custom
       region sit in the elsewhere cluster, in the same shape language.
     - The figure carried no data whatsoever; every intensity on the screen
       was in the two charts below.

     Real buttons over the drawing, never tappable SVG paths - the rule
     InjectionSiteMap.svelte already follows, for the same three reasons: a
     <button> gets the focus ring, the touch target and the accessible name
     for free. The SVG is the picture and the buttons are transparent boxes
     over it.

     Three channels, one each, the way the injection map's dots carry three:

     - The **fill** is the region's dominant-side mean on the role's own heat
       ramp. A region with no readings in the range is a hollow dot, because
       neither a large number nor zero reads as "never".
     - The **ring** is selection: which region the charts below describe.
     - The **mark** is mixed: a region whose readings in this range fell on
       both sides of the midpoint carries two short bars beside its dot, in
       the ink the role's ramp computes for that step. Beside rather than on,
       because a 22px dot has nowhere to put them and its own fill runs the
       whole ramp underneath; on the body the colour does not move, so the
       mark reads the same at every step.

     No text is set on a fill. Names live in the accessible name, in the
     elsewhere cluster where they sit beside a shape rather than on it, and
     in the heading under the figure. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { RegionSideReading } from '$lib/data/bodyMap';
  import type { BodyRegion } from '$lib/data/types';
  import {
    FIGURE_BOX,
    GROUND_SHAPES,
    GROUND_ZONE,
    MIN_STAGE_HEIGHT,
    MIN_STAGE_WIDTH,
    boxStyle,
    fillLevel,
    hitBox,
    markAt,
    placeRegions
  } from './bodyRegionFigure';
  import { rampStyle } from './mapChannels';
  import { roleAttrs } from './kit/role';
  import type { Role } from '$lib/theme/roles';

  let {
    regions,
    readings,
    selected,
    role,
    onSelect
  }: {
    regions: BodyRegion[];
    /** One entry per region the range has anything to say about. A region
        absent here has no readings in the range, which is a different
        statement from a reading of zero and is drawn differently. */
    readings: RegionSideReading[];
    selected: string;
    role: Role | undefined;
    onSelect: (region: string) => void;
  } = $props();

  let placement = $derived(placeRegions(regions));
  let byRegion = $derived(new Map(readings.map((reading) => [reading.region, reading])));

  /** The step's own fill and ink from the role's ramp, or nothing at level
      0 - an empty shape is drawn by the absence of a fill rather than by a
      colour standing for absence, which is the rule `rampStyle` carries for
      both of the app's body maps (mapChannels.ts). The ink comes with the fill because the
      mixed mark sits on it and has to be read off it; roles.ts computes one
      per step and kit-roles.test.ts holds every one to 4.5:1 against that
      step's own fill, so the mark is legible by construction rather than by
      a colour somebody eyeballed. */
  const paint = (level: number) =>
    role
      ? rampStyle(level, (step) => ({
          '--region-fill': role.heat[step].fill,
          '--region-ink': role.heat[step].ink
        }))
      : '';

  /** What a screen reader is told, which is the whole of what the colour
      says: a shape's fill and its mark are not readable, so the name
      carries the side, the intensity and the mixed mark in words. The
      intensity is native (ADR-0012) - the normalised number exists for
      colour and is never spoken either. */
  function regionLabel(region: BodyRegion): string {
    const reading = byRegion.get(region.id);
    if (!reading || reading.side === null || reading.value === null) {
      return m.body_region_reading_none_aria({ region: region.name });
    }
    const axis =
      reading.side === 'dysphoria' ? m.body_region_axis_dysphoria() : m.body_region_axis_euphoria();
    const value = String(Math.round(reading.value));
    return reading.mixed
      ? m.body_region_reading_mixed_aria({ region: region.name, axis, value })
      : m.body_region_reading_aria({ region: region.name, axis, value });
  }

  const levelOf = (id: string) => fillLevel(byRegion.get(id));
  const isMixed = (id: string) => byRegion.get(id)?.mixed === true;

  /** A hit box. Only the first of a region's zones is a real control: a
      region drawn in two places - hands and feet - is still one region with
      one name, so the rest are out of the tab order and hidden from the
      accessibility tree while staying tappable. */
  const hitAttrs = (region: BodyRegion, index: number) =>
    index === 0
      ? { 'aria-pressed': selected === region.id, 'aria-label': regionLabel(region), 'data-region': region.id }
      : { 'aria-hidden': true as const, tabindex: -1, 'data-region-also': region.id };

  const stageStyle = `min-width:${MIN_STAGE_WIDTH}px;min-height:${MIN_STAGE_HEIGHT}px;aspect-ratio:${FIGURE_BOX.width} / ${FIGURE_BOX.height}`;
</script>

<!-- A group rather than a radiogroup: picking a region says which one the
     charts below describe, and it neither commits anything nor excludes the
     others from view - every dot keeps showing its own reading whichever is
     picked. Toggle buttons say that; radios say "one of these applies". -->
<div class="region-figure" role="group" aria-label={m.body_regions_group()} {...roleAttrs(role)}>
  <div class="region-stage" style={stageStyle}>
    <!-- Decorative: every region's name is on its button, so the drawing
         carries nothing a screen reader needs. -->
    <svg
      class="region-art"
      viewBox="0 0 {FIGURE_BOX.width} {FIGURE_BOX.height}"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <!-- The body, which is whole_body: nine overlapping pieces with one
           fill, so they union into one figure. That fill is its own reading,
           and with none it is the card's second surface - which is what
           "nothing logged for the whole body" should look like. -->
      <g
        class="region-body"
        class:is-picked={selected === placement.ground?.id}
        style={paint(levelOf(placement.ground?.id ?? ''))}
      >
        {#each GROUND_SHAPES as shape, i (i)}
          <rect
            x={shape.left}
            y={shape.top}
            width={shape.width}
            height={shape.height}
            rx={shape.r}
            ry={shape.ry ?? shape.r}
          />
        {/each}
      </g>

      {#each placement.drawn as { point, region }, i (region.id)}
        <!-- Arriving top to bottom, one --stagger-step apart, which is the
             order the body reads in (rule 10, ticket 19's staggered blocks). -->
        <g
          class="region-point region-arrive"
          class:is-picked={selected === region.id}
          class:is-empty={levelOf(region.id) === 0}
          style="{paint(levelOf(region.id))};--region-i:{i + 1}"
          data-region-art={region.id}
          data-region-level={levelOf(region.id)}
        >
          {#each point.points as at, n (n)}
            <!-- The ring first, so the dot is drawn over it. -->
            <circle class="region-ring" cx={at.x} cy={at.y} r="6.2" />
            <circle class="region-dot" cx={at.x} cy={at.y} r="3.6" />
          {/each}
          {#if isMixed(region.id)}
            {@const at = markAt(point.points[0])}
            <g class="region-mark" data-region-mixed={region.id}>
              <rect x={at.x} y={at.y} width="4.4" height="1.1" rx="0.5" />
              <rect x={at.x} y={at.y + 2.2} width="4.4" height="1.1" rx="0.5" />
            </g>
          {/if}
        </g>
      {/each}
    </svg>

    <!-- The body's own button, under the dots: whole_body is reached
         wherever none of them is. -->
    {#if placement.ground}
      <button
        type="button"
        class="region-hit is-ground"
        style={boxStyle(GROUND_ZONE)}
        aria-pressed={selected === placement.ground.id}
        aria-label={regionLabel(placement.ground)}
        data-region={placement.ground.id}
        data-region-level={levelOf(placement.ground.id)}
        onclick={() => onSelect(placement.ground!.id)}
      ></button>
    {/if}

    {#each placement.drawn as { point, region } (region.id)}
      {#each point.points as at, i (i)}
        <button
          type="button"
          class="region-hit"
          style={boxStyle(hitBox(at, point.points.length))}
          {...hitAttrs(region, i)}
          onclick={() => onSelect(region.id)}
        ></button>
      {/each}
    {/each}
  </div>

  {#if placement.elsewhere.length}
    <!-- Docked to the figure and sharing its card, in the same shape
         language, because a region somebody added themselves is a region: it
         gets the affordance chest gets, filled by the same ramp, from the
         first time they add one. The name sits under the shape rather than
         on it - the one place this screen writes a region's name beside its
         fill. -->
    <div class="region-elsewhere">
      <p class="region-elsewhere-head">{m.body_map_elsewhere()}</p>
      <div class="region-elsewhere-shapes">
        {#each placement.elsewhere as region, i (region.id)}
          <button
            type="button"
            class="region-elsewhere-item press"
            aria-pressed={selected === region.id}
            aria-label={regionLabel(region)}
            data-region={region.id}
            data-region-level={levelOf(region.id)}
            style="{paint(levelOf(region.id))};--region-i:{placement.drawn.length + i + 1}"
            onclick={() => onSelect(region.id)}
          >
            <span
              class="region-chip region-arrive"
              class:is-empty={levelOf(region.id) === 0}
              class:is-mixed={isMixed(region.id)}
              aria-hidden="true"
            ></span>
            <span class="region-elsewhere-name">{region.name}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .region-figure {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  /* Scaled up: 180px was part of what made the old figure a doll.

     The minimum width and height come from the zones themselves
     (bodyRegionFigure.ts) rather than from a number written here, and that
     is the fix for a real defect: the module used to assume a 320px stage,
     the card's own padding rendered it at 314, and every one of the eight
     buttons came out 47.09px - each of them under the floor by the same 2%,
     because a zone is a percentage of whatever the stage turned out to be.
     With a floor on the box, a stage too narrow to hold 48px targets grows
     past its aspect ratio instead of shrinking them. */
  .region-stage {
    position: relative;
    width: 100%;
    max-width: 340px;
    margin: 0 auto;
  }

  .region-art {
    display: block;
    width: 100%;
    height: 100%;
    position: absolute;
    inset: 0;
  }

  /* The body. The old figure's own two values - a `--surface-2` fill and an
     `--outline` stroke - so it looks like the drawing it came from; the
     stroke is 1.2 rather than 1.5 because this box is 164 units tall where
     that one was 200.

     --region-fill replaces the fill when the whole body has a reading of
     its own, and is absent when it does not, which is what an unlogged body
     should be. */
  .region-body > rect {
    fill: var(--region-fill, var(--surface-2));
    stroke: var(--outline);
    stroke-width: 1.2;
    transition:
      fill var(--dur-med) var(--ease-out),
      stroke var(--dur-med) var(--ease-out);
  }

  /* A dot. The fill is the region's reading and the edge holds it against
     whatever the body is doing underneath - a dot's fill is a mix of the
     stripe into the card's surface, so it needs a line of its own rather
     than meeting the body across its own colour. */
  .region-dot {
    fill: var(--region-fill, var(--surface));
    stroke: var(--outline);
    stroke-width: 1.1;
    transition:
      fill var(--dur-med) var(--ease-out),
      stroke var(--dur-med) var(--ease-out),
      r var(--dur-med) var(--ease-out);
  }

  /* Nothing logged in this range: hollow, and a firmer edge, at the same
     size as the rest. Hollow against filled is the whole difference, and it
     has to hold against the faintest step of the ramp rather than against
     nothing - a smaller dot would also read as a region the map thinks less
     of (InjectionSiteMap's own note, and the same rule). */
  .region-point.is-empty .region-dot {
    fill: none;
    stroke-width: 1.6;
  }

  /* Selection is a ring around the dot rather than a change to it, because
     the dot itself is spoken for: picking a region may not erase what the
     map says about it. Drawn on every dot and revealed, so the ring has
     something to ease from. Never a travelling indicator between regions -
     two regions are not adjacent the way tabs are, and a pill flying across
     a torso is motion for its own sake. */
  .region-ring {
    fill: none;
    stroke: var(--role-mark, var(--accent));
    stroke-width: 1.6;
    opacity: 0;
    transition: opacity var(--dur-med) var(--ease-out);
  }

  .region-point.is-picked .region-ring {
    opacity: 1;
  }

  .region-point.is-picked .region-dot {
    stroke: var(--role-mark, var(--accent));
  }

  /* The mark's own bars. Held out of the dot's rules by class rather than
     by position, since both live in the region's group. */
  .region-mark > rect {
    fill: var(--region-ink, var(--text));
    stroke: none;
  }

  /* The arrival, top to bottom, one --stagger-step apart.

     A region clips open from its own left edge rather than fading up, which
     is rule 10's whole point - "blocks are solid objects on a flat page, so
     they move like objects: they slide in from their own edge and clip,
     never fade from nothing" - and it is the same movement `kit-block-in`
     gives a tile. An SVG group has no CSS layout box, so a percentage in
     `clip-path` resolves against its fill box, which is the group's own
     bounding box: 100% is exactly the shape's own width whatever part of
     the body it is. Nothing moves and nothing is painted at a destination it
     did not travel to; only how much of it is drawn changes.

     base.css flattens this under reduced motion. */
  .region-arrive {
    animation: region-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--region-i, 0) * var(--stagger-step));
  }

  @keyframes region-in {
    from { clip-path: inset(0 100% 0 0); }
    to { clip-path: inset(0); }
  }

  /* The cluster's chips are ordinary boxes, so they take the kit's own
     block arrival rather than the group's. */
  .region-chip.region-arrive {
    animation-name: region-chip-in;
  }

  @keyframes region-chip-in {
    from { clip-path: inset(-3px 100% -3px -3px round var(--r-block)); }
    to { clip-path: inset(-3px round var(--r-block)); }
  }

  /* The hit boxes. Transparent, and over the drawing: the touch target is a
     rectangle so a finger can find it, while the shape under it is free to
     be a hand or a jaw. */
  .region-hit {
    position: absolute;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    touch-action: manipulation;
    border-radius: var(--r-block);
  }

  .region-elsewhere {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-top: var(--space-4);
    border-top: 1px solid var(--outline);
  }

  .region-elsewhere-head {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .region-elsewhere-shapes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .region-elsewhere-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--touch-target);
    min-width: var(--touch-target);
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text);
  }

  /* The same shape language at row scale, filled by the same ramp. */
  .region-chip {
    display: block;
    width: 44px;
    height: 28px;
    border: 1.2px solid var(--outline);
    border-radius: var(--r-block);
    background: var(--region-fill, transparent);
    transition:
      background var(--dur-med) var(--ease-out),
      border-color var(--dur-med) var(--ease-out),
      border-width var(--dur-med) var(--ease-out);
  }

  .region-chip.is-empty {
    background: none;
    border-width: 1.6px;
  }

  .region-elsewhere-item[aria-pressed='true'] > .region-chip {
    border-color: var(--role-mark, var(--accent));
    border-width: 2.6px;
  }

  /* The mixed mark, at chip scale: the same two bars, in the same ink. */
  .region-chip.is-mixed {
    position: relative;
  }

  .region-chip.is-mixed::after {
    content: '';
    position: absolute;
    top: 5px;
    right: 5px;
    width: 10px;
    height: 6px;
    background: linear-gradient(
      var(--region-ink, var(--text)) 0 2px,
      transparent 2px 4px,
      var(--region-ink, var(--text)) 4px 6px
    );
  }

  .region-elsewhere-name {
    font-size: var(--text-sm);
  }
</style>

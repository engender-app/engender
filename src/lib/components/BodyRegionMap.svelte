<!-- The body map's figure (phase 10 redesign ticket 40).

     **The regions are the drawing, and the drawing is a body.** One
     silhouette tiled into panels, a panel per region, each parted from its
     neighbours by a seam of the card's own colour. A region is a piece of
     the body rather than a mark placed on one, which is what the four
     arrangements before this could not be at once: eight rounded rectangles
     in a column were regions and no body, a mannequin and a capsule
     silhouette were bodies the regions sat on top of, and dots on that
     silhouette carried the data without the figure being made of it
     (Alicja, 2026-09-14: "wrong proportions, looks janky and bad").

     What that buys, beyond looking like a body: the proportions are
     canonical rather than whatever the touch floor left over. Seven heads
     tall, crotch at half the height, fingertips at mid-thigh. A trunk band
     is a touch target because the figure is 528px tall at its smallest, not
     because the head was stretched until two dots fitted inside it.

     What changed from the old figure, besides the drawing:

     - The old `HOTSPOTS` table put `shoulders` on the left arm and
       `hands_feet` between the ankles, so the figure pointed at one thing
       and answered with another. Every panel is checked against the piece of
       the silhouette it belongs to now (bodyRegionFigure.ts).
     - Two of the ten regions had no place at all, and a region somebody
       added themselves could never have one. `whole_body` is the silhouette
       under the panels - literally what it means - and `body_facial_hair`
       and every custom region sit in the elsewhere cluster.
     - The figure carried no data whatsoever; every intensity on the screen
       was in the two charts below.

     Real buttons over the drawing, never tappable SVG paths - the rule
     InjectionSiteMap.svelte already follows, for the same three reasons: a
     <button> gets the focus ring, the touch target and the accessible name
     for free. The SVG is the picture and the buttons are transparent boxes
     over it.

     Three channels, one each, the way the injection map's dots carry three:

     - The **fill** is the region's dominant-side mean on the role's own heat
       ramp. A region with no readings in the range is an unfilled panel,
       because neither a large number nor zero reads as "never".
     - The **edge** is selection: which region the charts below describe.
     - The **mark** is mixed: a region whose readings in this range fell on
       both sides of the midpoint carries two short bars on its panel, in the
       ink the role's ramp computes for that step, which roles.ts holds to
       4.5:1 against that step's own fill.

     No text is set on a fill. Names live in the accessible name, in the
     elsewhere cluster's pills, and in the heading under the figure. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { RegionSideReading } from '$lib/data/bodyMap';
  import type { BodyRegion } from '$lib/data/types';
  import {
    FIGURE_BOX,
    GROUND_SHAPES,
    GROUND_ZONE,
    MARK,
    MIN_STAGE_HEIGHT,
    MIN_STAGE_WIDTH,
    boxStyle,
    fillLevel,
    markAt,
    markShape,
    matShape,
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
      both of the app's body maps (mapChannels.ts). The ink comes with the
      fill because the mixed mark sits on it and has to be read off it;
      roles.ts computes one per step and kit-roles.test.ts holds every one to
      4.5:1 against that step's own fill, so the mark is legible by
      construction rather than by a colour somebody eyeballed. */
  const paint = (level: number) =>
    role
      ? rampStyle(level, (step) => ({
          '--region-fill': role.heat[step].fill,
          '--region-ink': role.heat[step].ink
        }))
      : '';

  /** What a screen reader is told, which is the whole of what the colour
      says: a panel's fill and its mark are not readable, so the name carries
      the side, the intensity and the mixed mark in words. The intensity is
      native (ADR-0012) - the normalised number exists for colour and is
      never spoken either. */
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

  /** A button. Only the first of a region's boxes is a real control: a
      region drawn in several places - two shoulders, two hands and two feet
      - is still one region with one name, so the rest are out of the tab
      order and hidden from the accessibility tree while staying tappable. */
  const hitAttrs = (region: BodyRegion, index: number) =>
    index === 0
      ? { 'aria-pressed': selected === region.id, 'aria-label': regionLabel(region), 'data-region': region.id }
      : { 'aria-hidden': true as const, tabindex: -1, 'data-region-also': region.id };

  const stageStyle = `min-width:${MIN_STAGE_WIDTH}px;min-height:${MIN_STAGE_HEIGHT}px;aspect-ratio:${FIGURE_BOX.width} / ${FIGURE_BOX.height}`;
</script>

<!-- A group rather than a radiogroup: picking a region says which one the
     charts below describe, and it neither commits anything nor excludes the
     others from view - every panel keeps showing its own reading whichever
     is picked. Toggle buttons say that; radios say "one of these applies". -->
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
      <!-- The body, which is whole_body. Two passes over the same pieces:
           the first strokes them, the second fills over the strokes, so the
           union keeps its outer contour and loses every internal joint. Its
           fill is its own reading, and with none it is the card's second
           surface - which is what "nothing logged for the whole body" should
           look like. -->
      <g
        class="region-body"
        class:is-picked={selected === placement.ground?.id}
        style={paint(levelOf(placement.ground?.id ?? ''))}
      >
        <g class="region-body-edge">
          {#each GROUND_SHAPES as shape, i (i)}
            <rect x={shape.left} y={shape.top} width={shape.width} height={shape.height} rx={shape.r} />
          {/each}
        </g>
        <g class="region-body-face">
          {#each GROUND_SHAPES as shape, i (i)}
            <rect x={shape.left} y={shape.top} width={shape.width} height={shape.height} rx={shape.r} />
          {/each}
        </g>
      </g>

      {#each placement.drawn as { panel, region }, i (region.id)}
        <!-- Arriving top to bottom, one --stagger-step apart, which is the
             order the body reads in (rule 10, ticket 19's staggered blocks).

             The seam is painted under the panel rather than left as a gap,
             so a panel is held apart from the ground and from its neighbours
             whatever the two are filled with - two readings a step apart on
             the ramp are close enough to merge across a shared edge. -->
        <g
          class="region-panel region-arrive"
          style="{paint(levelOf(region.id))};--region-i:{i + 1}"
          data-region-art={region.id}
          data-region-level={levelOf(region.id)}
        >
          <g class="region-seam">
            {#each panel.shapes as shape, n (n)}
              {@const mat = matShape(shape)}
              <rect x={mat.left} y={mat.top} width={mat.width} height={mat.height} rx={mat.r} />
            {/each}
          </g>
          <g
            class="region-tile"
            class:is-picked={selected === region.id}
            class:is-empty={levelOf(region.id) === 0}
          >
            {#each panel.shapes as shape, n (n)}
              <rect x={shape.left} y={shape.top} width={shape.width} height={shape.height} rx={shape.r} />
            {/each}
            {#if isMixed(region.id)}
              {@const at = markAt(markShape(panel.shapes))}
              <g class="region-mark" data-region-mixed={region.id}>
                <rect x={at.x} y={at.y} width={MARK.width} height={MARK.height} rx="0.6" />
                <rect
                  x={at.x}
                  y={at.y + MARK.height + MARK.gap}
                  width={MARK.width}
                  height={MARK.height}
                  rx="0.6"
                />
              </g>
            {/if}
          </g>
        </g>
      {/each}
    </svg>

    <!-- The body's own button, under the panels: whole_body is reached
         wherever none of them is - the limbs, the seams, and the space
         beside the drawing. -->
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

    {#each placement.drawn as { panel, region } (region.id)}
      {#each panel.boxes as box, i (i)}
        <button
          type="button"
          class="region-hit"
          style={boxStyle(box)}
          {...hitAttrs(region, i)}
          onclick={() => onSelect(region.id)}
        ></button>
      {/each}
    {/each}
  </div>

  {#if placement.elsewhere.length}
    <!-- Docked to the figure and sharing its card. A region with no one
         place on a body - `body_facial_hair`, and every region somebody
         added themselves - is a pill here, which is the shape this screen
         has always given a region that has to carry its own name (Alicja,
         2026-09-14: "for the 'elsewhere' parts, we want to preserve the nice
         looking pills"). The reading rides in a swatch beside the name
         rather than in the pill's own fill, because nothing may be written
         on a region's fill. -->
    <div class="region-elsewhere">
      <p class="region-elsewhere-head">{m.body_map_elsewhere()}</p>
      <div class="region-elsewhere-pills">
        {#each placement.elsewhere as region, i (region.id)}
          <button
            type="button"
            class="tag-chip press region-pill region-arrive"
            class:is-selected={selected === region.id}
            aria-pressed={selected === region.id}
            aria-label={regionLabel(region)}
            data-region={region.id}
            data-region-level={levelOf(region.id)}
            style="{paint(levelOf(region.id))};--region-i:{placement.drawn.length + i + 1}"
            onclick={() => onSelect(region.id)}
          >
            <span
              class="region-swatch"
              class:is-empty={levelOf(region.id) === 0}
              class:is-mixed={isMixed(region.id)}
              aria-hidden="true"
            ></span>
            {region.name}
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

  /* The minimum width and height come from the buttons themselves
     (bodyRegionFigure.ts) rather than from a number written here, and that
     is the fix for a real defect: the module used to assume a 320px stage,
     the card's own padding rendered it at 314, and every one of the buttons
     came out 47.09px - each of them under the floor by the same 2%, because
     a box is a percentage of whatever the stage turned out to be. With a
     floor on the box, a stage too narrow to hold 48px targets grows past its
     aspect ratio instead of shrinking them. */
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

  /* The body. Pass one is the contour, pass two covers every joint inside
     it, so fifteen overlapping blocks read as one silhouette.

     --region-fill replaces the fill when the whole body has a reading of its
     own, and is absent when it does not, which is what an unlogged body
     should be. */
  .region-body-edge > rect {
    fill: var(--outline);
    stroke: var(--outline);
    stroke-width: 1.6;
    stroke-linejoin: round;
  }

  .region-body-face > rect {
    fill: var(--region-fill, var(--surface-2));
    stroke: none;
    transition: fill var(--dur-med) var(--ease-out);
  }

  .region-body.is-picked .region-body-edge > rect {
    fill: var(--role-mark, var(--accent));
    stroke: var(--role-mark, var(--accent));
    stroke-width: 2.6;
  }

  /* The seam: the panel grown back out to its band, in the card's own
     colour, under the panel. */
  .region-seam > rect {
    fill: var(--surface);
  }

  /* A panel. The fill is the region's reading; with none, the card's colour
     and a firmer edge, so undrawn never reads as the palest step of the
     ramp. */
  .region-tile > rect {
    fill: var(--region-fill, var(--surface));
    stroke: none;
    transition: fill var(--dur-med) var(--ease-out);
  }

  .region-tile.is-empty > rect {
    fill: var(--surface);
    stroke: var(--outline);
    stroke-width: 0.9;
  }

  /* Selection grows the panel in place and draws its edge. In place, and
     from the panel's own centre: nothing about a region's state is painted
     before it arrives there, so there is no frame where a shape is in
     neither state and none where one has teleported between them. Never a
     travelling indicator between regions - two regions are not adjacent the
     way tabs are, and a pill flying across a torso is motion for its own
     sake. */
  .region-tile {
    transform-box: fill-box;
    transform-origin: center;
    transition:
      transform var(--dur-med) var(--ease-out),
      stroke var(--dur-med) var(--ease-out);
  }

  .region-tile.is-picked {
    transform: scale(1.04);
  }

  .region-tile.is-picked > rect {
    stroke: var(--text);
    stroke-width: 0.9;
  }

  /* The mark's own bars. Held out of the panel's rules by class rather than
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
     bounding box: 100% is exactly the shape's own width whatever part of the
     body it is. Nothing moves and nothing is painted at a destination it did
     not travel to; only how much of it is drawn changes.

     base.css flattens this under reduced motion. */
  .region-arrive {
    animation: region-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--region-i, 0) * var(--stagger-step));
  }

  /* The resting clip is slack rather than flush with the bounding box: a
     picked panel scales up inside this group, and a clip-path of inset(0)
     resolves against the group's own fill box, so it would shave the growth
     off. */
  @keyframes region-in {
    from { clip-path: inset(-8% 100% -8% -8%); }
    to { clip-path: inset(-8%); }
  }

  /* The cluster's pills are ordinary boxes, so they take the kit's own block
     arrival rather than the group's. */
  .region-pill.region-arrive {
    animation-name: region-pill-in;
  }

  @keyframes region-pill-in {
    from { clip-path: inset(-3px 100% -3px -3px round var(--radius-pill)); }
    to { clip-path: inset(-3px round var(--radius-pill)); }
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

  .region-elsewhere-pills {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  /* The swatch carries what a panel's fill carries, at pill scale: the same
     ramp, the same hollow at level 0, the same two bars for mixed. It is
     beside the name rather than behind it, so the pill stays a pill and no
     text is ever set on a region's fill. */
  .region-swatch {
    flex: none;
    width: 20px;
    height: 14px;
    border-radius: var(--r-block);
    background: var(--region-fill, transparent);
    border: 1.2px solid var(--outline);
    transition: background var(--dur-med) var(--ease-out);
  }

  .region-swatch.is-empty {
    background: none;
    border-width: 1.6px;
  }

  .region-swatch.is-mixed {
    position: relative;
  }

  .region-swatch.is-mixed::after {
    content: '';
    position: absolute;
    top: 3px;
    right: 3px;
    width: 8px;
    height: 6px;
    background: linear-gradient(
      var(--region-ink, var(--text)) 0 2px,
      transparent 2px 4px,
      var(--region-ink, var(--text)) 4px 6px
    );
  }

  .region-pill.is-selected {
    border-color: var(--role-mark, var(--accent));
  }
</style>

<!-- The body map's figure (phase 10 redesign ticket 40, redrawn for phase 11
     ticket 47).

     **The regions are the drawing, and the drawing is a body.** One
     silhouette (bodySilhouette.ts, ADR-0087), and a region is a band of it,
     clipped, so every panel edge follows the body's own contour. A region is
     a piece of the body rather than a mark placed on one, which is what the
     four arrangements before ticket 40 could not be at once: eight rounded
     rectangles in a column were regions and no body, a mannequin and a
     capsule silhouette were bodies the regions sat on top of, and dots on
     that silhouette carried the data without the figure being made of it.

     What ticket 47 changed, and why. Ticket 40's figure was the right idea
     assembled out of nine rounded rectangles, each panel inset by a seam of
     card colour and an unread panel painted white - which is four bare
     boxes stacked on a grey body (Alicja, 2026-09-21: "it looks really bad,
     blocky, amateurish"). So:

     - the geometry is a drawn contour rather than a stack of blocks, with
       a shoulder slope, a neck that meets it, limbs that are not bars and
       feet that are not tabs. Neutrality is three measurements on the path
       rather than a ban on shape;
     - a panel is a band of that path, clipped to it, and neighbours are
       parted by a 1px hairline in the region's own ink (rule 9, 1 for a
       guide) rather than by a gap of card colour. The body stays one
       unbroken object;
     - a region with no readings takes the silhouette's own neutral fill and
       its hairline, so the part is still named but plainly unpainted. Never
       a faint tint: a little colour reads as a little data.

     Real buttons over the drawing, never tappable SVG paths - the rule
     InjectionSiteMap.svelte already follows, for the same three reasons: a
     <button> gets the focus ring, the touch target and the accessible name
     for free. The SVG is the picture and the buttons are transparent boxes
     over it.

     Three channels, one each, the way the injection map's dots carry three:

     - The **fill** is the region's dominant-side mean on the role's own heat
       ramp. A region with no readings in the range is unpainted, because
       neither a large number nor zero reads as "never".
     - The **edge** is selection: which region the charts below describe.
       Never a dimming of the others - the fill means intensity and nothing
       else.
     - The **mark** is mixed: a region whose readings in this range fell on
       both sides of the midpoint carries two short bars on its panel, in the
       ink the role's ramp computes for that step, which roles.ts holds to
       4.5:1 against that step's own fill.

     No text is set on a fill. Names live in the accessible name, in the
     elsewhere cluster's pills, and in the heading under the figure. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import { regionSummary, type RegionSideReading } from '$lib/data/bodyMap';
  import type { BodyRegion } from '$lib/data/types';
  import { FIGURE_BOX, SILHOUETTE_PATH } from './bodySilhouette';
  import {
    GROUND_ZONE,
    MARK,
    MIN_STAGE_HEIGHT,
    MIN_STAGE_WIDTH,
    boxStyle,
    fillLevel,
    markFor,
    placeRegions
  } from './bodyRegionFigure';
  import { bodyRegionAxisName } from '$lib/data/vocabulary/labels';
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

  /* Two clip paths per figure, and a page can hold more than one of these
     (the gallery holds four), so the ids are minted rather than written. */
  const uid = $props.id();
  const bodyClip = `${uid}-body`;
  const bandClip = (region: string) => `${uid}-band-${region}`;

  let placement = $derived(placeRegions(regions));
  let byRegion = $derived(new Map(readings.map((reading) => [reading.region, reading])));

  /** The step's own fill and ink from the role's ramp, or nothing at level
      0 - an unpainted panel is drawn by the absence of a fill rather than by
      a colour standing for absence, which is the rule `rampStyle` carries
      for both of the app's body maps (mapChannels.ts). The ink comes with
      the fill because the panel's hairline and the mixed mark are both read
      off it; roles.ts computes one per step and kit-roles.test.ts holds
      every one to 4.5:1 against that step's own fill. */
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
    const summary = regionSummary(byRegion.get(region.id));
    if (summary.kind === 'none') return m.body_region_reading_none_aria({ region: region.name });
    const axis = bodyRegionAxisName(summary.axis);
    const value = String(summary.value);
    return summary.mixed
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
      <defs>
        <clipPath id={bodyClip}>
          <path d={SILHOUETTE_PATH} />
        </clipPath>
        <!-- A region's own bands, which do three jobs at once: they clip its
             fill to the body, they clip the body's contour to the piece of
             it the region owns, and their width is the arrival. Putting the
             arrival here rather than on each group is what keeps the fill
             pass and the edge pass in step - a clip-path percentage on a
             <g> resolves against that group's own bounding box, and the two
             groups do not have the same one. -->
        {#each placement.drawn as { panel, region }, i (region.id)}
          <clipPath id={bandClip(region.id)}>
            {#each panel.bands as band, n (n)}
              <rect
                class="region-wipe"
                x={band.left}
                y={band.top}
                width={band.width}
                height={band.height}
                style="--band-w:{band.width};--region-i:{i + 1}"
              />
            {/each}
          </clipPath>
        {/each}
      </defs>

      <!-- The body, which is whole_body. Two passes over the same path: the
           first strokes it, the second fills over the strokes, so the union
           of its five pieces keeps its outer contour and loses every
           internal joint. Its fill is its own reading, and with none it is
           the card's second surface - which is what "nothing logged for the
           whole body" should look like. -->
      <g
        class="region-body"
        class:is-picked={selected === placement.ground?.id}
        style={paint(levelOf(placement.ground?.id ?? ''))}
      >
        <path class="region-body-edge" d={SILHOUETTE_PATH} />
        <path class="region-body-face" d={SILHOUETTE_PATH} />
      </g>

      <!-- The fills and the hairlines that part them, each clipped to the
           body and then to its own bands. One element carries both: a rect's
           stroke paints over its own fill, and at a boundary the lower
           band's fill covers the upper one's hairline and its own hairline
           redraws the line, so what is left is one 1px line in the lower
           region's ink. -->
      <g clip-path="url(#{bodyClip})">
        {#each placement.drawn as { panel, region } (region.id)}
          <g
            class="region-panel"
            class:is-empty={levelOf(region.id) === 0}
            clip-path="url(#{bandClip(region.id)})"
            style={paint(levelOf(region.id))}
            data-region-art={region.id}
            data-region-level={levelOf(region.id)}
          >
            {#each panel.bands as band, n (n)}
              <rect
                class="region-tile"
                x={band.left}
                y={band.top}
                width={band.width}
                height={band.height}
              />
            {/each}
            {#if isMixed(region.id)}
              {@const mark = markFor(region.id)}
              {#if mark}
                <g class="region-mark" data-region-mixed={region.id}>
                  <rect x={mark.at.x} y={mark.at.y} width={MARK.width} height={MARK.height} rx="0.4" />
                  <rect
                    x={mark.at.x}
                    y={mark.at.y + MARK.height + MARK.gap}
                    width={MARK.width}
                    height={MARK.height}
                    rx="0.4"
                  />
                </g>
              {/if}
            {/if}
          </g>
        {/each}
      </g>

      <!-- Selection, in a pass over every fill: the body's contour clipped
           to the picked region's own bands, and that region's band outlines
           on top of the hairlines rather than under the next region's fill.
           Every region has its group here and only the picked one has a
           width, which is what lets the edge grow from nothing on the panel
           that was tapped instead of appearing at it. The contour's stroke
           is twice the line that lands on the page: the clip keeps its
           inner half, the way the figure's own contour is drawn. -->
      <g clip-path="url(#{bodyClip})">
        {#each placement.drawn as { panel, region } (region.id)}
          <g
            class="region-edge"
            class:is-picked={selected === region.id}
            clip-path="url(#{bandClip(region.id)})"
            data-region-edge={region.id}
          >
            <path class="region-pick" d={SILHOUETTE_PATH} />
            {#each panel.bands as band, n (n)}
              <rect
                class="region-pick-band"
                x={band.left}
                y={band.top}
                width={band.width}
                height={band.height}
              />
            {/each}
          </g>
        {/each}
      </g>
    </svg>

    <!-- The body's own button, under the panels: whole_body is reached
         wherever none of them is - the limbs between a shoulder and a hand,
         the legs, and the space beside the drawing. -->
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

  /* The body. Pass one is the contour, pass two covers every internal joint
     inside it, so five overlapping pieces read as one silhouette.

     Every line in this figure is a px width with a non-scaling stroke
     rather than a width in the drawing's own units. The figure is scaled to
     whatever the stage turned out to be, so a width in units is a different
     line on a phone and on a desktop, and rule 9's weights are px: 1 for a
     guide, 2 for a series. The contour is stroked at twice its width and
     then filled over, so the line that lands on the page is its outer half.

     --region-fill replaces the fill when the whole body has a reading of its
     own, and is absent when it does not, which is what an unlogged body
     should be. */
  .region-body-edge {
    fill: var(--outline);
    stroke: var(--outline);
    stroke-width: 3px;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    transition: stroke-width var(--dur-med) var(--ease-out);
  }

  .region-body-face {
    fill: var(--region-fill, var(--surface-2));
    stroke: none;
    transition: fill var(--dur-med) var(--ease-out);
  }

  .region-body.is-picked .region-body-edge {
    fill: var(--role-mark, var(--accent));
    stroke: var(--role-mark, var(--accent));
    stroke-width: 5px;
  }

  /* A panel's fill: the region's reading, or the silhouette's own neutral
     surface with no reading at all. Never a tint of the ramp at level 0 -
     a little colour reads as a little data - and never the card's own
     colour either, which is what made an unread region look like a hole cut
     out of the body. */
  /* The fill, and the hairline that parts this panel from its neighbours,
     in the region's own ink at rule 9's 1px for a guide. The stroke is the
     band's whole outline: the two edges that cross the body are the
     partings, and the two down the sides of the band are outside the body
     and draw nothing - except at the shoulder, where the arm and the torso
     divide one piece of body between them and that edge is the seam. */
  .region-tile {
    fill: var(--region-fill, var(--surface-2));
    stroke: var(--region-ink, var(--text-2));
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    transition:
      fill var(--dur-med) var(--ease-out),
      stroke var(--dur-med) var(--ease-out);
  }

  /* Selection: an ink edge around the picked panel, and nothing else. The
     panel's own band is stroked at a series' 2px in --text, and the body's
     contour along that panel in the same ink, so the edge runs round the
     panel on the two sides that are the body's own contour as well as
     across the two that are its neighbours'.

     It grows from nothing on the panel that was tapped rather than
     appearing at it: nothing is painted at its destination before it
     travelled there, and there is no frame in which the edge is in neither
     place. Never a travelling indicator between regions - two regions are
     not adjacent the way tabs are, and a pill flying across a torso is
     motion for its own sake. */
  .region-pick,
  .region-pick-band {
    fill: none;
    stroke: var(--text);
    stroke-width: 0;
    vector-effect: non-scaling-stroke;
    transition: stroke-width var(--dur-med) var(--ease-out);
  }

  .region-edge.is-picked .region-pick {
    stroke-width: 4px;
  }

  .region-edge.is-picked .region-pick-band {
    stroke-width: 2px;
  }

  /* The mark's own bars, read off the fill they sit on. */
  .region-mark > rect {
    fill: var(--region-ink, var(--text));
    stroke: none;
  }

  /* The arrival, top to bottom, one --stagger-step apart.

     A region opens from its own edge rather than fading up, which is rule
     10's whole point - "blocks are solid objects on a flat page, so they
     move like objects: they slide in from their own edge and clip, never
     fade from nothing" - and it is the same movement `kit-block-in` gives a
     tile. It is the clip's own band that widens, so the fill, the hairline
     and the picked edge all arrive on the one movement; with the width
     animated to the band's own, a browser that will not animate an SVG
     geometry property simply draws the panel.

     base.css flattens this under reduced motion. */
  .region-wipe {
    animation: region-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--region-i, 0) * var(--stagger-step));
  }

  @keyframes region-in {
    from { width: 0; }
    to { width: calc(var(--band-w) * 1px); }
  }

  /* The cluster's pills are ordinary boxes, so they take the kit's own block
     arrival rather than the figure's. */
  .region-pill.region-arrive {
    animation: region-pill-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--region-i, 0) * var(--stagger-step));
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

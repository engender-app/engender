<!-- The body map's figure (phase 10 redesign ticket 40).

     The region shapes are the only thing drawn, and that is what makes the
     figure neutral. There is no body outline, so there is no contour to
     carry a waist, a bust or a set of hips; `whole_body` is the ground the
     other eight sit on, which is literally what it means and gives the
     arrangement its connective tissue without a label.

     This replaces a rect-and-circle silhouette with eight dots floating on
     top of it. The dots were the problem: the drawing under them had no
     matching parts, two of the ten regions had nowhere to go, a region
     somebody added themselves could never have a place at all, and the
     figure carried no data - every intensity on the screen was in the two
     charts below.

     Real buttons over the drawing, never tappable SVG paths - the rule
     InjectionSiteMap.svelte already follows, for the same three reasons: a
     <button> gets the focus ring, the touch target and the accessible name
     for free. Here there is no SVG at all. The shapes *are* the buttons, so
     the drawing and the hit targets cannot drift apart.

     Three channels, one each, the way the injection map's dots carry three:

     - The **fill** is the region's dominant-side mean on the role's own
       heat ramp. A region with no readings in the range has no fill at all,
       only its outline, because neither a large number nor zero reads as
       "never".
     - The **stroke colour** is selection: which region the charts below
       describe.
     - The **mark** is mixed: a region whose readings in this range fell on
       both sides of the midpoint carries two short bars in its corner. Its
       own channel rather than a third colour, and it takes the ink the
       role's ramp already computes for that exact step - held to 4.5:1
       against its own fill by tests/kit-roles.test.ts - so it is legible at
       the palest step and at the deepest alike.

       A dashed edge was the first attempt and measured 1.1:1 against its
       own fill at the deepest step in dark: a dash pattern is read by
       seeing its gaps, and at level 4 there were no gaps to see. The
       stroke was also already spoken for by selection.

     No text is set on a fill. A ramp would put every step through rule 11
     against its own colour across every palette and theme, which is what
     turned nonbinary's yellow to olive on ticket 07. Names live in the
     accessible name, in the elsewhere cluster where they sit beside a
     shape rather than on it, and in the heading under the figure. -->
<script lang="ts">
  import { m } from '$lib/paraglide/messages';
  import type { RegionSideReading } from '$lib/data/bodyMap';
  import type { BodyRegion } from '$lib/data/types';
  import { GROUND_SLOT, fillLevel, placeRegions, slotStyle } from './bodyRegionFigure';
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

  /** The step's own fill from the role's ramp, or nothing at level 0 - an
      empty shape is drawn by the absence of a fill rather than by a colour
      standing for absence. The ramp's steps are `roles.ts`'s, so a region
      here and a calendar cell shade one reading the same way and only the
      hue differs. */
  const fillStyle = (level: number) => {
    if (level === 0 || !role) return '';
    const step = role.heat[level];
    /* The ink beside the fill, always, because the mixed mark sits on the
       fill and has to be read off it. roles.ts computes one per step and
       kit-roles.test.ts holds every one of them to 4.5:1 against that
       step's own fill, so the mark is legible by construction rather than
       by a colour somebody eyeballed. */
    return `--region-fill:${step.fill};--region-ink:${step.ink}`;
  };

  /** What a screen reader is told, which is the whole of what the colour
      says: a shape's fill and its dashes are not readable, so the name
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

  /** Everything a shape wears, in one spread, so the figure and the
      elsewhere cluster cannot drift apart. `place` is the shape's own
      geometry where it has any - the cluster's items are laid out by flow
      and pass none. */
  const shapeAttrs = (region: BodyRegion, place = '') => {
    const reading = byRegion.get(region.id);
    const level = fillLevel(reading);
    return {
      'aria-pressed': selected === region.id,
      'aria-label': regionLabel(region),
      'data-region': region.id,
      'data-region-level': String(level),
      'data-region-mixed': reading?.mixed ? '' : undefined,
      style: [place, fillStyle(level)].filter(Boolean).join(';')
    };
  };
</script>

<!-- A group rather than a radiogroup: picking a region says which one the
     charts below describe, and it neither commits anything nor excludes the
     others from view - every shape keeps showing its own reading whichever
     is picked. Toggle buttons say that; radios say "one of these applies". -->
<!-- roleAttrs, or --role-mark is undefined and selection falls back to
     --accent: the shapes would then be filled in the flag's first colour
     and ringed in the palette's accent, which on trans is blue fills with a
     pink ring. Two colours for one area is exactly what rule 3 forbids. -->
<div class="region-figure" role="group" aria-label={m.body_regions_group()} {...roleAttrs(role)}>
  <div class="region-stage">
    {#if placement.ground}
      <!-- The ground is a region, not a backdrop: it carries whole_body's
           own reading and takes a tap like any other shape. It is under the
           eight rather than beside them because that is what "whole body"
           means, and because the eight then need no outline of their own to
           sit inside. -->
      <button
        type="button"
        class="region-shape is-ground press"
        {...shapeAttrs(placement.ground, slotStyle(GROUND_SLOT))}
        onclick={() => onSelect(placement.ground!.id)}
      ></button>
    {/if}

    {#each placement.slots as { slot, region }, i (region.id)}
      <!-- Arriving top to bottom, one --stagger-step apart, which is the
           order the body reads in (rule 10, ticket 19's staggered blocks). -->
      <button
        type="button"
        class="region-shape press region-arrive"
        {...shapeAttrs(region, `${slotStyle(slot)};--region-i:${i + 1}`)}
        onclick={() => onSelect(region.id)}
      ></button>
    {/each}
  </div>

  {#if placement.elsewhere.length}
    <!-- Docked to the figure, in the same shape language, because a region
         somebody added themselves is a region: it gets the shape chest
         gets, filled by the same ramp, from the first time they add one.
         The name sits under the shape rather than on it - the one place
         this screen writes a region's name beside its fill. -->
    <div class="region-elsewhere">
      <p class="region-elsewhere-head">{m.body_map_elsewhere()}</p>
      <div class="region-elsewhere-shapes">
        {#each placement.elsewhere as region (region.id)}
          <button
            type="button"
            class="region-elsewhere-item press"
            {...shapeAttrs(region)}
            onclick={() => onSelect(region.id)}
          >
            <span class="region-shape is-inline" aria-hidden="true"></span>
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

  /* Scaled up: 180px was part of what made the old figure a doll. The
     aspect ratio is FIGURE_BOX's, so the percentages the slots are written
     in land where bodyRegionFigure.test.ts says they do. */
  .region-stage {
    position: relative;
    width: 100%;
    max-width: 320px;
    aspect-ratio: 100 / 166;
    margin: 0 auto;
  }

  /* One shape, stated once, in all three places it appears: on the figure,
     as the ground under it, and at row scale in the elsewhere cluster.

     --region-fill is absent at level 0, which is how an undrawn region is
     drawn - the outline alone, firmer, the way the injection map's
     never-used dot is hollow rather than the pale end of its ramp. */
  .region-shape {
    border: 2px solid var(--outline);
    border-radius: var(--r-block);
    /* Two layers, and the lower one is opaque on purpose. A shape's fill is
       a mix of the stripe into the card's own surface (roles.ts), so it is
       only the colour it was computed to be when it is painted over that
       surface - and on the figure a shape is painted over whole_body's
       fill, not over the card. Without the base, a chest at level 2 on a
       whole_body at level 4 came out darker than a chest at level 2 on an
       empty one, which is a fill saying something about its neighbour. */
    background:
      linear-gradient(var(--region-fill, transparent), var(--region-fill, transparent)),
      var(--region-base, transparent);
    padding: 0;
    cursor: pointer;
    touch-action: manipulation;
    /* Grows in place. Both properties animate from whatever they currently
       are, so nothing is ever painted at its destination before it has
       travelled there. base.css flattens these under reduced motion. */
    transition:
      background var(--dur-med) var(--ease-out),
      border-color var(--dur-med) var(--ease-out),
      transform var(--dur-med) var(--ease-out);
  }

  .region-stage .region-shape {
    position: absolute;
    /* The eight sit on whole_body, and whole_body carries a reading of its
       own, so at the deep end of the ramp the ground was the same colour as
       everything on it and the figure read as one slab. A ring of the card's
       own surface, just outside each shape's edge, lifts them off it -
       every shape then meets the ground across a line of page rather than
       across its own colour. Inside the 2-unit floor on the gaps, so two
       neighbours' rings never touch. */
    --region-base: var(--surface);
  }

  .region-stage .region-shape::before {
    content: '';
    position: absolute;
    inset: -3px;
    border: 2px solid var(--surface);
    border-radius: var(--r-block);
    pointer-events: none;
  }

  /* The ground is under them, so it takes no ring - it has nothing to be
     lifted off. */
  .region-stage .region-shape.is-ground::before {
    content: none;
  }

  /* The ground sits behind the eight and reads as the thing they are on:
     the same shape and the same corner - rule 5's budget is 6 and 50%, and
     a rounder ground would be a third radius - held apart from them by its
     line weight alone, one step down. It is still a full control. */
  .region-shape.is-ground {
    border-width: 1px;
    --region-base: var(--surface);
  }

  /* Mixed: the region went both ways in this range. Two short bars in the
     corner rather than a change to the edge, because the edge is spoken for
     by selection and neither may erase the other - the same reason the
     injection map draws its second and third channels as rings around the
     dot rather than as changes to it.

     Two bars rather than one dot: the thing being said is "both ways", and
     two of something says that where one of anything does not. The ink is
     the ramp's own for this step, so it holds against the fill it sits on
     at every level; at level 0 there is no fill and it falls to --text. */
  .region-shape[data-region-mixed],
  [data-region-mixed] > .region-shape {
    position: relative;
  }

  .region-stage .region-shape[data-region-mixed] {
    position: absolute;
  }

  .region-shape[data-region-mixed]::after,
  [data-region-mixed] > .region-shape::after {
    content: '';
    position: absolute;
    top: 6px;
    right: 6px;
    width: 11px;
    height: 7px;
    background:
      linear-gradient(var(--region-ink, var(--text)) 0 2px, transparent 2px 5px, var(--region-ink, var(--text)) 5px 7px);
  }

  .region-shape:hover,
  .region-elsewhere-item:hover > .region-shape {
    border-color: var(--role-mark, var(--accent));
  }

  /* Selection: the stroke takes the role's mark colour and thickens, and
     the shape grows a little in place. Never a travelling indicator - two
     regions are not adjacent the way tabs are, and a pill flying across a
     torso is motion for its own sake. */
  .region-shape[aria-pressed='true'],
  [aria-pressed='true'] > .region-shape {
    border-color: var(--role-mark, var(--accent));
    border-width: 3px;
    transform: scale(1.04);
  }

  .region-shape.is-inline {
    display: block;
    width: 44px;
    height: 28px;
    --region-base: var(--surface);
  }

  /* The arrival, top to bottom. Opacity and transform only, and the shape
     is at its resting size and place by the end of its own step, so no
     shape is in neither state for a frame. */
  .region-arrive {
    animation: region-in var(--dur-slow) var(--ease-out) both;
    animation-delay: calc(var(--region-i, 0) * var(--stagger-step));
  }

  @keyframes region-in {
    from {
      opacity: 0;
      transform: scale(0.94);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  .region-elsewhere {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
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
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    color: var(--text);
  }

  .region-elsewhere-name {
    font-size: var(--text-sm);
  }
</style>

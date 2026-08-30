/* Body regions (ticket 09, widened to a reference-data area by ticket 30,
   given a second axis by ticket 31): every body region an entry can log
   against shares this one 0-100 intensity scale, rather than a per-region
   range the way a gender dimension has. Both of a region's axes - its
   dysphoria and its euphoria - are measured on it, so there is one scale
   here and not two: the axes differ in what they say, not in how far they
   go.

   The region keys themselves became a stored reference-data area in ticket
   30 (CONTEXT: "Reference data" - amended) - builtins.ts holds the built-in
   key list now, and journal/bodyRegions.ts the area a custom row is added
   to. What is left here is only the shared intensity scale, which is not a
   "vocabulary" concept the way a key list is and so was never part of that
   move.

   No default value: since ticket 31 neither axis is pre-filled when a
   region is picked, so there is nothing to seed a slider with. An untouched
   axis is null, which is what lets "this did not hurt" and "I said nothing
   about whether this hurt" stay different statements. */

import type { BodyRegionFeeling } from './types';

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;

/** Whether a region says anything at all. A region can sit in a draft with
    both axes still null - the picker put its sliders on screen and nobody
    has moved one yet - and that is not content: it must not save a blank
    row, and it must not be what keeps an otherwise-empty entry alive. */
export function bodyRegionIsLogged(feeling: BodyRegionFeeling): boolean {
  return feeling.dysphoria !== null || feeling.euphoria !== null;
}

/** The one-slider presentation of a region's feeling (ticket 99).

    The picker shows a single bipolar scale - dysphoria at the low end,
    euphoria at the high end, the same shape the day-level dimension takes -
    where the two per-axis sliders used to be. Storage keeps both axes, so
    the mapping is a projection, not a re-shape: a slider value below the
    midpoint writes the dysphoria axis and leaves euphoria null, above it
    the reverse, and the midpoint itself writes neither, which is the same
    "picked but not answered" state ticket 31 defined. Neither axis is ever
    derived from the other and nothing combined is stored (ADR-0010).

    Reading back, a region older than this slider can carry both axes at
    once - the two-slider UI allowed that. The slider can only stand on one
    of them, so it stands on the stronger and re-editing the region
    collapses it to that one side. That cost was accepted when the one
    slider was chosen (Alicja, 2026-08-29); both columns still read as they
    always did everywhere that is not this slider. */
export function feelingToSliderValue(feeling: BodyRegionFeeling): number | null {
  const midpoint = (BODY_REGION_INTENSITY_MIN + BODY_REGION_INTENSITY_MAX) / 2;
  const { dysphoria, euphoria } = feeling;
  if (dysphoria !== null && euphoria !== null) {
    return dysphoria >= euphoria
      ? sliderValueFor(midpoint, -dysphoria)
      : sliderValueFor(midpoint, euphoria);
  }
  if (dysphoria !== null) return sliderValueFor(midpoint, -dysphoria);
  if (euphoria !== null) return sliderValueFor(midpoint, euphoria);
  return null;
}

/** The inverse: a slider position becomes at most one axis, intensity
    measured from the midpoint the way the readout shows it. The midpoint
    itself is "nothing said", so it clears both - dragging back there is
    how a region's answer is taken back. */
export function sliderToFeeling(value: number): BodyRegionFeeling {
  const midpoint = (BODY_REGION_INTENSITY_MIN + BODY_REGION_INTENSITY_MAX) / 2;
  if (value === midpoint) return { dysphoria: null, euphoria: null };
  const intensity = Math.round(Math.abs(value - midpoint) * 2);
  return value < midpoint
    ? { dysphoria: intensity, euphoria: null }
    : { dysphoria: null, euphoria: intensity };
}

/** Distance from the midpoint on one side, as a slider position: negative
    intensity (dysphoria) lands below it, positive (euphoria) above. */
function sliderValueFor(midpoint: number, signedIntensity: number): number {
  return midpoint + signedIntensity / 2;
}

/** A plain-object copy, one level into each feeling.

    Not `structuredClone`: the draft's map is a Svelte `$state` proxy in the
    editor, and cloning a proxy throws DataCloneError at runtime. The node
    tests never see a proxy, so this is the kind of break only the
    walkthrough catches. Not a spread either - that would copy the inner
    feeling objects by reference and let an edit to the draft reach back
    into the entry it was seeded from. */
export function copyBodyRegions(
  regions: Record<string, BodyRegionFeeling>
): Record<string, BodyRegionFeeling> {
  return Object.fromEntries(
    Object.entries(regions).map(([id, f]) => [id, { dysphoria: f.dysphoria, euphoria: f.euphoria }])
  );
}

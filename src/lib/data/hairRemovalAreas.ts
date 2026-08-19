/* Hair-removal treatment areas (phase 5 ticket 08): a fixed list of areas an
   electrolysis/laser session can be logged against.

   Deliberately its own list rather than the body-region vocabulary
   (bodyRegions.ts, CONTEXT: "Reference data" - amended by ticket 30): that
   one is dysphoria-scoped, and ticket 09 (phase 4)'s own out-of-scope line
   rules out widening it to any body-map region beyond physical dysphoria
   tracking - ticket 30 opened that list to custom rows but left this
   exclusion alone. Treatment areas are finer-grained and procedural, not
   dysphoria hotspots, so this is a second, separate closed vocabulary
   rather than a reuse or extension of that one - the two are never merged.

   Node-tier safe: no paraglide import (ADR-0016), the same rule bodyMap.ts
   and builtins.ts follow - hairRemoval.ts validates an incoming area key
   against HAIR_REMOVAL_AREAS and runs under the Node tier's tests. */

export const HAIR_REMOVAL_AREAS = [
  'upper_lip',
  'chin',
  'neck',
  'underarms',
  'chest',
  'abdomen',
  'back',
  'arms',
  'legs',
  'bikini_line'
] as const;

export type HairRemovalAreaKey = (typeof HAIR_REMOVAL_AREAS)[number];

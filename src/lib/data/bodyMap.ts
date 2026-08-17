/* Body regions (ticket 09): a fixed list of body-region keys physical
   dysphoria can be logged against, all sharing one 0-100 intensity scale
   rather than a per-region range the way a gender dimension has.

   Not a stored reference-data row (CONTEXT: "Reference data") - there is no
   per-install customisation to persist, so a key list here is the whole of
   it, the same shape MILESTONE_TEMPLATE_KEYS takes in builtins.ts. Kept in
   its own module rather than folded into builtins.ts because the range
   constants below are not a "vocabulary" concept the way a key list is.

   Node-tier safe: no paraglide import (ADR-0016), the same rule
   builtins.ts follows - entries.ts validates an incoming region key
   against BODY_REGION_KEYS and runs under the Node tier's tests. */

export const BODY_REGION_KEYS = [
  'face_jaw',
  'voice_throat',
  'chest',
  'body_facial_hair',
  'hands_feet',
  'hips_waist',
  'genitals',
  'hairline'
] as const;

export type BodyRegionKey = (typeof BODY_REGION_KEYS)[number];

export const BODY_REGION_INTENSITY_MIN = 0;
export const BODY_REGION_INTENSITY_MAX = 100;
export const BODY_REGION_INTENSITY_DEFAULT = 50;

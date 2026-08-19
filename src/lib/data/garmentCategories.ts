/* Garment categories for the sizes-and-fit log (phase 5 ticket 23): a fixed
   list of what a size record can be logged against.

   Deliberately closed rather than user-extensible (the ticket's own
   out-of-scope line), the same reasoning HAIR_REMOVAL_AREAS gives for its
   own closed list: this is the one field the trend view groups by, and
   free text would fragment the way two spellings of one lab provider never
   merge - fine for an uncharted field, but not for this one.

   Node-tier safe: no paraglide import (ADR-0016), the same rule
   hairRemovalAreas.ts follows - sizeRecords.ts validates an incoming
   category key against GARMENT_CATEGORIES and runs under the Node tier's
   tests. */

export const GARMENT_CATEGORIES = [
  'shirts',
  'pants',
  'dresses',
  'skirts',
  'bras',
  'underwear',
  'shoes',
  'outerwear'
] as const;

export type GarmentCategoryKey = (typeof GARMENT_CATEGORIES)[number];

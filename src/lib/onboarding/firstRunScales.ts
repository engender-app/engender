/* The scales a first run can offer before there is a journal to read them
   from.

   The welcome, name, flag and scales steps run ahead of the access mode
   step, which is what creates the journal (671cd562), so the vocabulary
   mirror is still empty when the scales list mounts and the list drew
   nothing. A fresh install can only have the built-ins anyway - a custom
   scale is a row in the journal - so this is the whole of what the mirror
   would have answered.

   Reads the keys from builtinTemplates.ts, not builtins.ts: the rest of the
   catalogue stays out of the first-load graph (first-load-budget.json). */

import { BUILT_IN_DIMENSIONS } from '$lib/data/vocabulary/builtinTemplates';
import { dimensionName } from '$lib/data/vocabulary/labels';
import type { GenderDimension } from '$lib/data/types';

export function firstRunScales(): GenderDimension[] {
  return BUILT_IN_DIMENSIONS.map((d) => ({
    key: d.key,
    name: dimensionName(d.key),
    low: '',
    high: '',
    min: d.min,
    max: d.max,
    builtIn: true,
    hidden: false
  }));
}

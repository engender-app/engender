/* What a finishable area is called on screen (phase 8 features ticket 04),
   here rather than in `areaGroups.ts` for the reason its neighbours give:
   the wording speaks paraglide, and nothing the Node tier touches may import
   that (ADR-0016). `areaGroups.ts` holds the keys and the areas behind them;
   this is where they get their words.

   Every name is the one the More hub's own row already uses, so a mark on a
   chart, a line in a clinician summary and the row somebody tapped to get to
   the screen all say the same thing (ADR-0024).

   A full `Record` over the group keys, so a group added without a name is a
   typecheck failure rather than a raw key on a page handed to a doctor. */

import { m } from '$lib/paraglide/messages';
import { AREA_GROUPS, type AreaGroupKey } from '$lib/data/areaGroups';

const GROUP_NAME: Record<AreaGroupKey, () => string> = {
  measurements: m.body_measurements,
  sizes: m.size_log,
  wear: m.wear_log,
  'hair-progress': m.hair_progress,
  'hair-removal': m.hair_removal,
  'side-effects': m.side_effects,
  effects: m.effects_timeline,
  voice: m.vb_title,
  dilation: m.dilation
};

/** What a group is called.

    Takes a `string` rather than an `AreaGroupKey` because one of its two
    callers cannot offer one: a chart annotation's `name` is a plain string
    (charts/annotations.ts), since that field also carries a milestone's name
    and an episode's drug. An unrecognised value keeps itself rather than
    disappearing, the same way an imported body region does on the hormone
    curve. */
export function areaGroupName(key: string): string {
  return key in AREA_GROUPS ? GROUP_NAME[key as AreaGroupKey]() : key;
}

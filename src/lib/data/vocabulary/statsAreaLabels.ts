/* What each area card on the stats tab is called, here rather than in
   `statsAreas.ts` for the reason `areaLabels.ts` next door gives: the wording
   speaks paraglide, and nothing the Node tier touches may import that
   (ADR-0016).

   Every name is the one the More hub's own row already uses, and where the
   hub and the destination screen disagree the screen wins - a card is a way
   into that screen and the two headings should match once you arrive.

   A full `Record` over the panel keys, so a card added without a name is a
   typecheck failure rather than a raw key on the screen. */

import { m } from '$lib/paraglide/messages';
import type { StatsAreaKey } from '$lib/data/statsAreas';

const PANEL_NAME: Record<StatsAreaKey, () => string> = {
  measurements: m.body_measurements,
  sizes: m.size_log,
  'hair-progress': m.hair_progress,
  'hair-removal': m.hair_removal,
  care: m.care_title,
  labs: m.lab_results,
  'cycle-events': m.cycle_events,
  'side-effects': m.side_effects,
  surgery: m.surgery_journey_title,
  dilation: m.dilation,
  milestones: m.milestones,
  tryouts: m.tryout_title,
  'voice-benchmark': m.vb_title,
  wear: m.wear_log,
  effects: m.effects_timeline,
  tally: m.tally_trend_title
};

/** What an area card is called. Takes a `string` because the panel type is
    erased to one on the way out of the registry; an unrecognised key keeps
    itself rather than disappearing, the same fallback `areaGroupName` uses. */
export function statsAreaName(key: string): string {
  return key in PANEL_NAME ? PANEL_NAME[key as StatsAreaKey]() : key;
}

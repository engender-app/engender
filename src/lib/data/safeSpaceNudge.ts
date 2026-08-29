/* Trigger and visibility rules for Safe Space live tile nudge (ticket 50, ADR-0039, ADR-0040).
   The nudge appears on Home after an entry that reads as a bad moment:
   - Mood at lowest scale step (mood === 1)
   - Any dysphoria tag (g-soc-dys, g-body-dys, g-transphobia, g-misgendered, or any dt-* tag)
   - Any body region feeling with dysphoria intensity >= 50
   - euphoria_dysphoria gender dimension <= 20

   Clears permanently for that instance when dismissed or when Safe Space is opened from it.
   A fresh qualifying entry produces its own, independent nudge. */

import { BUILT_IN_TAG_GROUPS } from './vocabulary/builtins';

export const BAD_MOMENT_MOOD_CEILING = 1;
export const BAD_MOMENT_REGION_DYSPHORIA_FLOOR = 50;
export const BAD_MOMENT_DIMENSION_DYSPHORIA_CEILING = 20;

const dysphoriaGroup = BUILT_IN_TAG_GROUPS.find((g) => g.key === 'dysphoria_type');
export const DYSPHORIA_TAG_KEYS: readonly string[] = [
  'g-soc-dys',
  'g-body-dys',
  'g-transphobia',
  'g-misgendered',
  ...(dysphoriaGroup ? dysphoriaGroup.tags : [])
];

export interface BadMomentCandidate {
  id?: number;
  mood?: number | null;
  tags?: readonly string[];
  dims?: Record<string, number>;
  bodyRegions?: Record<string, { dysphoria?: number; euphoria?: number }>;
}

/** Whether a logged entry reads as a bad moment under the settled criteria. */
export function isBadMomentEntry(entry: BadMomentCandidate): boolean {
  if (entry.mood != null && entry.mood <= BAD_MOMENT_MOOD_CEILING) {
    return true;
  }
  if (entry.tags && entry.tags.some((t) => DYSPHORIA_TAG_KEYS.includes(t))) {
    return true;
  }
  if (
    entry.dims?.euphoria_dysphoria != null &&
    entry.dims.euphoria_dysphoria <= BAD_MOMENT_DIMENSION_DYSPHORIA_CEILING
  ) {
    return true;
  }
  if (entry.bodyRegions) {
    for (const feeling of Object.values(entry.bodyRegions)) {
      if (feeling.dysphoria != null && feeling.dysphoria >= BAD_MOMENT_REGION_DYSPHORIA_FLOOR) {
        return true;
      }
    }
  }
  return false;
}

/** Whether the Safe Space nudge live tile should be shown on Home. */
export function shouldShowSafeSpaceNudge(params: {
  latestBadEntryId: number | null | undefined;
  dismissedEntryId: number | null | undefined;
  enabled: boolean;
}): boolean {
  if (!params.enabled) return false;
  if (params.latestBadEntryId == null) return false;
  if (params.dismissedEntryId != null && params.dismissedEntryId >= params.latestBadEntryId) {
    return false;
  }
  return true;
}

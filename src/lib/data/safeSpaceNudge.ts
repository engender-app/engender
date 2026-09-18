/* Trigger and visibility rules for Safe Space live tile nudge (ticket 50, ADR-0039, ADR-0040).
   The nudge appears on Home after an entry that reads as a bad moment:
   - Mood at lowest scale step (mood === 1, on 1..5 scale)
   - Any dysphoria tag (g-soc-dys, g-body-dys, g-transphobia, g-misgendered, or any dt-* tag)
   - Any body region feeling with dysphoria intensity >= 50 (on 0..100 scale)

   Clears permanently for that instance when dismissed or when Safe Space is opened from it.
   A fresh qualifying entry produces its own, independent nudge. */

export const BAD_MOMENT_MOOD_CEILING = 1;
export const BAD_MOMENT_REGION_DYSPHORIA_FLOOR = 50;

export const DYSPHORIA_TAG_KEYS: readonly string[] = [
  'g-soc-dys',
  'g-body-dys',
  'g-transphobia',
  'g-misgendered',
  'dt-physical',
  'dt-biochemical',
  'dt-social',
  'dt-societal',
  'dt-sexual',
  'dt-presentational',
  'dt-existential'
];

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

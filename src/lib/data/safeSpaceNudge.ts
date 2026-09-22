/* Trigger and visibility rules for Safe Space live tile nudge (ticket 50, ADR-0039, ADR-0040).
   The nudge appears on Home after an entry that reads as a bad moment:
   - Mood at lowest scale step (mood === 1, on 1..5 scale)
   - Any dysphoria tag (g-soc-dys, g-body-dys, g-transphobia, g-misgendered, or any dt-* tag)
   - Any body region feeling with dysphoria intensity >= 50 (on 0..100 scale)

   Clears permanently for that instance when dismissed or when Safe Space is opened from it.
   A fresh qualifying entry produces its own, independent nudge. */

export const BAD_MOMENT_MOOD_CEILING = 1;
export const BAD_MOMENT_REGION_DYSPHORIA_FLOOR = 50;

/** The body-region intensity scale is 0 to 100 (bodyMap.ts); 50 is its
    midpoint and the bar a single region's euphoria has to clear, on any one
    entry, for both the good-day rule (journal/stats.ts) and
    entries.counterevidencePool (phase 5 ticket 44, CONTEXT: "Good day",
    "Euphoria capture" - amended). Named apart from the euphoria tags' own
    good-day clause: a region is a magnitude a person can log without a
    euphoria tag at all, so it needs its own floor rather than reusing
    GOOD_DAY_MOOD_FLOOR's shape or piggybacking on EUPHORIA_TAG_KEYS.
    Compared inclusively (`>=`), the same convention GOOD_DAY_MOOD_FLOOR
    itself uses. */
export const GOOD_DAY_REGION_EUPHORIA_FLOOR = 50;

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

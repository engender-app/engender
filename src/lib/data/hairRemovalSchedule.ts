/* Days since each treatment area's last hair-removal session (phase 5
   ticket 08), pure and kept above the journal seam next to doseSchedule.ts
   for the same reason: a recency figure is a question about a log and a
   day, not a row anyone stores. Nothing here reads a clock or a database.

   Deliberately no "due" framing, the same restraint doseSchedule.ts's
   siteRecency applies to the injection rotation map (ticket 10) and this
   ticket's own out-of-scope line repeats: this answers "how long since",
   and stops. No target interval, no overdue verdict. */

import { HAIR_REMOVAL_AREAS, type HairRemovalAreaKey } from './hairRemovalAreas';
import type { HairRemovalSession } from './types';

/** Days since `area`'s most recent session, or `null` for an area the log
    has never recorded a session against - a distinct state rather than a
    large number or zero, because neither would read as "never".

    Every session is scanned, not only ones naming an area this build's
    vocabulary still recognizes: an imported session with an area outside
    the current list still cannot move a known area's recency, but it must
    not throw either. */
export function daysSinceLastSession(
  sessions: readonly HairRemovalSession[],
  todayEpochDay: number
): Record<HairRemovalAreaKey, number | null> {
  const lastSessionDay = new Map<string, number>();
  for (const session of sessions) {
    const seen = lastSessionDay.get(session.area);
    if (seen === undefined || session.epochDay > seen) lastSessionDay.set(session.area, session.epochDay);
  }

  const recency = {} as Record<HairRemovalAreaKey, number | null>;
  for (const area of HAIR_REMOVAL_AREAS) {
    const lastDay = lastSessionDay.get(area);
    recency[area] = lastDay === undefined ? null : todayEpochDay - lastDay;
  }
  return recency;
}

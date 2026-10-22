/* Today's "time since" line (functional audit 33): how long ago the journey
   anchor's milestone was, such as "Started HRT, 8 months ago".

   It counts time since an event the person chose, never time since they
   last wrote, so the only inputs are the anchor and the day. The milestone's
   name leads as typed, which keeps a capitalised name from landing in the
   middle of a sentence. An anchor dated ahead of today has no time since it
   yet and draws nothing; the agenda already counts down to it. On the day
   itself the line says today rather than "0 days". */

import { m } from '$lib/paraglide/messages';
import { fmtDuration } from './dates';
import { calendarDuration } from './epochDay';

export function journeyAnchorLine(anchor: { name: string; epochDay: number } | null, today: number): string | null {
  if (!anchor || anchor.epochDay > today) return null;
  if (anchor.epochDay === today) return m.home_anchor_today({ name: anchor.name });
  return m.home_anchor_since({ name: anchor.name, duration: fmtDuration(calendarDuration(anchor.epochDay, today)) });
}

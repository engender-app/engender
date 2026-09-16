/* Which screen owns each kind of `dayAhead` mark (phase 10 redesign ticket
   04, ADR-0074).

   Two modules draw a mark now - `dayAheadRows.ts` for `/day/[day]` and
   `agenda.ts` for Today - and both need to know where a row goes. This is
   the one place that is written down.

   Its own file rather than a field on the registry's sections (dayAhead.ts)
   for one reason: a route is wanted by modules that never run a read, and
   reaching for it through the registry would pull `SECTIONS` and everything
   the five reads import into their chunk. A full `Record` over
   `DayAheadMarkKind` keeps the same guarantee the section list would have
   given - a sixth kind is a compile error here until it names its screen. */

import type { DayAheadMarkKind } from './dayAhead';

export const DAY_AHEAD_ROUTES: Record<DayAheadMarkKind, string> = {
  appointment: '/health/appointments',
  surgery: '/health/surgery',
  milestone: '/transition/milestones',
  letterUnlock: '/transition/letters',
  doseSlot: '/care/doses'
};

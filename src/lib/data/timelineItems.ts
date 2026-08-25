/* What the timeline draws, in order (phase 5 UX ticket 23).

   The screen shows milestones past and future on one rail, with the long
   empty stretches compressed and a marker for where today falls between
   them. All three of those are calendar arithmetic over a list that is
   already sorted, which is exactly the kind of rule that is easy to get
   almost right in markup and never notice - the version this replaces
   inserted the today marker only between two milestones, so a journal whose
   milestones are all still ahead drew a timeline of the future with no
   present on it.

   Milestones are mirrored (ADR-0004), so this takes them as an array and
   there is no query here. Today arrives as an argument, the same rule the
   rest of the date arithmetic follows. Nothing here formats anything: a
   gap's duration and a milestone's status are written against the active
   locale by the screen. */

import type { Milestone } from './types';

/** How long an empty stretch has to be before the rail compresses it.

    Fourteen months. Long enough that a year of quiet between two milestones
    is drawn as the quiet it was, and short enough that a transition's
    typical gaps - a few months between a first appointment and a first dose
    - stay as ordinary spacing. Carried over from the screen this replaces
    rather than re-chosen. */
export const TIMELINE_GAP_DAYS = 420;

export type TimelineItem =
  | { kind: 'milestone'; id: string; milestone: Milestone; future: boolean }
  | { kind: 'gap'; id: string; fromEpochDay: number; toEpochDay: number }
  | { kind: 'today'; id: string };

/** The rail, in order: milestones, compressed gaps, and today's place among
    them.

    The today marker lands before the first milestone that is still ahead,
    wherever that falls - including first, when everything is ahead, and
    last, when nothing is. A journal with no milestones at all gets no rail
    and no marker: the screen has an empty state for that, and a lone "you
    are here" on an otherwise blank timeline is not it. */
export function timelineItems(milestones: Milestone[], todayEpochDay: number): TimelineItem[] {
  if (!milestones.length) return [];

  const out: TimelineItem[] = [];
  let previousDay: number | null = null;
  let markedToday = false;

  for (const milestone of milestones) {
    const future = milestone.epochDay > todayEpochDay;
    if (future && !markedToday) {
      out.push({ kind: 'today', id: 'today' });
      markedToday = true;
    }
    if (previousDay !== null && milestone.epochDay - previousDay > TIMELINE_GAP_DAYS) {
      out.push({ kind: 'gap', id: `gap-${milestone.id}`, fromEpochDay: previousDay, toEpochDay: milestone.epochDay });
    }
    out.push({ kind: 'milestone', id: milestone.id, milestone, future });
    previousDay = milestone.epochDay;
  }

  /* Everything is behind us, so today is the end of the rail rather than a
     point inside it. */
  if (!markedToday) out.push({ kind: 'today', id: 'today' });
  return out;
}

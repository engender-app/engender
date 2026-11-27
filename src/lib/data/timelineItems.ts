/* Build the timeline from sorted milestones and an explicit today. Include
   today even when every milestone is in the future. Compress long empty
   spans. Milestones arrive from the mirror (ADR-0004) and the screen formats
   the results for the locale. */

import type { Milestone } from './types';

/** How long an empty stretch has to be before the rail compresses it.

    Fourteen months. Long enough that a year of quiet between two milestones
    is drawn as the quiet it was, and short enough that a transition's
    typical gaps - a few months between a first appointment and a first dose
    - stay as ordinary spacing. Carried over from the screen this replaces
    rather than re-chosen. */
/* TIMELINE_GAP_DAYS stays exported only for its own test (AU-09 test-only
   review). */
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
      /* Today inside a long stretch splits it (after-release 27, audit
         L03-15): the part already behind is drawn before the marker and
         measured to today, so the marker is not put in front of a quiet
         stretch it is in the middle of. Each side compresses on its own
         length. */
      if (previousDay !== null) {
        if (todayEpochDay - previousDay > TIMELINE_GAP_DAYS) {
          out.push({ kind: 'gap', id: 'gap-before-today', fromEpochDay: previousDay, toEpochDay: todayEpochDay });
        }
        previousDay = todayEpochDay;
      }
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

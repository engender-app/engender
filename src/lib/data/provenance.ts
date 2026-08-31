/* The one presentation for anything the app created rather than the person
   (phase 5 deepening ticket 22, ADR-0045): a milestone minted from a
   roadmap goal, a surgery day or an adopted tryout, and a reminder the
   stock projection is keeping in step with a drug. A hand-written record
   asks this for nothing - resolveMilestoneOrigin and resolveReminderOrigin
   both return null the moment their own linking column is null, which is
   also what a since-cleared link (procedures.ts, tryouts.ts) leaves behind,
   so "no line" already covers both without a second check.

   A roadmap goal key is the one link that is never cleared - nothing can
   delete a roadmap goal today (CONTEXT.md) - so it is also the one case
   that can still be set while failing to resolve: a key from a pack or a
   custom goal this journal no longer has. That earns the single shared
   fallback line below rather than three near-duplicates, since the other
   two links can't dangle in practice (milestones.ts, tryouts.ts null them
   out on delete) and a defensive string for an unreachable case would be
   copy nobody ever reads. */

import { m } from '$lib/paraglide/messages';
import { POLISH_PACK, type RoadmapGoalKey } from './roadmap';
import { roadmapGoalTitle } from './vocabulary/roadmapLabels';
import type { Milestone, Reminder } from './types';

export interface Origin {
  text: string;
  /** Where the line links back to, or null where there is nowhere honest to
      send someone - the shared fallback below, and a reminder auto_source
      this build doesn't recognise. */
  href: string | null;
}

function builtinGoalTitle(key: string): string | null {
  const found = POLISH_PACK.goals.find((g) => g.key === key);
  return found ? roadmapGoalTitle(found.key as RoadmapGoalKey) : null;
}

/** null for a hand-written milestone - every linking column absent - or once
    a linked procedure or tryout is deleted, since both null the column out
    rather than leaving a dangling reference (ADR-0045). */
export function resolveMilestoneOrigin(milestone: Milestone): Origin | null {
  if (milestone.procedureId) {
    return { text: m.prov_from_surgery({ name: milestone.procedureName ?? '' }), href: '/settings/surgery' };
  }
  if (milestone.roadmapGoalKey) {
    const title = milestone.customRoadmapGoalText ?? builtinGoalTitle(milestone.roadmapGoalKey);
    return title ? { text: m.prov_from_roadmap({ goal: title }), href: '/settings/roadmap' } : { text: m.prov_source_gone(), href: null };
  }
  if (milestone.tryoutId) {
    return { text: m.prov_from_tryout({ label: milestone.tryoutLabel ?? '' }), href: `/settings/tryouts/${milestone.tryoutId}` };
  }
  return null;
}

export interface ReminderOrigin extends Origin {
  hint: string;
}

const STOCK_PREFIX = 'stock:';

/** null for a reminder a person made themselves, or one they have already
    taken over: the reminders editor never sets autoSource (reminders.ts),
    so any save clears it, and from that point the row is indistinguishable
    from one that was never automatic. */
export function resolveReminderOrigin(reminder: Reminder): ReminderOrigin | null {
  if (!reminder.autoSource) return null;
  const hint = m.prov_reminder_takeover_hint();
  if (reminder.autoSource.startsWith(STOCK_PREFIX)) {
    const drug = reminder.autoSource.slice(STOCK_PREFIX.length);
    return { text: m.prov_reminder_stock({ drug }), hint, href: '/settings/stock' };
  }
  // Defensive: stock.ts is the only writer of autoSource today, so this
  // branch is unreached until a second feature starts marking reminders.
  return { text: m.prov_source_gone(), hint, href: null };
}

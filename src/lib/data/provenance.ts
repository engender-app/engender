/* Resolve provenance for milestones and automated reminders (ADR-0045).
   A null link yields no source line. Deleted custom roadmap goals leave
   their milestone link intact (ADR-0068), so an unresolved goal uses the
   shared fallback. Other deletions clear their links.

   Live tiles already name their feature in the title. */

import { m } from '$lib/paraglide/messages';
import { DOSE_PREFIX, STOCK_PREFIX, WEAR_PREFIX } from './autoSource';
import { isBuiltInGoal, isBuiltInInstitution } from './roadmap';
import { roadmapGoalTitle, roadmapInstitutionName } from './vocabulary/roadmapLabels';
import type { Milestone, Reminder } from './types';

interface Origin {
  text: string;
  /** Where the line links back to, or null where there is nowhere honest to
      send someone - the shared fallback below, and a reminder auto_source
      this build doesn't recognise. */
  href: string | null;
}

function builtinGoalTitle(key: string): string | null {
  if (isBuiltInGoal(key)) return roadmapGoalTitle(key);
  /* A milestone minted from a post-ruling step that became an institution
      keeps its key, which now names the
     institution. */
  return isBuiltInInstitution(key) ? roadmapInstitutionName(key) : null;
}

/** null for a hand-written milestone - every linking column absent - or once
    a linked procedure or tryout is deleted, since both null the column out
    rather than leaving a dangling reference (ADR-0045). */
export function resolveMilestoneOrigin(milestone: Milestone): Origin | null {
  if (milestone.procedureId) {
    return { text: m.prov_from_surgery({ name: milestone.procedureName ?? '' }), href: `/health/surgery/${encodeURIComponent(milestone.procedureId)}` };
  }
  if (milestone.roadmapGoalKey) {
    const title = milestone.customRoadmapGoalText ?? builtinGoalTitle(milestone.roadmapGoalKey);
    return title ? { text: m.prov_from_roadmap({ goal: title }), href: `/transition/roadmap?goal=${encodeURIComponent(milestone.roadmapGoalKey)}` } : { text: m.prov_source_gone(), href: null };
  }
  if (milestone.tryoutId) {
    return { text: m.prov_from_tryout({ label: milestone.tryoutLabel ?? '' }), href: `/transition/tryouts/${milestone.tryoutId}` };
  }
  return null;
}

interface ReminderOrigin extends Origin {
  hint: string;
  /** The action label for `href`, kept beside it rather than left for each
      caller to re-derive from which prefix matched - "View stock" and
      "View wear log" name different screens, so a shared generic label
      (unlike resolveMilestoneOrigin's prov_open_source) would say less. */
  actionLabel: string | null;
}

/** null for a reminder a person made themselves, or one they have already
    taken over: the reminders editor never sets autoSource (reminders.ts),
    so any save clears it, and from that point the row is indistinguishable
    from one that was never automatic. */
export function resolveReminderOrigin(reminder: Reminder): ReminderOrigin | null {
  if (!reminder.autoSource) return null;
  const hint = m.prov_reminder_takeover_hint();
  if (reminder.autoSource.startsWith(STOCK_PREFIX)) {
    const drug = reminder.autoSource.slice(STOCK_PREFIX.length);
    return { text: m.prov_reminder_stock({ drug }), hint, href: '/care', actionLabel: m.prov_view_stock() };
  }
  if (reminder.autoSource.startsWith(DOSE_PREFIX)) {
    // No drug in the line: the reminder's own title is the drug's name,
    // which the schedule keeps in step.
    const episodeId = reminder.autoSource.slice(DOSE_PREFIX.length);
    return {
      text: m.prov_reminder_dose(),
      hint,
      href: `/care/regimen?episode=${encodeURIComponent(episodeId)}`,
      actionLabel: m.prov_view_schedule()
    };
  }
  if (reminder.autoSource.startsWith(WEAR_PREFIX)) {
    return { text: m.prov_reminder_wear(), hint, href: '/body/wear', actionLabel: m.prov_view_wear_log() };
  }
  // Defensive: stock.ts, wearSessions.ts and doseReminders.ts are the only
  // writers of autoSource today, so this branch is unreached until another
  // feature starts marking reminders.
  return { text: m.prov_source_gone(), hint, href: null, actionLabel: null };
}

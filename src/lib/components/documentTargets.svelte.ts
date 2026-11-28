/* The four live reads behind a document's link (ADR-0065), wired once rather than at both call sites: the picker walks
   every kind, and the document's own screen resolves the one it is filed
   under back to a name. Before this the two components declared the same
   four `liveList`s and each carried its own four-way cascade over the kinds.

   The reactive half, deliberately thin the way photoSection.svelte.ts is:
   `$state` only works here, so the ordering rule stays in the rune-free
   documentTargets.ts where a node test can reach it.

   Loading is a third answer, not a shade of "gone". A read that has not
   landed yet has no opinion about whether the milestone is still there, and
   a screen that paints "linked to something that's gone" while its list is
   in flight tells the person their paper came unfiled for as long as the
   read takes. */

import { m } from '$lib/paraglide/messages';
import { liveList } from '$lib/data/live/journal.svelte';
import { fmtDay } from '$lib/data/dates';
import { prefs } from '$lib/data/prefs/store.svelte';
import { POLISH_INSTITUTIONS, POLISH_PACK, isBuiltInGoal, isBuiltInInstitution, polishLegalStepsShown, socialGoalsInView } from '$lib/data/roadmap';
import { roadmapGoalTitle, roadmapInstitutionName } from '$lib/data/vocabulary/roadmapLabels';
import { DOCUMENT_TARGET_SECTION_HEADING } from '$lib/data/vocabulary/documentTargetLabels';
import type { DocumentTarget } from '$lib/data/types';
import { documentTargetHref, orderedSections, type TargetSection } from './documentTargets';

/** What a document's own link resolves to: still reading, the target's name
    and where it lives, or a target that is not there any more - which a
    restored archive can carry, since the link travels unresolved. */
type ResolvedTarget = { state: 'loading' } | { state: 'gone' } | { state: 'found'; text: string; href: string };

export function documentTargets() {
  const dayLabel = (epochDay: number) => fmtDay(epochDay, { day: 'numeric', month: 'long', year: 'numeric' });

  const milestones = liveList((j) => j.milestones.getMilestones());
  const procedures = liveList((j) => j.procedures.getProcedures());
  const episodes = liveList((j) => j.regimen.getEpisodes());
  const customGoals = liveList((j) => j.roadmap.getCustomGoals());
  const institutions = liveList((j) => j.roadmap.getInstitutions());

  const sections = $derived<TargetSection[]>([
    {
      kind: 'milestone',
      heading: DOCUMENT_TARGET_SECTION_HEADING.milestone(),
      rows: [...milestones.rows]
        .sort((a, b) => b.epochDay - a.epochDay)
        .map((milestone) => ({ id: milestone.id, title: milestone.name, subtitle: dayLabel(milestone.epochDay) }))
    },
    {
      kind: 'procedure',
      heading: DOCUMENT_TARGET_SECTION_HEADING.procedure(),
      rows: [...procedures.rows]
        .sort((a, b) => (b.surgeryEpochDay ?? -Infinity) - (a.surgeryEpochDay ?? -Infinity))
        .map((procedure) => ({
          id: procedure.id,
          title: procedure.name,
          subtitle: procedure.surgeryEpochDay !== null ? dayLabel(procedure.surgeryEpochDay) : m.no_date_yet()
        }))
    },
    {
      kind: 'episode',
      heading: DOCUMENT_TARGET_SECTION_HEADING.episode(),
      rows: [...episodes.rows]
        .sort((a, b) => b.startEpochDay - a.startEpochDay)
        .map((episode) => ({ id: episode.id, title: episode.drug, subtitle: dayLabel(episode.startEpochDay) }))
    },
    {
      /* A goal is the one kind with no date, so "most recent first" has
         nothing to sort on: the bundled pack keeps its own order, which is
         the order the roadmap screen draws, and custom goals follow it
         newest first. The pack's goals are offered only while the roadmap
         shows them, so a document cannot be
         filed against a step the person switched off. */
      kind: 'goal',
      heading: DOCUMENT_TARGET_SECTION_HEADING.goal(),
      rows: [
        /* The social steps, while their switch is on. Like the legal ones
           below, hiding a single step does not take it off this list. */
        ...socialGoalsInView(prefs.roadmapSocialStepsShown, []).map((goal) => ({ id: goal.key, title: roadmapGoalTitle(goal.key) })),
        ...(polishLegalStepsShown(prefs.roadmapPolishStepsChoice)
          ? [
              ...POLISH_PACK.goals.map((goal) => ({ id: goal.key, title: roadmapGoalTitle(goal.key) })),
              /* The institutions sit under the
                 same switch and file under the same 'goal' link: the six
                 that were steps kept their keys, so their paper did not
                 move. */
              ...POLISH_INSTITUTIONS.map((one) => ({ id: one.key, title: roadmapInstitutionName(one.key) })),
              ...institutions.rows.map((one) => ({ id: one.id, title: one.name }))
            ]
          : []),
        ...[...customGoals.rows].reverse().map((goal) => ({ id: goal.id, title: goal.text }))
      ]
    }
  ]);

  return {
    /** The picker's sections, with the current link pinned to the front. */
    sections: (current: DocumentTarget | null) => orderedSections(sections, current),

    resolve(target: DocumentTarget): ResolvedTarget {
      const found = (text: string): ResolvedTarget => ({ state: 'found', text, href: documentTargetHref(target) });

      if (target.kind === 'goal') {
        /* A bundled goal is compiled from roadmap.ts rather than stored, so
           it resolves without waiting for a read at all. */
        if (isBuiltInGoal(target.id)) return found(roadmapGoalTitle(target.id));
        if (isBuiltInInstitution(target.id)) return found(roadmapInstitutionName(target.id));
        if (customGoals.loading || institutions.loading) return { state: 'loading' };
        const custom = customGoals.rows.find((goal) => goal.id === target.id);
        if (custom) return found(custom.text);
        const institution = institutions.rows.find((one) => one.id === target.id);
        return institution ? found(institution.name) : { state: 'gone' };
      }

      if (target.kind === 'milestone') {
        if (milestones.loading) return { state: 'loading' };
        const milestone = milestones.rows.find((row) => row.id === target.id);
        return milestone ? found(milestone.name) : { state: 'gone' };
      }

      if (target.kind === 'procedure') {
        if (procedures.loading) return { state: 'loading' };
        const procedure = procedures.rows.find((row) => row.id === target.id);
        return procedure ? found(procedure.name) : { state: 'gone' };
      }

      if (episodes.loading) return { state: 'loading' };
      const episode = episodes.rows.find((row) => row.id === target.id);
      return episode ? found(episode.drug) : { state: 'gone' };
    }
  };
}

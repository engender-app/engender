/* The four things a document can be filed under, as one list (phase 8
   features ticket 56, ADR-0065). The rune-free half of
   documentTargets.svelte.ts, which is where the four live reads are: the
   ordering rule below is the only part worth a test, and a node test cannot
   compile a rune (`.svelte.ts` modules are browser-tier only).

   Where a target's screen is, per kind. Three of the four have no route of
   their own - a milestone, a procedure and a regimen episode are each edited
   in a sheet on their area's list screen - so the link goes to the list and
   the person taps the row there, the same fallback provenance.ts already
   makes. A goal has no route either, and reaches its sheet through the
   `?goal=` query param ADR-0068 adds. */

import type { DocumentTarget, DocumentTargetKind } from '$lib/data/types';

type TargetRow = { id: string; title: string; subtitle?: string };
export type TargetSection = { kind: DocumentTargetKind; heading: string; rows: TargetRow[] };

export function documentTargetHref(target: DocumentTarget): string {
  if (target.kind === 'milestone') return '/transition/milestones';
  if (target.kind === 'procedure') return '/health/surgery';
  if (target.kind === 'episode') return '/settings/regimen';
  return `/transition/roadmap?goal=${target.id}`;
}

/** The sections a picker draws: a kind with nothing in it is dropped rather
    than drawn as a heading over an empty card, and the link the document
    already has comes first - its section first, and its own row at the top
    of that section. Without it the tick can be most of a screen down; the
    roadmap pack alone is nearly thirty rows. Everything under the pinned row
    keeps the order its kind sorted into. */
export function orderedSections(sections: TargetSection[], current: DocumentTarget | null): TargetSection[] {
  const withRows = sections.filter((section) => section.rows.length > 0);
  if (!current) return withRows;

  return withRows
    .map((section) =>
      section.kind === current.kind
        ? { ...section, rows: [...section.rows].sort((a, b) => Number(b.id === current.id) - Number(a.id === current.id)) }
        : section
    )
    .sort((a, b) => Number(b.kind === current.kind) - Number(a.kind === current.kind));
}

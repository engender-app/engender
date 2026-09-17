/** Exact destinations for the four kinds a document can be filed under. */

import type { DocumentTarget, DocumentTargetKind } from '$lib/data/types';

type TargetRow = { id: string; title: string; subtitle?: string };
export type TargetSection = { kind: DocumentTargetKind; heading: string; rows: TargetRow[] };

export function documentTargetHref(target: DocumentTarget): string {
  if (target.kind === 'milestone') return `/transition/milestones?edit=${encodeURIComponent(target.id)}`;
  if (target.kind === 'procedure') return `/health/surgery?procedure=${encodeURIComponent(target.id)}`;
  if (target.kind === 'episode') return `/care/regimen?episode=${encodeURIComponent(target.id)}#${encodeURIComponent(target.id)}`;
  return `/transition/roadmap?goal=${encodeURIComponent(target.id)}`;
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

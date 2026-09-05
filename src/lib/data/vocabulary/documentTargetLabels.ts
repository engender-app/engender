/* What the four things a document can be filed under are called, and which
   glyph stands for each (phase 8 features ticket 56, ADR-0065). Here rather
   than beside the area for the reason its neighbours give: the wording
   speaks paraglide, and nothing the Node tier touches may import that
   (ADR-0016).

   Two `Record`s, both total over `DocumentTargetKind`, which is a closed
   four. The list screen labels a row by its kind because resolving the
   target's own name there would mean fetching all four kinds' lists to put
   one line on each row; the picker and the document's own screen have the
   name already and use the icon alone. */

import { m } from '$lib/paraglide/messages';
import type { DocumentTargetKind } from '$lib/data/types';

const KIND_LABEL: Record<DocumentTargetKind, () => string> = {
  milestone: m.document_link_kind_milestone,
  procedure: m.document_link_kind_procedure,
  episode: m.document_link_kind_episode,
  goal: m.document_link_kind_goal
};

/** A name from `$lib/components/icons.ts`, and the same one each kind wears
    on its own screen: a milestone is a sparkle wherever it appears. */
export const DOCUMENT_TARGET_ICON: Record<DocumentTargetKind, string> = {
  milestone: 'sparkle',
  procedure: 'flag',
  episode: 'timeline',
  goal: 'globe'
};

export function documentTargetKindLabel(kind: DocumentTargetKind): string {
  return KIND_LABEL[kind]();
}

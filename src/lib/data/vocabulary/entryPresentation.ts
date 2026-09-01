/* An entry's presentation as a name and an ink colour a row can draw
   directly (phase 5 deepening ticket 17, ADR-0048), the same
   already-resolved shape entryTags.ts hands a row.

   Needs both the vocabulary and the active flag, unlike a tag label: the
   whole point of a presentation is its colour, so resolving the name alone
   would leave every caller re-deriving the role itself. */

import type { Entry } from '../types';
import { vocabulary } from './vocabulary';
import { activeFlag } from '$lib/theme/activeFlag.svelte';
import { roleAt } from '$lib/theme/roles';

export interface EntryPresentationLabel {
  name: string;
  /** Already the small-text floor (--ink, 4.5:1) - a presentation's name is
      read as text, not glanced at as a mark (theme/roles.ts). */
  color: string;
}

/** Undefined for an entry that carries none: absence, not a label. A
    presentation hidden after being logged still resolves here - hiding only
    takes it out of the entry editor's chip, never off an entry that already
    carries it (CONTEXT: "Hidden"). */
export function entryPresentation(entry: Entry): EntryPresentationLabel | undefined {
  if (!entry.presentationId) return undefined;
  const presentation = vocabulary.presentation(entry.presentationId);
  if (!presentation) return undefined;
  const role = roleAt(activeFlag.roles, presentation.roleIndex);
  if (!role) return undefined;
  return { name: presentation.name, color: role.ink };
}

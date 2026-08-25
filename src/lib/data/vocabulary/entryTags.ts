/* An entry's tags as the words a row shows.

   Beside the other label lookups rather than beside the grouping in
   recentEntries.ts, and the seam is ADR-0016's: this reads the vocabulary,
   which imports paraglide, so nothing the Node tier touches may import it.
   recentEntries.ts is Node-testable and stays that way.

   Here rather than at the surface that draws them, though, for ADR-0024's
   reason: which tags exist and what they are called is the vocabulary's, and
   a component that looked them up would be a second place asking. */

import type { Entry } from '../types';
import { vocabulary } from './vocabulary';

/** How many tags a row draws before the rest become a count. Four, which is
    what the entry card has always drawn. */
export const TAG_CAP = 4;

/** A tag whose id no longer resolves is dropped rather than drawn as its
    key: the id is not a word, and a row is not where a missing tag gets
    reported. */
export function entryTags(entry: Entry, cap: number = TAG_CAP): string[] {
  const labels = entry.tags
    .map((id) => vocabulary.tag(id))
    .filter((tag) => tag != null)
    .slice(0, cap)
    .map((tag) => tag.label);
  const more = entry.tags.length - labels.length;
  return more > 0 ? [...labels, `+${more}`] : labels;
}

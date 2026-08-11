/* What a real first run gets: the built-in vocabulary and nothing else.

   Reconciling runs on every load rather than only on an empty store, and
   before an import applies. Key-based identity is what makes that safe
   (ADR-0002), and the alternative - a "seed only if empty" branch - leaves
   a Replace import able to strand the app without a built-in it needs. */

import { withBuiltInDimensions, withBuiltInTagGroups } from './vocabulary/builtins';
import type { DB } from './types';

export function emptyDb(): DB {
  return {
    version: 1,
    dimensions: [],
    customPresets: [],
    tagGroups: [],
    entries: [],
    milestones: [],
    reminders: [],
    labResults: []
  };
}

export function seedVocabulary(journal: DB): DB {
  return {
    ...journal,
    dimensions: withBuiltInDimensions(journal.dimensions),
    tagGroups: withBuiltInTagGroups(journal.tagGroups)
  };
}

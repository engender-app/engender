/* Which tables each journal mutation writes, and a wrapper that announces
   them once the write has landed (ticket 08).

   ADR-0004 splits reads by size: reference data is mirrored and entry data
   is queried asynchronously. Both halves need the same thing from a write -
   to be told what just changed - and neither should have to ask the screen
   that performed it. A screen calling `journal.entries.upsertEntry` cannot
   be relied on to remember that Home's list, the streak, the calendar and
   the stats charts all read that table; miss one and it shows yesterday's
   answer with no sign that it is doing so.

   So the announcement is taken off the call sites and attached to the
   journal itself. Everything above reads through the wrapper, and the
   invalidation is as scoped as this table is precise: editing a lab result
   leaves the entry queries alone.

   Rune-free on purpose, like the journal below it (ADR-0017): the mapping is
   the part with a rule in it, and the Node tier can only test what has no
   `$state` in it. The reactive half is journal.svelte.ts, which supplies
   `onWrite`.

   Unclassified operations are rejected outright rather than assumed to be
   reads. A read misfiled as a write costs a needless re-query; a write
   misfiled as a read shows stale data forever, and the failure looks like a
   Svelte bug rather than a missing line here. */

import { markJournalBusy } from '../journal-busy';
import type { Journal } from '../journal/journal';
import { RECONCILE_TABLES } from '../journal/reconcile';

/** The tables a query can depend on. Coarser than the schema - one name
    covers a row and everything hanging off it, so `entry` means the entry
    and its dimension values, tag links and search index. Finer would be
    precision no screen can use: nothing reads `entry_tag` without reading
    the entry it belongs to. */
export type TableName =
  | 'entry'
  | 'tag'
  | 'dimension'
  | 'preset'
  | 'milestone'
  | 'photo'
  | 'lab'
  | 'sideEffect'
  | 'reminder';

/** Every table there is, in one place: what an import rewrites, and what
    journal.svelte.ts keeps a version per. */
export const TABLE_NAMES: TableName[] = [
  'entry',
  'tag',
  'dimension',
  'preset',
  'milestone',
  'photo',
  'lab',
  'sideEffect',
  'reminder'
];

/** Every operation each area offers, split by whether it changes anything.
    `writes` maps to the tables the operation writes; `reads` is a plain list
    so that adding either kind is a deliberate act.

    Keyed loosely rather than by `keyof Journal`, and read against the areas
    the journal actually has: an entry here for an area a build does not carry
    is harmless, while an area with no entry here is the failure this exists to
    raise. */
const OPERATIONS: Record<string, { writes: Partial<Record<string, TableName[]>>; reads: string[] }> = {
  entries: {
    writes: {
      // Photos as well as the entry: a save carries additions and removals.
      upsertEntry: ['entry', 'photo'],
      // Takes the entry's photo rows and files with it (entries.ts).
      deleteEntry: ['entry', 'photo']
    },
    reads: ['getEntry', 'entriesForDay', 'recentDays', 'entriesWithTag', 'searchEntries', 'countSearchMatches']
  },
  tags: {
    writes: {
      addGroup: ['tag'],
      setGroupEnabled: ['tag'],
      addTag: ['tag'],
      renameTag: ['tag'],
      setTagHidden: ['tag'],
      reorder: ['tag'],
      // Unlinks the tag from every entry that carried it (PRD F17), so entry
      // reads change even though no entry row was touched.
      deleteTag: ['tag', 'entry']
    },
    reads: ['getTagGroups']
  },
  dimensions: {
    writes: {
      addCustomDimension: ['dimension'],
      addPreset: ['preset'],
      setDimensionHidden: ['dimension']
    },
    reads: ['getDimensions', 'getPresets']
  },
  milestones: {
    writes: {
      // A milestone save can preserve, remove or replace its photo.
      upsertMilestone: ['milestone', 'photo'],
      deleteMilestone: ['milestone', 'photo']
    },
    reads: ['getMilestones']
  },
  photos: {
    /* An entry and a milestone both carry their photos on the shape they are
       read back as, so a photo row changing changes what an entry list and the
       mirrored milestones should show. Which of the two owns this photo is a
       property of the call, not of the method, so both are announced: naming
       only `photo` left the entry list showing a photo indicator for a photo
       that had been deleted. */
    writes: {
      attach: ['photo', 'entry', 'milestone'],
      remove: ['photo', 'entry', 'milestone']
    },
    reads: ['inJournal']
  },
  labs: {
    writes: { upsertResult: ['lab'], deleteResult: ['lab'] },
    reads: ['getAnalytes', 'getUsedAnalytes', 'getResults', 'getSeries']
  },
  sideEffects: {
    writes: { upsertSideEffect: ['sideEffect'], deleteSideEffect: ['sideEffect'] },
    reads: ['getSideEffects', 'getSideEffectsInRange']
  },
  reminders: {
    writes: { upsertReminder: ['reminder'], deleteReminder: ['reminder'], setEnabled: ['reminder'] },
    reads: ['getReminders']
  },
  // The one area that never writes: stats (ADR-0017's ticket-10 amendment).
  stats: {
    writes: {},
    reads: ['dayAverages', 'entryCountsByDay', 'tagInsights', 'streak', 'recap']
  },
  /* An import rewrites the journal (ticket 14), so it invalidates all of it -
     every query and every mirrored slice. Naming the tables one at a time
     would be a list to keep in step with what a restore happens to touch,
     and a Replace touches everything by definition. */
  archive: {
    writes: { replace: TABLE_NAMES, merge: TABLE_NAMES, commitDaylioImport: TABLE_NAMES },
    reads: ['snapshot', 'previewDaylioImport']
  }
};

/** The journal, with every mutation announcing the tables it wrote after it
    resolves - never before, and never when it rejects: a write that threw
    changed nothing, so nothing that read those tables is stale.

    Each mutation also holds the update guard while it runs (ticket 04), which
    is why this wrapper is where that belongs: it is the one place that knows
    which operations are writes, so a service worker cannot take over under
    one that a later ticket adds. An Archive import comes free, being a
    declared write on every table.

    Throws if the journal carries an area, or an operation on one, that this
    module does not classify. */
export function observeWrites(journal: Journal, onWrite: (tables: TableName[]) => void): Journal {
  const wrappedJournal: Record<string, unknown> = {
    reconcileBuiltIns: announcing(journal.reconcileBuiltIns.bind(journal), RECONCILE_TABLES, onWrite)
  };

  for (const [areaName, area] of Object.entries(journal)) {
    if (areaName === 'reconcileBuiltIns') continue;
    const classified = OPERATIONS[areaName];
    if (!classified) throw new Error(`journal.${areaName} is an area writes.ts does not classify`);
    const { writes, reads } = classified;
    const wrappedArea: Record<string, unknown> = {};

    for (const [operation, implementation] of Object.entries(area as Record<string, unknown>)) {
      if (typeof implementation !== 'function') {
        wrappedArea[operation] = implementation;
        continue;
      }
      const tables = writes[operation];
      if (!tables && !reads.includes(operation)) {
        throw new Error(`journal.${areaName}.${operation} is neither a declared read nor a declared write`);
      }
      wrappedArea[operation] = tables
        ? announcing(implementation as Mutation, tables, onWrite)
        : (implementation as Mutation).bind(area);
    }

    wrappedJournal[areaName] = wrappedArea;
  }

  return wrappedJournal as unknown as Journal;
}

type Mutation = (...args: never[]) => Promise<unknown>;

function announcing(implementation: Mutation, tables: TableName[], onWrite: (tables: TableName[]) => void) {
  return async (...args: never[]) => {
    const done = markJournalBusy();
    try {
      const result = await implementation(...args);
      onWrite(tables);
      return result;
    } finally {
      done();
    }
  };
}

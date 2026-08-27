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

/** Every table there is, in one place: what an import rewrites, and what
    journal.svelte.ts keeps a version per.

    Coarser than the schema - one name covers a row and everything hanging
    off it, so `entry` means the entry and its dimension values, tag links,
    body-region values and search index. Finer would be precision no screen
    can use: nothing reads `entry_tag` without reading the entry it belongs
    to. */
export const TABLE_NAMES = [
  'entry',
  'tag',
  'dimension',
  'preset',
  'milestone',
  'photo',
  'lab',
  'measurement',
  /* The sizes-and-fit log (phase 5 ticket 23). */
  'sizeRecord',
  'reminder',
  'tally',
  'regimen',
  /* One name for dose events, schedules and pauses alike. Nothing reads a
     schedule or a pause without the doses they are compared against - the
     adherence view needs all three - so splitting them would be precision
     no screen can use. */
  'dose',
  /* Medication stock (phase 4 ticket 04). Its projection reads doses and
     regimen episodes too, but those are announced under their own names
     already - a stock-only screen re-running on a dose write is exactly
     the point. */
  'stock',
  'sideEffect',
  'personalEffect',
  /* Cycle events (phase 5 ticket 03). */
  'cycleEvent',
  /* The journaling pause (phase 5 ticket 21) - Streak's own reads key on
     this too, since a pause changes what Streak answers. */
  'journalingPause',
  /* One name for hair stagings and hair photos alike (phase 4 ticket 09):
     nothing reads one without the other, the same reasoning 'dose' gives -
     the screen shows both against the same anchor. */
  'hairProgress',
  /* One name for hair-removal sessions and their photos alike (phase 5
     ticket 08): nothing reads one without the other, the same reasoning
     'hairProgress' gives. */
  'hairRemoval',
  /* One name for a procedure, its consult dates and its recovery photos
     (phase 5 ticket 07): nothing reads one without the others, the same
     reasoning 'hairProgress' gives. A procedure's recovery checklist is not
     in here - that is an ordinary 'checklist' row, and a write to it has to
     invalidate the appointment prep list's reads too. */
  'procedure',
  /* Counterevidence snapshots (phase 4 ticket 11; the doubt-entry half of
     this screen's writes retired by phase 5 ticket 16). */
  'doubtJournal',
  /* A tryout's own fields (phase 4 ticket 16). Its felt-sense history is
     'feltSense' instead, below: once a milestone could own one too (phase
     5 ticket 24), folding it into 'tryout' the way 'doubtJournal' folds
     its own two tables would make every milestone read stale whenever a
     tryout's felt-sense history changed, and vice versa. */
  'tryout',
  /* A felt-sense entry's own name, the same reason 'photo' gets one
     instead of folding into 'entry'/'milestone': either owner's screen
     has to invalidate on a write to this table, and which one is a
     property of the call, not of the method (phase 5 ticket 24). */
  'feltSense',
  /* Time-capsule letters (phase 4 ticket 19). */
  'letter',
  /* Voice recordings (phase 4 ticket 24). Its own name rather than folded
     into 'entry' the way `hairProgress`/`doubtJournal`/`tryout` fold two
     tables into one name: unlike those, a screen elsewhere - a future
     voice-notes browsing view, or ticket 25's compare mode - could read
     recordings without reading the rest of an entry, the same reason
     'photo' gets its own name instead of folding into 'entry' too. */
  'voiceRecording',
  /* Video notes (phase 5 ticket 22). Its own name rather than folded into
     'entry' or shared with 'voiceRecording', for the reason that one gives:
     a screen could read video notes without reading recordings or the rest
     of an entry, and a shared name would make every recording read stale
     whenever a video note changed. */
  'videoNote',
  /* Roadmap goal ticks (phase 4 ticket 23). One name for every country
     pack's ticks: they live in one table and a screen shows one pack at a
     time, so there is nothing a per-pack name would let a query skip. */
  'roadmapCheck',
  /* Custom roadmap goals (phase 5 ticket 20), kept apart from
     'roadmapCheck': a screen reading the custom goals someone added
     should not re-query just because a bundled goal's tick changed, and
     the reverse. */
  'roadmapGoal',
  /* Checklists and their items alike (phase 5 ticket 05): nothing reads a
     checklist without its items, the same reasoning 'dose' gives. */
  'checklist',
  /* The binder/tucking wear log (phase 5 ticket 04). */
  'wearSession',
  /* The check-in's affirmation pool (phase 5 ticket 15). */
  'affirmation',
  /* The body-region reference-data area (phase 5 ticket 30). An entry's
     own body-region intensities are still announced under 'entry' - this
     is only the region rows themselves: built-in hide/unhide and a custom
     region being added. */
  'bodyRegion',
  /* Measurement types (phase 5 ticket 29): the vocabulary a measurement's
     `type` names, built-in and custom alike. Its own name rather than
     folded into 'measurement': a screen adding or hiding a type has not
     touched a single logged reading, and the reverse. */
  'measurementType',
  /* The effect catalogue's toggleable categories (phase 5 ticket 41,
     CONTEXT: "Effect category") - tag_group's own semantics, over the
     effect vocabulary rather than tags. */
  'effectCategory',
  /* The effect vocabulary itself (phase 5 ticket 41): the open catalogue
     'personalEffect' markers name, built-in and custom alike. Its own
     name for the same reason 'measurementType' has one - hiding or adding
     an effect type has not touched a single marker, and the reverse. */
  'personalEffectType'
] as const;

/** The tables a query can depend on, derived from TABLE_NAMES above. */
export type TableName = (typeof TABLE_NAMES)[number];

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
      // Photos, recordings and video notes as well as the entry: a save
      // carries additions and removals of all three.
      upsertEntry: ['entry', 'photo', 'voiceRecording', 'videoNote'],
      // Trashes the entry rather than removing it (phase 5 ticket 19), but
      // still takes it out of every other read here, the same as before.
      deleteEntry: ['entry', 'photo', 'voiceRecording', 'videoNote'],
      // Brings a trashed entry, its photos, recordings and video notes back.
      restoreEntry: ['entry', 'photo', 'voiceRecording', 'videoNote'],
      setEntryStarred: ['entry']
    },
    reads: [
      'getEntry',
      'entriesForDay',
      'recentDays',
      'entriesWithTag',
      'counterevidencePool',
      'searchEntries',
      'countSearchMatches',
      'trashedEntries'
    ]
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
  affirmations: {
    writes: {
      addLine: ['affirmation'],
      editLine: ['affirmation'],
      setHidden: ['affirmation'],
      deleteLine: ['affirmation']
    },
    reads: ['getAffirmations']
  },
  bodyRegions: {
    writes: {
      addCustomRegion: ['bodyRegion'],
      setRegionHidden: ['bodyRegion']
    },
    reads: ['getBodyRegions']
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
      // Takes its felt-sense history along too (phase 5 ticket 24).
      deleteMilestone: ['milestone', 'photo', 'feltSense']
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
      remove: ['photo', 'entry', 'milestone'],
      setStarred: ['photo', 'entry', 'milestone']
    },
    reads: ['inJournal', 'starredPhotos']
  },
  // Read-only, the same reason exposure and stats are: a recording's row is
  // owned by upsertEntry/deleteEntry (voiceRecording is already announced
  // there), and this area only reads it back dated for the compare picker
  // (ticket 25).
  voice: {
    writes: {},
    reads: ['inJournal']
  },
  // Read-only for the same reason `voice` is: a video note's row is owned by
  // upsertEntry/deleteEntry, which already announce 'videoNote'.
  videos: {
    writes: {},
    reads: ['inJournal']
  },
  labs: {
    writes: { upsertResult: ['lab'], deleteResult: ['lab'] },
    reads: ['getAnalytes', 'getUsedAnalytes', 'getMostRecentAnalyte', 'getResults', 'getSeries']
  },
  measurements: {
    writes: {
      upsertMeasurement: ['measurement'],
      deleteMeasurement: ['measurement'],
      addCustomMeasurementType: ['measurementType'],
      setMeasurementTypeHidden: ['measurementType']
    },
    reads: ['getMeasurements', 'getSeries', 'getMeasurementsInRange', 'getMeasurementTypes']
  },
  sizeRecords: {
    writes: { upsertRecord: ['sizeRecord'], deleteRecord: ['sizeRecord'] },
    reads: ['getRecords', 'getRecordsByCategory']
  },
  sideEffects: {
    writes: { upsertSideEffect: ['sideEffect'], deleteSideEffect: ['sideEffect'] },
    reads: ['getSideEffects', 'getSideEffectsInRange']
  },
  personalEffects: {
    writes: {
      upsertMarker: ['personalEffect'],
      clearMarker: ['personalEffect'],
      addCustomEffectType: ['personalEffectType'],
      setEffectTypeHidden: ['personalEffectType']
    },
    reads: ['getMarkers', 'getEffectTypes']
  },
  effectCategories: {
    writes: { setCategoryEnabled: ['effectCategory'] },
    reads: ['getEffectCategories']
  },
  cycleEvents: {
    writes: { upsertCycleEvent: ['cycleEvent'], deleteCycleEvent: ['cycleEvent'] },
    reads: ['getCycleEvents', 'getCycleEventsInRange']
  },
  journalingPauses: {
    writes: { upsertPause: ['journalingPause'], deletePause: ['journalingPause'] },
    reads: ['getPauses']
  },
  wearSessions: {
    writes: {
      // A save can also create, move or clear this session's own reminder
      // (wearSessions.ts), the same reason stock's deleteEntry announces
      // both tables.
      upsertSession: ['wearSession', 'reminder'],
      deleteSession: ['wearSession', 'reminder']
    },
    reads: ['getSessions', 'getRunningSession']
  },
  hairProgress: {
    writes: {
      upsertStage: ['hairProgress'],
      deleteStage: ['hairProgress'],
      addPhoto: ['hairProgress'],
      deletePhoto: ['hairProgress']
    },
    reads: ['getStages', 'getPhotos']
  },
  hairRemoval: {
    writes: {
      upsertSession: ['hairRemoval'],
      deleteSession: ['hairRemoval'],
      addPhoto: ['hairRemoval'],
      deletePhoto: ['hairRemoval']
    },
    reads: ['getSessions', 'getPhotos']
  },
  /* deleteProcedure and addChecklistItem write 'checklist' as well as
     'procedure': the recovery checklist is an ordinary checklist row, so a
     screen watching checklists has to hear about it. */
  procedures: {
    writes: {
      upsertProcedure: ['procedure'],
      deleteProcedure: ['procedure', 'checklist'],
      setNotes: ['procedure'],
      addConsult: ['procedure'],
      deleteConsult: ['procedure'],
      addPhoto: ['procedure'],
      deletePhoto: ['procedure'],
      addChecklistItem: ['procedure', 'checklist']
    },
    reads: ['getProcedures', 'getPhotos', 'getChecklist']
  },
  reminders: {
    writes: { upsertReminder: ['reminder'], deleteReminder: ['reminder'], setEnabled: ['reminder'] },
    reads: ['getReminders']
  },
  doubtJournal: {
    writes: {
      saveSnapshot: ['doubtJournal'],
      deleteSnapshot: ['doubtJournal']
    },
    reads: ['getSnapshots']
  },
  tryouts: {
    writes: {
      upsertTryout: ['tryout'],
      // Takes its felt-sense history along too.
      deleteTryout: ['tryout', 'feltSense'],
      addPhoto: ['tryout'],
      deletePhoto: ['tryout']
    },
    reads: ['getTryouts', 'getPhotos']
  },
  feltSense: {
    /* Which owner a felt-sense write belongs to is a property of the call,
       not of the method, so both `feltSense` and the owner's own name are
       announced - the same reasoning `photos` gives for `entry`/`milestone`. */
    writes: {
      add: ['feltSense', 'tryout', 'milestone'],
      remove: ['feltSense', 'tryout', 'milestone']
    },
    reads: ['forTryout', 'forMilestone']
  },
  letters: {
    writes: { addLetter: ['letter'], deleteLetter: ['letter'] },
    reads: ['getLetters']
  },
  roadmap: {
    writes: {
      setGoalStatus: ['roadmapCheck'],
      addCustomGoal: ['roadmapGoal'],
      setCustomGoalStatus: ['roadmapGoal']
    },
    reads: ['getGoalStatuses', 'getCustomGoals']
  },
  checklists: {
    writes: {
      createChecklist: ['checklist'],
      deleteChecklist: ['checklist'],
      addItem: ['checklist'],
      addToStandaloneChecklist: ['checklist'],
      addToOwnedChecklist: ['checklist'],
      editItem: ['checklist'],
      setItemChecked: ['checklist'],
      setItemCarriedForward: ['checklist'],
      deleteItem: ['checklist'],
      reorder: ['checklist']
    },
    reads: ['getChecklist', 'getChecklistByOwner', 'getStandaloneChecklist']
  },
  tally: {
    writes: { log: ['tally'], deleteEvent: ['tally'] },
    reads: ['getEvents']
  },
  regimen: {
    writes: { upsertEpisode: ['regimen'], endEpisode: ['regimen'] },
    reads: ['getEpisodes']
  },
  doses: {
    writes: {
      upsertDose: ['dose'],
      deleteDose: ['dose'],
      upsertSchedule: ['dose'],
      upsertPause: ['dose'],
      deletePause: ['dose']
    },
    reads: ['getDoses', 'getSchedules', 'getPauses']
  },
  stock: {
    writes: {
      upsertEntry: ['stock'],
      deleteEntry: ['stock', 'reminder'],
      // Box 4: reconciling can create, move or clear the drug's run-out
      // Reminder as well as this drug's own bookkeeping.
      reconcileRunOutReminders: ['stock', 'reminder']
    },
    reads: ['getEntries', 'getProjections']
  },
  // Read-only, like stats below: exposure counters never write (phase 4
  // ticket 05).
  exposure: {
    writes: {},
    reads: ['getCounters']
  },
  // Read-only too: a hormone curve is recomputed from the dose log on every
  // read and stored nowhere (phase 4 ticket 10, ADR-0010).
  hormoneCurve: {
    writes: {},
    reads: ['getCurves']
  },
  // Read-only for the same reason: a qualitative curve is recomputed on
  // every read too (phase 4 ticket 11, ADR-0010).
  qualitativeCurve: {
    writes: {},
    reads: ['getCurves']
  },
  // Read-only, the same reason exposure is: a clinician summary assembles
  // rows other areas own and stores nothing of its own (phase 4 ticket 12).
  clinicianSummary: {
    writes: {},
    reads: ['getSummary']
  },
  // Read-only, the same reason clinicianSummary is: a book is assembled
  // from entries, milestones, the doubt journal and side effects on every
  // read and stored nowhere (phase 5 ticket 17).
  journalBook: {
    writes: {},
    reads: ['getBook']
  },
  // The one area that never writes: stats (ADR-0017's ticket-10 amendment).
  stats: {
    writes: {},
    reads: ['dayAverages', 'bodyRegionTrend', 'wearTimeTrend', 'tallyTrend', 'entryCountsByDay', 'tagInsights', 'streak', 'bestStreakEver', 'recap', 'isGoodDay']
  },
  // Read-only, the same reason exposure is: a card is recomputed from
  // stats, the dose log and dimensions on every read (phase 4 ticket 21).
  correlationCards: {
    writes: {},
    reads: ['getCards']
  },
  // Read-only, the same reason correlationCards is: a pattern is
  // recomputed from stats and the dose log on every read (phase 5 ticket 09).
  intervalMoodPattern: {
    writes: {},
    reads: ['dayOfInterval', 'byCustomInterval']
  },
  /* An import rewrites the journal (ticket 14), so it invalidates all of it -
     every query and every mirrored slice. Naming the tables one at a time
     would be a list to keep in step with what a restore happens to touch,
     and a Replace touches everything by definition. */
  archive: {
    writes: { replace: [...TABLE_NAMES], merge: [...TABLE_NAMES], commitDaylioImport: [...TABLE_NAMES] },
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
/** The tables one classified operation writes, for the one caller that makes
    the same change from outside the journal handle: boot's trash purge
    finishes the delete `deleteEntry` starts, over the driver rather than
    through the wrapper, and still has to invalidate what that write
    invalidates (phase 5 audit ticket 02).

    Here rather than as a second list at the call site, for this file's own
    reason: a table added to an operation above must not need a second edit
    somewhere else to be announced. Throws on an unclassified name, the same
    way observeWrites does. */
export function tablesWrittenBy(area: string, operation: string): TableName[] {
  const tables = OPERATIONS[area]?.writes[operation];
  if (!tables) throw new Error(`journal.${area}.${operation} is not a classified write`);
  return tables;
}

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

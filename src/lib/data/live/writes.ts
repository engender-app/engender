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
import { CLINICIAN_SUMMARY_TABLES } from '../journal/clinicianSummary';
import { DAY_TABLES } from '../journal/day';
import { LAST_WRITE_TABLES } from '../journal/lastWrite';
import { SEARCH_TABLES } from '../journal/textSearch';
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
  /* The person's named eras (phase 6 ticket 01, ADR-0049). Its own name and
     not folded into 'entry', even though `getJournalBounds` reads the entry
     table: an era read has to re-run when an era is written, and an entry
     write already announces 'entry', so the two names together are what
     keeps a clamped range from going stale in either direction. */
  'era',
  /* Which eras are muted (phase 6 ticket 05, ADR-0049). Its own name rather
     than folded into 'era': plenty of era reads (/compare, the calendar, a
     chart's boundaries) have no reason to re-run when a mute changes, and a
     mute write does not change anything `getEras()` itself returns. */
  'eraMute',
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
  /* The person's own comfort list (phase 6 ticket 14). Its own name and not
     folded into 'doubtJournal': the two live on the same screen but neither
     reads the other's table, so a write to one must not re-run the other's
     query. */
  'comfortItem',
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
  /* Voice benchmarks (phase 5 deepening ticket 15). Kept apart from
     'voiceRecording' for the same reason the table is: a benchmark and a
     memo are different records, and the benchmark surfaces - Home's nudge
     tile, the compare view - must not re-query every time an entry's voice
     memo changes, nor the reverse. */
  'voiceBenchmark',
  /* Practice takes (phase 8 features ticket 10). Its own name and not
     folded into 'voiceBenchmark': the two are different activities, never
     read together, and a practice save should not re-run a benchmark
     screen's own reads. */
  'voicePracticeTake',
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
  'personalEffectType',
  /* The fluidity engine's named presentations (phase 5 deepening ticket 17,
     ADR-0048, CONTEXT: "Presentation"): a name and a flag-role colour, built
     and hidden the way a tag or a measurement type is. An entry's own
     `presentation_id` is announced under 'entry' instead, the same split
     'tag' and 'entry_tag' get - resolving which presentation an id names is
     this table's business, not the entry's. */
  'presentation',
  /* Entry templates (phase 6 ticket 07, ADR-0002): the folded-in guided
     prompts and the six original templates alike, built and hidden the way
     a tag or a measurement type is. An entry created from one carries no
     link back to it - applying a template only ever seeds the draft
     (types.ts) - so no read here depends on 'entry'. */
  'entryTemplate',
  /* The import log (phase 7 ticket 03): its own name so the settings
     screen's `importLog` read does not re-run on every other write - only
     an import itself touches this table. */
  'importLog',
  /* Which areas are hidden and which are finished (phase 8 deepening ticket
     13, ADR-0052). Its own name rather than folded into any of the areas it
     speaks about: a hub row reading every area's state at once would have to
     re-run on a write to any of nineteen tables, and hiding an area has not
     touched a single record in it. */
  'areaState',
  /* A saved question (phase 8 features ticket 06). Its own name rather than
     folded into any of the search-adjacent tables: no other read here
     depends on a saved question's row, and saving or renaming one changes
     nothing a search itself returns. */
  'savedQuestion',
  /* A revisit (phase 8 features ticket 08, ADR-0045). Its own name rather
     than folded into 'entry': setting or cancelling one changes nothing an
     entry read returns, and the live tile's own read would otherwise
     re-run on every entry write in the journal. */
  'revisit',
  /* A margin note (phase 8 features ticket 07). Its own name and not
     folded into 'entry': the whole point of the feature is that a margin
     note and the entry it annotates are read and written apart, so an
     entry's own query must not re-run when a margin note changes, and the
     reverse - adding, editing or removing a note must not make every
     screen reading entries think the entry itself changed. */
  'marginNote'
] as const;

/** The tables a query can depend on, derived from TABLE_NAMES above. */
export type TableName = (typeof TABLE_NAMES)[number];

/** Every operation on one area, by name: the tables it writes, or the tables
    it reads. */
type Operation<Area> = Extract<
  { [K in keyof Area]: Area[K] extends (...args: never[]) => unknown ? K : never }[keyof Area],
  string
>;

interface Classified<Area> {
  writes: Partial<Record<Operation<Area>, TableName[]>>;
  reads: Partial<Record<Operation<Area>, TableName[]>>;
}

/** One area's classification, checked against the area's own type: every
    method has to appear under `writes` or under `reads`, and a name that is
    neither is a compile error rather than a boot-time throw.

    The missing ones arrive as a required `unclassified` property naming
    them, which is the only way to get TypeScript to say *which* method was
    forgotten. `observeWrites` still throws at boot for the case no type can
    see - a build carrying an area or a method this file has never heard of. */
function classify<Area>() {
  return <const Spec extends Classified<Area>>(
    spec: Spec &
      (Exclude<Operation<Area>, keyof Spec['writes'] | keyof Spec['reads']> extends never
        ? unknown
        : { unclassified: Exclude<Operation<Area>, keyof Spec['writes'] | keyof Spec['reads']> })
  ): Classified<Area> => spec;
}

/** What every read of an entry depends on, stated once: `hydrate` fills each
    row's dimension values, tag links, photos, recordings and video notes, so
    a write to any of those changes what an entry list shows. */
const HYDRATED_ENTRY: TableName[] = ['entry', 'dimension', 'tag', 'photo', 'voiceRecording', 'videoNote'];

/** Every operation each area offers, split by whether it changes anything.
    `writes` maps to the tables the operation writes; `reads` to the tables
    the operation reads - the same shape, because both halves answer the same
    question and a screen should have to ask neither (phase 5 audit ticket
    03). A read's list is what the read's own SQL touches, transitively
    through the areas it composes: `stock.getProjections` reads the episode
    history through `regimen.getEpisodes`, so `regimen` is on its list.

    Keyed by `keyof Journal`, so a new area is a compile error here rather
    than a boot-time throw; the throw in `observeWrites` stays for the case
    the types cannot see, a build whose journal carries an area this file has
    never heard of. */
const OPERATIONS: { [Area in keyof Omit<Journal, JournalWideOperation>]: Classified<Journal[Area]> } = {
  entries: classify<Journal['entries']>()({
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
    reads: {
      getEntry: HYDRATED_ENTRY,
      entriesForDay: HYDRATED_ENTRY,
      recentDays: HYDRATED_ENTRY,
      entriesWithTag: HYDRATED_ENTRY,
      counterevidencePool: HYDRATED_ENTRY,
      latestBadMomentEntry: HYDRATED_ENTRY,
      searchEntries: HYDRATED_ENTRY,
      // A count, so no hydration: the search clause itself joins the tag
      // tables, and nothing else is read back.
      countSearchMatches: ['entry', 'tag'],
      trashedEntries: HYDRATED_ENTRY,
      // A bare `MAX(epoch_day)`, not the hydrated shape: nothing here reads
      // a tag, a photo, a recording or a video note.
      lastWriteEpochDay: ['entry'],
      // Note, day and presentation only - the word-frequency fold's own
      // read (phase 8 features ticket 14), not the hydrated shape.
      noteEntries: ['entry']
    }
  }),
  tags: classify<Journal['tags']>()({
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
    reads: { getTagGroups: ['tag'] }
  }),
  presentations: classify<Journal['presentations']>()({
    writes: {
      addPresentation: ['presentation'],
      renamePresentation: ['presentation'],
      setPresentationColour: ['presentation'],
      setPresentationHidden: ['presentation']
    },
    // The MRU order joins the entry table's own timestamps
    // (presentations.ts), so a chip's order has to refresh on an entry write
    // too, not only on a rename or a recolour.
    reads: { getPresentations: ['presentation', 'entry'] }
  }),
  entryTemplates: classify<Journal['entryTemplates']>()({
    writes: {
      addEntryTemplate: ['entryTemplate'],
      updateEntryTemplate: ['entryTemplate'],
      setEntryTemplateHidden: ['entryTemplate']
    },
    reads: { getEntryTemplates: ['entryTemplate'] }
  }),
  affirmations: classify<Journal['affirmations']>()({
    writes: {
      addLine: ['affirmation'],
      editLine: ['affirmation'],
      setHidden: ['affirmation'],
      deleteLine: ['affirmation']
    },
    reads: { getAffirmations: ['affirmation'] }
  }),
  bodyRegions: classify<Journal['bodyRegions']>()({
    writes: {
      addCustomRegion: ['bodyRegion'],
      setRegionHidden: ['bodyRegion']
    },
    reads: { getBodyRegions: ['bodyRegion'] }
  }),
  dimensions: classify<Journal['dimensions']>()({
    writes: {
      addCustomDimension: ['dimension'],
      addPreset: ['preset'],
      setDimensionHidden: ['dimension']
    },
    reads: { getDimensions: ['dimension'], getPresets: ['dimension', 'preset'] }
  }),
  milestones: classify<Journal['milestones']>()({
    writes: {
      // A milestone save can preserve, remove or replace its photo.
      upsertMilestone: ['milestone', 'photo'],
      // Takes its felt-sense history along too (phase 5 ticket 24).
      deleteMilestone: ['milestone', 'photo', 'feltSense']
    },
    // A milestone is read back with its photos on it, the same way an entry
    // is.
    reads: {
      getMilestones: ['milestone', 'photo'],
      getMilestonesOnDay: ['milestone', 'photo'],
      // No photo join: the registry wants the date, not the photo indicator.
      lastWriteEpochDay: ['milestone']
    }
  }),
  photos: classify<Journal['photos']>()({
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
    // Both reads join the owners, to date each photo and to say which record
    // it hangs off.
    reads: { inJournal: ['photo', 'entry', 'milestone'], starredPhotos: ['photo', 'entry', 'milestone'] }
  }),
  // Read-only, the same reason exposure and stats are: a recording's row is
  // owned by upsertEntry/deleteEntry (voiceRecording is already announced
  // there), and this area only reads it back dated for the compare picker
  // (ticket 25).
  voice: classify<Journal['voice']>()({
    writes: {},
    reads: { inJournal: ['voiceRecording', 'entry'] }
  }),
  // Unlike `voice`, this area owns its rows: a benchmark is not written
  // through the entry editor, so the save announces its own table.
  voiceBenchmarks: classify<Journal['voiceBenchmarks']>()({
    writes: { saveBenchmark: ['voiceBenchmark'], deleteBenchmark: ['voiceBenchmark'] },
    reads: {
      getBenchmarks: ['voiceBenchmark'],
      getBenchmarksOnDay: ['voiceBenchmark'],
      lastWriteEpochDay: ['voiceBenchmark']
    }
  }),
  voicePracticeTakes: classify<Journal['voicePracticeTakes']>()({
    writes: { addTake: ['voicePracticeTake'], deleteTake: ['voicePracticeTake'] },
    reads: {
      getTakes: ['voicePracticeTake'],
      getTakesOnDay: ['voicePracticeTake'],
      lastWriteEpochDay: ['voicePracticeTake']
    }
  }),
  // Read-only for the same reason `voice` is: a video note's row is owned by
  // upsertEntry/deleteEntry, which already announce 'videoNote'.
  videos: classify<Journal['videos']>()({
    writes: {},
    reads: { inJournal: ['videoNote', 'entry'] }
  }),
  labs: classify<Journal['labs']>()({
    writes: { upsertResult: ['lab'], deleteResult: ['lab'] },
    /* All seven read `lab_result` and nothing else. `dose_event` is read on
       the write path only - a result's dosing context is derived when it is
       saved and frozen there (labs.ts), so a later dose edit cannot change
       what any of these answers. */
    reads: {
      getAnalytes: ['lab'],
      getUsedAnalytes: ['lab'],
      getMostRecentAnalyte: ['lab'],
      getLatestResult: ['lab'],
      getResults: ['lab'],
      getResultsOnDay: ['lab'],
      getSeries: ['lab'],
      lastWriteEpochDay: ['lab']
    }
  }),
  measurements: classify<Journal['measurements']>()({
    writes: {
      upsertMeasurement: ['measurement'],
      deleteMeasurement: ['measurement'],
      addCustomMeasurementType: ['measurementType'],
      setMeasurementTypeHidden: ['measurementType']
    },
    reads: {
      getMeasurements: ['measurement'],
      getSeries: ['measurement'],
      getMeasurementsInRange: ['measurement'],
      getMeasurementTypes: ['measurementType'],
      lastWriteEpochDay: ['measurement']
    }
  }),
  sizeRecords: classify<Journal['sizeRecords']>()({
    writes: { upsertRecord: ['sizeRecord'], deleteRecord: ['sizeRecord'] },
    reads: {
      getRecords: ['sizeRecord'],
      getRecordsByCategory: ['sizeRecord'],
      getRecordsOnDay: ['sizeRecord'],
      lastWriteEpochDay: ['sizeRecord']
    }
  }),
  sideEffects: classify<Journal['sideEffects']>()({
    writes: { upsertSideEffect: ['sideEffect'], deleteSideEffect: ['sideEffect'] },
    reads: { getSideEffects: ['sideEffect'], getSideEffectsInRange: ['sideEffect'], lastWriteEpochDay: ['sideEffect'] }
  }),
  personalEffects: classify<Journal['personalEffects']>()({
    writes: {
      upsertMarker: ['personalEffect'],
      clearMarker: ['personalEffect'],
      addCustomEffectType: ['personalEffectType'],
      setEffectTypeHidden: ['personalEffectType']
    },
    reads: {
      getMarkers: ['personalEffect'],
      getMarkersFirstNoticedOn: ['personalEffect'],
      getEffectTypes: ['personalEffectType'],
      lastWriteEpochDay: ['personalEffect']
    }
  }),
  effectCategories: classify<Journal['effectCategories']>()({
    writes: { setCategoryEnabled: ['effectCategory'] },
    reads: { getEffectCategories: ['effectCategory'] }
  }),
  cycleEvents: classify<Journal['cycleEvents']>()({
    writes: { upsertCycleEvent: ['cycleEvent'], deleteCycleEvent: ['cycleEvent'] },
    reads: {
      getCycleEvents: ['cycleEvent'],
      getCycleEventsInRange: ['cycleEvent'],
      lastWriteEpochDay: ['cycleEvent']
    }
  }),
  journalingPauses: classify<Journal['journalingPauses']>()({
    writes: { upsertPause: ['journalingPause'], deletePause: ['journalingPause'] },
    reads: { getPauses: ['journalingPause'] }
  }),
  savedQuestions: classify<Journal['savedQuestions']>()({
    writes: { upsertSavedQuestion: ['savedQuestion'], deleteSavedQuestion: ['savedQuestion'] },
    reads: { getSavedQuestions: ['savedQuestion'] }
  }),
  revisits: classify<Journal['revisits']>()({
    writes: { setRevisit: ['revisit'], deleteRevisit: ['revisit'] },
    reads: { getRevisitForEntry: ['revisit'], getDueRevisits: ['revisit'] }
  }),
  marginNotes: classify<Journal['marginNotes']>()({
    writes: { add: ['marginNote'], edit: ['marginNote'], remove: ['marginNote'] },
    reads: { forEntries: ['marginNote'] }
  }),
  eras: classify<Journal['eras']>()({
    writes: { upsertEra: ['era'], deleteEra: ['era'] },
    // getJournalBounds is the journal's own first and last entry day, which
    // an open bound clamps to at read time (ADR-0010) - so it keys on
    // 'entry' and not on 'era' at all.
    reads: { getEras: ['era'], getJournalBounds: ['entry'] }
  }),
  eraMutes: classify<Journal['eraMutes']>()({
    writes: { setEraMuted: ['eraMute'] },
    reads: { getMutedEraUuids: ['eraMute'] }
  }),
  wearSessions: classify<Journal['wearSessions']>()({
    writes: {
      // A save can also create, move or clear this session's own reminder
      // (wearSessions.ts), the same reason stock's deleteEntry announces
      // both tables.
      upsertSession: ['wearSession', 'reminder'],
      deleteSession: ['wearSession', 'reminder']
    },
    reads: { getSessions: ['wearSession'], getRunningSession: ['wearSession'], lastWriteEpochDay: ['wearSession'] }
  }),
  hairProgress: classify<Journal['hairProgress']>()({
    writes: {
      upsertStage: ['hairProgress'],
      deleteStage: ['hairProgress'],
      addPhoto: ['hairProgress'],
      deletePhoto: ['hairProgress']
    },
    reads: {
      getStages: ['hairProgress'],
      getStagesOnDay: ['hairProgress'],
      getPhotos: ['hairProgress'],
      getPhotosOnDay: ['hairProgress'],
      lastStageWriteEpochDay: ['hairProgress'],
      lastPhotoWriteEpochDay: ['hairProgress']
    }
  }),
  hairRemoval: classify<Journal['hairRemoval']>()({
    writes: {
      upsertSession: ['hairRemoval'],
      deleteSession: ['hairRemoval'],
      addPhoto: ['hairRemoval'],
      deletePhoto: ['hairRemoval']
    },
    reads: {
      getSessions: ['hairRemoval'],
      getSessionsOnDay: ['hairRemoval'],
      getPhotos: ['hairRemoval'],
      lastWriteEpochDay: ['hairRemoval']
    }
  }),
  /* deleteProcedure and addChecklistItem write 'checklist' as well as
     'procedure': the recovery checklist is an ordinary checklist row, so a
     screen watching checklists has to hear about it. */
  procedures: classify<Journal['procedures']>()({
    writes: {
      upsertProcedure: ['procedure'],
      deleteProcedure: ['procedure', 'checklist', 'milestone'],
      setNotes: ['procedure'],
      addConsult: ['procedure'],
      deleteConsult: ['procedure'],
      addPhoto: ['procedure'],
      deletePhoto: ['procedure'],
      addChecklistItem: ['procedure', 'checklist'],
      recordSurgeryMilestone: ['procedure', 'milestone']
    },
    // getChecklist reads the checklist table alone, through the checklists
    // area: the recovery checklist is an ordinary owned Checklist and the
    // procedure row is not read to find it.
    reads: {
      getProcedures: ['procedure'],
      getPhotos: ['procedure'],
      getDayRecords: ['procedure'],
      getChecklist: ['checklist'],
      getMilestone: ['milestone'],
      lastWriteEpochDay: ['procedure']
    }
  }),
  reminders: classify<Journal['reminders']>()({
    writes: { upsertReminder: ['reminder'], deleteReminder: ['reminder'], setEnabled: ['reminder'] },
    reads: { getReminders: ['reminder'] }
  }),
  doubtJournal: classify<Journal['doubtJournal']>()({
    writes: {
      saveSnapshot: ['doubtJournal'],
      deleteSnapshot: ['doubtJournal']
    },
    reads: { getSnapshots: ['doubtJournal'] }
  }),
  areaStates: classify<Journal['areaStates']>()({
    writes: {
      setAreasHidden: ['areaState'],
      setAreasFinished: ['areaState']
    },
    reads: { getAreaStates: ['areaState'] }
  }),
  comfortItems: classify<Journal['comfortItems']>()({
    writes: {
      addItem: ['comfortItem'],
      editItem: ['comfortItem'],
      deleteItem: ['comfortItem'],
      reorder: ['comfortItem']
    },
    reads: { getItems: ['comfortItem'] }
  }),
  tryouts: classify<Journal['tryouts']>()({
    writes: {
      upsertTryout: ['tryout'],
      // Takes its felt-sense history along too, and unlinks any milestone
      // it was adopted into rather than leaving its tryout_id dangling
      // (phase 5 deepening ticket 22, ADR-0045).
      deleteTryout: ['tryout', 'feltSense', 'milestone'],
      addPhoto: ['tryout'],
      deletePhoto: ['tryout'],
      adoptTryout: ['tryout', 'milestone', 'feltSense']
    },
    reads: {
      getTryouts: ['tryout'],
      getPhotos: ['tryout'],
      getPhotosOnDay: ['tryout'],
      lastWriteEpochDay: ['tryout']
    }
  }),
  feltSense: classify<Journal['feltSense']>()({
    /* Which owner a felt-sense write belongs to is a property of the call,
       not of the method, so both `feltSense` and the owner's own name are
       announced - the same reasoning `photos` gives for `entry`/`milestone`. */
    writes: {
      add: ['feltSense', 'tryout', 'milestone'],
      remove: ['feltSense', 'tryout', 'milestone']
    },
    // A read knows its owner, unlike a write: the history is joined to the
    // one record it hangs off.
    reads: {
      forTryout: ['feltSense', 'tryout'],
      forMilestone: ['feltSense', 'milestone'],
      // Both owners' names travel on a day's rows, so both tables are read.
      onDay: ['feltSense', 'tryout', 'milestone'],
      // No owner join: the registry wants the date across both owners.
      lastWriteEpochDay: ['feltSense']
    }
  }),
  letters: classify<Journal['letters']>()({
    writes: { addLetter: ['letter'], deleteLetter: ['letter'] },
    reads: { getLetters: ['letter'], getLetter: ['letter'] }
  }),
  roadmap: classify<Journal['roadmap']>()({
    writes: {
      setGoalStatus: ['roadmapCheck'],
      addCustomGoal: ['roadmapGoal'],
      setCustomGoalStatus: ['roadmapGoal']
    },
    reads: { getGoalStatuses: ['roadmapCheck'], getCustomGoals: ['roadmapGoal'] }
  }),
  checklists: classify<Journal['checklists']>()({
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
      reorder: ['checklist'],
      setAppointmentDate: ['checklist'],
      setDebriefDismissed: ['checklist'],
      recordDebriefEntry: ['checklist']
    },
    reads: {
      getChecklist: ['checklist'],
      getChecklistByOwner: ['checklist'],
      getStandaloneChecklist: ['checklist'],
      getAppointmentDate: ['checklist'],
      getDebriefState: ['checklist'],
      getDebriefDismissedEpochDay: ['checklist'],
      getDebriefEntryId: ['checklist']
    }
  }),
  tally: classify<Journal['tally']>()({
    writes: { log: ['tally'], deleteEvent: ['tally'] },
    reads: { getEvents: ['tally'], getEventsOnDay: ['tally'], lastWriteEpochDay: ['tally'] }
  }),
  regimen: classify<Journal['regimen']>()({
    writes: { upsertEpisode: ['regimen'], endEpisode: ['regimen'] },
    reads: { getEpisodes: ['regimen'] }
  }),
  doses: classify<Journal['doses']>()({
    writes: {
      upsertDose: ['dose'],
      deleteDose: ['dose'],
      upsertSchedule: ['dose'],
      upsertPause: ['dose'],
      deletePause: ['dose']
    },
    // A schedule and a pause both hang off an episode, and are read back
    // joined to it (doses.ts), so ending an episode changes what they answer.
    reads: {
      getDoses: ['dose'],
      getSchedules: ['dose', 'regimen'],
      getPauses: ['dose', 'regimen'],
      // The comparison reads the episode history as well: which episode is in
      // effect, and which of them each dose is attributed to (doses.ts).
      getComparison: ['dose', 'regimen'],
      lastWriteEpochDay: ['dose']
    }
  }),
  stock: classify<Journal['stock']>()({
    writes: {
      upsertEntry: ['stock'],
      deleteEntry: ['stock', 'reminder'],
      // Box 4: reconciling can create, move or clear the drug's run-out
      // Reminder as well as this drug's own bookkeeping.
      reconcileRunOutReminders: ['stock', 'reminder']
    },
    /* A projection is the count, the dose log and the episode history
       (stockProjection.ts) - the third of those is what the stock screen
       used to leave out, so editing a Regimen episode left the old run-out
       date on screen. */
    reads: { getEntries: ['stock'], getProjections: ['stock', 'dose', 'regimen'] }
  }),
  /* Read-only for the same reason exposure below is: an annotation is
     selected out of seven other areas' rows on every read and stored nowhere
     (ADR-0010, phase 5 deepening ticket 23). One table per area behind it -
     'dose' covers the pauses, which is where DosePause lives. 'era' joined
     in phase 6 ticket 03, for the boundary a bounded era's start draws. */
  chartAnnotations: classify<Journal['chartAnnotations']>()({
    writes: {},
    reads: {
      /* 'areaState' since phase 8 features ticket 04: the day a stream
         ended draws beside the seven kinds above. */
      getAnnotations: ['milestone', 'regimen', 'dose', 'journalingPause', 'tryout', 'procedure', 'era', 'areaState'],
      /* The hormone curve's own markers (phase 8 features ticket 15), which
         are a separate read for the reason the header there gives. 'entry'
         is the body-region readings and 'tally' the counters, both judged
         against the person's own recent spread. */
      getCurveMarkers: ['sideEffect', 'dose', 'regimen', 'tally', 'entry']
    }
  }),
  // Read-only, like stats below: exposure counters never write (phase 4
  // ticket 05).
  exposure: classify<Journal['exposure']>()({
    writes: {},
    reads: { getCounters: ['dose', 'regimen'] }
  }),
  // Read-only too: every hormone curve, band and shape alike, is recomputed
  // from the dose log on every read and stored nowhere (phase 4 tickets 10
  // and 11, ADR-0010).
  hormoneCurve: classify<Journal['hormoneCurve']>()({
    writes: {},
    reads: { getCurves: ['dose', 'regimen', 'lab'] }
  }),
  /* Read-only, the same reason exposure is: a clinician summary assembles
     rows other areas own and stores nothing of its own (phase 4 ticket 12).
     Its table list is the section registry's own rather than a copy taken
     from it (clinicianSummary.ts's CLINICIAN_SUMMARY_TABLES), for the reason
     day's is: a section registered there brings its tables with it, so a
     summary cannot go stale on a write to an area registered after this line
     was written. */
  clinicianSummary: classify<Journal['clinicianSummary']>()({
    writes: {},
    reads: { getSummary: CLINICIAN_SUMMARY_TABLES }
  }),
  /* Read-only for the same reason, and its table list is the registry's own
     rather than a copy taken from it (day.ts's DAY_TABLES): a section added
     there brings its tables with it, so a day cannot go stale on a write to
     an area registered after this line was written. */
  day: classify<Journal['day']>()({
    writes: {},
    reads: { getDay: DAY_TABLES }
  }),
  /* Read-only, and its table list is its own registry's for the reason
     day's is (lastWrite.ts's LAST_WRITE_TABLES): an area registered there
     brings its tables with it, so a last write cannot go stale on a write to
     an area registered after this line was written. */
  lastWrite: classify<Journal['lastWrite']>()({
    writes: {},
    reads: { getLastWrites: LAST_WRITE_TABLES }
  }),
  /* Read-only, and its table list is its own registry's for the reason day's
     is (textSearch.ts's SEARCH_TABLES): an area registered there brings its
     tables with it, so a search result cannot go stale on a write to an area
     registered after this line was written. */
  textSearch: classify<Journal['textSearch']>()({
    writes: {},
    reads: { search: SEARCH_TABLES }
  }),
  // Read-only, the same reason clinicianSummary is: a book is assembled
  // from entries, milestones, side effects and a recap on every read and
  // stored nowhere (phase 5 ticket 17). It has never read the doubt journal,
  // which this comment used to claim it did.
  journalBook: classify<Journal['journalBook']>()({
    writes: {},
    // The entry half is a hydrated read, so it carries everything an entry
    // is read back with; the opening page adds the recap's milestones.
    reads: { getBook: [...HYDRATED_ENTRY, 'milestone', 'sideEffect'] }
  }),
  // The one area that never writes: stats (ADR-0017's ticket-10 amendment).
  stats: classify<Journal['stats']>()({
    writes: {},
    /* A metric that is not mood is read through `entry_dimension_value` and
       `gender_dimension`, so every average, insight and recap depends on the
       dimension vocabulary as well as on entries. */
    reads: {
      dayAverages: ['entry', 'dimension'],
      // The calendar's spread mark is the same rows read a second way, so
      // it goes stale on exactly what the average goes stale on.
      daySpread: ['entry', 'dimension'],
      /* The constellation reads both scales through the dimension
         vocabulary the same way, and carries the entry's presentation, so
         renaming a mode has to reach it (ticket 19). */
      constellationReadings: ['entry', 'dimension', 'presentation'],
      bodyRegionTrend: ['entry'],
      bodyRegionBreakdown: ['entry', 'measurement', 'photo', 'hairRemoval', 'hairProgress'],
      wearTimeTrend: ['wearSession'],
      tallyTrend: ['tally'],
      bodyRegionReadings: ['entry'],
      entryCountsByDay: ['entry'],
      // Filters entry.presentation_id directly, the same reason
      // bodyRegionTrend above depends on 'entry' alone: which days match
      // never changes when a presentation is renamed, recoloured or hidden.
      presentationDays: ['entry'],
      tagInsights: ['entry', 'dimension', 'tag'],
      // A pause bridges a gap without extending the count (phase 5 ticket
      // 21), which is the second table the streak-goal screen forgot.
      streak: ['entry', 'journalingPause'],
      // Deliberately entry-only: "best streak" is the gaps-and-islands
      // question over entries, which ticket 21 left alone.
      bestStreakEver: ['entry'],
      recap: ['entry', 'dimension', 'tag', 'milestone', 'photo'],
      isGoodDay: ['entry', 'tag']
    }
  }),
  // Read-only, the same reason exposure is: a card is recomputed from
  // stats, the dose log and dimensions on every read (phase 4 ticket 21).
  correlationCards: classify<Journal['correlationCards']>()({
    writes: {},
    reads: { getCards: ['entry', 'dimension', 'tag', 'dose'] }
  }),
  // Read-only, the same reason correlationCards is: a pattern is
  // recomputed from stats and the dose log on every read (phase 5 ticket 09).
  intervalMoodPattern: classify<Journal['intervalMoodPattern']>()({
    writes: {},
    // The custom fold reads no dose log: it folds by the epoch day itself,
    // which is the whole of its "no claim that a cycle exists".
    reads: {
      dayOfInterval: ['entry', 'dimension', 'dose'],
      byCustomInterval: ['entry', 'dimension']
    }
  }),
  /* An import rewrites the journal (ticket 14), so it invalidates all of it -
     every query and every mirrored slice. Naming the tables one at a time
     would be a list to keep in step with what a restore happens to touch,
     and a Replace touches everything by definition. */
  archive: classify<Journal['archive']>()({
    writes: {
      replace: [...TABLE_NAMES],
      merge: [...TABLE_NAMES],
      commitDaylioImport: [...TABLE_NAMES],
      commitDaylioBackupImport: [...TABLE_NAMES],
      commitTransTracksImport: [...TABLE_NAMES],
      commitDayOneImport: [...TABLE_NAMES],
      commitTrackAndGraphImport: [...TABLE_NAMES],
      commitPixelsImport: [...TABLE_NAMES]
    },
    // And a snapshot reads all of it, for the same reason: every section of
    // the archive is one area's rows (archiveSections.ts). Every source's
    // preview resolves against a snapshot, so they all read the same set.
    reads: {
      snapshot: [...TABLE_NAMES],
      previewDaylioImport: [...TABLE_NAMES],
      previewDaylioBackupImport: [...TABLE_NAMES],
      previewTransTracksImport: [...TABLE_NAMES],
      previewDayOneImport: [...TABLE_NAMES],
      previewTrackAndGraphImport: [...TABLE_NAMES],
      previewPixelsImport: [...TABLE_NAMES],
      // Its own table only, unlike the seven above: the settings screen
      // showing this should not re-run on an entry edit.
      importLog: ['importLog']
    }
  })
};

/* The operations that are the journal's rather than an area's, and so have no
   entry in the map above: reconciling the built-in vocabulary, and emptying
   the journal of every row (phase 5 audit ticket 13). Both are classified
   where they are wrapped instead - one against the reference tables
   reconcile.ts names, the other against all of them.

   Exported because journal.svelte.ts's lazy proxy needs the same list: an
   operation on the journal itself is a function to call, not an area to build
   a facade of operations for, and the proxy has no other way to tell them
   apart. It knew only `reconcileBuiltIns` by name until ticket 13 added the
   second, which is exactly the shape that forgets the third. */
export const JOURNAL_WIDE = ['reconcileBuiltIns', 'discardEverything'] as const;

type JournalWideOperation = (typeof JOURNAL_WIDE)[number];

/** The same map, keyed by plain strings, for the callers that only have
    strings: `observeWrites` walks the journal object it is handed, and a query
    resolves the operation name its closure called. The authored form above is
    the checked one - this view exists to index it, not to loosen it, and
    nothing here writes to it. */
const BY_NAME = OPERATIONS as unknown as Record<
  string,
  { writes: Partial<Record<string, TableName[]>>; reads: Partial<Record<string, TableName[]>> }
>;

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
  const tables = BY_NAME[area]?.writes[operation];
  if (!tables) throw new Error(`journal.${area}.${operation} is not a classified write`);
  return tables;
}

/** The tables one classified read depends on, for the caller this half of the
    registry exists for: `liveQuery` resolves a query's dependencies from the
    operations its closure called, so no screen declares a table (phase 5
    audit ticket 03).

    Throws on anything that is not a declared read - a write among them. A
    query closure that performs a write is a bug in the closure, and it should
    say so rather than quietly taking the write's tables as dependencies. */
export function tablesReadBy(area: string, operation: string): TableName[] {
  const tables = BY_NAME[area]?.reads[operation];
  if (!tables) throw new Error(`journal.${area}.${operation} is not a classified read`);
  return tables;
}

export function observeWrites(journal: Journal, onWrite: (tables: TableName[]) => void): Journal {
  const wrappedJournal: Record<string, unknown> = {
    reconcileBuiltIns: announcing(journal.reconcileBuiltIns.bind(journal), RECONCILE_TABLES, onWrite),
    // Every table, for the same reason an Archive import announces every
    // table: it empties all of them.
    discardEverything: announcing(journal.discardEverything.bind(journal), [...TABLE_NAMES], onWrite)
  };

  for (const [areaName, area] of Object.entries(journal)) {
    if (JOURNAL_WIDE.includes(areaName as JournalWideOperation)) continue;
    const classified = BY_NAME[areaName];
    if (!classified) throw new Error(`journal.${areaName} is an area writes.ts does not classify`);
    const { writes, reads } = classified;
    const wrappedArea: Record<string, unknown> = {};

    for (const [operation, implementation] of Object.entries(area as Record<string, unknown>)) {
      if (typeof implementation !== 'function') {
        wrappedArea[operation] = implementation;
        continue;
      }
      const tables = writes[operation];
      if (!tables && !reads[operation]) {
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

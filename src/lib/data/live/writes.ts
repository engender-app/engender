/* Classify journal operations by the tables they write. The journal wrapper
   announces committed writes to the reference mirror and async readers
   (ADR-0004), limiting refresh to queries that read those tables.

   Reject unclassified operations. Treating an unknown write as a read
   would leave stale data. This mapping stays rune-free for Node tests
   (ADR-0017); journal.svelte.ts supplies the reactive onWrite callback. */

import { markJournalBusy } from '../journal-busy';
import { NOTHING_WRITTEN } from '../journal/nothingWritten';
import type { Journal } from '../journal/journal';
import { DAY_TABLES } from '../journal/day';
import { DAY_AHEAD_TABLES } from '../journal/dayAhead';
import { LAST_WRITE_TABLES } from '../journal/lastWrite';
import { SEARCH_TABLES } from '../journal/textSearch';

/* The union of the clinician summary registry's per-section tables
   (clinicianSummary.ts), written out here because that module is loaded on
   demand and importing it would put it on the first screen's path.
   clinicianSummary.test.ts holds the two equal. */
export const CLINICIAN_SUMMARY_TABLES: TableName[] = [
  'regimen',
  'dose',
  'lab',
  'sideEffect',
  'personalEffect',
  'personalEffectType',
  'effectCategory',
  'cycleEvent',
  'checklist',
  'procedure',
  'appointment',
  'areaState'
];

export const RECONCILE_TABLES: TableName[] = [
  'tag',
  'dimension',
  'bodyRegion',
  'effectCategory',
  'personalEffectType',
  'progressPhoto'
];

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
  /* The dilation taper's schedule and its session log alike: nothing reads a session without knowing whether
     there is a schedule to compare it against, the same reasoning 'dose'
     gives its own schedule and events. */
  'taper',
  'reminder',
  'regimen',
  /* One name for dose events, schedules and pauses alike. Nothing reads a
     schedule or a pause without the doses they are compared against - the
     adherence view needs all three - so splitting them would be precision
     no screen can use. */
  'dose',
  /* Medication stock. Its projection reads doses and
     regimen episodes too, but those are announced under their own names
     already - a stock-only screen re-running on a dose write is exactly
     the point. */
  'stock',
  'sideEffect',
  'personalEffect',
  /* Cycle events. */
  'cycleEvent',
  /* The person's named eras (ADR-0049). Its own name and
     not folded into 'entry', even though `getJournalBounds` reads the entry
     table: an era read has to re-run when an era is written, and an entry
     write already announces 'entry', so the two names together are what
     keeps a clamped range from going stale in either direction. */
  'era',
  /* Which eras are muted (ADR-0049). Its own name rather
     than folded into 'era': plenty of era reads (/compare, the calendar, a
     chart's boundaries) have no reason to re-run when a mute changes, and a
     mute write does not change anything `getEras()` itself returns. */
  'eraMute',
  /* One name for hair-removal sessions and their photos alike: nothing reads one without the other, the same reasoning
     'dose' gives. */
  'hairRemoval',
  /* Progress photos: one table, one name. */
  'progressPhoto',
  /* One name for a procedure and its recovery photos:
     nothing reads one without the other, the same reasoning 'dose'
     gives. A procedure's recovery checklist is not in here - that is an
     ordinary 'checklist' row, and a write to it has to invalidate the
     appointment prep list's reads too. Its consults are not in here either
     any more; they are 'appointment' rows below. */
  'procedure',
  /* Appointments. Its own name rather than
     folded into 'procedure', unlike the consults it grew out of: most
     appointments belong to no procedure at all, and the appointments screen
     has to re-read when one is written from the surgery journey - which a
     name shared with 'procedure' would give in one direction only. The
     procedure screen's own reads name both. */
  'appointment',
  /* The person's own comfort list. */
  'comfortItem',
  /* A tryout's own fields. Its felt-sense history is
     'feltSense' instead, below, so a screen that reads only the tryout's
     own fields is not made stale by every reading logged against it. */
  'tryout',
  /* A felt-sense entry's own name: the tryout screens
     and the day view invalidate on a write to this table. */
  'feltSense',
  /* Time-capsule letters. */
  'letter',
  /* Voice recordings. Its own name rather than folded
     into 'entry' the way `tryout` folds two
     tables into one name: unlike those, a screen elsewhere - a future
     voice-notes browsing view, or ticket 25's compare mode - could read
     recordings without reading the rest of an entry, the same reason
     'photo' gets its own name instead of folding into 'entry' too. */
  'voiceRecording',
  /* Voice benchmarks. Kept apart from
     'voiceRecording' for the same reason the table is: a benchmark and a
     memo are different records, and the benchmark surfaces - Home's nudge
     tile, the compare view - must not re-query every time an entry's voice
     memo changes, nor the reverse. */
  'voiceBenchmark',
  /* Practice takes. Its own name and not
     folded into 'voiceBenchmark': the two are different activities, never
     read together, and a practice save should not re-run a benchmark
     screen's own reads. */
  'voicePracticeTake',
  /* Video notes. Its own name rather than folded into
     'entry' or shared with 'voiceRecording', for the reason that one gives:
     a screen could read video notes without reading recordings or the rest
     of an entry, and a shared name would make every recording read stale
     whenever a video note changed. */
  'videoNote',
  /* Roadmap goal ticks. One name for every country
     pack's ticks: they live in one table and a screen shows one pack at a
     time, so there is nothing a per-pack name would let a query skip. */
  'roadmapCheck',
  /* Custom roadmap goals, kept apart from
     'roadmapCheck': a screen reading the custom goals someone added
     should not re-query just because a bundled goal's tick changed, and
     the reverse. */
  'roadmapGoal',
  /* The person's roadmap categories, apart
     from 'roadmapGoal' so that ticking a goal does not re-read the
     category names. */
  'roadmapCategory',
  /* The institutions on the roadmap's list of name and document changes,
     the added ones and the dated changes
     together: no screen reads one without the other, the reason 'dose'
     gives for its own pair. */
  'roadmapInstitution',
  /* Checklists and their items alike: nothing reads a
     checklist without its items, the same reasoning 'dose' gives. */
  'checklist',
  /* The binder/tucking wear log. */
  'wearSession',
  /* The body-region reference-data area. An entry's
     own body-region intensities are still announced under 'entry' - this
     is only the region rows themselves: built-in hide/unhide and a custom
     region being added. */
  'bodyRegion',
  /* The effect catalogue's toggleable categories (phase 5 ticket 41,
     CONTEXT: "Effect category") - tag_group's own semantics, over the
     effect vocabulary rather than tags. */
  'effectCategory',
  /* The effect vocabulary itself: the open catalogue
     'personalEffect' markers name, built-in and custom alike. Hiding or
     adding an effect type has not touched a single marker, and the reverse. */
  'personalEffectType',
  /* The fluidity engine's named presentations (phase 5 deepening ticket 17,
     ADR-0048, CONTEXT: "Presentation"): a name and a flag-role colour, built
     and hidden the way a tag is. An entry's own
     `presentation_uuid` is announced under 'entry' instead, the same split
     'tag' and 'entry_tag' get - resolving which presentation an id names is
     this table's business, not the entry's. */
  'presentation',
  /* The import log: its own name so the settings
     screen's `importLog` read does not re-run on every other write - only
     an import itself touches this table. */
  'importLog',
  /* Which areas are hidden and which are finished (ADR-0052). Its own name rather than folded into any of the areas it
     speaks about: a hub row reading every area's state at once would have to
     re-run on a write to any of nineteen tables, and hiding an area has not
     touched a single record in it. */
  'areaState',
  /* A margin note. Its own name and not
     folded into 'entry': the whole point of the feature is that a margin
     note and the entry it annotates are read and written apart, so an
     entry's own query must not re-run when a margin note changes, and the
     reverse - adding, editing or removing a note must not make every
     screen reading entries think the entry itself changed. */
  'marginNote',
  /* The documents area (ADR-0065). Its own
     name rather than folded into 'photo': a document belongs to no entry
     and no milestone, so nothing that reads a photo reads one of these,
     and filing a diagnosis must not re-run every entry query in the app. */
  'document',
  /* What this device has deleted. Written by a
     trigger on every delete, which no SQL text names, and by an archive
     restore; read only by the archive snapshot. No screen shows it. */
  'deletion'
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
    question and a screen should have to ask neither. A read's list is what the read's own SQL touches, transitively
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
      // carries additions and removals of all three, plus a debrief link,
      // and the contextual cards that commit beside it (entries.ts,
      // commitContextual): felt sense, dose, procedure recovery, effect
      // markers and a cycle event.
      upsertEntry: [
        'entry',
        'photo',
        'voiceRecording',
        'videoNote',
        'checklist',
        'feltSense',
        'dose',
        'procedure',
        'personalEffect',
        'cycleEvent'
      ],
      // Trashes the entry rather than removing it, but
      // still takes it out of every other read here, the same as before.
      deleteEntry: ['entry', 'photo', 'voiceRecording', 'videoNote'],
      // Brings a trashed entry, its photos, recordings and video notes back.
      restoreEntry: ['entry', 'photo', 'voiceRecording', 'videoNote'],
      // Delete forever (functional audit 46): the trashed entry and every
      // row hanging off it, margin notes included, and a debrief link to it
      // set to null by its foreign key.
      purgeEntry: ['entry', 'photo', 'voiceRecording', 'videoNote', 'marginNote', 'checklist'],
      setEntryStarred: ['entry']
    },
    reads: {
      getEntry: HYDRATED_ENTRY,
      entriesForDay: HYDRATED_ENTRY,
      recentDays: HYDRATED_ENTRY,
      entriesWithTag: HYDRATED_ENTRY,
      counterevidencePool: HYDRATED_ENTRY,
      latestBadMomentEntry: HYDRATED_ENTRY,
      // The id alone, so no hydration: the qualifying clause still joins the
      // tag tables, and nothing else is read back. Its other arm reads an
      // entry's own body-region intensities, which are announced under
      // 'entry' rather than 'bodyRegion' (the note beside that name above),
      // so the list is these two and not three.
      latestBadMomentEntryId: ['entry', 'tag'],
      searchEntries: HYDRATED_ENTRY,
      // A count, so no hydration: the search clause itself joins the tag
      // tables, and nothing else is read back.
      countSearchMatches: ['entry', 'tag'],
      trashedEntries: HYDRATED_ENTRY,
      // A bare `MAX(epoch_day)`, not the hydrated shape: nothing here reads
      // a tag, a photo, a recording or a video note.
      lastWriteEpochDay: ['entry'],
      // A bare `COUNT(*)` over the entry table and nothing else: Home's
      // count line and Safe Space's total both key on it.
      countAll: ['entry'],
      // A bare `COUNT(DISTINCT epoch_day)`: the Journal door's "Earlier
      // entries" control keys on it, the same as countAll above.
      countDistinctDays: ['entry']
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
  bodyRegions: classify<Journal['bodyRegions']>()({
    writes: {
      addCustomRegion: ['bodyRegion'],
      setRegionHidden: ['bodyRegion'],
      renameCustomRegion: ['bodyRegion']
    },
    reads: { getBodyRegions: ['bodyRegion'] }
  }),
  dimensions: classify<Journal['dimensions']>()({
    writes: {
      addCustomDimension: ['dimension'],
      addPreset: ['preset'],
      setDimensionHidden: ['dimension'],
      renameCustomDimension: ['dimension']
    },
    reads: { getDimensions: ['dimension'], getPresets: ['dimension', 'preset'] }
  }),
  milestones: classify<Journal['milestones']>()({
    writes: {
      // A milestone save can preserve, remove or replace its photo.
      upsertMilestone: ['milestone', 'photo'],
      // Nulls a document's link to it.
      deleteMilestone: ['milestone', 'photo', 'document']
    },
    // A milestone is read back with its photos on it, the same way an entry
    // is, and with the name of the procedure, tryout or custom goal it links
    // to, so renaming one of those changes what the milestone reads as.
    reads: {
      getMilestones: ['milestone', 'photo', 'procedure', 'tryout', 'roadmapGoal'],
      getMilestonesOnDay: ['milestone', 'photo', 'procedure', 'tryout', 'roadmapGoal'],
      getNonProcedureDaysInRange: ['milestone'],
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
      setStarred: ['photo', 'entry', 'milestone'],
      // Changes which day the photo itself reads as, which both
      // reads below fold into what they hand an entry or milestone.
      setEpochDayOverride: ['photo', 'entry', 'milestone']
    },
    // The read joins the owners, to date each photo and to say which record
    // it hangs off.
    reads: { inJournal: ['photo', 'entry', 'milestone'] }
  }),
  /* The library across all six photo-carrying tables,
     and reads only - every one of those tables is written through the area
     that owns it, which announces its own name. So the names here are the
     ones whose rows the union reads: the six tables plus `entry` and
     `milestone`, which date and name what hangs off them and whose trash
     state decides whether an entry's photographs and notes are in the list
     at all. */
  photoLibrary: classify<Journal['photoLibrary']>()({
    writes: {},
    reads: {
      inJournal: [
        'photo',
        'entry',
        'milestone',
        'hairRemoval',
        'tryout',
        'procedure',
        'videoNote',
        'progressPhoto'
      ],
      // The `photo` table's own arm, which is the only one with a starred
      // column (photoLibrary.ts says why).
      starred: ['photo', 'entry', 'milestone'],
      // The same six arms as inJournal, so the same names.
      hasAny: [
        'photo',
        'entry',
        'milestone',
        'hairRemoval',
        'tryout',
        'procedure',
        'videoNote',
        'progressPhoto'
      ]
    }
  }),
  /* One table and one owner - itself - so unlike `photos` above there is no
     second name to announce. The day view and
     search reach these rows through their own registries, whose tables are
     folded in from `DAY_TABLES` and `SEARCH_TABLES` rather than listed
     again here. */
  documents: classify<Journal['documents']>()({
    writes: {
      addDocument: ['document'],
      updateDocument: ['document'],
      deleteDocument: ['document'],
      // Ticket 56: the target lives on the same row as everything else.
      setDocumentTarget: ['document']
    },
    reads: {
      getDocuments: ['document'],
      getDocument: ['document'],
      getDocumentsOnDay: ['document'],
      getDocumentsLinkedTo: ['document'],
      lastWriteEpochDay: ['document']
    }
  }),
  // Read-only, the same reason exposure and stats are: a recording's row is
  // owned by upsertEntry/deleteEntry (voiceRecording is already announced
  // there), and this area only reads it back dated for the compare picker
  //.
  voice: classify<Journal['voice']>()({
    writes: {},
    reads: { inJournal: ['voiceRecording', 'entry'], lastWriteEpochDay: ['voiceRecording', 'entry'] }
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
      getResultsInRange: ['lab'],
      getResultById: ['lab'],
      getSeries: ['lab'],
      lastWriteEpochDay: ['lab']
    }
  }),
  taper: classify<Journal['taper']>()({
    writes: {
      upsertTaper: ['taper'],
      upsertSession: ['taper'],
      deleteSession: ['taper']
    },
    reads: {
      // Joins the procedure for its uuid, and deleting the procedure takes
      // the taper with it by cascade.
      getTaper: ['taper', 'procedure'],
      getSessions: ['taper'],
      getSessionsOnDay: ['taper'],
      // Numbers a day's sessions against the schedule, which getTaper reads.
      getDaySessions: ['taper', 'procedure'],
      lastWriteEpochDay: ['taper']
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
    reads: {
      getSessions: ['wearSession'],
      getRunningSession: ['wearSession'],
      latestKind: ['wearSession'],
      lastWriteEpochDay: ['wearSession']
    }
  }),
  progressPhotos: classify<Journal['progressPhotos']>()({
    writes: {
      addPhoto: ['progressPhoto'],
      deletePhoto: ['progressPhoto'],
      addPose: ['progressPhoto'],
      renamePose: ['progressPhoto'],
      setPoseHidden: ['progressPhoto'],
      deletePose: ['progressPhoto']
    },
    reads: {
      getPhotos: ['progressPhoto'],
      getPoses: ['progressPhoto'],
      lastWriteEpochDay: ['progressPhoto']
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
     screen watching checklists has to hear about it.

     The consult pair writes 'appointment' rather than 'procedure': it is an appointment row now, and the appointments screen has to
     hear about one added from the surgery journey. deleteProcedure writes
     both, because the cascade takes that procedure's appointments with it.
     Every read that shows a consult names both tables for the same reason. */
  procedures: classify<Journal['procedures']>()({
    writes: {
      upsertProcedure: ['procedure'],
      // Ticket 56: also nulls a document's link to it.
      deleteProcedure: ['procedure', 'appointment', 'checklist', 'milestone', 'document'],
      setNotes: ['procedure'],
      addConsult: ['appointment'],
      deleteConsult: ['appointment'],
      addPhoto: ['procedure'],
      deletePhoto: ['procedure'],
      addChecklistItem: ['procedure', 'checklist'],
      recordSurgeryMilestone: ['procedure', 'milestone']
    },
    // getChecklist reads the checklist table alone, through the checklists
    // area: the recovery checklist is an ordinary owned Checklist and the
    // procedure row is not read to find it.
    reads: {
      getProcedures: ['procedure', 'appointment'],
      getSurgeryDaysInRange: ['procedure'],
      getPhotos: ['procedure'],
      photosByProcedure: ['procedure'],
      getDayRecords: ['procedure'],
      getChecklist: ['checklist'],
      // The surgery milestone with its photo on it, as getMilestones reads it.
      getMilestone: ['milestone', 'photo'],
      lastWriteEpochDay: ['procedure', 'appointment']
    }
  }),
  appointments: classify<Journal['appointments']>()({
    writes: {
      upsertAppointment: ['appointment'],
      deleteAppointment: ['appointment'],
      // A status update is its own table under the same coarse name: nothing
      // reads one without the appointment it belongs to (sqlTables.ts).
      addStatusUpdate: ['appointment'],
      deleteStatusUpdate: ['appointment'],
      // A provider too: nothing reads one except as an
      // appointment's who, and renaming one redraws every row naming it.
      upsertProvider: ['appointment'],
      deleteProvider: ['appointment']
    },
    // consultsByProcedure and getDayRecords join `procedure` for its name,
    // so a renamed journey redraws them.
    reads: {
      getAppointments: ['appointment', 'procedure'],
      getAppointment: ['appointment', 'procedure'],
      getWaiting: ['appointment', 'procedure'],
      getStatusUpdates: ['appointment'],
      getProviders: ['appointment'],
      getKinds: ['appointment'],
      getDayRecords: ['appointment', 'procedure'],
      lastWriteEpochDay: ['appointment'],
      consultsByProcedure: ['appointment', 'procedure']
    }
  }),
  reminders: classify<Journal['reminders']>()({
    writes: { upsertReminder: ['reminder'], deleteReminder: ['reminder'], setEnabled: ['reminder'] },
    reads: { getReminders: ['reminder'] }
  }),
  areaStates: classify<Journal['areaStates']>()({
    writes: {
      setAreasHidden: ['areaState'],
      setAreasFinished: ['areaState'],
      setAreasSuspended: ['areaState']
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
      // it was adopted into rather than leaving its tryout_uuid dangling
      // (ADR-0045).
      deleteTryout: ['tryout', 'feltSense', 'milestone'],
      addPhoto: ['tryout'],
      deletePhoto: ['tryout'],
      adoptTryout: ['tryout', 'milestone']
    },
    reads: {
      getTryouts: ['tryout'],
      getPhotos: ['tryout'],
      getPhotosOnDay: ['tryout'],
      lastWriteEpochDay: ['tryout']
    }
  }),
  feltSense: classify<Journal['feltSense']>()({
    /* A reading is read back on its tryout, so a write announces the
       tryout's name as well as its own. */
    writes: {
      add: ['feltSense', 'tryout'],
      remove: ['feltSense', 'tryout']
    },
    // A read knows its owner, unlike a write: the history is joined to the
    // one record it hangs off.
    reads: {
      forTryout: ['feltSense', 'tryout'],
      // Keyed by the tryout's own uuid, so the owner table is joined the way
      // `forTryout` joins it.
      // The same join, every tryout at once.
      byTryout: ['feltSense', 'tryout'],
      // The tryout's label travels on a day's rows.
      onDay: ['feltSense', 'tryout'],
      // No join: the registry wants the date alone.
      lastWriteEpochDay: ['feltSense']
    }
  }),
  letters: classify<Journal['letters']>()({
    writes: { addLetter: ['letter'], deleteLetter: ['letter'] },
    reads: {
      getLetters: ['letter'],
      getLetterSeals: ['letter'],
      getLetter: ['letter'],
      getUnlockDaysInRange: ['letter'],
      hasAny: ['letter']
    }
  }),
  roadmap: classify<Journal['roadmap']>()({
    writes: {
      setGoalHidden: ['roadmapCheck'],
      setGoalStatus: ['roadmapCheck'],
      addCustomGoal: ['roadmapGoal'],
      setCustomGoalStatus: ['roadmapGoal'],
      updateCustomGoalText: ['roadmapGoal'],
      deleteCustomGoal: ['roadmapGoal', 'document'],
      addCategory: ['roadmapCategory'],
      renameCategory: ['roadmapCategory'],
      deleteCategory: ['roadmapCategory', 'roadmapGoal', 'document'],
      addInstitution: ['roadmapInstitution'],
      renameInstitution: ['roadmapInstitution'],
      deleteInstitution: ['roadmapInstitution', 'document'],
      addInstitutionChange: ['roadmapInstitution'],
      deleteInstitutionChange: ['roadmapInstitution']
    },
    reads: {
      getHiddenGoals: ['roadmapCheck'],
      getGoalStatuses: ['roadmapCheck'],
      getCustomGoals: ['roadmapGoal'],
      getCategories: ['roadmapCategory'],
      getInstitutions: ['roadmapInstitution'],
      getInstitutionChanges: ['roadmapInstitution']
    }
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
      setDebriefDismissed: ['checklist'],
      recordDebriefEntry: ['checklist']
    },
    reads: {
      getChecklist: ['checklist'],
      getChecklistByOwner: ['checklist'],
      getStandaloneChecklist: ['checklist'],
      getDebriefState: ['checklist'],
      getDebriefEntryId: ['checklist']
    }
  }),
  regimen: classify<Journal['regimen']>()({
    // Each carries the episode's schedule reminders along with it: a rename,
    // an end day or hiding all change or remove them (functional audit 21).
    writes: {
      upsertEpisode: ['regimen', 'reminder'],
      endEpisode: ['regimen', 'reminder'],
      setEpisodeHidden: ['regimen', 'reminder']
    },
    reads: { getEpisodes: ['regimen'], getHiddenEpisodes: ['regimen'], hasAny: ['regimen'] }
  }),
  doses: classify<Journal['doses']>()({
    writes: {
      upsertDose: ['dose'],
      deleteDose: ['dose'],
      // A schedule's reminders follow it.
      upsertSchedule: ['dose', 'reminder'],
      // Only ever removes reminders whose episode has ended.
      reconcileDoseReminders: ['reminder'],
      upsertPause: ['dose'],
      deletePause: ['dose'],
      // The auto-log pass writes dose rows and nothing else.
      autoLogDueDoses: ['dose']
    },
    // A schedule and a pause both hang off an episode, and are read back
    // joined to it (doses.ts), so ending an episode changes what they answer.
    reads: {
      getDoses: ['dose'],
      getDosesForSlots: ['dose', 'regimen'],
      getNextUncoveredSlot: ['dose', 'regimen'],
      getDoseById: ['dose'],
      hasDosesBefore: ['dose'],
      getSchedules: ['dose', 'regimen'],
      getPauses: ['dose', 'regimen'],
      // The comparison reads the episode history as well: which episode is in
      // effect, and which of them each dose is attributed to (doses.ts).
      getComparison: ['dose', 'regimen'],
      lastWriteEpochDay: ['dose'],
      // Counts rows in the dose log and nothing else: the caller resolves
      // which drug an unnamed dose belongs to before asking, so the episode
      // history is on the caller's list rather than this one's
      // (stock.getProjections below carries both).
      countConsumingDosesByDrug: ['dose']
    }
  }),
  stock: classify<Journal['stock']>()({
    writes: {
      // A rename drops the old name's run-out Reminder (after-release 01).
      upsertEntry: ['stock', 'reminder'],
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
  /* Read-only across the five areas that carry a cost (FA 30). */
  costs: classify<Journal['costs']>()({
    writes: {},
    reads: { getCosts: ['hairRemoval', 'appointment', 'procedure', 'lab', 'stock'] }
  }),
  /* Read-only for the same reason exposure below is: an annotation is
     selected out of seven other areas' rows on every read and stored nowhere
     (ADR-0010). One table per area behind it -
     'dose' covers the pauses, which is where DosePause lives. 'era' joined
     in phase 6 ticket 03, for the boundary a bounded era's start draws. */
  chartAnnotations: classify<Journal['chartAnnotations']>()({
    writes: {},
    reads: {
      /* 'areaState' since phase 8 features ticket 04: the day a stream
         ended draws beside the seven kinds above. */
      // 'appointment' because getProcedures reads it for a journey's
      // consults, not because an appointment draws a mark of
      // its own - that is ticket 59's.
      getAnnotations: [
        'milestone',
        'regimen',
        'dose',
        'tryout',
        'procedure',
        'appointment',
        'era',
        'areaState'
      ]
    }
  }),
  // Read-only, like stats below: exposure counters never write (phase 4
  // ticket 05).
  exposure: classify<Journal['exposure']>()({
    writes: {},
    reads: { getCounters: ['dose', 'regimen'] }
  }),
  /* Read-only, the same reason exposure is: a clinician summary assembles
     rows other areas own and stores nothing of its own.
     Its table list is the union of the section registry's own
     (CLINICIAN_SUMMARY_TABLES above), and a test fails when a section's
     tables leave it, so a summary cannot go stale on a write to an area
     registered after this line was written. */
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
    reads: { getLastWrites: LAST_WRITE_TABLES, getWritingDays: ['entry', 'dose'] }
  }),
  /* Read-only, and its table list is its own registry's for the reason
     day's is (dayAhead.ts's DAY_AHEAD_TABLES): a kind registered there
     brings its tables with it, so a mark cannot go stale on a write to an
     area registered after this line was written. */
  dayAhead: classify<Journal['dayAhead']>()({
    writes: {},
    reads: { getDayAhead: DAY_AHEAD_TABLES }
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
  // stored nowhere. It has never read the doubt journal,
  // which this comment used to claim it did.
  journalBook: classify<Journal['journalBook']>()({
    writes: {},
    // The entry half is a hydrated read, so it carries everything an entry
    // is read back with; the opening page adds the recap's milestones, with
    // what getMilestones joins onto them.
    reads: { getBook: [...HYDRATED_ENTRY, 'milestone', 'procedure', 'tryout', 'roadmapGoal', 'sideEffect'] }
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
         renaming a mode has to reach it. */
      constellationReadings: ['entry', 'dimension', 'presentation'],
      constellationPairs: ['entry', 'dimension'],
      bodyRegionTrend: ['entry'],
      bodyRegionBreakdown: ['entry', 'photo', 'hairRemoval'],
      weeklyWearHours: ['wearSession'],
      bodyRegionMap: ['entry'],
      entryCountsByDay: ['entry'],
      // Filters entry.presentation_uuid directly, the same reason
      // bodyRegionTrend above depends on 'entry' alone: which days match
      // never changes when a presentation is renamed, recoloured or hidden.
      presentationDays: ['entry'],
      tagInsights: ['entry', 'dimension', 'tag'],
      // No dimension: a share by tag counts entries, not values on them.
      tagShare: ['entry', 'tag'],
      recap: ['entry', 'dimension', 'tag', 'milestone', 'photo'],
      isGoodDay: ['entry', 'tag']
    }
  }),
  // Read-only, the same reason exposure is: a card is recomputed from
  // stats, the dose log and dimensions on every read.
  correlationCards: classify<Journal['correlationCards']>()({
    writes: {},
    reads: { getCards: ['entry', 'dimension', 'tag', 'dose'] }
  }),
  /* An import rewrites the journal, so it invalidates all of it -
     every query and every mirrored slice. Naming the tables one at a time
     would be a list to keep in step with what a restore happens to touch,
     and a Replace touches everything by definition. */
  archive: classify<Journal['archive']>()({
    writes: {
      replace: [...TABLE_NAMES],
      merge: [...TABLE_NAMES],
      commitDaylioImport: [...TABLE_NAMES],
      commitDaylioBackupImport: [...TABLE_NAMES],
    },
    // And a snapshot reads all of it, for the same reason: every section of
    // the archive is one area's rows (archiveSections.ts). Every source's
    // preview resolves against a snapshot, so they all read the same set.
    reads: {
      snapshot: [...TABLE_NAMES],
      previewDaylioImport: [...TABLE_NAMES],
      previewDaylioBackupImport: [...TABLE_NAMES],
      // Its own table only, unlike the seven above: the settings screen
      // showing this should not re-run on an entry edit.
      importLog: ['importLog']
    }
  })
};

/* The operations that are the journal's rather than an area's, and so have no
   entry in the map above: reconciling the built-in vocabulary, and emptying
   the journal of every row. Both are classified
   where they are wrapped instead - one against the reference tables
   reconcile.ts names, the other against all of them.

   Exported because journal.svelte.ts's lazy proxy needs the same list: an
   operation on the journal itself is a function to call, not an area to build
   a facade of operations for, and the proxy has no other way to tell them
   apart. It knew only `reconcileBuiltIns` by name until ticket 13 added the
   second, which is exactly the shape that forgets the third. */
export const JOURNAL_WIDE = ['reconcileBuiltIns', 'discardEverything', 'undoable'] as const;

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

    Each mutation also holds the update guard while it runs, which
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
    invalidates.

    Here rather than as a second list at the call site, for this file's own
    reason: a table added to an operation above must not need a second edit
    somewhere else to be announced. Throws on an unclassified name, the same
    way observeWrites does. */
export function tablesWrittenBy(area: string, operation: string): TableName[] {
  const tables = BY_NAME[area]?.writes[operation];
  if (!tables) throw new Error(`journal.${area}.${operation} is not a classified write`);
  return tables;
}

/** Whether an area's operation changes the journal: a classified write.
    The journal-wide operations all do, and the facade marks those itself.
    The facade hands this to the
    session gate, which refuses a change made after a lock rather than
    queueing it for whoever unlocks next (security-scan ticket 08). */
export function isJournalCommand(area: string, operation: string): boolean {
  return BY_NAME[area]?.writes[operation] !== undefined;
}

/** The tables one classified read depends on, for the caller this half of the
    registry exists for: `liveQuery` resolves a query's dependencies from the
    operations its closure called, so no screen declares a table.

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
    discardEverything: announcing(journal.discardEverything.bind(journal), [...TABLE_NAMES], onWrite),
    /* The deletion runs through this same wrapper over its own transaction,
       so it announces what its operation declares, as an ordinary delete
       would. An undo writes those tables back, and announces them again. */
    undoable: async (remove: (journal: Journal) => Promise<unknown>) => {
      const written = new Set<TableName>();
      const deletion = await journal.undoable((inner) =>
        remove(
          observeWrites(inner, (tables) => {
            for (const table of tables) written.add(table);
            onWrite(tables);
          })
        )
      );
      return {
        tables: deletion.tables,
        undo: announcing(() => deletion.undo(), [...written], onWrite),
        finish: () => deletion.finish()
      };
    }
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
        ? announcing(
            implementation as Mutation,
            tables,
            onWrite,
            // Auto-log returns its count, including zero, to the caller.
            areaName === 'doses' && operation === 'autoLogDueDoses' ? 0 : NOTHING_WRITTEN
          )
        : (implementation as Mutation).bind(area);
    }

    wrappedJournal[areaName] = wrappedArea;
  }

  return wrappedJournal as unknown as Journal;
}

type Mutation = (...args: never[]) => Promise<unknown>;

function announcing(
  implementation: Mutation,
  tables: TableName[],
  onWrite: (tables: TableName[]) => void,
  noWriteResult: unknown = NOTHING_WRITTEN
) {
  return async (...args: never[]) => {
    const done = markJournalBusy();
    let succeeded = false;
    try {
      const result = await implementation(...args);
      succeeded = true;
      // A write that looked and changed nothing says so, and announcing it
      // anyway is how the run-out reconcile kept waking itself (ux-carpet 199).
      if (result === NOTHING_WRITTEN) return undefined;
      if (result !== noWriteResult) onWrite(tables);
      return result;
    } finally {
      done(succeeded);
    }
  };
}

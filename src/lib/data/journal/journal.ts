/* The journal (ADR-0017, CONTEXT: "Journal"): everything this device holds
   about the user's transition, reached through one handle bound to a
   database driver. A factory takes a SqliteDriver and a photo file store
   and composes eleven area modules behind that handle. The interface is
   uniformly async and free of Svelte runes, so the whole thing runs under
   the Node tier's real SQLite; it mints every row's identity itself
   (ADR-0002), so no screen ever needs a Date.now() scheme again.

   One thin app-level module constructs the instance at boot
   (stores/boot.svelte.ts); tests construct their own over
   test-support's node:sqlite driver. */

import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from '../photos/photo-file-store';
export type { PhotoFileStore } from '../photos/photo-file-store';
import { makeAffirmationsArea, type AffirmationsArea } from './affirmations';
import { makeArchiveArea, type ArchiveArea } from './archive';
import { makeBodyRegionsArea, type BodyRegionsArea } from './bodyRegions';
import { makeChartAnnotationsArea, type ChartAnnotationsArea } from './chartAnnotations';
import { makeChecklistsArea, type ChecklistsArea } from './checklists';
import { makeClinicianSummaryArea, type ClinicianSummaryArea } from './clinicianSummary';
import { makeAreaStatesArea, type AreaStatesArea } from './areaStates';
import { makeComfortItemsArea, type ComfortItemsArea } from './comfortItems';
import { makeJournalBookArea, type JournalBookArea } from './journalBook';
import { makeCorrelationCardsArea, type CorrelationCardsArea } from './correlationCards';
import { makeCycleEventsArea, type CycleEventsArea } from './cycleEvents';
import { makeDayArea, type DayArea } from './day';
import { makeDimensionsArea, type DimensionsArea } from './dimensions';
import { makeDoubtJournalArea, type DoubtJournalArea } from './doubtJournal';
import { makeDosesArea, type DosesArea } from './doses';
import { makeEffectCategoriesArea, type EffectCategoriesArea } from './effectCategories';
import { makeEntriesArea, type EntriesArea } from './entries';
import { makeExposureArea, type ExposureArea } from './exposure';
import { makeFeltSenseArea, type FeltSenseArea } from './feltSense';
import { makeHormoneCurveArea, type HormoneCurveArea } from './hormoneCurve';
import { makeHairProgressArea, type HairProgressArea } from './hairProgress';
import { makeHairRemovalArea, type HairRemovalArea } from './hairRemoval';
import { makeIntervalMoodPatternArea, type IntervalMoodPatternArea } from './intervalMoodPattern';
import { makeErasArea, type ErasArea } from './eras';
import { makeEraMutesArea, type EraMutesArea } from './eraMutes';
import { makeJournalingPausesArea, type JournalingPausesArea } from './journalingPauses';
import { makeLabsArea, type LabsArea } from './labs';
import { makeLastWriteArea, type LastWriteArea } from './lastWrite';
import { makeLettersArea, type LettersArea } from './letters';
import { makeMeasurementsArea, type MeasurementsArea } from './measurements';
import { makeMilestonesArea, type MilestonesArea } from './milestones';
import { makePersonalEffectsArea, type PersonalEffectsArea } from './personalEffects';
import { makePhotosArea, type PhotosArea } from './photos';
import { makePresentationsArea, type PresentationsArea } from './presentations';
import { makeEntryTemplatesArea, type EntryTemplatesArea } from './entryTemplates';
import { makeProceduresArea, type ProceduresArea } from './procedures';
import { makeRegimenArea, type RegimenArea } from './regimen';
import { makeRemindersArea, type RemindersArea } from './reminders';
import { makeRoadmapArea, type RoadmapArea } from './roadmap';
import { makeSavedQuestionsArea, type SavedQuestionsArea } from './savedQuestions';
import { makeSideEffectsArea, type SideEffectsArea } from './sideEffects';
import { makeSizeRecordsArea, type SizeRecordsArea } from './sizeRecords';
import { makeStatsArea, type StatsArea } from './stats';
import { makeStockArea, type StockArea } from './stock';
import { makeTagsArea, type TagsArea } from './tags';
import { makeTallyArea, type TallyArea } from './tally';
import { makeTextSearchArea, type TextSearchArea } from './textSearch';
import { makeTryoutsArea, type TryoutsArea } from './tryouts';
import { makeVideoArea, type VideoArea } from './videoNotes';
import { makeVoiceArea, type VoiceArea } from './voiceRecordings';
import { makeVoiceBenchmarksArea, type VoiceBenchmarksArea } from './voiceBenchmarks';
import { makeVoicePracticeTakesArea, type VoicePracticeTakesArea } from './voicePracticeTakes';
import { makeWearSessionsArea, type WearSessionsArea } from './wearSessions';
import { reconcileBuiltIns } from './reconcile';
import { discardJournalRows } from './restore';

/** Every write below that addresses a row by id answers the unknown-id
    case the same way, in every area, and the answer differs by operation
    rather than by area (ADR-0053, CONTEXT: "Unknown id"). An **update**
    naming an id the journal does not hold throws: the caller acted on
    something stale, and the write it intended cannot be performed at all.
    A **delete** naming one succeeds and changes nothing: the state it asked
    for already holds. There are no exceptions, so a caller deletes without
    reading first, and a delete wrapped in an existence check is a smell. */
export interface Journal {
  entries: EntriesArea;
  tags: TagsArea;
  /** The check-in's affirmation pool (phase 5 ticket 15, CONTEXT:
      "Affirmation"). Built-in lines are seeded by key, the same as tags;
      custom lines are additive to the pool the check-in draws from
      (reminders/affirmations.ts), never a replacement for it. */
  affirmations: AffirmationsArea;
  /** Every body region an entry can log an intensity against (phase 5
      ticket 30, CONTEXT: "Reference data" - amended): built-in rows seeded
      by key the same way tags and dimensions are, and a custom row a
      person adds of their own, addressed by a minted uuid. Hides rather
      than deletes - entries.ts validates an incoming region key against
      this area's rows instead of the closed BODY_REGION_KEYS list it used
      to hold in code. */
  bodyRegions: BodyRegionsArea;
  dimensions: DimensionsArea;
  milestones: MilestonesArea;
  photos: PhotosArea;
  /** The fluidity engine's named presentations (phase 5 deepening ticket 17,
      ADR-0048, CONTEXT: "Presentation") - a name and a flag-role colour,
      nothing more. `entries.upsertEntry` writes `presentationId` directly
      onto the entry row; this area owns only the presentation rows
      themselves. */
  presentations: PresentationsArea;
  /** Entry templates (phase 6 ticket 07, ADR-0002, CONTEXT: "Entry"):
      `ENTRY_TEMPLATES`' six and the eight folded-in guided prompts alike,
      now editable, hideable and reachable from one screen. Built-ins
      reconcile by key on boot (reconcile.ts); this area owns reading them
      back and every edit. */
  entryTemplates: EntryTemplatesArea;
  /** Every voice recording (ticket 24), read back dated and oldest first for
      the voice compare picker (ticket 25) - entry-only, so unlike photos
      this owns no attach/remove of its own; those stay on upsertEntry's
      attachRecordings/removeRecordingIds (voiceRecordings.ts). */
  voice: VoiceArea;
  /** Standardized voice takes (phase 5 deepening ticket 15, CONTEXT: "Voice
      benchmark") - a different kind of record from `voice`, on its own
      table, so a memo and a benchmark can never be mistaken for each other. */
  voiceBenchmarks: VoiceBenchmarksArea;
  /** How a practice session went (phase 8 features ticket 10) - a different
      activity from a benchmark and never compared to one, on its own table
      for the same reason `voiceBenchmarks` has one. */
  voicePracticeTakes: VoicePracticeTakesArea;

  /** Every video note (phase 5 ticket 22), read back dated and oldest first
      - entry-only, so like `voice` it has no attach/remove of its own:
      entries.ts owns the rows through attachVideos/removeVideoIds. */
  videos: VideoArea;
  labs: LabsArea;
  measurements: MeasurementsArea;
  /** What was bought and what fit - category, size, an optional brand and a
      fit note (phase 5 ticket 23, CONTEXT: "Size record"). Pairs with
      measurements above without duplicating it: no body-measurement math,
      and no size normalized or converted across brands or systems. */
  sizeRecords: SizeRecordsArea;
  reminders: RemindersArea;
  /** Misgendering and correct-gendering events (CONTEXT: "Tally event").
      Its own record type, never an Entry or a quick log. */
  tally: TallyArea;
  regimen: RegimenArea;
  /** The dose log, plus the schedules and pauses read alongside it. Stores
      no episode link: which episode a dose belongs to is resolved from its
      timestamp above this seam (regimenEpisode.ts). */
  doses: DosesArea;
  /** What a person last reported having of each drug, and the run-out
      projection and reminder reconciliation built over it and the dose log
      (phase 4 ticket 04). A view over rows `doses`, `regimen` and
      `reminders` own, not a fourth owner for any of them. */
  stock: StockArea;
  /** Cumulative dose totals, days-on-each-route and time-on-each-regimen,
      purely descriptive (phase 4 ticket 05). A view over rows `doses` and
      `regimen` own, not a third owner for either one. */
  exposure: ExposureArea;
  /** Every hormone curve the screen draws, in one read (phase 4 tickets 10
      and 11): estradiol level bands per injectable ester where a published
      posterior exists, illustrative rise/plateau/fall shapes per hormone
      where none does, and the user's own lab results placed against both. A
      view over rows `doses`, `regimen` and `labs` own, computed on every
      read - nothing here is a stored estimate. */
  hormoneCurve: HormoneCurveArea;
  sideEffects: SideEffectsArea;
  /** Period occurred, spotting or nothing this month (phase 5 ticket 03,
      CONTEXT: "Cycle event"). No episode reference of its own, the same
      reason sideEffects has none - charted against regimen episode
      history above this seam rather than owning a link to one. */
  cycleEvents: CycleEventsArea;
  /** A declared, dated break from journaling (phase 5 ticket 21, CONTEXT:
      "Streak" - amended). No episode reference, the same reason cycleEvents
      has none. `stats.streak()` reads its rows directly to decide which
      days inside a pause do not count as a gap; this area owns only the
      rows themselves. */
  journalingPauses: JournalingPausesArea;
  /** A search somebody kept a name for (phase 8 features ticket 06, CONTEXT:
      "Saved question"). Rows only - what a saved question is asked as lives
      in savedQuestionQuery.ts, above this seam. */
  savedQuestions: SavedQuestionsArea;
  /** The person's own named stretches of their timeline (phase 6 ticket 01,
      ADR-0049, CONTEXT: "Era"). Rows and the journal edge an open bound
      clamps to, nothing else: an era owns no colour, no mute and no other
      setting, and the surfaces that adopt it as a filter resolve days
      through `eras.ts` rather than through this area. */
  eras: ErasArea;
  /** Which of those eras are muted from resurfacing (phase 6 ticket 05,
      ADR-0049, CONTEXT: "Resurfacing consent"). A second area rather than a
      field on `eras`, for the same reason `era` owns no mute column: the
      rows here outlive the era they name, and resurfacingConsent.ts is the
      one place that reads the two areas together. */
  eraMutes: EraMutesArea;
  /** What was happening around the numbers a time chart draws (phase 5
      deepening ticket 23): milestones, regimen episodes, dose and journaling
      pauses, tryouts, and a procedure's surgery day and recovery window, for
      one date range. A view over rows six other areas own, storing nothing of
      its own - the same kind of area `exposure` and `clinicianSummary` are. */
  chartAnnotations: ChartAnnotationsArea;
  /** The binder/tucking wear log (phase 5 ticket 04, CONTEXT: "Wear
      session"). Owns its own optional Reminder by an auto_source marker,
      the same way stock owns its run-out reminder - hence the dependency
      on `reminders` below. */
  wearSessions: WearSessionsArea;
  /** A one-shot, printable assembly of labs, doses, regimen history, side
      effects and exposure counters for a chosen range (phase 4 ticket 12).
      A view over rows regimen, doses, labs, exposure and sideEffects own,
      not a sixth owner for any of them - every figure on it already comes
      from one of those areas' own read paths. */
  clinicianSummary: ClinicianSummaryArea;
  /** Everything one calendar day holds, drawn from every area that records
      something dated (phase 5 deepening ticket 21, ADR-0001). A view over
      rows sixteen areas own, like clinicianSummary above and for the same
      reason - each section reads through the area's own path and computes
      nothing (ADR-0010). Which areas show, and which are written down as
      deliberately not showing, is day.ts's registry rather than a list of
      imports on the screen. Reads only: opening a day writes nothing. */
  day: DayArea;
  /** The day of the most recent write in every registered area (phase 8
      features ticket 03, ADR-0027, ADR-0010) - one bounded read per area
      rather than a fetched list reduced in JS, assembled the way `day`
      above is. Which areas answer, and which are written down as
      deliberately having no last write, is lastWrite.ts's registry rather
      than a list of imports here. Reads only. */
  lastWrite: LastWriteArea;
  /** Every area that holds text, matched against one query (phase 5
      deepening ticket 24, ADR-0005). A view over rows eighteen areas own, like
      `day` above and for the same reason - which areas are searchable, and
      which are written down as deliberately holding nothing to search, is
      textSearch.ts's registry rather than a list of imports on the screen.
      The entry note is not among them: it has an FTS index behind it and the
      screen matches it through `entries.searchEntries`. Reads only:
      searching writes nothing. */
  textSearch: TextSearchArea;
  /** A keepsake print of a chosen range, carrying only the record types the
      person picked (phase 5 ticket 17). A view over rows entries,
      milestones and side effects own, like clinicianSummary above and for
      the same reason - but a different audience, a different set of parts,
      and an inclusion the caller supplies rather than a fixed section list.
      Never a restore format: the archive stays the only one. */
  journalBook: JournalBookArea;
  /** "First noticed" markers against an open effect catalogue (phase 4
      ticket 07, widened well past its original four/eight by phase 5
      ticket 41), read against the earliest regimen episode's start day
      above this seam (regimenEpisode.ts's earliestEpisode). No episode
      reference of its own, the same reason sideEffects has none. Bundles
      the effect vocabulary itself too - getEffectTypes/
      addCustomEffectType/setEffectTypeHidden - the same shape
      measurements.ts bundles measurement_type in. */
  personalEffects: PersonalEffectsArea;
  /** The toggleable groups the effect catalogue above is organised under
      (phase 5 ticket 41, CONTEXT: "Effect category") - tag_group's own
      semantics, reused. */
  effectCategories: EffectCategoriesArea;
  /** Self-staging against a published scale, and scheduled fixed-position
      photos (phase 4 ticket 09), read against a day resolved above this
      seam (hairAnchor.ts's hairAnchorEpochDay). Distinct
      from personalEffects' single "hair changes" marker - the two are not
      merged. */
  hairProgress: HairProgressArea;
  /** Electrolysis/laser sessions - date, area, method, pain rating, cost,
      free-text provider and optional photos (phase 5 ticket 08). Its own
      closed area vocabulary (hairRemovalAreas.ts), distinct from
      hairProgress's Norwood-Hamilton staging and never merged with the
      body-region vocabulary (bodyRegions.ts). No episode reference, the
      same reason sideEffects has none. */
  hairRemoval: HairRemovalArea;
  /** Saved counterevidence snapshots (phase 4 ticket 11; its free-write
      doubt entries retired by phase 5 ticket 16, ADR-0037). Reads the
      counterevidence itself through
      entries.counterevidencePool(EUPHORIA_TAG_KEYS, …) (phase 5 ticket 14: a
      union of those tags and starred entries; ticket 32 widened the tag
      list itself from 'g-euphoria' alone to all three euphoria tags) -
      this area owns only what it alone writes. */
  doubtJournal: DoubtJournalArea;
  /** The person's own comfort list (phase 6 ticket 14, CONTEXT: "Comfort
      list"): who to text, which walk, which playlist, entirely their own
      words. Reachable only from inside Safe space; nothing seeds it and
      nothing offers it, so this area is only ever read and written from
      the one screen. */
  comfortItems: ComfortItemsArea;
  /** Which areas are hidden, and which the person has said are finished
      (ADR-0052). The rule these rows are read by is `areaState.ts`. */
  areaStates: AreaStatesArea;
  /** Name and pronoun tryouts (phase 4 ticket 16). Reads the entries in a
      tryout's date range through entries.searchEntries('', [], {
      startEpochDay, endEpochDay }) rather than owning a link of its own
      (ADR-0010) - this area owns only what it alone writes. Its
      felt-sense history lives in `feltSense` instead (phase 5 ticket 24). */
  tryouts: TryoutsArea;
  /** One table for a tryout's felt-sense history and a milestone's alike
      (phase 5 ticket 24, CONTEXT: "Felt-sense entry"), the same shape
      `photos` already has for an entry's and a milestone's photos. Never
      required - offering one is `tryouts`' and `milestones`' screens'
      business, not this area's. */
  feltSense: FeltSenseArea;
  /** Free-write letters to the person's future self, sealed until a
      chosen unlock day (phase 4 ticket 19). Stores the text and the
      unlock day and nothing else - letterStatus.ts derives sealed/
      unlocked against today (ADR-0010) above this seam. */
  letters: LettersArea;
  /** Which goals of which country pack someone has ticked off on the
      transition roadmap (phase 4 ticket 23). Holds ticks only: what the
      goals say is a bundled content module, not a table, so this area
      never validates a pack key it was handed. */
  roadmap: RoadmapArea;
  /** Surgery journeys - a procedure's name, consult dates, surgery date and
      recovery log (phase 5 ticket 07, CONTEXT: "Procedure"). Several can be
      tracked at once. Stores no day counter: how far along recovery is comes
      from the surgery date and today, above this seam (recoveryDay.ts). Its
      recovery checklist is an ordinary `checklists` record owned by the
      procedure, hence the dependency between the two below. */
  procedures: ProceduresArea;
  /** Free-text checklists (phase 5 ticket 05, CONTEXT: "Checklist"),
      standalone or scoped to an owner record by a (kind, id) pair rather
      than a foreign key - no owner table ships with this ticket. Distinct
      from `roadmap`: an item here is entirely the user's own content, with
      nothing bundled behind it. */
  checklists: ChecklistsArea;
  /** Read-only aggregates over everything above (ADR-0012). Nothing here
      is stored; a stat is recomputed whenever it is asked for. */
  stats: StatsArea;
  /** Descriptive co-occurrence cards between a tag or a dose-log day and
      mood or a gender dimension (phase 4 ticket 21) - a deliberate
      reversal of phase 3's explicit exclusion of correlation analysis,
      not scope drift. A view over rows `stats`, `doses` and `dimensions`
      own, not a fourth owner for any of them. */
  correlationCards: CorrelationCardsArea;
  /** Day-average mood bucketed by a cyclical position - day of interval
      across completed injectable regimen intervals, or a person-chosen
      interval length (phase 5 ticket 09) - descriptive throughout, the same
      as correlationCards and the comparability flag. A view over rows
      `stats` and `doses` own, not a third owner for either. */
  intervalMoodPattern: IntervalMoodPatternArea;
  /** Everything above at once, in the shape an export carries it
      (ADR-0007), and one archive read back in - Replace or Merge, each a
      single operation whose order of writes is nobody else's business
      (ADR-0011). */
  archive: ArchiveArea;
  /** Adds whatever built-in vocabulary is missing, by key, and touches
      nothing else - safe on every boot and again before ticket 14's
      Replace import applies. */
  reconcileBuiltIns(): Promise<void>;
  /** Every journal row gone, in one operation the section registry orders
      (archiveSections.ts, phase 5 ticket 13). The same thing a Replace import
      does before it installs an archive's rows, which is why it is one
      operation and not a list each caller walks: the demo bar's state jumps
      used to walk seven areas of their own, out of the thirty-six an archive
      carries.

      Leaves the built-in vocabulary and preferences alone, exactly as a
      Replace does (restore.ts's discardJournalRows). Deletes no photo file
      either - the rows go, and the next boot's orphan sweep reclaims what
      they named (photos.ts). */
  discardEverything(): Promise<void>;
}

export function openJournal(driver: SqliteDriver, files: PhotoFileStore): Journal {
  const reminders = makeRemindersArea(driver);
  const regimen = makeRegimenArea(driver);
  const doses = makeDosesArea(driver, regimen);
  const labs = makeLabsArea(driver);
  const exposure = makeExposureArea(doses, regimen);
  const sideEffects = makeSideEffectsArea(driver);
  const dimensions = makeDimensionsArea(driver);
  const stats = makeStatsArea(driver);
  const checklists = makeChecklistsArea(driver);
  const milestones = makeMilestonesArea(driver, files);
  const procedures = makeProceduresArea(driver, files, checklists, milestones);
  const entries = makeEntriesArea(driver, files);
  const doubtJournal = makeDoubtJournalArea(driver);
  const feltSense = makeFeltSenseArea(driver);
  const tags = makeTagsArea(driver);
  const measurements = makeMeasurementsArea(driver);
  const sizeRecords = makeSizeRecordsArea(driver);
  const personalEffects = makePersonalEffectsArea(driver);
  const cycleEvents = makeCycleEventsArea(driver);
  const tally = makeTallyArea(driver);
  const wearSessions = makeWearSessionsArea(driver, reminders);
  const hairProgress = makeHairProgressArea(driver, files);
  const hairRemoval = makeHairRemovalArea(driver, files);
  const tryouts = makeTryoutsArea(driver, files, milestones, feltSense);
  const voiceBenchmarks = makeVoiceBenchmarksArea(driver, files);
  const voicePracticeTakes = makeVoicePracticeTakesArea(driver);
  const journalingPauses = makeJournalingPausesArea(driver);
  const savedQuestions = makeSavedQuestionsArea(driver);
  const eras = makeErasArea(driver);
  const eraMutes = makeEraMutesArea(driver);
  const comfortItems = makeComfortItemsArea(driver);
  const areaStates = makeAreaStatesArea(driver);

  return {
    entries,
    tags,
    affirmations: makeAffirmationsArea(driver),
    bodyRegions: makeBodyRegionsArea(driver),
    dimensions,
    milestones,
    photos: makePhotosArea(driver, files),
    presentations: makePresentationsArea(driver),
    entryTemplates: makeEntryTemplatesArea(driver),
    voice: makeVoiceArea(driver),
    voiceBenchmarks,
    voicePracticeTakes,
    videos: makeVideoArea(driver),
    labs,
    measurements,
    sizeRecords,
    reminders,
    tally,
    regimen,
    doses,
    stock: makeStockArea(driver, doses, regimen, reminders),
    exposure,
    hormoneCurve: makeHormoneCurveArea(doses, regimen, labs),
    sideEffects,
    cycleEvents,
    journalingPauses,
    savedQuestions,
    eras,
    eraMutes,
    chartAnnotations: makeChartAnnotationsArea({
      areaStates,
      milestones,
      regimen,
      doses,
      journalingPauses,
      tryouts,
      procedures,
      eras,
      sideEffects,
      stats
    }),
    wearSessions,
    clinicianSummary: makeClinicianSummaryArea({
      areaStates,
      regimen,
      doses,
      labs,
      exposure,
      sideEffects,
      checklists,
      procedures
    }),
    day: makeDayArea({
      entries,
      milestones,
      doses,
      labs,
      voiceBenchmarks,
      measurements,
      sizeRecords,
      sideEffects,
      personalEffects,
      cycleEvents,
      tally,
      wearSessions,
      feltSense,
      hairProgress,
      hairRemoval,
      procedures,
      tryouts
    }),
    lastWrite: makeLastWriteArea({
      entries,
      milestones,
      doses,
      labs,
      voiceBenchmarks,
      measurements,
      sizeRecords,
      sideEffects,
      personalEffects,
      cycleEvents,
      tally,
      wearSessions,
      feltSense,
      hairProgress,
      hairRemoval,
      procedures,
      tryouts
    }),
    textSearch: makeTextSearchArea(driver),
    journalBook: makeJournalBookArea({ entries, milestones, sideEffects, stats, tags }),
    personalEffects,
    effectCategories: makeEffectCategoriesArea(driver),
    hairProgress,
    hairRemoval,
    procedures,
    doubtJournal,
    comfortItems,
    areaStates,
    feltSense,
    tryouts,
    letters: makeLettersArea(driver),
    roadmap: makeRoadmapArea(driver),
    checklists,
    stats,
    correlationCards: makeCorrelationCardsArea(stats, doses, dimensions),
    intervalMoodPattern: makeIntervalMoodPatternArea(stats, doses),
    archive: makeArchiveArea(driver, files),
    reconcileBuiltIns: () => reconcileBuiltIns(driver),
    discardEverything: async () => {
      await driver.transaction(() => discardJournalRows(driver));
    }
  };
}

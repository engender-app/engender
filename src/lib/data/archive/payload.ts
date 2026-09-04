/* What an archive carries, and how an older one is brought forward.

   These interfaces are the wire format, which is why they are written out
   here rather than aliased to the domain types in data/types.ts that some
   of them currently match. The domain types belong to the app and change
   with it; this shape belongs to every archive ever written, and a change
   to it is a format version and a migration, not an edit. Keeping them
   separate means a rename in the app cannot silently change what a backup
   file looks like.

   Identity is the travelling kind throughout (ADR-0002): the seeded key
   for a built-in row, the minted uuid for a user's own, which is what lets
   ticket 14 match an archive's rows against a device's without sharing a
   rowid space. Entries carry their uuid rather than the rowid the app
   addresses them by locally.

   Photo bytes are not in here. The payload names the files it travels
   with; the files themselves follow it in the archive body (pack.ts), so
   neither packing nor unpacking has to hold more than one photo at a time. */

import { PORTABLE_KEYS, PREFERENCE_DEFAULTS, type PreferenceValues } from '../prefs/catalogue';
import { BUILT_IN_PRESETS } from '../vocabulary/builtins';
import { ARCHIVE_FORMAT_VERSION } from './container';

/** The preferences that describe the journal and travel with it
    (ADR-0003). An allowlist, so a preference added later stays on the
    device it was set on until someone puts it in PORTABLE_KEYS on
    purpose. */
export type PortablePreferences = Pick<PreferenceValues, (typeof PORTABLE_KEYS)[number]>;

export function portablePreferences(values: PreferenceValues): PortablePreferences {
  const portable = {} as PortablePreferences;
  for (const key of PORTABLE_KEYS) {
    // Both sides index at the same key, which the compiler can't follow
    // across a loop over a union of key types.
    portable[key] = values[key] as never;
  }
  return portable;
}

export interface ArchivePhoto {
  id: string;
  /** The opaque `<uuid>.jpg` of ticket 11, resolved against whatever root
      the importing platform uses. Never a path. */
  fileName: string;
  /** Chosen counterevidence (phase 5 ticket 14, CONTEXT: "Starred"). No
      format version step for the addition, the same reasoning
      ArchiveLabResult's header gives: no release has shipped, so no
      archive in existence predates it. */
  starred: boolean;
}

/** One voice recording (phase 4 ticket 24, CONTEXT: "Voice recording"). Its
    own interface rather than reused ArchivePhoto, for the reason this
    file's header gives: a rename on one must not silently change what the
    other travels as. Structurally the same shape today - an id and an
    opaque file name - because a recording has no thumbnail pair to carry
    and no owner but an entry. */
export interface ArchiveVoiceRecording {
  id: string;
  /** The opaque `<uuid>.webm` of voiceRecordings/names.ts. Never a path. */
  fileName: string;
}

/** One video note (phase 5 ticket 22, CONTEXT: "Video note"). Its own
    interface rather than reused ArchiveVoiceRecording, for the reason this
    file's header gives: a rename on one must not silently change what the
    other travels as. Structurally the same shape today, and for the same
    reasons - no thumbnail pair to carry and no owner but an entry. */
export interface ArchiveVideoNote {
  id: string;
  /** The opaque `<uuid>.webm` of videoNotes/names.ts. Never a path. */
  fileName: string;
}

export interface ArchiveEntry {
  uuid: string;
  epochDay: number;
  timestamp: number;
  mood: number | null;
  note: string;
  /** By gender dimension key. */
  dims: Record<string, number>;
  /** Tag ids: the key of a built-in, the uuid of a custom. */
  tags: string[];
  photos: ArchivePhoto[];
  recordings: ArchiveVoiceRecording[];
  videos: ArchiveVideoNote[];
  /** By body-region domain id. Free-standing TEXT, not a row to resolve
      against a built-in table, so restore.ts writes it back unvalidated -
      the same forward-compatible treatment lab_result.analyte already
      gets. */
  bodyRegions: Record<string, ArchiveBodyRegionFeeling>;
  /** Chosen counterevidence (phase 5 ticket 14, CONTEXT: "Starred"). Same
      no-format-version-step reasoning as ArchivePhoto.starred. */
  starred: boolean;
  /** The presentation this entry was filed under (phase 5 deepening ticket
      17, ADR-0048), by domain id (uuid), or null. Carried as plain text the
      same way ArchiveMilestone.procedureId/tryoutId are - restore.ts
      resolves no rowid against it. Absent on an archive written before this
      ticket, read the same way an unset presentation always reads. */
  presentationId: string | null;
}

export interface ArchiveDimension {
  key: string;
  name: string;
  low: string;
  high: string;
  min: number;
  max: number;
  builtIn: boolean;
  hidden: boolean;
}

export interface ArchivePreset {
  id: string;
  name: string;
  builtIn: boolean;
  /** Dimension keys, in the order the preset offers them. */
  dims: string[];
}

export interface ArchiveTag {
  id: string;
  label: string;
  builtIn: boolean;
  hidden: boolean;
}

export interface ArchiveTagGroup {
  key: string;
  name: string;
  enabled: boolean;
  builtIn: boolean;
  /** In the order the group shows them. */
  tags: ArchiveTag[];
}

/** One line of the check-in's affirmation pool (phase 5 ticket 15). `id` is
    the built-in's key or the custom's uuid, matching ArchiveTag's own
    convention. `language` is null for a built-in - its wording is looked
    up fresh on the importing device - and 'en' or 'pl' for a custom, which
    travels verbatim since it is never translated (CONTEXT: "Custom"). */
export interface ArchiveAffirmation {
  id: string;
  language: 'en' | 'pl' | null;
  text: string;
  builtIn: boolean;
  hidden: boolean;
}

/** A region's two independent intensities on one entry (phase 5 ticket
    31). Was a bare number, meaning distress only, and is now a pair so a
    region that felt good can travel at all. No format version step, the
    same reasoning ArchivePhoto.starred gives: no release has shipped, so
    no archive in existence carries the old shape.

    Written out here rather than aliased to BodyRegionFeeling for this
    file's standing reason - a rename in the app must not silently change
    what a backup looks like. */
export interface ArchiveBodyRegionFeeling {
  dysphoria: number | null;
  euphoria: number | null;
}

export interface ArchiveBodyRegion {
  id: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}

export interface ArchiveMilestone {
  id: string;
  name: string;
  epochDay: number;
  /** What happened, in the person's own words (ticket 15). Absent on an
      archive written before this ticket, read as '' rather than undefined -
      no null check at every read, and existing milestones have no
      description to lose. */
  description: string;
  templateKey: string | null;
  roadmapGoalKey: string | null;
  procedureId: string | null;
  tryoutId: string | null;
  photo: ArchivePhoto | null;
}

/* The dosing context travels flat and nullable, the way ArchiveDoseEvent
   carries its route-conditional fields rather than the union the domain type
   uses (types.ts). Same reason: a transport shape that never changes arms is
   one an older build can still parse field by field, and rebuilding the
   union is the labs area's job on the way in either way.

   It travels at all because it is recorded data, not a cache. A device
   importing this archive cannot re-derive it - the dose log the figure was
   measured against is not necessarily the one it is importing, and may
   never have existed on that device. Leaving it behind would lose it.

   These five are required here, so that whatever writes an archive has to
   fill them, but the importer coalesces them anyway (restore.ts): this
   interface is a cast over JSON.parse output, and a lab row written before
   ticket 03 will not have them however the type is spelled. No format
   version step for the addition, following ticket 02, which added four whole
   collections without one - no release has shipped, so no archive in
   existence predates either. A real v1 ladder step, filling in both tickets'
   additions, is worth its own ticket rather than half of one here. */
export interface ArchiveLabResult {
  id: string;
  epochDay: number;
  analyte: string;
  value: number;
  unit: string;
  note: string;
  drawTime: string | null;
  provider: string;
  timingRoute: string | null;
  timingHours: number | null;
  timingDayOfInterval: number | null;
}

export interface ArchiveMeasurement {
  id: string;
  /** Names an ArchiveMeasurementType by key - a built-in's stable key or a
      custom's minted uuid - the same way an ArchiveEntry's dims name an
      ArchiveDimension (phase 5 ticket 29). Nothing here resolves it to a
      rowid on the way back in (restore.ts), the same free-text treatment
      it always had. */
  type: string;
  epochDay: number;
  value: number;
  unit: string;
}

/** A measurement type (phase 5 ticket 29), the same `key` NOT NULL /
    `uuid` nullable shape ArchiveDimension gives a gender dimension: a
    built-in's own stable key, or a custom's minted uuid doubling as its
    key. */
export interface ArchiveMeasurementType {
  key: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}

export interface ArchiveSizeRecord {
  id: string;
  epochDay: number;
  /** Loosened from GarmentCategoryKey, the way ArchiveMeasurement loosens
      `type`: the schema's CHECK is the backstop on the way back in. */
  category: string;
  size: string;
  brand: string;
  fitNote: string;
}

export interface ArchiveTallyEvent {
  id: string;
  epochDay: number;
  kind: string;
}

export interface ArchiveSideEffect {
  id: string;
  name: string;
  severity: number | null;
  epochDay: number;
}

export interface ArchiveCycleEvent {
  id: string;
  kind: string;
  epochDay: number;
}

export interface ArchiveJournalingPause {
  id: string;
  startEpochDay: number;
  endEpochDay: number | null;
}

/** A time-capsule letter (phase 4 ticket 19), sealed until `unlockEpochDay`
    - never stored as a `sealed` flag, the same reasoning ArchiveMilestone
    carries no `kind`. */
export interface ArchiveLetter {
  id: string;
  epochDay: number;
  text: string;
  unlockEpochDay: number;
}

/** A practice take (phase 8 features ticket 10), sealed until the day after
    `epochDay` the same way a letter is sealed until its own unlock day -
    never stored as a `sealed` flag, and here not even as the unlock day
    itself, which types.ts's own comment gives the ADR-0010 reason for. */
export interface ArchiveVoicePracticeTake {
  id: string;
  epochDay: number;
  minHz: number;
  maxHz: number;
  medianHz: number;
  feltSense: number | null;
}

/** A saved question (phase 8 features ticket 06, CONTEXT: "Saved question").
    `tagIds`/`moods` travel comma-joined, the same as the row is stored -
    an archive descriptor has no array column either, and the split back
    into a list is savedQuestions.ts's job on the way out of a restore too. */
export interface ArchiveSavedQuestion {
  id: string;
  name: string;
  queryText: string;
  tagIds: string;
  moods: string;
  startEpochDay: number | null;
  endEpochDay: number | null;
  hasNote: boolean;
  hasPhoto: boolean;
}

/** A day chosen to see one entry again (phase 8 features ticket 08,
    ADR-0045). `entryId` is the owning entry's own uuid here, not its local
    row id: a raw integer FK would need resolving against a rowid that can
    differ after a restore or merge, and a uuid already survives that trip
    unresolved - the same plain-text FK shape ArchiveMilestone's
    `procedureId` already carries. The live-schema `Revisit` type (types.ts)
    resolves this back to the app-facing numeric entry id; that resolution
    is revisits.ts's job, not this wire shape's. */
export interface ArchiveRevisit {
  id: string;
  entryId: string;
  entryEpochDay: number;
  createdEpochDay: number;
  targetEpochDay: number;
}

/** One bundled transition-roadmap goal with a status recorded at all
    (phase 4 ticket 23, widened phase 5 ticket 20 for the tri-state), named
    by its pack and its goal key rather than a uuid - both strings mean the
    same thing on every device, so two installs that recorded the same
    goal recorded the same goal (ADR-0002). An unchecked goal travels as
    absence: there is no row for one, here or in the journal. */
export interface ArchiveRoadmapCheck {
  packKey: string;
  goalKey: string;
  status: string;
}

/** A user-authored roadmap goal (phase 5 ticket 20), named by its own
    uuid like any other user-owned row - unlike ArchiveRoadmapCheck, it
    carries data of its own (a track and its text) rather than naming
    bundled content, so it travels whether or not it is checked. */
export interface ArchiveRoadmapGoal {
  id: string;
  track: string;
  text: string;
  status: string;
}

/** One line of a checklist (phase 5 ticket 05), named by its own uuid like
    any other user-owned row - unlike ArchiveRoadmapCheck, an item carries
    data of its own rather than naming bundled content. */
export interface ArchiveChecklistItem {
  id: string;
  content: string;
  checked: boolean;
  carriedForward: boolean;
}

/** A checklist, standalone or scoped to an owner record (phase 5 ticket 05).
    `ownerKind`/`ownerId` travel as a pair, both present or both absent, the
    same nullable pairing the row itself keeps (migrations.ts v20) - there is
    no owner table to resolve either against yet.

    `appointmentEpochDay` (migrations.ts v48, phase 5 deepening ticket 25) is
    the standalone checklist's own date, null on every owned one - the same
    column travels for both because there is one `checklist` table, not
    because an owned checklist has an appointment of its own. */
export interface ArchiveChecklist {
  id: string;
  ownerKind: string | null;
  ownerId: string | null;
  appointmentEpochDay: number | null;
  items: ArchiveChecklistItem[];
}

/** One dated recovery photo (phase 5 ticket 07). Nested under its procedure
    rather than a top-level section, the way ArchiveHairRemovalPhoto is
    nested under its session: a recovery photo belongs to exactly one
    procedure, so it travels with the procedure that owns it. Unlike that
    one it keeps its own `epochDay` - the procedure's surgery date says when
    the operation was, not when the picture was taken. */
export interface ArchiveProcedurePhoto {
  id: string;
  epochDay: number;
  fileName: string;
}

/** One consult date (phase 5 ticket 07), nested under its procedure and
    carrying its own uuid - which is what lets Merge tell a consult this
    device already has from one only the archive holds. */
export interface ArchiveProcedureConsult {
  id: string;
  epochDay: number;
}

/** One procedure and its recovery log (phase 5 ticket 07).
    `surgeryEpochDay` is null for a procedure with no date set yet. The
    recovery checklist is not here: it is an ordinary `checklist` row
    carrying this procedure's id as its owner, so it travels in the
    `checklists` section. Neither section has to apply before the other -
    an owner pair is matched by uuid, not resolved to a rowid. */
export interface ArchiveProcedure {
  id: string;
  name: string;
  surgeryEpochDay: number | null;
  consults: ArchiveProcedureConsult[];
  notes: string;
  photos: ArchiveProcedurePhoto[];
}

/** One counterevidence entry as it read at the moment its snapshot was
    saved (phase 4 ticket 11) - copied fields, not a reference to the
    source entry's id, the same reasoning the snapshot table itself argues
    (migrations.ts v14). */
export interface ArchiveCounterevidenceEntry {
  epochDay: number;
  mood: number | null;
  note: string;
}

export interface ArchiveCounterevidenceSnapshot {
  id: string;
  epochDay: number;
  timestamp: number;
  /** In the order the composer showed them. */
  items: ArchiveCounterevidenceEntry[];
}

/** A "first noticed" marker against the open effect catalogue (phase 4
    ticket 07, widened phase 5 ticket 41). `effect` was already loosened
    from PersonalEffectType to a plain string before that type itself
    opened up (migrations.ts v39 drops the CHECK that used to enforce it
    on the way back in); restore.ts now validates against
    ArchivePersonalEffectType rows carried in the same journal instead. */
export interface ArchivePersonalEffect {
  id: string;
  effect: string;
  firstNoticedEpochDay: number;
}

export interface ArchiveEffectCategory {
  key: string;
  name: string;
  enabled: boolean;
}

export interface ArchivePersonalEffectType {
  key: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
  categoryKey: string | null;
  direction: 'feminizing' | 'masculinizing' | null;
}

/** One staging against a published scale (phase 4 ticket 09, two scales
    since phase 5 ticket 33). `scale` and `stage` are loose strings the way
    ArchiveMeasurement's `type` is: the schema's CHECK enforces the pair on
    the way back in (restore.ts), not this boundary type.

    `scale` and `description` are optional because archives written before
    ticket 33 carry neither. An archive that predates it holds
    Norwood-Hamilton stagings and nothing else, since that was the only
    vocabulary there was, and applyHairStages reads a missing `scale` as
    exactly that rather than dropping the row. */
export interface ArchiveHairStage {
  id: string;
  epochDay: number;
  scale?: string;
  stage: string;
  description?: string;
}

/** One scheduled fixed-position hair photo (phase 4 ticket 09). Its own
    shape, not ArchivePhoto: it carries its own date rather than an owner's,
    since a hair photo is not an entry's or a milestone's (migrations.ts
    v13). */
export interface ArchiveHairPhoto {
  id: string;
  epochDay: number;
  fileName: string;
}

/** One hair-removal session photo (phase 5 ticket 08). Nested under its
    session rather than a top-level section, the way `ArchiveChecklistItem`
    is nested under its checklist: a session photo belongs to exactly one
    session, so it travels with the session that owns it. It carries no
    date of its own - the session's `epochDay` is enough. */
export interface ArchiveHairRemovalPhoto {
  id: string;
  fileName: string;
}

/** One electrolysis/laser session (phase 5 ticket 08). `area` and `method`
    are loosened from their literal-union/closed-set typings, the way
    ArchiveMeasurement loosens `type` and ArchiveHairStage loosens `stage`:
    the schema's CHECK enforces both on the way back in (restore.ts), not
    this boundary type. */
export interface ArchiveHairRemovalSession {
  id: string;
  epochDay: number;
  area: string;
  method: string;
  painRating: number;
  cost: string;
  provider: string;
  photos: ArchiveHairRemovalPhoto[];
}

export interface ArchiveReminder {
  id: string;
  title: string;
  type: string;
  time: string;
  recurrence: string | null;
  interval: number | null;
  anchorEpochDay: number | null;
  epochDay: number | null;
  enabled: boolean;
  /** Which feature manages this reminder, e.g. `stock:estradiol valerate`
      (phase 4 ticket 04). Null for a reminder a person created themselves.
      Travels so restoring a device's own backup keeps that device's own
      hand-off state - see the coalescing note at applyReminders (an
      archive from before ticket 04 has no such field at all). */
  autoSource: string | null;
}

export interface ArchiveRegimenEpisode {
  id: string;
  drug: string;
  ester: string | null;
  dose: number;
  doseUnit: string;
  route: string;
  interval: string;
  startEpochDay: number;
  /** Nullable: still ongoing (phase 5 ticket 38). Absent on an archive from
      before this field existed, which restore.ts reads as null the same
      way it already reads any other field a pre-ticket build never wrote. */
  endEpochDay: number | null;
}

/* Flat and nullable, the way ArchiveReminder carries its recurrence
   variants, rather than a union on route the way the domain type is
   (types.ts). A transport shape that never changes arms is one an older
   build can still parse field by field, and mapping it back to the union is
   the dose area's job either way (doses.ts). No episode id: a dose's
   regimen episode is resolved from its timestamp on whatever device reads
   it, so carrying one would carry an answer instead of the question. */
export interface ArchiveDoseEvent {
  id: string;
  timestamp: number;
  route: string;
  dose: number;
  doseUnit: string;
  injectionSite: string | null;
  vehicle: string | null;
  applicationSite: string | null;
  status: string;
  scheduledDose: number | null;
  scheduledRoute: string | null;
  scheduledTimestamp: number | null;
  /** Which drug this dose was, in its own words - optional and usually
      null (phase 5 ticket 38). Absent on an archive from before this field
      existed, read as null the same way any other field a pre-ticket
      build never wrote is. */
  drug: string | null;
}

/** Named by the episode's travelling uuid, not its rowid: the rowid means
    nothing on the device importing this (ADR-0002).

    Flat and permissive like ArchiveDoseEvent above, not the domain's
    `DoseScheduleRecurrence` union: `recurrenceKind` is a plain string and
    `everyNDays`/`weekdays` both nullable, so a build that only knows
    'everyNDays' can still read a 'weekdays' row's fields field by field
    instead of failing to parse an arm it has never seen. `weekdays` and
    `doseAmounts` are this schedule's own child rows (dose_schedule_weekday,
    dose_schedule_dose_amount), nested here the same way ArchiveTryoutPhoto
    nests under its tryout rather than travelling as their own section. */
export interface ArchiveDoseSchedule {
  id: string;
  episodeId: string;
  recurrenceKind: string;
  everyNDays: number | null;
  weekdays: number[] | null;
  dosesPerDay: number;
  doseAmounts: { dose: number; doseUnit: string }[] | null;
}

export interface ArchiveDosePause {
  id: string;
  episodeId: string;
  startEpochDay: number;
  endEpochDay: number | null;
  reason: string;
}

/** One dated tryout photo (phase 5 ticket 13). Nested under its tryout
    rather than a top-level section, the way ArchiveProcedurePhoto is
    nested under its procedure, and for the same reason: it carries its
    own `epochDay` because when during the tryout it was taken is the
    whole point of it, unlike the tryout's own dates. */
export interface ArchiveTryoutPhoto {
  id: string;
  epochDay: number;
  fileName: string;
}

/** Something being tried out (phase 4 ticket 16, widened past name/pronoun
    by phase 5 ticket 13). No "current" flag: several can travel with
    overlapping or long-closed ranges, and nothing here may single one
    out. `kind` is loosened from TryoutKind, the way ArchiveMeasurement
    loosens `type`: the schema's CHECK enforces it on the way back in
    (restore.ts), not this boundary type. */
export interface ArchiveTryout {
  id: string;
  kind: string;
  label: string;
  description: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
  photos: ArchiveTryoutPhoto[];
}

/** One point in a tryout's or a milestone's felt-sense history (phase 4
    ticket 16, widened to milestones by phase 5 ticket 24). Exactly one of
    `tryoutId`/`milestoneId` is set, each named by that owner's own
    travelling uuid rather than its rowid, which means nothing on the
    device importing this (ADR-0002) - the same rule ArchiveDosePause's
    `episodeId` follows, and the same flat, always-both-fields shape
    ArchiveDoseEvent's own header gives for a forward-compatible union. */
export interface ArchiveFeltSenseEntry {
  id: string;
  tryoutId: string | null;
  milestoneId: string | null;
  epochDay: number;
  mood: number;
  note: string | null;
}

/** A margin note (phase 8 features ticket 07, CONTEXT: "Margin note"),
    named by its entry's own travelling uuid rather than its rowid, the same
    rule `ArchiveFeltSenseEntry`'s owner fields follow - nothing on the
    device importing this knows a rowid it did not mint (ADR-0002). Exactly
    one owner, unlike a felt-sense entry's two: a margin note always
    belongs to an entry, so there is nothing to make optional. */
export interface ArchiveMarginNote {
  id: string;
  entryId: string;
  epochDay: number;
  text: string;
}

/** What a person last reported having of one drug, plus box 4's reminder
    hand-off bookkeeping (phase 4 ticket 04). Not the projection over it -
    that is derived from the dose log, and the importing device has its
    own (CONTEXT: pending, stockProjection.ts). */
export interface ArchiveMedicationStock {
  id: string;
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
  reminderEverCreated: boolean;
  reminderDismissed: boolean;
}

/** A wear session as it travels (phase 5 ticket 04). No reminder-handoff
    bookkeeping the way ArchiveMedicationStock carries: the reminder itself
    travels as an ordinary ArchiveReminder, carrying this session's own
    auto_source marker, and is matched back up by that marker on import - a
    session has nothing of its own to record about the handoff. */
export interface ArchiveWearSession {
  id: string;
  startTimestamp: number;
  durationMs: number | null;
  note: string | null;
}

/** One completed import, named by its own uuid (phase 7 ticket 03). Answers
    "where did this come from" at the granularity it is actually asked at -
    which source, when, and what it added - rather than a per-row marker
    kept forever on every table an import can reach. `counts` is by kind
    (`{ entries: 12, tags: 3 }`) rather than a list of row ids, because the
    question is never "which of these fourteen". Written once, on commit,
    never on a preview or a failed import, and never edited afterwards - so
    unlike most of this file's records it carries no update path, only an
    insert. */
export interface ArchiveImportLogRecord {
  id: string;
  source: string;
  importedAt: number;
  counts: Record<string, number>;
}

/** One area's hidden/finished state (ADR-0052, CONTEXT: "Finished"). Named
    by its area key rather than a uuid, the way ArchiveRoadmapCheck is named
    by its pack and its goal: an area key is an archive section name, so the
    same string means the same area on every device (ADR-0002). Why it
    travels at all is the section's own declaration (archiveSections.ts). */
export interface ArchiveAreaState {
  area: string;
  hidden: boolean;
  finishedEpochDay: number | null;
}

/** Everything the journal holds (CONTEXT: "Journal"). */
export interface ArchiveJournal {
  dimensions: ArchiveDimension[];
  presets: ArchivePreset[];
  tagGroups: ArchiveTagGroup[];
  affirmations: ArchiveAffirmation[];
  bodyRegions: ArchiveBodyRegion[];
  entries: ArchiveEntry[];
  milestones: ArchiveMilestone[];
  labResults: ArchiveLabResult[];
  measurementTypes: ArchiveMeasurementType[];
  measurements: ArchiveMeasurement[];
  sizeRecords: ArchiveSizeRecord[];
  sideEffects: ArchiveSideEffect[];
  cycleEvents: ArchiveCycleEvent[];
  journalingPauses: ArchiveJournalingPause[];
  eras: ArchiveEra[];
  eraMutes: ArchiveEraMute[];
  personalEffects: ArchivePersonalEffect[];
  effectCategories: ArchiveEffectCategory[];
  personalEffectTypes: ArchivePersonalEffectType[];
  hairStages: ArchiveHairStage[];
  hairPhotos: ArchiveHairPhoto[];
  hairRemovalSessions: ArchiveHairRemovalSession[];
  procedures: ArchiveProcedure[];
  reminders: ArchiveReminder[];
  tallyEvents: ArchiveTallyEvent[];
  counterevidenceSnapshots: ArchiveCounterevidenceSnapshot[];
  letters: ArchiveLetter[];
  voicePracticeTakes: ArchiveVoicePracticeTake[];
  roadmapChecks: ArchiveRoadmapCheck[];
  roadmapGoals: ArchiveRoadmapGoal[];
  regimenEpisodes: ArchiveRegimenEpisode[];
  doseEvents: ArchiveDoseEvent[];
  doseSchedules: ArchiveDoseSchedule[];
  dosePauses: ArchiveDosePause[];
  medicationStock: ArchiveMedicationStock[];
  tryouts: ArchiveTryout[];
  feltSenseEntries: ArchiveFeltSenseEntry[];
  checklists: ArchiveChecklist[];
  wearSessions: ArchiveWearSession[];
  voiceBenchmarks: ArchiveVoiceBenchmark[];
  presentations: ArchivePresentation[];
  entryTemplates: ArchiveEntryTemplate[];
  comfortItems: ArchiveComfortItem[];
  importLog: ArchiveImportLogRecord[];
  areaStates: ArchiveAreaState[];
  savedQuestions: ArchiveSavedQuestion[];
  revisits: ArchiveRevisit[];
  marginNotes: ArchiveMarginNote[];
}

/** A named stretch of the person's timeline (phase 6 ticket 01, ADR-0049,
    CONTEXT: "Era"). Both bounds travel as null when they are open, which is
    the whole of what an open bound is: the clamp a surface applies to read
    it as two concrete dates is computed against the importing journal's own
    data and is never written down (ADR-0010), so an archive restored onto a
    device with a different first entry resolves "before I knew" against that
    device rather than against the one it was exported from. */
export interface ArchiveEra {
  id: string;
  name: string;
  startEpochDay: number | null;
  endEpochDay: number | null;
}

/** Which eras are muted from resurfacing (phase 6 ticket 05, ADR-0049,
    CONTEXT: "Resurfacing consent"). A uuid an importing device has no era
    for names nothing there either, the same resting state it is on the
    device it travelled from - nothing here resolves it against
    `ArchiveEra`, so an archive can carry a mute for an era trimmed by a
    merge on the far side without either device having to reconcile that. */
export interface ArchiveEraMute {
  eraUuid: string;
}

/** One line of the person's own comfort list (phase 6 ticket 14, CONTEXT:
    "Comfort list"). `position` travels explicitly rather than being
    inferred from array order, the same as any other flat area with a
    person-set order. */
export interface ArchiveComfortItem {
  id: string;
  text: string;
  position: number;
}

/** A named presentation (phase 5 deepening ticket 17, ADR-0048, CONTEXT:
    "Presentation"). No `builtIn` flag: unlike ArchiveTag or
    ArchiveGenderDimension it ships nothing seeded, so every row travels the
    same way. `roleIndex` is an index into the active flag's roles
    (theme/roles.ts), never a colour of its own - the same reason
    ArchiveMilestone carries no rendered label. */
export interface ArchivePresentation {
  id: string;
  name: string;
  roleIndex: number;
  hidden: boolean;
}

/** An entry template (phase 6 ticket 07, ADR-0002): the six original
    built-ins and the eight folded-in guided prompts alike, plus anything
    the person authored. `tags` and `dims` are domain ids and dimension
    keys the same way `ArchivePreset.dims` is - resolved against the
    archive's own vocabulary sections on the way back in, never a rowid.
    `presentationId` is free text, not resolved against `ArchivePresentation`
    - the same reason `ArchiveEntry.presentationId` is - so a template
    naming a presentation the far side trimmed in a merge is a template
    with no presentation there, the same resting state an unset one already
    has. */
export interface ArchiveEntryTemplate {
  id: string;
  name: string;
  tags: string[];
  dims: Record<string, number>;
  noteScaffold: string;
  presentationId: string | null;
  builtIn: boolean;
  hidden: boolean;
}

/** A standardized voice take (phase 5 deepening ticket 15, CONTEXT: "Voice
    benchmark"). Its two audio files travel in the body like a recording's,
    named by the same opaque `<uuid>.webm`; the vowel half is absent on a
    take that skipped or failed that step, and its three figures with it. */
export interface ArchiveVoiceBenchmark {
  id: string;
  epochDay: number;
  timestamp: number;
  passageKey: string;
  passageFileName: string;
  vowelFileName: string | null;
  f0MedianHz: number;
  f0P10Hz: number;
  f0P90Hz: number;
  semitoneSd: number;
  wordsPerMinute: number;
  f1Hz: number | null;
  f2Hz: number | null;
  snrDb: number | null;
  note: string | null;
  /** The downsampled pitch track (phase 8 features ticket 09), absent on an
      archive written before it and on any take from before schema v58. */
  pitchTrack: string | null;
  /** What recorded it (phase 8 features ticket 28, ADR-0061). It travels
      because a restored benchmark that lost its chain would silently
      rejoin a series it does not belong to. */
  captureChain: string | null;
}

/** A photo file travelling in the body, and how many bytes of it there
    are. The lengths are what let the body be cut into files again, and
    what let the chunk count be worked out before anything is encrypted. */
export interface ArchiveFile {
  name: string;
  length: number;
}

export interface ArchivePayload {
  journal: ArchiveJournal;
  preferences: PortablePreferences;
  /** In body order. */
  files: ArchiveFile[];
}

/** Brings a payload written at one version up to the next one. */
export type PayloadMigration = (payload: ArchivePayload) => ArchivePayload;

/** The shape a v1 archive's preferences had where they now hold a list of
    ticked scales: one preset key, which the app resolved to a dimension
    list at read time (phase 5 ticket 35). */
interface PreferencesV1 {
  activePreset?: string;
}

/** v1 to v2: the active preset becomes the scales it stood for.

    The archive's own preset rows answer first, so a custom preset restores
    the list its owner built rather than the nearest built-in. BUILT_IN_PRESETS
    answers second, which is the reason those eight outlive the eight cards
    they used to draw: a file that names `p-agender` without carrying it -
    hand-edited, or written by something partial - still knows what that key
    has always meant. Neither answering leaves the preference unset, and the
    default set applies, which is also what an archive that predates the
    preference entirely gets.

    The old key is dropped rather than left beside the new one. Two stored
    answers to "which scales does this journal offer" is exactly what this
    ticket removed, and an archive is where one of them would come back. */
const presetBecomesTickedScales: PayloadMigration = (payload) => {
  const { activePreset, ...rest } = payload.preferences as PortablePreferences & PreferencesV1;
  if (activePreset === undefined) return payload;

  const carried = payload.journal.presets?.find((preset) => preset.id === activePreset);
  const builtIn = BUILT_IN_PRESETS.find((preset) => preset.key === activePreset);
  const dims = carried?.dims ?? builtIn?.dims;

  return {
    ...payload,
    preferences: { ...rest, activeScales: dims ? [...dims] : [...PREFERENCE_DEFAULTS.activeScales] }
  };
};

/** Step i migrates a payload written at format version i + 1. Appending here
    is what a format change costs, and the ladder below then walks it. */
export const PAYLOAD_MIGRATIONS: readonly PayloadMigration[] = [presetBecomesTickedScales];

/** Walks the version ladder one step at a time, so a v1 archive opened by
    a build on v4 goes through every shape in between rather than needing a
    direct v1 to v4 step nobody would remember to write.

    Exported with its inputs spelled out so the walk can be tested with
    steps of its own; the archive path calls migratePayload. */
export function applyMigrations(
  payload: ArchivePayload,
  fromVersion: number,
  toVersion: number,
  steps: readonly PayloadMigration[]
): ArchivePayload {
  let migrated = payload;
  for (let version = fromVersion; version < toVersion; version++) {
    const step = steps[version - 1];
    if (!step) throw new Error(`no migration from archive format version ${version}`);
    migrated = step(migrated);
  }
  return migrated;
}

export const migratePayload = (payload: ArchivePayload, fromVersion: number): ArchivePayload =>
  applyMigrations(payload, fromVersion, ARCHIVE_FORMAT_VERSION, PAYLOAD_MIGRATIONS);

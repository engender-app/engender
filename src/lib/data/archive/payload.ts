/* Keep wire types separate from domain types. Changes require a
   format version and migration. Use portable identities (ADR-0002):
   seeded keys for built-ins and minted UUIDs for user rows and
   entries. pack.ts streams named photo files after this metadata
   so readers and writers only hold one photo at a time. */

import { PORTABLE_KEYS, PREFERENCE_DEFAULTS, type PreferenceValues } from '../prefs/catalogue';
import type { DocumentTargetKind, DrugClass, EffectDirection, EpisodeEndReason, ProcedureKind, WearKind } from '../types';
import { BUILT_IN_PRESETS } from '../vocabulary/builtins';

/** When the row was last written on the device that exported it:
    what a Merge compares to decide which of
    two copies of a row is the newer (journal/archiveMerge.ts). Absent on an
    archive written before it, where the archive's copy never wins over a
    row this device already has. */
export interface ArchiveStamped {
  updatedAt?: number;
}

/** A record deleted on the exporting device: the table it was in, its
    identity there (archiveMerge.ts's MERGE_CLASSES), and when it went. A
    Merge applies it unless this device wrote the row after that. */
export interface ArchiveDeletion {
  table: string;
  id: string;
  deletedAt: number;
}

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

export interface ArchivePhoto extends ArchiveStamped {
  id: string;
  /** The opaque `<uuid>.jpg` of, resolved against whatever root the importing platform
      uses. Never a path. */
  fileName: string;
  /** Chosen counterevidence. Added before the 1.0.0 format cutoff without a version step.
      From 1.0.0 on, wire changes require a format version and payload migration. */
  starred: boolean;
  /** The day this photo shows on, when it overrides its owner's (ADR-0008/0015). Null on
      every photo before this ticket and on any photo nobody has corrected since -
      restore.ts writes `?? null` for an archive whose payload predates this field. */
  epochDayOverride: number | null;
}

/** One voice recording. Its own interface rather than reused ArchivePhoto, for the reason
    this file's header gives: a rename on one must not silently change what the other
    travels as. Structurally the same shape today - an id and an opaque file name - because
    a recording has no thumbnail pair to carry and no owner but an entry. */
export interface ArchiveVoiceRecording extends ArchiveStamped {
  id: string;
  /** The opaque `<uuid>.webm` of voiceRecordings/names.ts. Never a path. */
  fileName: string;
}

/** One video note. Its own interface rather than reused ArchiveVoiceRecording, for the
    reason this file's header gives: a rename on one must not silently change what the other
    travels as. Structurally the same shape today, and for the same reasons - no thumbnail
    pair to carry and no owner but an entry. */
export interface ArchiveVideoNote extends ArchiveStamped {
  id: string;
  /** The opaque `<uuid>.webm` of videoNotes/names.ts. Never a path. */
  fileName: string;
}

export interface ArchiveEntry extends ArchiveStamped {
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
  bodyRegions: Record<string, number>;
  /** Chosen counterevidence. Same no-format-version-step reasoning as ArchivePhoto.starred. */
  starred: boolean;
  /** The presentation this entry was filed under (ADR-0048), by domain id (uuid), or null. Carried as plain text the
      same way ArchiveMilestone.procedureId/tryoutId are - restore.ts
      resolves no rowid against it. Absent on an archive written before this
      ticket, read the same way an unset presentation always reads. */
  presentationId: string | null;
  /** When the entry went to Trash, or null while it is in the journal. Older archives omitted trashed entries. */
  trashedAt?: number | null;
}

export interface ArchiveDimension extends ArchiveStamped {
  key: string;
  name: string;
  low: string;
  high: string;
  min: number;
  max: number;
  builtIn: boolean;
  hidden: boolean;
}

export interface ArchivePreset extends ArchiveStamped {
  id: string;
  name: string;
  builtIn: boolean;
  /** Dimension keys, in the order the preset offers them. */
  dims: string[];
}

export interface ArchiveTag extends ArchiveStamped {
  id: string;
  label: string;
  builtIn: boolean;
  hidden: boolean;
  /** An own tag's icon name. Omitted for iconless tags and in older archives. */
  icon?: string;
}

export interface ArchiveTagGroup extends ArchiveStamped {
  key: string;
  name: string;
  enabled: boolean;
  builtIn: boolean;
  /** In the order the group shows them. */
  tags: ArchiveTag[];
}

export interface ArchiveBodyRegion extends ArchiveStamped {
  id: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}

export interface ArchiveMilestone extends ArchiveStamped {
  id: string;
  name: string;
  epochDay: number;
  /** What happened, in the person's own words. Absent on an
      archive written before this ticket, read as '' rather than undefined -
      no null check at every read, and existing milestones have no
      description to lose. */
  description: string;
  templateKey: string | null;
  roadmapGoalKey: string | null;
  procedureId: string | null;
  tryoutId: string | null;
  /** Present, and false, only on a milestone the person set not to be
      celebrated. Absent reads as true, which
      is also what every milestone in an older archive was. */
  celebrate?: false;
  photo: ArchivePhoto | null;
}

/* Store the five dosing-context fields flat and nullable. The importer
   rebuilds the route union and coalesces missing fields on older labs.
   The archive carries the recorded context because its original dose
   log may be unavailable. Wire changes since 1.0.0 require a format
   version and payload migration. */
/** A cost as it travels (cost.ts): the three columns each costed record holds, flat on its
    row. Optional on the hand- written sections so an archive written before the ticket
    parses, where it reads as no cost; the flat sections declare the same default
    (archiveSections.ts). */
export interface ArchiveCostFields {
  costAmount?: number | null;
  costCurrency?: string | null;
  costRefunded?: boolean;
}

interface ArchiveLabResult extends ArchiveCostFields, ArchiveStamped {
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

/** The dilation taper schedule. One row, since the app models one taper at a time; the
    array shape is only what a section travels as. `stagesJson` is the stage sequence as
    JSON text, exactly as the `taper` table itself stores it (taper.ts), and the stage
    sequence is scalar to both. Never the expansion: that stays derived and never travels
    (ADR-0010).

    `procedureId` is the uuid of the procedure the taper dilates for (schema v83), not the
    rowid the column holds on a device - the same trade `ArchiveAppointment` makes for the
    same link, and the reason neither is a flat section. */
export interface ArchiveTaper extends ArchiveStamped {
  id: string;
  procedureId: string;
  startEpochDay: number;
  stagesJson: string;
}

/** One dilation session actually done. Nothing but the day and
    whatever the person chose to note. */
interface ArchiveTaperSession extends ArchiveStamped {
  id: string;
  epochDay: number;
  note: string;
}

interface ArchiveSideEffect extends ArchiveStamped {
  id: string;
  name: string;
  severity: number | null;
  epochDay: number;
  /** Absent in an archive written, which reads as ongoing. */
  resolvedEpochDay?: number | null;
}

interface ArchiveCycleEvent extends ArchiveStamped {
  id: string;
  kind: string;
  epochDay: number;
}

/** A time-capsule letter, sealed until `unlockEpochDay`
    - never stored as a `sealed` flag, the same reasoning ArchiveMilestone
    carries no `kind`. */
interface ArchiveLetter extends ArchiveStamped {
  id: string;
  epochDay: number;
  text: string;
  unlockEpochDay: number;
}

/** A practice take, sealed until the day after
    `epochDay` the same way a letter is sealed until its own unlock day -
    never stored as a `sealed` flag, and here not even as the unlock day
    itself, which types.ts's own comment gives the ADR-0010 reason for. */
interface ArchiveVoicePracticeTake extends ArchiveStamped {
  id: string;
  epochDay: number;
  minHz: number;
  maxHz: number;
  medianHz: number;
  feltSense: number | null;
}

/** One bundled transition-roadmap goal with a status recorded at all, named by its pack and
    its goal key rather than a uuid - both strings mean the same thing on every device, so
    two installs that recorded the same goal recorded the same goal (ADR-0002). An unchecked
    visible goal travels as absence. A hidden unchecked goal carries a row so its visibility
    survives restore. */
export interface ArchiveRoadmapCheck extends ArchiveStamped {
  packKey: string;
  goalKey: string;
  status: string;
  /** Absent in archives written before individual goal visibility. */
  hidden?: boolean;
}

/** A user-authored roadmap goal, named by its own
    uuid like any other user-owned row - unlike ArchiveRoadmapCheck, it
    carries data of its own (a track and its text) rather than naming
    bundled content, so it travels whether or not it is checked. */
/** A category the person made on the roadmap,
    named by its own uuid like any other user-owned row. */
interface ArchiveRoadmapCategory extends ArchiveStamped {
  id: string;
  name: string;
}

/** An institution the person added to the roadmap's list of name and
    document changes, by its own uuid. */
interface ArchiveRoadmapInstitution extends ArchiveStamped {
  id: string;
  name: string;
}

/** One dated change at an institution.
    `institution` is a built-in key or an added institution's uuid. */
interface ArchiveRoadmapInstitutionChange extends ArchiveStamped {
  id: string;
  institution: string;
  status: string;
  epochDay: number;
  note: string | null;
}

interface ArchiveRoadmapGoal extends ArchiveStamped {
  id: string;
  track: string;
  text: string;
  status: string;
}

/** One line of a checklist, named by its own uuid like
    any other user-owned row - unlike ArchiveRoadmapCheck, an item carries
    data of its own rather than naming bundled content. */
export interface ArchiveChecklistItem extends ArchiveStamped {
  id: string;
  content: string;
  checked: boolean;
  carriedForward: boolean;
}

/** A checklist, standalone or scoped to an owner record. `ownerKind`/`ownerId` travel as a
    pair, both present or both absent, the same nullable pairing the row itself keeps
    (schema.ts) - there is no owner table to resolve either against yet.

    `appointmentEpochDay` was the standalone checklist's own date, retired and its column
    dropped by schema v119. It stays in the shape, always written null and ignored on read,
    so an archive from before still restores and one written now still reads on an older
    build. */
export interface ArchiveChecklist extends ArchiveStamped {
  id: string;
  ownerKind: string | null;
  ownerId: string | null;
  appointmentEpochDay: number | null;
  items: ArchiveChecklistItem[];
}

/** One dated recovery photo. Nested under its procedure
    rather than a top-level section, the way ArchiveHairRemovalPhoto is
    nested under its session: a recovery photo belongs to exactly one
    procedure, so it travels with the procedure that owns it. Unlike that
    one it keeps its own `epochDay` - the procedure's surgery date says when
    the operation was, not when the picture was taken. */
export interface ArchiveProcedurePhoto extends ArchiveStamped {
  id: string;
  epochDay: number;
  fileName: string;
}

/** One procedure and its recovery log. `surgeryEpochDay` is null for a procedure with no
    date set yet. The recovery checklist is not here: it is an ordinary `checklist` row
    carrying this procedure's id as its owner, so it travels in the `checklists` section.
    Neither section has to apply before the other - an owner pair is matched by uuid, not
    resolved to a rowid.

    Consults became appointments, and travel in the `appointments` section naming this
    procedure.

    `kind` and `dilationOptIn` are. Both are optional only so an archive written in older
    versions parses - applying one reads an absent `kind` as `custom` and an absent
    `dilationOptIn` as false, the same defaults `upsertProcedure` gives a write that names
    neither. */
export interface ArchiveProcedure extends ArchiveCostFields, ArchiveStamped {
  id: string;
  name: string;
  surgeryEpochDay: number | null;
  notes: string;
  photos: ArchiveProcedurePhoto[];
  kind?: ProcedureKind;
  dilationOptIn?: boolean;
  /** Absent on archives written; those procedures remain ongoing rather than being
      classified from their age. */
  archived?: boolean;
}

/** One appointment (ADR-0066). Its own section
    rather than nested under a procedure the way a consult was: most
    appointments belong to no procedure at all, and `procedureId` is the
    link, carried as the procedure's travelling uuid so the applying device
    resolves it against its own rowids.

    Waiting lists: `epochDay` is null while the
    appointment waits for a day, `referredEpochDay` is the day it was
    referred on, and `statuses` are its dated updates, nested the way a
    procedure's photos are because each belongs to exactly one appointment.
    Both are optional only so an archive written before the ticket parses;
    applying one reads them as null and none. */
export interface ArchiveAppointment extends ArchiveCostFields, ArchiveStamped {
  id: string;
  epochDay: number | null;
  procedureId: string | null;
  kind: string | null;
  place: string | null;
  note: string | null;
  referredEpochDay?: number | null;
  statuses?: ArchiveAppointmentStatus[];
  /** `HH:MM`, or null. Optional so an archive
      written before the ticket parses; it reads as no time. */
  time?: string | null;
  /** The provider's travelling uuid, resolved against the `providers`
      section on apply, the way `procedureId` is. Optional for the same
      reason as `time`. */
  providerId?: string | null;
}

/** The person's own notes on somebody they see. `competence` is a key ('good', 'mixed', 'poor'); one this build does
    not know reads as not said. */
interface ArchiveProvider extends ArchiveStamped {
  id: string;
  name: string;
  contact: string | null;
  competence: string | null;
  impressions: string | null;
}

/** One dated update on an appointment's wait. */
export interface ArchiveAppointmentStatus extends ArchiveStamped {
  id: string;
  epochDay: number;
  status: string;
}

/** A "first noticed" marker against the open effect catalogue. `effect` was already
    loosened from PersonalEffectType to a plain string before that type itself opened up
    (the schema carries no CHECK to enforce it on the way back in); restore.ts now validates
    against ArchivePersonalEffectType rows carried in the same journal instead. */
interface ArchivePersonalEffect extends ArchiveStamped {
  id: string;
  effect: string;
  firstNoticedEpochDay: number;
}

export interface ArchiveEffectCategory extends ArchiveStamped {
  key: string;
  name: string;
  enabled: boolean;
}

export interface ArchivePersonalEffectType extends ArchiveStamped {
  key: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
  categoryKey: string | null;
  direction: EffectDirection | null;
}

/** One progress photo: dated in its own
    right, with the pose it was taken in. `pose` is plain
    text on the wire, as in the table: a pose this build does not know reads
    as front (progressPhotos.ts). */
export interface ArchiveProgressPhoto extends ArchiveStamped {
  id: string;
  epochDay: number;
  pose: string;
  fileName: string;
}

/** A progress photo pose: a built-in by key, renamed or hidden, or the person's own by
    uuid. The shape of ArchiveBodyRegion. An archive written before 122 has no such section,
    and restore reads it as empty: the built-ins stay as reconciled. */
export interface ArchiveProgressPose extends ArchiveStamped {
  id: string;
  name: string;
  builtIn: boolean;
  hidden: boolean;
}

/** One hair-removal session photo. Nested under its
    session rather than a top-level section, the way `ArchiveChecklistItem`
    is nested under its checklist: a session photo belongs to exactly one
    session, so it travels with the session that owns it. It carries no
    date of its own - the session's `epochDay` is enough. */
export interface ArchiveHairRemovalPhoto extends ArchiveStamped {
  id: string;
  fileName: string;
}

/** One electrolysis/laser session. `area` and `method`
    are loosened from their literal-union/closed-set typings, the way
    ArchiveMeasurement loosens `type`:
    the schema's CHECK enforces both on the way back in (restore.ts), not
    this boundary type. */
export interface ArchiveHairRemovalSession extends ArchiveCostFields, ArchiveStamped {
  id: string;
  epochDay: number;
  area: string;
  method: string;
  painRating: number | null;
  /** Absent in an archive written, which reads as no length. */
  minutes?: number | null;
  /** The free-text cost an archive written carries. Never written now; restore reads it by
      cost.ts's rule into the cost fields, or into `note` where it does not parse. */
  cost?: string;
  provider: string;
  photos: ArchiveHairRemovalPhoto[];
  /** The person's own words on the session, or null. */
  note?: string | null;
}

/* An archive written also carries a `type`; nothing reads it now, and restore ignores it. */
interface ArchiveReminder extends ArchiveStamped {
  id: string;
  title: string;
  time: string;
  recurrence: string | null;
  interval: number | null;
  anchorEpochDay: number | null;
  epochDay: number | null;
  enabled: boolean;
  /** Which feature manages this reminder, e.g. `stock:estradiol valerate`. Null for a
      reminder a person created themselves. Travels so restoring a device's own backup keeps
      that device's own hand-off state - see the coalescing note at applyReminders. */
  autoSource: string | null;
  /** The drug a medication reminder is for.
      Absent from an archive written before that ticket, which restores it
      as null. */
  drug?: string | null;
}

interface ArchiveRegimenEpisode extends ArchiveStamped {
  id: string;
  drug: string;
  /** HRT or another drug. Absent on an archive
      from before the field existed, which a restore infers from `drug` by
      the rule the migration uses (drugClass.ts). */
  drugClass: DrugClass;
  ester: string | null;
  dose: number;
  doseUnit: string;
  route: string;
  interval: string;
  startEpochDay: number;
  /** Nullable: still ongoing. Absent on an archive from
      before this field existed, which restore.ts reads as null the same
      way it already reads any other field a pre-ticket build never wrote. */
  endEpochDay: number | null;
  /** Why the episode ended. Absent the same way
      endEpochDay is on an archive from before this field existed, read back
      as null - no reason recorded, which is exactly what a pre-ticket
      ended episode has. */
  endReason: EpisodeEndReason | null;
  /** Put away (after-release 07). Absent on an archive from before the
      field existed, which a restore writes as shown. */
  hidden: boolean;
}

/* Flat and nullable, the way ArchiveReminder carries its recurrence
   variants, rather than a union on route the way the domain type is
   (types.ts). A transport shape that never changes arms is one an older
   build can still parse field by field, and mapping it back to the union is
   the dose area's job either way (doses.ts). Person-logged doses resolve their
   episode from their timestamp. Newly
   automatic rows also carry the episode/day/index of the slot that wrote
   them, so changing device zones cannot write the same slot again. */
interface ArchiveDoseEvent extends ArchiveStamped {
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
      null. Absent on an archive from before this field
      existed, read as null the same way any other field a pre-ticket
      build never wrote is. */
  drug: string | null;
  /** Who wrote the row - 'person' or 'schedule' (ADR-0086). Absent on an archive from before auto-logging existed, read
      back as 'person', which is what every row in one was. */
  source: string;
  /** Automatic-slot provenance, absent in released format-2 Archives. */
  autoLogEpisodeId?: string | null;
  autoLogEpochDay?: number | null;
  autoLogIndex?: number | null;
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
export interface ArchiveDoseSchedule extends ArchiveStamped {
  id: string;
  episodeId: string;
  recurrenceKind: string;
  everyNDays: number | null;
  weekdays: number[] | null;
  dosesPerDay: number;
  doseAmounts: { dose: number; doseUnit: string }[] | null;
  /** The day auto-logging went on, or null for off (ADR-0086). Absent on an archive from before the switch existed, read
      back as null, which is off - importing a journal must never start
      writing doses on the person's behalf without them saying so. */
  autoLogFromEpochDay: number | null;
}

export interface ArchiveDosePause extends ArchiveStamped {
  id: string;
  episodeId: string;
  startEpochDay: number;
  endEpochDay: number | null;
  reason: string;
}

/** One dated tryout photo. Nested under its tryout
    rather than a top-level section, the way ArchiveProcedurePhoto is
    nested under its procedure, and for the same reason: it carries its
    own `epochDay` because when during the tryout it was taken is the
    whole point of it, unlike the tryout's own dates. */
export interface ArchiveTryoutPhoto extends ArchiveStamped {
  id: string;
  epochDay: number;
  fileName: string;
}

/** Something being tried out. No "current" flag: several can travel with overlapping or
    long-closed ranges, and nothing here may single one out. `kind` is loosened from
    TryoutKind, the way ArchiveMeasurement loosens `type`: the schema's CHECK enforces it on
    the way back in (restore.ts), not this boundary type. */
export interface ArchiveTryout extends ArchiveStamped {
  id: string;
  kind: string;
  label: string;
  description: string | null;
  startEpochDay: number;
  endEpochDay: number | null;
  photos: ArchiveTryoutPhoto[];
}

/** One point in a tryout's felt-sense history, named by the tryout's own travelling uuid
    rather than its rowid, which means nothing on the device importing this (ADR-0002). let
    a milestone own readings too; cut them, and an older archive's milestone readings are
    dropped on restore (restore.ts). */
export interface ArchiveFeltSenseEntry extends ArchiveStamped {
  id: string;
  tryoutId: string;
  epochDay: number;
  mood: number;
  note: string | null;
}

/** A margin note, named by its entry's own travelling uuid rather than its rowid, the same
    rule `ArchiveFeltSenseEntry`'s owner fields follow - nothing on the device importing
    this knows a rowid it did not mint (ADR-0002). Exactly one owner, unlike a felt-sense
    entry's two: a margin note always belongs to an entry, so there is nothing to make
    optional. */
export interface ArchiveMarginNote extends ArchiveStamped {
  id: string;
  entryId: string;
  epochDay: number;
  text: string;
}

/** One piece of paper the person keeps (ADR-0065). Its own interface rather than a reused
    ArchivePhoto, for the reason this file's header gives: a rename on one must not silently
    change what the other travels as. It carries a day and a title of its own, which a photo
    does not - a document is a record, not content hanging off one.

    ADR-0065's optional link to a goal, a milestone, a procedure or an episode is and is not
    on the wire yet. */
interface ArchiveDocument extends ArchiveStamped {
  id: string;
  epochDay: number;
  title: string;
  /** The opaque `<uuid>.jpg` of photos/names.ts, whose bytes travel in the
      archive's file manifest beside the photos. Never a path. */
  fileName: string;
  /** The document's link (ADR-0065), both null or both set - a
      plain uuid for three of the four kinds, and for 'goal' either a
      pack-and-key string or a custom goal's own uuid. No rowid to resolve:
      it travels as given and can dangle, which is the point (a document
      outlives the thing it was filed under). Absent on an archive written
      before this ticket, read as null (archiveSections.ts). */
  targetKind: DocumentTargetKind | null;
  targetId: string | null;
}

/** What a person last reported having of one drug, plus box 4's reminder
    hand-off bookkeeping. Not the projection over it -
    that is derived from the dose log, and the importing device has its
    own (CONTEXT: pending, stockProjection.ts). */
interface ArchiveMedicationStock extends ArchiveCostFields, ArchiveStamped {
  id: string;
  drug: string;
  quantity: number;
  unit: string;
  recordedEpochDay: number;
  reminderEverCreated: boolean;
  reminderDismissed: boolean;
  /** "what is open, and until when". Absent on an archive written in older versions, which
      is what the flat table's own `whenAbsent: null` (archiveSections.ts) is for. */
  openedEpochDay: number | null;
  inUseWindowDays: number | null;
  inUseEndEpochDay: number | null;
  /** How many days a restock takes. Absent on an archive written before this ticket, read
      as null the same way. */
  leadTimeDays: number | null;
  /** Doses one unit holds. Absent on an archive
      written before it, read as null the same way. */
  dosesPerUnit: number | null;
  /** Absent on an archive written before it, read as null the same way. */
  expiryEpochDay: number | null;
  pharmacyNote: string | null;
}

/** A wear session as it travels. No reminder-handoff
    bookkeeping the way ArchiveMedicationStock carries: the reminder itself
    travels as an ordinary ArchiveReminder, carrying this session's own
    auto_source marker, and is matched back up by that marker on import - a
    session has nothing of its own to record about the handoff. */
interface ArchiveWearSession extends ArchiveStamped {
  id: string;
  kind: WearKind;
  startTimestamp: number;
  durationMs: number | null;
  note: string | null;
}

/** One completed import, named by its own uuid. Answers
    "where did this come from" at the granularity it is actually asked at -
    which source, when, and what it added - rather than a per-row marker
    kept forever on every table an import can reach. `counts` is by kind
    (`{ entries: 12, tags: 3 }`) rather than a list of row ids, because the
    question is never "which of these fourteen". Written once, on commit,
    never on a preview or a failed import, and never edited afterwards - so
    unlike most of this file's records it carries no update path, only an
    insert. */
export interface ArchiveImportLogRecord extends ArchiveStamped {
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
interface ArchiveAreaState extends ArchiveStamped {
  area: string;
  hidden: boolean;
  finishedEpochDay: number | null;
  /** The day this area was paused, or null while it is active or finished.
      Only `hairRemovalSessions`,
      `voiceBenchmarks` and `voicePracticeTakes` carry one today
      (`SUSPENDABLE_AREAS`, areaState.ts). */
  suspendedEpochDay: number | null;
}

/** Everything the journal holds (CONTEXT: "Journal"). */
export interface ArchiveJournal {
  dimensions: ArchiveDimension[];
  presets: ArchivePreset[];
  tagGroups: ArchiveTagGroup[];
  bodyRegions: ArchiveBodyRegion[];
  entries: ArchiveEntry[];
  milestones: ArchiveMilestone[];
  labResults: ArchiveLabResult[];
  taper: ArchiveTaper[];
  taperSessions: ArchiveTaperSession[];
  sideEffects: ArchiveSideEffect[];
  cycleEvents: ArchiveCycleEvent[];
  eras: ArchiveEra[];
  eraMutes: ArchiveEraMute[];
  personalEffects: ArchivePersonalEffect[];
  effectCategories: ArchiveEffectCategory[];
  personalEffectTypes: ArchivePersonalEffectType[];
  progressPhotos: ArchiveProgressPhoto[];
  progressPoses: ArchiveProgressPose[];
  hairRemovalSessions: ArchiveHairRemovalSession[];
  procedures: ArchiveProcedure[];
  providers: ArchiveProvider[];
  appointments: ArchiveAppointment[];
  reminders: ArchiveReminder[];
  letters: ArchiveLetter[];
  voicePracticeTakes: ArchiveVoicePracticeTake[];
  roadmapChecks: ArchiveRoadmapCheck[];
  roadmapCategories: ArchiveRoadmapCategory[];
  roadmapGoals: ArchiveRoadmapGoal[];
  roadmapInstitutions: ArchiveRoadmapInstitution[];
  roadmapInstitutionChanges: ArchiveRoadmapInstitutionChange[];
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
  comfortItems: ArchiveComfortItem[];
  importLog: ArchiveImportLogRecord[];
  areaStates: ArchiveAreaState[];
  marginNotes: ArchiveMarginNote[];
  documents: ArchiveDocument[];
  /** Absent on an archive written before it, read as none. */
  deletions: ArchiveDeletion[];
}

/** A named stretch of the person's timeline (ADR-0049). Both bounds travel as null when
    they are open, which is the whole of what an open bound is: the clamp a surface applies
    to read it as two concrete dates is computed against the importing journal's own data
    and is never written down (ADR-0010), so an archive restored onto a device with a
    different first entry resolves "before I knew" against that device rather than against
    the one it was exported from. */
interface ArchiveEra extends ArchiveStamped {
  id: string;
  name: string;
  startEpochDay: number | null;
  endEpochDay: number | null;
}

/** Which eras are muted from resurfacing (ADR-0049). A uuid an importing device has no era
    for names nothing there either, the same resting state it is on the device it travelled
    from - nothing here resolves it against `ArchiveEra`, so an archive can carry a mute for
    an era trimmed by a merge on the far side without either device having to reconcile
    that. */
interface ArchiveEraMute extends ArchiveStamped {
  eraUuid: string;
}

/** One line of the person's own comfort list. `position` travels explicitly rather than
    being inferred from array order, the same as any other flat area with a person-set
    order. */
interface ArchiveComfortItem extends ArchiveStamped {
  id: string;
  text: string;
  position: number;
}

/** A named presentation (ADR-0048). No `builtIn` flag: unlike ArchiveTag or
    ArchiveGenderDimension it ships nothing seeded, so every row travels the same way.
    `roleIndex` is an index into the active flag's roles (theme/roles.ts), never a colour of
    its own - the same reason ArchiveMilestone carries no rendered label. */
interface ArchivePresentation extends ArchiveStamped {
  id: string;
  name: string;
  roleIndex: number;
  hidden: boolean;
}

/** A standardized voice take. Its two audio files travel in the body like a recording's,
    named by the same opaque `<uuid>.webm`; the vowel half is absent on a take that skipped
    or failed that step, and its three figures with it. */
interface ArchiveVoiceBenchmark extends ArchiveStamped {
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
  /** The downsampled pitch track, absent on an
      archive written before it and on any take from before schema v58. */
  pitchTrack: string | null;
  /** What recorded it (audio/captureChain.ts). It travels because a restored benchmark that
      lost its chain would silently rejoin a series it does not belong to. */
  captureChain: string | null;
  /** The corner-vowel scaling factor (audio/vowelScale.ts), absent on an archive written
      before it and null on any take that held fewer than two of the three vowels. */
  resonanceScale: number | null;
}

/** A photo file travelling in the body, and how many bytes of it there
    are. The lengths are what let the body be cut into files again, and
    what let the chunk count be worked out before anything is encrypted. */
export interface ArchiveFile {
  name: string;
  length: number;
}

export interface ArchivePayload {
  /** Informational provenance. Archives written before this field still read. */
  writer?: { app: string; schema: number };
  journal: ArchiveJournal;
  preferences: PortablePreferences;
  /** In body order. */
  files: ArchiveFile[];
}

/** Brings a payload written at one version up to the next one. */
type PayloadMigration = (payload: ArchivePayload) => ArchivePayload;

/** The shape a v1 archive's preferences had where they now hold a list of
    ticked scales: one preset key, which the app resolved to a dimension
    list at read time. */
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
  const { activePreset, ...rest } = (payload.preferences ?? {}) as PortablePreferences & PreferencesV1;
  if (activePreset === undefined) return payload;

  const carried = payload.journal.presets?.find((preset) => preset.id === activePreset);
  const builtIn = BUILT_IN_PRESETS.find((preset) => preset.key === activePreset);
  const dims = carried?.dims ?? builtIn?.dims;

  return {
    ...payload,
    preferences: { ...rest, activeScales: dims ? [...dims] : [...PREFERENCE_DEFAULTS.activeScales] }
  };
};

/** The published alpha wrote v1 with seven sections. Later pre-release
    additions did not change that format number. Recognise that original
    shape only; malformed present sections and partial newer shapes still
    reach the restore guards unchanged. */
const alphaSections = ['dimensions', 'presets', 'tagGroups', 'entries', 'milestones', 'labResults', 'reminders'] as const;
const postAlphaSections = [
  'presentations',
  'bodyRegions',
  'marginNotes',
  'documents',
  'taper',
  'taperSessions',
  'sideEffects',
  'cycleEvents',
  'eras',
  'eraMutes',
  'effectCategories',
  'personalEffectTypes',
  'personalEffects',
  'progressPhotos',
  'progressPoses',
  'hairRemovalSessions',
  'procedures',
  'appointments',
  'letters',
  'voicePracticeTakes',
  'roadmapChecks',
  'roadmapCategories',
  'roadmapGoals',
  'roadmapInstitutions',
  'roadmapInstitutionChanges',
  'regimenEpisodes',
  'doseEvents',
  'doseSchedules',
  'dosePauses',
  'medicationStock',
  'tryouts',
  'feltSenseEntries',
  'checklists',
  'wearSessions',
  'voiceBenchmarks',
  'comfortItems',
  'areaStates',
  'importLog',
  'deletions',
] as const satisfies readonly (keyof ArchiveJournal)[];

const alphaBecomesCompleteJournal: PayloadMigration = (payload) => {
  const journal = payload.journal;
  if (!alphaSections.every((name) => Array.isArray(journal?.[name])) ||
      postAlphaSections.some((name) => Object.prototype.hasOwnProperty.call(journal, name))) return payload;
  const complete = { ...journal };
  for (const name of postAlphaSections) complete[name] = [];
  return { ...payload, journal: complete };
};

/** Step i migrates a payload written at format version i + 1. Appending here
    is what a format change costs, and the ladder below then walks it. */
export const PAYLOAD_MIGRATIONS: readonly PayloadMigration[] = [(payload) => alphaBecomesCompleteJournal(presetBecomesTickedScales(payload))];

/** Walks the version ladder one step at a time, so a v1 archive opened by
    a build on v4 goes through every shape in between rather than needing a
    direct v1 to v4 step nobody would remember to write.

    Exported with its inputs spelled out so the walk can be tested with
    steps of its own; the codec supplies the target format version. */
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

/* migratePayload stays exported only for its own test (AU-09 test-only
   review). */
export const migratePayload = (payload: ArchivePayload, fromVersion: number, toVersion: number): ArchivePayload =>
  applyMigrations(payload, fromVersion, toVersion, PAYLOAD_MIGRATIONS);

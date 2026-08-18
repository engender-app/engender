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

import { PORTABLE_KEYS, type PreferenceValues } from '../prefs/catalogue';
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
  /** By body-region key (bodyMap.ts). Free-standing TEXT, not a row to
      resolve against a built-in table, so restore.ts writes it back
      unvalidated - the same forward-compatible treatment lab_result.analyte
      already gets. */
  bodyRegions: Record<string, number>;
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

export interface ArchiveMilestone {
  id: string;
  name: string;
  epochDay: number;
  templateKey: string | null;
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
  /** Loosened from Measurement['type'], the way ArchiveReminder loosens
      `type` and `recurrence`: the schema's CHECK is what enforces this on
      the way back in (restore.ts), not this boundary type. */
  type: string;
  epochDay: number;
  value: number;
  unit: string;
}

export interface ArchiveTallyEvent {
  id: string;
  epochDay: number;
  kind: string;
  context: string;
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
  hidden: boolean;
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
}

/** Named by the episode's travelling uuid, not its rowid: the rowid means
    nothing on the device importing this (ADR-0002). */
export interface ArchiveDoseSchedule {
  id: string;
  episodeId: string;
  everyNDays: number;
  dosesPerDay: number;
}

export interface ArchiveDosePause {
  id: string;
  episodeId: string;
  startEpochDay: number;
  endEpochDay: number | null;
  reason: string;
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

/** Everything the journal holds (CONTEXT: "Journal"). */
export interface ArchiveJournal {
  dimensions: ArchiveDimension[];
  presets: ArchivePreset[];
  tagGroups: ArchiveTagGroup[];
  entries: ArchiveEntry[];
  milestones: ArchiveMilestone[];
  labResults: ArchiveLabResult[];
  measurements: ArchiveMeasurement[];
  reminders: ArchiveReminder[];
  tallyEvents: ArchiveTallyEvent[];
  regimenEpisodes: ArchiveRegimenEpisode[];
  doseEvents: ArchiveDoseEvent[];
  doseSchedules: ArchiveDoseSchedule[];
  dosePauses: ArchiveDosePause[];
  medicationStock: ArchiveMedicationStock[];
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

/** Step i migrates a payload written at format version i + 1. Empty while
    version 1 is the only version there has ever been; appending here is
    what a format change costs, and the ladder below then walks it. */
export const PAYLOAD_MIGRATIONS: readonly PayloadMigration[] = [];

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

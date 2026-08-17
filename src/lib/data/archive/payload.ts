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

export interface ArchiveLabResult {
  id: string;
  epochDay: number;
  analyte: string;
  value: number;
  unit: string;
  note: string;
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

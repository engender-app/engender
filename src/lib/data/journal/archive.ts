/* The archive area (ticket 13, PRD F14): everything the journal holds, in
   the shape an archive carries it (archive/payload.ts).

   It reads rows itself rather than calling the other areas' getters, for
   two reasons. Identity: every row travels by key or uuid, and the entries
   area addresses entries by the rowid that means nothing on another device
   (ADR-0002). Volume: the screens read a day or a list at a time and can
   afford a query per entry for its dimensions, tags and photos; an export
   reads every entry there has ever been, so each of those becomes one
   query for the whole journal, grouped here.

   Photo bytes stay out of the snapshot. It names the files and how long
   each one is - which is what lets the chunk count be settled before
   anything is encrypted (ADR-0007) - and hands back a reader for one file
   at a time, so nothing ever holds the photo set at once.

   Ticket 14's Replace and Merge are the other half of this area, one
   journal operation each. They live in restore.ts: the two halves share
   nothing but the wire format, and the ordering rule an import turns on
   (ADR-0011) is long enough to be worth reading on its own. */

import { filesOf } from '../photos/names';
import { restoreArchive, type RestoreContents } from './restore';
import {
  daylioPreview,
  type DaylioCommitResult,
  type DaylioNaming,
  type DaylioPreview
} from '../archive/daylio';
import type {
  ArchiveDimension,
  ArchiveEntry,
  ArchiveFile,
  ArchiveJournal,
  ArchiveCounterevidenceSnapshot,
  ArchiveDoseEvent,
  ArchiveDosePause,
  ArchiveDoseSchedule,
  ArchiveDoubtEntry,
  ArchiveHairPhoto,
  ArchiveHairStage,
  ArchiveLabResult,
  ArchiveMeasurement,
  ArchiveMedicationStock,
  ArchiveMilestone,
  ArchivePersonalEffect,
  ArchivePhoto,
  ArchivePreset,
  ArchiveRegimenEpisode,
  ArchiveReminder,
  ArchiveSideEffect,
  ArchiveTag,
  ArchiveTagGroup,
  ArchiveTallyEvent
} from '../archive/payload';
import type { SqliteDriver } from '../sqlite/driver';
import type { PhotoFileStore } from './journal';
import { bool, domainIdOf } from './support';

export interface ArchiveSnapshot {
  journal: ArchiveJournal;
  /** Every photo file the snapshot's rows name and the store actually
      holds, thumbnails included, in body order. */
  files: ArchiveFile[];
  /** The bytes of one file named in `files`. */
  readFile(name: string): Promise<Uint8Array>;
  /** Optional batched read. Results align with `names`; null means missing. */
  readFiles?(names: string[]): Promise<(Uint8Array | null)[]>;
}

export interface ArchiveArea {
  snapshot(): Promise<ArchiveSnapshot>;
  /** Parses and resolves a Daylio CSV without writing. Counts are net
      additions, so they are the counts commit reports (PRD F28). */
  previewDaylioImport(csv: string, naming: DaylioNaming): Promise<DaylioPreview>;
  /** Always Merge. An unmapped mood is refused before restore sees a row. */
  commitDaylioImport(preview: DaylioPreview): Promise<DaylioCommitResult>;
  /** Discards this device's journal and installs the archive's, keeping the
      built-in vocabulary by key and leaving preferences alone (ADR-0011).
      One operation: the order it happens in is not a caller's to compose. */
  replace(contents: RestoreContents): Promise<void>;
  /** Adds what this device does not have and leaves matched rows alone, so
      importing the same archive twice is a no-op the second time. */
  merge(contents: RestoreContents): Promise<void>;
}

type PhotoRow = { uuid: string; file_path: string; entry_id: number | null; milestone_id: number | null };

/** Groups joined rows by their owner, keeping the order the query returned
    them in - which is `order_index` wherever order is a thing the user
    sees. */
function groupBy<Row, Value>(rows: Row[], key: (row: Row) => number, value: (row: Row) => Value): Map<number, Value[]> {
  const grouped = new Map<number, Value[]>();
  for (const row of rows) {
    const owner = grouped.get(key(row));
    if (owner) owner.push(value(row));
    else grouped.set(key(row), [value(row)]);
  }
  return grouped;
}

const toArchivePhoto = (row: PhotoRow): ArchivePhoto => ({ id: row.uuid, fileName: row.file_path });

export function makeArchiveArea(driver: SqliteDriver, files: PhotoFileStore): ArchiveArea {
  const dimensions = async (): Promise<ArchiveDimension[]> => {
    const rows = await driver.query<{
      key: string;
      name: string;
      low_label: string;
      high_label: string;
      min_value: number;
      max_value: number;
      is_built_in: number;
      hidden: number;
    }>(
      `SELECT key, name, low_label, high_label, min_value, max_value, is_built_in, hidden
       FROM gender_dimension ORDER BY id`
    );
    return rows.map((r) => ({
      key: r.key,
      name: r.name,
      low: r.low_label,
      high: r.high_label,
      min: r.min_value,
      max: r.max_value,
      builtIn: bool(r.is_built_in),
      hidden: bool(r.hidden)
    }));
  };

  const presets = async (): Promise<ArchivePreset[]> => {
    const rows = await driver.query<{ id: number; uuid: string | null; key: string | null; name: string; is_built_in: number }>(
      'SELECT id, uuid, key, name, is_built_in FROM gender_preset ORDER BY id'
    );
    const links = await driver.query<{ preset_id: number; key: string }>(
      `SELECT pd.preset_id, gd.key FROM preset_dimension pd
       JOIN gender_dimension gd ON gd.id = pd.dimension_id
       ORDER BY pd.order_index, gd.id`
    );
    const dims = groupBy(links, (l) => l.preset_id, (l) => l.key);
    return rows.map((r) => ({
      id: domainIdOf(r, 'preset'),
      name: r.name,
      builtIn: bool(r.is_built_in),
      dims: dims.get(r.id) ?? []
    }));
  };

  const tagGroups = async (): Promise<ArchiveTagGroup[]> => {
    const groups = await driver.query<{ id: number; uuid: string | null; key: string; name: string; enabled: number }>(
      'SELECT id, uuid, key, name, enabled FROM tag_group ORDER BY order_index, id'
    );
    const tags = await driver.query<{ group_id: number; uuid: string | null; key: string | null; label: string; hidden: number }>(
      'SELECT group_id, uuid, key, label, hidden FROM tag ORDER BY order_index, id'
    );
    const byGroup = groupBy(
      tags,
      (t) => t.group_id,
      (t): ArchiveTag => ({ id: domainIdOf(t, 'tag'), label: t.label, builtIn: t.key !== null, hidden: bool(t.hidden) })
    );
    return groups.map((g) => ({
      key: g.key,
      name: g.name,
      enabled: bool(g.enabled),
      // A custom group's key is its own minted uuid (tags.ts), so what
      // makes it custom is having a uuid at all, not the two differing.
      builtIn: g.uuid === null,
      tags: byGroup.get(g.id) ?? []
    }));
  };

  const entries = async (photos: PhotoRow[]): Promise<ArchiveEntry[]> => {
    const rows = await driver.query<{
      id: number;
      uuid: string;
      epoch_day: number;
      timestamp: number;
      mood: number | null;
      note: string | null;
    }>('SELECT id, uuid, epoch_day, timestamp, mood, note FROM entry ORDER BY epoch_day, timestamp, id');

    const dimensionValues = await driver.query<{ entry_id: number; key: string; value: number }>(
      `SELECT edv.entry_id, gd.key, edv.value FROM entry_dimension_value edv
       JOIN gender_dimension gd ON gd.id = edv.dimension_id ORDER BY edv.entry_id, gd.id`
    );
    const tagLinks = await driver.query<{ entry_id: number; key: string | null; uuid: string | null }>(
      `SELECT et.entry_id, t.key, t.uuid FROM entry_tag et
       JOIN tag t ON t.id = et.tag_id ORDER BY et.entry_id, t.id`
    );
    const bodyRegionValues = await driver.query<{ entry_id: number; region: string; intensity: number }>(
      'SELECT entry_id, region, intensity FROM entry_body_region ORDER BY entry_id, region'
    );

    const dims = groupBy(dimensionValues, (v) => v.entry_id, (v) => [v.key, v.value] as const);
    const tags = groupBy(tagLinks, (t) => t.entry_id, (t) => domainIdOf(t, 'tag'));
    const bodyRegions = groupBy(bodyRegionValues, (v) => v.entry_id, (v) => [v.region, v.intensity] as const);
    const byEntry = groupBy(photos.filter((p) => p.entry_id !== null), (p) => p.entry_id!, toArchivePhoto);

    return rows.map((r) => ({
      uuid: r.uuid,
      epochDay: r.epoch_day,
      timestamp: r.timestamp,
      mood: r.mood,
      note: r.note ?? '',
      dims: Object.fromEntries(dims.get(r.id) ?? []),
      tags: tags.get(r.id) ?? [],
      photos: byEntry.get(r.id) ?? [],
      bodyRegions: Object.fromEntries(bodyRegions.get(r.id) ?? [])
    }));
  };

  const milestones = async (photos: PhotoRow[]): Promise<ArchiveMilestone[]> => {
    const rows = await driver.query<{ id: number; uuid: string; name: string; epoch_day: number; template_key: string | null }>(
      'SELECT id, uuid, name, epoch_day, template_key FROM milestone ORDER BY epoch_day, id'
    );
    const byMilestone = groupBy(photos.filter((p) => p.milestone_id !== null), (p) => p.milestone_id!, toArchivePhoto);
    return rows.map((r) => ({
      id: r.uuid,
      name: r.name,
      epochDay: r.epoch_day,
      templateKey: r.template_key,
      // A milestone shows one photo; a second row for the same one would
      // be a bug elsewhere, and the earliest wins rather than throwing -
      // the same rule the milestones area reads by.
      photo: byMilestone.get(r.id)?.[0] ?? null
    }));
  };

  const labResults = async (): Promise<ArchiveLabResult[]> => {
    const rows = await driver.query<{
      uuid: string;
      epoch_day: number;
      analyte: string;
      value: number;
      unit: string;
      note: string | null;
      draw_time: string | null;
      provider: string;
      timing_route: string | null;
      timing_hours: number | null;
      timing_day_of_interval: number | null;
    }>(
      `SELECT uuid, epoch_day, analyte, value, unit, note, draw_time, provider,
              timing_route, timing_hours, timing_day_of_interval
         FROM lab_result ORDER BY epoch_day, id`
    );
    return rows.map((r) => ({
      id: r.uuid,
      epochDay: r.epoch_day,
      analyte: r.analyte,
      value: r.value,
      unit: r.unit,
      note: r.note ?? '',
      drawTime: r.draw_time,
      provider: r.provider,
      timingRoute: r.timing_route,
      timingHours: r.timing_hours,
      timingDayOfInterval: r.timing_day_of_interval
    }));
  };

  const measurements = async (): Promise<ArchiveMeasurement[]> => {
    const rows = await driver.query<{
      uuid: string;
      type: string;
      epoch_day: number;
      value: number;
      unit: string;
    }>('SELECT uuid, type, epoch_day, value, unit FROM measurement ORDER BY epoch_day, id');
    return rows.map((r) => ({
      id: r.uuid,
      type: r.type,
      epochDay: r.epoch_day,
      value: r.value,
      unit: r.unit
    }));
  };

  const tallyEvents = async (): Promise<ArchiveTallyEvent[]> => {
    const rows = await driver.query<{ uuid: string; epoch_day: number; kind: string; context: string | null }>(
      'SELECT uuid, epoch_day, kind, context FROM tally_event ORDER BY epoch_day, id'
    );
    return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, kind: r.kind, context: r.context ?? '' }));
  };

  const sideEffects = async (): Promise<ArchiveSideEffect[]> => {
    const rows = await driver.query<{ uuid: string; name: string; severity: number; epoch_day: number }>(
      'SELECT uuid, name, severity, epoch_day FROM side_effect ORDER BY epoch_day, id'
    );
    return rows.map((r) => ({ id: r.uuid, name: r.name, severity: r.severity, epochDay: r.epoch_day }));
  };

  const doubtEntries = async (): Promise<ArchiveDoubtEntry[]> => {
    const rows = await driver.query<{ uuid: string; epoch_day: number; timestamp: number; text: string }>(
      'SELECT uuid, epoch_day, timestamp, text FROM doubt_entry ORDER BY epoch_day, timestamp, id'
    );
    return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, timestamp: r.timestamp, text: r.text }));
  };

  const counterevidenceSnapshots = async (): Promise<ArchiveCounterevidenceSnapshot[]> => {
    const rows = await driver.query<{ id: number; uuid: string; epoch_day: number; timestamp: number }>(
      'SELECT id, uuid, epoch_day, timestamp FROM doubt_snapshot ORDER BY epoch_day, timestamp, id'
    );
    const itemRows = await driver.query<{ snapshot_id: number; epoch_day: number; mood: number | null; note: string }>(
      'SELECT snapshot_id, epoch_day, mood, note FROM doubt_snapshot_entry ORDER BY snapshot_id, order_index'
    );
    const items = groupBy(
      itemRows,
      (r) => r.snapshot_id,
      (r) => ({ epochDay: r.epoch_day, mood: r.mood, note: r.note })
    );
    return rows.map((r) => ({
      id: r.uuid,
      epochDay: r.epoch_day,
      timestamp: r.timestamp,
      items: items.get(r.id) ?? []
    }));
  };

  const personalEffects = async (): Promise<ArchivePersonalEffect[]> => {
    const rows = await driver.query<{ uuid: string; effect: string; first_noticed_epoch_day: number }>(
      'SELECT uuid, effect, first_noticed_epoch_day FROM personal_effect ORDER BY effect'
    );
    return rows.map((r) => ({ id: r.uuid, effect: r.effect, firstNoticedEpochDay: r.first_noticed_epoch_day }));
  };

  const hairStages = async (): Promise<ArchiveHairStage[]> => {
    const rows = await driver.query<{ uuid: string; epoch_day: number; stage: string }>(
      'SELECT uuid, epoch_day, stage FROM hair_stage ORDER BY epoch_day, id'
    );
    return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, stage: r.stage }));
  };

  type HairPhotoRow = { uuid: string; epoch_day: number; file_path: string };

  const hairPhotoRows = (): Promise<HairPhotoRow[]> =>
    driver.query<HairPhotoRow>('SELECT uuid, epoch_day, file_path FROM hair_photo ORDER BY epoch_day, id');

  const hairPhotos = (rows: HairPhotoRow[]): ArchiveHairPhoto[] =>
    rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, fileName: r.file_path }));

  const reminders = async (): Promise<ArchiveReminder[]> => {
    const rows = await driver.query<{
      uuid: string;
      title: string;
      type: string;
      time: string;
      recurrence: string | null;
      interval: number | null;
      anchor_epoch_day: number | null;
      epoch_day: number | null;
      enabled: number;
      auto_source: string | null;
    }>(
      `SELECT uuid, title, type, time, recurrence, interval, anchor_epoch_day, epoch_day, enabled, auto_source
       FROM reminder ORDER BY id`
    );
    return rows.map((r) => ({
      id: r.uuid,
      title: r.title,
      type: r.type,
      time: r.time,
      recurrence: r.recurrence,
      interval: r.interval,
      anchorEpochDay: r.anchor_epoch_day,
      epochDay: r.epoch_day,
      enabled: bool(r.enabled),
      autoSource: r.auto_source
    }));
  };

  const medicationStock = async (): Promise<ArchiveMedicationStock[]> => {
    const rows = await driver.query<{
      uuid: string;
      drug: string;
      quantity: number;
      unit: string;
      recorded_epoch_day: number;
      reminder_ever_created: number;
      reminder_dismissed: number;
    }>(
      `SELECT uuid, drug, quantity, unit, recorded_epoch_day, reminder_ever_created, reminder_dismissed
       FROM medication_stock ORDER BY drug`
    );
    return rows.map((r) => ({
      id: r.uuid,
      drug: r.drug,
      quantity: r.quantity,
      unit: r.unit,
      recordedEpochDay: r.recorded_epoch_day,
      reminderEverCreated: bool(r.reminder_ever_created),
      reminderDismissed: bool(r.reminder_dismissed)
    }));
  };

  const regimenEpisodes = async (): Promise<ArchiveRegimenEpisode[]> => {
    const rows = await driver.query<{
      uuid: string;
      drug: string;
      ester: string | null;
      dose: number;
      dose_unit: string;
      route: string;
      interval: string;
      start_epoch_day: number;
      hidden: number;
    }>(
      `SELECT uuid, drug, ester, dose, dose_unit, route, interval, start_epoch_day, hidden
       FROM regimen_episode ORDER BY start_epoch_day, id`
    );
    return rows.map((r) => ({
      id: r.uuid,
      drug: r.drug,
      ester: r.ester,
      dose: r.dose,
      doseUnit: r.dose_unit,
      route: r.route,
      interval: r.interval,
      startEpochDay: r.start_epoch_day,
      hidden: bool(r.hidden)
    }));
  };

  const doseEvents = async (): Promise<ArchiveDoseEvent[]> => {
    const rows = await driver.query<{
      uuid: string;
      timestamp: number;
      route: string;
      dose: number;
      dose_unit: string;
      injection_site: string | null;
      vehicle: string | null;
      application_site: string | null;
      status: string;
      scheduled_dose: number | null;
      scheduled_route: string | null;
      scheduled_timestamp: number | null;
    }>(
      `SELECT uuid, timestamp, route, dose, dose_unit, injection_site, vehicle, application_site,
              status, scheduled_dose, scheduled_route, scheduled_timestamp
         FROM dose_event ORDER BY timestamp, id`
    );
    return rows.map((r) => ({
      id: r.uuid,
      timestamp: r.timestamp,
      route: r.route,
      dose: r.dose,
      doseUnit: r.dose_unit,
      injectionSite: r.injection_site,
      vehicle: r.vehicle,
      applicationSite: r.application_site,
      status: r.status,
      scheduledDose: r.scheduled_dose,
      scheduledRoute: r.scheduled_route,
      scheduledTimestamp: r.scheduled_timestamp
    }));
  };

  /* Joined to the episode rather than carrying `episode_id`: a rowid is
     this device's alone (ADR-0002), and the uuid is what the importing
     device can match an episode by. */
  const doseSchedules = async (): Promise<ArchiveDoseSchedule[]> => {
    const rows = await driver.query<{
      uuid: string;
      episode_uuid: string;
      every_n_days: number;
      doses_per_day: number;
    }>(
      `SELECT s.uuid, e.uuid AS episode_uuid, s.every_n_days, s.doses_per_day
         FROM dose_schedule s JOIN regimen_episode e ON e.id = s.episode_id
        ORDER BY s.id`
    );
    return rows.map((r) => ({
      id: r.uuid,
      episodeId: r.episode_uuid,
      everyNDays: r.every_n_days,
      dosesPerDay: r.doses_per_day
    }));
  };

  const dosePauses = async (): Promise<ArchiveDosePause[]> => {
    const rows = await driver.query<{
      uuid: string;
      episode_uuid: string;
      start_epoch_day: number;
      end_epoch_day: number | null;
      reason: string;
    }>(
      `SELECT p.uuid, e.uuid AS episode_uuid, p.start_epoch_day, p.end_epoch_day, p.reason
         FROM dose_pause p JOIN regimen_episode e ON e.id = p.episode_id
        ORDER BY p.start_epoch_day, p.id`
    );
    return rows.map((r) => ({
      id: r.uuid,
      episodeId: r.episode_uuid,
      startEpochDay: r.start_epoch_day,
      endEpochDay: r.end_epoch_day,
      reason: r.reason
    }));
  };

  /** The manifest: every file the photo and hair-photo rows name, in the
      order the rows name them, minus whatever the store no longer holds. A
      row whose file is gone still travels - the photo is missing on this
      device already, and dropping the row would delete it from the archive
      too. */
  const manifest = async (fileOwners: { file_path: string }[]): Promise<ArchiveFile[]> => {
    const names = fileOwners.flatMap((owner) => filesOf(owner.file_path));
    if (names.length === 0) return [];

    if (files.sizeMany) {
      const lengths = await files.sizeMany(names);
      const manifested: ArchiveFile[] = [];
      for (let i = 0; i < names.length; i++) {
        const length = lengths[i];
        if (length !== null) manifested.push({ name: names[i], length });
      }
      return manifested;
    }

    const manifested: ArchiveFile[] = [];
    for (const name of names) {
      const length = await files.size(name);
      if (length !== null) manifested.push({ name, length });
    }
    return manifested;
  };

  const area: ArchiveArea = {
    replace: (contents) => restoreArchive(driver, files, 'replace', contents),
    merge: (contents) => restoreArchive(driver, files, 'merge', contents),

    async previewDaylioImport(csv, naming) {
      return daylioPreview(csv, (await area.snapshot()).journal, naming);
    },

    async commitDaylioImport(preview) {
      if (preview.unmappedMoodLabels.length > 0) {
        throw new Error(`Daylio mood ${preview.unmappedMoodLabels.join(', ')} is not mapped; nothing was imported`);
      }
      const before = await area.snapshot();
      await restoreArchive(driver, files, 'merge', {
        journal: preview.journal,
        files: (async function* () {})()
      });
      const after = await area.snapshot();
      return {
        entriesAdded: after.journal.entries.length - before.journal.entries.length,
        tagsAdded:
          after.journal.tagGroups.flatMap((group) => group.tags).length -
          before.journal.tagGroups.flatMap((group) => group.tags).length
      };
    },

    async snapshot() {
      // One read of the photo table for the rows, their owners and the
      // manifest: three passes over the same list, never three queries.
      const photos = await driver.query<PhotoRow>(
        'SELECT uuid, file_path, entry_id, milestone_id FROM photo ORDER BY order_index, id'
      );
      const hairPhotoRowsRead = await hairPhotoRows();

      const archivedFiles = await manifest([...photos, ...hairPhotoRowsRead]);

      return {
        journal: {
          dimensions: await dimensions(),
          presets: await presets(),
          tagGroups: await tagGroups(),
          entries: await entries(photos),
          milestones: await milestones(photos),
          labResults: await labResults(),
          measurements: await measurements(),
          sideEffects: await sideEffects(),
          personalEffects: await personalEffects(),
          hairStages: await hairStages(),
          hairPhotos: hairPhotos(hairPhotoRowsRead),
          reminders: await reminders(),
          tallyEvents: await tallyEvents(),
          doubtEntries: await doubtEntries(),
          counterevidenceSnapshots: await counterevidenceSnapshots(),
          regimenEpisodes: await regimenEpisodes(),
          doseEvents: await doseEvents(),
          doseSchedules: await doseSchedules(),
          dosePauses: await dosePauses(),
          medicationStock: await medicationStock()
        },
        files: archivedFiles,
        async readFile(name) {
          const bytes = await files.read(name);
          // The manifest is built from the store's own answers moments
          // earlier, so a file that has gone since is a real failure, not
          // a case to paper over: packing it as zero bytes would produce
          // an archive whose lengths no longer add up.
          if (!bytes) throw new Error(`photo file missing while exporting: ${name}`);
          return bytes;
        },
        async readFiles(names) {
          if (names.length === 0) return [];
          if (!files.readMany) {
            return Promise.all(names.map(async (name) => {
              const bytes = await files.read(name);
              return bytes ?? null;
            }));
          }
          return files.readMany(names);
        }
      };
    }
  };
  return area;
}

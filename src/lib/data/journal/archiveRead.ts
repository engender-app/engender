/* How each archive section's rows are read out of the journal: one function
   per section, wired into the registry by archiveSections.ts.

   These read rows themselves rather than calling the other areas' getters,
   for the two reasons archive.ts's header gives - travelling identity, and
   one query per table for the whole journal instead of one per row.

   Three tables are read once and handed to every section that needs them,
   rather than queried per section: photo, voice_recording and hair_photo.
   The file manifest is built from the same rows (archive.ts), so a second
   read would be a second answer to the same question. */

import type { SqliteDriver } from '../sqlite/driver';
import type {
  ArchiveCounterevidenceSnapshot,
  ArchiveDimension,
  ArchiveDoseEvent,
  ArchiveDosePause,
  ArchiveDoseSchedule,
  ArchiveDoubtEntry,
  ArchiveEntry,
  ArchiveFeltSenseEntry,
  ArchiveHairPhoto,
  ArchiveHairStage,
  ArchiveLabResult,
  ArchiveLetter,
  ArchiveMeasurement,
  ArchiveMedicationStock,
  ArchiveMilestone,
  ArchivePersonalEffect,
  ArchivePhoto,
  ArchivePreset,
  ArchiveRegimenEpisode,
  ArchiveReminder,
  ArchiveRoadmapCheck,
  ArchiveSideEffect,
  ArchiveTag,
  ArchiveTagGroup,
  ArchiveTallyEvent,
  ArchiveTryout,
  ArchiveVoiceRecording
} from '../archive/payload';
import { bool, domainIdOf } from './support';

export type PhotoRow = { uuid: string; file_path: string; entry_id: number | null; milestone_id: number | null };
export type RecordingRow = { uuid: string; file_path: string; entry_id: number };
export type HairPhotoRow = { uuid: string; epoch_day: number; file_path: string };

/** What every section reader is given: the connection, and the three
    file-owning tables read once up front. */
export interface SectionRead {
  driver: SqliteDriver;
  photos: PhotoRow[];
  recordings: RecordingRow[];
  hairPhotos: HairPhotoRow[];
}

/** The shared reads, in one place so the manifest and the sections that name
    files work from the same rows. */
export async function readRowContext(driver: SqliteDriver): Promise<SectionRead> {
  return {
    driver,
    photos: await driver.query<PhotoRow>(
      'SELECT uuid, file_path, entry_id, milestone_id FROM photo ORDER BY order_index, id'
    ),
    hairPhotos: await driver.query<HairPhotoRow>(
      'SELECT uuid, epoch_day, file_path FROM hair_photo ORDER BY epoch_day, id'
    ),
    recordings: await driver.query<RecordingRow>(
      'SELECT uuid, file_path, entry_id FROM voice_recording ORDER BY order_index, id'
    )
  };
}

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

const toArchiveVoiceRecording = (row: RecordingRow): ArchiveVoiceRecording => ({
  id: row.uuid,
  fileName: row.file_path
});

export async function readDimensions({ driver }: SectionRead): Promise<ArchiveDimension[]> {
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
}

export async function readPresets({ driver }: SectionRead): Promise<ArchivePreset[]> {
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
}

export async function readTagGroups({ driver }: SectionRead): Promise<ArchiveTagGroup[]> {
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
}

export async function readEntries({ driver, photos, recordings }: SectionRead): Promise<ArchiveEntry[]> {
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
  const recordingsByEntry = groupBy(recordings, (r) => r.entry_id, toArchiveVoiceRecording);

  return rows.map((r) => ({
    uuid: r.uuid,
    epochDay: r.epoch_day,
    timestamp: r.timestamp,
    mood: r.mood,
    note: r.note ?? '',
    dims: Object.fromEntries(dims.get(r.id) ?? []),
    tags: tags.get(r.id) ?? [],
    photos: byEntry.get(r.id) ?? [],
    recordings: recordingsByEntry.get(r.id) ?? [],
    bodyRegions: Object.fromEntries(bodyRegions.get(r.id) ?? [])
  }));
}

export async function readMilestones({ driver, photos }: SectionRead): Promise<ArchiveMilestone[]> {
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
}

export async function readLabResults({ driver }: SectionRead): Promise<ArchiveLabResult[]> {
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
}

export async function readMeasurements({ driver }: SectionRead): Promise<ArchiveMeasurement[]> {
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
}

export async function readTallyEvents({ driver }: SectionRead): Promise<ArchiveTallyEvent[]> {
  const rows = await driver.query<{ uuid: string; epoch_day: number; kind: string; context: string | null }>(
    'SELECT uuid, epoch_day, kind, context FROM tally_event ORDER BY epoch_day, id'
  );
  return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, kind: r.kind, context: r.context ?? '' }));
}

export async function readSideEffects({ driver }: SectionRead): Promise<ArchiveSideEffect[]> {
  const rows = await driver.query<{ uuid: string; name: string; severity: number; epoch_day: number }>(
    'SELECT uuid, name, severity, epoch_day FROM side_effect ORDER BY epoch_day, id'
  );
  return rows.map((r) => ({ id: r.uuid, name: r.name, severity: r.severity, epochDay: r.epoch_day }));
}

export async function readDoubtEntries({ driver }: SectionRead): Promise<ArchiveDoubtEntry[]> {
  const rows = await driver.query<{ uuid: string; epoch_day: number; timestamp: number; text: string }>(
    'SELECT uuid, epoch_day, timestamp, text FROM doubt_entry ORDER BY epoch_day, timestamp, id'
  );
  return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, timestamp: r.timestamp, text: r.text }));
}

export async function readCounterevidenceSnapshots({ driver }: SectionRead): Promise<ArchiveCounterevidenceSnapshot[]> {
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
}

export async function readLetters({ driver }: SectionRead): Promise<ArchiveLetter[]> {
  const rows = await driver.query<{ uuid: string; epoch_day: number; text: string; unlock_epoch_day: number }>(
    'SELECT uuid, epoch_day, text, unlock_epoch_day FROM letter ORDER BY epoch_day, id'
  );
  return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, text: r.text, unlockEpochDay: r.unlock_epoch_day }));
}

export async function readRoadmapChecks({ driver }: SectionRead): Promise<ArchiveRoadmapCheck[]> {
  const rows = await driver.query<{ pack_key: string; goal_key: string }>(
    'SELECT pack_key, goal_key FROM roadmap_check ORDER BY pack_key, goal_key'
  );
  return rows.map((r) => ({ packKey: r.pack_key, goalKey: r.goal_key }));
}

export async function readTryouts({ driver }: SectionRead): Promise<ArchiveTryout[]> {
  const rows = await driver.query<{
    uuid: string;
    kind: string;
    label: string;
    start_epoch_day: number;
    end_epoch_day: number | null;
  }>('SELECT uuid, kind, label, start_epoch_day, end_epoch_day FROM tryout ORDER BY start_epoch_day, id');
  return rows.map((r) => ({
    id: r.uuid,
    kind: r.kind,
    label: r.label,
    startEpochDay: r.start_epoch_day,
    endEpochDay: r.end_epoch_day
  }));
}

export async function readFeltSenseEntries({ driver }: SectionRead): Promise<ArchiveFeltSenseEntry[]> {
  const rows = await driver.query<{
    uuid: string;
    tryout_uuid: string;
    epoch_day: number;
    mood: number;
    note: string | null;
  }>(
    `SELECT f.uuid, t.uuid AS tryout_uuid, f.epoch_day, f.mood, f.note
       FROM tryout_felt_sense f JOIN tryout t ON t.id = f.tryout_id
      ORDER BY f.epoch_day, f.id`
  );
  return rows.map((r) => ({
    id: r.uuid,
    tryoutId: r.tryout_uuid,
    epochDay: r.epoch_day,
    mood: r.mood,
    note: r.note
  }));
}

export async function readPersonalEffects({ driver }: SectionRead): Promise<ArchivePersonalEffect[]> {
  const rows = await driver.query<{ uuid: string; effect: string; first_noticed_epoch_day: number }>(
    'SELECT uuid, effect, first_noticed_epoch_day FROM personal_effect ORDER BY effect'
  );
  return rows.map((r) => ({ id: r.uuid, effect: r.effect, firstNoticedEpochDay: r.first_noticed_epoch_day }));
}

export async function readHairStages({ driver }: SectionRead): Promise<ArchiveHairStage[]> {
  const rows = await driver.query<{ uuid: string; epoch_day: number; stage: string }>(
    'SELECT uuid, epoch_day, stage FROM hair_stage ORDER BY epoch_day, id'
  );
  return rows.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, stage: r.stage }));
}

/* Reads its rows from the context rather than the driver, the way the entry
   and milestone readers do with photos: the same query feeds the file
   manifest, and one read of the table serves both. */
export async function readHairPhotos({ hairPhotos }: SectionRead): Promise<ArchiveHairPhoto[]> {
  return hairPhotos.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, fileName: r.file_path }));
}

export async function readReminders({ driver }: SectionRead): Promise<ArchiveReminder[]> {
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
}

export async function readMedicationStock({ driver }: SectionRead): Promise<ArchiveMedicationStock[]> {
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
}

export async function readRegimenEpisodes({ driver }: SectionRead): Promise<ArchiveRegimenEpisode[]> {
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
}

export async function readDoseEvents({ driver }: SectionRead): Promise<ArchiveDoseEvent[]> {
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
}

/* Joined to the episode rather than carrying `episode_id`: a rowid is
   this device's alone (ADR-0002), and the uuid is what the importing
   device can match an episode by. */
export async function readDoseSchedules({ driver }: SectionRead): Promise<ArchiveDoseSchedule[]> {
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
}

export async function readDosePauses({ driver }: SectionRead): Promise<ArchiveDosePause[]> {
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
}

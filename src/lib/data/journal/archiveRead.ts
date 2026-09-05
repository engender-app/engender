/* How each archive section's rows are read out of the journal, wired into
   the registry by archiveSections.ts.

   A flat area needs no function here at all: readFlatTable() below reads it
   from the descriptor the registry declares (archiveTable.ts). What is left
   is the sections a descriptor cannot state - child tables, joins to another
   area's rows, and the reference data whose identity is a key rather than a
   uuid.

   These read rows themselves rather than calling the other areas' getters,
   for the two reasons archive.ts's header gives - travelling identity, and
   one query per table for the whole journal instead of one per row.

   Seven tables are read once and handed to every section that needs them,
   rather than queried per section: photo, voice_recording, video_note,
   hair_photo, hair_removal_photo, procedure_photo and tryout_photo. The
   file manifest is built from the same rows (archive.ts), so a second
   read would be a second answer to the same question. */

import type { SqliteDriver } from '../sqlite/driver';
import type {
  ArchiveAffirmation,
  ArchiveBodyRegion,
  ArchiveChecklist,
  ArchiveChecklistItem,
  ArchiveCounterevidenceSnapshot,
  ArchiveDimension,
  ArchiveDosePause,
  ArchiveDoseSchedule,
  ArchiveEffectCategory,
  ArchiveEntry,
  ArchiveEntryTemplate,
  ArchiveFeltSenseEntry,
  ArchiveMarginNote,
  ArchiveHairPhoto,
  ArchiveHairRemovalPhoto,
  ArchiveHairRemovalSession,
  ArchiveImportLogRecord,
  ArchiveMeasurementType,
  ArchiveMilestone,
  ArchivePersonalEffectType,
  ArchiveProcedure,
  ArchiveAppointment,
  ArchiveProcedurePhoto,
  ArchivePhoto,
  ArchivePreset,
  ArchiveRoadmapCheck,
  ArchiveTag,
  ArchiveTagGroup,
  ArchiveTryout,
  ArchiveTryoutPhoto,
  ArchiveVideoNote,
  ArchiveVoiceRecording
} from '../archive/payload';
import { bool, domainIdOf } from './support';
import { columnsOf, type FlatTable } from './archiveTable';

export type PhotoRow = {
  uuid: string;
  file_path: string;
  entry_id: number | null;
  milestone_id: number | null;
  starred: number;
  epoch_day_override: number | null;
};
export type RecordingRow = { uuid: string; file_path: string; entry_id: number };
export type VideoRow = { uuid: string; file_path: string; entry_id: number };
export type HairPhotoRow = { uuid: string; epoch_day: number; file_path: string };
export type HairRemovalPhotoRow = { uuid: string; session_id: number; file_path: string };
export type ProcedurePhotoRow = { uuid: string; procedure_id: number; epoch_day: number; file_path: string };
export type TryoutPhotoRow = { uuid: string; tryout_id: number; epoch_day: number; file_path: string };
/** A benchmark names two files, and the second one is absent on a take that
    skipped the vowel (phase 5 deepening ticket 15). */
export type BenchmarkFileRow = { passage_file_path: string; vowel_file_path: string | null };

/** What every section reader is given: the connection, and the eight
    file-owning tables read once up front. */
export interface SectionRead {
  driver: SqliteDriver;
  photos: PhotoRow[];
  recordings: RecordingRow[];
  videos: VideoRow[];
  hairPhotos: HairPhotoRow[];
  hairRemovalPhotos: HairRemovalPhotoRow[];
  procedurePhotos: ProcedurePhotoRow[];
  tryoutPhotos: TryoutPhotoRow[];
  benchmarkFiles: BenchmarkFileRow[];
}

/** The shared reads, in one place so the manifest and the sections that name
    files work from the same rows. */
export async function readRowContext(driver: SqliteDriver): Promise<SectionRead> {
  return {
    driver,
    // A trashed entry's photo/recording is excluded here, not only from the
    // entries section below - archive.ts builds its file manifest straight
    // from these rows, and trash is out of scope for archives entirely
    // (phase 5 ticket 19).
    photos: await driver.query<PhotoRow>(
      `SELECT p.uuid, p.file_path, p.entry_id, p.milestone_id, p.starred, p.epoch_day_override FROM photo p
       LEFT JOIN entry e ON e.id = p.entry_id
       WHERE p.entry_id IS NULL OR e.trashed_at IS NULL
       ORDER BY p.order_index, p.id`
    ),
    hairPhotos: await driver.query<HairPhotoRow>(
      'SELECT uuid, epoch_day, file_path FROM hair_photo ORDER BY epoch_day, id'
    ),
    hairRemovalPhotos: await driver.query<HairRemovalPhotoRow>(
      'SELECT uuid, session_id, file_path FROM hair_removal_photo ORDER BY session_id, id'
    ),
    procedurePhotos: await driver.query<ProcedurePhotoRow>(
      'SELECT uuid, procedure_id, epoch_day, file_path FROM procedure_photo ORDER BY procedure_id, epoch_day, id'
    ),
    tryoutPhotos: await driver.query<TryoutPhotoRow>(
      'SELECT uuid, tryout_id, epoch_day, file_path FROM tryout_photo ORDER BY tryout_id, epoch_day, id'
    ),
    recordings: await driver.query<RecordingRow>(
      `SELECT v.uuid, v.file_path, v.entry_id FROM voice_recording v
       JOIN entry e ON e.id = v.entry_id
       WHERE e.trashed_at IS NULL
       ORDER BY v.order_index, v.id`
    ),
    benchmarkFiles: await driver.query<BenchmarkFileRow>(
      'SELECT passage_file_path, vowel_file_path FROM voice_benchmark ORDER BY epoch_day, id'
    ),
    videos: await driver.query<VideoRow>(
      `SELECT n.uuid, n.file_path, n.entry_id FROM video_note n
       JOIN entry e ON e.id = n.entry_id
       WHERE e.trashed_at IS NULL
       ORDER BY n.order_index, n.id`
    )
  };
}

/** Every row of a flat area's table, in the order its descriptor asks for,
    carried as the fields that descriptor names (archiveTable.ts). The
    generic half of what used to be one hand-written reader per flat area:
    a SELECT of the declared columns and a rename of each one. */
export async function readFlatTable<Row>(table: FlatTable<Row>, { driver }: SectionRead): Promise<Row[]> {
  const columns = columnsOf(table);
  const rows = await driver.query<Record<string, unknown>>(
    `SELECT ${columns.map((c) => c.column).join(', ')} FROM ${table.table} ORDER BY ${table.orderBy}`
  );
  return rows.map((row) => {
    const carried: Record<string, unknown> = {};
    for (const { column, field, bool: isBool, whenNull } of columns) {
      const value = row[column];
      if (isBool) carried[field] = bool(value);
      else carried[field] = value === null && whenNull !== undefined ? whenNull : value;
    }
    return carried as Row;
  });
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

const toArchivePhoto = (row: PhotoRow): ArchivePhoto => ({
  id: row.uuid,
  fileName: row.file_path,
  starred: bool(row.starred),
  epochDayOverride: row.epoch_day_override
});

const toArchiveVoiceRecording = (row: RecordingRow): ArchiveVoiceRecording => ({
  id: row.uuid,
  fileName: row.file_path
});

const toArchiveVideoNote = (row: VideoRow): ArchiveVideoNote => ({
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

export async function readEntryTemplates({ driver }: SectionRead): Promise<ArchiveEntryTemplate[]> {
  const rows = await driver.query<{
    id: number;
    uuid: string | null;
    key: string | null;
    name: string;
    note_scaffold: string;
    presentation_id: string | null;
    hidden: number;
  }>('SELECT id, uuid, key, name, note_scaffold, presentation_id, hidden FROM entry_template ORDER BY id');

  const tagLinks = await driver.query<{ template_id: number; key: string | null; uuid: string | null }>(
    `SELECT ett.template_id, t.key, t.uuid FROM entry_template_tag ett
     JOIN tag t ON t.id = ett.tag_id
     ORDER BY t.id`
  );
  const dimLinks = await driver.query<{ template_id: number; key: string; value: number }>(
    `SELECT etdv.template_id, gd.key, etdv.value FROM entry_template_dimension_value etdv
     JOIN gender_dimension gd ON gd.id = etdv.dimension_id
     ORDER BY gd.id`
  );
  const tagsByTemplate = groupBy(tagLinks, (l) => l.template_id, (l) => domainIdOf(l, 'tag'));
  const dimsByTemplate = groupBy(dimLinks, (l) => l.template_id, (l) => [l.key, l.value] as const);

  return rows.map((r) => ({
    id: domainIdOf(r, 'entry template'),
    name: r.name,
    tags: tagsByTemplate.get(r.id) ?? [],
    dims: Object.fromEntries(dimsByTemplate.get(r.id) ?? []),
    noteScaffold: r.note_scaffold,
    presentationId: r.presentation_id,
    builtIn: r.key !== null,
    hidden: bool(r.hidden)
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

export async function readAffirmations({ driver }: SectionRead): Promise<ArchiveAffirmation[]> {
  const rows = await driver.query<{
    id: number;
    uuid: string | null;
    key: string | null;
    language: 'en' | 'pl' | null;
    text: string;
    hidden: number;
  }>('SELECT id, uuid, key, language, text, hidden FROM affirmation ORDER BY id');
  return rows.map((a) => ({
    id: domainIdOf(a, 'affirmation'),
    language: a.language,
    text: a.text,
    builtIn: a.key !== null,
    hidden: bool(a.hidden)
  }));
}

export async function readBodyRegions({ driver }: SectionRead): Promise<ArchiveBodyRegion[]> {
  const rows = await driver.query<{ id: number; uuid: string | null; key: string | null; name: string; hidden: number }>(
    'SELECT id, uuid, key, name, hidden FROM body_region ORDER BY id'
  );
  return rows.map((r) => ({
    id: domainIdOf(r, 'body region'),
    name: r.name,
    builtIn: r.key !== null,
    hidden: bool(r.hidden)
  }));
}

export async function readEntries({ driver, photos, recordings, videos }: SectionRead): Promise<ArchiveEntry[]> {
  const rows = await driver.query<{
    id: number;
    uuid: string;
    epoch_day: number;
    timestamp: number;
    mood: number | null;
    note: string | null;
    starred: number;
    presentation_id: string | null;
  }>(
    // Trashed entries are excluded (phase 5 ticket 19): trash is out of
    // scope for archives, and readRowContext has already left their photos
    // and recordings out of `photos`/`recordings` for the same reason.
    'SELECT id, uuid, epoch_day, timestamp, mood, note, starred, presentation_id FROM entry WHERE trashed_at IS NULL ORDER BY epoch_day, timestamp, id'
  );

  const dimensionValues = await driver.query<{ entry_id: number; key: string; value: number }>(
    `SELECT edv.entry_id, gd.key, edv.value FROM entry_dimension_value edv
     JOIN gender_dimension gd ON gd.id = edv.dimension_id ORDER BY edv.entry_id, gd.id`
  );
  const tagLinks = await driver.query<{ entry_id: number; key: string | null; uuid: string | null }>(
    `SELECT et.entry_id, t.key, t.uuid FROM entry_tag et
     JOIN tag t ON t.id = et.tag_id ORDER BY et.entry_id, t.id`
  );
  const bodyRegionValues = await driver.query<{
    entry_id: number;
    region: string;
    dysphoria: number | null;
    euphoria: number | null;
  }>('SELECT entry_id, region, dysphoria, euphoria FROM entry_body_region ORDER BY entry_id, region');

  const dims = groupBy(dimensionValues, (v) => v.entry_id, (v) => [v.key, v.value] as const);
  const tags = groupBy(tagLinks, (t) => t.entry_id, (t) => domainIdOf(t, 'tag'));
  const bodyRegions = groupBy(
    bodyRegionValues,
    (v) => v.entry_id,
    (v) => [v.region, { dysphoria: v.dysphoria, euphoria: v.euphoria }] as const
  );
  const byEntry = groupBy(photos.filter((p) => p.entry_id !== null), (p) => p.entry_id!, toArchivePhoto);
  const recordingsByEntry = groupBy(recordings, (r) => r.entry_id, toArchiveVoiceRecording);
  const videosByEntry = groupBy(videos, (v) => v.entry_id, toArchiveVideoNote);

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
    videos: videosByEntry.get(r.id) ?? [],
    bodyRegions: Object.fromEntries(bodyRegions.get(r.id) ?? []),
    starred: bool(r.starred),
    presentationId: r.presentation_id
  }));
}

export async function readMilestones({ driver, photos }: SectionRead): Promise<ArchiveMilestone[]> {
  const rows = await driver.query<{
    id: number;
    uuid: string;
    name: string;
    epoch_day: number;
    description: string;
    template_key: string | null;
    roadmap_goal_key: string | null;
    procedure_id: string | null;
    tryout_id: string | null;
  }>(
    'SELECT id, uuid, name, epoch_day, description, template_key, roadmap_goal_key, procedure_id, tryout_id FROM milestone ORDER BY epoch_day, id'
  );
  const byMilestone = groupBy(photos.filter((p) => p.milestone_id !== null), (p) => p.milestone_id!, toArchivePhoto);
  return rows.map((r) => ({
    id: r.uuid,
    name: r.name,
    epochDay: r.epoch_day,
    description: r.description,
    templateKey: r.template_key,
    roadmapGoalKey: r.roadmap_goal_key,
    procedureId: r.procedure_id,
    tryoutId: r.tryout_id,
    // A milestone shows one photo; a second row for the same one would
    // be a bug elsewhere, and the earliest wins rather than throwing -
    // the same rule the milestones area reads by.
    photo: byMilestone.get(r.id)?.[0] ?? null
  }));
}

export async function readMeasurementTypes({ driver }: SectionRead): Promise<ArchiveMeasurementType[]> {
  const rows = await driver.query<{ key: string; name: string; is_built_in: number; hidden: number }>(
    'SELECT key, name, is_built_in, hidden FROM measurement_type ORDER BY id'
  );
  return rows.map((r) => ({ key: r.key, name: r.name, builtIn: bool(r.is_built_in), hidden: bool(r.hidden) }));
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

export async function readRoadmapChecks({ driver }: SectionRead): Promise<ArchiveRoadmapCheck[]> {
  const rows = await driver.query<{ pack_key: string; goal_key: string; status: string }>(
    'SELECT pack_key, goal_key, status FROM roadmap_check ORDER BY pack_key, goal_key'
  );
  return rows.map((r) => ({ packKey: r.pack_key, goalKey: r.goal_key, status: r.status }));
}

export async function readChecklists({ driver }: SectionRead): Promise<ArchiveChecklist[]> {
  const checklists = await driver.query<{
    id: number;
    uuid: string;
    owner_kind: string | null;
    owner_uuid: string | null;
    appointment_epoch_day: number | null;
  }>('SELECT id, uuid, owner_kind, owner_uuid, appointment_epoch_day FROM checklist ORDER BY id');
  const items = await driver.query<{ checklist_id: number; uuid: string; content: string; checked: number; carried_forward: number }>(
    'SELECT checklist_id, uuid, content, checked, carried_forward FROM checklist_item ORDER BY order_index, id'
  );
  const byChecklist = groupBy(
    items,
    (i) => i.checklist_id,
    (i): ArchiveChecklistItem => ({
      id: i.uuid,
      content: i.content,
      checked: bool(i.checked),
      carriedForward: bool(i.carried_forward)
    })
  );
  return checklists.map((c) => ({
    id: c.uuid,
    ownerKind: c.owner_kind,
    ownerId: c.owner_uuid,
    appointmentEpochDay: c.appointment_epoch_day,
    items: byChecklist.get(c.id) ?? []
  }));
}

export async function readTryouts({ driver, tryoutPhotos }: SectionRead): Promise<ArchiveTryout[]> {
  const rows = await driver.query<{
    id: number;
    uuid: string;
    kind: string;
    label: string;
    description: string | null;
    start_epoch_day: number;
    end_epoch_day: number | null;
  }>('SELECT id, uuid, kind, label, description, start_epoch_day, end_epoch_day FROM tryout ORDER BY start_epoch_day, id');

  const photosById = groupBy(
    tryoutPhotos,
    (photo) => photo.tryout_id,
    (photo): ArchiveTryoutPhoto => ({ id: photo.uuid, epochDay: photo.epoch_day, fileName: photo.file_path })
  );

  return rows.map((r) => ({
    id: r.uuid,
    kind: r.kind,
    label: r.label,
    description: r.description,
    startEpochDay: r.start_epoch_day,
    endEpochDay: r.end_epoch_day,
    photos: photosById.get(r.id) ?? []
  }));
}

export async function readFeltSenseEntries({ driver }: SectionRead): Promise<ArchiveFeltSenseEntry[]> {
  const rows = await driver.query<{
    uuid: string;
    tryout_uuid: string | null;
    milestone_uuid: string | null;
    epoch_day: number;
    mood: number;
    note: string | null;
  }>(
    `SELECT f.uuid, t.uuid AS tryout_uuid, ms.uuid AS milestone_uuid, f.epoch_day, f.mood, f.note
       FROM felt_sense f
       LEFT JOIN tryout t ON t.id = f.tryout_id
       LEFT JOIN milestone ms ON ms.id = f.milestone_id
      ORDER BY f.epoch_day, f.id`
  );
  return rows.map((r) => ({
    id: r.uuid,
    tryoutId: r.tryout_uuid,
    milestoneId: r.milestone_uuid,
    epochDay: r.epoch_day,
    mood: r.mood,
    note: r.note
  }));
}

export async function readMarginNotes({ driver }: SectionRead): Promise<ArchiveMarginNote[]> {
  const rows = await driver.query<{ uuid: string; entry_uuid: string; epoch_day: number; text: string }>(
    `SELECT mn.uuid, e.uuid AS entry_uuid, mn.epoch_day, mn.text
       FROM margin_note mn JOIN entry e ON e.id = mn.entry_id
      ORDER BY mn.epoch_day, mn.id`
  );
  return rows.map((r) => ({ id: r.uuid, entryId: r.entry_uuid, epochDay: r.epoch_day, text: r.text }));
}

export async function readEffectCategories({ driver }: SectionRead): Promise<ArchiveEffectCategory[]> {
  const rows = await driver.query<{ key: string; name: string; enabled: number }>(
    'SELECT key, name, enabled FROM effect_category ORDER BY id'
  );
  return rows.map((r) => ({ key: r.key, name: r.name, enabled: bool(r.enabled) }));
}

export async function readPersonalEffectTypes({ driver }: SectionRead): Promise<ArchivePersonalEffectType[]> {
  const rows = await driver.query<{
    key: string;
    name: string;
    is_built_in: number;
    category_key: string | null;
    direction: 'feminizing' | 'masculinizing' | null;
    hidden: number;
  }>('SELECT key, name, is_built_in, category_key, direction, hidden FROM personal_effect_type ORDER BY id');
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    builtIn: bool(r.is_built_in),
    hidden: bool(r.hidden),
    categoryKey: r.category_key,
    direction: r.direction
  }));
}

/* Reads its rows from the context rather than the driver, the way the entry
   and milestone readers do with photos: the same query feeds the file
   manifest, and one read of the table serves both. */
export async function readHairPhotos({ hairPhotos }: SectionRead): Promise<ArchiveHairPhoto[]> {
  return hairPhotos.map((r) => ({ id: r.uuid, epochDay: r.epoch_day, fileName: r.file_path }));
}

export async function readHairRemovalSessions({
  driver,
  hairRemovalPhotos
}: SectionRead): Promise<ArchiveHairRemovalSession[]> {
  const sessions = await driver.query<{
    id: number;
    uuid: string;
    epoch_day: number;
    area: string;
    method: string;
    pain_rating: number;
    cost: string;
    provider: string;
  }>('SELECT id, uuid, epoch_day, area, method, pain_rating, cost, provider FROM hair_removal_session ORDER BY epoch_day, id');

  const byId = groupBy(
    hairRemovalPhotos,
    (photo) => photo.session_id,
    (photo): ArchiveHairRemovalPhoto => ({ id: photo.uuid, fileName: photo.file_path })
  );

  return sessions.map((session) => ({
    id: session.uuid,
    epochDay: session.epoch_day,
    area: session.area,
    method: session.method,
    painRating: session.pain_rating,
    cost: session.cost,
    provider: session.provider,
    photos: byId.get(session.id) ?? []
  }));
}

export async function readProcedures({ driver, procedurePhotos }: SectionRead): Promise<ArchiveProcedure[]> {
  const procedures = await driver.query<{
    id: number;
    uuid: string;
    name: string;
    surgery_epoch_day: number | null;
    notes: string;
  }>(
    'SELECT id, uuid, name, surgery_epoch_day, notes FROM procedure ORDER BY surgery_epoch_day IS NULL, surgery_epoch_day, id'
  );
  const photosById = groupBy(
    procedurePhotos,
    (photo) => photo.procedure_id,
    (photo): ArchiveProcedurePhoto => ({ id: photo.uuid, epochDay: photo.epoch_day, fileName: photo.file_path })
  );

  return procedures.map((procedure) => ({
    id: procedure.uuid,
    name: procedure.name,
    surgeryEpochDay: procedure.surgery_epoch_day,
    notes: procedure.notes,
    photos: photosById.get(procedure.id) ?? []
  }));
}

/* The procedure link travels as the procedure's own uuid rather than its
   rowid, which is this device's alone (ADR-0002) - the same join
   readDoseSchedules makes for the same reason. */
export async function readAppointments({ driver }: SectionRead): Promise<ArchiveAppointment[]> {
  const rows = await driver.query<{
    uuid: string;
    epoch_day: number;
    procedure_uuid: string | null;
    kind: string | null;
    place: string | null;
    note: string | null;
  }>(
    `SELECT a.uuid AS uuid, a.epoch_day AS epoch_day, r.uuid AS procedure_uuid,
            a.kind AS kind, a.place AS place, a.note AS note
       FROM appointment a LEFT JOIN procedure r ON r.id = a.procedure_id
      ORDER BY a.epoch_day, a.id`
  );
  return rows.map((row) => ({
    id: row.uuid,
    epochDay: row.epoch_day,
    procedureId: row.procedure_uuid,
    kind: row.kind,
    place: row.place,
    note: row.note
  }));
}

/* Joined to the episode rather than carrying `episode_id`: a rowid is
   this device's alone (ADR-0002), and the uuid is what the importing
   device can match an episode by. */
export async function readDoseSchedules({ driver }: SectionRead): Promise<ArchiveDoseSchedule[]> {
  const rows = await driver.query<{
    id: number;
    uuid: string;
    episode_uuid: string;
    recurrence_kind: string;
    every_n_days: number | null;
    doses_per_day: number;
  }>(
    `SELECT s.id, s.uuid, e.uuid AS episode_uuid, s.recurrence_kind, s.every_n_days, s.doses_per_day
       FROM dose_schedule s JOIN regimen_episode e ON e.id = s.episode_id
      ORDER BY s.id`
  );

  const weekdaysOf = async (scheduleId: number): Promise<number[] | null> => {
    const weekdayRows = await driver.query<{ weekday: number }>(
      'SELECT weekday FROM dose_schedule_weekday WHERE schedule_id = ? ORDER BY weekday',
      [scheduleId]
    );
    return weekdayRows.length > 0 ? weekdayRows.map((row) => row.weekday) : null;
  };

  const doseAmountsOf = async (scheduleId: number): Promise<{ dose: number; doseUnit: string }[] | null> => {
    const amountRows = await driver.query<{ dose: number; dose_unit: string }>(
      'SELECT dose, dose_unit FROM dose_schedule_dose_amount WHERE schedule_id = ? ORDER BY position',
      [scheduleId]
    );
    return amountRows.length > 0 ? amountRows.map((row) => ({ dose: row.dose, doseUnit: row.dose_unit })) : null;
  };

  return Promise.all(
    rows.map(async (r) => ({
      id: r.uuid,
      episodeId: r.episode_uuid,
      recurrenceKind: r.recurrence_kind,
      everyNDays: r.every_n_days,
      weekdays: await weekdaysOf(r.id),
      dosesPerDay: r.doses_per_day,
      doseAmounts: await doseAmountsOf(r.id)
    }))
  );
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

/** The import history (phase 7 ticket 03): source, when, and net additions
    by kind. Ordered so the wire order is stable and a round trip compares
    row by row - the settings screen that shows these most-recent-first
    reverses this itself, the same split `readComfortItems` and its
    position-ordered read leave to the caller.

    Takes the connection directly rather than a whole `SectionRead`, unlike
    every other reader here: `ArchiveArea.importLog()` (journal/archive.ts)
    calls this straight, for the settings screen, without paying for the
    seven file-owning tables a section's read is otherwise bundled with. */
export async function readImportLog(driver: SqliteDriver): Promise<ArchiveImportLogRecord[]> {
  const rows = await driver.query<{ uuid: string; source: string; counts: string; imported_at: number }>(
    'SELECT uuid, source, counts, imported_at FROM import_log ORDER BY imported_at, uuid'
  );
  return rows.map((row) => ({
    id: row.uuid,
    source: row.source,
    importedAt: row.imported_at,
    counts: JSON.parse(row.counts) as Record<string, number>
  }));
}

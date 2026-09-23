/* One case per archiveApply.ts export, driven alone against a small fixture
   through the Restoring driver it already takes (audit finding A5) - so a
   wrong merge fails by naming its own section rather than as "the golden
   archive differs" (archive-golden.test.ts's whole-journal round trip).

   Two of the file's 31 exports are not here: `applyFlatTable` already has
   its own tests in archiveTable.test.ts, and `aliasLegacyConsults` in
   archive-legacy-consults.test.ts. A third, the `Restoring` type itself, is
   not a runtime export a test can drive at all - every function below is
   checked against it by the type checker on every call, which is the whole
   of what testing a type means. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import type {
  ArchiveAffirmation,
  ArchiveAppointment,
  ArchiveBodyRegion,
  ArchiveChecklist,
  ArchiveCounterevidenceSnapshot,
  ArchiveDimension,
  ArchiveDoseSchedule,
  ArchiveDosePause,
  ArchiveEffectCategory,
  ArchiveEntry,
  ArchiveEntryTemplate,
  ArchiveFeltSenseEntry,
  ArchiveHairPhoto,
  ArchiveHairRemovalSession,
  ArchiveImportLogRecord,
  ArchiveJournal,
  ArchiveMarginNote,
  ArchiveMeasurementType,
  ArchiveMilestone,
  ArchivePersonalEffectType,
  ArchivePreset,
  ArchiveProcedure,
  ArchiveRoadmapCheck,
  ArchiveTagGroup,
  ArchiveTaper,
  ArchiveTryout
} from '../archive/payload.ts';
import { foldText } from '../fold.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import {
  applyAffirmations,
  applyAppointments,
  applyBodyRegions,
  applyChecklists,
  applyCounterevidenceSnapshots,
  applyDimensions,
  applyDosePauses,
  applyDoseSchedules,
  applyEffectCategories,
  applyEntries,
  applyEntryTemplates,
  applyFeltSenseEntries,
  applyHairPhotos,
  applyHairRemovalSessions,
  applyImportLog,
  applyMarginNotes,
  applyMeasurementTypes,
  applyMilestones,
  applyPersonalEffectTypes,
  applyPresets,
  applyProcedures,
  applyRoadmapChecks,
  applyTagGroups,
  applyTaper,
  applyTryouts,
  importLogRow,
  IMPORT_LOG_COLUMNS,
  recordImport,
  type Restoring
} from './archiveApply.ts';

function restoring(
  driver: SqliteDriver,
  journal: Partial<ArchiveJournal>,
  mode: Restoring['mode'] = 'replace',
  ts = 7
): Restoring {
  return { driver, mode, journal: journal as ArchiveJournal, ts };
}

async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  driver: SqliteDriver,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  return (await driver.query<T>(sql, params)).map((row) => ({ ...row }));
}

async function seedRegimenEpisode(driver: SqliteDriver, uuid: string): Promise<void> {
  await driver.run(
    `INSERT INTO regimen_episode (uuid, drug, dose, dose_unit, route, interval, start_epoch_day, updated_at)
     VALUES (?, 'estradiol valerate', 2, 'mg', 'im', 'weekly', 20000, 0)`,
    [uuid]
  );
}

async function seedProcedure(driver: SqliteDriver, uuid: string): Promise<void> {
  await driver.run(`INSERT INTO procedure (uuid, name, notes, updated_at) VALUES (?, 'Vaginoplasty', '', 0)`, [uuid]);
}

// applyDimensions ------------------------------------------------------------

test('applyDimensions inserts a new dimension and merge leaves a matched key alone', async () => {
  const driver = await migratedDb();
  const dim: ArchiveDimension = {
    key: 'euphoria',
    name: 'Euphoria',
    low: 'low',
    high: 'high',
    min: 0,
    max: 100,
    builtIn: true,
    hidden: false
  };

  await applyDimensions(restoring(driver, { dimensions: [dim] }, 'merge', 3));
  let rows = await q(driver, 'SELECT key, name, is_built_in, updated_at FROM gender_dimension');
  assert.deepEqual(rows, [{ key: 'euphoria', name: 'Euphoria', is_built_in: 1, updated_at: 3 }]);

  await applyDimensions(restoring(driver, { dimensions: [{ ...dim, name: 'Renamed' }] }, 'merge', 9));
  rows = await q(driver, 'SELECT name FROM gender_dimension');
  assert.deepEqual(rows, [{ name: 'Euphoria' }]);
});

test('applyDimensions replace updates a matched key', async () => {
  const driver = await migratedDb();
  const dim: ArchiveDimension = {
    key: 'euphoria',
    name: 'Euphoria',
    low: 'low',
    high: 'high',
    min: 0,
    max: 100,
    builtIn: true,
    hidden: false
  };
  await applyDimensions(restoring(driver, { dimensions: [dim] }, 'merge', 3));

  await applyDimensions(restoring(driver, { dimensions: [{ ...dim, name: 'Renamed', hidden: true }] }, 'replace', 9));
  const rows = await q(driver, 'SELECT name, hidden, updated_at FROM gender_dimension');
  assert.deepEqual(rows, [{ name: 'Renamed', hidden: 1, updated_at: 9 }]);
});

// applyPresets ----------------------------------------------------------------

async function seedTwoDimensions(driver: SqliteDriver): Promise<void> {
  await driver.run(
    `INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES ('a', 'A', 'lo', 'hi', 0)`
  );
  await driver.run(
    `INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES ('b', 'B', 'lo', 'hi', 0)`
  );
}

async function presetDimensionKeys(driver: SqliteDriver): Promise<string[]> {
  const rows = await q<{ key: string }>(driver, 
    `SELECT d.key FROM preset_dimension pd JOIN gender_dimension d ON d.id = pd.dimension_id ORDER BY pd.order_index`
  );
  return rows.map((r) => r.key);
}

test('applyPresets inserts a preset with its dimension links', async () => {
  const driver = await migratedDb();
  await seedTwoDimensions(driver);
  const preset: ArchivePreset = { id: 'euphoric', name: 'Euphoric', builtIn: true, dims: ['a'] };

  await applyPresets(restoring(driver, { presets: [preset] }, 'merge', 3));

  const rows = await q(driver, 'SELECT key, name, updated_at FROM gender_preset');
  assert.deepEqual(rows, [{ key: 'euphoric', name: 'Euphoric', updated_at: 3 }]);
  assert.deepEqual(await presetDimensionKeys(driver), ['a']);
});

test('applyPresets merge keeps a matched preset\'s own links, replace swaps them for the archive\'s', async () => {
  const driver = await migratedDb();
  await seedTwoDimensions(driver);
  const preset: ArchivePreset = { id: 'euphoric', name: 'Euphoric', builtIn: true, dims: ['a'] };
  await applyPresets(restoring(driver, { presets: [preset] }, 'merge', 3));

  await applyPresets(
    restoring(driver, { presets: [{ ...preset, name: 'Renamed', dims: ['b'] }] }, 'merge', 9)
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM gender_preset'))[0].name, 'Euphoric');
  assert.deepEqual(await presetDimensionKeys(driver), ['a']);

  await applyPresets(
    restoring(driver, { presets: [{ ...preset, name: 'Renamed', dims: ['b'] }] }, 'replace', 9)
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM gender_preset'))[0].name, 'Renamed');
  assert.deepEqual(await presetDimensionKeys(driver), ['b']);
});

// applyEntryTemplates ----------------------------------------------------------

test('applyEntryTemplates inserts a template with its tags and dimension values', async () => {
  const driver = await migratedDb();
  await seedTwoDimensions(driver);
  await driver.run(`INSERT INTO tag_group (key, name, updated_at) VALUES ('grp', 'Group', 0)`);
  await driver.run(
    `INSERT INTO tag (key, group_id, label, updated_at) VALUES ('t1', (SELECT id FROM tag_group WHERE key = 'grp'), 'Tag', 0)`
  );
  const template: ArchiveEntryTemplate = {
    id: 'started_hrt',
    name: 'Started HRT',
    tags: ['t1'],
    dims: { a: 40 },
    noteScaffold: 'Today I...',
    presentationId: null,
    builtIn: true,
    hidden: false
  };

  await applyEntryTemplates(restoring(driver, { entryTemplates: [template] }, 'merge', 4));

  const rows = await q(driver, 'SELECT key, name, note_scaffold, updated_at FROM entry_template');
  assert.deepEqual(rows, [{ key: 'started_hrt', name: 'Started HRT', note_scaffold: 'Today I...', updated_at: 4 }]);
  const tagLinks = await q<{ label: string }>(driver, 
    'SELECT t.label FROM entry_template_tag ett JOIN tag t ON t.id = ett.tag_id'
  );
  assert.deepEqual(tagLinks, [{ label: 'Tag' }]);
  const dimLinks = await q<{ value: number }>(driver, 'SELECT value FROM entry_template_dimension_value');
  assert.deepEqual(dimLinks, [{ value: 40 }]);
});

test('applyEntryTemplates merge leaves a matched template alone, replace re-links its children', async () => {
  const driver = await migratedDb();
  await seedTwoDimensions(driver);
  await driver.run(`INSERT INTO tag_group (key, name, updated_at) VALUES ('grp', 'Group', 0)`);
  await driver.run(
    `INSERT INTO tag (key, group_id, label, updated_at) VALUES ('t1', (SELECT id FROM tag_group WHERE key = 'grp'), 'Tag', 0)`
  );
  const template: ArchiveEntryTemplate = {
    id: 'started_hrt',
    name: 'Started HRT',
    tags: ['t1'],
    dims: { a: 40 },
    noteScaffold: 'Today I...',
    presentationId: null,
    builtIn: true,
    hidden: false
  };
  await applyEntryTemplates(restoring(driver, { entryTemplates: [template] }, 'merge', 4));

  await applyEntryTemplates(
    restoring(driver, { entryTemplates: [{ ...template, name: 'Renamed', dims: { b: 10 } }] }, 'merge', 9)
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM entry_template'))[0].name, 'Started HRT');
  assert.deepEqual(await q(driver, 'SELECT value FROM entry_template_dimension_value'), [{ value: 40 }]);

  await applyEntryTemplates(
    restoring(driver, { entryTemplates: [{ ...template, name: 'Renamed', tags: [], dims: { b: 10 } }] }, 'replace', 9)
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM entry_template'))[0].name, 'Renamed');
  assert.deepEqual(await q(driver, 'SELECT value FROM entry_template_dimension_value'), [{ value: 10 }]);
  assert.deepEqual(await q(driver, 'SELECT * FROM entry_template_tag'), []);
});

// applyTagGroups ----------------------------------------------------------------

test('applyTagGroups inserts a group and its tags, in order', async () => {
  const driver = await migratedDb();
  const group: ArchiveTagGroup = {
    key: 'moods',
    name: 'Moods',
    enabled: true,
    builtIn: true,
    tags: [
      { id: 't1', label: 'Euphoric', builtIn: true, hidden: false },
      { id: 't2', label: 'Dysphoric', builtIn: true, hidden: false }
    ]
  };

  await applyTagGroups(restoring(driver, { tagGroups: [group] }, 'merge', 5));

  const groupRows = await q(driver, 'SELECT key, name, order_index FROM tag_group');
  assert.deepEqual(groupRows, [{ key: 'moods', name: 'Moods', order_index: 0 }]);
  const tagRows = await q(driver, 'SELECT key, label, order_index FROM tag ORDER BY order_index');
  assert.deepEqual(tagRows, [
    { key: 't1', label: 'Euphoric', order_index: 0 },
    { key: 't2', label: 'Dysphoric', order_index: 1 }
  ]);
});

test('applyTagGroups walks tags of an existing group in both modes, but only replace renames the group', async () => {
  const driver = await migratedDb();
  const group: ArchiveTagGroup = {
    key: 'moods',
    name: 'Moods',
    enabled: true,
    builtIn: true,
    tags: [{ id: 't1', label: 'Euphoric', builtIn: true, hidden: false }]
  };
  await applyTagGroups(restoring(driver, { tagGroups: [group] }, 'merge', 5));

  await applyTagGroups(
    restoring(
      driver,
      {
        tagGroups: [
          {
            ...group,
            name: 'Renamed',
            tags: [
              { id: 't1', label: 'Relabeled', builtIn: true, hidden: false },
              { id: 't2', label: 'Neutral', builtIn: true, hidden: false }
            ]
          }
        ]
      },
      'merge',
      9
    )
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM tag_group'))[0].name, 'Moods');
  assert.deepEqual(await q(driver, 'SELECT label FROM tag ORDER BY order_index'), [
    { label: 'Euphoric' },
    { label: 'Neutral' }
  ]);

  await applyTagGroups(
    restoring(
      driver,
      { tagGroups: [{ ...group, name: 'Renamed', tags: [{ id: 't1', label: 'Relabeled', builtIn: true, hidden: false }] }] },
      'replace',
      12
    )
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM tag_group'))[0].name, 'Renamed');
  assert.deepEqual(await q(driver, 'SELECT label FROM tag WHERE key = ?', ['t1']), [{ label: 'Relabeled' }]);
});

// applyAffirmations ---------------------------------------------------------

test('applyAffirmations inserts and merge leaves a matched id alone, replace updates it', async () => {
  const driver = await migratedDb();
  const a: ArchiveAffirmation = { id: 'calm', language: null, text: 'I am calm.', builtIn: true, hidden: false };

  await applyAffirmations(restoring(driver, { affirmations: [a] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT key, text, updated_at FROM affirmation'), [
    { key: 'calm', text: 'I am calm.', updated_at: 2 }
  ]);

  await applyAffirmations(restoring(driver, { affirmations: [{ ...a, text: 'Renamed' }] }, 'merge', 5));
  assert.deepEqual((await q<{ text: string }>(driver, 'SELECT text FROM affirmation'))[0].text, 'I am calm.');

  await applyAffirmations(restoring(driver, { affirmations: [{ ...a, text: 'Renamed' }] }, 'replace', 5));
  assert.deepEqual((await q<{ text: string }>(driver, 'SELECT text FROM affirmation'))[0].text, 'Renamed');
});

// applyBodyRegions -----------------------------------------------------------

test('applyBodyRegions inserts and merge leaves a matched id alone, replace updates it', async () => {
  const driver = await migratedDb();
  const r: ArchiveBodyRegion = { id: 'chest', name: 'Chest', builtIn: true, hidden: false };

  await applyBodyRegions(restoring(driver, { bodyRegions: [r] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT key, name FROM body_region'), [{ key: 'chest', name: 'Chest' }]);

  await applyBodyRegions(restoring(driver, { bodyRegions: [{ ...r, name: 'Renamed' }] }, 'merge', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM body_region'))[0].name, 'Chest');

  await applyBodyRegions(restoring(driver, { bodyRegions: [{ ...r, name: 'Renamed' }] }, 'replace', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM body_region'))[0].name, 'Renamed');
});

// applyEntries ----------------------------------------------------------------

test('applyEntries inserts an entry with its dims, tags, body regions and files', async () => {
  const driver = await migratedDb();
  await driver.run(
    `INSERT INTO gender_dimension (key, name, low_label, high_label, updated_at) VALUES ('a', 'A', 'lo', 'hi', 0)`
  );
  await driver.run(`INSERT INTO tag_group (key, name, updated_at) VALUES ('grp', 'Group', 0)`);
  await driver.run(
    `INSERT INTO tag (key, group_id, label, updated_at) VALUES ('t1', (SELECT id FROM tag_group WHERE key = 'grp'), 'Tag', 0)`
  );
  const entry: ArchiveEntry = {
    uuid: 'e1',
    epochDay: 20000,
    timestamp: 20000 * 86400000,
    mood: 3,
    note: 'first entry',
    dims: { a: 40 },
    tags: ['t1'],
    photos: [{ id: 'p1', fileName: 'p1.jpg', starred: true, epochDayOverride: null }],
    recordings: [{ id: 'r1', fileName: 'r1.webm' }],
    videos: [{ id: 'v1', fileName: 'v1.webm' }],
    bodyRegions: { chest: 2 },
    starred: false,
    presentationId: null
  };

  await applyEntries(restoring(driver, { entries: [entry] }, 'merge', 7));

  assert.deepEqual(
    await q(driver, 'SELECT uuid, epoch_day, timestamp, mood, note, starred, presentation_id, updated_at FROM entry'),
    [
      {
        uuid: 'e1',
        epoch_day: 20000,
        timestamp: entry.timestamp,
        mood: 3,
        note: 'first entry',
        starred: 0,
        presentation_id: null,
        updated_at: 7
      }
    ]
  );
  assert.deepEqual(
    await q<{ value: number }>(driver, 
      `SELECT value FROM entry_dimension_value edv JOIN gender_dimension d ON d.id = edv.dimension_id WHERE d.key = 'a'`
    ),
    [{ value: 40 }]
  );
  assert.equal(
    (await q(driver, `SELECT 1 AS x FROM entry_tag et JOIN tag t ON t.id = et.tag_id WHERE t.key = 't1'`)).length,
    1
  );
  assert.deepEqual(await q(driver, 'SELECT region, value FROM entry_body_region'), [{ region: 'chest', value: 2 }]);
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path, starred FROM photo'), [
    { uuid: 'p1', file_path: 'p1.jpg', starred: 1 }
  ]);
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM voice_recording'), [
    { uuid: 'r1', file_path: 'r1.webm' }
  ]);
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM video_note'), [{ uuid: 'v1', file_path: 'v1.webm' }]);
  // A contentless FTS5 table stores no column to read back - MATCH is the
  // only way to prove the folded text actually landed (search.test.ts's own
  // convention).
  assert.equal(
    (await q(driver, `SELECT rowid FROM entry_fts WHERE entry_fts MATCH ?`, [foldText('first entry')])).length,
    1
  );
});

test('applyEntries leaves a matched uuid whole, photos included', async () => {
  const driver = await migratedDb();
  const entry: ArchiveEntry = {
    uuid: 'e1',
    epochDay: 20000,
    timestamp: 20000 * 86400000,
    mood: 3,
    note: 'first entry',
    dims: {},
    tags: [],
    photos: [{ id: 'p1', fileName: 'p1.jpg', starred: false, epochDayOverride: null }],
    recordings: [],
    videos: [],
    bodyRegions: {},
    starred: false,
    presentationId: null
  };
  await applyEntries(restoring(driver, { entries: [entry] }, 'merge', 7));

  await applyEntries(
    restoring(driver, { entries: [{ ...entry, note: 'changed', photos: [] }] }, 'merge', 11)
  );

  assert.deepEqual(await q<{ note: string }>(driver, 'SELECT note FROM entry'), [{ note: 'first entry' }]);
  assert.equal((await q(driver, 'SELECT * FROM photo')).length, 1);
});

// applyMilestones -------------------------------------------------------------

test('applyMilestones inserts a milestone with its photo, and leaves a matched uuid alone', async () => {
  const driver = await migratedDb();
  const milestone: ArchiveMilestone = {
    id: 'm1',
    name: 'Started HRT',
    epochDay: 20000,
    description: 'first shot',
    templateKey: 'started_hrt',
    roadmapGoalKey: null,
    procedureId: null,
    tryoutId: null,
    photo: { id: 'mp1', fileName: 'mp1.jpg', starred: false, epochDayOverride: null }
  };

  await applyMilestones(restoring(driver, { milestones: [milestone] }, 'merge', 4));

  assert.deepEqual(
    await q(driver, 'SELECT uuid, name, epoch_day, description, template_key, updated_at FROM milestone'),
    [{ uuid: 'm1', name: 'Started HRT', epoch_day: 20000, description: 'first shot', template_key: 'started_hrt', updated_at: 4 }]
  );
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM photo'), [{ uuid: 'mp1', file_path: 'mp1.jpg' }]);

  await applyMilestones(restoring(driver, { milestones: [{ ...milestone, name: 'Renamed', photo: null }] }, 'merge', 9));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM milestone'))[0].name, 'Started HRT');
});

// applyMeasurementTypes -------------------------------------------------------

test('applyMeasurementTypes inserts and merge leaves a matched key alone, replace updates it', async () => {
  const driver = await migratedDb();
  const t: ArchiveMeasurementType = { key: 'waist', name: 'Waist', builtIn: true, hidden: false };

  await applyMeasurementTypes(restoring(driver, { measurementTypes: [t] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT key, name FROM measurement_type'), [{ key: 'waist', name: 'Waist' }]);

  await applyMeasurementTypes(restoring(driver, { measurementTypes: [{ ...t, name: 'Renamed' }] }, 'merge', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM measurement_type'))[0].name, 'Waist');

  await applyMeasurementTypes(restoring(driver, { measurementTypes: [{ ...t, name: 'Renamed' }] }, 'replace', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM measurement_type'))[0].name, 'Renamed');
});

// applyCounterevidenceSnapshots ------------------------------------------------

test('applyCounterevidenceSnapshots inserts a snapshot with its items, and leaves a matched uuid alone', async () => {
  const driver = await migratedDb();
  const snapshot: ArchiveCounterevidenceSnapshot = {
    id: 's1',
    epochDay: 20000,
    timestamp: 20000 * 86400000,
    items: [{ epochDay: 19990, mood: 4, note: 'felt good' }]
  };

  await applyCounterevidenceSnapshots(restoring(driver, { counterevidenceSnapshots: [snapshot] }, 'merge', 3));

  assert.deepEqual(await q(driver, 'SELECT uuid, epoch_day, timestamp, updated_at FROM doubt_snapshot'), [
    { uuid: 's1', epoch_day: 20000, timestamp: snapshot.timestamp, updated_at: 3 }
  ]);
  assert.deepEqual(await q(driver, 'SELECT order_index, epoch_day, mood, note FROM doubt_snapshot_entry'), [
    { order_index: 0, epoch_day: 19990, mood: 4, note: 'felt good' }
  ]);

  await applyCounterevidenceSnapshots(
    restoring(driver, { counterevidenceSnapshots: [{ ...snapshot, items: [] }] }, 'merge', 9)
  );
  assert.equal((await q(driver, 'SELECT * FROM doubt_snapshot')).length, 1);
  assert.equal((await q(driver, 'SELECT * FROM doubt_snapshot_entry')).length, 1);
});

// applyRoadmapChecks ------------------------------------------------------------

test('applyRoadmapChecks inserts a check and leaves a matched pack/goal pair alone', async () => {
  const driver = await migratedDb();
  const check: ArchiveRoadmapCheck = { packKey: 'poland', goalKey: 'legal-name', status: 'checked' };

  await applyRoadmapChecks(restoring(driver, { roadmapChecks: [check] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT pack_key, goal_key, status FROM roadmap_check'), [
    { pack_key: 'poland', goal_key: 'legal-name', status: 'checked' }
  ]);

  await applyRoadmapChecks(restoring(driver, { roadmapChecks: [{ ...check, status: 'not_my_path' }] }, 'merge', 9));
  assert.deepEqual((await q<{ status: string }>(driver, 'SELECT status FROM roadmap_check'))[0].status, 'checked');
});

// applyChecklists ---------------------------------------------------------------

test('applyChecklists inserts a checklist with its items', async () => {
  const driver = await migratedDb();
  const checklist: ArchiveChecklist = {
    id: 'prep',
    ownerKind: null,
    ownerId: null,
    appointmentEpochDay: 20000,
    items: [{ id: 'item-1', content: 'Bring ID', checked: false, carriedForward: false }]
  };

  await applyChecklists(restoring(driver, { checklists: [checklist] }, 'merge', 4));

  assert.deepEqual(await q(driver, 'SELECT uuid, appointment_epoch_day FROM checklist'), [
    { uuid: 'prep', appointment_epoch_day: 20000 }
  ]);
  assert.deepEqual(await q(driver, 'SELECT uuid, content, order_index FROM checklist_item'), [
    { uuid: 'item-1', content: 'Bring ID', order_index: 0 }
  ]);
});

test('applyChecklists walks an existing checklist\'s items in both modes, appending in merge and positioning in replace', async () => {
  const driver = await migratedDb();
  const checklist: ArchiveChecklist = {
    id: 'prep',
    ownerKind: null,
    ownerId: null,
    appointmentEpochDay: 20000,
    items: [{ id: 'item-1', content: 'Bring ID', checked: false, carriedForward: false }]
  };
  await applyChecklists(restoring(driver, { checklists: [checklist] }, 'merge', 4));

  await applyChecklists(
    restoring(
      driver,
      {
        checklists: [
          {
            ...checklist,
            items: [
              { id: 'item-1', content: 'Renamed', checked: true, carriedForward: false },
              { id: 'item-2', content: 'Bring insurance card', checked: false, carriedForward: false }
            ]
          }
        ]
      },
      'merge',
      8
    )
  );
  assert.deepEqual(await q(driver, 'SELECT uuid, content, order_index FROM checklist_item ORDER BY order_index'), [
    { uuid: 'item-1', content: 'Bring ID', order_index: 0 },
    { uuid: 'item-2', content: 'Bring insurance card', order_index: 1 }
  ]);

  const solo = await migratedDb();
  await applyChecklists(restoring(solo, { checklists: [checklist] }, 'merge', 4));
  await applyChecklists(
    restoring(
      solo,
      {
        checklists: [
          { ...checklist, items: [{ id: 'item-1', content: 'Renamed', checked: true, carriedForward: false }] }
        ]
      },
      'replace',
      12
    )
  );
  assert.deepEqual(await q(solo, 'SELECT uuid, content, checked, order_index FROM checklist_item'), [
    { uuid: 'item-1', content: 'Renamed', checked: 1, order_index: 0 }
  ]);
});

// applyTryouts --------------------------------------------------------------

test('applyTryouts inserts a tryout with its photos, and leaves a matched uuid whole while still walking photos', async () => {
  const driver = await migratedDb();
  const tryout: ArchiveTryout = {
    id: 't1',
    kind: 'name',
    label: 'Trying "Alex"',
    description: null,
    startEpochDay: 20000,
    endEpochDay: null,
    photos: [{ id: 'p1', epochDay: 20000, fileName: 'p1.jpg' }]
  };

  await applyTryouts(restoring(driver, { tryouts: [tryout] }, 'merge', 3));

  assert.deepEqual(await q(driver, 'SELECT uuid, kind, label FROM tryout'), [
    { uuid: 't1', kind: 'name', label: 'Trying "Alex"' }
  ]);
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM tryout_photo'), [{ uuid: 'p1', file_path: 'p1.jpg' }]);

  await applyTryouts(
    restoring(
      driver,
      {
        tryouts: [
          { ...tryout, label: 'Renamed', photos: [{ id: 'p2', epochDay: 20001, fileName: 'p2.jpg' }] }
        ]
      },
      'merge',
      9
    )
  );
  assert.deepEqual((await q<{ label: string }>(driver, 'SELECT label FROM tryout'))[0].label, 'Trying "Alex"');
  assert.deepEqual(await q(driver, 'SELECT uuid FROM tryout_photo ORDER BY uuid'), [{ uuid: 'p1' }, { uuid: 'p2' }]);
});

// applyFeltSenseEntries -------------------------------------------------------

test('applyFeltSenseEntries resolves its tryout owner, and drops an entry whose owner is not there', async () => {
  const driver = await migratedDb();
  await applyTryouts(
    restoring(
      driver,
      { tryouts: [{ id: 't1', kind: 'name', label: 'Trying "Alex"', description: null, startEpochDay: 20000, endEpochDay: null, photos: [] }] },
      'merge',
      1
    )
  );
  const entry: ArchiveFeltSenseEntry = {
    id: 'fs1',
    tryoutId: 't1',
    milestoneId: null,
    epochDay: 20000,
    mood: 3,
    note: 'felt right'
  };

  await applyFeltSenseEntries(
    restoring(driver, { feltSenseEntries: [entry, { ...entry, id: 'fs2', tryoutId: 'missing' }] }, 'merge', 5)
  );

  const rows = await q<{ uuid: string; tryout_id: number | null }>(driver, 
    'SELECT uuid, tryout_id FROM felt_sense'
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].uuid, 'fs1');
  assert.ok(rows[0].tryout_id !== null);
});

// applyMarginNotes --------------------------------------------------------------

test('applyMarginNotes resolves its entry owner, and drops a note whose entry is not there', async () => {
  const driver = await migratedDb();
  await applyEntries(
    restoring(
      driver,
      {
        entries: [
          {
            uuid: 'e1',
            epochDay: 20000,
            timestamp: 20000 * 86400000,
            mood: null,
            note: '',
            dims: {},
            tags: [],
            photos: [],
            recordings: [],
            videos: [],
            bodyRegions: {},
            starred: false,
            presentationId: null
          }
        ]
      },
      'merge',
      1
    )
  );
  const note: ArchiveMarginNote = { id: 'mn1', entryId: 'e1', epochDay: 20000, text: 'a thought' };

  await applyMarginNotes(restoring(driver, { marginNotes: [note, { ...note, id: 'mn2', entryId: 'missing' }] }, 'merge', 6));

  assert.deepEqual(await q(driver, 'SELECT uuid, text FROM margin_note'), [{ uuid: 'mn1', text: 'a thought' }]);
});

// applyDoseSchedules ------------------------------------------------------------

test('applyDoseSchedules inserts a schedule with its weekdays and dose amounts', async () => {
  const driver = await migratedDb();
  await seedRegimenEpisode(driver, 'ep1');
  const schedule: ArchiveDoseSchedule = {
    id: 'sch1',
    episodeId: 'ep1',
    recurrenceKind: 'weekdays',
    everyNDays: null,
    weekdays: [0, 3],
    dosesPerDay: 1,
    doseAmounts: [{ dose: 2, doseUnit: 'mg' }],
    autoLogFromEpochDay: null
  };

  await applyDoseSchedules(restoring(driver, { doseSchedules: [schedule] }, 'merge', 4));

  assert.deepEqual(
    await q(driver, 'SELECT uuid, recurrence_kind, doses_per_day, auto_log_from_epoch_day FROM dose_schedule'),
    [{ uuid: 'sch1', recurrence_kind: 'weekdays', doses_per_day: 1, auto_log_from_epoch_day: null }]
  );
  assert.deepEqual(await q(driver, 'SELECT weekday FROM dose_schedule_weekday ORDER BY weekday'), [
    { weekday: 0 },
    { weekday: 3 }
  ]);
  assert.deepEqual(await q(driver, 'SELECT dose, dose_unit FROM dose_schedule_dose_amount'), [
    { dose: 2, dose_unit: 'mg' }
  ]);
});

test('applyDoseSchedules drops a schedule with no episode, and a second one for an episode that already has its own', async () => {
  const driver = await migratedDb();
  await seedRegimenEpisode(driver, 'ep1');
  const base: ArchiveDoseSchedule = {
    id: 'sch1',
    episodeId: 'ep1',
    recurrenceKind: 'everyNDays',
    everyNDays: 7,
    weekdays: null,
    dosesPerDay: 1,
    doseAmounts: null,
    autoLogFromEpochDay: null
  };

  await applyDoseSchedules(
    restoring(
      driver,
      {
        doseSchedules: [
          base,
          { ...base, id: 'sch2', episodeId: 'ep1' },
          { ...base, id: 'sch3', episodeId: 'missing' }
        ]
      },
      'merge',
      4
    )
  );

  assert.deepEqual(await q(driver, 'SELECT uuid FROM dose_schedule'), [{ uuid: 'sch1' }]);
});

// applyDosePauses -----------------------------------------------------------

test('applyDosePauses inserts a pause resolved against its episode, and drops one with no episode', async () => {
  const driver = await migratedDb();
  await seedRegimenEpisode(driver, 'ep1');
  const pause: ArchiveDosePause = { id: 'pause1', episodeId: 'ep1', startEpochDay: 20000, endEpochDay: null, reason: 'travel' };

  await applyDosePauses(
    restoring(driver, { dosePauses: [pause, { ...pause, id: 'pause2', episodeId: 'missing' }] }, 'merge', 3)
  );

  assert.deepEqual(await q(driver, 'SELECT uuid, start_epoch_day, reason FROM dose_pause'), [
    { uuid: 'pause1', start_epoch_day: 20000, reason: 'travel' }
  ]);
});

// applyEffectCategories ---------------------------------------------------------

test('applyEffectCategories inserts and merge leaves a matched key alone, replace updates it', async () => {
  const driver = await migratedDb();
  const c: ArchiveEffectCategory = { key: 'skin', name: 'Skin and hair', enabled: true };

  await applyEffectCategories(restoring(driver, { effectCategories: [c] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT key, name, enabled FROM effect_category'), [
    { key: 'skin', name: 'Skin and hair', enabled: 1 }
  ]);

  await applyEffectCategories(restoring(driver, { effectCategories: [{ ...c, name: 'Renamed' }] }, 'merge', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM effect_category'))[0].name, 'Skin and hair');

  await applyEffectCategories(restoring(driver, { effectCategories: [{ ...c, name: 'Renamed' }] }, 'replace', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM effect_category'))[0].name, 'Renamed');
});

// applyPersonalEffectTypes -------------------------------------------------------

test('applyPersonalEffectTypes inserts and merge leaves a matched key alone, replace updates it', async () => {
  const driver = await migratedDb();
  const t: ArchivePersonalEffectType = {
    key: 'breast-growth',
    name: 'Breast growth',
    builtIn: true,
    hidden: false,
    categoryKey: null,
    direction: 'feminizing'
  };

  await applyPersonalEffectTypes(restoring(driver, { personalEffectTypes: [t] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT key, name, direction FROM personal_effect_type'), [
    { key: 'breast-growth', name: 'Breast growth', direction: 'feminizing' }
  ]);

  await applyPersonalEffectTypes(restoring(driver, { personalEffectTypes: [{ ...t, name: 'Renamed' }] }, 'merge', 5));
  assert.deepEqual(
    (await q<{ name: string }>(driver, 'SELECT name FROM personal_effect_type'))[0].name,
    'Breast growth'
  );

  await applyPersonalEffectTypes(restoring(driver, { personalEffectTypes: [{ ...t, name: 'Renamed' }] }, 'replace', 5));
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM personal_effect_type'))[0].name, 'Renamed');
});

// applyHairPhotos -----------------------------------------------------------

test('applyHairPhotos inserts and leaves a matched uuid alone', async () => {
  const driver = await migratedDb();
  const p: ArchiveHairPhoto = { id: 'hp1', epochDay: 20000, fileName: 'hp1.jpg' };

  await applyHairPhotos(restoring(driver, { hairPhotos: [p] }, 'merge', 2));
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM hair_photo'), [{ uuid: 'hp1', file_path: 'hp1.jpg' }]);

  await applyHairPhotos(restoring(driver, { hairPhotos: [{ ...p, fileName: 'other.jpg' }] }, 'merge', 5));
  assert.equal((await q(driver, 'SELECT * FROM hair_photo')).length, 1);
});

// applyHairRemovalSessions ----------------------------------------------------

test('applyHairRemovalSessions inserts a session with its photos, and walks photos on a matched uuid without updating it', async () => {
  const driver = await migratedDb();
  const session: ArchiveHairRemovalSession = {
    id: 'hrs1',
    epochDay: 20000,
    area: 'chest',
    method: 'laser',
    painRating: 3,
    cost: '150 PLN',
    provider: 'Clinic A',
    photos: [{ id: 'hp1', fileName: 'hp1.jpg' }]
  };

  await applyHairRemovalSessions(restoring(driver, { hairRemovalSessions: [session] }, 'merge', 3));

  assert.deepEqual(await q(driver, 'SELECT uuid, area, provider FROM hair_removal_session'), [
    { uuid: 'hrs1', area: 'chest', provider: 'Clinic A' }
  ]);
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM hair_removal_photo'), [
    { uuid: 'hp1', file_path: 'hp1.jpg' }
  ]);

  await applyHairRemovalSessions(
    restoring(
      driver,
      { hairRemovalSessions: [{ ...session, provider: 'Renamed', photos: [{ id: 'hp2', fileName: 'hp2.jpg' }] }] },
      'merge',
      9
    )
  );
  assert.deepEqual(
    (await q<{ provider: string }>(driver, 'SELECT provider FROM hair_removal_session'))[0].provider,
    'Clinic A'
  );
  assert.deepEqual(await q(driver, 'SELECT uuid FROM hair_removal_photo ORDER BY uuid'), [
    { uuid: 'hp1' },
    { uuid: 'hp2' }
  ]);
});

// applyProcedures -----------------------------------------------------------

test('applyProcedures inserts a procedure with its photos, defaulting an absent kind, and walks photos on a matched uuid without updating it', async () => {
  const driver = await migratedDb();
  const procedure: ArchiveProcedure = {
    id: 'proc1',
    name: 'Vaginoplasty',
    surgeryEpochDay: 20100,
    notes: '',
    photos: [{ id: 'pp1', epochDay: 20101, fileName: 'pp1.jpg' }]
  };

  await applyProcedures(restoring(driver, { procedures: [procedure] }, 'merge', 3));

  assert.deepEqual(await q(driver, 'SELECT uuid, name, kind, dilation_opt_in, archived FROM procedure'), [
    { uuid: 'proc1', name: 'Vaginoplasty', kind: 'custom', dilation_opt_in: 0, archived: 0 }
  ]);
  assert.deepEqual(await q(driver, 'SELECT uuid, file_path FROM procedure_photo'), [
    { uuid: 'pp1', file_path: 'pp1.jpg' }
  ]);

  await applyProcedures(
    restoring(
      driver,
      { procedures: [{ ...procedure, name: 'Renamed', photos: [{ id: 'pp2', epochDay: 20102, fileName: 'pp2.jpg' }] }] },
      'merge',
      9
    )
  );
  assert.deepEqual((await q<{ name: string }>(driver, 'SELECT name FROM procedure'))[0].name, 'Vaginoplasty');
  assert.deepEqual(await q(driver, 'SELECT uuid FROM procedure_photo ORDER BY uuid'), [
    { uuid: 'pp1' },
    { uuid: 'pp2' }
  ]);
});

// applyTaper ------------------------------------------------------------------

test('applyTaper resolves its procedure link, drops a taper whose procedure is not there, and leaves a matched uuid alone', async () => {
  const driver = await migratedDb();
  await seedProcedure(driver, 'proc1');
  const taper: ArchiveTaper = { id: 'taper1', procedureId: 'proc1', startEpochDay: 20100, stagesJson: '[]' };

  await applyTaper(restoring(driver, { taper: [taper, { ...taper, id: 'taper2', procedureId: 'missing' }] }, 'merge', 4));

  const rows = await q<{ uuid: string; procedure_id: number }>(driver, 'SELECT uuid, procedure_id FROM taper');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].uuid, 'taper1');

  await applyTaper(restoring(driver, { taper: [{ ...taper, stagesJson: '["x"]' }] }, 'merge', 9));
  assert.deepEqual((await q<{ stages: string }>(driver, 'SELECT stages FROM taper'))[0].stages, '[]');
});

// applyAppointments -------------------------------------------------------------

test('applyAppointments resolves its optional procedure link, keeps the day when it cannot, and leaves a matched uuid alone', async () => {
  const driver = await migratedDb();
  await seedProcedure(driver, 'proc1');
  const linked: ArchiveAppointment = { id: 'appt1', epochDay: 20000, procedureId: 'proc1', kind: 'endokrynolog', place: null, note: null };
  const dangling: ArchiveAppointment = { id: 'appt2', epochDay: 20010, procedureId: 'missing', kind: null, place: null, note: null };

  await applyAppointments(restoring(driver, { appointments: [linked, dangling] }, 'merge', 3));

  const rows = await q<{ uuid: string; procedure_id: number | null; epoch_day: number }>(driver, 
    'SELECT uuid, procedure_id, epoch_day FROM appointment ORDER BY uuid'
  );
  assert.equal(rows[0].uuid, 'appt1');
  assert.ok(rows[0].procedure_id !== null);
  assert.deepEqual([rows[1].uuid, rows[1].procedure_id, rows[1].epoch_day], ['appt2', null, 20010]);

  await applyAppointments(restoring(driver, { appointments: [{ ...linked, kind: 'Renamed' }] }, 'merge', 9));
  assert.deepEqual(
    (await q<{ kind: string }>(driver, "SELECT kind FROM appointment WHERE uuid = 'appt1'"))[0].kind,
    'endokrynolog'
  );
});

// applyImportLog, recordImport, importLogRow -----------------------------------

test('applyImportLog inserts a record the device does not have yet and leaves a matched uuid alone', async () => {
  const driver = await migratedDb();
  const record: ArchiveImportLogRecord = { id: 'rec1', source: 'daylio', importedAt: 100, counts: { entries: 2 } };

  await applyImportLog(restoring(driver, { importLog: [record] }, 'merge', 5));
  assert.deepEqual(
    await q(driver, 'SELECT uuid, source, counts, imported_at, updated_at FROM import_log'),
    [{ uuid: 'rec1', source: 'daylio', counts: JSON.stringify({ entries: 2 }), imported_at: 100, updated_at: 5 }]
  );

  await applyImportLog(restoring(driver, { importLog: [{ ...record, source: 'pixels' }] }, 'merge', 9));
  assert.deepEqual((await q<{ source: string }>(driver, 'SELECT source FROM import_log'))[0].source, 'daylio');
});

test('recordImport writes one row with a minted uuid and both timestamps set from the moment it runs', async () => {
  const driver = await migratedDb();

  await recordImport(driver, 'daylio', { entries: 3, tags: 1 });

  const rows = await q<{
    uuid: string;
    source: string;
    counts: string;
    imported_at: number;
    updated_at: number;
  }>(driver, 'SELECT uuid, source, counts, imported_at, updated_at FROM import_log');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'daylio');
  assert.deepEqual(JSON.parse(rows[0].counts), { entries: 3, tags: 1 });
  assert.equal(rows[0].imported_at, rows[0].updated_at);
  assert.match(rows[0].uuid, /^[0-9a-f-]{36}$/);
});

test('importLogRow orders its values to match IMPORT_LOG_COLUMNS', () => {
  const row = importLogRow({ id: 'rec1', source: 'pixels', counts: { entries: 2 }, importedAt: 100 }, 200);

  assert.deepEqual(row, ['rec1', 'pixels', JSON.stringify({ entries: 2 }), 100, 200]);
  assert.equal(IMPORT_LOG_COLUMNS.split(', ').length, row.length);
});

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { thumbFileName } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { epochDayFromTimestamp } from '../epochDay.ts';

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

async function populated() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();

  const voice = await journal.dimensions.addCustomDimension({ name: 'Voice comfort', low: 'off', high: 'mine', min: 0, max: 10 });
  const preset = await journal.dimensions.addPreset({ name: 'Mine', dims: [voice.key, 'femininity'] });
  const group = await journal.tags.addGroup('Appointments');
  const tag = await journal.tags.addTag(group.key, 'endo');
  await journal.tags.setTagHidden('a-work', true);
  await journal.tags.renameTag('a-therapy', 'therapy session');

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    bodyRegions: { chest: 40 }
  });
  const photo = await journal.photos.attach({ entryId: entry }, { full: bytes('full-photo'), thumb: bytes('thumb') });
  const second = await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });

  const milestone = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 19000, templateKey: 'hrt_start' });
  const milestonePhoto = await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  const lab = await journal.labs.upsertResult({ epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L', note: 'fasting' });
  const measurement = await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 79, unit: 'cm' });
  const tally = await journal.tally.log({ epochDay: 20000, kind: 'misgendered', context: 'wrong pronoun at the pharmacy' });
  const sideEffect = await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
  const personalEffect = await journal.personalEffects.upsertMarker({
    effect: 'breast_development',
    firstNoticedEpochDay: 19180
  });
  const reminder = await journal.reminders.upsertReminder({
    title: 'injection',
    type: 'injection',
    time: '08:00',
    recurrence: 'EVERY_N_DAYS',
    interval: 7,
    anchorEpochDay: 20000,
    epochDay: null,
    enabled: true
  });
  const episode = await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: 19000
  });

  const dose = await journal.doses.upsertDose({
    timestamp: 1_700_000_000_000,
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'ventrogluteal-left',
    vehicle: 'oil'
  });

  /* Saved while that injection is the only dose logged, so its frozen
     day-of-interval is a fixed 5 rather than something the sublingual dose
     below would move. That the dose logged afterwards does not change it is
     the freeze this archive then has to carry across (ticket 03). */
  const contextLab = await journal.labs.upsertResult({
    epochDay: epochDayFromTimestamp(1_700_000_000_000) + 4,
    analyte: 'estradiol',
    value: 300,
    unit: 'pmol/L',
    drawTime: '07:40',
    provider: 'Diagnostyka'
  });

  const changedDose = await journal.doses.upsertDose({
    timestamp: 1_700_100_000_000,
    route: 'sublingual',
    dose: 1,
    doseUnit: 'mg',
    status: 'changed',
    scheduled: { dose: 2, route: 'oral', timestamp: 1_700_090_000_000 }
  });
  const schedule = await journal.doses.upsertSchedule({ episodeId: episode, everyNDays: 14, dosesPerDay: 1 });
  const dosePause = await journal.doses.upsertPause({
    episodeId: episode,
    startEpochDay: 19100,
    endEpochDay: 19110,
    reason: 'accidental'
  });

  const stock = await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000
  });

  return {
    db,
    files,
    journal,
    voice,
    preset,
    group,
    tag,
    entry,
    second,
    photo,
    milestone,
    milestonePhoto,
    lab,
    measurement,
    tally,
    contextLab,
    reminder,
    episode,
    dose,
    changedDose,
    schedule,
    dosePause,
    stock,
    sideEffect,
    personalEffect
  };
}

test('entries travel by uuid, with their dimension values, tags and photos', async () => {
  const { db, journal, voice, tag, entry, photo } = await populated();

  const snapshot = await journal.archive.snapshot();

  const uuid = (await db.query<{ uuid: string }>('SELECT uuid FROM entry WHERE id = ?', [entry]))[0].uuid;
  const first = snapshot.journal.entries.find((e) => e.uuid === uuid)!;
  assert.deepEqual(first, {
    uuid,
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day',
    dims: { [voice.key]: 7, femininity: 60 },
    // A built-in tag by key, a custom one by uuid, in the order the tag
    // rows are in - an entry's tags are a set, so it is the ids that
    // matter, not which of them the seed happened to create first.
    tags: ['e-happy', tag.id],
    photos: [{ id: photo, fileName: `${photo}.jpg` }],
    bodyRegions: { chest: 40 }
  });
  assert.equal(snapshot.journal.entries.length, 2);
});

test('an entry with nothing but a mood carries empty collections, not missing ones', async () => {
  const { db, journal, second } = await populated();

  const snapshot = await journal.archive.snapshot();

  const uuid = (await db.query<{ uuid: string }>('SELECT uuid FROM entry WHERE id = ?', [second]))[0].uuid;
  const entry = snapshot.journal.entries.find((e) => e.uuid === uuid)!;
  assert.deepEqual(entry.dims, {});
  assert.deepEqual(entry.tags, []);
  assert.deepEqual(entry.photos, []);
  assert.deepEqual(entry.bodyRegions, {});
  assert.equal(entry.note, '');
});

test('built-in rows travel by key and custom rows by uuid (ADR-0002)', async () => {
  const { journal, voice, preset, group, tag } = await populated();

  const snapshot = await journal.archive.snapshot();

  const femininity = snapshot.journal.dimensions.find((d) => d.key === 'femininity')!;
  assert.equal(femininity.builtIn, true);
  const custom = snapshot.journal.dimensions.find((d) => d.key === voice.key)!;
  assert.deepEqual(custom, { key: voice.key, name: 'Voice comfort', low: 'off', high: 'mine', min: 0, max: 10, builtIn: false, hidden: false });

  assert.deepEqual(
    snapshot.journal.presets.find((p) => p.id === preset.id),
    { id: preset.id, name: 'Mine', builtIn: false, dims: [voice.key, 'femininity'] }
  );
  assert.ok(snapshot.journal.presets.some((p) => p.id === 'p-btw' && p.builtIn));

  const appointments = snapshot.journal.tagGroups.find((g) => g.key === group.key)!;
  assert.equal(appointments.builtIn, false);
  assert.deepEqual(appointments.tags, [{ id: tag.id, label: 'endo', builtIn: false, hidden: false }]);
});

test('the state a user put on a built-in row travels with it', async () => {
  const { journal } = await populated();

  const snapshot = await journal.archive.snapshot();

  const activities = snapshot.journal.tagGroups.find((g) => g.key === 'activities')!;
  assert.equal(activities.builtIn, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-work')!.hidden, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-therapy')!.label, 'therapy session');
});

test('milestones, lab results, measurements, tally events, side effects, reminders and regimen episodes travel whole', async () => {
  const { journal, milestone, milestonePhoto, lab, contextLab, measurement, tally, sideEffect, personalEffect, reminder, episode } =
    await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.milestones, [
    {
      id: milestone,
      name: 'HRT start',
      epochDay: 19000,
      templateKey: 'hrt_start',
      photo: { id: milestonePhoto, fileName: `${milestonePhoto}.jpg` }
    }
  ]);
  /* Ordered by draw day, so the one carrying a dosing context comes first.
     The other was saved before any dose was logged and travels with its
     context empty rather than zeroed. */
  assert.deepEqual(snapshot.journal.labResults, [
    {
      id: contextLab,
      epochDay: epochDayFromTimestamp(1_700_000_000_000) + 4,
      analyte: 'estradiol',
      value: 300,
      unit: 'pmol/L',
      note: '',
      drawTime: '07:40',
      provider: 'Diagnostyka',
      timingRoute: 'im',
      timingHours: null,
      timingDayOfInterval: 5
    },
    {
      id: lab,
      epochDay: 20000,
      analyte: 'estradiol',
      value: 412.5,
      unit: 'pmol/L',
      note: 'fasting',
      drawTime: null,
      provider: '',
      timingRoute: null,
      timingHours: null,
      timingDayOfInterval: null
    }
  ]);
  assert.deepEqual(snapshot.journal.measurements, [
    { id: measurement, type: 'waist', epochDay: 20000, value: 79, unit: 'cm' }
  ]);
  assert.deepEqual(snapshot.journal.tallyEvents, [
    { id: tally, epochDay: 20000, kind: 'misgendered', context: 'wrong pronoun at the pharmacy' }
  ]);
  assert.deepEqual(snapshot.journal.sideEffects, [
    { id: sideEffect, name: 'hot flashes', severity: 3, epochDay: 20000 }
  ]);
  assert.deepEqual(snapshot.journal.personalEffects, [
    { id: personalEffect, effect: 'breast_development', firstNoticedEpochDay: 19180 }
  ]);
  assert.deepEqual(snapshot.journal.reminders, [
    {
      id: reminder,
      title: 'injection',
      type: 'injection',
      time: '08:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 7,
      anchorEpochDay: 20000,
      epochDay: null,
      enabled: true,
      autoSource: null
    }
  ]);
  assert.deepEqual(snapshot.journal.regimenEpisodes, [
    {
      id: episode,
      drug: 'estradiol valerate',
      ester: 'valerate',
      dose: 4,
      doseUnit: 'mg',
      route: 'im',
      interval: 'every 2 weeks',
      startEpochDay: 19000,
      hidden: false
    }
  ]);
});

test('dose events travel whole, including the route-conditional fields and a changed dose\'s scheduled value', async () => {
  const { journal, dose, changedDose } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.doseEvents, [
    {
      id: dose,
      timestamp: 1_700_000_000_000,
      route: 'im',
      dose: 4,
      doseUnit: 'mg',
      injectionSite: 'ventrogluteal-left',
      vehicle: 'oil',
      applicationSite: null,
      status: 'taken',
      scheduledDose: null,
      scheduledRoute: null,
      scheduledTimestamp: null
    },
    {
      id: changedDose,
      timestamp: 1_700_100_000_000,
      route: 'sublingual',
      dose: 1,
      doseUnit: 'mg',
      injectionSite: null,
      vehicle: null,
      applicationSite: null,
      status: 'changed',
      scheduledDose: 2,
      scheduledRoute: 'oral',
      scheduledTimestamp: 1_700_090_000_000
    }
  ]);
});

test('a dose carries no episode link, so nothing about its attribution travels', async () => {
  const { journal } = await populated();

  const snapshot = await journal.archive.snapshot();

  for (const dose of snapshot.journal.doseEvents) {
    assert.deepEqual(
      Object.keys(dose).filter((key) => key.toLowerCase().includes('episode')),
      []
    );
  }
});

test('schedules and pauses name their episode by its travelling uuid, not this device\'s rowid', async () => {
  const { journal, episode, schedule, dosePause } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.doseSchedules, [
    { id: schedule, episodeId: episode, everyNDays: 14, dosesPerDay: 1 }
  ]);
  assert.deepEqual(snapshot.journal.dosePauses, [
    { id: dosePause, episodeId: episode, startEpochDay: 19100, endEpochDay: 19110, reason: 'accidental' }
  ]);
});

test('medication stock travels whole, including its reminder hand-off bookkeeping', async () => {
  const { journal, stock } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.medicationStock, [
    {
      id: stock,
      drug: 'estradiol valerate',
      quantity: 10,
      unit: 'vials',
      recordedEpochDay: 19000,
      reminderEverCreated: false,
      reminderDismissed: false
    }
  ]);
});

test('the manifest names every photo file and its thumbnail, with their lengths', async () => {
  const { journal, photo, milestonePhoto } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.files, [
    { name: `${photo}.jpg`, length: 10 },
    { name: thumbFileName(`${photo}.jpg`), length: 5 },
    { name: `${milestonePhoto}.jpg`, length: 1 },
    { name: thumbFileName(`${milestonePhoto}.jpg`), length: 2 }
  ]);
  assert.deepEqual(await snapshot.readFile(`${photo}.jpg`), bytes('full-photo'));
});

test('a photo row whose file is gone keeps its row and leaves the manifest alone', async () => {
  const { journal, files, photo } = await populated();
  await files.remove(`${photo}.jpg`);

  const snapshot = await journal.archive.snapshot();

  assert.ok(!snapshot.files.some((f) => f.name === `${photo}.jpg`));
  assert.ok(snapshot.files.some((f) => f.name === thumbFileName(`${photo}.jpg`)));
  assert.equal(snapshot.journal.entries.flatMap((e) => e.photos).filter((p) => p.id === photo).length, 1);
});

/* Every column of every table, checked against what the snapshot claims to
   carry. The point is drift: an archive that quietly stops carrying a
   column added later is a backup that silently loses data, and nothing
   else in this suite would notice. A new column fails here until it is
   either carried or listed as deliberately left behind. */
const CARRIED: Record<string, string[]> = {
  entry: ['uuid', 'epoch_day', 'timestamp', 'mood', 'note'],
  entry_dimension_value: ['entry_id', 'dimension_id', 'value'],
  entry_tag: ['entry_id', 'tag_id'],
  entry_body_region: ['entry_id', 'region', 'intensity'],
  photo: ['uuid', 'entry_id', 'milestone_id', 'file_path', 'order_index'],
  milestone: ['uuid', 'name', 'epoch_day', 'template_key'],
  gender_dimension: ['uuid', 'key', 'name', 'low_label', 'high_label', 'min_value', 'max_value', 'is_built_in', 'hidden'],
  gender_preset: ['uuid', 'key', 'name', 'is_built_in'],
  preset_dimension: ['preset_id', 'dimension_id', 'order_index'],
  tag_group: ['uuid', 'key', 'name', 'enabled', 'order_index'],
  tag: ['uuid', 'key', 'group_id', 'label', 'hidden', 'order_index'],
  reminder: [
    'uuid',
    'title',
    'type',
    'time',
    'recurrence',
    'interval',
    'anchor_epoch_day',
    'epoch_day',
    'enabled',
    'auto_source'
  ],
  /* The dosing context travels: a device importing this cannot re-derive it,
     because the dose log it was measured against is not the one being
     imported into (ticket 03). */
  lab_result: [
    'uuid',
    'epoch_day',
    'analyte',
    'value',
    'unit',
    'note',
    'draw_time',
    'provider',
    'timing_route',
    'timing_hours',
    'timing_day_of_interval'
  ],
  measurement: ['uuid', 'epoch_day', 'type', 'value', 'unit'],
  tally_event: ['uuid', 'epoch_day', 'kind', 'context'],
  regimen_episode: ['uuid', 'drug', 'ester', 'dose', 'dose_unit', 'route', 'interval', 'start_epoch_day', 'hidden'],
  dose_event: [
    'uuid',
    'timestamp',
    'route',
    'dose',
    'dose_unit',
    'injection_site',
    'vehicle',
    'application_site',
    'status',
    'scheduled_dose',
    'scheduled_route',
    'scheduled_timestamp'
  ],
  // episode_id travels as the episode's uuid, the way preset_dimension's
  // rowids travel as keys (ADR-0002).
  dose_schedule: ['uuid', 'episode_id', 'every_n_days', 'doses_per_day'],
  dose_pause: ['uuid', 'episode_id', 'start_epoch_day', 'end_epoch_day', 'reason'],
  medication_stock: [
    'uuid',
    'drug',
    'quantity',
    'unit',
    'recorded_epoch_day',
    'reminder_ever_created',
    'reminder_dismissed'
  ],
  side_effect: ['uuid', 'name', 'severity', 'epoch_day'],
  personal_effect: ['uuid', 'effect', 'first_noticed_epoch_day'],
  hair_stage: ['uuid', 'epoch_day', 'stage'],
  hair_photo: ['uuid', 'epoch_day', 'file_path'],
  // Filtered by the portable allowlist rather than carried whole (ADR-0003).
  pref: ['key', 'value']
};

/* `id` is this device's rowid and means nothing anywhere else (ADR-0002);
   `updated_at` is written by every area and read by nothing, and an
   archive that carried it would be asserting a fact about another
   device's clock. */
const LEFT_BEHIND = ['id', 'updated_at'];

test('every column in the schema is either carried or deliberately left behind', async () => {
  const { db } = await populated();

  const tables = await db.query<{ name: string }>(
    // entry_fts and its shadow tables are the search index: derived from
    // entry.note, rebuilt by the writes an import makes (ADR-0005/0010).
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts%' ORDER BY name"
  );
  assert.deepEqual(
    tables.map((t) => t.name).sort(),
    Object.keys(CARRIED).sort(),
    'a table the archive has never heard of'
  );

  for (const { name } of tables) {
    const columns = await db.query<{ name: string }>(`PRAGMA table_info(${name})`);
    const known = [...CARRIED[name], ...LEFT_BEHIND];
    for (const column of columns) {
      assert.ok(known.includes(column.name), `${name}.${column.name} is neither carried nor left behind`);
    }
    for (const claimed of CARRIED[name]) {
      assert.ok(columns.some((c) => c.name === claimed), `${name}.${claimed} is claimed but not in the schema`);
    }
  }
});

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { thumbFileName } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';

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
    tags: [tag.id, 'e-happy']
  });
  const photo = await journal.photos.attach({ entryId: entry }, { full: bytes('full-photo'), thumb: bytes('thumb') });
  const second = await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });

  const milestone = await journal.milestones.upsertMilestone({ name: 'HRT start', epochDay: 19000, templateKey: 'hrt_start' });
  const milestonePhoto = await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  const lab = await journal.labs.upsertResult({ epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L', note: 'fasting' });
  const sideEffect = await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
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

  return { db, files, journal, voice, preset, group, tag, entry, second, photo, milestone, milestonePhoto, lab, sideEffect, reminder };
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
    photos: [{ id: photo, fileName: `${photo}.jpg` }]
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

test('milestones, lab results, side effects and reminders travel whole', async () => {
  const { journal, milestone, milestonePhoto, lab, sideEffect, reminder } = await populated();

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
  assert.deepEqual(snapshot.journal.labResults, [
    { id: lab, epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L', note: 'fasting' }
  ]);
  assert.deepEqual(snapshot.journal.sideEffects, [
    { id: sideEffect, name: 'hot flashes', severity: 3, epochDay: 20000 }
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
      enabled: true
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
  photo: ['uuid', 'entry_id', 'milestone_id', 'file_path', 'order_index'],
  milestone: ['uuid', 'name', 'epoch_day', 'template_key'],
  gender_dimension: ['uuid', 'key', 'name', 'low_label', 'high_label', 'min_value', 'max_value', 'is_built_in', 'hidden'],
  gender_preset: ['uuid', 'key', 'name', 'is_built_in'],
  preset_dimension: ['preset_id', 'dimension_id', 'order_index'],
  tag_group: ['uuid', 'key', 'name', 'enabled', 'order_index'],
  tag: ['uuid', 'key', 'group_id', 'label', 'hidden', 'order_index'],
  reminder: ['uuid', 'title', 'type', 'time', 'recurrence', 'interval', 'anchor_epoch_day', 'epoch_day', 'enabled'],
  lab_result: ['uuid', 'epoch_day', 'analyte', 'value', 'unit', 'note'],
  side_effect: ['uuid', 'name', 'severity', 'epoch_day'],
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

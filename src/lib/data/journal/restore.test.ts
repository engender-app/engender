/* Replace and merge (ticket 14), the most destructive path in the app.

   Every test here restores between two journals over real SQLite, and the
   archive it restores is a real snapshot rather than a hand-written payload:
   an import's whole job is to be the inverse of an export, and a fixture
   that agreed with the importer but not with archive.ts would prove nothing
   about a restore. */

import assert from 'node:assert/strict';
import { test } from 'vitest';
import { thumbFileName } from '../photos/names.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { BUILT_IN_PRESETS } from '../vocabulary/builtins.ts';
import { resolveEpisodeAt } from '../regimenEpisode.ts';
import { epochDayFromTimestamp } from '../epochDay.ts';
import { openJournal, type Journal } from './journal.ts';
import { countingDriver } from './test-support.ts';
import type { RestoreContents } from './restore.ts';

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

async function device() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

/** A device with something on it worth losing: a custom dimension in a
    custom preset, a custom tag, built-in tags the user has renamed, hidden
    and switched off, two entries, a photo on each owner, a lab result and a
    reminder. */
async function populated() {
  const made = await device();
  const { journal } = made;

  const voice = await journal.dimensions.addCustomDimension({
    name: 'Voice comfort',
    low: 'off',
    high: 'mine',
    min: 0,
    max: 10
  });
  const preset = await journal.dimensions.addPreset({ name: 'Mine', dims: [voice.key, 'femininity'] });
  const group = await journal.tags.addGroup('Appointments');
  const tag = await journal.tags.addTag(group.key, 'endo');
  // A custom tag in a built-in group, which is the case a merge has to place
  // among tags the importing device already has.
  const sharedGroupTag = await journal.tags.addTag('emotions', 'wired');
  await journal.tags.setTagHidden('a-work', true);
  await journal.tags.renameTag('a-therapy', 'therapy session');
  await journal.tags.setGroupEnabled('activities', false);
  await journal.dimensions.setDimensionHidden('masculinity', true);

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day, zażółć',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    bodyRegions: { chest: 45 }
  });
  const photo = await journal.photos.attach({ entryId: entry }, { full: bytes('full-photo'), thumb: bytes('thumb') });
  await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    templateKey: 'hrt_start'
  });
  const milestonePhoto = await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 79, unit: 'cm' });
  await journal.tally.log({ epochDay: 20000, kind: 'misgendered', context: 'wrong pronoun at the pharmacy' });
  await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
  await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 19180 });
  await journal.reminders.upsertReminder({
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
  /* Saved after the injection above, so it carries a frozen day-of-interval
     the importing device could not work out for itself: the result travels
     without any promise that the dose log it was measured against travels
     with it, or ever existed there (ticket 03). */
  await journal.labs.upsertResult({
    epochDay: epochDayFromTimestamp(1_700_000_000_000) + 4,
    analyte: 'estradiol',
    value: 412.5,
    unit: 'pmol/L',
    drawTime: '07:40',
    provider: 'Diagnostyka'
  });

  const schedule = await journal.doses.upsertSchedule({ episodeId: episode, everyNDays: 14, dosesPerDay: 1 });
  const dosePause = await journal.doses.upsertPause({
    episodeId: episode,
    startEpochDay: 19100,
    endEpochDay: null,
    reason: 'planned'
  });

  const doubtEntry = await journal.doubtJournal.addEntry({ epochDay: 20000, text: 'am I even trans enough for this' });
  const counterevidenceSnapshot = await journal.doubtJournal.saveSnapshot(20000, [
    { epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }
  ]);

  const tryout = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 19900,
    endEpochDay: null
  });
  const feltSense = await journal.tryouts.addFeltSenseEntry({
    tryoutId: tryout,
    epochDay: 19910,
    mood: 4,
    note: 'felt right at the pharmacy'
  });

  return {
    ...made,
    voice,
    preset,
    group,
    tag,
    sharedGroupTag,
    photo,
    milestone,
    milestonePhoto,
    episode,
    dose,
    schedule,
    dosePause,
    doubtEntry,
    counterevidenceSnapshot,
    tryout,
    feltSense
  };
}

/** What an export hands an import: the rows, and the photo files as a
    stream. A fresh one per attempt, because the stream is consumed once -
    which is also true of the real thing (pack.ts). */
async function exported(journal: Journal): Promise<RestoreContents> {
  const snapshot = await journal.archive.snapshot();
  return {
    journal: snapshot.journal,
    files: (async function* () {
      for (const file of snapshot.files) yield { name: file.name, bytes: await snapshot.readFile(file.name) };
    })()
  };
}

const rowCount = async (db: Awaited<ReturnType<typeof migratedDb>>, sql: string): Promise<number> =>
  (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`))[0].n;

const SMALL_RESTORE_FIXTURE_ENTRIES = 20;
const LARGE_RESTORE_FIXTURE_ENTRIES = 140;

async function countingDevice() {
  const db = await migratedDb();
  const counting = countingDriver(db);
  const files = fakeFileStore();
  const journal = openJournal(counting.driver, files);
  await journal.reconcileBuiltIns();
  return {
    journal,
    roundTrips: counting.roundTrips,
    resetRoundTrips: counting.resetRoundTrips
  };
}

async function sourceWithManyEntries(entryCount: number): Promise<Journal> {
  const { journal } = await device();
  for (let i = 0; i < entryCount; i += 1) {
    const id = await journal.entries.upsertEntry({
      epochDay: 25_000 + i,
      timestamp: 1_700_000_000_000 + i * 1000,
      mood: (i % 5) + 1,
      note: `restore fixture ${i}`,
      dims: { femininity: (i % 100) + 1 },
      tags: ['e-happy']
    });
    await journal.photos.attach({ entryId: id }, { full: bytes(`full-${i}`), thumb: bytes(`thumb-${i}`) });
  }
  return journal;
}

async function restoreRoundTrips(mode: 'replace' | 'merge', source: Journal) {
  const target = await countingDevice();
  target.resetRoundTrips();
  await target.journal.archive[mode](await exported(source));
  return target.roundTrips();
}

test('merge adds what this device does not have and leaves what it has alone', async () => {
  const source = await populated();
  const target = await device();
  const mine = await target.journal.entries.upsertEntry({ epochDay: 20500, mood: 5, note: 'mine' });

  await target.journal.archive.merge(await exported(source.journal));

  assert.equal((await target.journal.entries.getEntry(mine))?.note, 'mine');
  const restored = await target.journal.entries.entriesForDay(20000);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].dims, { [source.voice.key]: 7, femininity: 60 });
  assert.deepEqual(restored[0].tags.toSorted(), [source.tag.id, 'e-happy'].toSorted());
  assert.deepEqual(restored[0].photos, [{ id: source.photo, fileName: `${source.photo}.jpg` }]);
  assert.deepEqual(restored[0].bodyRegions, { chest: 45 });
  assert.equal(restored[0].note, 'a good day, zażółć');
  assert.equal((await target.journal.milestones.getMilestones()).length, 1);
  assert.deepEqual(await target.journal.labs.getUsedAnalytes(), ['estradiol']);
  assert.equal((await target.journal.measurements.getMeasurements('waist')).length, 1);
  assert.equal((await target.journal.tally.getEvents('misgendered')).length, 1);
  /* The dosing context comes across as it was recorded, not re-derived
     against this device's dose log (ticket 03). */
  const [restoredLab] = await target.journal.labs.getResults('estradiol');
  assert.equal(restoredLab.drawTime, '07:40');
  assert.equal(restoredLab.provider, 'Diagnostyka');
  assert.deepEqual(restoredLab.timing, { route: 'im', dayOfInterval: 5 });
  assert.equal((await target.journal.sideEffects.getSideEffects()).length, 1);
  assert.equal((await target.journal.personalEffects.getMarkers()).length, 1);
  assert.equal((await target.journal.reminders.getReminders()).length, 1);
  const episodes = await target.journal.regimen.getEpisodes();
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].drug, 'estradiol valerate');
  const doubtEntries = await target.journal.doubtJournal.getEntries(10);
  assert.equal(doubtEntries.length, 1);
  assert.equal(doubtEntries[0].text, 'am I even trans enough for this');
  const snapshots = await target.journal.doubtJournal.getSnapshots(10);
  assert.deepEqual(snapshots[0].items, [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }]);
  const tryouts = await target.journal.tryouts.getTryouts();
  assert.equal(tryouts.length, 1);
  assert.equal(tryouts[0].label, 'Alex');
  const feltSense = await target.journal.tryouts.getFeltSenseEntries(tryouts[0].id);
  assert.deepEqual(feltSense, [
    { id: source.feltSense, tryoutId: tryouts[0].id, epochDay: 19910, mood: 4, note: 'felt right at the pharmacy' }
  ]);
});

test('merging the same archive twice duplicates neither a doubt entry nor a counterevidence snapshot', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));
  await target.journal.archive.merge(await exported(source.journal));

  assert.equal((await target.journal.doubtJournal.getEntries(10)).length, 1);
  assert.equal((await target.journal.doubtJournal.getSnapshots(10)).length, 1);
});

test('merging the same archive twice duplicates neither a tryout nor its felt-sense entry', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));
  await target.journal.archive.merge(await exported(source.journal));

  const tryouts = await target.journal.tryouts.getTryouts();
  assert.equal(tryouts.length, 1);
  assert.equal((await target.journal.tryouts.getFeltSenseEntries(tryouts[0].id)).length, 1);
});

test('a dose log travels with its schedule and pauses, still hung off the right episode', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));

  const [dose] = await target.journal.doses.getDoses(19000, 20500);
  assert.equal(dose.id, source.dose);
  assert.equal(dose.route, 'im');
  assert.equal(dose.route === 'im' ? dose.injectionSite : null, 'ventrogluteal-left');
  assert.equal(dose.route === 'im' ? dose.vehicle : null, 'oil');

  assert.deepEqual(await target.journal.doses.getSchedules(), [
    { id: source.schedule, episodeId: source.episode, everyNDays: 14, dosesPerDay: 1 }
  ]);
  assert.deepEqual(await target.journal.doses.getPauses(), [
    { id: source.dosePause, episodeId: source.episode, startEpochDay: 19100, endEpochDay: null, reason: 'planned' }
  ]);
});

test('merging the same archive twice duplicates neither a dose, a schedule nor a pause', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));
  await target.journal.archive.merge(await exported(source.journal));

  assert.equal((await target.journal.doses.getDoses(19000, 20500)).length, 1);
  assert.equal((await target.journal.doses.getSchedules()).length, 1);
  assert.equal((await target.journal.doses.getPauses()).length, 1);
});

test('a restored dose resolves its episode from its own timestamp, having carried no episode link', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));

  const [dose] = await target.journal.doses.getDoses(19000, 20500);
  const episodes = await target.journal.regimen.getEpisodes();
  assert.equal(resolveEpisodeAt(episodes, dose.timestamp)?.id, source.episode);

  // A corrective episode added on the importing device moves the attribution
  // with no stored link to have got stale in transit.
  await target.journal.regimen.upsertEpisode({
    drug: 'estradiol enanthate',
    ester: 'enanthate',
    dose: 8,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 10 days',
    startEpochDay: 19500
  });
  assert.equal(resolveEpisodeAt(await target.journal.regimen.getEpisodes(), dose.timestamp)?.drug, 'estradiol enanthate');
});

test('merging the same archive twice does not duplicate a regimen episode', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));
  await target.journal.archive.merge(await exported(source.journal));

  const episodes = await target.journal.regimen.getEpisodes();
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].id, source.episode);
});

test("a merged entry's note is in the search index, not just in the table", async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));

  // Folded on both sides (ADR-0005), so the ogonek-less spelling finds it.
  const hits = await target.journal.entries.searchEntries('zazolc', []);
  assert.deepEqual(hits.map((e) => e.epochDay), [20000]);
});

test('merging the same archive twice changes nothing the second time', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));
  const after = await target.journal.archive.snapshot();
  await target.journal.archive.merge(await exported(source.journal));
  const again = await target.journal.archive.snapshot();

  assert.deepEqual(again.journal, after.journal);
  assert.deepEqual(again.files, after.files);
});

test('merge leaves a matched entry alone, even when the archive holds an older copy of it', async () => {
  const source = await populated();
  const target = await device();
  await target.journal.archive.merge(await exported(source.journal));

  // The same rows on both sides now. Editing one here and merging again is
  // the two-device case: skip-existing means this device's fix stays, where
  // last-write-wins would silently drop it.
  const [restored] = await target.journal.entries.entriesForDay(20000);
  await target.journal.entries.upsertEntry({ id: restored.id, note: 'fixed on this device' });
  await target.journal.tags.renameTag(source.tag.id, 'endocrinologist');

  await target.journal.archive.merge(await exported(source.journal));

  assert.equal((await target.journal.entries.getEntry(restored.id))?.note, 'fixed on this device');
  assert.equal(
    (await target.journal.tags.getTagGroups()).flatMap((g) => g.tags).find((t) => t.id === source.tag.id)?.label,
    'endocrinologist'
  );
});

test("replace installs the archive's journal and discards this device's", async () => {
  const source = await populated();
  const target = await device();
  const mine = await target.journal.entries.upsertEntry({ epochDay: 20500, mood: 5, note: 'mine' });
  const myTag = await target.journal.tags.addTag('gender', 'my own tag');
  const myDimension = await target.journal.dimensions.addCustomDimension({
    name: 'Mine',
    low: 'a',
    high: 'b',
    min: 0,
    max: 5
  });
  const myMilestone = await target.journal.milestones.upsertMilestone({ name: 'mine', epochDay: 19500 });
  await target.journal.tally.log({ epochDay: 19500, kind: 'correctly_gendered' });
  await target.journal.doubtJournal.addEntry({ epochDay: 19500, text: 'mine' });
  const myTryout = await target.journal.tryouts.upsertTryout({
    kind: 'pronouns',
    label: 'they/them',
    startEpochDay: 19500,
    endEpochDay: null
  });

  await target.journal.archive.replace(await exported(source.journal));

  assert.equal(await target.journal.entries.getEntry(mine), undefined);
  assert.equal((await target.journal.milestones.getMilestones()).map((m) => m.name).includes('mine'), false);
  assert.equal((await target.journal.tally.getEvents('correctly_gendered')).length, 0, "this device's tally event is gone");
  assert.equal((await target.journal.tally.getEvents('misgendered')).length, 1, "the archive's tally event is here");
  const doubtEntries = await target.journal.doubtJournal.getEntries(10);
  assert.equal(doubtEntries.length, 1, "this device's doubt entry is gone");
  assert.equal(doubtEntries[0].text, 'am I even trans enough for this', "the archive's doubt entry is here");
  assert.equal((await target.journal.doubtJournal.getSnapshots(10)).length, 1);
  const tryouts = await target.journal.tryouts.getTryouts();
  assert.equal(tryouts.some((t) => t.id === myTryout), false, "this device's tryout is gone");
  assert.ok(tryouts.some((t) => t.label === 'Alex'), "the archive's tryout is here");
  const tags = (await target.journal.tags.getTagGroups()).flatMap((g) => g.tags);
  assert.equal(tags.some((t) => t.id === myTag.id), false, 'a custom tag this device had is gone');
  assert.ok(tags.some((t) => t.id === source.tag.id), "the archive's custom tag is here");
  const dimensions = await target.journal.dimensions.getDimensions();
  assert.equal(dimensions.some((d) => d.key === myDimension.key), false, 'a custom dimension this device had is gone');
  assert.ok(dimensions.some((d) => d.key === source.voice.key), "the archive's custom dimension is here");
  assert.equal((await target.journal.entries.entriesForDay(20000)).length, 1);
  assert.equal((await target.journal.milestones.getMilestones()).length, 1);
});

test('replace keeps built-in rows by key rather than deleting them, and never duplicates one', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.replace(await exported(source.journal));

  const dimensions = await target.journal.dimensions.getDimensions();
  assert.equal(dimensions.filter((d) => d.key === 'femininity').length, 1);
  assert.equal(dimensions.filter((d) => d.builtIn).length, 5);
  const groups = await target.journal.tags.getTagGroups();
  assert.equal(groups.filter((g) => g.key === 'activities').length, 1);
  assert.equal(groups.flatMap((g) => g.tags).filter((t) => t.id === 'e-happy').length, 1);
  const presets = await target.journal.dimensions.getPresets();
  assert.equal(presets.filter((p) => p.id === 'p-btw').length, 1);
  assert.deepEqual(presets.find((p) => p.id === 'p-btw')?.dims, ['euphoria_dysphoria', 'femininity']);
  assert.deepEqual(presets.find((p) => p.id === source.preset.id)?.dims, [source.voice.key, 'femininity']);
});

test('merge does not duplicate built-ins either, however they arrived', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));

  assert.equal(await rowCount(target.db, "gender_dimension WHERE key = 'femininity'"), 1);
  assert.equal(await rowCount(target.db, "tag WHERE key = 'e-happy'"), 1);
  assert.equal(await rowCount(target.db, "tag_group WHERE key = 'activities'"), 1);
  assert.equal(await rowCount(target.db, "gender_preset WHERE key = 'p-nb'"), 1);
  assert.equal(
    await rowCount(target.db, 'preset_dimension'),
    BUILT_IN_PRESETS.reduce((sum, preset) => sum + preset.dims.length, 0) + 2
  );
});

test('a built-in preset the archive does not carry keeps the dimensions it was reconciled with', async () => {
  const source = await populated();
  const target = await device();

  // An archive written by a build that did not have p-nb yet. Emptying
  // preset_dimension wholesale left it offering no scales at all, for good.
  const contents = await exported(source.journal);
  contents.journal.presets = contents.journal.presets.filter((p) => p.id !== 'p-nb');

  await target.journal.archive.replace(contents);

  const presets = await target.journal.dimensions.getPresets();
  assert.equal(presets.find((p) => p.id === 'p-nb')?.dims.length, 5);
  assert.deepEqual(presets.find((p) => p.id === 'p-btw')?.dims, ['euphoria_dysphoria', 'femininity']);
});

test('a tag merged into a group this device already has lands after the tags in it', async () => {
  const source = await populated();
  const target = await device();
  const mine = await target.journal.tags.addTag('emotions', 'restless');

  await target.journal.archive.merge(await exported(source.journal));

  /* The archive holds its own tag at a position this device's tag already
     occupies, so it goes after it rather than tying with it - which is where
     adding a tag by hand puts one (tags.ts). */
  const emotions = (await target.journal.tags.getTagGroups()).find((g) => g.key === 'emotions')!;
  assert.deepEqual(emotions.tags.slice(-2).map((t) => t.label), ['restless', 'wired']);
});

test('replace applies the state the archive put on built-in rows; merge leaves it alone', async () => {
  const source = await populated();
  const replaced = await device();
  const merged = await device();
  await merged.journal.tags.renameTag('a-therapy', 'my own wording');

  await replaced.journal.archive.replace(await exported(source.journal));
  await merged.journal.archive.merge(await exported(source.journal));

  const activities = (await replaced.journal.tags.getTagGroups()).find((g) => g.key === 'activities')!;
  assert.equal(activities.enabled, false);
  assert.equal(activities.tags.find((t) => t.id === 'a-work')?.hidden, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-therapy')?.label, 'therapy session');
  assert.equal((await replaced.journal.dimensions.getDimensions()).find((d) => d.key === 'masculinity')?.hidden, true);

  const mergedActivities = (await merged.journal.tags.getTagGroups()).find((g) => g.key === 'activities')!;
  assert.equal(mergedActivities.enabled, true, "a matched group keeps this device's setting");
  assert.equal(mergedActivities.tags.find((t) => t.id === 'a-work')?.hidden, false);
  assert.equal(mergedActivities.tags.find((t) => t.id === 'a-therapy')?.label, 'my own wording');
});

test('replace leaves the PIN, the app-lock flags and the disguise settings alone', async () => {
  const source = await populated();
  const target = await device();
  // Written as rows rather than through preferences.ts: what this asserts is
  // that a restore does not touch the pref table at all, whoever wrote it.
  for (const [key, value] of [
    ['pinHash', '"argon2-hash"'],
    ['appLock', 'true'],
    ['lockOnLeave', 'true'],
    ['disguise', 'true']
  ]) {
    await target.db.run('INSERT INTO pref (key, value) VALUES (?, ?)', [key, value]);
  }

  await target.journal.archive.replace(await exported(source.journal));

  const rows = await target.db.query<{ key: string; value: string }>('SELECT key, value FROM pref ORDER BY key');
  assert.deepEqual(
    rows.map((row) => [row.key, row.value]),
    [
      ['appLock', 'true'],
      ['disguise', 'true'],
      ['lockOnLeave', 'true'],
      ['pinHash', '"argon2-hash"']
    ]
  );
});

test('the archive\'s photo files land, and the ones a replace orphaned are still on disk', async () => {
  const source = await populated();
  const target = await device();
  const mineId = await target.journal.entries.upsertEntry({ epochDay: 20500, mood: 5 });
  const myPhoto = await target.journal.photos.attach({ entryId: mineId }, { full: bytes('old'), thumb: bytes('ot') });

  await target.journal.archive.replace(await exported(source.journal));

  assert.deepEqual(await target.files.read(`${source.photo}.jpg`), bytes('full-photo'));
  assert.deepEqual(await target.files.read(thumbFileName(`${source.photo}.jpg`)), bytes('thumb'));
  assert.deepEqual(await target.files.read(`${source.milestonePhoto}.jpg`), bytes('m'));
  // Never deleted (ADR-0011): the row is gone, the file waits for the next
  // boot's orphan sweep. Deleting up front is how a failed restore leaves a
  // device with neither its old photos nor the new ones.
  assert.deepEqual(await target.files.read(`${myPhoto}.jpg`), bytes('old'));
  assert.equal(await rowCount(target.db, 'photo'), 2);
});

test('a failure after the files are written and before the commit leaves the journal exactly as it was', async () => {
  const source = await populated();
  const target = await populated();
  const before = await target.journal.archive.snapshot();

  /* The injected failure is a row the schema refuses, reached after every
     photo file has been written: the last thing a restore does is insert
     rows, so this is the window ADR-0011 exists for. */
  const contents = await exported(source.journal);
  contents.journal.reminders = [
    ...contents.journal.reminders,
    { ...contents.journal.reminders[0], id: 'a-reminder-of-no-known-type', type: 'nonsense' }
  ];

  await assert.rejects(target.journal.archive.replace(contents));

  const after = await target.journal.archive.snapshot();
  assert.deepEqual(after.journal, before.journal);
  assert.deepEqual(after.files, before.files);
  // The archive's files did land, and stay as orphans for the boot sweep -
  // which is the whole cost of ordering it this way.
  assert.deepEqual(await target.files.read(`${source.photo}.jpg`), bytes('full-photo'));
});

test('a schema-refused row rolls the whole restore back in both replace and merge', async () => {
  const source = await populated();

  for (const mode of ['replace', 'merge'] as const) {
    const target = await populated();
    const before = await target.journal.archive.snapshot();
    const contents = await exported(source.journal);
    contents.journal.reminders = [
      ...contents.journal.reminders,
      { ...contents.journal.reminders[0], id: `a-reminder-of-no-known-type-${mode}`, type: 'nonsense' }
    ];

    await assert.rejects(target.journal.archive[mode](contents));
    const after = await target.journal.archive.snapshot();
    assert.deepEqual(after.journal, before.journal, `${mode} applied part of a refused restore`);
  }
});

test('a failed import into a journal that has never been seeded leaves it empty, not half-seeded', async () => {
  const source = await populated();
  const db = await migratedDb();
  const target = openJournal(db, fakeFileStore());

  const contents = await exported(source.journal);
  contents.journal.reminders = [{ ...contents.journal.reminders[0], type: 'nonsense' }];

  await assert.rejects(target.archive.replace(contents));

  // Seeding is inside the same transaction as the swap, so a rollback takes
  // the built-ins with it: "exactly as it was" and not "as the next boot
  // would have left it".
  assert.equal(await rowCount(db, 'gender_dimension'), 0);
  assert.equal(await rowCount(db, 'gender_preset'), 0);
  assert.equal(await rowCount(db, 'preset_dimension'), 0);
  assert.equal(await rowCount(db, 'tag_group'), 0);
  assert.equal(await rowCount(db, 'tag'), 0);
});

test('an entry naming a gender dimension the archive does not carry fails the whole import', async () => {
  const source = await populated();
  const target = await populated();
  const before = await target.journal.archive.snapshot();

  const contents = await exported(source.journal);
  contents.journal.entries[0].dims = { ...contents.journal.entries[0].dims, no_such_dimension: 3 };

  // Loudly, rather than quietly dropping the value: a restore that silently
  // loses part of an entry is worse than one that refuses to run.
  await assert.rejects(target.journal.archive.merge(contents), /unknown dimension/);
  assert.deepEqual((await target.journal.archive.snapshot()).journal, before.journal);
});

test('a payload that is not a journal is refused before anything is written', async () => {
  const target = await populated();
  const before = await target.journal.archive.snapshot();

  await assert.rejects(
    target.journal.archive.replace({
      journal: { entries: [] } as never,
      files: (async function* () {})()
    }),
    /not readable/
  );

  assert.deepEqual((await target.journal.archive.snapshot()).journal, before.journal);
});

/* A lab row written before ticket 03 has no draw time, no provider and no
   timing columns. The payload type says otherwise, but it is a cast over
   JSON.parse output, so the importer has to survive the fields being absent
   rather than binding undefined at the driver. */
test('a lab result from an archive written before the dosing context existed still imports', async () => {
  const source = await populated();
  const contents = await exported(source.journal);
  const older = contents.journal.labResults.map((result) => {
    const { drawTime, provider, timingRoute, timingHours, timingDayOfInterval, ...rest } = result;
    return rest as typeof result;
  });

  const target = await device();
  await target.journal.archive.merge({ ...contents, journal: { ...contents.journal, labResults: older } });

  const [restored] = await target.journal.labs.getResults('estradiol');
  assert.equal(restored.provider, '');
  assert.equal(restored.drawTime, null);
  assert.equal(restored.timing, null);
});

test('importing into a journal that has never been through a boot works', async () => {
  const source = await populated();
  // No reconcileBuiltIns() and no preferences: a fresh install, before
  // onboarding has ever completed.
  const db = await migratedDb();
  const files = fakeFileStore();
  const target = openJournal(db, files);

  await target.archive.replace(await exported(source.journal));

  assert.equal((await target.entries.entriesForDay(20000)).length, 1);
  assert.equal((await target.dimensions.getDimensions()).filter((d) => d.builtIn).length, 5);
  assert.equal((await target.dimensions.getPresets()).filter((p) => p.builtIn).length, BUILT_IN_PRESETS.length);
  assert.equal(await rowCount(db, 'pref'), 0);
});

test('an empty journal restores over a populated one, which is what a Replace means', async () => {
  const empty = await device();
  const target = await populated();

  await target.journal.archive.replace(await exported(empty.journal));

  assert.deepEqual(await target.journal.entries.recentDays(400), []);
  assert.deepEqual(await target.journal.milestones.getMilestones(), []);
  assert.deepEqual(await target.journal.regimen.getEpisodes(), []);
  assert.equal(await rowCount(target.db, 'photo'), 0);
  // The index went with the entries, through the trigger migration v3 added.
  assert.deepEqual(await target.journal.entries.searchEntries('good', []), []);
  // The vocabulary a screen needs to render is still there.
  assert.equal((await target.journal.dimensions.getDimensions()).length, 5);
});

test('restore does not scale round trips per row for either replace or merge', async () => {
  const smallSource = await sourceWithManyEntries(SMALL_RESTORE_FIXTURE_ENTRIES);
  const largeSource = await sourceWithManyEntries(LARGE_RESTORE_FIXTURE_ENTRIES);

  for (const mode of ['replace', 'merge'] as const) {
    const small = await restoreRoundTrips(mode, smallSource);
    const large = await restoreRoundTrips(mode, largeSource);
    assert.deepEqual(
      large,
      small,
      `${mode} scaled with fixture size: ${SMALL_RESTORE_FIXTURE_ENTRIES} entries cost ${JSON.stringify(small)}, ${LARGE_RESTORE_FIXTURE_ENTRIES} entries cost ${JSON.stringify(large)}`
    );
  }
});

test('restore overlaps photo file writes rather than waiting on each one', async () => {
  const base = fakeFileStore();
  let activeWrites = 0;
  let maxActiveWrites = 0;

  const delayedFiles = {
    ...base,
    async write(name: string, bytes: Uint8Array) {
      activeWrites += 1;
      maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
      try {
        await new Promise((resolve) => setTimeout(resolve, 10));
        await base.write(name, bytes);
      } finally {
        activeWrites -= 1;
      }
    }
  };

  const db = await migratedDb();
  const journal = openJournal(db, delayedFiles);
  await journal.reconcileBuiltIns();
  const empty = await (await device()).journal.archive.snapshot();

  await journal.archive.replace({
    journal: empty.journal,
    files: (async function* () {
      for (let i = 0; i < 6; i += 1) {
        yield { name: `orphan-${i}.jpg`, bytes: bytes(`image-${i}`) };
      }
    })()
  });

  assert.ok(maxActiveWrites > 1, `writes were sequential (max overlap ${maxActiveWrites})`);
});

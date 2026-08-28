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
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { BUILT_IN_DIMENSIONS } from '../vocabulary/builtins.ts';
import { attributeDose } from '../regimenEpisode.ts';
import { epochDayFromTimestamp } from '../epochDay.ts';
import { discardStatements, emptyArchiveJournal } from './archiveSections.ts';
import { builtInsOnlyDevice, countsOf, everySection, everySectionDevice } from './golden-archive-fixture.ts';
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
  const measurementType = await journal.measurements.addCustomMeasurementType('Shoulders');
  await journal.measurements.setMeasurementTypeHidden('underbust', true);

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day, zażółć',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    bodyRegions: { chest: { dysphoria: 45, euphoria: null } }
  });
  const photo = await journal.photos.attach({ entryId: entry }, { full: bytes('full-photo'), thumb: bytes('thumb') });
  await journal.entries.upsertEntry({ id: entry, attachRecordings: [bytes('a voice note')] });
  const recording = (await journal.entries.getEntry(entry))!.recordings[0].id;
  await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    templateKey: 'hrt_start'
  });
  const milestonePhoto = await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 79, unit: 'cm' });
  await journal.tally.log({ epochDay: 20000, kind: 'misgendered' });
  await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });
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
    startEpochDay: 19000,
    endEpochDay: null
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

  const schedule = await journal.doses.upsertSchedule({ episodeId: episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null });
  const dosePause = await journal.doses.upsertPause({
    episodeId: episode,
    startEpochDay: 19100,
    endEpochDay: null,
    reason: 'planned'
  });

  const counterevidenceSnapshot = await journal.doubtJournal.saveSnapshot(20000, [
    { epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }
  ]);

  await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'checked');
  await journal.roadmap.addCustomGoal('social', 'Tell my sister');

  const tryout = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 19900,
    endEpochDay: null
  });
  const feltSense = await journal.feltSense.add(
    { tryoutId: tryout },
    { epochDay: 19910, mood: 4, note: 'felt right at the pharmacy' }
  );

  return {
    ...made,
    voice,
    preset,
    group,
    tag,
    sharedGroupTag,
    measurementType,
    photo,
    recording,
    milestone,
    milestonePhoto,
    episode,
    dose,
    schedule,
    dosePause,
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
  assert.deepEqual(restored[0].photos, [{ id: source.photo, fileName: `${source.photo}.jpg`, starred: false }]);
  assert.deepEqual(restored[0].recordings, [{ id: source.recording, fileName: `${source.recording}.webm` }]);
  assert.deepEqual(await target.files.read(`${source.recording}.webm`), bytes('a voice note'));
  assert.deepEqual(restored[0].bodyRegions, { chest: { dysphoria: 45, euphoria: null } });
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
  assert.equal((await target.journal.cycleEvents.getCycleEvents()).length, 1);
  assert.equal((await target.journal.personalEffects.getMarkers()).length, 1);
  assert.equal((await target.journal.reminders.getReminders()).length, 1);
  const episodes = await target.journal.regimen.getEpisodes();
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].drug, 'estradiol valerate');
  const snapshots = await target.journal.doubtJournal.getSnapshots(10);
  assert.deepEqual(snapshots[0].items, [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }]);
  const tryouts = await target.journal.tryouts.getTryouts();
  assert.equal(tryouts.length, 1);
  assert.equal(tryouts[0].label, 'Alex');
  const feltSense = await target.journal.feltSense.forTryout(tryouts[0].id);
  assert.deepEqual(feltSense, [
    { id: source.feltSense, epochDay: 19910, mood: 4, note: 'felt right at the pharmacy' }
  ]);
});

/* Not "merging twice duplicates nothing": archive-golden-merge.test.ts's
   registry-driven sweep now covers that generically for every section,
   including this one. What stays hand-written is content the sweep cannot
   state, because it only checks that a row's id survives, never what is on
   it: a tick travels as a pack/goal pair, not a uuid, and the claim here is
   that the target's own tick on a goal the source archive has never heard
   of keeps its status through a merge, not merely that the row is still
   there. A custom goal is uuid-identified instead, so the same claim is
   checked the way a checklist item's is. */
test('a target own roadmap tick and custom goal survive a merge that has never heard of them', async () => {
  const source = await populated();
  const target = await device();
  await target.journal.roadmap.setGoalStatus('pl', 'pl-social-tell-someone', 'checked');
  await target.journal.roadmap.addCustomGoal('legal', 'Ask about remote hearings');

  await target.journal.archive.merge(await exported(source.journal));

  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), {
    'pl-legal-court-file': 'checked',
    'pl-social-tell-someone': 'checked'
  });
  assert.deepEqual(
    (await target.journal.roadmap.getCustomGoals()).map((g) => g.text).sort(),
    ['Ask about remote hearings', 'Tell my sister']
  );
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
    { id: source.schedule, episodeId: source.episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null }
  ]);
  assert.deepEqual(await target.journal.doses.getPauses(), [
    { id: source.dosePause, episodeId: source.episode, startEpochDay: 19100, endEpochDay: null, reason: 'planned' }
  ]);
});

test('a weekday schedule and its dose amounts survive an export/import round trip', async () => {
  const source = await device();
  const episode = await source.journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 2,
    doseUnit: 'mg',
    route: 'im',
    interval: 'twice weekly',
    startEpochDay: 19000,
    endEpochDay: null
  });
  await source.journal.doses.upsertSchedule({
    episodeId: episode,
    recurrence: { kind: 'weekdays', weekdays: [0, 3] },
    dosesPerDay: 1,
    doseAmounts: [
      { dose: 2, doseUnit: 'mg' },
      { dose: 1, doseUnit: 'mg' }
    ]
  });

  const target = await device();
  await target.journal.archive.merge(await exported(source.journal));

  const [schedule] = await target.journal.doses.getSchedules();
  assert.deepEqual(schedule.recurrence, { kind: 'weekdays', weekdays: [0, 3] });
  assert.deepEqual(schedule.doseAmounts, [
    { dose: 2, doseUnit: 'mg' },
    { dose: 1, doseUnit: 'mg' }
  ]);
});

test('a restored dose resolves its episode from its own timestamp, having carried no episode link', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));

  const [dose] = await target.journal.doses.getDoses(19000, 20500);
  const episodes = await target.journal.regimen.getEpisodes();
  assert.equal(attributeDose(episodes, dose).episode?.id, source.episode);

  // A corrective episode added on the importing device moves the attribution
  // with no stored link to have got stale in transit. Its own end (day
  // before 19500, matching what the original single-episode timeline
  // implied) is set explicitly, since ticket 38 no longer derives one.
  const originalEpisode = episodes.find((e) => e.id === source.episode)!;
  await target.journal.regimen.upsertEpisode({
    id: originalEpisode.id,
    drug: originalEpisode.drug,
    ester: originalEpisode.ester,
    dose: originalEpisode.dose,
    doseUnit: originalEpisode.doseUnit,
    route: originalEpisode.route,
    interval: originalEpisode.interval,
    startEpochDay: originalEpisode.startEpochDay,
    endEpochDay: 19499
  });
  await target.journal.regimen.upsertEpisode({
    drug: 'estradiol enanthate',
    ester: 'enanthate',
    dose: 8,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 10 days',
    startEpochDay: 19500,
    endEpochDay: null
  });
  assert.equal(attributeDose(await target.journal.regimen.getEpisodes(), dose).episode?.drug, 'estradiol enanthate');
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
  const myMeasurementType = await target.journal.measurements.addCustomMeasurementType('Mine');
  await target.journal.tally.log({ epochDay: 19500, kind: 'correctly_gendered' });
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
  const measurementTypes = await target.journal.measurements.getMeasurementTypes();
  assert.equal(
    measurementTypes.some((t) => t.key === myMeasurementType.key),
    false,
    "a custom measurement type this device had is gone"
  );
  assert.ok(measurementTypes.some((t) => t.key === source.measurementType.key), "the archive's custom measurement type is here");
  assert.equal(measurementTypes.find((t) => t.key === 'underbust')?.hidden, true, "the archive's hidden built-in stays hidden");
  assert.equal((await target.journal.entries.entriesForDay(20000)).length, 1);
  assert.equal((await target.journal.milestones.getMilestones()).length, 1);
});

test('replace keeps built-in rows by key rather than deleting them, and never duplicates one', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.replace(await exported(source.journal));

  const dimensions = await target.journal.dimensions.getDimensions();
  assert.equal(dimensions.filter((d) => d.key === 'femininity').length, 1);
  assert.equal(dimensions.filter((d) => d.builtIn).length, BUILT_IN_DIMENSIONS.length);
  const groups = await target.journal.tags.getTagGroups();
  assert.equal(groups.filter((g) => g.key === 'activities').length, 1);
  assert.equal(groups.flatMap((g) => g.tags).filter((t) => t.id === 'e-happy').length, 1);
  /* No built-in preset is asserted here any more: nothing seeds one since
     ticket 35 left them legacy-only, so neither journal has one to keep. The
     custom preset still has to survive, which is the uuid half of this
     test's claim. */
  const presets = await target.journal.dimensions.getPresets();
  assert.deepEqual(presets.find((p) => p.id === source.preset.id)?.dims, [source.voice.key, 'femininity']);
  const measurementTypes = await target.journal.measurements.getMeasurementTypes();
  assert.equal(measurementTypes.filter((t) => t.key === 'waist').length, 1);
});

/* Not a repeat-merge test - one merge only. archive-golden-merge.test.ts's
   sweep covers repeated merges generically; what this checks is narrower and
   still its own: that a *first* merge matches a built-in this device already
   reconciled by key rather than treating the archive's copy as new, which a
   row-count-only sweep run once could not tell apart from a coincidence. */
test('merge does not duplicate built-ins either, however they arrived', async () => {
  const source = await populated();
  const target = await device();

  await target.journal.archive.merge(await exported(source.journal));

  assert.equal(await rowCount(target.db, "gender_dimension WHERE key = 'femininity'"), 1);
  assert.equal(await rowCount(target.db, "tag WHERE key = 'e-happy'"), 1);
  assert.equal(await rowCount(target.db, "tag_group WHERE key = 'activities'"), 1);
  assert.equal(await rowCount(target.db, "measurement_type WHERE key = 'waist'"), 1);
  // The source journal's one custom preset and its two scales, and nothing
  // else: no built-in preset is seeded on either side.
  assert.equal(await rowCount(target.db, 'preset_dimension'), 2);
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

/* An archive packed before ticket 16 (ADR-0037) still names a `doubtEntries`
   section on the wire - this build's registry has no entry for it any more
   (archiveSections.ts). The payload type says otherwise, but it is a cast
   over JSON.parse output, so the importer sees the same extra key a real
   pre-ticket archive would carry: absent from `ARCHIVE_SECTION_NAMES`, and
   therefore never read, never applied, and never the reason a restore
   fails. */
test('an archive naming the retired doubtEntries section restores without erroring, and simply drops it', async () => {
  const source = await populated();
  const contents = await exported(source.journal);
  const withRetiredSection = {
    ...contents.journal,
    doubtEntries: [{ id: 'a-pre-ticket-16-doubt-entry', epochDay: 20000, timestamp: 1_700_000_000_000, text: 'am I even trans enough for this' }]
  };

  const target = await device();
  await assert.doesNotReject(target.journal.archive.replace({ ...contents, journal: withRetiredSection }));

  assert.equal((await target.journal.doubtJournal.getSnapshots(10)).length, 1);
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
  assert.equal(
    (await target.dimensions.getDimensions()).filter((d) => d.builtIn).length,
    BUILT_IN_DIMENSIONS.length
  );
  assert.equal((await target.dimensions.getPresets()).filter((p) => p.builtIn).length, 0);
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
  assert.equal((await target.journal.dimensions.getDimensions()).length, BUILT_IN_DIMENSIONS.length);
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

/* The one hand-written payload in this file, and it earns the exception the
   header makes: no snapshot this build can take produces an archive without
   a `scale`, because every row has had one since phase 5 ticket 33. This is
   what a backup written by an older build actually looks like, and the only
   way to check it still restores is to write one. */
test('a staging from an archive written before there were two scales restores as Norwood-Hamilton', async () => {
  const target = await device();

  await target.journal.archive.replace({
    journal: {
      ...emptyArchiveJournal(),
      hairStages: [{ id: 'legacy-staging', epochDay: 19200, stage: '3a' }]
    },
    files: (async function* () {})()
  });

  assert.deepEqual(await target.journal.hairProgress.getStages(), [
    { id: 'legacy-staging', epochDay: 19200, scale: 'norwood_hamilton', stage: '3a', description: '' }
  ]);
});

/* Emptying the journal (phase 5 audit ticket 13). One operation, not a list
   each caller walks: a Replace runs it before it installs an archive's rows,
   and the demo bar's state jumps run it on its own. Its order comes from the
   section registry, reversed - what used to be 51 statements hand-ordered in
   restore.ts, with the demo keeping a second copy of the same idea that
   reached seven of the thirty-six sections. */
test('emptying the journal leaves every section at what a device with only its built-ins holds', async () => {
  const journal = await everySection();
  const populated = countsOf((await journal.archive.snapshot()).journal);

  await journal.discardEverything();

  const emptied = countsOf((await journal.archive.snapshot()).journal);
  const baseline = countsOf((await (await builtInsOnlyDevice()).journal.archive.snapshot()).journal);
  assert.deepEqual(emptied, baseline, 'a section holding more than the built-ins put there kept rows it should have lost');

  /* The comparison above is only worth something if the journal it ran
     against actually had rows to lose. `everySection` puts something in all
     36 - which ticket 12 pinned counts for - so every section either shrank
     or is one whose rows are all built-in reference data. */
  const shrank = Object.keys(populated).filter((section) => populated[section] > baseline[section]);
  assert.ok(shrank.length >= 25, `only ${shrank.length} sections had anything to lose, so this proves less than it looks`);
});

/** Every table's row count, straight off the connection - which is what the
    orphan check below needs and a snapshot cannot give: a section reads its
    child rows through a join to their owner, so a child left behind after its
    owner is gone does not appear in any section at all. */
async function tableCounts(driver: SqliteDriver): Promise<Record<string, number>> {
  const tables = await driver.query<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table'
       AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'entry_fts%' ORDER BY name`
  );
  const counts: Record<string, number> = {};
  for (const { name } of tables) {
    counts[name] = (await driver.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${name}`))[0].n;
  }
  return counts;
}

/* Table by table rather than section by section, because the two can
   disagree: a child row left behind after its owner is gone is a row nobody
   can reach, and one no section reports, since a section reads its children
   through a join to the owner that is no longer there. Only a count off the
   connection sees it.

   With foreign keys off, which is what makes this an assertion rather than a
   formality. node:sqlite turns them on by default, and every key in the
   schema cascades - so under the default a statement that misses a child
   table, or takes too narrow a slice of a shared one, is silently covered by
   the cascade from its owner and this test passes on a broken list. The
   statements are written not to need the cascade (restore.ts, and the
   ordering comments in the registry), and this is where that is checked. */
test('emptying the journal leaves nothing behind in any table, cascades or no cascades', async () => {
  const { driver } = await everySectionDevice();
  await driver.run('PRAGMA foreign_keys = OFF');

  for (const statement of discardStatements()) await driver.run(statement);

  assert.deepEqual(await tableCounts(driver), await tableCounts((await builtInsOnlyDevice()).driver));
});

/* The demo's own clear path, which had an answer of its own until ticket 13
   and reached seven of the thirty-six sections with it. Asserted through the
   journal rather than through the demo bar: what matters is that the two
   paths cannot disagree, and they cannot when there is one of them. */
test("the demo's clear leaves the journal where emptying it does", async () => {
  const journal = await everySection();
  const { clearJournal } = await import('../demo/journal-seed.ts');

  const withPhotos = (await journal.archive.snapshot()).files.length;
  await clearJournal(journal);

  const snapshot = await journal.archive.snapshot();
  const baseline = countsOf((await (await builtInsOnlyDevice()).journal.archive.snapshot()).journal);
  assert.ok(withPhotos > 0, 'the fixture had photo files to clear');
  assert.deepEqual(countsOf(snapshot.journal), baseline);
  assert.deepEqual(snapshot.files, [], 'the entry and milestone photo files went with their rows');
});

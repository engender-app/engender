/* Replace and merge, the most destructive path in the app.

   Every test here restores between two journals over real SQLite, and the
   archive it restores is a real snapshot rather than a hand-written payload:
   an import's whole job is to be the inverse of an export, and a fixture
   that agreed with the importer but not with archive.ts would prove nothing
   about a restore. */

import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { thumbFileName } from '../photos/names.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { BUILT_IN_DIMENSIONS } from '../vocabulary/builtins.ts';
import { attributeDose } from '../regimenEpisode.ts';
import { epochDayFromTimestamp } from '../epochDay.ts';
import { CorruptArchiveError, collect } from '../archive/container.ts';
import { packArchive } from '../archive/pack.ts';
import { portablePreferences } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { discardStatements, emptyArchiveJournal } from './archiveSections.ts';
import { builtInsOnlyDevice, countsOf, everySection, everySectionDevice } from './golden-archive-fixture.ts';
import { openJournal, type Journal } from './journal.ts';
import { countingDriver } from './test-support.ts';
import { orphanSweepRequestVersion } from '../sqlite/orphan-sweep-schedule.ts';
import { restoreArchive, verifyArchive, type RestoreContents, type RestoreProgress } from './restore.ts';

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

/* The archive parameters take about a second per derivation by design
   (ADR-0013), and the verify test below packs and unpacks. The format does
   not care what the parameters are - they travel in the header - so this
   uses a cheap set, the same way pack.test.ts does. */
const CHEAP_VERIFY_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

async function* oneShot(archive: Uint8Array): AsyncGenerator<Uint8Array> {
  yield archive;
}

async function device() {
  const db = await migratedDb();
  const files = fakeFileStore();
  const journal = openJournal(db, files);
  await journal.reconcileBuiltIns();
  return { db, files, journal };
}

function refuseCommit(driver: SqliteDriver) {
  const transaction = driver.transaction.bind(driver);
  return vi.spyOn(driver, 'transaction').mockImplementation((work) =>
    transaction(async (inside) => {
      await work(inside);
      throw new Error('injected failure before commit');
    }));
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
    bodyRegions: { chest: 30 }
  });
  const photo = await journal.photos.attach({ entryId: entry }, { full: bytes('full-photo'), thumb: bytes('thumb') });
  await journal.entries.upsertEntry({ id: entry, attachRecordings: [bytes('a voice note')] });
  const recording = (await journal.entries.getEntry(entry))!.recordings[0].id;
  await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    description: 'the pharmacist barely looked up',
    templateKey: 'hrt_start'
  });
  const milestonePhoto = await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000, resolvedEpochDay: null });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });
  await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 19180 });
  await journal.reminders.upsertReminder({
    title: 'injection',
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
    endEpochDay: null,
    endReason: null
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
     with it, or ever existed there. */
  await journal.labs.upsertResult({
    epochDay: epochDayFromTimestamp(1_700_000_000_000) + 4,
    analyte: 'estradiol',
    value: 412.5,
    unit: 'pmol/L',
    drawTime: '07:40',
    provider: 'Diagnostyka'
  });

  const schedule = await journal.doses.upsertSchedule({ episodeId: episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
  const dosePause = await journal.doses.upsertPause({
    episodeId: episode,
    startEpochDay: 19100,
    endEpochDay: null,
    reason: 'planned'
  });

  await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'checked');
  await journal.roadmap.addCustomGoal('Tell my sister');

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
    photo,
    recording,
    milestone,
    milestonePhoto,
    episode,
    dose,
    schedule,
    dosePause,
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
    fileCount: snapshot.files.length,
    files: (async function* () {
      for (const file of snapshot.files) yield { name: file.name, bytes: await snapshot.readFile(file.name) };
    })()
  };
}

const rowCount = async (db: SqliteDriver, sql: string): Promise<number> =>
  (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${sql}`))[0].n;

// Trash travels, and its margin notes with it.
test('archives carry margin notes owned by trashed entries, with the entries', async () => {
  const { driver, journal } = await everySectionDevice();
  assert.equal(await rowCount(driver, 'entry WHERE trashed_at IS NOT NULL'), 1);
  assert.equal(await rowCount(driver, 'margin_note'), 2);
  const snapshot = await journal.archive.snapshot();
  assert.equal(snapshot.journal.marginNotes.length, 2);
  const entryUuids = new Set(snapshot.journal.entries.map((entry) => entry.uuid));
  assert.ok(snapshot.journal.marginNotes.every((note) => entryUuids.has(note.entryId)));
});

test.each([
  ['replace', 'same device'],
  ['merge', 'same device'],
  ['replace', 'fresh device'],
  ['merge', 'fresh device']
] as const)('%s restores an older archive with trash margin notes on %s with foreign keys enforced', async (mode, location) => {
  const source = await everySectionDevice();
  const target = location === 'same device' ? { db: source.driver, journal: source.journal } : await device();
  const contents = await exported(source.journal);
  const trash = (await source.driver.query<{ id: number; uuid: string }>('SELECT id, uuid FROM entry WHERE trashed_at IS NOT NULL'))[0];
  const margin = (await source.journal.marginNotes.forEntries([trash.id])).get(trash.id)![0];
  // An archive written left the trashed entry out.
  contents.journal.entries = contents.journal.entries.filter((row) => row.uuid !== trash.uuid);
  contents.journal.marginNotes = contents.journal.marginNotes.filter((row) => row.entryId !== trash.uuid);
  contents.journal.marginNotes.push({
    id: margin.id, entryId: trash.uuid, epochDay: 20051, text: margin.text
  });
  assert.equal((await target.db.query('PRAGMA foreign_keys'))[0].foreign_keys, 1);
  await target.journal.archive[mode](contents);
  const restored = (await target.journal.archive.snapshot()).journal;
  assert.equal(restored.marginNotes.filter((note) => note.entryId !== trash.uuid).length, 1);
  assert.deepEqual(await target.db.query('PRAGMA foreign_key_check'), []);
});

const SMALL_RESTORE_FIXTURE_ENTRIES = 20;
// Below insertRows' own per-row chunk size for the entry table
// (floor(999 / 8 columns) = 124, archiveApply.ts): past that, entry's own
// insert takes a second statement and the two fixtures stop costing the
// same round trips for a reason that has nothing to do with scaling.
const LARGE_RESTORE_FIXTURE_ENTRIES = 100;

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
  assert.deepEqual(restored[0].bodyRegions, { chest: 30 });
  assert.equal(restored[0].note, 'a good day, zażółć');
  const restoredMilestones = await target.journal.milestones.getMilestones();
  assert.equal(restoredMilestones.length, 1);
  assert.equal(restoredMilestones[0].description, 'the pharmacist barely looked up');
  assert.deepEqual(await target.journal.labs.getUsedAnalytes(), ['estradiol']);
  /* The dosing context comes across as it was recorded, not re-derived
     against this device's dose log. */
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
  await target.journal.roadmap.setGoalStatus('pl', 'pl-legal-which-court', 'checked');
  await target.journal.roadmap.addCustomGoal('Ask about remote hearings');

  await target.journal.archive.merge(await exported(source.journal));

  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), {
    'pl-legal-court-file': 'checked',
    'pl-legal-which-court': 'checked'
  });
  assert.deepEqual(
    (await target.journal.roadmap.getCustomGoals()).map((g) => g.text).sort(),
    ['Ask about remote hearings', 'Tell my sister']
  );
});

/* A custom goal's text stopped being write-once and its row stopped being permanent, and
   `roadmapGoals` carries both columns as they stand rather than a history of them. What a
   replace owes is that the journal on the other side holds exactly what this one does - the
   new wording and not the old one, and nothing at all for the goal that was deleted. */
test('a reworded custom goal travels as it now reads, and a deleted one does not travel at all', async () => {
  const source = await device();
  const kept = await source.journal.roadmap.addCustomGoal('Ask about remote hearings');
  const reworded = await source.journal.roadmap.addCustomGoal('Tell my sster');
  const removed = await source.journal.roadmap.addCustomGoal('Ask for a second opinion');
  await source.journal.roadmap.setCustomGoalStatus(reworded.id, 'checked');
  await source.journal.roadmap.updateCustomGoalText(reworded.id, 'Tell my sister');
  await source.journal.roadmap.deleteCustomGoal(removed.id);

  const target = await device();
  await target.journal.archive.replace(await exported(source.journal));

  assert.deepEqual(await target.journal.roadmap.getCustomGoals(), [
    { id: kept.id, track: 'legal', text: 'Ask about remote hearings', status: 'unchecked' },
    { id: reworded.id, track: 'legal', text: 'Tell my sister', status: 'checked' }
  ]);
});

/* The person's categories travel with the goals in them, and a merge keeps a category this
   device made that the archive has never heard of. */
test("a category travels with its goals, and a merge keeps this device's own", async () => {
  const source = await device();
  const category = await source.journal.roadmap.addCategory('Coming out');
  const goal = await source.journal.roadmap.addCustomGoal('Tell my sister', category.id);

  const replaced = await device();
  await replaced.journal.archive.replace(await exported(source.journal));
  assert.deepEqual(await replaced.journal.roadmap.getCategories(), [{ id: category.id, name: 'Coming out' }]);
  assert.deepEqual(await replaced.journal.roadmap.getCustomGoals(), [
    { id: goal.id, track: category.id, text: 'Tell my sister', status: 'unchecked' }
  ]);

  const merged = await device();
  const own = await merged.journal.roadmap.addCategory('Wardrobe');
  await merged.journal.archive.merge(await exported(source.journal));
  assert.deepEqual(
    (await merged.journal.roadmap.getCategories()).map((one) => one.name).sort(),
    ['Coming out', 'Wardrobe']
  );
  assert.ok((await merged.journal.roadmap.getCategories()).some((one) => one.id === own.id));
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
    { id: source.schedule, episodeId: source.episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null }
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
    endEpochDay: null,
    endReason: null
  });
  await source.journal.doses.upsertSchedule({
    episodeId: episode,
    recurrence: { kind: 'weekdays', weekdays: [0, 3] },
    dosesPerDay: 1,
    doseAmounts: [
      { dose: 2, doseUnit: 'mg' },
      { dose: 1, doseUnit: 'mg' }
    ],
    autoLogFromEpochDay: null
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

test('a side effect left blank survives an export/import round trip as null, not zero or three', async () => {
  const source = await device();
  await source.journal.sideEffects.upsertSideEffect({ name: 'brain fog', severity: null, epochDay: 19000, resolvedEpochDay: null });

  const target = await device();
  await target.journal.archive.merge(await exported(source.journal));

  const [effect] = await target.journal.sideEffects.getSideEffects();
  assert.equal(effect.name, 'brain fog');
  assert.equal(effect.severity, null);
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
  // implied) is set explicitly no longer derives one.
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
    endEpochDay: 19499,
    endReason: null
  });
  await target.journal.regimen.upsertEpisode({
    drug: 'estradiol enanthate',
    ester: 'enanthate',
    dose: 8,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 10 days',
    startEpochDay: 19500,
    endEpochDay: null,
    endReason: null
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

  // The same rows on both sides now. Editing one here and merging the same,
  // older archive again is the two-device case: the archive's copies carry
  // stamps older than this device's fix, so the fix stays
  // (archiveMerge.ts).
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
  const myTryout = await target.journal.tryouts.upsertTryout({
    kind: 'pronouns',
    label: 'they/them',
    startEpochDay: 19500,
    endEpochDay: null
  });

  await target.journal.archive.replace(await exported(source.journal));

  assert.equal(await target.journal.entries.getEntry(mine), undefined);
  assert.deepEqual(await target.journal.entries.searchEntries('mine', []), []);
  assert.deepEqual((await target.journal.entries.searchEntries('zazolc', [])).map((e) => e.epochDay), [20000]);
  assert.equal((await target.journal.milestones.getMilestones()).map((m) => m.name).includes('mine'), false);
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
  assert.equal(dimensions.filter((d) => d.builtIn).length, BUILT_IN_DIMENSIONS.length);
  const groups = await target.journal.tags.getTagGroups();
  assert.equal(groups.filter((g) => g.key === 'activities').length, 1);
  assert.equal(groups.flatMap((g) => g.tags).filter((t) => t.id === 'e-happy').length, 1);
  /* No built-in preset is asserted here any more: nothing seeds one left them legacy-only,
     so neither journal has one to keep. The custom preset still has to survive, which is
     the uuid half of this test's claim. */
  const presets = await target.journal.dimensions.getPresets();
  assert.deepEqual(presets.find((p) => p.id === source.preset.id)?.dims, [source.voice.key, 'femininity']);

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

/* Merge takes the newer of the two copies of a built-in row: the source's group and tag settings, made after the
   target seeded its own, and the target's own rename, made after the
   source's. */
test('replace applies the state the archive put on built-in rows; merge takes the newer copy of each', async () => {
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
  assert.equal(mergedActivities.enabled, false, "the source's setting is newer than the target's seeded group");
  assert.equal(mergedActivities.tags.find((t) => t.id === 'a-work')?.hidden, true);
  assert.equal(mergedActivities.tags.find((t) => t.id === 'a-therapy')?.label, 'my own wording', "the target's rename is the newer");
});

test('a renamed, hidden custom scale travels as it now reads, by replace and by merge', async () => {
  const source = await device();
  const voice = await source.journal.dimensions.addCustomDimension({ name: 'Vocie', low: 'off', high: 'mine', min: 0, max: 10 });
  await source.journal.dimensions.renameCustomDimension(voice.key, { name: 'Voice', low: 'strained', high: 'at ease' });
  await source.journal.dimensions.setDimensionHidden(voice.key, true);
  const expected = { key: voice.key, name: 'Voice', low: 'strained', high: 'at ease', min: 0, max: 10, builtIn: false, hidden: true };

  const replaced = await device();
  await replaced.journal.archive.replace(await exported(source.journal));
  assert.deepEqual((await replaced.journal.dimensions.getDimensions()).find((d) => d.key === voice.key), expected);

  const merged = await device();
  await merged.journal.archive.merge(await exported(source.journal));
  assert.deepEqual((await merged.journal.dimensions.getDimensions()).find((d) => d.key === voice.key), expected);
});

test('an archive from a journal that shows the duplicate built-ins restores them shown', async () => {
  const source = await device();
  // A journal seeded before holds all three visible.
  await source.journal.tags.setTagHidden('g-body-dys', false);
  await source.journal.tags.setTagHidden('g-soc-dys', false);
  await source.journal.bodyRegions.setRegionHidden('whole_body', false);

  const target = await device();
  await target.journal.archive.replace(await exported(source.journal));

  const gender = (await target.journal.tags.getTagGroups()).find((g) => g.key === 'gender')!;
  assert.equal(gender.tags.find((t) => t.id === 'g-body-dys')?.hidden, false);
  assert.equal(gender.tags.find((t) => t.id === 'g-soc-dys')?.hidden, false);
  assert.equal((await target.journal.bodyRegions.getBodyRegions()).find((r) => r.id === 'whole_body')?.hidden, false);
});

test('replace keeps archived feature visibility choices', async () => {
  const source = await device();
  await source.journal.areaStates.setAreasHidden(['personalEffects', 'sideEffects'], false);
  await source.journal.effectCategories.setCategoryEnabled('sexual', true);
  const target = await device();
  await target.journal.areaStates.setAreasHidden(['personalEffects', 'sideEffects'], true);

  await target.journal.archive.replace(await exported(source.journal));

  const states = await target.journal.areaStates.getAreaStates();
  assert.equal(states.personalEffects?.hidden ?? false, false);
  assert.equal(states.sideEffects?.hidden ?? false, false);
  const categories = await target.journal.effectCategories.getEffectCategories();
  assert.equal(categories.find((c) => c.key === 'sexual')?.enabled, true);
  assert.equal(categories.find((c) => c.key === 'genital')?.enabled, false);
});

/** What a build before the effect-category split (version 121) exported:
    one 'genital_sexual' category, in the state given, holding every effect
    the split now files under genital or sexual. Made from a real snapshot,
    the way procedure-kind-restore.test.ts makes its legacy payload. */
async function writtenBeforeTheSplit(journal: Journal, enabled: boolean): Promise<RestoreContents> {
  const contents = await exported(journal);
  const old = (key: string | null) => (key === 'genital' || key === 'sexual' ? 'genital_sexual' : key);
  const categories = contents.journal.effectCategories.filter((c) => c.key !== 'genital' && c.key !== 'sexual');
  contents.journal = {
    ...contents.journal,
    effectCategories: [...categories, { key: 'genital_sexual', name: '', enabled, updatedAt: 777 }],
    personalEffectTypes: contents.journal.personalEffectTypes.map((t) => ({ ...t, categoryKey: old(t.categoryKey) }))
  };
  return contents;
}

for (const mode of ['replace', 'merge'] as const) {
  test(`an archive written before the split ${mode}s into genital and sexual`, async () => {
    const source = await device();
    const custom = await source.journal.personalEffects.addCustomEffectType('bottom growth', 'genital');
    const legacy = await writtenBeforeTheSplit(source.journal, true);
    // The premise: the old shape really does name the old category.
    assert.ok(legacy.journal.personalEffectTypes.some((t) => t.categoryKey === 'genital_sexual'));

    const target = await device();
    await target.journal.archive[mode](legacy);

    const categories = await target.journal.effectCategories.getEffectCategories();
    assert.deepEqual(
      categories.filter((c) => /genital|sexual/.test(c.key)).map((c) => [c.key, c.enabled]),
      [['genital', true], ['sexual', true]]
    );
    const types = new Map((await target.journal.personalEffects.getEffectTypes()).map((t) => [t.key, t.categoryKey]));
    assert.equal(types.get('orgasm_change_feminizing'), 'sexual');
    assert.equal(types.get('vaginal_atrophy_masculinizing'), 'genital');
    assert.equal(types.get('cycle_cessation'), 'genital');
    assert.equal(types.get(custom.key), 'genital');
    assert.equal([...types.values()].includes('genital_sexual'), false);
  });
}

test('replace leaves the PIN, the app-lock flags and the disguise settings alone', async () => {
  const source = await populated();
  const target = await device();
  // Written as rows rather than through preferences.ts: what this asserts is
  // that row-only restore leaves device-local settings untouched.
  for (const [key, value] of [
    ['pinHash', '"argon2-hash"'],
    ['appLock', 'true'],
    ['lockAfter', '"immediately"'],
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
      ['lockAfter', '"immediately"'],
      ['pinHash', '"argon2-hash"']
    ]
  );
});

test('the archive\'s photo files land, and replace sweeps the files it orphaned', async () => {
  const source = await populated();
  const target = await device();
  const mineId = await target.journal.entries.upsertEntry({ epochDay: 20500, mood: 5 });
  const myPhoto = await target.journal.photos.attach({ entryId: mineId }, { full: bytes('old'), thumb: bytes('ot') });

  await target.journal.archive.replace(await exported(source.journal));

  assert.deepEqual(await target.files.read(`${source.photo}.jpg`), bytes('full-photo'));
  assert.deepEqual(await target.files.read(thumbFileName(`${source.photo}.jpg`)), bytes('thumb'));
  assert.deepEqual(await target.files.read(`${source.milestonePhoto}.jpg`), bytes('m'));
  // Old bytes stay until the row transaction commits; the following sweep
  // removes them only after the imported rows own their new files.
  assert.equal(await target.files.read(`${myPhoto}.jpg`), null);
  assert.equal(await rowCount(target.db, 'photo'), 2);
});

test('a restore marks the orphan sweep due before it writes its first file, so a killed process still gets swept', async () => {
  const source = await populated();

  for (const mode of ['replace', 'merge'] as const) {
    const target = await device();
    const contents = await exported(source.journal);
    const write = target.files.write.bind(target.files);
    const markedAtFirstWrite: number[] = [];
    const before = orphanSweepRequestVersion().local;
    vi.spyOn(target.files, 'write').mockImplementation(async (name, data) => {
      markedAtFirstWrite.push(orphanSweepRequestVersion().local - before);
      return write(name, data);
    });

    await target.journal.archive[mode](contents);

    assert.ok(markedAtFirstWrite.length > 0, `${mode} wrote no files`);
    assert.equal(markedAtFirstWrite[0] >= 1, true, `${mode} wrote a file before the sweep was marked due`);
  }
});

test('a failure after the files are written and before the commit leaves the journal exactly as it was', async () => {
  const source = await populated();
  const target = await populated();
  const before = await target.journal.archive.snapshot();

  const contents = await exported(source.journal);
  const transaction = refuseCommit(target.db);

  await assert.rejects(target.journal.archive.replace(contents), /injected failure before commit/);
  assert.equal(transaction.mock.calls.length, 1);
  transaction.mockRestore();

  const after = await target.journal.archive.snapshot();
  assert.deepEqual(after.journal, before.journal);
  assert.deepEqual(after.files, before.files);
  // The archive's files landed before the refused transaction. Cleanup now
  // removes them while preserving every file the original rows still own.
  await vi.waitFor(async () => assert.equal(await target.files.read(`${source.photo}.jpg`), null));
});

test('a restore whose COMMIT or ROLLBACK reply was lost or refused settles without waiting on a sweep behind the open transaction, and leaves the sweep due', async () => {
  const source = await populated();

  for (const lost of ['COMMIT', 'ROLLBACK', 'REFUSED ROLLBACK'] as const) for (const mode of ['replace', 'merge'] as const) {
    const target = await populated();
    const contents = await exported(source.journal);
    // The worker still holds the transaction: the call fails only when the
    // lock disposes it, and any query sent in between queues behind it.
    let disposed = false;
    const query = target.db.query.bind(target.db);
    vi.spyOn(target.db, 'query').mockImplementation(((sql: string, params?: unknown[]) =>
      disposed ? new Promise(() => {}) : query(sql, params)) as typeof target.db.query);
    const transaction = target.db.transaction.bind(target.db);
    vi.spyOn(target.db, 'transaction').mockImplementation((work) =>
      transaction(async (inside) => {
        if (lost !== 'COMMIT') {
          // The rows fail, so the real transaction rolls back and answers; the
          // catch below swaps that answer for the dispose a lost reply ends in.
          const failing = { ...inside, run: async () => { throw new Error('rows failed'); }, exec: async () => { throw new Error('rows failed'); } };
          return work(failing as typeof inside);
        }
        await work(inside);
        disposed = true;
        throw new Error('the database was disposed');
      }).catch((error: Error) => {
        // A rollback whose reply is lost ends in the dispose, not in the rows' own error.
        if (lost === 'COMMIT') throw error;
        disposed = true;
        // A refused ROLLBACK reaches the caller wrapped, with the rows' error as the cause.
        if (lost === 'REFUSED ROLLBACK') throw new AggregateError([error, new Error('rollback refused')], error.message, { cause: error });
        throw new Error('the database was disposed');
      }));
    const before = orphanSweepRequestVersion().local;

    const outcome = await Promise.race([
      target.journal.archive[mode](contents).then(() => 'resolved', (error: Error) => error.message),
      new Promise((resolve) => setTimeout(() => resolve('still pending'), 1000))
    ]);

    assert.equal(outcome, lost === 'REFUSED ROLLBACK' ? 'rows failed' : 'the database was disposed', `${mode} hung behind its own lost ${lost}`);
    assert.ok(orphanSweepRequestVersion().local > before, `${mode} left no sweep due`);
    vi.restoreAllMocks();
  }
});

test('a refused commit rolls the whole restore back in both replace and merge', async () => {
  const source = await populated();

  for (const mode of ['replace', 'merge'] as const) {
    const target = await populated();
    const before = await target.journal.archive.snapshot();
    const contents = await exported(source.journal);
    const transaction = refuseCommit(target.db);

    await assert.rejects(target.journal.archive[mode](contents), /injected failure before commit/);
    assert.equal(transaction.mock.calls.length, 1);
    transaction.mockRestore();
    const after = await target.journal.archive.snapshot();
    assert.deepEqual(after.journal, before.journal, `${mode} applied part of a refused restore`);
  }
});

test('a failed replacement keeps the original entries searchable', async () => {
  const source = await populated();
  const target = await device();
  const mine = await target.journal.entries.upsertEntry({ epochDay: 20500, mood: 5, note: 'original searchable note' });
  const contents = await exported(source.journal);
  contents.journal.reminders = [{ ...contents.journal.reminders[0], recurrence: 'WEEKLY', interval: null, anchorEpochDay: null, epochDay: null }];

  await assert.rejects(target.journal.archive.replace(contents));

  assert.deepEqual((await target.journal.entries.searchEntries('searchable', [])).map((e) => e.id), [mine]);
  assert.deepEqual(await target.journal.entries.searchEntries('zazolc', []), []);
});

test('a failed import into a journal that has never been seeded leaves it empty, not half-seeded', async () => {
  const source = await populated();
  const db = await migratedDb();
  const target = openJournal(db, fakeFileStore());

  const contents = await exported(source.journal);
  const transaction = refuseCommit(db);

  await assert.rejects(target.archive.replace(contents), /injected failure before commit/);
  assert.equal(transaction.mock.calls.length, 1);
  transaction.mockRestore();

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
  await assert.rejects(target.journal.archive.merge(contents), CorruptArchiveError);
  assert.deepEqual((await target.journal.archive.snapshot()).journal, before.journal);
});

test('an array instead of a journal is refused before anything is written', async () => {
  const target = await populated();
  const before = await target.journal.archive.snapshot();

  await assert.rejects(
    target.journal.archive.replace({
      journal: [] as never,
      files: (async function* () {})()
    }),
    /not readable/
  );

  assert.deepEqual((await target.journal.archive.snapshot()).journal, before.journal);
});

/* An older lab row lacks draw time, no provider and no timing columns. The payload type
   says otherwise, but it is a cast over JSON.parse output, so the importer has to survive
   the fields being absent rather than binding undefined at the driver. */
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

/* Older milestone rows omit the description. The payload type says otherwise, but
   it is a cast over JSON.parse output, so the importer has to survive the field being
   absent rather than binding undefined at the driver. */
test('a milestone from an archive written before descriptions existed still imports', async () => {
  const source = await populated();
  const contents = await exported(source.journal);
  const older = contents.journal.milestones.map((milestone) => {
    const { description, ...rest } = milestone;
    return rest as typeof milestone;
  });

  const target = await device();
  await target.journal.archive.merge({ ...contents, journal: { ...contents.journal, milestones: older } });

  const [restored] = await target.journal.milestones.getMilestones();
  assert.equal(restored.description, '');
});

/* An archive packed (ADR-0037) still names a `doubtEntries` section on the wire, and one
   packed a `counterevidenceSnapshots` section - this build's registry has no entry for
   either any more (archiveSections.ts). The payload type says otherwise, but it is a cast
   over JSON.parse output, so the importer sees the same extra keys a real older archive
   would carry: on the dropped list, and therefore never read, never applied, and never the
   reason a restore fails. */
test('an archive naming the retired doubtEntries and counterevidenceSnapshots sections restores, and drops them', async () => {
  const source = await populated();
  const contents = await exported(source.journal);
  const withRetiredSections = {
    ...contents.journal,
    doubtEntries: [{ id: 'a-pre-ticket-16-doubt-entry', epochDay: 20000, timestamp: 1_700_000_000_000, text: 'am I even trans enough for this' }],
    counterevidenceSnapshots: [
      { id: 'a-pre-fa-09-snapshot', epochDay: 20000, timestamp: 1_700_000_000_000, items: [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }] }
    ]
  };

  const target = await device();
  await assert.doesNotReject(target.journal.archive.replace({ ...contents, journal: withRetiredSections }));

  assert.equal((await target.journal.cycleEvents.getCycleEventsInRange(20000, 20000)).length, 1, "the archive's other rows are here");
  const snapshot = await target.journal.archive.snapshot();
  assert.equal('counterevidenceSnapshots' in snapshot.journal, false);
  assert.equal(JSON.stringify(snapshot.journal).includes('euphoric at the appointment'), false);
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

  // Owned files only: a file no row names is skipped, not written.
  const owned = { ...empty.journal, progressPhotos: Array.from({ length: 6 }, (_, i) => ({
    id: `progress-${i}`, epochDay: 20_000 + i, pose: 'front', fileName: `owned-${i}.jpg`
  })) };
  await journal.archive.replace({
    journal: owned,
    files: (async function* () {
      for (let i = 0; i < 6; i += 1) {
        yield { name: `owned-${i}.jpg`, bytes: bytes(`image-${i}`) };
      }
    })()
  });

  assert.ok(maxActiveWrites > 1, `writes were sequential (max overlap ${maxActiveWrites})`);
});

test.each([
  ['replace', 'next file'],
  ['replace', 'stream end'],
  ['merge', 'next file'],
  ['merge', 'stream end']
] as const)('%s rejects an attachment failure settled before %s', async (mode, pause) => {
  const source = await populated();
  const target = await populated();
  const before = (await target.journal.archive.snapshot()).journal;
  const contents = await exported(source.journal);
  target.files.failNthWrite(pause === 'next file' ? 1 : contents.fileCount!);
  const seen: RestoreProgress[] = [];

  await assert.rejects(target.journal.archive[mode]({
    ...contents,
    files: (async function* () {
      for await (const file of contents.files) {
        yield file;
        if (pause === 'next file') await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (pause === 'stream end') await new Promise((resolve) => setTimeout(resolve, 0));
    })()
  }, (progress) => seen.push(progress)), /disk full/);

  assert.deepEqual((await target.journal.archive.snapshot()).journal, before);
  assert.ok(seen.every((progress) => progress.stage === 'files'));
  assert.ok(seen.every((progress) => progress.done < contents.fileCount!));
});

test.each(['replace', 'merge'] as const)('%s rejects an attachment failure at final drain without changing rows', async (mode) => {
  const source = await populated();
  const target = await populated();
  const before = (await target.journal.archive.snapshot()).journal;
  const contents = await exported(source.journal);
  let releaseWrites!: () => void;
  const writesReady = new Promise<void>((resolve) => { releaseWrites = resolve; });
  let finishStream!: () => void;
  const streamDone = new Promise<void>((resolve) => { finishStream = resolve; });
  const journal = openJournal(target.db, {
    ...target.files,
    async write() {
      await writesReady;
      throw new Error('disk full');
    }
  });
  const seen: RestoreProgress[] = [];
  const rejected = assert.rejects(journal.archive[mode]({
    ...contents,
    files: (async function* () {
      for await (const file of contents.files) yield file;
      finishStream();
    })()
  }, (progress) => seen.push(progress)), /disk full/);

  await streamDone;
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
  releaseWrites();
  await rejected;
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
  assert.deepEqual(seen, []);
});

test.each(['replace', 'merge'] as const)('%s waits for successful delayed attachments before importing rows', async (mode) => {
  const source = await populated();
  const target = await device();
  const before = (await target.journal.archive.snapshot()).journal;
  const contents = await exported(source.journal);
  let releaseWrites!: () => void;
  const writesReady = new Promise<void>((resolve) => { releaseWrites = resolve; });
  let finishStream!: () => void;
  const streamDone = new Promise<void>((resolve) => { finishStream = resolve; });
  const journal = openJournal(target.db, {
    ...target.files,
    async write(name, data) {
      await writesReady;
      await target.files.write(name, data);
    }
  });
  const seen: RestoreProgress[] = [];
  const restored = journal.archive[mode]({
    ...contents,
    files: (async function* () {
      for await (const file of contents.files) yield file;
      finishStream();
    })()
  }, (progress) => seen.push(progress));

  await streamDone;
  assert.deepEqual((await journal.archive.snapshot()).journal, before);
  assert.equal(seen.length, 0);
  releaseWrites();
  await restored;
  const after = (await journal.archive.snapshot()).journal;
  assert.deepEqual(after.entries, contents.journal.entries);
  assert.deepEqual(await target.files.read(`${source.photo}.jpg`), bytes('full-photo'));
  assert.equal(seen.filter((progress) => progress.stage === 'files').length, contents.fileCount);
  assert.equal(seen.findIndex((progress) => progress.stage === 'rows'), contents.fileCount);
});

/* Emptying the journal. One operation, not a list
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

  /* The comparison above is only worth something if the journal it ran against actually had
     rows to lose. `everySection` puts something in all 36 - which pinned counts for - so
     every section either shrank or is one whose rows are all built-in reference data. */
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

/* The demo's own clear path, which had an answer of its own and reached seven of the
   thirty-six sections with it. Asserted through the journal rather than through the demo
   bar: what matters is that the two paths cannot disagree, and they cannot when there is
   one of them. */
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

/* The two halves of a restore are separately long and separately countable - photos come
   off the stream one at a time, and the rows go in section by section inside one
   transaction - so the screen is told which half it is in rather than being handed one
   number that means two different things. */
test('a restore reports its photo files and then its sections', async () => {
  const source = await populated();
  const target = await device();
  const contents = await exported(source.journal);
  const seen: RestoreProgress[] = [];

  await restoreArchive(target.db, target.files, 'replace', contents, (progress) => seen.push(progress));

  const files = seen.filter((p) => p.stage === 'files');
  const rows = seen.filter((p) => p.stage === 'rows');
  assert.ok(files.length > 0, 'the fixture has photo files to report');
  assert.ok(rows.length > 0, 'the sections were reported');
  assert.deepEqual(
    seen.map((p) => p.stage),
    [...files.map(() => 'files' as const), ...rows.map(() => 'rows' as const)],
    'the files are all reported before the first section'
  );
  assert.equal(files[files.length - 1].done, files[files.length - 1].total);
  assert.equal(rows[rows.length - 1].done, rows[rows.length - 1].total);
  assert.equal(files[0].total, contents.fileCount);
});

test('a restore with no photos still reports its sections', async () => {
  // Which is the Daylio path's shape, and the one that would leave a bar
  // sitting at nothing if files were the only unit reported.
  const target = await device();
  const seen: RestoreProgress[] = [];

  await restoreArchive(
    target.db,
    target.files,
    'merge',
    { journal: emptyArchiveJournal(), files: (async function* () {})() },
    (progress) => seen.push(progress)
  );

  assert.deepEqual(
    seen.filter((p) => p.stage === 'files'),
    []
  );
  const rows = seen.filter((p) => p.stage === 'rows');
  assert.ok(rows.length > 0);
  assert.equal(rows[rows.length - 1].done, rows[rows.length - 1].total);
});

test('verifyArchive reports every file it drains', async () => {
  const source = await populated();
  const snapshot = await source.journal.archive.snapshot();
  const seen: { done: number; total: number }[] = [];
  const archive = await collect(
    packArchive(
      {
        journal: snapshot.journal,
        preferences: portablePreferences(PREFERENCE_DEFAULTS),
        files: snapshot.files,
        readFile: snapshot.readFile
      },
      'correct horse',
      CHEAP_VERIFY_KDF
    )
  );

  await verifyArchive(oneShot(archive), 'correct horse', (done, total) => seen.push({ done, total }));

  assert.equal(seen.length, snapshot.files.length);
  assert.equal(seen[seen.length - 1].done, snapshot.files.length);
  assert.equal(seen[0].total, snapshot.files.length);
});

test('an archive from before auto-logging reads its doses as the person\'s own, and its schedules as off', async () => {
  /* A real snapshot with the two newer fields deleted from it - which is exactly the shape
     an archive written by an earlier build has, and the one case worth its own test rather
     than leaving to the golden fixture: a restore that guessed `autoLogFromEpochDay` wrong
     would start writing doses on somebody's behalf on a device where they never asked for
     it. */
  const source = await populated();
  const target = await device();

  const contents = await exported(source.journal);
  for (const dose of contents.journal.doseEvents) {
    delete (dose as Partial<(typeof contents.journal.doseEvents)[number]>).source;
  }
  for (const schedule of contents.journal.doseSchedules) {
    delete (schedule as Partial<(typeof contents.journal.doseSchedules)[number]>).autoLogFromEpochDay;
  }
  await target.journal.archive.replace(contents);

  const [dose] = await target.journal.doses.getDoses(19000, 20500);
  assert.equal(dose.source, 'person');
  assert.equal((await target.journal.doses.getSchedules())[0].autoLogFromEpochDay, null);
});


test.each(['replace', 'merge'] as const)('hidden goal visibility and linked records survive archive %s', async (mode) => {
  const source = await device();
  const keys = ['pl-legal-name-usc', 'pl-legal-appeal', 'pl-legal-final-copy'];
  await source.journal.roadmap.setGoalStatus('pl', keys[0], 'checked');
  await source.journal.roadmap.setGoalStatus('pl', keys[1], 'not-my-path');
  for (const key of keys) await source.journal.roadmap.setGoalHidden('pl', key, true);
  const milestone = await source.journal.milestones.upsertMilestone({ name: 'Name decision', epochDay: 20500, roadmapGoalKey: keys[0] });
  const document = await source.journal.documents.addDocument({ title: 'Receipt', epochDay: 20500 }, { full: bytes('receipt'), thumb: bytes('thumb') });
  await source.journal.documents.setDocumentTarget(document, { kind: 'goal', id: keys[0] });
  const target = await device();
  await target.journal.archive[mode](await exported(source.journal));

  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('pl'), [...keys].sort());
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), { [keys[0]]: 'checked', [keys[1]]: 'not-my-path' });
  assert.equal((await target.journal.documents.getDocument(document))?.targetId, keys[0]);
  assert.equal((await target.journal.milestones.getMilestones()).find((one) => one.id === milestone)?.roadmapGoalKey, keys[0]);
  for (const key of keys) await target.journal.roadmap.setGoalHidden('pl', key, false);
  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('pl'), []);
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), { [keys[0]]: 'checked', [keys[1]]: 'not-my-path' });
});

test.each(['replace', 'merge'] as const)('social-group ticks and hidden steps survive archive %s', async (mode) => {
  const source = await device();
  await source.journal.roadmap.setGoalStatus('social', 'social-family', 'checked');
  await source.journal.roadmap.setGoalStatus('social', 'social-voice', 'not-my-path');
  await source.journal.roadmap.setGoalHidden('social', 'social-hair-makeup', true);
  const target = await device();
  await target.journal.archive[mode](await exported(source.journal));

  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('social'), { 'social-family': 'checked', 'social-voice': 'not-my-path' });
  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('social'), ['social-hair-makeup']);
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), {});
});

test.each(['checked', 'not-my-path'] as const)('merging a status into a locally hidden unchecked goal keeps %s after unhiding', async (status) => {
  const source = await device();
  await source.journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', status);
  const target = await device();
  await target.journal.roadmap.setGoalHidden('pl', 'pl-legal-appeal', true);
  await target.journal.roadmap.setGoalHidden('pl', 'pl-legal-final-copy', true);
  const contents = await exported(source.journal);
  await target.journal.archive.merge(contents);
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-appeal': status });
  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('pl'), ['pl-legal-appeal', 'pl-legal-final-copy']);
  await target.journal.archive.merge(await exported(source.journal));
  await target.journal.roadmap.setGoalHidden('pl', 'pl-legal-appeal', false);
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-appeal': status });
  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('pl'), ['pl-legal-final-copy']);
  const reopened = await device();
  await reopened.journal.archive.replace(await exported(target.journal));
  assert.deepEqual(await reopened.journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-appeal': status });
});

test('merging hidden goals preserves local visibility and status while legacy checks restore visible', async () => {
  const source = await device();
  await source.journal.roadmap.setGoalHidden('pl', 'pl-legal-appeal', true);
  await source.journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', 'not-my-path');
  await source.journal.roadmap.setGoalStatus('pl', 'pl-legal-final-copy', 'checked');
  const target = await device();
  await target.journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', 'checked');
  await target.journal.archive.merge(await exported(source.journal));
  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('pl'), []);
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-appeal': 'checked', 'pl-legal-final-copy': 'checked' });
});

/* An archive written before the institution list carries ticks on steps that became
   institutions. They arrive the way migration 114 left the journal: a tick goes, a hidden
   flag stays, and the retired "bank, insurers, clinic" step goes entirely. The institutions
   and their dated changes travel both ways. */
test.each(['replace', 'merge'] as const)('an older archive\'s ticks on steps that became institutions keep only their hidden flag on %s', async (mode) => {
  const older = await device();
  await older.journal.roadmap.setGoalStatus('pl', 'pl-legal-final-copy', 'checked');
  const contents = await exported(older.journal);
  contents.journal.roadmapChecks.push(
    { packKey: 'pl', goalKey: 'pl-legal-passport', status: 'checked', hidden: false },
    { packKey: 'pl', goalKey: 'pl-legal-driving-licence', status: 'checked', hidden: true },
    { packKey: 'pl', goalKey: 'pl-legal-institutions', status: 'checked', hidden: false }
  );
  const target = await device();
  await target.journal.archive[mode](contents);
  assert.deepEqual(await target.journal.roadmap.getGoalStatuses('pl'), { 'pl-legal-final-copy': 'checked' });
  assert.deepEqual(await target.journal.roadmap.getHiddenGoals('pl'), ['pl-legal-driving-licence']);
});

test.each(['replace', 'merge'] as const)('institutions and their dated changes travel on %s', async (mode) => {
  const source = await device();
  const gym = await source.journal.roadmap.addInstitution('Gym');
  await source.journal.roadmap.addInstitutionChange({ institution: 'pl-legal-bank', status: 'waiting', epochDay: 20400, note: 'Branch asked for the ruling' });
  await source.journal.roadmap.addInstitutionChange({ institution: gym.id, status: 'done', epochDay: 20401, note: null });
  const target = await device();
  await target.journal.archive[mode](await exported(source.journal));
  assert.deepEqual(await target.journal.roadmap.getInstitutions(), [gym]);
  assert.deepEqual(
    (await target.journal.roadmap.getInstitutionChanges()).map(({ id: _id, ...rest }) => rest),
    [
      { institution: 'pl-legal-bank', status: 'waiting', epochDay: 20400, note: 'Branch asked for the ruling' },
      { institution: gym.id, status: 'done', epochDay: 20401, note: null }
    ]
  );
});

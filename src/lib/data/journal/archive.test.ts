import assert from 'node:assert/strict';
import { test } from 'vitest';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { thumbFileName } from '../photos/names.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal } from './journal.ts';
import { epochDayFromTimestamp } from '../epochDay.ts';
import { ARCHIVE_SECTIONS } from './archiveSections.ts';
import { columnsOf } from './archiveTable.ts';

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
  const measurementType = await journal.measurements.addCustomMeasurementType('Shoulders');
  await journal.measurements.setMeasurementTypeHidden('hips', true);

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    bodyRegions: { chest: { dysphoria: 40, euphoria: null } }
  });
  const photo = await journal.photos.attach({ entryId: entry }, { full: bytes('full-photo'), thumb: bytes('thumb') });
  await journal.entries.upsertEntry({ id: entry, attachRecordings: [bytes('a recording')] });
  const recording = (await journal.entries.getEntry(entry))!.recordings[0].id;
  await journal.entries.upsertEntry({ id: entry, attachVideos: [bytes('a video note')] });
  const videoNote = (await journal.entries.getEntry(entry))!.videos[0].id;
  const second = await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    description: 'the pharmacist barely looked up',
    templateKey: 'hrt_start'
  });
  const milestonePhoto = await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  const lab = await journal.labs.upsertResult({ epochDay: 20000, analyte: 'estradiol', value: 412.5, unit: 'pmol/L', note: 'fasting' });
  const measurement = await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 79, unit: 'cm' });
  const tally = await journal.tally.log({ epochDay: 20000, kind: 'misgendered' });
  const sideEffect = await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
  const cycleEvent = await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });
  const journalingPause = await journal.journalingPauses.upsertPause({ startEpochDay: 19500, endEpochDay: 19510 });
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
  const schedule = await journal.doses.upsertSchedule({ episodeId: episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null });
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

  const counterevidenceSnapshot = await journal.doubtJournal.saveSnapshot(20000, [
    { epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }
  ]);

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
  const milestoneFeltSense = await journal.feltSense.add(
    { milestoneId: milestone },
    { epochDay: 19365, mood: 5, note: 'a year on, still relieved' }
  );
  const tryoutPhoto = await journal.tryouts.addPhoto(tryout, 19905, { full: bytes('presenting'), thumb: bytes('pt') });

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
    recording,
    videoNote,
    milestone,
    milestonePhoto,
    lab,
    measurement,
    measurementType,
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
    cycleEvent,
    journalingPause,
    personalEffect,
    counterevidenceSnapshot,
    tryout,
    feltSense,
    milestoneFeltSense,
    tryoutPhoto
  };
}

test('entries travel by uuid, with their dimension values, tags, photos, recordings and video notes', async () => {
  const { db, journal, voice, tag, entry, photo, recording, videoNote } = await populated();

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
    photos: [{ id: photo, fileName: `${photo}.jpg`, starred: false, epochDayOverride: null }],
    recordings: [{ id: recording, fileName: `${recording}.webm` }],
    videos: [{ id: videoNote, fileName: `${videoNote}.webm` }],
    bodyRegions: { chest: { dysphoria: 40, euphoria: null } },
    starred: false,
    presentationId: null
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
  assert.deepEqual(entry.recordings, []);
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

  const appointments = snapshot.journal.tagGroups.find((g) => g.key === group.key)!;
  assert.equal(appointments.builtIn, false);
  assert.deepEqual(appointments.tags, [{ id: tag.id, label: 'endo', builtIn: false, hidden: false }]);
});

test('a custom measurement type travels by uuid and a hidden built-in travels hidden (phase 5 ticket 29)', async () => {
  const { journal, measurementType } = await populated();

  const snapshot = await journal.archive.snapshot();

  const waist = snapshot.journal.measurementTypes.find((t) => t.key === 'waist')!;
  assert.equal(waist.builtIn, true);
  assert.equal(waist.hidden, false);
  const hips = snapshot.journal.measurementTypes.find((t) => t.key === 'hips')!;
  assert.equal(hips.hidden, true);
  const custom = snapshot.journal.measurementTypes.find((t) => t.key === measurementType.key)!;
  assert.deepEqual(custom, { key: measurementType.key, name: 'Shoulders', builtIn: false, hidden: false });
});

test('the state a user put on a built-in row travels with it', async () => {
  const { journal } = await populated();

  const snapshot = await journal.archive.snapshot();

  const activities = snapshot.journal.tagGroups.find((g) => g.key === 'activities')!;
  assert.equal(activities.builtIn, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-work')!.hidden, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-therapy')!.label, 'therapy session');
});

test('milestones, lab results, measurements, tally events, side effects, cycle events, journaling pauses, reminders and regimen episodes travel whole', async () => {
  const {
    journal,
    milestone,
    milestonePhoto,
    lab,
    contextLab,
    measurement,
    tally,
    sideEffect,
    cycleEvent,
    journalingPause,
    personalEffect,
    reminder,
    episode
  } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.milestones, [
    {
      id: milestone,
      name: 'HRT start',
      epochDay: 19000,
      description: 'the pharmacist barely looked up',
      templateKey: 'hrt_start',
      roadmapGoalKey: null,
      procedureId: null,
      tryoutId: null,
      photo: { id: milestonePhoto, fileName: `${milestonePhoto}.jpg`, starred: false, epochDayOverride: null }
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
  assert.deepEqual(snapshot.journal.tallyEvents, [{ id: tally, epochDay: 20000, kind: 'misgendered' }]);
  assert.deepEqual(snapshot.journal.sideEffects, [
    { id: sideEffect, name: 'hot flashes', severity: 3, epochDay: 20000 }
  ]);
  assert.deepEqual(snapshot.journal.cycleEvents, [{ id: cycleEvent, kind: 'spotting', epochDay: 20000 }]);
  assert.deepEqual(snapshot.journal.journalingPauses, [
    { id: journalingPause, startEpochDay: 19500, endEpochDay: 19510 }
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
      endEpochDay: null,
      endReason: null
    }
  ]);
});

test('a counterevidence snapshot travels with its items copied in rather than referenced', async () => {
  const { journal, counterevidenceSnapshot } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.counterevidenceSnapshots, [
    {
      id: counterevidenceSnapshot,
      epochDay: 20000,
      timestamp: snapshot.journal.counterevidenceSnapshots[0].timestamp,
      items: [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }]
    }
  ]);
});

test("a tryout travels whole with its photos, and a felt-sense entry travels by whichever owner's own uuid it has", async () => {
  const { journal, tryout, milestone, feltSense, milestoneFeltSense, tryoutPhoto } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.tryouts, [
    {
      id: tryout,
      kind: 'name',
      label: 'Alex',
      description: null,
      startEpochDay: 19900,
      endEpochDay: null,
      photos: [{ id: tryoutPhoto, epochDay: 19905, fileName: `${tryoutPhoto}.jpg` }]
    }
  ]);
  assert.deepEqual(snapshot.journal.feltSenseEntries, [
    {
      id: milestoneFeltSense,
      tryoutId: null,
      milestoneId: milestone,
      epochDay: 19365,
      mood: 5,
      note: 'a year on, still relieved'
    },
    { id: feltSense, tryoutId: tryout, milestoneId: null, epochDay: 19910, mood: 4, note: 'felt right at the pharmacy' }
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
      scheduledTimestamp: null,
      drug: null
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
      scheduledTimestamp: 1_700_090_000_000,
      drug: null
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
    {
      id: schedule,
      episodeId: episode,
      recurrenceKind: 'everyNDays',
      everyNDays: 14,
      weekdays: null,
      dosesPerDay: 1,
      doseAmounts: null
    }
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
      reminderDismissed: false,
      openedEpochDay: null,
      inUseWindowDays: null,
      inUseEndEpochDay: null
    }
  ]);
});

test('the manifest names every photo file and its thumbnail, plus every recording and video-note file, with their lengths', async () => {
  const { journal, photo, milestonePhoto, tryoutPhoto, recording, videoNote } = await populated();

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.files, [
    { name: `${photo}.jpg`, length: 10 },
    { name: thumbFileName(`${photo}.jpg`), length: 5 },
    { name: `${milestonePhoto}.jpg`, length: 1 },
    { name: thumbFileName(`${milestonePhoto}.jpg`), length: 2 },
    { name: `${tryoutPhoto}.jpg`, length: 10 },
    { name: thumbFileName(`${tryoutPhoto}.jpg`), length: 2 },
    { name: `${recording}.webm`, length: bytes('a recording').length },
    { name: `${videoNote}.webm`, length: bytes('a video note').length }
  ]);
  assert.deepEqual(await snapshot.readFile(`${photo}.jpg`), bytes('full-photo'));
  assert.deepEqual(await snapshot.readFile(`${recording}.webm`), bytes('a recording'));
  assert.deepEqual(await snapshot.readFile(`${videoNote}.webm`), bytes('a video note'));
});

/* Phase 8 features ticket 52. The manifest is hand-assembled rather than
   read off the section registry (archive.ts), so a table missing from it
   travels as rows naming bytes that are not in the archive - and restores
   into an area full of broken references. Asserted directly rather than
   left to the golden fixture, which compares committed bytes and so heals
   itself the next time somebody regenerates it. */
test('the manifest carries a document’s page and its thumbnail, not just its row', async () => {
  const { journal, files } = await populated();
  const id = await journal.documents.addDocument(
    { epochDay: 8766, title: 'Opinia psychiatryczna' },
    { full: bytes('a scanned page'), thumb: bytes('its thumb') }
  );
  const document = (await journal.documents.getDocument(id))!;

  const snapshot = await journal.archive.snapshot();

  /* By the row's own file name, not by the document's id: a document's file
     is minted separately from the row that names it (documents.ts), unlike
     a photo, whose row id and file name are the same uuid. */
  const stem = document.fileName.replace(/\.jpg$/, '');
  assert.deepEqual(
    snapshot.files.filter((f) => f.name.startsWith(stem)),
    [
      { name: document.fileName, length: bytes('a scanned page').length },
      { name: thumbFileName(document.fileName), length: bytes('its thumb').length }
    ],
    'the document travels as a row with no bytes'
  );
  assert.deepEqual(await snapshot.readFile(document.fileName), bytes('a scanned page'));
  assert.ok(files.names().includes(document.fileName));
});

test('a trashed entry, and its photo, recording and video-note files, are excluded from the snapshot entirely (phase 5 ticket 19)', async () => {
  const { journal, db, entry, photo, recording, videoNote, milestonePhoto } = await populated();
  const uuid = (await db.query<{ uuid: string }>('SELECT uuid FROM entry WHERE id = ?', [entry]))[0].uuid;

  await journal.entries.deleteEntry(entry);

  const snapshot = await journal.archive.snapshot();

  assert.ok(!snapshot.journal.entries.some((e) => e.uuid === uuid));
  assert.ok(!snapshot.files.some((f) => f.name === `${photo}.jpg`));
  assert.ok(!snapshot.files.some((f) => f.name === `${recording}.webm`));
  assert.ok(!snapshot.files.some((f) => f.name === `${videoNote}.webm`));
  // Nothing else the entry did not own is affected.
  assert.ok(snapshot.files.some((f) => f.name === `${milestonePhoto}.jpg`));
});

test('a photo row whose file is gone keeps its row and leaves the manifest alone', async () => {
  const { journal, files, photo } = await populated();
  await files.remove(`${photo}.jpg`);

  const snapshot = await journal.archive.snapshot();

  assert.ok(!snapshot.files.some((f) => f.name === `${photo}.jpg`));
  assert.ok(snapshot.files.some((f) => f.name === thumbFileName(`${photo}.jpg`)));
  assert.equal(snapshot.journal.entries.flatMap((e) => e.photos).filter((p) => p.id === photo).length, 1);
});

/* ADR-0027 is what makes an area travel, and an area's finished state has to
   travel for the same reason ADR-0043 made its own preference portable: a
   stream that reads as unfinished again on the new phone makes having
   finished it a lie. The date is the part worth pinning by hand - a flag
   would survive a boolean round trip that silently dropped the day. */
test('an area\'s hidden, finished and suspended state travels, and a restore keeps the days it names', async () => {
  const { journal } = await populated();
  await journal.areaStates.setAreasHidden(['sizeRecords'], true);
  await journal.areaStates.setAreasFinished(['hairStages', 'hairPhotos'], 19300);
  await journal.areaStates.setAreasSuspended(['voiceBenchmarks'], 19310);

  const snapshot = await journal.archive.snapshot();

  assert.deepEqual(snapshot.journal.areaStates, [
    { area: 'hairPhotos', hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    { area: 'hairStages', hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    { area: 'sizeRecords', hidden: true, finishedEpochDay: null, suspendedEpochDay: null },
    { area: 'voiceBenchmarks', hidden: false, finishedEpochDay: null, suspendedEpochDay: 19310 }
  ]);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  // No files: this area has none, and a snapshot's `files` is the manifest
  // (names and lengths) rather than the bytes a restore writes.
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });

  assert.deepEqual(await target.areaStates.getAreaStates(), {
    hairPhotos: { hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    hairStages: { hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    sizeRecords: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null },
    voiceBenchmarks: { hidden: false, finishedEpochDay: null, suspendedEpochDay: 19310 }
  });
});

/* Ticket 43: a regimen episode's end reason is the same shape again - a
   fact the person recorded, not derivable, so it travels rather than
   defaulting silently to nothing on the other end. */
test('a regimen episode\'s end reason travels, and a restore keeps it', async () => {
  const { journal, episode } = await populated();
  await journal.regimen.endEpisode(episode, 19100, 'pausedForNow');

  const snapshot = await journal.archive.snapshot();

  assert.equal(
    snapshot.journal.regimenEpisodes.find((e) => e.id === episode)?.endReason,
    'pausedForNow'
  );

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });

  const restored = (await target.regimen.getEpisodes()).find((e) => e.id === episode);
  assert.equal(restored?.endReason, 'pausedForNow');
});

/* Every column of every table, checked against what the snapshot claims to
   carry. The point is drift: an archive that quietly stops carrying a
   column added later is a backup that silently loses data, and nothing
   else in this suite would notice. A new column fails here until it is
   either carried or listed as deliberately left behind.

   The 27 flat sections' columns are not retyped here (phase 8 audit
   finding 24): FLAT_CARRIED walks each one's own descriptor
   (archiveSections.ts's `flatTable`) with the same columnsOf()
   readFlatTable/applyFlatTable already use, so this oracle checks the
   descriptor's agreement with the schema rather than a second map's habit
   of agreeing with the first. Delete a column from a descriptor and this
   table fails the same way an untracked schema column does - carried by
   nothing, because FLAT_CARRIED no longer claims it.

   What stays hand-typed in HAND_WRITTEN_CARRIED is every table a
   descriptor cannot describe - the archive table module's own three
   limits (a child table, a rowid resolved against another section, an
   update branch for a built-in row a Replace overwrites in place) - with
   each exception's reason given where it is declared below. */
const FLAT_CARRIED: Record<string, string[]> = Object.fromEntries(
  ARCHIVE_SECTIONS.flatMap((section) =>
    section.flatTable ? [[section.flatTable.table, columnsOf(section.flatTable).map((c) => c.column)]] : []
  )
);

const HAND_WRITTEN_CARRIED: Record<string, string[]> = {
  // Owns five children below (applyEntries/readEntries) - a descriptor
  // speaks for one table, and a photo/recording/video/dimension-link/
  // tag-link/region-link is six more.
  entry: ['uuid', 'epoch_day', 'timestamp', 'mood', 'note', 'starred', 'presentation_id'],
  // Child of entry, and its own rowid is resolved against dimensions.
  entry_dimension_value: ['entry_id', 'dimension_id', 'value'],
  // Child of entry, and its own rowid is resolved against tagGroups' tags.
  entry_tag: ['entry_id', 'tag_id'],
  // Child of entry. `region` stores bodyRegions' own domain key directly,
  // not a rowid, so this needs no `after` even though it is a child.
  entry_body_region: ['entry_id', 'region', 'dysphoria', 'euphoria'],
  // Built-in rows are updated in place, not just inserted, and the two
  // children below are its own (applyEntryTemplates).
  entry_template: ['uuid', 'key', 'name', 'note_scaffold', 'presentation_id', 'hidden'],
  entry_template_tag: ['template_id', 'tag_id'],
  entry_template_dimension_value: ['template_id', 'dimension_id', 'value'],
  // Shared between two owners (entry, milestone) rather than one section's
  // own table - a descriptor names one table for one section.
  photo: ['uuid', 'entry_id', 'milestone_id', 'file_path', 'order_index', 'starred', 'epoch_day_override'],
  // Owns a child (photo), the same reason `entry` above is hand-written.
  milestone: ['uuid', 'name', 'epoch_day', 'description', 'template_key', 'roadmap_goal_key', 'procedure_id', 'tryout_id'],
  // A matched built-in row is UPDATEd in place (applyDimensions), which a
  // descriptor's insert-if-absent has no branch for.
  gender_dimension: ['uuid', 'key', 'name', 'low_label', 'high_label', 'min_value', 'max_value', 'is_built_in', 'hidden'],
  // Same update branch as gender_dimension, plus its own child below.
  gender_preset: ['uuid', 'key', 'name', 'is_built_in'],
  preset_dimension: ['preset_id', 'dimension_id', 'order_index'],
  // Same update branch as gender_dimension, plus its own child (tag) below.
  tag_group: ['uuid', 'key', 'name', 'enabled', 'order_index'],
  // Child of tag_group, and its own rows are updated in place too
  // (applyTagGroups) - a rename or a hide reaches an already-present tag.
  tag: ['uuid', 'key', 'group_id', 'label', 'hidden', 'order_index'],
  // Same update branch as gender_dimension.
  affirmation: ['uuid', 'key', 'language', 'text', 'hidden'],
  // Same update branch as gender_dimension.
  body_region: ['uuid', 'key', 'name', 'hidden'],
  // Same update branch as gender_dimension.
  measurement_type: ['uuid', 'key', 'name', 'is_built_in', 'hidden'],
  // episode_id travels as the episode's uuid, the way preset_dimension's
  // rowids travel as keys (ADR-0002). Its own rowid is resolved against
  // regimenEpisodes, and dose_schedule_weekday/dose_schedule_dose_amount
  // below are its own children.
  dose_schedule: ['uuid', 'episode_id', 'recurrence_kind', 'every_n_days', 'doses_per_day'],
  // Rowid resolved against regimenEpisodes, the same reason dose_schedule
  // above is hand-written.
  dose_pause: ['uuid', 'episode_id', 'start_epoch_day', 'end_epoch_day', 'reason'],
  // schedule_id travels as the schedule's own uuid, the way dose_pause's
  // episode_id does (ADR-0002) - nested inside its ArchiveDoseSchedule
  // rather than carried as its own section (payload.ts). Children of
  // dose_schedule above.
  dose_schedule_weekday: ['schedule_id', 'weekday'],
  dose_schedule_dose_amount: ['schedule_id', 'position', 'dose', 'dose_unit'],
  // Same update branch as gender_dimension, and the one section with
  // nothing to discard - every row is built-in (archiveSections.ts's own
  // comment).
  effect_category: ['key', 'name', 'enabled'],
  // Same update branch as gender_dimension.
  personal_effect_type: ['uuid', 'key', 'name', 'is_built_in', 'category_key', 'direction', 'hidden'],
  // Read once for the archive's file manifest alongside hair_removal_photo/
  // procedure_photo/tryout_photo below (archive.ts's `manifest()`), so its
  // rows come from SectionRead rather than a second query the way a flat
  // section's own read would issue.
  hair_photo: ['uuid', 'epoch_day', 'file_path'],
  // Owns a child (hair_removal_photo) below.
  hair_removal_session: ['uuid', 'epoch_day', 'area', 'method', 'pain_rating', 'cost', 'provider'],
  // session_id travels as the session's own uuid, the way dose_pause's
  // episode_id does (ADR-0002). Read once for the file manifest, the same
  // reason hair_photo above is hand-written.
  hair_removal_photo: ['uuid', 'session_id', 'file_path'],
  // Owns a child (procedure_photo) below. Its consults are appointments now
  // and travel in their own section (ticket 57).
  procedure: ['uuid', 'name', 'surgery_epoch_day', 'notes'],
  // procedure_id travels as the procedure's own uuid, the way dose_pause's
  // episode_id does (ADR-0002) - here and on the child below.
  appointment: ['uuid', 'procedure_id', 'epoch_day', 'kind', 'place', 'note'],
  // Read once for the file manifest, the same reason hair_photo above is
  // hand-written.
  procedure_photo: ['uuid', 'procedure_id', 'epoch_day', 'file_path'],
  // Owns a child (doubt_snapshot_entry) below.
  doubt_snapshot: ['uuid', 'epoch_day', 'timestamp'],
  doubt_snapshot_entry: ['snapshot_id', 'order_index', 'epoch_day', 'mood', 'note'],
  // Identified by a pack/goal pair (applyRoadmapChecks), not by one column
  // - a compound identity a descriptor's single `identity` field cannot
  // name. No uuid: a tick is named by its pack and goal keys, which mean
  // the same thing on every device, the way a built-in tag travels as its
  // key (ADR-0002).
  roadmap_check: ['pack_key', 'goal_key', 'status'],
  // Owns a child (tryout_photo) below.
  tryout: ['uuid', 'kind', 'label', 'description', 'start_epoch_day', 'end_epoch_day'],
  // Exactly one of tryout_id/milestone_id travels, each as that owner's own
  // uuid, the same shape `photo`'s entry_id/milestone_id pair carries - and
  // both are rowids resolved against the tryouts/milestones sections.
  felt_sense: ['uuid', 'tryout_id', 'milestone_id', 'epoch_day', 'mood', 'note'],
  // Exactly one owner, unlike felt_sense's two - a margin note always
  // belongs to an entry (phase 8 features ticket 07), and entry_id is a
  // rowid resolved against the entries section.
  margin_note: ['uuid', 'entry_id', 'epoch_day', 'text'],
  // Read once for the file manifest, the same reason hair_photo above is
  // hand-written.
  tryout_photo: ['uuid', 'tryout_id', 'epoch_day', 'file_path'],
  // Child of entry (applyEntries), read once for the file manifest the
  // same reason hair_photo above is - `entry_id` travels as the entry's
  // own uuid (ADR-0002).
  voice_recording: ['uuid', 'entry_id', 'file_path', 'order_index'],
  // Same shape as voice_recording just above - child of entry, read once
  // for the file manifest, the same reason hair_photo above is.
  video_note: ['uuid', 'entry_id', 'file_path', 'order_index'],
  // Owns a child (checklist_item) below; unlike a vocabulary table its own
  // row has nothing to UPDATE once created (checklists.ts has no rename or
  // move setter), only the item below is walked in both modes.
  checklist: ['uuid', 'owner_kind', 'owner_uuid', 'appointment_epoch_day'],
  // checklist_id travels as the checklist's own uuid, the way dose_pause's
  // episode_id does (ADR-0002).
  checklist_item: ['uuid', 'checklist_id', 'content', 'checked', 'carried_forward', 'order_index'],
  // Phase 7 ticket 03: `counts` is a JSON-encoded map, still one column -
  // a shape a descriptor's own columns have no transform for. Never
  // `whole` (see archiveSections.ts's own note on why), but this table
  // still travels with a backup.
  import_log: ['uuid', 'source', 'counts', 'imported_at'],
  // Filtered by the portable allowlist rather than carried whole
  // (ADR-0003), which is not a table shape a descriptor's plain column
  // list can express.
  pref: ['key', 'value']
};

const CARRIED: Record<string, string[]> = { ...HAND_WRITTEN_CARRIED, ...FLAT_CARRIED };

/* `id` is this device's rowid and means nothing anywhere else (ADR-0002);
   `updated_at` is written by every area and read by nothing, and an
   archive that carried it would be asserting a fact about another
   device's clock. `entry.trashed_at` (phase 5 ticket 19) is column-specific:
   trash is out of scope for archives entirely (readEntries filters it out
   before this ever runs), so the column travelling with the row it never
   carries would be a column with no purpose on the other end.
   `tally_event.context` (register finding 32.4) is the same shape: nothing
   in the app writes it any more, so it stays in the schema for rows that
   already have it but never travels for a device that has stopped
   producing it. `regimen_episode.hidden` is that same shape again: the
   only control that ever set it is gone (Alicja, 2026-08-27, "get rid of
   the show/hide progesterone button" - it never did more than add a badge
   to the row), and every other table's own `hidden` column stays carried
   as before - this is scoped to `regimen_episode` alone by the per-table
   CARRIED lists above, not by this flat list. */
// debrief_entry_id/debrief_dismissed_epoch_day (phase 6 ticket 08) and their
// appointment-id-keyed successors (migrations.ts v76, ticket 58): device-
// local bookkeeping for the appointment debrief offer, scoped to `checklist`
// alone - never part of what the checklist travels, the same reason `id`
// and `updated_at` never are. debrief_dismissed_epoch_day itself is also
// retained-but-unwritten now (ticket 58 rekeys dismissal to an appointment
// id), which changes nothing about it belonging on this list.
const LEFT_BEHIND = [
  'id',
  'updated_at',
  'trashed_at',
  'context',
  'hidden',
  'debrief_entry_id',
  'debrief_entry_appointment_id',
  'debrief_dismissed_epoch_day',
  'debrief_dismissed_appointment_id'
];

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

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

/** A snapshot without the edit stamps every row carries, and without an entry's empty Trash
    time: the cases here are about what content travels, and archive-merge-edits.test.ts
    about the stamps. */
function unstamped<Snapshot extends { journal: unknown }>(snapshot: Snapshot): Snapshot {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value)
      .filter(([key, field]) => key !== 'updatedAt' && !(key === 'trashedAt' && field === null))
      .map(([key, field]) => [key, strip(field)]));
  };
  return { ...snapshot, journal: strip(snapshot.journal) };
}

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
    bodyRegions: { chest: 30 }
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
  const sideEffect = await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000, resolvedEpochDay: null });
  const cycleEvent = await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });
  const personalEffect = await journal.personalEffects.upsertMarker({
    effect: 'breast_development',
    firstNoticedEpochDay: 19180
  });
  const reminder = await journal.reminders.upsertReminder({
    title: 'injection',
    time: '08:00',
    recurrence: 'EVERY_N_DAYS',
    interval: 7,
    anchorEpochDay: 20000,
    epochDay: null,
    enabled: true,
    drug: 'estradiol valerate'
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
     the freeze this archive then has to carry across. */
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
  const schedule = await journal.doses.upsertSchedule({ episodeId: episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
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
    personalEffect,
    tryout,
    feltSense,
    tryoutPhoto
  };
}

test('entries travel by uuid, with their dimension values, tags, photos, recordings and video notes', async () => {
  const { db, journal, voice, tag, entry, photo, recording, videoNote } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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
    bodyRegions: { chest: 30 },
    starred: false,
    presentationId: null
  });
  assert.equal(snapshot.journal.entries.length, 2);
});

test('an entry with nothing but a mood carries empty collections, not missing ones', async () => {
  const { db, journal, second } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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

  const snapshot = unstamped(await journal.archive.snapshot());

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

test('the state a user put on a built-in row travels with it', async () => {
  const { journal } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

  const activities = snapshot.journal.tagGroups.find((g) => g.key === 'activities')!;
  assert.equal(activities.builtIn, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-work')!.hidden, true);
  assert.equal(activities.tags.find((t) => t.id === 'a-therapy')!.label, 'therapy session');
});

test('milestones, lab results, side effects, cycle events, reminders and regimen episodes travel whole', async () => {
  const {
    journal,
    milestone,
    milestonePhoto,
    lab,
    contextLab,
    sideEffect,
    cycleEvent,
    personalEffect,
    reminder,
    episode
  } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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
      timingDayOfInterval: 5,
      costAmount: null,
      costCurrency: null,
      costRefunded: false
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
      timingDayOfInterval: null,
      costAmount: null,
      costCurrency: null,
      costRefunded: false
    }
  ]);
  assert.deepEqual(snapshot.journal.sideEffects, [
    { id: sideEffect, name: 'hot flashes', severity: 3, epochDay: 20000, resolvedEpochDay: null }
  ]);
  assert.deepEqual(snapshot.journal.cycleEvents, [{ id: cycleEvent, kind: 'spotting', epochDay: 20000 }]);
  assert.deepEqual(snapshot.journal.personalEffects, [
    { id: personalEffect, effect: 'breast_development', firstNoticedEpochDay: 19180 }
  ]);
  assert.deepEqual(snapshot.journal.reminders, [
    {
      id: reminder,
      title: 'injection',
      time: '08:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 7,
      anchorEpochDay: 20000,
      epochDay: null,
      enabled: true,
      autoSource: null,
      drug: 'estradiol valerate'
    }
  ]);
  assert.deepEqual(snapshot.journal.regimenEpisodes, [
    {
      id: episode,
      drug: 'estradiol valerate',
      drugClass: 'hrt',
      ester: 'valerate',
      dose: 4,
      doseUnit: 'mg',
      route: 'im',
      interval: 'every 2 weeks',
      startEpochDay: 19000,
      endEpochDay: null,
      endReason: null,
      hidden: false
    }
  ]);
});

test("a tryout travels whole with its photos, and a felt-sense entry travels by its tryout's own uuid", async () => {
  const { journal, tryout, feltSense, tryoutPhoto } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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
    { id: feltSense, tryoutId: tryout, epochDay: 19910, mood: 4, note: 'felt right at the pharmacy' }
  ]);
});

/* A milestone no longer holds felt-sense readings. An archive written before that still
   carries them, and it stays restorable: those rows are dropped, not converted, and a
   tryout's readings come through as before. */
test("an older archive's milestone felt-sense readings are dropped on restore; a tryout's are kept", async () => {
  const { journal, tryout, milestone, feltSense } = await populated();
  const snapshot = unstamped(await journal.archive.snapshot());
  const older = {
    ...snapshot.journal,
    feltSenseEntries: [
      { id: 'from-a-milestone', tryoutId: null, milestoneId: milestone, epochDay: 19365, mood: 5, note: 'a year on' },
      ...snapshot.journal.feltSenseEntries.map((entry) => ({ ...entry, milestoneId: null }))
    ]
  } as typeof snapshot.journal;

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: older, files: (async function* () {})() });

  assert.deepEqual(unstamped(await target.archive.snapshot()).journal.feltSenseEntries.map((entry) => entry.id), [feltSense]);
  assert.deepEqual((await target.feltSense.forTryout(tryout)).map((entry) => entry.id), [feltSense]);
});

test('dose events travel whole, including the route-conditional fields and a changed dose\'s scheduled value', async () => {
  const { journal, dose, changedDose } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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
      drug: null,
      source: 'person',
      autoLogEpisodeId: null, autoLogEpochDay: null, autoLogIndex: null
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
      drug: null,
      source: 'person',
      autoLogEpisodeId: null, autoLogEpochDay: null, autoLogIndex: null
    }
  ]);
});

test('person-logged doses carry no automatic-slot provenance', async () => {
  const { journal } = await populated();
  for (const dose of (unstamped(await journal.archive.snapshot())).journal.doseEvents) {
    assert.equal(dose.autoLogEpisodeId, null);
    assert.equal(dose.autoLogEpochDay, null);
    assert.equal(dose.autoLogIndex, null);
  }
});

test('schedules and pauses name their episode by its travelling uuid, not this device\'s rowid', async () => {
  const { journal, episode, schedule, dosePause } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.deepEqual(snapshot.journal.doseSchedules, [
    {
      id: schedule,
      episodeId: episode,
      recurrenceKind: 'everyNDays',
      everyNDays: 14,
      weekdays: null,
      dosesPerDay: 1,
      doseAmounts: null,
      autoLogFromEpochDay: null
    }
  ]);
  assert.deepEqual(snapshot.journal.dosePauses, [
    { id: dosePause, episodeId: episode, startEpochDay: 19100, endEpochDay: 19110, reason: 'accidental' }
  ]);
});

test('medication stock travels whole, including its reminder hand-off bookkeeping', async () => {
  const { journal, stock } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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
      inUseEndEpochDay: null,
      leadTimeDays: null,
      dosesPerUnit: null,
      expiryEpochDay: null,
      pharmacyNote: null,
      costAmount: null,
      costCurrency: null,
      costRefunded: false
    }
  ]);
});

/* Typed by a person and not derivable, so they travel, and a restore keeps them. */
test('a stock expiry day and pharmacy note travel, and a restore keeps them', async () => {
  const { journal, stock } = await populated();
  await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000,
    expiryEpochDay: 19400,
    pharmacyNote: 'Batch 7, second pharmacy'
  });

  const snapshot = unstamped(await journal.archive.snapshot());
  const row = snapshot.journal.medicationStock.find((s) => s.id === stock);
  assert.equal(row?.expiryEpochDay, 19400);
  assert.equal(row?.pharmacyNote, 'Batch 7, second pharmacy');

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });
  const [restored] = await target.stock.getEntries();
  assert.equal(restored.expiryEpochDay, 19400);
  assert.equal(restored.pharmacyNote, 'Batch 7, second pharmacy');
});

test('an archive written before the stock expiry fields restores them as null', async () => {
  const { journal } = await populated();
  const snapshot = unstamped(await journal.archive.snapshot());
  const older = structuredClone(snapshot.journal) as unknown as { medicationStock: Record<string, unknown>[] };
  for (const row of older.medicationStock) {
    delete row.expiryEpochDay;
    delete row.pharmacyNote;
  }

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: older as unknown as typeof snapshot.journal, files: (async function* () {})() });
  const [restored] = await target.stock.getEntries();
  assert.equal(restored.expiryEpochDay, null);
  assert.equal(restored.pharmacyNote, null);
});

/* Redesign a lead time is a person's own typed figure, not derivable, so it has to travel
   rather than defaulting silently to null on the other end - the same reasoning end reason
   test above gives. */
test('a lead time and doses per unit travel, and a restore keeps them', async () => {
  const { journal, stock } = await populated();
  await journal.stock.upsertEntry({
    drug: 'estradiol valerate',
    quantity: 10,
    unit: 'vials',
    recordedEpochDay: 19000,
    leadTimeDays: 21,
    dosesPerUnit: 5
  });

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.equal(snapshot.journal.medicationStock.find((s) => s.id === stock)?.leadTimeDays, 21);
  assert.equal(snapshot.journal.medicationStock.find((s) => s.id === stock)?.dosesPerUnit, 5);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });

  const restored = (await target.stock.getEntries()).find((s) => s.id === stock);
  assert.equal(restored?.leadTimeDays, 21);
  assert.equal(restored?.dosesPerUnit, 5);
});

test('a side effect travels ongoing or resolved, and an older archive reads as ongoing', async () => {
  const { journal } = await populated();
  const resolved = await journal.sideEffects.upsertSideEffect({ name: 'acne', severity: 2, epochDay: 19000, resolvedEpochDay: 19090 });

  const snapshot = unstamped(await journal.archive.snapshot());
  assert.equal(snapshot.journal.sideEffects.find((e) => e.id === resolved)?.resolvedEpochDay, 19090);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });
  const days = async (j: typeof target) => Object.fromEntries((await j.sideEffects.getSideEffects()).map((e) => [e.name, e.resolvedEpochDay]));
  assert.deepEqual(await days(target), { 'hot flashes': null, acne: 19090 });

  const older = {
    ...snapshot.journal,
    sideEffects: snapshot.journal.sideEffects.map(({ resolvedEpochDay: _resolved, ...rest }) => rest)
  } as typeof snapshot.journal;
  const fromOlder = openJournal(await migratedDb(), fakeFileStore());
  await fromOlder.reconcileBuiltIns();
  await fromOlder.archive.replace({ journal: older, files: (async function* () {})() });
  assert.deepEqual(await days(fromOlder), { 'hot flashes': null, acne: null });
});

test('the manifest names every photo file and its thumbnail, plus every recording and video-note file, with their lengths', async () => {
  const { journal, photo, milestonePhoto, tryoutPhoto, recording, videoNote } = await populated();

  const snapshot = unstamped(await journal.archive.snapshot());

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

/* The manifest is hand-assembled rather than read off the section registry (archive.ts), so
   a table missing from it travels as rows naming bytes that are not in the archive - and
   restores into an area full of broken references. Asserted directly rather than left to
   the golden fixture, which compares committed bytes and so heals itself the next time
   somebody regenerates it. */
test('the manifest carries a document’s page and its thumbnail, not just its row', async () => {
  const { journal, files } = await populated();
  const id = await journal.documents.addDocument(
    { epochDay: 8766, title: 'Opinia psychiatryczna' },
    { full: bytes('a scanned page'), thumb: bytes('its thumb') }
  );
  const document = (await journal.documents.getDocument(id))!;

  const snapshot = unstamped(await journal.archive.snapshot());

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

/* A PDF document's two files are the file itself and the first page drawn at import, whose
   name is spelled off the `.pdf` - the same reasoning as above, over the kind `filesOf()`
   alone gets wrong. */
test('the manifest carries a PDF document’s file and the page drawn at import', async () => {
  const { journal } = await populated();
  const id = await journal.documents.addDocument(
    { epochDay: 8766, title: 'Court ruling' },
    { pdfBytes: bytes('%PDF-1.4 a whole ruling'), thumb: bytes('its first page') }
  );
  const document = (await journal.documents.getDocument(id))!;
  const thumbName = document.fileName.replace(/\.pdf$/, '-thumb.jpg');

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.deepEqual(
    snapshot.files.filter((f) => f.name.startsWith(document.fileName.replace(/\.pdf$/, ''))),
    [
      { name: document.fileName, length: bytes('%PDF-1.4 a whole ruling').length },
      { name: thumbName, length: bytes('its first page').length }
    ],
    'a PDF document travels as its file and its page'
  );
  assert.deepEqual(await snapshot.readFile(document.fileName), bytes('%PDF-1.4 a whole ruling'));
});

/* The other half of it: a PDF the renderer could not read has no page
   file at all, and the manifest names what is there rather than what the
   name says could be. */
test('the manifest leaves out a page a PDF never had', async () => {
  const { journal } = await populated();
  const id = await journal.documents.addDocument(
    { epochDay: 8766, title: 'Something scanned oddly' },
    { pdfBytes: bytes('%PDF-1.4 unreadable'), thumb: null }
  );
  const document = (await journal.documents.getDocument(id))!;

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.deepEqual(
    snapshot.files.filter((f) => f.name.startsWith(document.fileName.replace(/\.pdf$/, ''))),
    [{ name: document.fileName, length: bytes('%PDF-1.4 unreadable').length }]
  );
});

/* Left Trash out of archives. carries it, so moving an entry to Trash on one device,
   restoring it, or deleting it for good reaches the other through a Merge. */
test('a trashed entry travels with its Trash time, and its photo, recording and video-note files with it', async () => {
  const { journal, db, entry, photo, recording, videoNote, milestonePhoto } = await populated();
  const uuid = (await db.query<{ uuid: string }>('SELECT uuid FROM entry WHERE id = ?', [entry]))[0].uuid;

  await journal.entries.deleteEntry(entry);
  const [{ trashed_at }] = await db.query<{ trashed_at: number }>('SELECT trashed_at FROM entry WHERE id = ?', [entry]);

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.equal(snapshot.journal.entries.find((e) => e.uuid === uuid)?.trashedAt, trashed_at);
  assert.ok(snapshot.files.some((f) => f.name === `${photo}.jpg`));
  assert.ok(snapshot.files.some((f) => f.name === `${recording}.webm`));
  assert.ok(snapshot.files.some((f) => f.name === `${videoNote}.webm`));
  assert.ok(snapshot.files.some((f) => f.name === `${milestonePhoto}.jpg`));
});

test('a photo row whose file is gone keeps its row and leaves the manifest alone', async () => {
  const { journal, files, photo } = await populated();
  await files.remove(`${photo}.jpg`);

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.ok(!snapshot.files.some((f) => f.name === `${photo}.jpg`));
  assert.ok(snapshot.files.some((f) => f.name === thumbFileName(`${photo}.jpg`)));
  assert.equal(snapshot.journal.entries.flatMap((e) => e.photos).filter((p) => p.id === photo).length, 1);
});

/* ADR-0027 is what makes an area travel, and an area's finished state has to travel like
   the cycle preference: a stream that reads as unfinished again on the new phone makes
   having finished it a lie. The date is the part worth pinning by hand - a flag would
   survive a boolean round trip that silently dropped the day. */
test('an area\'s hidden, finished and suspended state travels, and a restore keeps the days it names', async () => {
  const { journal } = await populated();
  await journal.areaStates.setAreasHidden(['wearSessions'], true);
  await journal.areaStates.setAreasFinished(['personalEffects', 'sideEffects'], 19300);
  await journal.areaStates.setAreasSuspended(['voiceBenchmarks'], 19310);

  const snapshot = unstamped(await journal.archive.snapshot());

  assert.deepEqual(snapshot.journal.areaStates, [
    { area: 'personalEffects', hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    { area: 'sideEffects', hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    { area: 'voiceBenchmarks', hidden: false, finishedEpochDay: null, suspendedEpochDay: 19310 },
    { area: 'wearSessions', hidden: true, finishedEpochDay: null, suspendedEpochDay: null }
  ]);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  // No files: this area has none, and a snapshot's `files` is the manifest
  // (names and lengths) rather than the bytes a restore writes.
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });

  assert.deepEqual(await target.areaStates.getAreaStates(), {
    personalEffects: { hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    sideEffects: { hidden: false, finishedEpochDay: 19300, suspendedEpochDay: null },
    wearSessions: { hidden: true, finishedEpochDay: null, suspendedEpochDay: null },
    voiceBenchmarks: { hidden: false, finishedEpochDay: null, suspendedEpochDay: 19310 }
  });
});

/* A regimen episode's end reason is the same shape again - a fact the person recorded, not
   derivable, so it travels rather than defaulting silently to nothing on the other end. */
test('a regimen episode\'s end reason travels, and a restore keeps it', async () => {
  const { journal, episode } = await populated();
  await journal.regimen.endEpisode(episode, 19100, 'pausedForNow');

  const snapshot = unstamped(await journal.archive.snapshot());

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

/* an episode put away stays put away across a backup. Hidden is the person's own statement
   that the row was a mistake, so a restore that brought it back into Care and the curve
   would undo it. An archive from before the field existed reads as shown. */
test('a hidden regimen episode travels hidden, and a restore keeps it hidden', async () => {
  const { journal, episode } = await populated();
  await journal.regimen.setEpisodeHidden(episode, true);

  const snapshot = unstamped(await journal.archive.snapshot());
  assert.equal(snapshot.journal.regimenEpisodes.find((e) => e.id === episode)?.hidden, true);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });

  assert.equal((await target.regimen.getEpisodes()).some((e) => e.id === episode), false);
  assert.deepEqual((await target.regimen.getHiddenEpisodes()).map((e) => e.id), [episode]);

  const older = {
    ...snapshot.journal,
    regimenEpisodes: snapshot.journal.regimenEpisodes.map(({ hidden: _hidden, ...rest }) => rest)
  } as typeof snapshot.journal;
  const fromOlder = openJournal(await migratedDb(), fakeFileStore());
  await fromOlder.reconcileBuiltIns();
  await fromOlder.archive.replace({ journal: older, files: (async function* () {})() });
  assert.equal((await fromOlder.regimen.getEpisodes()).some((e) => e.id === episode), true);
});

/* A milestone set not to be celebrated travels that way, and only that way - a celebrated
   one carries no field, so an archive written before the field existed restores every
   milestone celebrated, which is what it was. */
test("a milestone's celebration choice travels, and an older archive restores it celebrated", async () => {
  const { journal, milestone } = await populated();
  const quiet = await journal.milestones.upsertMilestone({ name: 'The hard one', epochDay: 19100, celebrate: false });

  const snapshot = unstamped(await journal.archive.snapshot());
  assert.equal(snapshot.journal.milestones.find((mi) => mi.id === quiet)?.celebrate, false);
  assert.equal('celebrate' in snapshot.journal.milestones.find((mi) => mi.id === milestone)!, false);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });
  const celebrated = async (j: typeof target) =>
    Object.fromEntries((await j.milestones.getMilestones()).map((mi) => [mi.id, mi.celebrate]));
  assert.deepEqual(await celebrated(target), { [milestone]: true, [quiet]: false });

  const older = {
    ...snapshot.journal,
    milestones: snapshot.journal.milestones.map(({ celebrate: _celebrate, ...rest }) => rest)
  } as typeof snapshot.journal;
  const fromOlder = openJournal(await migratedDb(), fakeFileStore());
  await fromOlder.reconcileBuiltIns();
  await fromOlder.archive.replace({ journal: older, files: (async function* () {})() });
  assert.deepEqual(await celebrated(fromOlder), { [milestone]: true, [quiet]: true });
});

/* The drug class is the person's to change, so it travels as stored. An archive from before
   the field existed carries no class, and a restore infers it from the drug by the
   migration's rule. */
test('a drug class travels as chosen, and an older archive gets the inferred class', async () => {
  const { journal, episode } = await populated();
  await journal.regimen.upsertEpisode({
    id: episode, drug: 'estradiol valerate', drugClass: 'other', ester: 'valerate', dose: 4, doseUnit: 'mg',
    route: 'im', interval: 'every 2 weeks', startEpochDay: 19000, endEpochDay: null, endReason: null
  });
  const ssri = await journal.regimen.upsertEpisode({
    drug: 'Sertraline', ester: null, dose: 50, doseUnit: 'mg', route: 'oral', interval: 'daily',
    startEpochDay: 18000, endEpochDay: null, endReason: null
  });

  const snapshot = unstamped(await journal.archive.snapshot());
  assert.equal(snapshot.journal.regimenEpisodes.find((e) => e.id === episode)?.drugClass, 'other');

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });
  const classes = async (j: typeof target) => Object.fromEntries((await j.regimen.getEpisodes()).map((e) => [e.id, e.drugClass]));
  assert.deepEqual(await classes(target), { [episode]: 'other', [ssri]: 'other' });

  const older = {
    ...snapshot.journal,
    regimenEpisodes: snapshot.journal.regimenEpisodes.map(({ drugClass: _drugClass, ...rest }) => rest)
  } as typeof snapshot.journal;
  const fromOlder = openJournal(await migratedDb(), fakeFileStore());
  await fromOlder.reconcileBuiltIns();
  await fromOlder.archive.replace({ journal: older, files: (async function* () {})() });
  assert.deepEqual(await classes(fromOlder), { [episode]: 'hrt', [ssri]: 'other' });
});

/* A document's link travels as the pair it is stored as, and a dangling one travels too.
   The link names a row in one of four tables rather than pointing at a rowid this section
   could resolve, so a restore writes back exactly what it was given - which is the
   requirement, not a gap: a document outlives the thing it was filed under. */
test("a document's link travels, dangling or not, and a restore keeps both", async () => {
  const { journal, milestone } = await populated();
  const filed = await journal.documents.addDocument(
    { epochDay: 20000, title: 'Endo letter' },
    { full: bytes('a page'), thumb: bytes('its thumb') }
  );
  const orphaned = await journal.documents.addDocument(
    { epochDay: 19999, title: 'A ruling about a goal that is gone' },
    { full: bytes('another page'), thumb: bytes('another thumb') }
  );
  await journal.documents.setDocumentTarget(filed, { kind: 'milestone', id: milestone });
  await journal.documents.setDocumentTarget(orphaned, { kind: 'episode', id: 'e-no-longer-here' });

  const snapshot = unstamped(await journal.archive.snapshot());

  const travelled = (id: string) => {
    const document = snapshot.journal.documents.find((d) => d.id === id)!;
    return [document.targetKind, document.targetId];
  };
  assert.deepEqual(travelled(filed), ['milestone', milestone]);
  assert.deepEqual(travelled(orphaned), ['episode', 'e-no-longer-here']);

  const target = openJournal(await migratedDb(), fakeFileStore());
  await target.reconcileBuiltIns();
  await target.archive.replace({ journal: snapshot.journal, files: (async function* () {})() });

  const restoredFiled = (await target.documents.getDocument(filed))!;
  assert.equal(restoredFiled.targetKind, 'milestone');
  assert.equal(restoredFiled.targetId, milestone);

  const restoredOrphan = (await target.documents.getDocument(orphaned))!;
  assert.equal(restoredOrphan.targetKind, 'episode');
  assert.equal(restoredOrphan.targetId, 'e-no-longer-here', 'a link whose target is gone travels unresolved');
});

/* Match every schema column to archive coverage or an explicit
   omission. FLAT_CARRIED uses columnsOf() on the same flatTable
   descriptors as readers and writers. HAND_WRITTEN_CARRIED covers
   child tables, cross-section rowids and built-in rows overwritten
   in place by Replace. */
const FLAT_CARRIED: Record<string, string[]> = Object.fromEntries(
  ARCHIVE_SECTIONS.flatMap((section) =>
    section.flatTable ? [[section.flatTable.table, columnsOf(section.flatTable).map((c) => c.column)]] : []
  )
);

const HAND_WRITTEN_CARRIED: Record<string, string[]> = {
  // Owns five children below (applyEntries/readEntries) - a descriptor
  // speaks for one table, and a photo/recording/video/dimension-link/
  // tag-link/region-link is six more.
  // Trash travels.
  entry: ['uuid', 'epoch_day', 'timestamp', 'mood', 'note', 'starred', 'presentation_uuid', 'trashed_at'],
  // Child of entry, and its own rowid is resolved against dimensions.
  entry_dimension_value: ['entry_id', 'dimension_id', 'value'],
  // Child of entry, and its own rowid is resolved against tagGroups' tags.
  entry_tag: ['entry_id', 'tag_id'],
  // Child of entry. `region` stores bodyRegions' own domain key directly,
  // not a rowid, so this needs no `after` even though it is a child.
  entry_body_region: ['entry_id', 'region', 'value'],
  // Shared between two owners (entry, milestone) rather than one section's
  // own table - a descriptor names one table for one section.
  photo: ['uuid', 'entry_id', 'milestone_id', 'file_path', 'order_index', 'starred', 'epoch_day_override'],
  // Owns a child (photo), the same reason `entry` above is hand-written.
  milestone: ['uuid', 'name', 'epoch_day', 'description', 'template_key', 'roadmap_goal_key', 'procedure_uuid', 'tryout_uuid', 'celebrate'],
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
  tag: ['uuid', 'key', 'group_id', 'label', 'hidden', 'icon', 'order_index'],
  // Same update branch as gender_dimension.
  // Same update branch as gender_dimension.
  body_region: ['uuid', 'key', 'name', 'hidden'],
  // Same update branch as gender_dimension.
  // episode_id travels as the episode's uuid, the way preset_dimension's
  // rowids travel as keys (ADR-0002). Its own rowid is resolved against
  // regimenEpisodes, and dose_schedule_weekday/dose_schedule_dose_amount
  // below are its own children.
  dose_schedule: ['uuid', 'episode_id', 'recurrence_kind', 'every_n_days', 'doses_per_day', 'auto_log_from_epoch_day'],
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
  // Read once for the file manifest, the same reason hair_removal_photo is.
  progress_photo: ['uuid', 'epoch_day', 'pose', 'file_path'],
  progress_pose: ['uuid', 'key', 'name', 'hidden'],
  // Owns a child (hair_removal_photo) below.
  // The old free-text `cost` is left behind: version 115 emptied it into the
  // cost columns or the note, and drops it.
  hair_removal_session: ['uuid', 'epoch_day', 'area', 'method', 'pain_rating', 'minutes', 'provider', 'note',
    'cost_amount', 'cost_currency', 'cost_refunded'],
  // session_id travels as the session's own uuid, the way dose_pause's
  // episode_id does (ADR-0002). Read once for the file manifest, the same
  // reason progress_photo above is hand-written.
  hair_removal_photo: ['uuid', 'session_id', 'file_path'],
  // Owns a child (procedure_photo) below. Its consults are appointments now
  // and travel in their own section.
  procedure: ['uuid', 'name', 'surgery_epoch_day', 'notes', 'kind', 'dilation_opt_in', 'archived',
    'cost_amount', 'cost_currency', 'cost_refunded'],
  // procedure_id travels as the procedure's own uuid, the way dose_pause's
  // episode_id does (ADR-0002) - here and on the child below.
  appointment: ['uuid', 'procedure_id', 'epoch_day', 'kind', 'place', 'note', 'referred_epoch_day',
    // provider_id travels as the provider's uuid, like procedure_id.
    'time_of_day', 'provider_id', 'cost_amount', 'cost_currency', 'cost_refunded'],
  // appointment_id travels as nesting under its appointment, the
  // way procedure_photo travels under its procedure.
  appointment_status: ['uuid', 'appointment_id', 'epoch_day', 'status'],
  // procedure_id for the same reason, since schema v83 gave the taper the
  // procedure it dilates for in place of a surgery day of its own.
  taper: ['uuid', 'procedure_id', 'start_epoch_day', 'stages'],
  // Read once for the file manifest, the same reason progress_photo above is
  // hand-written.
  procedure_photo: ['uuid', 'procedure_id', 'epoch_day', 'file_path'],
  // Identified by a pack/goal pair (applyRoadmapChecks), not by one column
  // - a compound identity a descriptor's single `identity` field cannot
  // name. No uuid: a tick is named by its pack and goal keys, which mean
  // the same thing on every device, the way a built-in tag travels as its
  // key (ADR-0002).
  roadmap_check: ['pack_key', 'goal_key', 'status', 'hidden'],
  // Owns a child (tryout_photo) below.
  tryout: ['uuid', 'kind', 'label', 'description', 'start_epoch_day', 'end_epoch_day'],
  // Exactly one of tryout_id/milestone_id travels, each as that owner's own
  // uuid, the same shape `photo`'s entry_id/milestone_id pair carries - and
  // both are rowids resolved against the tryouts/milestones sections.
  felt_sense: ['uuid', 'tryout_id', 'epoch_day', 'mood', 'note'],
  // Exactly one owner, unlike felt_sense's two - a margin note always
  // belongs to an entry, and entry_id is a
  // rowid resolved against the entries section.
  margin_note: ['uuid', 'entry_id', 'epoch_day', 'text'],
  // Read once for the file manifest, the same reason progress_photo above is
  // hand-written.
  tryout_photo: ['uuid', 'tryout_id', 'epoch_day', 'file_path'],
  // Child of entry (applyEntries), read once for the file manifest the
  // same reason progress_photo above is - `entry_id` travels as the entry's
  // own uuid (ADR-0002).
  voice_recording: ['uuid', 'entry_id', 'file_path', 'order_index'],
  // Same shape as voice_recording just above - child of entry, read once
  // for the file manifest, the same reason progress_photo above is.
  video_note: ['uuid', 'entry_id', 'file_path', 'order_index'],
  // Owns a child (checklist_item) below; unlike a vocabulary table its own
  // row has nothing to UPDATE once created (checklists.ts has no rename or
  // move setter), only the item below is walked in both modes.
  checklist: ['uuid', 'owner_kind', 'owner_uuid'],
  // checklist_id travels as the checklist's own uuid, the way dose_pause's
  // episode_id does (ADR-0002).
  checklist_item: ['uuid', 'checklist_id', 'content', 'checked', 'carried_forward', 'order_index'],
  // `counts` is a JSON-encoded map, still one column -
  // a shape a descriptor's own columns have no transform for. Never
  // `whole` (see archiveSections.ts's own note on why), but this table
  // still travels with a backup.
  import_log: ['uuid', 'source', 'counts', 'imported_at'],
  // What this device deleted, carried whole for a Merge to apply.
  deletion: ['tbl', 'row_key', 'deleted_at'],
  // Device-local: every column of it is left behind (below).
  appointment_debrief: [],
  // Filtered by the portable allowlist rather than carried whole
  // (ADR-0003), which is not a table shape a descriptor's plain column
  // list can express.
  pref: ['key', 'value']
};

const CARRIED: Record<string, string[]> = { ...HAND_WRITTEN_CARRIED, ...FLAT_CARRIED };

/* `id` is this device's rowid and means nothing anywhere else (ADR-0002). `updated_at` is
   carried on every row that has it (CARRIED_EVERYWHERE below): it is what a Merge compares.
   `regimen_episode.hidden` stays in the schema and never travels: the only control that
   ever set it is gone, and every other table's own `hidden` column stays carried as before
   - this is scoped to `regimen_episode` alone by the per-table CARRIED lists above, not by
   this flat list. */
// The debrief offer's bookkeeping is
// device-local: it names an entry row this device holds. It sat on `checklist`
// until schema v119 moved it to `appointment_debrief`, whose columns are left
// behind per table below, never part of what an archive carries.
const CARRIED_EVERYWHERE = ['updated_at'];

const LEFT_BEHIND = ['id', 'hidden'];

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
    // Stock identity is rebuilt from the drug's wire spelling on this device.
    const known = [...CARRIED[name], ...CARRIED_EVERYWHERE, ...LEFT_BEHIND, ...(name === 'medication_stock' ? ['drug_key'] : []),
      // Device-local debrief state (schema v119): nothing of it travels.
      ...(name === 'appointment_debrief' ? ['appointment_uuid', 'entry_id', 'dismissed'] : []),
      // Which analyzer measured a take (schema v119): stored, not yet on the
      // wire, so the golden archive stays as it was.
      ...(name === 'voice_benchmark' ? ['analyzer_version'] : [])];
    for (const column of columns) {
      assert.ok(known.includes(column.name), `${name}.${column.name} is neither carried nor left behind`);
    }
    for (const claimed of CARRIED[name]) {
      assert.ok(columns.some((c) => c.name === claimed), `${name}.${claimed} is claimed but not in the schema`);
    }
  }
});

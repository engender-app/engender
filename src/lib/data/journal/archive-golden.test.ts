/* The golden archive: one encrypted backup, committed as bytes, holding at
   least one row in every section an archive carries.

   It exists because the wiring that decides which sections travel is spread
   across a snapshot, a restore and a wire type, and a section dropped from
   one of them fails silently - the archive is simply short that area and
   everything still passes. Reading a fixture that was packed once and never
   again is the only check that notices, because nothing in this test can
   change what the fixture says an archive of that journal looks like.

   Regenerating it is deliberate and rare. `GOLDEN_ARCHIVE=rebuild npx vitest
   run src/lib/data/journal/archive-golden.test.ts` repacks both files from a
   fresh journal; every id in them changes, so a diff that touches more than
   the section under discussion is the signal to stop and look. Adding a
   built-in dimension, preset or tag is the one routine reason it will need
   doing: the vocabulary sections carry the built-ins as they stood when the
   fixture was packed. */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences, type ArchiveJournal } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { openJournal, type Journal } from './journal.ts';

const archivePath = fileURLToPath(new URL('./fixtures/golden-archive.ttbackup', import.meta.url));
const journalPath = fileURLToPath(new URL('./fixtures/golden-journal.json', import.meta.url));

const GOLDEN_PASSWORD = 'a golden horse, stapled';

/* The real parameters take about a second per derivation by design
   (ADR-0013) and would be paid on every run of this file. They travel in the
   header, so the fixture packs with the cheap set pack.test.ts uses and the
   browser tier is where the real ones get exercised. */
const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

/** Every section `ArchiveJournal` declares. Spelled out rather than read off
    a value, so this file keeps saying what the archive carried on the day it
    was written even if the shape it is checked against moves. */
const SECTIONS = [
  'dimensions',
  'presets',
  'tagGroups',
  'entries',
  'milestones',
  'labResults',
  'measurements',
  'sideEffects',
  'cycleEvents',
  'personalEffects',
  'hairStages',
  'hairPhotos',
  'reminders',
  'tallyEvents',
  'doubtEntries',
  'counterevidenceSnapshots',
  'letters',
  'roadmapChecks',
  'regimenEpisodes',
  'doseEvents',
  'doseSchedules',
  'dosePauses',
  'medicationStock',
  'tryouts',
  'feltSenseEntries',
  'checklists'
] as const satisfies readonly (keyof ArchiveJournal)[];

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

async function* oneShot(source: Uint8Array): AsyncGenerator<Uint8Array> {
  yield source;
}

async function emptyDevice(): Promise<Journal> {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.reconcileBuiltIns();
  return journal;
}

/** A journal with something in all 26 sections, and the customizations that
    make the vocabulary ones more than the built-ins: a custom dimension in a
    custom preset, a custom group with a tag of its own, a custom tag inside a
    built-in group, and a renamed, a hidden and a switched-off built-in. */
async function everySection(): Promise<Journal> {
  const journal = await emptyDevice();

  const voice = await journal.dimensions.addCustomDimension({
    name: 'Voice comfort',
    low: 'off',
    high: 'mine',
    min: 0,
    max: 10
  });
  await journal.dimensions.addPreset({ name: 'Mine', dims: [voice.key, 'femininity'] });
  await journal.dimensions.setDimensionHidden('masculinity', true);
  const group = await journal.tags.addGroup('Appointments');
  const tag = await journal.tags.addTag(group.key, 'endo');
  await journal.tags.addTag('emotions', 'wired');
  await journal.tags.renameTag('a-therapy', 'therapy session');
  await journal.tags.setTagHidden('a-work', true);
  await journal.tags.setGroupEnabled('activities', false);

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day, zażółć gęślą jaźń',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    bodyRegions: { chest: 45 }
  });
  await journal.photos.attach({ entryId: entry }, { full: bytes('full photo'), thumb: bytes('thumb') });
  await journal.entries.upsertEntry({ id: entry, attachRecordings: [bytes('a voice note')] });

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    templateKey: 'hrt_start'
  });
  await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  await journal.labs.upsertResult({
    epochDay: 20004,
    analyte: 'estradiol',
    value: 412.5,
    unit: 'pmol/L',
    drawTime: '07:40',
    provider: 'Diagnostyka'
  });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 79, unit: 'cm' });
  await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });
  await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 19180 });
  await journal.hairProgress.upsertStage({ epochDay: 19200, stage: '2a' });
  await journal.hairProgress.addPhoto(19200, { full: bytes('hairline'), thumb: bytes('ht') });
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
  await journal.tally.log({ epochDay: 20000, kind: 'misgendered', context: 'wrong pronoun at the pharmacy' });
  await journal.doubtJournal.addEntry({ epochDay: 20000, text: 'am I even trans enough for this' });
  await journal.doubtJournal.saveSnapshot(20000, [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }]);
  await journal.letters.addLetter({ epochDay: 20000, text: 'read this in a year', unlockEpochDay: 20365 });
  await journal.roadmap.setGoalChecked('pl', 'pl-legal-court-file', true);

  const episode = await journal.regimen.upsertEpisode({
    drug: 'estradiol valerate',
    ester: 'valerate',
    dose: 4,
    doseUnit: 'mg',
    route: 'im',
    interval: 'every 2 weeks',
    startEpochDay: 19000
  });
  await journal.doses.upsertDose({
    timestamp: 1_700_000_000_000,
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'ventrogluteal-left',
    vehicle: 'oil'
  });
  await journal.doses.upsertSchedule({ episodeId: episode, everyNDays: 14, dosesPerDay: 1 });
  await journal.doses.upsertPause({ episodeId: episode, startEpochDay: 19100, endEpochDay: null, reason: 'planned' });
  await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 5, unit: 'ampoules', recordedEpochDay: 20000 });

  const tryout = await journal.tryouts.upsertTryout({
    kind: 'name',
    label: 'Alex',
    startEpochDay: 19900,
    endEpochDay: null
  });
  await journal.tryouts.addFeltSenseEntry({ tryoutId: tryout, epochDay: 19910, mood: 4, note: 'felt right' });

  const checklist = await journal.checklists.createChecklist({ kind: 'procedure', id: 'proc-1' });
  const checklistItem = await journal.checklists.addItem(checklist.id, 'buy gauze');
  await journal.checklists.setItemChecked(checklistItem.id, true);

  return journal;
}

async function rebuildGolden(): Promise<void> {
  const snapshot = await (await everySection()).archive.snapshot();
  const packed = await collect(
    packArchive(
      {
        journal: snapshot.journal,
        preferences: portablePreferences({ ...PREFERENCE_DEFAULTS, name: 'Alicja' }),
        files: snapshot.files,
        readFile: snapshot.readFile
      },
      GOLDEN_PASSWORD,
      CHEAP_KDF
    )
  );
  writeFileSync(archivePath, packed);
  writeFileSync(journalPath, `${JSON.stringify(snapshot.journal, null, 2)}\n`);
}

if (process.env.GOLDEN_ARCHIVE === 'rebuild') {
  test('rebuilds the golden archive', async () => {
    await rebuildGolden();
  });
}

test('the golden archive restores section by section into an empty journal', async () => {
  const golden: ArchiveJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  const target = await emptyDevice();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });
  const restored = (await target.archive.snapshot()).journal;

  for (const section of SECTIONS) {
    assert.ok(golden[section].length > 0, `the golden archive carries no ${section}`);
    assert.deepEqual(restored[section], golden[section], `${section} did not survive the restore`);
  }
});

/* The keys and their order, not just the rows under them: a section renamed
   or moved changes what is in the file, and a per-section comparison cannot
   see either. The fixture's own key order is what today's code wrote, so
   this is the half of "nothing was reordered" the loop above misses. */
test('the golden archive names its sections in the order a snapshot writes them', async () => {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  assert.deepEqual(Object.keys(opened.payload.journal), [...SECTIONS]);

  const target = await emptyDevice();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });

  assert.deepEqual(Object.keys((await target.archive.snapshot()).journal), [...SECTIONS]);
});

/* Over a device that already has rows of its own, so a Replace that fails to
   clear a section shows up as the target's leftovers surviving. Restoring
   into an empty journal cannot see that: the section registry says what
   travels, but the list of tables Replace empties first is still written out
   by hand (restore.ts's discardJournalRows), and a table missed there keeps
   stale rows through the most destructive path in the app. */
test('replacing a populated journal leaves exactly the golden archive behind', async () => {
  const golden: ArchiveJournal = JSON.parse(readFileSync(journalPath, 'utf8'));
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  const target = await everySection();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });
  const restored = (await target.archive.snapshot()).journal;

  for (const section of SECTIONS) {
    assert.deepEqual(restored[section], golden[section], `${section} kept rows the replace should have discarded`);
  }
});

test('the golden archive carries the photo files its rows name', async () => {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);

  const target = await emptyDevice();
  await target.archive.replace({ journal: opened.payload.journal, files: opened.files });

  assert.deepEqual((await target.archive.snapshot()).files, opened.payload.files);
});

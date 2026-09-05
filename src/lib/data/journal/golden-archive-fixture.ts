/* What archive-golden.test.ts and archive-golden-merge.test.ts both build on:
   the fixture's paths, the password and cheap KDF it was packed with, a
   journal with something in every section, and the two ways to change what
   is committed (ADR-0027, ticket 12).

   `everySection()` lives here rather than in either test file because both
   need it - the golden test packs a fresh one when GOLDEN_ARCHIVE=rebuild
   runs, and the merge sweep builds a second, independent device out of it to
   merge the committed fixture into. */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { collect } from '../archive/container.ts';
import { openArchive, packArchive } from '../archive/pack.ts';
import { portablePreferences, type ArchiveJournal } from '../archive/payload.ts';
import { PREFERENCE_DEFAULTS } from '../prefs/catalogue.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import type { SqliteDriver } from '../sqlite/driver.ts';
import { BUILT_IN_PRESETS } from '../vocabulary/builtins.ts';
import { openJournal, type Journal } from './journal.ts';
import type { RestoreContents } from './restore.ts';
import { now } from './support.ts';

export const archivePath = fileURLToPath(new URL('./fixtures/golden-archive.ttbackup', import.meta.url));
export const journalPath = fileURLToPath(new URL('./fixtures/golden-journal.json', import.meta.url));
export const countsPath = fileURLToPath(new URL('./fixtures/golden-archive-counts.json', import.meta.url));

export const GOLDEN_PASSWORD = 'a golden horse, stapled';

/* The real parameters take about a second per derivation by design
   (ADR-0013) and would be paid on every run of a file that uses this
   fixture. They travel in the header, so the fixture packs with the cheap
   set pack.test.ts uses and the browser tier is where the real ones get
   exercised. */
export const CHEAP_KDF = { memorySize: 256, iterations: 1, parallelism: 1, hashLength: 32 };

export const bytes = (text: string): Uint8Array => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

export async function* oneShot(source: Uint8Array): AsyncGenerator<Uint8Array> {
  yield source;
}

export async function emptyDevice(): Promise<Journal> {
  const journal = openJournal(await migratedDb(), fakeFileStore());
  await journal.reconcileBuiltIns();
  return journal;
}

/** `everySection()` with none of the user content: the reference rows a boot
    puts there and nothing else. What emptying a journal has to leave behind,
    and therefore what a test of that can compare against - built-in rows
    survive a Replace by design (restore.ts), so "empty" cannot mean zero. */
export async function builtInsOnlyDevice(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await seedLegacyBuiltInPresets(driver);
  return { driver, journal };
}

/** Devices that reconciled before phase 5 ticket 35 kept eight built-in
    preset rows (reconcile.ts's own history says why it stopped: the picker
    they backed is gone and nothing reads them any more). A fresh journal
    never gets them - there is no public API left that makes a built-in
    preset row, `addPreset` only ever makes a custom one - so this seeds them
    the same way reconcile once did, directly. Without it, `everySection()`
    can only ever produce one preset row, and the fixture loses the built-in
    shape `readPresets`/`applyPresets` still have to carry for a device that
    reconciled before ticket 35. */
async function seedLegacyBuiltInPresets(driver: SqliteDriver): Promise<void> {
  const ts = now();
  for (const preset of BUILT_IN_PRESETS) {
    await driver.run('INSERT INTO gender_preset (key, name, is_built_in, updated_at) VALUES (?, ?, 1, ?)', [
      preset.key,
      '',
      ts
    ]);
    for (const [orderIndex, dimensionKey] of preset.dims.entries()) {
      await driver.run(
        `INSERT INTO preset_dimension (preset_id, dimension_id, order_index)
         SELECT gp.id, gd.id, ? FROM gender_preset gp, gender_dimension gd WHERE gp.key = ? AND gd.key = ?`,
        [orderIndex, preset.key, dimensionKey]
      );
    }
  }
}

/** A journal with something in all 36 sections, and the customizations that
    make the vocabulary ones more than the built-ins: a custom dimension in a
    custom preset, a custom group with a tag of its own, a custom tag inside a
    built-in group, a renamed and a hidden built-in tag, a hidden dimension, a
    hidden affirmation, a custom body region logged on the entry alongside a
    built-in one, a custom measurement type alongside a hidden built-in one,
    a disabled effect category, a custom effect type alongside a hidden
    built-in one, and an authored entry template carrying a custom tag, a
    custom dimension value, a note scaffold and a presentation. Built by
    `everySectionDevice` below, which is the same thing with the connection
    handed back too. */
export const everySection = async (): Promise<Journal> => (await everySectionDevice()).journal;

/** The same journal, with its connection alongside it, for the tests that
    have to speak to the driver directly: emptying the journal has to hold
    with `PRAGMA foreign_keys` off, and counting rows table by table sees what
    no section's read can (restore.test.ts). Neither is something the journal
    handle offers, and neither is a reason for the callers that only want the
    journal to unpack a pair. */
export async function everySectionDevice(): Promise<{ driver: SqliteDriver; journal: Journal }> {
  const driver = await migratedDb();
  const journal = openJournal(driver, fakeFileStore());
  await journal.reconcileBuiltIns();
  await seedLegacyBuiltInPresets(driver);

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
  await journal.affirmations.addLine('en', 'You get to take up space, today too.');
  await journal.affirmations.setHidden('affirmation_2', true);
  const bodyRegion = await journal.bodyRegions.addCustomRegion('scar tissue');
  await journal.bodyRegions.setRegionHidden('hairline', true);

  const femme = await journal.presentations.addPresentation('femme', 0);
  const androgynous = await journal.presentations.addPresentation('androgynous', 1);
  await journal.presentations.setPresentationHidden(androgynous.id, true);

  // An authored template (phase 6 ticket 07): the built-ins already travel
  // through reconcile, so what a round trip has to prove here is a
  // custom one - its own tags, a custom dimension value, a note scaffold
  // and a presentation, all at once.
  await journal.entryTemplates.addEntryTemplate({
    name: 'After a hard day',
    tags: [tag.id],
    dims: { [voice.key]: 3 },
    noteScaffold: 'What made today hard?',
    presentationId: femme.id
  });

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day, zażółć gęślą jaźń',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    // Three shapes on purpose, so the fixture pins all of them: distress
    // only, euphoria only, and both at once (ticket 31).
    bodyRegions: {
      chest: { dysphoria: 45, euphoria: null },
      [bodyRegion.id]: { dysphoria: 30, euphoria: 55 },
      voice_throat: { dysphoria: null, euphoria: 70 }
    },
    presentationId: femme.id
  });
  await journal.photos.attach({ entryId: entry }, { full: bytes('full photo'), thumb: bytes('thumb') });
  await journal.entries.upsertEntry({ id: entry, attachRecordings: [bytes('a voice note')] });
  await journal.entries.upsertEntry({ id: entry, attachVideos: [bytes('a video note')] });
  await journal.marginNotes.add({ entryId: entry, epochDay: 20050, text: 'reading this back, zażółć gęślą jaźń' });

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    description: 'the pharmacist barely looked up',
    templateKey: 'hrt_start'
  });
  await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });
  await journal.feltSense.add({ milestoneId: milestone }, { epochDay: 19365, mood: 5, note: 'a year on' });

  await journal.labs.upsertResult({
    epochDay: 20004,
    analyte: 'estradiol',
    value: 412.5,
    unit: 'pmol/L',
    drawTime: '07:40',
    provider: 'Diagnostyka'
  });
  await journal.measurements.upsertMeasurement({ type: 'waist', epochDay: 20000, value: 79, unit: 'cm' });
  const shoulders = await journal.measurements.addCustomMeasurementType('Shoulders');
  await journal.measurements.setMeasurementTypeHidden('underbust', true);
  await journal.measurements.upsertMeasurement({ type: shoulders.key, epochDay: 20000, value: 41, unit: 'cm' });
  await journal.sizeRecords.upsertRecord({ epochDay: 20000, category: 'pants', size: '32', brand: 'Levi\'s', fitNote: 'true to size' });
  await journal.taper.upsertTaper({
    surgeryEpochDay: 19950,
    startEpochDay: 19955,
    stages: [
      { everyNDays: 1, days: 14 },
      { everyNDays: 3, days: 30 }
    ]
  });
  await journal.taper.upsertSession({ epochDay: 19955, note: 'first one, went fine' });
  await journal.taper.upsertSession({ epochDay: 19956, note: '' });
  await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });
  await journal.journalingPauses.upsertPause({ startEpochDay: 19700, endEpochDay: null });
  await journal.savedQuestions.upsertSavedQuestion({
    name: 'Therapy check-ins',
    queryText: 'therapy',
    tagIds: [],
    moods: [],
    startEpochDay: null,
    endEpochDay: null,
    hasNote: true,
    hasPhoto: false
  });
  await journal.revisits.setRevisit({ entryId: entry, createdEpochDay: 20000, targetEpochDay: 20100 });

  /* Three eras, so both open bounds and a closed pair all travel. An absent
     bound is the case a round trip can lose silently by defaulting it to a
     day, and it has two sides: the era that reaches back before the journal
     and the one still running (phase 6 ticket 01). */
  const beforeIKnew = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });
  await journal.eras.upsertEra({ name: 'after I moved', startEpochDay: 19366, endEpochDay: null });
  // One mute, so the section is non-empty and a round trip has a row to
  // lose (phase 6 ticket 05).
  await journal.eraMutes.setEraMuted(beforeIKnew, true);
  // Two lines, so the fixture pins an order beyond "the only one" (phase 6
  // ticket 14).
  await journal.comfortItems.addItem('text a friend');
  await journal.comfortItems.addItem('walk by the river');
  /* Six rows covering the four shapes an area's state comes in (phase 8
     deepening ticket 13, phase 8 features ticket 51): hidden without a
     finish day, finished without being hidden, one hub row's two sections
     finished on the same day, and the same two-sections-in-one-gesture
     shape for a suspended row. An area with a row saying nothing is not
     among them because there is no such row - a state that says nothing
     keeps no row. */
  await journal.areaStates.setAreasHidden(['sizeRecords'], true);
  await journal.areaStates.setAreasFinished(['hairRemovalSessions'], 19250);
  await journal.areaStates.setAreasFinished(['hairStages', 'hairPhotos'], 19300);
  await journal.areaStates.setAreasSuspended(['voiceBenchmarks', 'voicePracticeTakes'], 19310);
  await journal.effectCategories.setCategoryEnabled('sensory', true);
  const customEffect = await journal.personalEffects.addCustomEffectType('a feeling only I have a word for', 'body_shape');
  await journal.personalEffects.setEffectTypeHidden('improved_smell_feminizing', true);
  await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 19180 });
  await journal.personalEffects.upsertMarker({ effect: customEffect.key, firstNoticedEpochDay: 19190 });
  // One staging per scale, including the escape hatch: the scale column is
  // what keeps two published classifications from being read as one series
  // (ticket 33), and a fixture with only one scale in it could not notice a
  // restore that lost it.
  await journal.hairProgress.upsertStage({ epochDay: 19200, scale: 'norwood_hamilton', stage: '2a' });
  await journal.hairProgress.upsertStage({ epochDay: 19230, scale: 'sinclair', stage: '2' });
  await journal.hairProgress.upsertStage({
    epochDay: 19260,
    scale: 'other',
    stage: '',
    description: 'thinner all over the top'
  });
  await journal.hairProgress.addPhoto(19200, { full: bytes('hairline'), thumb: bytes('ht') });
  const hairRemovalSession = await journal.hairRemoval.upsertSession({
    epochDay: 20000,
    area: 'upper_lip',
    method: 'laser',
    painRating: 2,
    cost: '250 PLN',
    provider: 'Klinika Laserowa'
  });
  await journal.hairRemoval.addPhoto(hairRemovalSession, { full: bytes('session'), thumb: bytes('st') });
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
  await journal.tally.log({ epochDay: 20000, kind: 'misgendered' });
  await journal.doubtJournal.saveSnapshot(20000, [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }]);
  await journal.letters.addLetter({ epochDay: 20000, text: 'read this in a year', unlockEpochDay: 20365 });
  await journal.voicePracticeTakes.addTake({ epochDay: 20000, minHz: 150, maxHz: 220, medianHz: 180, feltSense: 4 });
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', 'not-my-path');
  await journal.roadmap.addCustomGoal('social', 'Tell my sister');
  await journal.roadmap.setTrackDismissed('medical', true);

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
  await journal.doses.upsertDose({
    timestamp: 1_700_000_000_000,
    route: 'im',
    dose: 4,
    doseUnit: 'mg',
    injectionSite: 'ventrogluteal-left',
    vehicle: 'oil'
  });
  await journal.doses.upsertSchedule({ episodeId: episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null });
  await journal.doses.upsertPause({ episodeId: episode, startEpochDay: 19100, endEpochDay: null, reason: 'planned' });
  await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 5, unit: 'ampoules', recordedEpochDay: 20000 });

  const tryout = await journal.tryouts.upsertTryout({
    kind: 'style',
    label: 'layered look',
    description: 'cardigan over a fitted top',
    startEpochDay: 19900,
    endEpochDay: null
  });
  await journal.feltSense.add({ tryoutId: tryout }, { epochDay: 19910, mood: 4, note: 'felt right' });
  await journal.tryouts.addPhoto(tryout, 19905, { full: bytes('presenting'), thumb: bytes('pt') });

  /* A real procedure now owns this checklist (phase 5 ticket 07); it was a
     placeholder owner pair until ticket 07 shipped the first owner. */
  const procedure = await journal.procedures.upsertProcedure({
    name: 'top surgery',
    surgeryEpochDay: 20050,
    notes: 'drains out on day five'
  });
  await journal.procedures.addConsult(procedure, 19950);
  await journal.procedures.addPhoto(procedure, 20052, { full: bytes('recovery'), thumb: bytes('rt') });
  const checklistItem = await journal.procedures.addChecklistItem(procedure, 'buy gauze');
  await journal.checklists.setItemChecked(checklistItem.id, true);

  await journal.wearSessions.upsertSession({
    startTimestamp: 1_700_000_000_000,
    durationMs: 6 * 3600000,
    note: 'a bit tight by the end',
    reminderHoursAfterStart: 8,
    reminderTitle: 'binder check-in'
  });

  // Two takes' worth of audio and a full set of figures: a benchmark that
  // skipped its vowel would leave the nullable half of the row untested by
  // the round trip (phase 5 deepening ticket 15).
  await journal.voiceBenchmarks.saveBenchmark({
    epochDay: 20060,
    passageKey: 'builtin',
    passageAudio: bytes('passage'),
    vowelAudio: bytes('vowel'),
    f0MedianHz: 178.5,
    f0P10Hz: 164.2,
    f0P90Hz: 199.1,
    semitoneSd: 2.1,
    wordsPerMinute: 138.4,
    f1Hz: 705,
    f2Hz: 1265,
    snrDb: 26.3,
    note: 'quiet room, morning',
    // A short stored track (ticket 09), so the fixture proves the column
    // travels rather than only that it exists. Encoded as audio/track.ts
    // writes it, hole included.
    pitchTrack: '178.5,181.2,,176.9,180.4',
    /* And the chain it was recorded through (ticket 28), carrying a real
       one rather than a null for the same reason: a restored benchmark
       that lost its chain would rejoin a series it does not belong to, and
       a fixture with no chain in it could not notice. Written as
       audio/captureChain.ts encodes it. */
    captureChain: 'Pixel 10a | Bottom microphone | ec=off ns=off agc=off',
    // And the corner-vowel factor (ticket 30), carrying a real number for
    // the same reason the chain does: a fixture that only ever saw null
    // could not tell a lost column from an unmeasured one.
    resonanceScale: 0.97
  });

  // The import log's only writer is a real commit (ticket 03): run one
  // rather than hand-seeding the row, the same reason nothing else in this
  // function writes SQL directly.
  await journal.archive.commitDaylioImport(
    await journal.archive.previewDaylioImport(
      'full_date,time,mood,activities,note_title,note\n2026-01-01,08:00,good,,,a golden Daylio row\n',
      { tagLabels: () => [] }
    )
  );

  return { driver, journal };
}

/** Every section's row count, in the same shape golden-archive-counts.json
    commits. */
export function countsOf(journal: ArchiveJournal): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [section, rows] of Object.entries(journal)) counts[section] = rows.length;
  return counts;
}

function writeGoldenFixture(journal: ArchiveJournal, packed: Uint8Array): void {
  writeFileSync(archivePath, packed);
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  writeFileSync(countsPath, `${JSON.stringify(countsOf(journal), null, 2)}\n`);
}

/** Decrypts what is committed, runs `transform` over the journal it carries
    and repacks - without writing anything. What both `rebuildGolden` and
    `patchGoldenArchive` below build on, and what the always-on round-trip
    test in archive-golden.test.ts exercises with the identity transform to
    prove the mechanism itself still works, decrypt through repack, without
    touching a committed file. */
export async function repackGolden(
  transform: (journal: ArchiveJournal) => ArchiveJournal
): Promise<{ journal: ArchiveJournal; packed: Uint8Array }> {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);
  const files = new Map<string, Uint8Array>();
  for await (const file of opened.files) files.set(file.name, file.bytes);

  const journal = transform(opened.payload.journal);

  const packed = await collect(
    packArchive(
      {
        journal,
        preferences: opened.payload.preferences,
        files: opened.payload.files,
        readFile: async (name) => {
          const found = files.get(name);
          if (!found) throw new Error(`repackGolden: no bytes read for file the manifest names: ${name}`);
          return found;
        }
      },
      GOLDEN_PASSWORD,
      CHEAP_KDF
    )
  );
  return { journal, packed };
}

/** The supported way to make a small, deliberate change to the golden
    fixture: decrypt what is committed, transform its journal, repack, and
    regenerate the counts manifest alongside it. Unlike a full rebuild this
    cannot manufacture content a fresh journal can no longer produce on its
    own - the eight built-in presets, before `seedLegacyBuiltInPresets` above
    existed, were exactly that case - because it starts from what is already
    there rather than from nothing.

    `GOLDEN_ARCHIVE=patch npx vitest run src/lib/data/journal/archive-golden.test.ts`
    runs whatever transform is currently written into the gated test at the
    bottom of that file. Edit it in place for the change at hand, run it
    once, commit the three changed fixture files, then put the transform
    back to the identity function. */
export async function patchGoldenArchive(transform: (journal: ArchiveJournal) => ArchiveJournal): Promise<void> {
  const { journal, packed } = await repackGolden(transform);
  writeGoldenFixture(journal, packed);
}

/** A fresh `everySection()` journal, packed and written over the fixture
    wholesale. The routine reason to run it (`GOLDEN_ARCHIVE=rebuild npx
    vitest run src/lib/data/journal/archive-golden.test.ts`, per ADR-0027) is
    adding a built-in dimension, preset or tag: `everySection()` reconciles
    the current built-in vocabulary itself, so a new one shows up without
    anyone hand-writing its row. */
export async function rebuildGolden(): Promise<void> {
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
  writeGoldenFixture(snapshot.journal, packed);
}

/** What a merge needs from the committed fixture: its journal and its photo
    files as a stream, freshly decrypted each call so the same fixture can
    be merged more than once in one test. */
export async function goldenContents(): Promise<RestoreContents> {
  const opened = await openArchive(oneShot(new Uint8Array(readFileSync(archivePath))), GOLDEN_PASSWORD);
  return { journal: opened.payload.journal, files: opened.files };
}

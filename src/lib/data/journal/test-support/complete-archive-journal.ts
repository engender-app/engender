import type { SqliteDriver } from '../../sqlite/driver';
import type { Journal } from '../journal';
import { BUILT_IN_PRESETS } from '../../vocabulary/builtins';
import { now } from '../support';

export async function seedLegacyBuiltInPresets(driver: SqliteDriver): Promise<void> {
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


/** The golden journal's public seed, shared with real-platform recovery probes. */
export async function seedCompleteArchiveJournal(
  driver: SqliteDriver,
  journal: Journal,
  bytes: (text: string) => Uint8Array
): Promise<void> {
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
    // Three regions on purpose, so the fixture pins the range: one on the
    // dysphoria side, one on the euphoria side, one further out (ticket 39,
    // ADR-0081 - the {dysphoria, euphoria} pair ticket 31 gave this table
    // is retired).
    bodyRegions: {
      chest: 25,
      [bodyRegion.id]: 80,
      voice_throat: 65
    },
    presentationId: femme.id
  });
  // Overridden to a day well before the entry's own (ticket 47): the golden
  // fixture is what proves epoch_day_override actually round-trips through
  // pack/restore, not just that the column exists and always reads null.
  const entryPhotoId = await journal.photos.attach(
    { entryId: entry },
    { full: bytes('full photo'), thumb: bytes('thumb') }
  );
  await journal.photos.setEpochDayOverride(entryPhotoId, 19000);
  await journal.entries.upsertEntry({ id: entry, attachRecordings: [bytes('a voice note')] });
  await journal.entries.upsertEntry({ id: entry, attachVideos: [bytes('a video note')] });
  await journal.marginNotes.add({ entryId: entry, epochDay: 20050, text: 'reading this back, zażółć gęślą jaźń' });
  const trashedEntry = await journal.entries.upsertEntry({ epochDay: 20001, mood: 2 });
  await journal.revisits.setRevisit({ entryId: trashedEntry, createdEpochDay: 20001, targetEpochDay: 20101 });
  await journal.marginNotes.add({ entryId: trashedEntry, epochDay: 20051, text: 'A note on a trashed entry' });
  await journal.entries.deleteEntry(trashedEntry);
  // Mixed case, so the fixture pins that the write folds it (phase 8
  // features ticket 48).
  await journal.wordIgnore.setWordIgnored('Kraków', true);

  /* One document, dated years before this journal's own entries (phase 8
     features ticket 52): the fixture is where the archive's file manifest
     gets held to carrying a document's bytes as well as its row, and where
     an out-of-range day proves the section's own ORDER BY. */
  const document = await journal.documents.addDocument(
    { epochDay: 8766, title: 'Opinia psychiatryczna' },
    { full: bytes('a scanned page'), thumb: bytes('its thumbnail') }
  );

  const milestone = await journal.milestones.upsertMilestone({
    name: 'HRT start',
    epochDay: 19000,
    description: 'the pharmacist barely looked up',
    templateKey: 'hrt_start'
  });
  await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });
  await journal.feltSense.add({ milestoneId: milestone }, { epochDay: 19365, mood: 5, note: 'a year on' });

  // Filed under the milestone above (phase 8 features ticket 56), so the
  // fixture pins that the link travels and not just the two columns being
  // there to be null.
  await journal.documents.setDocumentTarget(document, { kind: 'milestone', id: milestone });

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
  // Its own procedure (audit item 7, schema v83): the taper names which
  // procedure it dilates for rather than carrying a surgery day of its
  // own, and the checklist's own procedure above is `chest_reconstruction`
  // - not dilation-eligible - so this is a second, minimal one.
  const dilationProcedure = await journal.procedures.upsertProcedure({
    name: 'vaginoplasty',
    surgeryEpochDay: 19950,
    kind: 'vaginoplasty'
  });
  await journal.taper.upsertTaper({
    procedureId: dilationProcedure,
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
    hasPhoto: false,
    starred: false
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
  await journal.doses.upsertSchedule({ episodeId: episode, recurrence: { kind: 'everyNDays', everyNDays: 14 }, dosesPerDay: 1, doseAmounts: null, autoLogFromEpochDay: null });
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
    notes: 'drains out on day five',
    // A compiled-in kind rather than 'custom' (the default), so the fixture
    // proves `kind` round-trips through the archive (ticket 17).
    kind: 'chest_reconstruction'
  });
  await journal.procedures.addConsult(procedure, 19950);
  /* One appointment on its own beside the consult above, so the section
     carries both cases it has to (ticket 57). */
  await journal.appointments.upsertAppointment({
    epochDay: 20030,
    procedureId: null,
    kind: 'endokrynolog',
    place: 'Poradnia, ul. Kopernika',
    note: 'ask about the dose'
  });
  await journal.procedures.addPhoto(procedure, 20052, { full: bytes('recovery'), thumb: bytes('rt') });
  const checklistItem = await journal.procedures.addChecklistItem(procedure, 'buy gauze');
  await journal.checklists.setItemChecked(checklistItem.id, true);

  /* Not a binder: `kind` is a column with a default (schema v71), so a
     fixture that only ever carried the default would round-trip green
     whether the writer bound the field or not. */
  const wearSession = await journal.wearSessions.upsertSession({
    kind: 'tucking',
    startTimestamp: 1_700_000_000_000,
    durationMs: 6 * 3600000,
    note: 'a bit tight by the end',
    reminderHoursAfterStart: 8,
    reminderTitle: 'binder check-in'
  });
  // Older journals can retain a reminder after its wear session ended.
  await journal.reminders.upsertReminder({
    title: 'binder check-in',
    type: 'other',
    time: '07:13',
    recurrence: null,
    interval: null,
    anchorEpochDay: null,
    epochDay: 19676,
    enabled: true,
    autoSource: `wear:${wearSession}`
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

}

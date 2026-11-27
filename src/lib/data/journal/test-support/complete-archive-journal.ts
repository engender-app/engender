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
  const tag = await journal.tags.addTag(group.key, 'endo', 'stethoscope');
  await journal.tags.addTag('emotions', 'wired');
  await journal.tags.renameTag('a-therapy', 'therapy session');
  await journal.tags.setTagHidden('a-work', true);
  await journal.tags.setGroupEnabled('activities', false);
  const bodyRegion = await journal.bodyRegions.addCustomRegion('scar tissue');
  await journal.bodyRegions.setRegionHidden('hairline', true);

  const femme = await journal.presentations.addPresentation('femme', 0);
  const androgynous = await journal.presentations.addPresentation('androgynous', 1);
  await journal.presentations.setPresentationHidden(androgynous.id, true);

  const entry = await journal.entries.upsertEntry({
    epochDay: 20000,
    timestamp: 1_700_000_000_000,
    mood: 4,
    note: 'a good day, zażółć gęślą jaźń',
    dims: { [voice.key]: 7, femininity: 60 },
    tags: [tag.id, 'e-happy'],
    // Three regions cover both sides of the shared scale and two intensities.
    bodyRegions: {
      chest: 25,
      [bodyRegion.id]: 80,
      voice_throat: 65
    },
    presentationId: femme.id
  });
  // Overridden to a day well before the entry's own: the golden
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
  await journal.marginNotes.add({ entryId: trashedEntry, epochDay: 20051, text: 'A note on a trashed entry' });
  await journal.entries.deleteEntry(trashedEntry);

  /* One document, dated years before this journal's own entries: the fixture is where the archive's file manifest
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
    templateKey: 'hrt_start',
    // Not celebrated, so the one field a celebrated milestone leaves out is
    // in the fixture.
    celebrate: false
  });
  await journal.photos.attach({ milestoneId: milestone }, { full: bytes('m'), thumb: bytes('mt') });

  // Filed under the milestone above, so the
  // fixture pins that the link travels and not just the two columns being
  // there to be null.
  await journal.documents.setDocumentTarget(document, { kind: 'milestone', id: milestone });

  await journal.labs.upsertResult({
    epochDay: 20004,
    analyte: 'estradiol',
    value: 412.5,
    unit: 'pmol/L',
    drawTime: '07:40',
    provider: 'Diagnostyka',
    // A refund with no amount, the one cost shape the others below lack (FA 30).
    cost: { amount: null, currency: null, refunded: true }
  });
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
  await journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000, resolvedEpochDay: 20030 });
  await journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 });

  /* Three eras, so both open bounds and a closed pair all travel. An absent
     bound is the case a round trip can lose silently by defaulting it to a
     day, and it has two sides: the era that reaches back before the journal
     and the one still running. */
  const beforeIKnew = await journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 });
  await journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 });
  await journal.eras.upsertEra({ name: 'after I moved', startEpochDay: 19366, endEpochDay: null });
  // One mute, so the section is non-empty and a round trip has a row to
  // lose.
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
  await journal.areaStates.setAreasFinished(['hairRemovalSessions'], 19250);
  await journal.areaStates.setAreasFinished(['personalEffects', 'sideEffects'], 19300);
  await journal.areaStates.setAreasSuspended(['voiceBenchmarks', 'voicePracticeTakes'], 19310);
  await journal.effectCategories.setCategoryEnabled('sensory', true);
  const customEffect = await journal.personalEffects.addCustomEffectType('a feeling only I have a word for', 'body_shape');
  await journal.personalEffects.setEffectTypeHidden('improved_smell_feminizing', true);
  await journal.personalEffects.upsertMarker({ effect: 'breast_development', firstNoticedEpochDay: 19180 });
  await journal.personalEffects.upsertMarker({ effect: customEffect.key, firstNoticedEpochDay: 19190 });
  await journal.progressPhotos.addPhoto(19200, 'hair', { full: bytes('hairline'), thumb: bytes('ht') });
  await journal.progressPhotos.addPhoto(19210, 'front', { full: bytes('posed'), thumb: bytes('pp') });
  await journal.progressPhotos.addPose('Flexing');
  const hairRemovalSession = await journal.hairRemoval.upsertSession({
    epochDay: 20000,
    area: 'upper_lip',
    method: 'laser',
    painRating: 2,
    minutes: 45,
    cost: { amount: 250, currency: 'PLN', refunded: true },
    provider: 'Klinika Laserowa',
    note: 'numbing cream helped'
  });
  // Unrated and untimed-pain, the shape FA 28 allows: no rating is stored.
  await journal.hairRemoval.upsertSession({
    epochDay: 20007,
    area: 'genital_surgical_site',
    method: 'electrolysis',
    minutes: 90,
    provider: ''
  });
  await journal.hairRemoval.addPhoto(hairRemovalSession, { full: bytes('session'), thumb: bytes('st') });
  await journal.reminders.upsertReminder({
    title: 'injection',
    time: '08:00',
    recurrence: 'EVERY_N_DAYS',
    interval: 7,
    anchorEpochDay: 20000,
    epochDay: null,
    enabled: true
  });
  await journal.reminders.upsertReminder({
    title: 'Estradiol',
    time: '09:00',
    recurrence: 'DAILY',
    interval: null,
    anchorEpochDay: null,
    epochDay: null,
    enabled: true,
    drug: 'Estradiol valerate'
  });
  await journal.letters.addLetter({ epochDay: 20000, text: 'read this in a year', unlockEpochDay: 20365 });
  await journal.voicePracticeTakes.addTake({ epochDay: 20000, minHz: 150, maxHz: 220, medianHz: 180, feltSense: 4 });
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'checked');
  await journal.roadmap.setGoalStatus('pl', 'pl-legal-appeal', 'not-my-path');
  await journal.roadmap.addCustomGoal('Tell my sister');
  const comingOut = await journal.roadmap.addCategory('Coming out');
  await journal.roadmap.addCustomGoal('Tell my manager', comingOut.id);
  const gym = await journal.roadmap.addInstitution('Gym');
  await journal.roadmap.addInstitutionChange({ institution: 'pl-legal-passport', status: 'submitted', epochDay: 20400, note: 'Voivode office' });
  await journal.roadmap.addInstitutionChange({ institution: gym.id, status: 'done', epochDay: 20401, note: null });

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
  await journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 5, unit: 'ampoules', recordedEpochDay: 20000, expiryEpochDay: 20400, pharmacyNote: 'Batch 7', cost: { amount: 49.99, currency: 'PLN', refunded: false } });

  const tryout = await journal.tryouts.upsertTryout({
    kind: 'style',
    label: 'layered look',
    description: 'cardigan over a fitted top',
    startEpochDay: 19900,
    endEpochDay: null
  });
  await journal.feltSense.add({ tryoutId: tryout }, { epochDay: 19910, mood: 4, note: 'felt right' });
  await journal.tryouts.addPhoto(tryout, 19905, { full: bytes('presenting'), thumb: bytes('pt') });

  /* A real procedure now owns this checklist; it was a
     placeholder owner pair until ticket 07 shipped the first owner. */
  const procedure = await journal.procedures.upsertProcedure({
    name: 'top surgery',
    surgeryEpochDay: 20050,
    notes: 'drains out on day five',
    // A compiled-in kind rather than 'custom' (the default), so the fixture
    // proves `kind` round-trips through the archive.
    kind: 'chest_reconstruction',
    cost: { amount: 9500, currency: 'EUR', refunded: false }
  });
  await journal.procedures.addConsult(procedure, 19950);
  /* One appointment on its own beside the consult above, so the section
     carries both cases it has to, with a time and a provider
 so the providers section is not empty and
     the link between the two is exercised. */
  const provider = await journal.appointments.upsertProvider({
    name: 'Dr Nowak',
    contact: '22 123 45 67',
    competence: 'good',
    impressions: 'Listened, no gatekeeping'
  });
  await journal.appointments.upsertAppointment({
    epochDay: 20030,
    time: '14:30',
    providerId: provider,
    procedureId: null,
    kind: 'endokrynolog',
    place: 'Poradnia, ul. Kopernika',
    note: 'ask about the dose',
    cost: { amount: 200, currency: 'PLN', refunded: false }
  });
  /* And one still waiting for its day, with a dated update, so
     the section carries a null day, a referred-on day and its statuses. */
  const waiting = await journal.appointments.upsertAppointment({
    epochDay: null,
    referredEpochDay: 19800,
    procedureId: null,
    kind: 'Gender clinic',
    place: 'Charing Cross',
    note: 'GP letter sent'
  });
  await journal.appointments.addStatusUpdate({ appointmentId: waiting, epochDay: 19900, status: 'Letter came' });
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
  // the round trip.
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
    // A short stored track, so the fixture proves the column
    // travels rather than only that it exists. Encoded as audio/track.ts
    // writes it, hole included.
    pitchTrack: '178.5,181.2,,176.9,180.4',
    /* And the chain it was recorded through, carrying a real
       one rather than a null for the same reason: a restored benchmark
       that lost its chain would rejoin a series it does not belong to, and
       a fixture with no chain in it could not notice. Written as
       audio/captureChain.ts encodes it. */
    captureChain: 'Pixel 10a | Bottom microphone | ec=off ns=off agc=off',
    // And the corner-vowel factor, carrying a real number for
    // the same reason the chain does: a fixture that only ever saw null
    // could not tell a lost column from an unmeasured one.
    resonanceScale: 0.97
  });

  // The import log's only writer is a real commit: run one
  // rather than hand-seeding the row, the same reason nothing else in this
  // function writes SQL directly.
  await journal.archive.commitDaylioImport(
    await journal.archive.previewDaylioImport(
      'full_date,time,mood,activities,note_title,note\n2026-01-01,08:00,good,,,a golden Daylio row\n',
      { tagLabels: () => [] }
    )
  );

}

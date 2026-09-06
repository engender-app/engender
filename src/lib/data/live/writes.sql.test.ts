/* The sweep: every classified write driven against real SQL through the
   recording driver (ticket 01), checked against the coarse-name-to-table
   declaration (sqlTables.ts, ticket 02) rather than trusting the comments
   next to TABLE_NAMES that used to be the only account of it.

   Two checks, not one, because a coarse name commonly covers several real
   tables that no single operation touches at once - 'dose' covers a dose
   event, a schedule and a pause, and upsertDose's own SQL only ever reaches
   dose_event. Treating "the announcement's tables" and "what this one
   statement touched" as sets that must be equal would fail every multi-table
   coarse name on sight, which is not the bug this ticket is about.

   1. Per operation, what its SQL touched must be a *subset* of its declared
      tables, mapped through SQL_TABLES. This is the safety-critical
      direction ticket 01's own header names: a write reaching a table
      nobody declared is exactly the class of bug that shows up as a Svelte
      screen quietly holding stale data.
   2. Per coarse name, the union - across every operation that declares it -
      of what its SQL actually touched, intersected with that name's
      declared tables, must equal the declared tables exactly. A table
      SQL_TABLES lists that no operation declaring that name ever writes
      fails here, which is the other direction: a mapping entry nothing
      backs is a claim about the schema this suite cannot verify any other
      way.

   Together they reproduce both halves of the ticket's own acceptance
   criterion: removing a table from a declaration a write's SQL genuinely
   reaches fails check 1, and adding one nothing writes fails check 2 - both
   demonstrated directly, at the bottom, against a small fixture rather than
   by mutating the real declaration.

   What check 2 still cannot catch: an operation that spuriously declares a
   coarse name it never touches, where some *other* legitimate operation
   also declares that name and genuinely writes it. The union only asks
   whether every declared table is hit by *someone* - it never asks whether
   *this* operation was the one that needed to declare it. `archive.replace`
   and `discardEverything` are the extreme case of the same gap: driven for
   real, their SQL wipes nearly every content table, so either one alone
   would "satisfy" check 2 for almost any coarse name regardless of whether
   its own mapping is right. WIPES_THE_JOURNAL excludes both from check 2's
   owners for exactly that reason - a proof that touches everything proves
   nothing about one thing - while they still count fully for check 1 and
   for write coverage. Closing that broader gap would mean equality per
   operation, which is exactly the check this file
   deliberately does not make, for the coarse-name reason above. It is a
   real, narrower blind spot than "exactly", left open on purpose rather
   than left unmentioned.

   Reads get the read half's own rule: every classified read this sweep can
   invoke is driven the same way and must touch nothing. Reads sit under
   READ_OPT_OUTS the same way writes do, and a coverage check below holds
   the read half to the same standard the write half's coverage check does.

   Not every classified write is driven. `reconcile.ts`'s own comment says
   reconciling "usually finds nothing to do, and announcing these tables for
   a no-op is cheaper than asking it to report what it actually changed" -
   so reconcileBuiltIns is driven on a database nothing has reconciled yet,
   the one state where its SQL does touch everything it declares, rather
   than opted out. `archive.replace`, `archive.merge`, `discardEverything`
   and three of the six `commit*Import` operations (Daylio CSV, Track &
   Graph, Pixels) are driven the same way `writes.test.ts` already drives
   them - an in-memory snapshot, or an inline CSV/JSON payload, no external
   file required - even though their own declaration is the same "every
   table, by design" ceiling `archive`'s own comment states ("a Replace
   touches everything by definition"). Declaring a ceiling is not a reason
   to skip driving an operation that costs nothing to drive; it only matters
   for what check 1 can prove about it, and check 1's subset test is
   automatically satisfied by a maximal declaration regardless - the value
   in driving these for real is what they contribute to check 2's per-table
   union, `commitDaylioImport` being the cheapest real writer of
   'importLog' among them. Only the three formats that parse an actual
   archive container - a `.daylio` backup zip, a `.ttbackup` zip, a Day One
   export zip - are named in WRITE_OPT_OUTS, because this sweep has no
   fixture for one. */

import assert from 'node:assert/strict';
import { beforeAll, describe, test } from 'vitest';
import { recordingDriver, type RecordingDriver } from '../sqlite/test-support/recording-driver.ts';
import { migratedDb } from '../sqlite/test-support/migrated-db.ts';
import { fakeFileStore } from '../photos/test-support/fake-file-store.ts';
import { openJournal, type Journal } from '../journal/journal.ts';
import { JOURNAL_WIDE, tablesReadBy, tablesWrittenBy, TABLE_NAMES, type TableName } from './writes.ts';
import { RECONCILE_TABLES } from '../journal/reconcile.ts';
import { SQL_TABLES } from './sqlTables.ts';

const bytes = (text: string): Uint8Array => new Uint8Array([...text].map((c) => c.charCodeAt(0)));
const photo = (seed: string) => ({ full: bytes(`full ${seed}`), thumb: bytes(`thumb ${seed}`) });

/** Every write this sweep does not drive, with the reason - see the header.
    Keyed `area.operation`. Only the three import formats that parse a real
    archive container (a `.daylio` backup, a `.ttbackup` zip, a Day One
    export zip) are here: `archive.replace`, `archive.merge`,
    `commitDaylioImport`, `commitTrackAndGraphImport`, `commitPixelsImport`
    and `discardEverything` all declare every table by design too, but
    `writes.test.ts` already drives every one of those with nothing more
    than an in-memory snapshot or an inline CSV/JSON payload, so this file
    does the same below rather than opting out of what is genuinely
    drivable. */
const WRITE_OPT_OUTS: Record<string, string> = {
  'archive.commitDaylioBackupImport': 'parses a real .daylio backup zip, which this sweep has no fixture for',
  'archive.commitTransTracksImport': 'parses a real .ttbackup zip, which this sweep has no fixture for',
  'archive.commitDayOneImport': 'parses a real Day One export zip, which this sweep has no fixture for'
};

/** The read half's own opt-outs, same reason and same shape: the three
    preview reads for the archive containers WRITE_OPT_OUTS names above. */
const READ_OPT_OUTS: Record<string, string> = {
  'archive.previewDaylioBackupImport': 'parses a real .daylio backup zip, which this sweep has no fixture for',
  'archive.previewTransTracksImport': 'parses a real .ttbackup zip, which this sweep has no fixture for',
  'archive.previewDayOneImport': 'parses a real Day One export zip, which this sweep has no fixture for'
};

/** The two driven operations whose SQL wipes the journal for real - see
    the per-coarse-name union check below for why they're excluded there. */
const WIPES_THE_JOURNAL = new Set(['archive.replace', 'discardEverything']);

interface Driven {
  key: string;
  coarse: readonly TableName[];
  wrote: readonly string[];
}

/** Every operation this file actually calls, keyed the same way
    WRITE_OPT_OUTS is - built once in `beforeAll` and read by every check
    below, so the expensive scenario runs only once. */
let driven: Driven[];
let readWrote: { key: string; wrote: readonly string[] }[];
let journal: Journal;
let recording: RecordingDriver;
/** Every classified write's key, mapped to the coarse names it declares -
    built once from a throwaway journal so the coverage check and the
    per-coarse-name union check both work from the same account of what
    `writes.ts` actually classifies, not from what this file remembered to
    drive. */
let declaredBy: Map<string, readonly TableName[]>;
/** Every classified read's key, built the same way `declaredBy` is, so the
    read half's coverage check works from what `writes.ts` actually
    classifies too. */
let declaredReadsBy: Set<string>;

async function drive<T>(area: string, operation: string, run: () => Promise<T>): Promise<T> {
  const { result, recording: rec } = await recording.record(run);
  driven.push({ key: `${area}.${operation}`, coarse: tablesWrittenBy(area, operation), wrote: rec.wrote });
  return result;
}

async function driveWide<T>(
  operation: (typeof JOURNAL_WIDE)[number],
  tables: TableName[],
  run: () => Promise<T>
): Promise<T> {
  const { result, recording: rec } = await recording.record(run);
  driven.push({ key: operation, coarse: tables, wrote: rec.wrote });
  return result;
}

async function driveRead<T>(area: string, operation: string, run: () => Promise<T>): Promise<T> {
  const { result, recording: rec } = await recording.record(run);
  readWrote.push({ key: `${area}.${operation}`, wrote: rec.wrote });
  return result;
}

beforeAll(async () => {
  driven = [];
  readWrote = [];
  declaredBy = new Map();
  declaredReadsBy = new Set();
  const { journal: throwaway } = await (await import('../journal/test-support.ts')).journalWithBuiltIns();
  for (const operation of JOURNAL_WIDE) {
    declaredBy.set(operation, operation === 'reconcileBuiltIns' ? RECONCILE_TABLES : [...TABLE_NAMES]);
  }
  for (const [areaName, area] of Object.entries(throwaway)) {
    if (typeof area === 'function') continue;
    for (const operation of Object.keys(area as Record<string, unknown>)) {
      try {
        declaredBy.set(`${areaName}.${operation}`, tablesWrittenBy(areaName, operation));
      } catch {
        tablesReadBy(areaName, operation); // throws its own message if this is neither
        declaredReadsBy.add(`${areaName}.${operation}`);
      }
    }
  }

  recording = recordingDriver(await migratedDb());
  journal = openJournal(recording.driver, fakeFileStore());

  // reconcileBuiltIns, on the one database where its SQL touches everything
  // it declares: nothing has been reconciled yet, so every built-in key is
  // genuinely missing (see the header).
  await driveWide('reconcileBuiltIns', RECONCILE_TABLES, () => journal.reconcileBuiltIns());

  // --- tags -----------------------------------------------------------
  const group = await drive('tags', 'addGroup', () => journal.tags.addGroup('Appointments')) as {
    key: string;
  };
  await drive('tags', 'setGroupEnabled', () => journal.tags.setGroupEnabled(group.key, false));
  const tag = (await drive('tags', 'addTag', () => journal.tags.addTag(group.key, 'endo'))) as {
    id: string;
  };
  const tag2 = (await drive('tags', 'addTag', () => journal.tags.addTag(group.key, 'wired'))) as {
    id: string;
  };
  const tag3 = (await drive('tags', 'addTag', () => journal.tags.addTag(group.key, 'to be removed'))) as {
    id: string;
  };
  await drive('tags', 'renameTag', () => journal.tags.renameTag(tag.id, 'endocrinology'));
  await drive('tags', 'setTagHidden', () => journal.tags.setTagHidden(tag.id, true));
  await drive('tags', 'reorder', () => journal.tags.reorder(group.key, [tag2.id, tag.id, tag3.id]));

  // --- presentations ----------------------------------------------------
  const femme = (await drive('presentations', 'addPresentation', () =>
    journal.presentations.addPresentation('femme', 0)
  )) as { id: string };
  await drive('presentations', 'renamePresentation', () =>
    journal.presentations.renamePresentation(femme.id, 'femme presenting')
  );
  await drive('presentations', 'setPresentationColour', () =>
    journal.presentations.setPresentationColour(femme.id, 1)
  );
  await drive('presentations', 'setPresentationHidden', () =>
    journal.presentations.setPresentationHidden(femme.id, true)
  );

  // --- affirmations -------------------------------------------------------
  const line = (await drive('affirmations', 'addLine', () =>
    journal.affirmations.addLine('en', 'You get to take up space, today too.')
  )) as { id: string };
  await drive('affirmations', 'editLine', () => journal.affirmations.editLine(line.id, 'You get to take up space.'));
  await drive('affirmations', 'setHidden', () => journal.affirmations.setHidden(line.id, true));
  await drive('affirmations', 'deleteLine', () => journal.affirmations.deleteLine(line.id));

  // --- bodyRegions --------------------------------------------------------
  const region = (await drive('bodyRegions', 'addCustomRegion', () =>
    journal.bodyRegions.addCustomRegion('scar tissue')
  )) as { id: string };
  await drive('bodyRegions', 'setRegionHidden', () => journal.bodyRegions.setRegionHidden('hairline', true));

  // --- dimensions ---------------------------------------------------------
  const voice = (await drive('dimensions', 'addCustomDimension', () =>
    journal.dimensions.addCustomDimension({ name: 'Voice comfort', low: 'off', high: 'mine', min: 0, max: 10 })
  )) as { key: string };
  await drive('dimensions', 'addPreset', () =>
    journal.dimensions.addPreset({ name: 'Mine', dims: [voice.key, 'femininity'] })
  );
  await drive('dimensions', 'setDimensionHidden', () => journal.dimensions.setDimensionHidden('masculinity', true));

  // --- entries --------------------------------------------------------
  // One call touching every table 'entry' covers at once: dims, tags,
  // body regions (all three shapes), a note (so entry_fts's insert has
  // real text), an attached photo, recording and video note - which is
  // also what makes photo/voiceRecording/videoNote's announcement real.
  const entryId = (await drive('entries', 'upsertEntry', () =>
    journal.entries.upsertEntry({
      epochDay: 20000,
      timestamp: 1_700_000_000_000,
      mood: 4,
      note: 'a good day',
      dims: { [voice.key]: 7, femininity: 60 },
      tags: [tag2.id, tag3.id, 'e-happy'],
      bodyRegions: {
        chest: { dysphoria: 45, euphoria: null },
        [region.id]: { dysphoria: 30, euphoria: 55 },
        voice_throat: { dysphoria: null, euphoria: 70 }
      },
      presentationId: femme.id,
      attachPhotos: [photo('entry')],
      attachRecordings: [bytes('a voice note')],
      attachVideos: [bytes('a video note')]
    })
  )) as number;
  // Unlinks tag3 from the entry above too - what makes deleteTag's own
  // 'entry' announcement (entry_tag) real rather than a no-op on an unused
  // tag.
  await drive('tags', 'deleteTag', () => journal.tags.deleteTag(tag3.id));
  await drive('entries', 'setEntryStarred', () => journal.entries.setEntryStarred(entryId, true));
  const secondEntryId = (await drive('entries', 'upsertEntry', () =>
    journal.entries.upsertEntry({ epochDay: 20001, mood: 3, note: 'a second entry' })
  )) as number;
  await drive('entries', 'deleteEntry', () => journal.entries.deleteEntry(secondEntryId));
  await drive('entries', 'restoreEntry', () => journal.entries.restoreEntry(secondEntryId));

  // --- entryTemplates -------------------------------------------------
  const template = (await drive('entryTemplates', 'addEntryTemplate', () =>
    journal.entryTemplates.addEntryTemplate({
      name: 'After a hard day',
      tags: [tag2.id],
      dims: { [voice.key]: 3 },
      noteScaffold: 'What made today hard?',
      presentationId: femme.id
    })
  )) as { id: string };
  await drive('entryTemplates', 'updateEntryTemplate', () =>
    journal.entryTemplates.updateEntryTemplate(template.id, {
      name: 'After a hard day, revised',
      tags: [tag2.id],
      dims: { [voice.key]: 4 },
      noteScaffold: 'What made today hard, really?',
      presentationId: femme.id
    })
  );
  await drive('entryTemplates', 'setEntryTemplateHidden', () =>
    journal.entryTemplates.setEntryTemplateHidden(template.id, true)
  );

  // --- milestones -------------------------------------------------------
  const milestoneId = (await drive('milestones', 'upsertMilestone', () =>
    journal.milestones.upsertMilestone({
      name: 'HRT start',
      epochDay: 19000,
      description: 'the pharmacist barely looked up',
      photo: { action: 'replace', photo: photo('milestone') }
    })
  )) as string;
  const secondMilestoneId = (await drive('milestones', 'upsertMilestone', () =>
    journal.milestones.upsertMilestone({ name: 'a second milestone', epochDay: 19001 })
  )) as string;

  // --- photos -------------------------------------------------------------
  const looseMilestonePhoto = (await drive('photos', 'attach', () =>
    journal.photos.attach({ milestoneId: secondMilestoneId }, photo('loose'))
  )) as string;
  await drive('photos', 'setStarred', () => journal.photos.setStarred(looseMilestonePhoto, true));
  await drive('photos', 'setEpochDayOverride', () => journal.photos.setEpochDayOverride(looseMilestonePhoto, 19000));
  await drive('photos', 'remove', () => journal.photos.remove(looseMilestonePhoto));
  await drive('milestones', 'deleteMilestone', () => journal.milestones.deleteMilestone(secondMilestoneId));

  // --- voiceBenchmarks --------------------------------------------------
  const benchmarkId = (await drive('voiceBenchmarks', 'saveBenchmark', () =>
    journal.voiceBenchmarks.saveBenchmark({
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
      note: 'quiet room',
      pitchTrack: '178.5,181.2',
      captureChain: 'Pixel 10a | Bottom microphone | ec=off ns=off agc=off',
      resonanceScale: 0.97
    })
  )) as string;
  const secondBenchmarkId = (await drive('voiceBenchmarks', 'saveBenchmark', () =>
    journal.voiceBenchmarks.saveBenchmark({
      epochDay: 20061,
      passageKey: 'builtin',
      passageAudio: bytes('passage 2'),
      vowelAudio: bytes('vowel 2'),
      f0MedianHz: 180,
      f0P10Hz: 165,
      f0P90Hz: 200,
      semitoneSd: 2,
      wordsPerMinute: 140,
      f1Hz: 700,
      f2Hz: 1260,
      snrDb: 25,
      note: '',
      pitchTrack: null,
      captureChain: null,
      resonanceScale: null
    })
  )) as string;
  await drive('voiceBenchmarks', 'deleteBenchmark', () => journal.voiceBenchmarks.deleteBenchmark(secondBenchmarkId));

  // --- voicePracticeTakes -----------------------------------------------
  const takeId = (await drive('voicePracticeTakes', 'addTake', () =>
    journal.voicePracticeTakes.addTake({ epochDay: 20000, minHz: 150, maxHz: 220, medianHz: 180, feltSense: 4 })
  )) as string;
  const secondTakeId = (await drive('voicePracticeTakes', 'addTake', () =>
    journal.voicePracticeTakes.addTake({ epochDay: 20001, minHz: 152, maxHz: 218, medianHz: 178, feltSense: 3 })
  )) as string;
  await drive('voicePracticeTakes', 'deleteTake', () => journal.voicePracticeTakes.deleteTake(secondTakeId));

  // --- labs ---------------------------------------------------------------
  const labId = (await drive('labs', 'upsertResult', () =>
    journal.labs.upsertResult({
      epochDay: 20004,
      analyte: 'estradiol',
      value: 412.5,
      unit: 'pmol/L',
      drawTime: '07:40',
      provider: 'Diagnostyka'
    })
  )) as string;
  const secondLabId = (await drive('labs', 'upsertResult', () =>
    journal.labs.upsertResult({ epochDay: 20005, analyte: 'testosterone', value: 1.2, unit: 'nmol/L' })
  )) as string;
  await drive('labs', 'deleteResult', () => journal.labs.deleteResult(secondLabId));

  // --- measurements -------------------------------------------------------
  const shoulders = (await drive('measurements', 'addCustomMeasurementType', () =>
    journal.measurements.addCustomMeasurementType('Shoulders')
  )) as { key: string };
  await drive('measurements', 'setMeasurementTypeHidden', () =>
    journal.measurements.setMeasurementTypeHidden('underbust', true)
  );
  const measurementId = (await drive('measurements', 'upsertMeasurement', () =>
    journal.measurements.upsertMeasurement({ type: shoulders.key, epochDay: 20000, value: 41, unit: 'cm' })
  )) as string;
  const secondMeasurementId = (await drive('measurements', 'upsertMeasurement', () =>
    journal.measurements.upsertMeasurement({ type: shoulders.key, epochDay: 20001, value: 42, unit: 'cm' })
  )) as string;
  await drive('measurements', 'deleteMeasurement', () => journal.measurements.deleteMeasurement(secondMeasurementId));

  // --- sizeRecords ----------------------------------------------------
  const sizeRecordId = (await drive('sizeRecords', 'upsertRecord', () =>
    journal.sizeRecords.upsertRecord({ epochDay: 20000, category: 'pants', size: '32', brand: "Levi's", fitNote: '' })
  )) as string;
  const secondSizeRecordId = (await drive('sizeRecords', 'upsertRecord', () =>
    journal.sizeRecords.upsertRecord({ epochDay: 20001, category: 'shirts', size: 'M', brand: '', fitNote: '' })
  )) as string;
  await drive('sizeRecords', 'deleteRecord', () => journal.sizeRecords.deleteRecord(secondSizeRecordId));

  // --- taper --------------------------------------------------------------
  await drive('taper', 'upsertTaper', () =>
    journal.taper.upsertTaper({
      surgeryEpochDay: 19950,
      startEpochDay: 19955,
      stages: [
        { everyNDays: 1, days: 14 },
        { everyNDays: 3, days: 30 }
      ]
    })
  );
  const taperSessionId = (await drive('taper', 'upsertSession', () =>
    journal.taper.upsertSession({ epochDay: 19955, note: 'first one, went fine' })
  )) as string;
  const secondTaperSessionId = (await drive('taper', 'upsertSession', () =>
    journal.taper.upsertSession({ epochDay: 19956, note: '' })
  )) as string;
  await drive('taper', 'deleteSession', () => journal.taper.deleteSession(secondTaperSessionId));

  // --- reminders ------------------------------------------------------
  const reminderId = (await drive('reminders', 'upsertReminder', () =>
    journal.reminders.upsertReminder({
      title: 'injection',
      type: 'injection',
      time: '08:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 7,
      anchorEpochDay: 20000,
      epochDay: null,
      enabled: true
    })
  )) as string;
  await drive('reminders', 'setEnabled', () => journal.reminders.setEnabled(reminderId, false));
  const secondReminderId = (await drive('reminders', 'upsertReminder', () =>
    journal.reminders.upsertReminder({
      title: 'a second reminder',
      type: 'injection',
      time: '09:00',
      recurrence: 'EVERY_N_DAYS',
      interval: 7,
      anchorEpochDay: 20000,
      epochDay: null,
      enabled: true
    })
  )) as string;
  await drive('reminders', 'deleteReminder', () => journal.reminders.deleteReminder(secondReminderId));

  // --- tally --------------------------------------------------------------
  const tallyId = (await drive('tally', 'log', () =>
    journal.tally.log({ epochDay: 20000, kind: 'misgendered' })
  )) as string;
  const secondTallyId = (await drive('tally', 'log', () =>
    journal.tally.log({ epochDay: 20001, kind: 'correctly_gendered' })
  )) as string;
  await drive('tally', 'deleteEvent', () => journal.tally.deleteEvent(secondTallyId));

  // --- regimen / doses ----------------------------------------------------
  const episodeId = (await drive('regimen', 'upsertEpisode', () =>
    journal.regimen.upsertEpisode({
      drug: 'estradiol valerate',
      ester: 'valerate',
      dose: 4,
      doseUnit: 'mg',
      route: 'im',
      interval: 'every 2 weeks',
      startEpochDay: 19000,
      endEpochDay: null,
      endReason: null
    })
  )) as string;
  const secondEpisodeId = (await drive('regimen', 'upsertEpisode', () =>
    journal.regimen.upsertEpisode({
      drug: 'progesterone',
      ester: null,
      dose: 100,
      doseUnit: 'mg',
      route: 'oral',
      interval: 'daily',
      startEpochDay: 19100,
      endEpochDay: null,
      endReason: null
    })
  )) as string;
  await drive('regimen', 'endEpisode', () => journal.regimen.endEpisode(secondEpisodeId, 19400));

  const doseId = (await drive('doses', 'upsertDose', () =>
    journal.doses.upsertDose({
      timestamp: 1_700_000_000_000,
      route: 'im',
      dose: 4,
      doseUnit: 'mg',
      injectionSite: 'ventrogluteal-left',
      vehicle: 'oil'
    })
  )) as string;
  await drive('doses', 'upsertSchedule', () =>
    journal.doses.upsertSchedule({
      episodeId,
      recurrence: { kind: 'everyNDays', everyNDays: 14 },
      dosesPerDay: 1,
      doseAmounts: [{ dose: 4, doseUnit: 'mg' }]
    })
  );
  const dosePauseId = (await drive('doses', 'upsertPause', () =>
    journal.doses.upsertPause({ episodeId, startEpochDay: 19100, endEpochDay: null, reason: 'planned' })
  )) as string;
  await drive('doses', 'deletePause', () => journal.doses.deletePause(dosePauseId));
  const secondDoseId = (await drive('doses', 'upsertDose', () =>
    journal.doses.upsertDose({ timestamp: 1_700_100_000_000, route: 'oral', dose: 100, doseUnit: 'mg' })
  )) as string;
  await drive('doses', 'deleteDose', () => journal.doses.deleteDose(secondDoseId));

  // --- stock --------------------------------------------------------------
  const stockId = (await drive('stock', 'upsertEntry', () =>
    journal.stock.upsertEntry({ drug: 'estradiol valerate', quantity: 5, unit: 'ampoules', recordedEpochDay: 20000 })
  )) as string;
  await drive('stock', 'reconcileRunOutReminders', () => journal.stock.reconcileRunOutReminders(20000));
  const secondStockId = (await drive('stock', 'upsertEntry', () =>
    journal.stock.upsertEntry({ drug: 'progesterone', quantity: 40, unit: 'tablets', recordedEpochDay: 20000 })
  )) as string;
  await drive('stock', 'deleteEntry', () => journal.stock.deleteEntry(secondStockId));

  // --- sideEffects --------------------------------------------------------
  const sideEffectId = (await drive('sideEffects', 'upsertSideEffect', () =>
    journal.sideEffects.upsertSideEffect({ name: 'hot flashes', severity: 3, epochDay: 20000 })
  )) as string;
  const secondSideEffectId = (await drive('sideEffects', 'upsertSideEffect', () =>
    journal.sideEffects.upsertSideEffect({ name: 'nausea', severity: 2, epochDay: 20001 })
  )) as string;
  await drive('sideEffects', 'deleteSideEffect', () => journal.sideEffects.deleteSideEffect(secondSideEffectId));

  // --- personalEffects --------------------------------------------------
  await drive('effectCategories', 'setCategoryEnabled', () =>
    journal.effectCategories.setCategoryEnabled('genital_sexual', true)
  );
  const customEffect = (await drive('personalEffects', 'addCustomEffectType', () =>
    journal.personalEffects.addCustomEffectType('a feeling only I have a word for', 'body_shape')
  )) as { key: string };
  await drive('personalEffects', 'setEffectTypeHidden', () =>
    journal.personalEffects.setEffectTypeHidden('improved_smell_feminizing', true)
  );
  await drive('personalEffects', 'upsertMarker', () =>
    journal.personalEffects.upsertMarker({ effect: customEffect.key, firstNoticedEpochDay: 19190 })
  );
  await drive('personalEffects', 'clearMarker', () => journal.personalEffects.clearMarker(customEffect.key));

  // --- cycleEvents ------------------------------------------------------
  const cycleEventId = (await drive('cycleEvents', 'upsertCycleEvent', () =>
    journal.cycleEvents.upsertCycleEvent({ kind: 'spotting', epochDay: 20000 })
  )) as string;
  const secondCycleEventId = (await drive('cycleEvents', 'upsertCycleEvent', () =>
    journal.cycleEvents.upsertCycleEvent({ kind: 'nothing_this_month', epochDay: 20001 })
  )) as string;
  await drive('cycleEvents', 'deleteCycleEvent', () => journal.cycleEvents.deleteCycleEvent(secondCycleEventId));

  // --- journalingPauses ---------------------------------------------------
  const journalingPauseId = (await drive('journalingPauses', 'upsertPause', () =>
    journal.journalingPauses.upsertPause({ startEpochDay: 19700, endEpochDay: null })
  )) as string;
  const secondJournalingPauseId = (await drive('journalingPauses', 'upsertPause', () =>
    journal.journalingPauses.upsertPause({ startEpochDay: 19600, endEpochDay: 19610 })
  )) as string;
  await drive('journalingPauses', 'deletePause', () =>
    journal.journalingPauses.deletePause(secondJournalingPauseId)
  );

  // --- savedQuestions -----------------------------------------------------
  const savedQuestionId = (await drive('savedQuestions', 'upsertSavedQuestion', () =>
    journal.savedQuestions.upsertSavedQuestion({
      name: 'Therapy check-ins',
      queryText: 'therapy',
      tagIds: [],
      moods: [],
      startEpochDay: null,
      endEpochDay: null,
      hasNote: true,
      hasPhoto: false
    })
  )) as string;
  const secondSavedQuestionId = (await drive('savedQuestions', 'upsertSavedQuestion', () =>
    journal.savedQuestions.upsertSavedQuestion({
      name: 'A second saved question',
      queryText: 'gauze',
      tagIds: [],
      moods: [],
      startEpochDay: null,
      endEpochDay: null,
      hasNote: false,
      hasPhoto: false
    })
  )) as string;
  await drive('savedQuestions', 'deleteSavedQuestion', () =>
    journal.savedQuestions.deleteSavedQuestion(secondSavedQuestionId)
  );

  // --- revisits -----------------------------------------------------------
  await drive('revisits', 'setRevisit', () =>
    journal.revisits.setRevisit({ entryId, createdEpochDay: 20000, targetEpochDay: 20100 })
  );
  const revisitForEntry = await driveRead('revisits', 'getRevisitForEntry', () =>
    journal.revisits.getRevisitForEntry(entryId)
  );
  await drive('revisits', 'deleteRevisit', () => journal.revisits.deleteRevisit(revisitForEntry!.id));

  // --- marginNotes ------------------------------------------------------
  const marginNoteId = (await drive('marginNotes', 'add', () =>
    journal.marginNotes.add({ entryId, epochDay: 20050, text: 'reading this back' })
  )) as string;
  await drive('marginNotes', 'edit', () => journal.marginNotes.edit(marginNoteId, 'reading this back, again'));
  const secondMarginNoteId = (await drive('marginNotes', 'add', () =>
    journal.marginNotes.add({ entryId, epochDay: 20051, text: 'a second thought' })
  )) as string;
  await drive('marginNotes', 'remove', () => journal.marginNotes.remove(secondMarginNoteId));

  // --- eras / eraMutes ----------------------------------------------------
  const beforeIKnew = (await drive('eras', 'upsertEra', () =>
    journal.eras.upsertEra({ name: 'before I knew', startEpochDay: null, endEpochDay: 19000 })
  )) as string;
  const firstYear = (await drive('eras', 'upsertEra', () =>
    journal.eras.upsertEra({ name: 'first year', startEpochDay: 19001, endEpochDay: 19365 })
  )) as string;
  await drive('eraMutes', 'setEraMuted', () => journal.eraMutes.setEraMuted(beforeIKnew, true));
  await drive('eras', 'deleteEra', () => journal.eras.deleteEra(firstYear));

  // --- wordIgnore -----------------------------------------------------------
  await drive('wordIgnore', 'setWordIgnored', () => journal.wordIgnore.setWordIgnored('marta', true));

  // --- documents ------------------------------------------------------------
  const documentId = (await drive('documents', 'addDocument', () =>
    journal.documents.addDocument(
      { epochDay: 20000, title: 'Psychiatric opinion' },
      { full: new Uint8Array([1]), thumb: new Uint8Array([2]) }
    )
  )) as string;
  await drive('documents', 'updateDocument', () =>
    journal.documents.updateDocument({
      id: documentId,
      epochDay: 19999,
      title: 'Psychiatric opinion, second',
      fileName: `${documentId}.jpg`,
      targetKind: null,
      targetId: null
    })
  );
  await drive('documents', 'setDocumentTarget', () =>
    journal.documents.setDocumentTarget(documentId, { kind: 'goal', id: 'core:hrt' })
  );
  // A second one purely to delete, so the reads below still have a document
  // to read and the delete still runs its own SQL.
  const doomedDocument = await journal.documents.addDocument(
    { epochDay: 19998, title: 'A duplicate scan' },
    { full: new Uint8Array([3]), thumb: new Uint8Array([4]) }
  );
  await drive('documents', 'deleteDocument', () => journal.documents.deleteDocument(doomedDocument));

  // --- wearSessions -----------------------------------------------------
  const wearSessionId = (await drive('wearSessions', 'upsertSession', () =>
    journal.wearSessions.upsertSession({
      kind: 'binder',
      startTimestamp: 1_700_000_000_000,
      durationMs: 6 * 3_600_000,
      note: 'a bit tight by the end',
      reminderHoursAfterStart: 8,
      reminderTitle: 'binder check-in'
    })
  )) as string;
  const secondWearSessionId = (await drive('wearSessions', 'upsertSession', () =>
    journal.wearSessions.upsertSession({ kind: 'binder', startTimestamp: 1_700_100_000_000, durationMs: null })
  )) as string;
  await drive('wearSessions', 'deleteSession', () => journal.wearSessions.deleteSession(secondWearSessionId));

  // --- hairProgress -------------------------------------------------------
  const hairStageId = (await drive('hairProgress', 'upsertStage', () =>
    journal.hairProgress.upsertStage({ epochDay: 19200, scale: 'norwood_hamilton', stage: '2a' })
  )) as string;
  const secondHairStageId = (await drive('hairProgress', 'upsertStage', () =>
    journal.hairProgress.upsertStage({ epochDay: 19230, scale: 'sinclair', stage: '2' })
  )) as string;
  await drive('hairProgress', 'deleteStage', () => journal.hairProgress.deleteStage(secondHairStageId));
  const hairPhotoId = (await drive('hairProgress', 'addPhoto', () =>
    journal.hairProgress.addPhoto(19200, photo('hairline'))
  )) as string;
  await drive('hairProgress', 'deletePhoto', () => journal.hairProgress.deletePhoto(hairPhotoId));
  // Redone so a photo row survives into the read sweep below.
  await drive('hairProgress', 'addPhoto', () => journal.hairProgress.addPhoto(19200, photo('hairline again')));

  // --- hairRemoval ---------------------------------------------------
  const hairRemovalId = (await drive('hairRemoval', 'upsertSession', () =>
    journal.hairRemoval.upsertSession({
      epochDay: 20000,
      area: 'upper_lip',
      method: 'laser',
      painRating: 2,
      cost: '250 PLN',
      provider: 'Klinika Laserowa'
    })
  )) as string;
  const hairRemovalPhotoId = (await drive('hairRemoval', 'addPhoto', () =>
    journal.hairRemoval.addPhoto(hairRemovalId, photo('session'))
  )) as string;
  await drive('hairRemoval', 'deletePhoto', () => journal.hairRemoval.deletePhoto(hairRemovalPhotoId));
  const secondHairRemovalId = (await drive('hairRemoval', 'upsertSession', () =>
    journal.hairRemoval.upsertSession({
      epochDay: 20001,
      area: 'chin',
      method: 'electrolysis',
      painRating: 3,
      cost: '',
      provider: ''
    })
  )) as string;
  await drive('hairRemoval', 'deleteSession', () => journal.hairRemoval.deleteSession(secondHairRemovalId));

  // --- procedures -----------------------------------------------------
  const procedureId = (await drive('procedures', 'upsertProcedure', () =>
    journal.procedures.upsertProcedure({
      name: 'top surgery',
      surgeryEpochDay: 20050,
      notes: 'drains out on day five'
    })
  )) as string;
  await drive('procedures', 'setNotes', () => journal.procedures.setNotes(procedureId, 'drains out day 5, no fever'));
  await drive('procedures', 'addConsult', () => journal.procedures.addConsult(procedureId, 19950));
  const secondConsultId = (await drive('procedures', 'addConsult', () =>
    journal.procedures.addConsult(procedureId, 19960)
  )) as string;
  await drive('procedures', 'deleteConsult', () => journal.procedures.deleteConsult(secondConsultId));
  const procedurePhotoId = (await drive('procedures', 'addPhoto', () =>
    journal.procedures.addPhoto(procedureId, 20052, photo('recovery'))
  )) as string;
  await drive('procedures', 'deletePhoto', () => journal.procedures.deletePhoto(procedurePhotoId));
  await drive('procedures', 'addPhoto', () => journal.procedures.addPhoto(procedureId, 20053, photo('recovery 2')));
  const checklistItem = (await drive('procedures', 'addChecklistItem', () =>
    journal.procedures.addChecklistItem(procedureId, 'buy gauze')
  )) as { id: string };
  await drive('procedures', 'recordSurgeryMilestone', () => journal.procedures.recordSurgeryMilestone(procedureId));

  // --- appointments -----------------------------------------------------
  const appointmentId = (await drive('appointments', 'upsertAppointment', () =>
    journal.appointments.upsertAppointment({
      epochDay: 20040,
      procedureId: null,
      kind: 'endokrynolog',
      place: 'Poradnia',
      note: 'ask about the dose'
    })
  )) as string;
  // The edit and the linked case, so the UPDATE and the procedure lookup are
  // both driven rather than only the insert.
  await drive('appointments', 'upsertAppointment', () =>
    journal.appointments.upsertAppointment({
      id: appointmentId,
      epochDay: 20041,
      procedureId,
      kind: 'chirurg',
      place: null,
      note: null
    })
  );
  const secondAppointmentId = (await drive('appointments', 'upsertAppointment', () =>
    journal.appointments.upsertAppointment({ epochDay: 20042, procedureId: null, kind: null, place: null, note: null })
  )) as string;
  await drive('appointments', 'deleteAppointment', () => journal.appointments.deleteAppointment(secondAppointmentId));
  const secondProcedureId = (await drive('procedures', 'upsertProcedure', () =>
    journal.procedures.upsertProcedure({ name: 'a second procedure', surgeryEpochDay: 20100, notes: '' })
  )) as string;
  await drive('procedures', 'deleteProcedure', () => journal.procedures.deleteProcedure(secondProcedureId));

  // --- checklists -------------------------------------------------------
  await drive('checklists', 'setItemChecked', () => journal.checklists.setItemChecked(checklistItem.id, true));
  await drive('checklists', 'setItemCarriedForward', () =>
    journal.checklists.setItemCarriedForward(checklistItem.id, true)
  );
  await drive('checklists', 'editItem', () => journal.checklists.editItem(checklistItem.id, 'buy more gauze'));
  const owner = { kind: 'test-owner', id: 'owner-1' };
  const ownedItem = (await drive('checklists', 'addToOwnedChecklist', () =>
    journal.checklists.addToOwnedChecklist(owner, 'a first owned item')
  )) as { id: string };
  const ownedChecklist = await journal.checklists.getChecklistByOwner(owner);
  await drive('checklists', 'addItem', () => journal.checklists.addItem(ownedChecklist!.id, 'a second owned item'));
  await drive('checklists', 'reorder', () =>
    journal.checklists.reorder(ownedChecklist!.id, [...ownedChecklist!.items.map((i) => i.id), ownedItem.id].slice(-2))
  );
  await drive('checklists', 'createChecklist', () =>
    journal.checklists.createChecklist({ kind: 'test-owner', id: 'owner-2' })
  );
  const standaloneItem = (await drive('checklists', 'addToStandaloneChecklist', () =>
    journal.checklists.addToStandaloneChecklist('ask about spironolactone dose')
  )) as { id: string };
  await drive('checklists', 'deleteItem', () => journal.checklists.deleteItem(standaloneItem.id));
  await drive('checklists', 'setDebriefDismissed', () => journal.checklists.setDebriefDismissed('appt-1'));
  await drive('checklists', 'recordDebriefEntry', () =>
    journal.checklists.recordDebriefEntry(secondEntryId, 'appt-1')
  );
  await drive('checklists', 'deleteChecklist', () => journal.checklists.deleteChecklist(ownedChecklist!.id));

  // --- doubtJournal -----------------------------------------------------
  const snapshotId = (await drive('doubtJournal', 'saveSnapshot', () =>
    journal.doubtJournal.saveSnapshot(20000, [{ epochDay: 19500, mood: 5, note: 'euphoric at the appointment' }])
  )) as string;
  await drive('doubtJournal', 'deleteSnapshot', () => journal.doubtJournal.deleteSnapshot(snapshotId));

  // --- areaStates ---------------------------------------------------------
  await drive('areaStates', 'setAreasHidden', () => journal.areaStates.setAreasHidden(['sizeRecords'], true));
  await drive('areaStates', 'setAreasFinished', () =>
    journal.areaStates.setAreasFinished(['hairRemovalSessions'], 19250)
  );
  await drive('areaStates', 'setAreasSuspended', () =>
    journal.areaStates.setAreasSuspended(['voiceBenchmarks'], 19260)
  );

  // --- comfortItems ---------------------------------------------------
  const comfortItemId = (await drive('comfortItems', 'addItem', () =>
    journal.comfortItems.addItem('text a friend')
  )) as { id: string };
  const secondComfortItemId = (await drive('comfortItems', 'addItem', () =>
    journal.comfortItems.addItem('walk by the river')
  )) as { id: string };
  await drive('comfortItems', 'editItem', () => journal.comfortItems.editItem(comfortItemId.id, 'call a friend'));
  await drive('comfortItems', 'reorder', () =>
    journal.comfortItems.reorder([secondComfortItemId.id, comfortItemId.id])
  );
  await drive('comfortItems', 'deleteItem', () => journal.comfortItems.deleteItem(secondComfortItemId.id));

  // --- tryouts / feltSense -------------------------------------------------
  const tryoutId = (await drive('tryouts', 'upsertTryout', () =>
    journal.tryouts.upsertTryout({
      kind: 'style',
      label: 'layered look',
      description: 'cardigan over a fitted top',
      startEpochDay: 19900,
      endEpochDay: null
    })
  )) as string;
  const tryoutPhotoId = (await drive('tryouts', 'addPhoto', () =>
    journal.tryouts.addPhoto(tryoutId, 19905, photo('presenting'))
  )) as string;
  await drive('tryouts', 'deletePhoto', () => journal.tryouts.deletePhoto(tryoutPhotoId));
  await drive('tryouts', 'addPhoto', () => journal.tryouts.addPhoto(tryoutId, 19906, photo('presenting again')));
  await drive('feltSense', 'add', () => journal.feltSense.add({ tryoutId }, { epochDay: 19910, mood: 4, note: 'felt right' }));
  const milestoneFeltSense = (await drive('feltSense', 'add', () =>
    journal.feltSense.add({ milestoneId }, { epochDay: 19911, mood: 5, note: 'a year on' })
  )) as string;
  await drive('feltSense', 'remove', () => journal.feltSense.remove(milestoneFeltSense));
  await drive('tryouts', 'adoptTryout', () =>
    journal.tryouts.adoptTryout(tryoutId, { createMilestone: true, milestoneTitle: 'adopted: layered look' })
  );
  const secondTryoutId = (await drive('tryouts', 'upsertTryout', () =>
    journal.tryouts.upsertTryout({ kind: 'name', label: 'Alex', startEpochDay: 19800, endEpochDay: null })
  )) as string;
  await drive('tryouts', 'deleteTryout', () => journal.tryouts.deleteTryout(secondTryoutId));

  // --- letters --------------------------------------------------------
  const letterId = (await drive('letters', 'addLetter', () =>
    journal.letters.addLetter({ epochDay: 20000, text: 'read this in a year', unlockEpochDay: 20365 })
  )) as string;
  const secondLetterId = (await drive('letters', 'addLetter', () =>
    journal.letters.addLetter({ epochDay: 20000, text: 'a second letter', unlockEpochDay: 20366 })
  )) as string;
  await drive('letters', 'deleteLetter', () => journal.letters.deleteLetter(secondLetterId));

  // --- roadmap --------------------------------------------------------
  await drive('roadmap', 'setGoalStatus', () => journal.roadmap.setGoalStatus('pl', 'pl-legal-court-file', 'checked'));
  const customGoal = (await drive('roadmap', 'addCustomGoal', () =>
    journal.roadmap.addCustomGoal('social', 'Tell my sister')
  )) as { id: string };
  await drive('roadmap', 'setCustomGoalStatus', () => journal.roadmap.setCustomGoalStatus(customGoal.id, 'checked'));
  await drive('roadmap', 'setTrackDismissed', () => journal.roadmap.setTrackDismissed('medical', true));

  // These ids are never read back below; kept only because they exist -
  // suppresses "declared but never read" without pretending they matter.
  void [labId, measurementId, sizeRecordId, taperSessionId, tallyId, doseId, stockId, sideEffectId, cycleEventId,
    journalingPauseId, savedQuestionId, wearSessionId, hairStageId, benchmarkId, takeId];

  // --- reads --------------------------------------------------------------
  // Every classified read this file can drive with no more setup than the
  // ids already in hand, checked below for writing nothing at all.
  await driveRead('entries', 'getEntry', () => journal.entries.getEntry(entryId));
  await driveRead('entries', 'entriesForDay', () => journal.entries.entriesForDay(20000));
  await driveRead('entries', 'recentDays', () => journal.entries.recentDays(5));
  await driveRead('entries', 'entriesWithTag', () => journal.entries.entriesWithTag(tag2.id, 10));
  await driveRead('entries', 'counterevidencePool', () => journal.entries.counterevidencePool(['e-happy'], 5));
  await driveRead('entries', 'latestBadMomentEntry', () => journal.entries.latestBadMomentEntry());
  await driveRead('entries', 'latestBadMomentEntryId', () => journal.entries.latestBadMomentEntryId());
  await driveRead('entries', 'searchEntries', () => journal.entries.searchEntries('good', []));
  await driveRead('entries', 'countSearchMatches', () => journal.entries.countSearchMatches('good', []));
  await driveRead('entries', 'trashedEntries', () => journal.entries.trashedEntries());
  await driveRead('entries', 'lastWriteEpochDay', () => journal.entries.lastWriteEpochDay(20000));
  await driveRead('entries', 'countAll', () => journal.entries.countAll());
  await driveRead('entries', 'noteEntries', () => journal.entries.noteEntries());
  await driveRead('tags', 'getTagGroups', () => journal.tags.getTagGroups());
  await driveRead('presentations', 'getPresentations', () => journal.presentations.getPresentations());
  await driveRead('entryTemplates', 'getEntryTemplates', () => journal.entryTemplates.getEntryTemplates());
  await driveRead('affirmations', 'getAffirmations', () => journal.affirmations.getAffirmations());
  await driveRead('bodyRegions', 'getBodyRegions', () => journal.bodyRegions.getBodyRegions());
  await driveRead('dimensions', 'getDimensions', () => journal.dimensions.getDimensions());
  await driveRead('dimensions', 'getPresets', () => journal.dimensions.getPresets());
  await driveRead('milestones', 'getMilestones', () => journal.milestones.getMilestones());
  await driveRead('milestones', 'getMilestonesOnDay', () => journal.milestones.getMilestonesOnDay(19000));
  await driveRead('milestones', 'lastWriteEpochDay', () => journal.milestones.lastWriteEpochDay(20000));
  await driveRead('photos', 'inJournal', () => journal.photos.inJournal());
  await driveRead('photos', 'starredPhotos', () => journal.photos.starredPhotos());
  await driveRead('voice', 'inJournal', () => journal.voice.inJournal());
  await driveRead('voiceBenchmarks', 'getBenchmarks', () => journal.voiceBenchmarks.getBenchmarks());
  await driveRead('voiceBenchmarks', 'getBenchmarksOnDay', () => journal.voiceBenchmarks.getBenchmarksOnDay(20060));
  await driveRead('voiceBenchmarks', 'lastWriteEpochDay', () => journal.voiceBenchmarks.lastWriteEpochDay(20060));
  await driveRead('voicePracticeTakes', 'getTakes', () => journal.voicePracticeTakes.getTakes());
  await driveRead('voicePracticeTakes', 'getTakesOnDay', () => journal.voicePracticeTakes.getTakesOnDay(20000));
  await driveRead('voicePracticeTakes', 'lastWriteEpochDay', () => journal.voicePracticeTakes.lastWriteEpochDay(20000));
  await driveRead('videos', 'inJournal', () => journal.videos.inJournal());
  await driveRead('labs', 'getAnalytes', () => journal.labs.getAnalytes());
  await driveRead('labs', 'getUsedAnalytes', () => journal.labs.getUsedAnalytes());
  await driveRead('labs', 'getMostRecentAnalyte', () => journal.labs.getMostRecentAnalyte());
  await driveRead('labs', 'getLatestResult', () => journal.labs.getLatestResult());
  await driveRead('labs', 'getResults', () => journal.labs.getResults('estradiol'));
  await driveRead('labs', 'getResultsOnDay', () => journal.labs.getResultsOnDay(20004));
  await driveRead('labs', 'getSeries', () => journal.labs.getSeries('estradiol'));
  await driveRead('labs', 'lastWriteEpochDay', () => journal.labs.lastWriteEpochDay(20004));
  await driveRead('measurements', 'getMeasurements', () => journal.measurements.getMeasurements(shoulders.key));
  await driveRead('measurements', 'getSeries', () => journal.measurements.getSeries(shoulders.key));
  await driveRead('measurements', 'getMeasurementsInRange', () =>
    journal.measurements.getMeasurementsInRange(19000, 21000)
  );
  await driveRead('measurements', 'getMeasurementTypes', () => journal.measurements.getMeasurementTypes());
  await driveRead('measurements', 'lastWriteEpochDay', () => journal.measurements.lastWriteEpochDay(20000));
  await driveRead('measurements', 'countAll', () => journal.measurements.countAll());
  await driveRead('sizeRecords', 'getRecords', () => journal.sizeRecords.getRecords());
  await driveRead('sizeRecords', 'getRecordsByCategory', () => journal.sizeRecords.getRecordsByCategory('pants'));
  await driveRead('sizeRecords', 'getRecordsOnDay', () => journal.sizeRecords.getRecordsOnDay(20000));
  await driveRead('sizeRecords', 'lastWriteEpochDay', () => journal.sizeRecords.lastWriteEpochDay(20000));
  await driveRead('taper', 'getTaper', () => journal.taper.getTaper());
  await driveRead('taper', 'getSessions', () => journal.taper.getSessions());
  await driveRead('taper', 'getSessionsOnDay', () => journal.taper.getSessionsOnDay(19955));
  await driveRead('taper', 'lastWriteEpochDay', () => journal.taper.lastWriteEpochDay(19955));
  await driveRead('reminders', 'getReminders', () => journal.reminders.getReminders());
  await driveRead('tally', 'getEvents', () => journal.tally.getEvents('misgendered'));
  await driveRead('tally', 'getEventsOnDay', () => journal.tally.getEventsOnDay(20000));
  await driveRead('tally', 'lastWriteEpochDay', () => journal.tally.lastWriteEpochDay(20000));
  await driveRead('regimen', 'getEpisodes', () => journal.regimen.getEpisodes());
  await driveRead('doses', 'getDoses', () => journal.doses.getDoses(0, 30000));
  await driveRead('doses', 'getSchedules', () => journal.doses.getSchedules());
  await driveRead('doses', 'getPauses', () => journal.doses.getPauses());
  await driveRead('doses', 'getComparison', () => journal.doses.getComparison({ fromEpochDay: 19000, toEpochDay: 20000 }));
  await driveRead('doses', 'lastWriteEpochDay', () => journal.doses.lastWriteEpochDay(20000));
  await driveRead('doses', 'countConsumingDosesByDrug', () =>
    journal.doses.countConsumingDosesByDrug([
      { fromEpochDay: 19000, toEpochDay: 19500 },
      { fromEpochDay: 19501, toEpochDay: 20000 }
    ])
  );
  await driveRead('stock', 'getEntries', () => journal.stock.getEntries());
  await driveRead('stock', 'getProjections', () => journal.stock.getProjections(20000));
  await driveRead('exposure', 'getCounters', () => journal.exposure.getCounters(0, 30000));
  await driveRead('hormoneCurve', 'getCurves', () =>
    journal.hormoneCurve.getCurves({ fromEpochDay: 0, toEpochDay: 30000, fitToOwnLabs: false })
  );
  await driveRead('sideEffects', 'getSideEffects', () => journal.sideEffects.getSideEffects());
  await driveRead('sideEffects', 'getSideEffectsInRange', () => journal.sideEffects.getSideEffectsInRange(0, 30000));
  await driveRead('sideEffects', 'lastWriteEpochDay', () => journal.sideEffects.lastWriteEpochDay(20000));
  await driveRead('cycleEvents', 'getCycleEvents', () => journal.cycleEvents.getCycleEvents());
  await driveRead('cycleEvents', 'getCycleEventsInRange', () => journal.cycleEvents.getCycleEventsInRange(0, 30000));
  await driveRead('cycleEvents', 'lastWriteEpochDay', () => journal.cycleEvents.lastWriteEpochDay(20000));
  await driveRead('journalingPauses', 'getPauses', () => journal.journalingPauses.getPauses());
  await driveRead('savedQuestions', 'getSavedQuestions', () => journal.savedQuestions.getSavedQuestions());
  await driveRead('revisits', 'getDueRevisits', () => journal.revisits.getDueRevisits(20200));
  await driveRead('marginNotes', 'forEntries', () => journal.marginNotes.forEntries([entryId]));
  await driveRead('eras', 'getEras', () => journal.eras.getEras());
  await driveRead('eras', 'getJournalBounds', () => journal.eras.getJournalBounds());
  await driveRead('eraMutes', 'getMutedEraUuids', () => journal.eraMutes.getMutedEraUuids());
  await driveRead('wordIgnore', 'getIgnoredWords', () => journal.wordIgnore.getIgnoredWords());
  await driveRead('documents', 'getDocuments', () => journal.documents.getDocuments());
  await driveRead('documents', 'getDocument', () => journal.documents.getDocument(documentId));
  await driveRead('documents', 'getDocumentsOnDay', () => journal.documents.getDocumentsOnDay(19999));
  await driveRead('documents', 'getDocumentsLinkedTo', () =>
    journal.documents.getDocumentsLinkedTo('goal', 'core:hrt')
  );
  await driveRead('documents', 'lastWriteEpochDay', () => journal.documents.lastWriteEpochDay(20000));
  await driveRead('chartAnnotations', 'getAnnotations', () =>
    journal.chartAnnotations.getAnnotations(0, 30000, 20000)
  );
  await driveRead('chartAnnotations', 'getCurveMarkers', () =>
    journal.chartAnnotations.getCurveMarkers(0, 30000, 20000)
  );
  await driveRead('wearSessions', 'getSessions', () => journal.wearSessions.getSessions(0, 30000));
  await driveRead('wearSessions', 'getRunningSession', () => journal.wearSessions.getRunningSession());
  await driveRead('wearSessions', 'latestKind', () => journal.wearSessions.latestKind());
  await driveRead('wearSessions', 'lastWriteEpochDay', () => journal.wearSessions.lastWriteEpochDay(20000));
  await driveRead('clinicianSummary', 'getSummary', () => journal.clinicianSummary.getSummary(0, 30000));
  await driveRead('day', 'getDay', () => journal.day.getDay(20000));
  await driveRead('lastWrite', 'getLastWrites', () => journal.lastWrite.getLastWrites(20000));
  await driveRead('dayAhead', 'getDayAhead', () => journal.dayAhead.getDayAhead(0, 30000, 20000));
  await driveRead('textSearch', 'search', () =>
    journal.textSearch.search({ query: 'good', today: 20000, limit: 10 })
  );
  await driveRead('journalBook', 'getBook', () =>
    journal.journalBook.getBook(0, 30000, {
      entries: true,
      photos: true,
      tags: true,
      dysphoriaEuphoriaTags: true,
      milestones: true,
      sideEffects: true,
      openingPage: true
    })
  );
  await driveRead('personalEffects', 'getMarkers', () => journal.personalEffects.getMarkers());
  await driveRead('personalEffects', 'getMarkersFirstNoticedOn', () =>
    journal.personalEffects.getMarkersFirstNoticedOn(19190)
  );
  await driveRead('personalEffects', 'lastWriteEpochDay', () => journal.personalEffects.lastWriteEpochDay(19190));
  await driveRead('personalEffects', 'getEffectTypes', () => journal.personalEffects.getEffectTypes());
  await driveRead('effectCategories', 'getEffectCategories', () => journal.effectCategories.getEffectCategories());
  await driveRead('hairProgress', 'getStages', () => journal.hairProgress.getStages());
  await driveRead('hairProgress', 'getStagesOnDay', () => journal.hairProgress.getStagesOnDay(19200));
  await driveRead('hairProgress', 'lastStageWriteEpochDay', () => journal.hairProgress.lastStageWriteEpochDay(19200));
  await driveRead('hairProgress', 'getPhotos', () => journal.hairProgress.getPhotos());
  await driveRead('hairProgress', 'getPhotosOnDay', () => journal.hairProgress.getPhotosOnDay(19200));
  await driveRead('hairProgress', 'lastPhotoWriteEpochDay', () => journal.hairProgress.lastPhotoWriteEpochDay(19200));
  await driveRead('hairRemoval', 'getSessions', () => journal.hairRemoval.getSessions());
  await driveRead('hairRemoval', 'getSessionsOnDay', () => journal.hairRemoval.getSessionsOnDay(20000));
  await driveRead('hairRemoval', 'lastWriteEpochDay', () => journal.hairRemoval.lastWriteEpochDay(20000));
  await driveRead('hairRemoval', 'latestSession', () => journal.hairRemoval.latestSession(20000));
  await driveRead('hairRemoval', 'getPhotos', () => journal.hairRemoval.getPhotos(hairRemovalId));
  await driveRead('procedures', 'getProcedures', () => journal.procedures.getProcedures());
  await driveRead('procedures', 'getPhotos', () => journal.procedures.getPhotos(procedureId));
  await driveRead('procedures', 'getDayRecords', () => journal.procedures.getDayRecords(19950));
  await driveRead('procedures', 'lastWriteEpochDay', () => journal.procedures.lastWriteEpochDay(20000));
  await driveRead('procedures', 'getChecklist', () => journal.procedures.getChecklist(procedureId));
  await driveRead('procedures', 'getMilestone', () => journal.procedures.getMilestone(procedureId));
  await driveRead('appointments', 'getAppointments', () => journal.appointments.getAppointments());
  await driveRead('appointments', 'getAppointment', () => journal.appointments.getAppointment(appointmentId));
  await driveRead('appointments', 'getKinds', () => journal.appointments.getKinds());
  await driveRead('appointments', 'getDayRecords', () => journal.appointments.getDayRecords(20041));
  await driveRead('appointments', 'lastWriteEpochDay', () => journal.appointments.lastWriteEpochDay(20050));
  await driveRead('appointments', 'consultsByProcedure', () => journal.appointments.consultsByProcedure());
  await driveRead('checklists', 'getChecklist', () => journal.checklists.getChecklist(ownedChecklist!.id));
  await driveRead('checklists', 'getChecklistByOwner', () => journal.checklists.getChecklistByOwner(owner));
  await driveRead('checklists', 'getStandaloneChecklist', () => journal.checklists.getStandaloneChecklist());
  await driveRead('checklists', 'getDebriefState', () => journal.checklists.getDebriefState('appt-1'));
  await driveRead('checklists', 'getDebriefEntryId', () => journal.checklists.getDebriefEntryId('appt-1'));
  await driveRead('doubtJournal', 'getSnapshots', () => journal.doubtJournal.getSnapshots(10));
  await driveRead('areaStates', 'getAreaStates', () => journal.areaStates.getAreaStates());
  await driveRead('comfortItems', 'getItems', () => journal.comfortItems.getItems());
  await driveRead('tryouts', 'getTryouts', () => journal.tryouts.getTryouts());
  await driveRead('tryouts', 'getPhotos', () => journal.tryouts.getPhotos(tryoutId));
  await driveRead('tryouts', 'getPhotosOnDay', () => journal.tryouts.getPhotosOnDay(19906));
  await driveRead('tryouts', 'lastWriteEpochDay', () => journal.tryouts.lastWriteEpochDay(19906));
  await driveRead('feltSense', 'forTryout', () => journal.feltSense.forTryout(tryoutId));
  await driveRead('feltSense', 'forMilestone', () => journal.feltSense.forMilestone(milestoneId));
  await driveRead('feltSense', 'onDay', () => journal.feltSense.onDay(19910));
  await driveRead('feltSense', 'lastWriteEpochDay', () => journal.feltSense.lastWriteEpochDay(19910));
  // With an id, since the empty case short-circuits before any SQL runs.
  await driveRead('feltSense', 'latestDaysForTryouts', () => journal.feltSense.latestDaysForTryouts([tryoutId]));
  await driveRead('letters', 'getLetters', () => journal.letters.getLetters(10));
  await driveRead('letters', 'getLetterSeals', () => journal.letters.getLetterSeals(10));
  await driveRead('letters', 'getLetter', () => journal.letters.getLetter(letterId));
  await driveRead('letters', 'getUnlockDaysInRange', () => journal.letters.getUnlockDaysInRange(20000, 30000));
  await driveRead('roadmap', 'getGoalStatuses', () => journal.roadmap.getGoalStatuses('pl'));
  await driveRead('roadmap', 'getDismissedTracks', () => journal.roadmap.getDismissedTracks());
  await driveRead('roadmap', 'getCustomGoals', () => journal.roadmap.getCustomGoals());
  await driveRead('stats', 'dayAverages', () => journal.stats.dayAverages('mood', 19000, 21000));
  await driveRead('stats', 'daySpread', () => journal.stats.daySpread('mood', 19000, 21000));
  await driveRead('stats', 'constellationReadings', () =>
    journal.stats.constellationReadings(voice.key, 'femininity', 19000, 21000)
  );
  await driveRead('stats', 'bodyRegionTrend', () =>
    journal.stats.bodyRegionTrend('chest', 'dysphoria', 19000, 21000)
  );
  await driveRead('stats', 'bodyRegionBreakdown', () => journal.stats.bodyRegionBreakdown('chest'));
  await driveRead('stats', 'wearTimeTrend', () => journal.stats.wearTimeTrend(0, 30000));
  await driveRead('stats', 'tallyTrend', () => journal.stats.tallyTrend('misgendered', 0, 30000));
  await driveRead('stats', 'bodyRegionReadings', () => journal.stats.bodyRegionReadings('dysphoria', 19000, 21000));
  await driveRead('stats', 'entryCountsByDay', () => journal.stats.entryCountsByDay(19000, 21000));
  await driveRead('stats', 'presentationDays', () => journal.stats.presentationDays(femme.id, 19000, 21000));
  await driveRead('stats', 'tagInsights', () => journal.stats.tagInsights('mood', 19000, 21000));
  await driveRead('stats', 'tagShare', () => journal.stats.tagShare(19000, 21000));
  await driveRead('stats', 'recap', () => journal.stats.recap(19000, 21000));
  await driveRead('stats', 'isGoodDay', () => journal.stats.isGoodDay(20000));
  await driveRead('correlationCards', 'getCards', () => journal.correlationCards.getCards(19000, 21000));
  await driveRead('intervalMoodPattern', 'dayOfInterval', () =>
    journal.intervalMoodPattern.dayOfInterval(19000, 21000)
  );
  await driveRead('intervalMoodPattern', 'byCustomInterval', () =>
    journal.intervalMoodPattern.byCustomInterval(28, 19000, 21000)
  );
  await driveRead('archive', 'snapshot', () => journal.archive.snapshot());
  await driveRead('archive', 'importLog', () => journal.archive.importLog());

  // --- archive writes, and discardEverything - both driven at the very
  // end, since replace and discardEverything wipe the journal every read
  // above already depended on (see the header for why these are driven at
  // all rather than opted out). ---
  const mergeSnapshot = await journal.archive.snapshot();
  await drive('archive', 'merge', () =>
    journal.archive.merge({ journal: mergeSnapshot.journal, files: (async function* () {})() })
  );

  const daylioPreview = await driveRead('archive', 'previewDaylioImport', () =>
    journal.archive.previewDaylioImport(
      'full_date,date,weekday,time,mood,activities,note_title,note\n2026-01-15,January 15,Thursday,07:15,Rad,,,from Daylio',
      { tagLabels: () => [] }
    )
  );
  await drive('archive', 'commitDaylioImport', () => journal.archive.commitDaylioImport(daylioPreview));

  const trackAndGraphPreview = await driveRead('archive', 'previewTrackAndGraphImport', () =>
    journal.archive.previewTrackAndGraphImport(
      ['FeatureName,Timestamp,Value', 'Weight,2022-09-14T21:30:41.432+01:00,72.5'].join('\r\n')
    )
  );
  await drive('archive', 'commitTrackAndGraphImport', () =>
    journal.archive.commitTrackAndGraphImport(trackAndGraphPreview)
  );

  const pixelsPreview = await driveRead('archive', 'previewPixelsImport', () =>
    journal.archive.previewPixelsImport(
      new TextEncoder().encode(
        JSON.stringify([{ date: '2026-9-1', type: 'MOOD', scores: [3], notes: 'from Pixels', tags: [] }])
      )
    )
  );
  await drive('archive', 'commitPixelsImport', () => journal.archive.commitPixelsImport(pixelsPreview));

  const replaceSnapshot = await journal.archive.snapshot();
  await drive('archive', 'replace', () =>
    journal.archive.replace({ journal: replaceSnapshot.journal, files: (async function* () {})() })
  );

  await driveWide('discardEverything', [...TABLE_NAMES], () => journal.discardEverything());
}, 30_000);

describe('every classified write announces exactly the tables its SQL touched', () => {
  test('every classified write is either driven here or opted out with a reason', () => {
    const drivenKeys = new Set(driven.map((d) => d.key));
    const missing = [...declaredBy.keys()].filter((key) => !drivenKeys.has(key) && !(key in WRITE_OPT_OUTS));
    assert.deepEqual(missing, [], `driven nor opted out: ${missing.join(', ')}`);
  });

  test("each driven write's SQL touched no table outside its announcement", () => {
    for (const { key, coarse, wrote } of driven) {
      const expected = new Set(coarse.flatMap((name) => SQL_TABLES[name]));
      const extra = wrote.filter((table) => !expected.has(table));
      assert.deepEqual(extra, [], `journal.${key} wrote ${JSON.stringify(wrote)}, outside its declared ${[...expected].sort().join(', ')}`);
    }
  });

  test('every table a coarse name declares is actually written by some operation that declares it', () => {
    for (const name of TABLE_NAMES) {
      const declaringKeys = [...declaredBy.entries()].filter(([, tables]) => tables.includes(name)).map(([key]) => key);
      // A name only ever declared by opted-out operations has nothing
      // driven to check it against - skip rather than fail on a gap this
      // file already named a reason for.
      if (declaringKeys.length > 0 && declaringKeys.every((key) => key in WRITE_OPT_OUTS)) continue;

      // archive.replace and discardEverything wipe the whole journal for
      // real, so their observed writes span nearly every content table -
      // which would let either one alone "satisfy" this check for any
      // coarse name, telling this test nothing about whether *that* name's
      // mapping is right. They still count for check 1 and for coverage;
      // only the per-table union below excludes them, the same reason a
      // proof that touches everything proves nothing about one thing.
      const owners = driven.filter((d) => d.coarse.includes(name) && !WIPES_THE_JOURNAL.has(d.key));
      const hit = new Set(owners.flatMap((d) => d.wrote).filter((table) => SQL_TABLES[name].includes(table)));
      assert.deepEqual(
        [...hit].sort(),
        [...SQL_TABLES[name]].sort(),
        `SQL_TABLES['${name}'] claims ${JSON.stringify(SQL_TABLES[name])}, but only ${JSON.stringify([...hit])} is ever written (outside a full wipe) by an operation that declares '${name}'` +
          (owners.length === 0 ? ' (no driven, non-wiping operation declares it at all)' : '')
      );
    }
  });
});

test('no operation classified as a read writes anything', () => {
  for (const { key, wrote } of readWrote) {
    assert.deepEqual(wrote, [], `journal.${key} is a read but its SQL wrote to ${JSON.stringify(wrote)}`);
  }
});

test('every read this sweep drove is one writes.ts actually classifies as a read', () => {
  for (const { key } of readWrote) {
    const [area, operation] = key.split('.', 2);
    assert.doesNotThrow(() => tablesReadBy(area, operation), `journal.${key} is not a classified read`);
  }
});

test('every classified read is either driven here or opted out with a reason', () => {
  const drivenKeys = new Set(readWrote.map((d) => d.key));
  const missing = [...declaredReadsBy].filter((key) => !drivenKeys.has(key) && !(key in READ_OPT_OUTS));
  assert.deepEqual(missing, [], `driven nor opted out: ${missing.join(', ')}`);
});

describe('the two checks above can actually fail', () => {
  test('a table removed from a declaration a write really touches fails the per-operation check', () => {
    const entry = driven.find((d) => d.key === 'entries.upsertEntry')!;
    const shrunk: Record<TableName, readonly string[]> = {
      ...SQL_TABLES,
      entry: SQL_TABLES.entry.filter((t) => t !== 'entry_dimension_value')
    };
    const expected = new Set(entry.coarse.flatMap((name) => shrunk[name]));
    const extra = entry.wrote.filter((table) => !expected.has(table));
    assert.deepEqual(extra, ['entry_dimension_value']);
  });

  test('a table nothing writes, added to a declaration, fails the per-coarse-name union check', () => {
    const padded: Record<TableName, readonly string[]> = { ...SQL_TABLES, tally: [...SQL_TABLES.tally, 'photo'] };
    const owners = driven.filter((d) => d.coarse.includes('tally') && !WIPES_THE_JOURNAL.has(d.key));
    const hit = new Set(owners.flatMap((d) => d.wrote).filter((table) => padded.tally.includes(table)));
    assert.notDeepEqual([...hit].sort(), [...padded.tally].sort());
  });
});

import { expect, test } from 'vitest';
import { openJournal } from '../../src/lib/data/journal/journal';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store';
import { migratedDb } from '../../src/lib/data/sqlite/test-support/migrated-db';
import { recordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver';
import { readCare } from '../../src/lib/data/careReads';
import nativeBudgets from '../../android/app/src/androidTest/assets/android-budgets.json';
import { generateLongJournal, ONE_YEAR_IN_DAYS, TEN_YEARS_IN_DAYS } from './generate';
import { bytePatternPhoto } from './test-support';

// Counts cross the same driver seam on Node and Android. Timings do not.
test.each([ONE_YEAR_IN_DAYS, TEN_YEARS_IN_DAYS])('Care reuses its slot rows for totals and fits native count budgets with %i days', async (days) => {
  const db = await migratedDb();
  try {
    const recorder = recordingDriver(db);
    const journal = openJournal(recorder.driver, fakeFileStore());
    await journal.reconcileBuiltIns();
    const summary = await generateLongJournal(journal, { days, makePhoto: bytePatternPhoto });
    const { result, recording } = await recorder.record(async () => {
      return readCare(journal, summary.lastEpochDay);
    });
    const budget = nativeBudgets.measurements['mount-care'];
    expect(recording.statements.length).toBeLessThanOrEqual(budget.statementBudget);
    expect(recording.bytes).toBeLessThanOrEqual(budget.byteBudget);
    // Totals use the slot window already read for the lanes.
    expect(recording.statements.filter((statement) => statement.read.includes('dose_event')).length).toBe(2);
    const expected = await journal.exposure.getCounters(summary.lastEpochDay - 89, summary.lastEpochDay);
    for (const lane of result.lanes) {
      expect(lane.doseTotals).toEqual(expected.doseTotals.filter((total) => total.drug === lane.episode.drug));
    }
  } finally {
    await db.close();
  }
});

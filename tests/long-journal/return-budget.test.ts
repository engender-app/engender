import { expect, test } from 'vitest';
import { openJournal } from '../../src/lib/data/journal/journal';
import { fakeFileStore } from '../../src/lib/data/photos/test-support/fake-file-store';
import { migratedDb } from '../../src/lib/data/sqlite/test-support/migrated-db';
import { recordingDriver } from '../../src/lib/data/sqlite/test-support/recording-driver';
import { readReturnGap, readWhatIsWaiting } from '../../src/lib/data/comingBackReads';
import nativeBudgets from '../../android/app/src/androidTest/assets/android-budgets.json';
import { generateLongJournal, ONE_YEAR_IN_DAYS, TEN_YEARS_IN_DAYS } from './generate';
import { bytePatternPhoto } from './test-support';

// Counts cross the same driver seam on Node and Android. Timings do not.
test.each([ONE_YEAR_IN_DAYS, TEN_YEARS_IN_DAYS])('return reads fit native count budgets with %i days', async (days) => {
  const db = await migratedDb();
  try {
    const recorder = recordingDriver(db);
    const journal = openJournal(recorder.driver, fakeFileStore());
    await journal.reconcileBuiltIns();
    const summary = await generateLongJournal(journal, { days, makePhoto: bytePatternPhoto });
    const { recording } = await recorder.record(async () => {
      await readReturnGap(journal, summary.lastEpochDay);
      await readWhatIsWaiting(journal, summary.lastEpochDay, summary.lastEpochDay - 90);
    });
    const budget = nativeBudgets.measurements['mount-coming-back'];
    expect(recording.statements.length).toBeLessThanOrEqual(budget.statementBudget);
    expect(recording.bytes).toBeLessThanOrEqual(budget.byteBudget);
    // Re-reading the schedules adds three crossings, even when a wider
    // byte budget could hide that duplicate work.
    expect(recording.statements.length).toBeLessThanOrEqual(32);
  } finally {
    await db.close();
  }
});

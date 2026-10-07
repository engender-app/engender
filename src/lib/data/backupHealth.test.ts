import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { BACKUP_STALE_DAYS, backupAgeDays, backupIsStale, storageNoticeShows } from './backupHealth.ts';

test('a journal never exported has no age, and is not stale either', () => {
  assert.equal(backupAgeDays(null, 20676), null);
  assert.equal(backupIsStale(null, 20676), false);
});

test('staleness turns over after thirty days, not on the thirtieth', () => {
  // Local midnight, not epochDay * 86400000: the second is a UTC instant
  // and lands on the day before in every timezone west of Greenwich.
  const thirty = startOfDayTimestamp(20676 - BACKUP_STALE_DAYS);
  assert.equal(backupAgeDays(thirty, 20676), 30);
  assert.equal(backupIsStale(thirty, 20676), false);
  assert.equal(backupIsStale(startOfDayTimestamp(20676 - BACKUP_STALE_DAYS - 1), 20676), true);
});

test('a backup made today is nought days old, not one', () => {
  assert.equal(backupAgeDays(startOfDayTimestamp(20676) + 13 * 3_600_000, 20676), 0);
});

/* After-release 17 (U2): the browser's refusal to keep storage used to be a
   toast over the Welcome screen on every cold load. It is a Home notice
   now, and only while it asks for something the person has not done. */
test('the storage notice shows only where the browser refused and no backup was ever made', () => {
  const recent = startOfDayTimestamp(20676 - 3);
  assert.equal(storageNoticeShows({ persistDenied: true, dismissed: false, lastBackupAt: null }), true);
  assert.equal(storageNoticeShows({ persistDenied: true, dismissed: false, lastBackupAt: recent }), false);
  assert.equal(storageNoticeShows({ persistDenied: false, dismissed: false, lastBackupAt: null }), false);
  assert.equal(storageNoticeShows({ persistDenied: true, dismissed: true, lastBackupAt: null }), false);
});

/* Review finding: it used to come back once the backup that answered it
   turned thirty days old, which made a one-time explanation a recurring
   reminder beside the stale-backup notice that already is one. */
test('the storage notice does not come back when the backup that answered it goes stale', () => {
  const today = 20676;
  const old = startOfDayTimestamp(today - BACKUP_STALE_DAYS - 1);
  assert.equal(storageNoticeShows({ persistDenied: true, dismissed: false, lastBackupAt: old }), false);
  assert.equal(backupIsStale(old, today), true);
});

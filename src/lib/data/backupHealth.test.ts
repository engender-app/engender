import assert from 'node:assert/strict';
import { test } from 'vitest';
import { startOfDayTimestamp } from './epochDay.ts';
import { BACKUP_STALE_DAYS, backupAgeDays, backupIsStale, backupStanding, storageNoticeShows, safariInstallationTarget } from './backupHealth.ts';

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

/* Last-audit UI 54 (U53): not stale is not the same as backed up. Export &
   import drew its success tick for every journal that was not stale, and
   one never exported is not stale, so "No export recorded on this device"
   sat beside a tick. */
test('a journal never exported stands apart from a recent backup and a stale one', () => {
  const today = 20676;
  assert.equal(backupStanding(null, today), 'never');
  assert.equal(backupStanding(startOfDayTimestamp(today), today), 'recent');
  assert.equal(backupStanding(startOfDayTimestamp(today - BACKUP_STALE_DAYS), today), 'recent');
  assert.equal(backupStanding(startOfDayTimestamp(today - BACKUP_STALE_DAYS - 1), today), 'stale');
});

test('a backup made today is nought days old, not one', () => {
  assert.equal(backupAgeDays(startOfDayTimestamp(20676) + 13 * 3_600_000, 20676), 0);
});

/* After-release 17 (U2): the browser's refusal to keep storage used to be a
   toast over the Welcome screen on every cold load. It is a Home notice
   now, and only while it asks for something the person has not done. */
test('other browsers show the storage notice only after persistence refusal and before a first backup', () => {
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

const iosSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const macSafari = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';

test('Safari installation advice is selected independently of the persistence answer', () => {
  for (const [userAgent, target] of [[iosSafari, 'ios'], [macSafari, 'mac']] as const) {
    const safariInstallation = safariInstallationTarget({ userAgent, standalone: false, maxTouchPoints: 0 });
    assert.equal(safariInstallation, target);
    for (const persistDenied of [false, true]) {
      assert.equal(storageNoticeShows({ persistDenied, dismissed: false, lastBackupAt: null, safariInstallation }), true);
      assert.equal(storageNoticeShows({ persistDenied, dismissed: true, lastBackupAt: null, safariInstallation }), false);
      assert.equal(storageNoticeShows({ persistDenied, dismissed: false, lastBackupAt: 123, safariInstallation }), false);
    }
  }
});

test('installed Safari and other browsers receive no Safari installation advice', () => {
  for (const userAgent of [iosSafari, macSafari]) {
    assert.equal(safariInstallationTarget({ userAgent, standalone: true, maxTouchPoints: 0 }), null);
  }
  for (const userAgent of [
    iosSafari.replace('Version/18.0', 'CriOS/130.0'),
    iosSafari.replace('Version/18.0', 'FxiOS/130.0'),
    macSafari.replace('Version/18.0', 'Chrome/130.0'),
    macSafari.replace('Version/18.0', 'Version/16.0'),
    'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0'
  ]) assert.equal(safariInstallationTarget({ userAgent, standalone: false, maxTouchPoints: 0 }), null);
  assert.equal(safariInstallationTarget({ userAgent: macSafari, standalone: false, maxTouchPoints: 5 }), 'ios');
  assert.equal(safariInstallationTarget({ userAgent: iosSafari.replace('Version/18.0', 'Version/16.4'), standalone: false, maxTouchPoints: 5 }), 'ios');
});

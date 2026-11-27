/* How old the last backup is, and when that becomes worth saying. Three screens read this -
   Home for its notice, Settings for the row, Export & import for the status line - so it
   lives here rather than as the same two lines derived three times.

   Apart from archive/backup.ts on purpose: this is arithmetic over one number, and Home
   would otherwise import the export paths, and through them the archive packer and
   Argon2id, to work out how many days ago something happened. */

import { epochDayFromTimestamp, todayEpochDay } from './epochDay';

/** Older than this and Home says so (F21). */
/* BACKUP_STALE_DAYS stays exported only for its own test. */
export const BACKUP_STALE_DAYS = 30;

/** How many local days ago the last export was, or null if there has never
    been one. `lastBackupAt` is epoch millis and this is a count of calendar
    days (ADR-0001), so the two are never the same number - the demo store
    stored one as the other and read a recent backup as decades old. */
export function backupAgeDays(lastBackupAt: number | null, today: number = todayEpochDay()): number | null {
  return lastBackupAt === null ? null : today - epochDayFromTimestamp(lastBackupAt);
}

export function backupIsStale(lastBackupAt: number | null, today: number = todayEpochDay()): boolean {
  const age = backupAgeDays(lastBackupAt, today);
  return age !== null && age > BACKUP_STALE_DAYS;
}

/** Which of three things Export & import's last-backup row says. Not stale is not the same
    as backed up: a journal never exported is not stale either, and the row drew its success
    tick for it beside "No export recorded on this device". */
export function backupStanding(
  lastBackupAt: number | null,
  today: number = todayEpochDay()
): 'never' | 'recent' | 'stale' {
  if (lastBackupAt === null) return 'never';
  return backupIsStale(lastBackupAt, today) ? 'stale' : 'recent';
}

/** Whether Home says that this browser may clear the journal. The browser refusing
    persistent storage is not news a person can act on by itself; what they can do is keep a
    backup elsewhere, so the notice is that ask, said once: it goes for good with the first
    backup or a dismissal. After that the stale-backup notice is the reminder, and two
    notices asking for one export would be one too many. Safari also offers installation
    advice independently of the persistence answer, with these same backup and dismissal
    gates. It replaced a toast that covered the Welcome screen's buttons for four seconds on
    every cold web load. */
export function storageNoticeShows(state: {
  persistDenied: boolean;
  dismissed: boolean;
  lastBackupAt: number | null;
  safariInstallation?: 'ios' | 'mac' | null;
}): boolean {
  return (state.persistDenied || !!state.safariInstallation) && !state.dismissed && state.lastBackupAt === null;
}

/** macOS first offers Add to Dock in Safari 17.
    iPad desktop mode identifies as Macintosh, but still uses Home Screen. */
export function safariInstallationTarget(environment: {
  userAgent: string;
  standalone: boolean;
  maxTouchPoints: number;
}): 'ios' | 'mac' | null {
  const { userAgent, standalone, maxTouchPoints } = environment;
  if (standalone || !/Safari\//.test(userAgent) || /Chrome|Chromium|CriOS|FxiOS|Edg|OPR|OPiOS/.test(userAgent)) return null;
  const version = /Version\/(\d+)/.exec(userAgent);
  if (!version) return null;
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  return /Macintosh/.test(userAgent) && Number(version[1]) >= 17 ? 'mac' : null;
}

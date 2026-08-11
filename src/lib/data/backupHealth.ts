/* How old the last backup is, and when that becomes worth saying (ticket
   15, PRD F21). Three screens read this - Home for its notice, Settings
   for the row, Export & import for the status line - so it lives here
   rather than as the same two lines derived three times.

   Apart from archive/backup.ts on purpose: this is arithmetic over one
   number, and Home would otherwise import the export paths, and through
   them the archive packer and Argon2id, to work out how many days ago
   something happened. */

import { epochDayFromTimestamp, todayEpochDay } from './epochDay';

/** Older than this and Home says so (F21). */
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

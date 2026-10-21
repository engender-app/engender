import type { Reminder } from '$lib/data/types';
import type { QuietHours } from '$lib/unprompted/quietHours';
import type { AndroidReminderSyncPayload, AndroidReminderTexts } from './android-bridge';

export function buildAndroidReminderPayload(input: {
  reminders: Reminder[];
  checkInEnabled: boolean;
  checkInTime: string;
  checkInPausedThrough: number | null;
  latestEntryEpochDay: number | null;
  hideNotificationTitles: boolean;
  quietHours: QuietHours;
  texts: AndroidReminderTexts;
}): AndroidReminderSyncPayload {
  return {
    reminders: input.reminders.map((reminder) => ({ ...reminder })),
    checkInEnabled: input.checkInEnabled,
    checkInTime: input.checkInTime,
    checkInPausedThrough: input.checkInPausedThrough,
    latestEntryEpochDay: input.latestEntryEpochDay,
    hideNotificationTitles: input.hideNotificationTitles,
    quietHours: { ...input.quietHours },
    texts: { ...input.texts }
  };
}

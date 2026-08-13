import type { Reminder } from '$lib/data/types';
import type { AndroidReminderSyncPayload, AndroidReminderTexts } from './android-bridge';

export function buildAndroidReminderPayload(input: {
  reminders: Reminder[];
  checkInEnabled: boolean;
  checkInTime: string;
  latestEntryEpochDay: number | null;
  hideNotificationTitles: boolean;
  texts: AndroidReminderTexts;
}): AndroidReminderSyncPayload {
  return {
    reminders: input.reminders.map((reminder) => ({ ...reminder })),
    checkInEnabled: input.checkInEnabled,
    checkInTime: input.checkInTime,
    latestEntryEpochDay: input.latestEntryEpochDay,
    hideNotificationTitles: input.hideNotificationTitles,
    texts: { ...input.texts }
  };
}
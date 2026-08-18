import type { Reminder } from '$lib/data/types';
import type { AndroidReminderSyncPayload, AndroidReminderTexts } from './android-bridge';

export function buildAndroidReminderPayload(input: {
  reminders: Reminder[];
  checkInEnabled: boolean;
  checkInTime: string;
  checkInAffirmations: string[];
  latestEntryEpochDay: number | null;
  hideNotificationTitles: boolean;
  texts: AndroidReminderTexts;
}): AndroidReminderSyncPayload {
  return {
    reminders: input.reminders.map((reminder) => ({ ...reminder })),
    checkInEnabled: input.checkInEnabled,
    checkInTime: input.checkInTime,
    checkInAffirmations: [...input.checkInAffirmations],
    latestEntryEpochDay: input.latestEntryEpochDay,
    hideNotificationTitles: input.hideNotificationTitles,
    texts: { ...input.texts }
  };
}
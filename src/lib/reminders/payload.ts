import type { Reminder } from '$lib/data/types';
import type { QuietHours } from '$lib/unprompted/quietHours';
import type { AndroidReminderSyncPayload, AndroidReminderTexts } from './android-bridge';

export function buildAndroidReminderPayload(input: {
  reminders: Reminder[];
  checkInEnabled: boolean;
  checkInTime: string;
  journalingPauses: Array<{ startEpochDay: number; endEpochDay: number | null }>;
  checkInAffirmations: string[];
  latestEntryEpochDay: number | null;
  hideNotificationTitles: boolean;
  quietHours: QuietHours;
  texts: AndroidReminderTexts;
}): AndroidReminderSyncPayload {
  return {
    reminders: input.reminders.map((reminder) => ({ ...reminder })),
    checkInEnabled: input.checkInEnabled,
    checkInTime: input.checkInTime,
    journalingPauses: input.journalingPauses.map((pause) => ({ ...pause })),
    checkInAffirmations: [...input.checkInAffirmations],
    latestEntryEpochDay: input.latestEntryEpochDay,
    hideNotificationTitles: input.hideNotificationTitles,
    quietHours: { ...input.quietHours },
    texts: { ...input.texts }
  };
}

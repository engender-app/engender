import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { Reminder } from '$lib/data/types';
import type { QuietHours } from '$lib/unprompted/quietHours';

export interface AndroidReminderTexts {
  channelReminders: string;
  channelCheckIn: string;
  checkInTitle: string;
  checkInBody: string;
}

export interface AndroidReminderSyncPayload {
  reminders: Reminder[];
  checkInEnabled: boolean;
  checkInTime: string;
  /** The affirmation pool the check-in notification draws its daily line
      from (phase 4 features ticket 22), already in the app's language.
      Empty when affirmations are turned off - the native side never sees
      the preference, only the pool. */
  checkInAffirmations: string[];
  latestEntryEpochDay: number | null;
  /** Reminder notifications drop the reminder's own title for a generic
      one when true (ticket 15). */
  hideNotificationTitles: boolean;
  /** The unprompted registry's one cross-class rule (phase 6 ticket 04). An
      alarm that would fire inside the window is scheduled at the end of it
      instead - held, never dropped - which QuietHours.java does, because the
      fire times themselves are computed natively before any WebView exists. */
  quietHours: QuietHours;
  texts: AndroidReminderTexts;
}

export interface AndroidReminderStatus {
  notifications: 'granted' | 'denied' | 'not-required';
  exactAlarms: 'granted' | 'denied' | 'not-required';
}

export interface AndroidRemindersBridge {
  sync(payload: AndroidReminderSyncPayload): Promise<void>;
  getStatus(): Promise<AndroidReminderStatus>;
  requestNotificationPermission(): Promise<AndroidReminderStatus>;
  requestExactAlarmPermission(): Promise<void>;
  openBatterySettings(): Promise<void>;
  consumeLaunchRoute(): Promise<{ route: string | null }>;
}

export const androidReminders = registerAndroidPlugin<AndroidRemindersBridge>(androidPluginOwners.reminders);
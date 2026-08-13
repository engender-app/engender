import { registerPlugin } from '@capacitor/core';
import type { Reminder } from '$lib/data/types';

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
  latestEntryEpochDay: number | null;
  /** Reminder notifications drop the reminder's own title for a generic
      one when true (ticket 15). */
  hideNotificationTitles: boolean;
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

export const androidReminders = registerPlugin<AndroidRemindersBridge>('Reminders');
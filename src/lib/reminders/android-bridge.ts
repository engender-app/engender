import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { Reminder } from '$lib/data/types';
import type { QuietHours } from '$lib/unprompted/quietHours';
import type { PendingDoseAction } from './doseActions';

export interface AndroidReminderTexts {
  channelReminders: string;
  channelCheckIn: string;
  checkInTitle: string;
  checkInBody: string;
  /** The five moods' names, worst first: what TalkBack says for each face
      on the check-in notification and the word under it (tester report 02,
      ticket 05). In the app's language rather than the phone's, like every
      other text here. */
  checkInMoods: string[];
  /** A medication reminder's two buttons (functional audit ticket 20).
      `doseDone` stands in for `doseTaken` while the app is disguised. */
  doseTaken: string;
  doseDone: string;
  doseSkip: string;
  /** What the notification says once a button was pressed: the answer is
      kept, and goes into the journal when it is next opened. */
  doseNoted: string;
}

export interface AndroidReminderSyncPayload {
  /** `title` is what the notification shows (for a medication reminder,
      what it reminds about) and `text` the line under it, time included
      (functional audit ticket 21). Absent `text`, the time stands alone. */
  reminders: Array<Reminder & { text?: string }>;
  checkInEnabled: boolean;
  checkInTime: string;
  /** The last day the check-in stays silent, or null (checkIn.ts). */
  checkInPausedThrough: number | null;
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
  /** 'unprotected' while a copy of the reminders written by an older version
      is still on the phone in the clear because locking it failed. Reminders
      are paused until a retry succeeds or the copy is erased. Absent on a
      build that predates the check. */
  storedCopy?: 'ok' | 'unprotected';
}

interface AndroidRemindersBridge {
  sync(payload: AndroidReminderSyncPayload): Promise<void>;
  getStatus(): Promise<AndroidReminderStatus>;
  requestNotificationPermission(): Promise<AndroidReminderStatus>;
  requestExactAlarmPermission(): Promise<void>;
  /** The app's notification settings screen, opened unconditionally - the
      way back from a refusal the OS has stopped offering a dialog for
      (phase 10 redesign ticket 31). */
  openNotificationSettings(): Promise<void>;
  openBatterySettings(): Promise<void>;
  /** Tries again to lock the old plaintext copy. Resolves either way; the
      status says whether it worked. */
  retryStoredCopy(): Promise<void>;
  /** Deletes the old plaintext copy. The reminders are rebuilt from the
      journal by the next sync. */
  eraseStoredCopy(): Promise<void>;
  consumeLaunchRoute(): Promise<{ route: string | null }>;
  /** Taken and Skip taps kept since the journal was last open. */
  pendingDoseActions(): Promise<{ actions: PendingDoseAction[] }>;
  /** Forgets the taps whose doses are written, and only those. */
  clearDoseActions(options: { ids: string[] }): Promise<void>;
}

export const androidReminders = registerAndroidPlugin<AndroidRemindersBridge>(androidPluginOwners.reminders);

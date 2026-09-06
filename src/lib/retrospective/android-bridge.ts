import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';

export interface AndroidRetrospectiveNotificationStatus {
  notifications: 'granted' | 'denied' | 'not-required';
}

interface AndroidRetrospectiveNotifyPayload {
  title: string;
  body: string;
  /** Sanitized and validated again on the Java side (ReminderScheduler.sanitizeLaunchRoute). */
  route: string;
  /** Localized Android notification channel name. */
  channelName: string;
}

interface AndroidRetrospectiveNotificationsBridge {
  getStatus(): Promise<AndroidRetrospectiveNotificationStatus>;
  requestNotificationPermission(): Promise<AndroidRetrospectiveNotificationStatus>;
  notifyWrapped(payload: AndroidRetrospectiveNotifyPayload): Promise<void>;
  notifyOnThisDay(payload: AndroidRetrospectiveNotifyPayload): Promise<void>;
}

export const androidRetrospectiveNotifications = registerAndroidPlugin<AndroidRetrospectiveNotificationsBridge>(
  androidPluginOwners.retrospectiveNotifications
);

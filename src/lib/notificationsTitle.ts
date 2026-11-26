/* On the web the notices screen holds in-app switches only, because a phone
   notification needs the Android app, so it is named for what it does there.
   Android keeps "Notices and notifications". */
import { m } from '$lib/paraglide/messages';
import { isAndroid } from '$lib/platform';

export function notificationsTitle(): string {
  return isAndroid() ? m.notif_title() : m.notif_title_web();
}

/** The toast that points back at that screen by name. */
export function noticeTurnedOffToast(): string {
  return isAndroid() ? m.notice_turned_off_toast() : m.notice_turned_off_toast_web();
}

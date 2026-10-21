/* Conceal notification details on outside surfaces while disguised.
   Native reminders apply the same rule before the WebView starts. */

interface NotificationText {
  title: string;
  body: string;
}

/** What a notification says, with the disguise applied. */
export function notificationText(
  plain: NotificationText,
  channelName: string,
  hideTitles: boolean
): NotificationText {
  return hideTitles ? { title: channelName, body: '' } : plain;
}

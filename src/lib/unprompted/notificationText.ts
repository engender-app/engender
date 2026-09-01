/* The disguise, as the registry's second cross-class rule (phase 6 ticket
   04). `hideNotificationTitles` has covered reminders and the check-in since
   ticket 15, applied natively in ReminderAlarmReceiver; the two retrospective
   notifications and the auto-export failure notice declared `disguised: true`
   in the registry and did nothing about it, which is the verification item
   the ideas file flagged and nobody had run.

   One rule, in one place, so the next producer cannot forget it: under the
   disguise a notification keeps its channel's own name and drops its body.
   The body is where each producer's revealing detail is - the reminder's own
   title, the day's affirmation, which stretch of the past is being handed
   back, what a backup was trying to write - while the channel name is
   already visible in the phone's own notification settings whether the app
   posts anything or not, so hiding it buys nothing and costs the person any
   way of telling one notification from another.

   Not a lock-screen check: the app cannot learn whether the screen is locked
   when a notification is posted, so the preference applies unconditionally
   rather than trusting a guess (ticket 15's reasoning, unchanged). */

export interface NotificationText {
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

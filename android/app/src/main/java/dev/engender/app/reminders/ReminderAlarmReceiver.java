package dev.engender.app.reminders;

import android.Manifest;
import android.app.Notification;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import dev.engender.app.R;
import dev.engender.app.launch.AppLaunch;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.ZonedDateTime;

public class ReminderAlarmReceiver extends BroadcastReceiver {

    /** Named because the privacy test has to find this notification again
        to read what it was posted with, and the reminder one beside it is
        found by its tag instead. */
    static final int CHECK_IN_NOTIFICATION_ID = 7999;

    @Override
    public void onReceive(Context context, Intent intent) {
        JSONObject payload = ReminderScheduler.loadPayload(context);
        if (payload == null) return;

        String kind = intent.getStringExtra(ReminderScheduler.EXTRA_KIND);
        if (ReminderScheduler.KIND_REMINDER.equals(kind)) {
            handleReminder(context, payload, intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID));
            return;
        }
        if (ReminderScheduler.KIND_CHECK_IN.equals(kind)) {
            handleCheckIn(context, payload);
        }
    }

    private void handleReminder(Context context, JSONObject payload, String reminderId) {
        if (reminderId == null || reminderId.isBlank()) return;

        JSONObject reminder = findReminder(payload.optJSONArray("reminders"), reminderId);
        if (reminder == null || !reminder.optBoolean("enabled", false)) return;

        postReminderNotification(context, payload, reminder);
        ReminderScheduler.scheduleOneReminder(context, payload, reminder, ZonedDateTime.now());
    }

    private void handleCheckIn(Context context, JSONObject payload) {
        ZonedDateTime now = ZonedDateTime.now();
        int today = (int) now.toLocalDate().toEpochDay();
        boolean skip = payload.optInt("latestEntryEpochDay", Integer.MIN_VALUE) == today;

        if (!skip) postCheckInNotification(context, payload, today);
        ReminderScheduler.scheduleCheckIn(context, payload, now);
    }

    private void postReminderNotification(Context context, JSONObject payload, JSONObject reminder) {
        if (!notificationsAllowed(context)) return;

        String title = resolveNotificationTitle(payload, reminder);
        String id = reminder.optString("id", "");
        String time = reminder.optString("time", "");

        String route = "/settings/reminders" + (id.isBlank() ? "" : "/" + id);
        Notification notification = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_REMINDERS)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(time)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            /* Audit finding F-05, corrected by a later audit pass:
               VISIBILITY_PRIVATE does not hide this title on a lock
               screen by itself. It only asks the OS to conceal a
               notification's content, and the OS only honours that where
               the lock screen itself is set to hide sensitive content -
               under Android's default "show all notification content", a
               private notification still shows title and text in full. What
               actually keeps a reminder's title off a locked phone's
               screen is hideNotificationTitles, which resolveNotificationTitle
               below applies unconditionally: it does not know whether the
               screen is locked, so it hides the title whether it is or not.
               This call is kept anyway, for the phones that do have
               concealment configured, and RetrospectiveNotificationsPlugin
               and AutoExportPlugin already make the same call. */
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(AppLaunch.openAppIntent(context, route, "reminder:" + id, 1))
            .build();

        NotificationManagerCompat.from(context).notify("reminder:" + id, 7000, notification);
    }

    private void postCheckInNotification(Context context, JSONObject payload, int epochDay) {
        if (!notificationsAllowed(context)) return;

        JSONObject texts = payload.optJSONObject("texts");
        String title = texts != null ? texts.optString("checkInTitle", "Daily check-in") : "Daily check-in";
        String body = texts != null ? texts.optString("checkInBody", "How are you today?") : "How are you today?";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_CHECK_IN)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // Same reason as the reminder above (F-05), and the affirmation
            // line this one can carry says what the app is for even when
            // the title does not.
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(AppLaunch.openAppIntent(context, "/entry/new/" + epochDay, "check-in", 13));

        String affirmation = resolveCheckInAffirmation(payload, epochDay);
        if (affirmation != null) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body + "\n" + affirmation));
        }

        NotificationManagerCompat.from(context).notify(CHECK_IN_NOTIFICATION_ID, builder.build());
    }

    /** The affirming line for this day, or null
        when the prompt stays plain: the pool arrives empty when the
        preference is off, and hideNotificationTitles suppresses the line the
        same way it hides reminder titles - an affirmation on a lock screen
        says what the app is for. Indexed by epoch day rather than any stored
        state, so the line rotates even across days the app is never
        opened. */
    static String resolveCheckInAffirmation(JSONObject payload, int epochDay) {
        if (payload.optBoolean("hideNotificationTitles", false)) return null;
        JSONArray pool = payload.optJSONArray("checkInAffirmations");
        if (pool == null || pool.length() == 0) return null;
        String line = pool.optString(epochDay % pool.length(), "");
        return line.isBlank() ? null : line;
    }

    /** The reminder's own title, unless hideNotificationTitles is
        on - then the channel name stands in for it. Not a lock-time check:
        the app cannot learn whether the screen is locked when an alarm
        fires, so the preference hides the title unconditionally rather than
        trusting a guess. */
    static String resolveNotificationTitle(JSONObject payload, JSONObject reminder) {
        JSONObject texts = payload.optJSONObject("texts");
        String fallbackTitle = texts != null ? texts.optString("channelReminders", "Reminders") : "Reminders";
        if (payload.optBoolean("hideNotificationTitles", false)) return fallbackTitle;
        return reminder.optString("title", fallbackTitle);
    }

    private JSONObject findReminder(JSONArray reminders, String reminderId) {
        if (reminders == null) return null;
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject reminder = reminders.optJSONObject(i);
            if (reminder == null) continue;
            if (reminderId.equals(reminder.optString("id", ""))) return reminder;
        }
        return null;
    }

    private boolean notificationsAllowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }
}
package dev.barankiewicz.genderdiary.reminders;

import android.Manifest;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import dev.barankiewicz.genderdiary.MainActivity;
import dev.barankiewicz.genderdiary.R;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.ZonedDateTime;

public class ReminderAlarmReceiver extends BroadcastReceiver {

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
        ReminderScheduler.scheduleOneReminder(context, reminder, ZonedDateTime.now());
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
            .setContentIntent(openAppIntent(context, route, "reminder:" + id, 1))
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
            .setContentIntent(openAppIntent(context, "/entry/new/" + epochDay, "check-in", 13));

        String affirmation = resolveCheckInAffirmation(payload, epochDay);
        if (affirmation != null) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body + "\n" + affirmation));
        }

        NotificationManagerCompat.from(context).notify(7999, builder.build());
    }

    /** The affirming line for this day (phase 4 features ticket 22), or null
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

    private PendingIntent openAppIntent(Context context, String route, String key, int requestCode) {
        Intent open = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(android.net.Uri.parse("genderdiary://open/" + android.net.Uri.encode(key)))
            .putExtra(ReminderScheduler.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            9000 + requestCode,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** The reminder's own title, unless hideNotificationTitles (ticket 15) is
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
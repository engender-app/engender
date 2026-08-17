package dev.barankiewicz.genderdiary.reminders;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.ZonedDateTime;

public final class ReminderScheduler {

    static final String PREFS = "gender-diary-reminders";
    private static final String KEY_PAYLOAD = "payload-v1";
    private static final String KEY_LAUNCH_ROUTE = "launch-route";

    static final String EXTRA_KIND = "kind";
    static final String EXTRA_REMINDER_ID = "reminderId";
    public static final String EXTRA_ROUTE = "gd_route";
    static final String KIND_REMINDER = "reminder";
    static final String KIND_CHECK_IN = "check-in";

    static final String CHANNEL_REMINDERS = "gd-reminders";
    static final String CHANNEL_CHECK_IN = "gd-check-in";

    private static final int REQUEST_REMINDER = 41;
    private static final int REQUEST_CHECK_IN = 42;

    private ReminderScheduler() {}

    static void saveAndSchedule(Context context, JSONObject payload) {
        JSONObject previous = loadPayload(context);
        cancelAll(context, previous);

        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PAYLOAD, payload.toString())
            .apply();

        scheduleAll(context, payload, ZonedDateTime.now());
    }

    static void rescheduleFromStore(Context context) {
        JSONObject payload = loadPayload(context);
        if (payload == null) return;
        cancelAll(context, payload);
        scheduleAll(context, payload, ZonedDateTime.now());
    }

    static JSONObject loadPayload(Context context) {
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PAYLOAD, null);
        if (raw == null || raw.isBlank()) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception ignored) {
            return null;
        }
    }

    static void scheduleOneReminder(Context context, JSONObject reminder, ZonedDateTime now) {
        ZonedDateTime fireAt = ReminderPlanner.nextReminder(reminder, now);
        if (fireAt == null) return;
        String reminderId = reminder.optString("id", "");
        if (reminderId.isBlank()) return;

        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REQUEST_REMINDER,
            reminderIntent(context, reminderId),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        schedule(context, pending, fireAt.toInstant().toEpochMilli());
    }

    static void scheduleCheckIn(Context context, JSONObject payload, ZonedDateTime now) {
        boolean enabled = payload.optBoolean("checkInEnabled", false);
        if (!enabled) return;

        String time = payload.optString("checkInTime", "21:00");
        int today = (int) now.toLocalDate().toEpochDay();
        int latestEntryEpochDay = payload.optInt("latestEntryEpochDay", Integer.MIN_VALUE);
        boolean todayHasEntry = latestEntryEpochDay == today;

        ZonedDateTime fireAt = ReminderPlanner.nextCheckIn(time, now, todayHasEntry);
        PendingIntent pending = PendingIntent.getBroadcast(
            context,
            REQUEST_CHECK_IN,
            checkInIntent(context),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        schedule(context, pending, fireAt.toInstant().toEpochMilli());
    }

    static void maybeOpenExactAlarmSettings(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return;
        Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
            .setData(Uri.parse("package:" + context.getPackageName()))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    public static void storeLaunchRoute(Context context, String route) {
        String sanitized = sanitizeLaunchRoute(route);
        if (sanitized == null) return;
        context
            .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LAUNCH_ROUTE, sanitized)
            .apply();
    }

    static String consumeLaunchRoute(Context context) {
        String route = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_LAUNCH_ROUTE, null);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY_LAUNCH_ROUTE).apply();
        return sanitizeLaunchRoute(route);
    }

    static String sanitizeLaunchRoute(String route) {
        if (route == null || route.isBlank() || route.charAt(0) != '/') return null;
        if (route.startsWith("//")) return null;
        if (route.startsWith("/settings/reminders")) {
            String suffix = route.substring("/settings/reminders".length());
            if (suffix.isEmpty()) return route;
            if (!suffix.startsWith("/")) return null;
            String reminderId = suffix.substring(1);
            return reminderId.isBlank() || reminderId.contains("/") ? null : route;
        }
        // Phase 4 features ticket 04: wrapped and on-this-day notifications
        // deep-link through this same allowlist, not a route-specific one of
        // their own - see RetrospectiveNotificationsPlugin.
        if (route.equals("/wrapped/week") || route.equals("/wrapped/month") || route.equals("/wrapped/year")) {
            return route;
        }
        if (route.equals("/on-this-day")) return route;
        if (route.startsWith("/on-this-day?lookback=")) {
            String lookback = route.substring("/on-this-day?lookback=".length());
            boolean known = "month".equals(lookback) || "sixMonths".equals(lookback) || "year".equals(lookback);
            return known ? route : null;
        }
        if (!route.startsWith("/entry/new/")) return null;
        String epochDay = route.substring("/entry/new/".length());
        if (epochDay.isBlank() || epochDay.contains("/")) return null;
        for (int i = 0; i < epochDay.length(); i++) {
            char c = epochDay.charAt(i);
            if (c < '0' || c > '9') return null;
        }
        return route;
    }

    private static void scheduleAll(Context context, JSONObject payload, ZonedDateTime now) {
        JSONArray reminders = payload.optJSONArray("reminders");
        if (reminders != null) {
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject reminder = reminders.optJSONObject(i);
                if (reminder != null) scheduleOneReminder(context, reminder, now);
            }
        }
        scheduleCheckIn(context, payload, now);
    }

    private static void cancelAll(Context context, JSONObject payload) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null || payload == null) return;

        JSONArray reminders = payload.optJSONArray("reminders");
        if (reminders != null) {
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject reminder = reminders.optJSONObject(i);
                if (reminder == null) continue;
                String reminderId = reminder.optString("id", "");
                if (reminderId.isBlank()) continue;
                PendingIntent pending = PendingIntent.getBroadcast(
                    context,
                    REQUEST_REMINDER,
                    reminderIntent(context, reminderId),
                    PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
                );
                if (pending != null) {
                    alarmManager.cancel(pending);
                    pending.cancel();
                }
            }
        }

        PendingIntent checkIn = PendingIntent.getBroadcast(
            context,
            REQUEST_CHECK_IN,
            checkInIntent(context),
            PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (checkIn != null) {
            alarmManager.cancel(checkIn);
            checkIn.cancel();
        }
    }

    private static Intent reminderIntent(Context context, String reminderId) {
        return new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.barankiewicz.genderdiary.REMINDER")
            .setData(Uri.parse("genderdiary://reminder/" + Uri.encode(reminderId)))
            .putExtra(EXTRA_KIND, KIND_REMINDER)
            .putExtra(EXTRA_REMINDER_ID, reminderId);
    }

    private static Intent checkInIntent(Context context) {
        return new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.barankiewicz.genderdiary.CHECK_IN")
            .setData(Uri.parse("genderdiary://check-in"))
            .putExtra(EXTRA_KIND, KIND_CHECK_IN);
    }

    private static void schedule(Context context, PendingIntent pending, long triggerAtMillis) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (alarmManager.canScheduleExactAlarms()) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending);
            } else {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending);
            }
            return;
        }
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending);
    }
}
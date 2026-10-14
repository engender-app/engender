package dev.engender.app.reminders;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

public final class ReminderScheduler {

    public static final String PREFS = "engender-reminders";
    private static final String KEY_LAUNCH_ROUTE = "launch-route";
    static final String PENDING_AT = "pendingAt";
    static final String BOOT_CATCH_UP = "bootCatchUp";
    static final String PENDING_DAY = "pendingDay";
    static final String PENDING_ZONE = "pendingZone";
    static final String DELIVERED_DAY = "deliveredDay";
    static final String DELIVERED_ZONE = "deliveredZone";
    static final String DELIVERED_AT = "deliveredAt";
    private static final long ZONE_REPEAT_WINDOW_MILLIS = 12 * 60 * 60 * 1000L;

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

    // The class monitor covers store reads through alarm replacement and wipe.
    // A receiver must not write an old payload over a concurrent journal sync.

    /**
     * The store is written before the old alarms are cancelled, so a wrap
     * that fails leaves the phone on the rules it already had rather than
     * on none. {@code RemindersPlugin.sync}
     * rejects, which {@code platform-sync.ts} logs and nothing shows the
     * person; what recovers it is the next sync, on the next focus.
     */
    static synchronized void saveAndSchedule(Context context, JSONObject payload) throws Exception {
        ZonedDateTime now = ZonedDateTime.now();
        saveAndSchedule(payload, now, () -> loadPayload(context),
            saved -> ReminderPayloadStore.write(context, saved),
            previous -> cancelAll(context, previous), saved -> scheduleAll(context, saved, now));
    }

    public static synchronized void rescheduleFromStore(Context context) {
        ZonedDateTime now = ZonedDateTime.now();
        rescheduleFromStore(context, now, false);
    }

    static synchronized void rescheduleAfterBoot(Context context) {
        rescheduleFromStore(context, ZonedDateTime.now(), true);
    }

    private static void rescheduleFromStore(Context context, ZonedDateTime now, boolean boot) {
        rescheduleFromStore(() -> loadPayload(context), now,
            saved -> ReminderPayloadStore.write(context, saved),
            payload -> cancelAll(context, payload), payload -> scheduleAll(context, payload, now), boot,
            (payload, reminder) -> ReminderAlarmReceiver.postReminderNotification(context, payload, reminder));
    }

    interface PayloadReader {
        JSONObject read() throws Exception;
    }

    interface PayloadWriter {
        void write(JSONObject payload) throws Exception;
    }

    static synchronized void saveAndSchedule(JSONObject payload, ZonedDateTime now, PayloadReader reader, PayloadWriter writer,
                                Consumer<JSONObject> cancel, Consumer<JSONObject> schedule) throws Exception {
        JSONObject previous = reader.read();
        ReminderPlanner.anchorLegacyWeeklyRules(payload, now);
        JSONArray reminders = payload.optJSONArray("reminders");
        if (reminders != null) {
            for (int i = 0; i < reminders.length(); i++) {
                JSONObject reminder = reminders.optJSONObject(i);
                if (reminder == null) continue;
                JSONObject old = findReminder(previous, reminder.optString("id", ""));
                if (old != null && sameRule(old, reminder)) {
                    for (String field : new String[] { DELIVERED_DAY, DELIVERED_ZONE, DELIVERED_AT }) {
                        if (old.has(field)) reminder.put(field, old.get(field));
                    }
                }
                boolean heldCatchUp = old != null && old.optBoolean(BOOT_CATCH_UP) && sameRule(old, reminder);
                reminder.remove(PENDING_AT);
                reminder.remove(BOOT_CATCH_UP);
                if (heldCatchUp) {
                    reminder.put(BOOT_CATCH_UP, true);
                    for (String field : new String[] { PENDING_DAY, PENDING_ZONE }) {
                        if (old.has(field)) reminder.put(field, old.get(field));
                    }
                }
                updatePending(reminder, payload, now);
            }
        }
        writer.write(payload);
        cancel.accept(previous);
        schedule.accept(payload);
    }

    /** Persist occurrence changes before replacing alarms or posting a caught-up notification. */
    static synchronized void rescheduleFromStore(PayloadReader reader, ZonedDateTime now, PayloadWriter writer,
                                    Consumer<JSONObject> cancel, Consumer<JSONObject> schedule) {
        rescheduleFromStore(reader, now, writer, cancel, schedule, false, (payload, reminder) -> {});
    }

    static synchronized void rescheduleFromStore(PayloadReader reader, ZonedDateTime now, PayloadWriter writer,
                                    Consumer<JSONObject> cancel, Consumer<JSONObject> schedule, boolean boot,
                                    BiConsumer<JSONObject, JSONObject> post) {
        JSONObject payload;
        List<JSONObject> missed = new ArrayList<>();
        try {
            payload = reader.read();
            if (payload == null) return;
            String before = payload.toString();
            ReminderPlanner.anchorLegacyWeeklyRules(payload, now);
            JSONArray reminders = payload.optJSONArray("reminders");
            if (reminders != null) {
                for (int i = 0; i < reminders.length(); i++) {
                    JSONObject reminder = reminders.optJSONObject(i);
                    if (reminder == null) continue;
                    boolean due = reminder.has(PENDING_AT)
                        && reminder.optLong(PENDING_AT) <= now.toInstant().toEpochMilli();
                    if (boot && due && reminder.optBoolean("enabled", false)) {
                        ZonedDateTime held = QuietHours.hold(now, payload.optJSONObject("quietHours"));
                        if (held.isAfter(now)) {
                            reminder.put(BOOT_CATCH_UP, true);
                            reminder.put(PENDING_AT, held.toInstant().toEpochMilli());
                            continue;
                        }
                        reminder.remove(BOOT_CATCH_UP);
                        if (!repeatsDailySlot(reminder, reminder.optLong(PENDING_DAY, Long.MIN_VALUE), now.getZone().getId(), now)) {
                            recordDelivery(reminder, now);
                            missed.add(reminder);
                        }
                    }
                    updatePending(reminder, payload, now);
                }
            }
            if (!before.equals(payload.toString())) writer.write(payload);
        } catch (Exception failedStore) {
            return;
        }
        cancel.accept(payload);
        for (JSONObject reminder : missed) post.accept(payload, reminder);
        schedule.accept(payload);
    }

    private static void updatePending(JSONObject reminder, JSONObject payload, ZonedDateTime now) throws Exception {
        boolean catchUp = reminder.optBoolean(BOOT_CATCH_UP) && reminder.optBoolean("enabled", false);
        ZonedDateTime occurrence = catchUp ? null
            : ReminderPlanner.nextReminderOccurrence(reminder, now, payload.optJSONObject("quietHours"));
        if (occurrence != null && repeatsDailySlot(reminder, occurrence.toLocalDate().toEpochDay(),
                now.getZone().getId(), QuietHours.hold(occurrence, payload.optJSONObject("quietHours")))) {
            occurrence = ReminderPlanner.nextReminderOccurrence(reminder,
                QuietHours.hold(occurrence, payload.optJSONObject("quietHours")), payload.optJSONObject("quietHours"));
        }
        ZonedDateTime next = catchUp ? QuietHours.hold(now, payload.optJSONObject("quietHours"))
            : occurrence == null ? null : QuietHours.hold(occurrence, payload.optJSONObject("quietHours"));
        if (next == null || reminder.optString("id", "").isBlank()) {
            reminder.remove(PENDING_AT);
            reminder.remove(PENDING_DAY);
            reminder.remove(PENDING_ZONE);
            reminder.remove(BOOT_CATCH_UP);
        } else {
            reminder.put(PENDING_AT, next.toInstant().toEpochMilli());
            if (!catchUp) {
                reminder.put(PENDING_DAY, occurrence.toLocalDate().toEpochDay());
                reminder.put(PENDING_ZONE, now.getZone().getId());
            }
        }
    }

    /** A daily slot is the reminder row, unchanged rule and original local date.
     * A changed zone cannot repeat that slot within 12 hours of its delivery.
     * History lives in the encrypted payload and is committed before posting. */
    private static boolean repeatsDailySlot(JSONObject reminder, long day, String zone, ZonedDateTime at) {
        long elapsed = at.toInstant().toEpochMilli() - reminder.optLong(DELIVERED_AT, Long.MIN_VALUE);
        return "DAILY".equals(reminder.optString("recurrence"))
            && reminder.has(DELIVERED_AT) && day == reminder.optLong(DELIVERED_DAY, Long.MIN_VALUE)
            && !zone.equals(reminder.optString(DELIVERED_ZONE))
            && elapsed >= 0 && elapsed < ZONE_REPEAT_WINDOW_MILLIS;
    }

    private static void recordDelivery(JSONObject reminder, ZonedDateTime now) throws Exception {
        if (!"DAILY".equals(reminder.optString("recurrence"))) return;
        reminder.put(DELIVERED_DAY, reminder.optLong(PENDING_DAY, now.toLocalDate().toEpochDay()));
        reminder.put(DELIVERED_ZONE, reminder.optString(PENDING_ZONE, now.getZone().getId()));
        reminder.put(DELIVERED_AT, now.toInstant().toEpochMilli());
    }

    private static boolean sameRule(JSONObject left, JSONObject right) {
        for (String field : new String[] { "enabled", "time", "recurrence", "interval", "anchorEpochDay", "epochDay" }) {
            if (!String.valueOf(left.opt(field)).equals(String.valueOf(right.opt(field)))) return false;
        }
        return true;
    }

    static JSONObject findReminder(JSONObject payload, String id) {
        JSONArray reminders = payload == null ? null : payload.optJSONArray("reminders");
        if (reminders == null || id == null || id.isBlank()) return null;
        for (int i = 0; i < reminders.length(); i++) {
            JSONObject reminder = reminders.optJSONObject(i);
            if (reminder != null && id.equals(reminder.optString("id", ""))) return reminder;
        }
        return null;
    }

    /** Consuming the occurrence must reach disk before its notification can be posted. */
    static synchronized void deliverReminder(Context context, JSONObject payload, JSONObject reminder, ZonedDateTime now) {
        deliverReminder(payload, reminder, now, saved -> ReminderPayloadStore.write(context, saved),
            row -> ReminderAlarmReceiver.postReminderNotification(context, payload, row),
            row -> scheduleOneReminder(context, payload, row, now));
    }

    static synchronized void deliverReminder(JSONObject payload, JSONObject reminder, ZonedDateTime now,
                                    PayloadWriter writer, Consumer<JSONObject> post, Consumer<JSONObject> schedule) {
        boolean repeat = repeatsDailySlot(reminder, reminder.optLong(PENDING_DAY, now.toLocalDate().toEpochDay()),
            now.getZone().getId(), now);
        try {
            if (!repeat) recordDelivery(reminder, now);
            reminder.remove(BOOT_CATCH_UP);
            updatePending(reminder, payload, now);
            writer.write(payload);
        } catch (Exception failedStore) {
            return;
        }
        if (!repeat) post.accept(reminder);
        schedule.accept(reminder);
    }

    /**
     * The reset path. Cancellation lives here, beside the
     * {@link #cancelAll} that {@code saveAndSchedule} already calls, rather
     * than in a second mechanism that would have to know the same request
     * codes and intent shapes to reach the same alarms.
     *
     * <p>Order matters: the payload is what names the alarms, so it is read
     * and used before the file holding it goes. Left the other way round, a
     * reset would drop the titles and leave the alarms, and
     * {@link ReminderAlarmReceiver} would keep waking on schedule to find
     * nothing to post - quiet, but still an alarm nobody can cancel from
     * inside the app.
     *
     * <p>{@code commit} rather than {@code apply}: the reset tells the
     * person it is done, and it should be done rather than queued.
     *
     * <p>One residual, bounded rather than fixed: a reminder alarm can only
     * be cancelled by name, so a payload that will not parse leaves its
     * reminder alarms scheduled. What they wake into is
     * {@link ReminderAlarmReceiver#onReceive}, which returns on a missing
     * payload without posting and without rescheduling - so each fires once
     * more, silently, and is then gone. The check-in alarm has no such
     * limit: it is cancelled by its fixed request code whatever the payload
     * says.
     */
    public static synchronized void wipe(Context context) throws Exception {
        cancelAll(context, loadPayload(context));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        /* After the file, and for the same reason AutoExportPlugin deletes
           its own alias: the ciphertext is only gone because the file went
           with it, and a key left behind is a key that opens a copy of that
           file taken before the reset. */
        ReminderPayloadStore.deleteKey();
    }

    static synchronized JSONObject loadPayload(Context context) {
        return ReminderPayloadStore.read(context);
    }

    static void scheduleOneReminder(Context context, JSONObject payload, JSONObject reminder, ZonedDateTime now) {
        if (!reminder.has(PENDING_AT)) return;
        ZonedDateTime fireAt = Instant.ofEpochMilli(reminder.optLong(PENDING_AT)).atZone(now.getZone());
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

    static void scheduleOneReminder(JSONObject payload, JSONObject reminder, ZonedDateTime now,
                                    Consumer<ZonedDateTime> scheduleAlarm) {
        ZonedDateTime fireAt = ReminderPlanner.nextReminder(reminder, now, payload.optJSONObject("quietHours"));
        if (fireAt == null) return;
        scheduleAlarm.accept(fireAt);
    }

    static void scheduleCheckIn(Context context, JSONObject payload, ZonedDateTime now) {
        scheduleCheckIn(payload, now, fireAt -> scheduleCheckInAt(context, fireAt));
    }

    static void scheduleCheckIn(JSONObject payload, ZonedDateTime now, Consumer<ZonedDateTime> scheduleAlarm) {
        ZonedDateTime fireAt = ReminderPlanner.nextCheckIn(payload, now);
        if (fireAt == null) return;
        scheduleAlarm.accept(fireAt);
    }

    static void scheduleCheckInAt(Context context, ZonedDateTime fireAt) {
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
            if (reminderId.isBlank()) return null;
            for (int i = 0; i < reminderId.length(); i++) {
                char c = reminderId.charAt(i);
                boolean ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-';
                if (!ok) return null;
            }
            return route;
        }
        // Wrapped and on-this-day notifications deep-link through this same
        // allowlist, not a route-specific one of their own - see
        // RetrospectiveNotificationsPlugin.
        if (route.equals("/wrapped/week") || route.equals("/wrapped/month") || route.equals("/wrapped/year")) {
            return route;
        }
        if (route.equals("/on-this-day")) return route;
        if (route.startsWith("/on-this-day?lookback=")) {
            String lookback = route.substring("/on-this-day?lookback=".length());
            boolean known = "month".equals(lookback) || "sixMonths".equals(lookback) || "year".equals(lookback);
            return known ? route : null;
        }
        // The quick-log widget's mood buttons: "today" rather than
        // a computed epoch day, so a PendingIntent built at widget-render time
        // still lands on the right day even if tapped much later - the [day]
        // route resolves "today" live, at navigation time, not at intent-build
        // time. One digit 1-5 only, matching MoodPicker's five mood values.
        if (route.startsWith("/entry/new/today?seedMood=")) {
            String mood = route.substring("/entry/new/today?seedMood=".length());
            return mood.length() == 1 && mood.charAt(0) >= '1' && mood.charAt(0) <= '5' ? route : null;
        }
        // The tally widget's two buttons: Home reads and clears
        // this query parameter itself (src/routes/+page.svelte) rather than
        // a route of the widget's own existing to hold.
        if (route.startsWith("/?tally=")) {
            String kind = route.substring("/?tally=".length());
            return "misgendered".equals(kind) || "correctly_gendered".equals(kind) ? route : null;
        }
        // The doubt-entry widget: the existing /doubt route
        // itself, already the composer plus counterevidence in one screen -
        // no query parameter to carry, unlike the tally widget above.
        if (route.equals("/doubt")) return route;
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
                if (reminder != null) scheduleOneReminder(context, payload, reminder, now);
            }
        }
        scheduleCheckIn(context, payload, now);
    }

    private static void cancelAll(Context context, JSONObject payload) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;

        /* A missing payload used to return here, taking the check-in alarm
           below with it - and that one needs no payload to name, only its
           fixed request code. The reset is where that matters: a reminders
           file that will not parse left a check-in alarm scheduled that
           nothing could reach afterwards. */
        JSONArray reminders = payload == null ? null : payload.optJSONArray("reminders");
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
            .setAction("dev.engender.app.REMINDER")
            .setData(Uri.parse("engender://reminder/" + Uri.encode(reminderId)))
            .putExtra(EXTRA_KIND, KIND_REMINDER)
            .putExtra(EXTRA_REMINDER_ID, reminderId);
    }

    private static Intent checkInIntent(Context context) {
        return new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.engender.app.CHECK_IN")
            .setData(Uri.parse("engender://check-in"))
            .putExtra(EXTRA_KIND, KIND_CHECK_IN);
    }

    private static void schedule(Context context, PendingIntent pending, long triggerAtMillis) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) return;
        schedule(Build.VERSION.SDK_INT >= Build.VERSION_CODES.S, alarmManager::canScheduleExactAlarms,
            () -> alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending),
            () -> alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMillis, pending));
    }

    static void schedule(boolean requiresPermission, BooleanSupplier canScheduleExact, Runnable exact, Runnable inexact) {
        if (!requiresPermission) {
            exact.run();
            return;
        }
        if (canScheduleExact.getAsBoolean()) {
            try {
                exact.run();
                return;
            } catch (SecurityException revoked) {
                // Permission can be revoked between the check and admission.
            }
        }
        inexact.run();
    }
}

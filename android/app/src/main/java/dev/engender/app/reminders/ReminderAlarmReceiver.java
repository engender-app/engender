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
import dev.engender.app.disguise.DisguiseAlias;
import dev.engender.app.launch.AppLaunch;

import org.json.JSONObject;

import java.time.ZonedDateTime;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.IntConsumer;

public class ReminderAlarmReceiver extends BroadcastReceiver {

    /** Named because the privacy test has to find this notification again
        to read what it was posted with, and the reminder one beside it is
        found by its tag instead. */
    static final int CHECK_IN_NOTIFICATION_ID = 7999;

    @Override
    public void onReceive(Context context, Intent intent) {
        // Wipe must wait until an already-read payload has finished posting and rescheduling.
        synchronized (ReminderScheduler.class) {
            JSONObject payload = ReminderScheduler.loadPayload(context);
            if (payload == null) return;

            String kind = intent.getStringExtra(ReminderScheduler.EXTRA_KIND);
            if (ReminderScheduler.KIND_REMINDER.equals(kind)) {
                handleReminder(context, payload, intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID));
                return;
            }
            if (ReminderScheduler.KIND_CHECK_IN.equals(kind)) {
                handleCheckIn(context, payload);
                return;
            }
            if (ReminderScheduler.KIND_DOSE_ACTION.equals(kind)) {
                handleDoseAction(context, payload, intent);
            }
        }
    }

    private void handleReminder(Context context, JSONObject payload, String reminderId) {
        if (reminderId == null || reminderId.isBlank()) return;

        JSONObject reminder = ReminderScheduler.findReminder(payload, reminderId);
        if (reminder == null || !reminder.optBoolean("enabled", false)) return;

        ReminderScheduler.deliverReminder(context, payload, reminder, ZonedDateTime.now());
    }

    private void handleCheckIn(Context context, JSONObject payload) {
        ZonedDateTime now = ZonedDateTime.now();
        handleCheckIn(payload, now,
            day -> postCheckInNotification(context, payload, day),
            fireAt -> ReminderScheduler.scheduleCheckInAt(context, fireAt));
    }

    /** The one rule for whether today still wants a check-in: today has no
        entry yet, check-ins are on and not paused through today. The alarm
        asks it, and so does CheckInFaces when it replaces or cancels faces
        that are already in the shade. */
    static boolean checkInDue(JSONObject payload, int today) {
        return payload.optInt("latestEntryEpochDay", Integer.MIN_VALUE) != today
            && ReminderPlanner.checkInAllowedOn(payload, today);
    }

    static void handleCheckIn(JSONObject payload, ZonedDateTime now,
                              IntConsumer postNotification, Consumer<ZonedDateTime> scheduleAlarm) {
        int today = (int) now.toLocalDate().toEpochDay();

        if (checkInDue(payload, today)) postNotification.accept(today);
        ReminderScheduler.scheduleCheckIn(payload, now, scheduleAlarm);
    }

    /** Where tapping the notification lands, once the app is unlocked. A
        medication reminder opens its drug's dose log with the add form open
        (functional audit ticket 20); the route carries the reminder's id
        only, and the app looks the drug up. Any other reminder opens its
        editor. */
    static String routeFor(JSONObject reminder) {
        String id = reminder.optString("id", "");
        if (isDoseReminder(reminder) && !id.isBlank()) return "/care/doses?add=1&reminder=" + id;
        return "/settings/reminders" + (id.isBlank() ? "" : "/" + id);
    }

    static boolean isDoseReminder(JSONObject reminder) {
        return !ReminderScheduler.drugOf(reminder).isEmpty();
    }

    /** Taken and Skip, kept until the journal is open (ReminderScheduler.
        recordDoseAction). The notification is then replaced by a quiet one
        that says where the answer went, and that goes by itself. */
    private void handleDoseAction(Context context, JSONObject payload, Intent intent) {
        String reminderId = intent.getStringExtra(ReminderScheduler.EXTRA_REMINDER_ID);
        String action = intent.getStringExtra(ReminderScheduler.EXTRA_DOSE_ACTION);
        long postedAt = intent.getLongExtra(ReminderScheduler.EXTRA_POSTED_AT, System.currentTimeMillis());
        if (reminderId == null || reminderId.isBlank()) return;

        boolean kept;
        try {
            kept = ReminderScheduler.recordDoseAction(context, UUID.randomUUID().toString(), reminderId, action,
                postedAt, System.currentTimeMillis(), intent.getStringExtra(ReminderScheduler.EXTRA_RULE),
                intent.hasExtra(ReminderScheduler.EXTRA_SLOT_DAY)
                    ? Long.valueOf(intent.getLongExtra(ReminderScheduler.EXTRA_SLOT_DAY, 0L)) : null);
        } catch (Exception failedStore) {
            kept = false;
        }
        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        JSONObject reminder = ReminderScheduler.findReminder(payload, reminderId);
        if (!kept || reminder == null || !notificationsAllowed(context)) {
            manager.cancel("reminder:" + reminderId, 7000);
            return;
        }
        JSONObject texts = payload.optJSONObject("texts");
        Notification noted = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_REMINDERS)
            .setSmallIcon(DisguiseAlias.isDisguised(context)
                    ? R.drawable.ic_launcher_disguised_foreground : R.drawable.ic_stat_mark)
            .setContentTitle(resolveNotificationTitle(payload, reminder))
            .setContentText(texts != null ? texts.optString("doseNoted", "Noted") : "Noted")
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(true)
            .setTimeoutAfter(8000)
            .addExtras(noted())
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(AppLaunch.openAppIntent(context, routeFor(reminder), "reminder:" + reminderId, 1))
            .build();
        manager.notify("reminder:" + reminderId, 7000, noted);
    }

    /** Marks the quiet "Noted" line a dose button leaves, so the sync can tell
        it from a reminder. Not the timeout: Android 17 gives every
        notification a default one. */
    static final String EXTRA_NOTED = "gd_dose_noted";

    private static android.os.Bundle noted() {
        android.os.Bundle extras = new android.os.Bundle();
        extras.putBoolean(EXTRA_NOTED, true);
        return extras;
    }

    static void postReminderNotification(Context context, JSONObject payload, JSONObject reminder) {
        postReminderNotification(context, payload, reminder, false);
    }

    /** {@code replacing} is a repost of one that was in the shade: it must
        not buzz, light the screen or heads-up a second time. */
    static void postReminderNotification(Context context, JSONObject payload, JSONObject reminder, boolean replacing) {
        if (!notificationsAllowed(context)) return;

        String title = resolveNotificationTitle(payload, reminder);
        String id = reminder.optString("id", "");
        String text = resolveNotificationText(payload, reminder);

        String route = routeFor(reminder);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_REMINDERS)
            .setSmallIcon(DisguiseAlias.isDisguised(context)
                    ? R.drawable.ic_launcher_disguised_foreground : R.drawable.ic_stat_mark)
            .setContentTitle(title)
            .setContentText(text)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setOnlyAlertOnce(replacing)
            .setSilent(replacing)
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
               concealment configured. AutoExportPlugin makes the same call. */
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(AppLaunch.openAppIntent(context, route, "reminder:" + id, 1));

        if (isDoseReminder(reminder) && !id.isBlank()) {
            /* Under disguise the first button says Done rather than Taken:
               a notification is one of the outside surfaces disguise still
               covers (functional audit spec, Disguise). */
            JSONObject texts = payload.optJSONObject("texts");
            String taken = texts == null ? "Taken"
                : texts.optString(DisguiseAlias.isDisguised(context) ? "doseDone" : "doseTaken", "Taken");
            String skip = texts == null ? "Skip" : texts.optString("doseSkip", "Skip");
            long postedAt = System.currentTimeMillis();
            String rule = ReminderScheduler.ruleOf(reminder);
            Long slotDay = ReminderScheduler.slotDayOf(reminder);
            builder.addAction(0, taken, ReminderScheduler.doseActionIntent(context, id, "taken", postedAt, rule, slotDay));
            builder.addAction(0, skip, ReminderScheduler.doseActionIntent(context, id, "skipped", postedAt, rule, slotDay));
        }

        NotificationManagerCompat.from(context).notify("reminder:" + id, 7000, builder.build());
    }

    static void postCheckInNotification(Context context, JSONObject payload, int epochDay) {
        if (!notificationsAllowed(context)) return;

        JSONObject texts = payload.optJSONObject("texts");
        String title = texts != null ? texts.optString("checkInTitle", "Daily check-in") : "Daily check-in";
        String body = texts != null ? texts.optString("checkInBody", "How are you today?") : "How are you today?";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_CHECK_IN)
            .setSmallIcon(DisguiseAlias.isDisguised(context)
                    ? R.drawable.ic_launcher_disguised_foreground : R.drawable.ic_stat_mark)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            // Same reason as the reminder above (F-05).
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setContentIntent(AppLaunch.openAppIntent(context, "/entry/new/" + epochDay, "check-in", 13));

        /* The five faces (tester report 02, ticket 05): the question
           moves into the header beside the app's name, and the faces take
           the body. setContentTitle and setContentText above stay, for
           whatever reads the notification rather than draws it. */
        if (CheckInFaces.show(payload, DisguiseAlias.isDisguised(context))) {
            builder.setSubText(body);
            CheckInFaces.apply(context, builder, payload, CHECK_IN_NOTIFICATION_ID);
        }

        NotificationManagerCompat.from(context).notify(CHECK_IN_NOTIFICATION_ID, builder.build());
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

    /** The line under the title: what the app wrote for this reminder
        (functional audit ticket 21), or the time alone. Hiding sensitive
        titles keeps only the time, since the app's line names the drug. */
    static String resolveNotificationText(JSONObject payload, JSONObject reminder) {
        String time = reminder.optString("time", "");
        if (payload.optBoolean("hideNotificationTitles", false)) return time;
        String text = reminder.optString("text", "");
        return text.isBlank() ? time : text;
    }

    private static boolean notificationsAllowed(Context context) {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }
}

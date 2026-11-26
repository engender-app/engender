package dev.engender.app.reminders;

import android.app.NotificationManager;
import android.content.Context;
import android.service.notification.StatusBarNotification;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import dev.engender.app.R;
import dev.engender.app.disguise.DisguiseAlias;
import dev.engender.app.launch.AppLaunch;

/**
 * Open today's entry with the selected mood, without writing it.
 * Use the same launch route as the widget, with AppLaunch's nonce,
 * allowlists and lock gate.
 *
 * <p>Each face sends a PendingIntent directly to the activity.
 * Android 12 blocks notification trampolines through receivers or
 * services. MainActivity dismisses the notification by ID on arrival.
 */
final class CheckInFaces {

    private CheckInFaces() {}

    private static final int[] FOLDED = {
        R.id.check_in_face_1, R.id.check_in_face_2, R.id.check_in_face_3,
        R.id.check_in_face_4, R.id.check_in_face_5
    };
    private static final int[] LABELS = {
        R.id.check_in_face_1_label, R.id.check_in_face_2_label, R.id.check_in_face_3_label,
        R.id.check_in_face_4_label, R.id.check_in_face_5_label
    };

    /** Faces say what the app is, so they show only where the notification
        may: never with "Hide sensitive titles" on, and never under
        disguise. Either way the notification stays the generic one. */
    static boolean show(JSONObject payload, boolean disguised) {
        return !disguised && !payload.optBoolean("hideNotificationTitles", false);
    }

    /** From Android 12 (API 31) the system draws no header line on a folded
        notification, so the question is set in the folded view; before it
        the header (setSubText) shows the question and a second line would
        repeat it. Seen on API 26 and API 36; 31 is where the header
        changed. */
    static boolean foldedShowsQuestion(int sdk) {
        return sdk >= 31;
    }

    /** The app's own words for "How are you today?", from the payload. */
    static String question(JSONObject texts) {
        return texts == null ? "How are you today?" : texts.optString("checkInBody", "How are you today?");
    }

    /** A posted check-in outlives what it was posted under. Faces still in
        the shade are cancelled when titles are hidden or disguise is on, and
        also when today no longer wants a check-in (an entry saved, check-ins
        off, a pause): a prompt for a day that is answered is wrong. Only
        when a check-in is still due, and titles are hidden, does the generic
        one take the faces' place, so the day's prompt is not lost. A generic
        check-in is left alone. Synchronized because the sync and the app
        coming forward both call it: scan, cancel and repost are one step.
        True when a replacement was posted. */
    static synchronized boolean reconcile(Context context, JSONObject payload) {
        boolean hidden = !show(payload, DisguiseAlias.isDisguised(context));
        int today = (int) java.time.LocalDate.now().toEpochDay();
        boolean due = ReminderAlarmReceiver.checkInDue(payload, today);
        if (due && !hidden) return false;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        boolean replaced = false;
        for (StatusBarNotification posted : manager.getActiveNotifications()) {
            if (posted.getId() == ReminderAlarmReceiver.CHECK_IN_NOTIFICATION_ID
                && posted.getNotification().contentView != null) {
                manager.cancel(posted.getId());
                if (due) {
                    ReminderAlarmReceiver.postCheckInNotification(context, payload, today);
                    replaced = true;
                }
            }
        }
        return replaced;
    }

    /** "today" rather than the day the alarm fired: the [day] route resolves
        it when the tap lands, so a face touched after midnight answers for
        the day it is touched on, as the widget's buttons do. */
    static String route(int mood) {
        return "/entry/new/today?seedMood=" + mood;
    }

    /** PendingIntents differ by request code and data, so each face needs
        its own of both, apart from the body tap's ("check-in", 13). */
    static String key(int mood) {
        return "check-in-mood-" + mood;
    }

    static int requestCode(int mood) {
        return 20 + mood;
    }

    /** The app's own names for the five moods, which the payload carries in
        the app's language. A payload written by an older build has none, and
        then the phone's own (the widget's string array) stand in. */
    static String[] names(JSONObject texts, String[] fallback) {
        JSONArray names = texts == null ? null : texts.optJSONArray("checkInMoods");
        if (names == null || names.length() != 5) return fallback;
        String[] out = new String[5];
        for (int i = 0; i < 5; i++) {
            String name = names.optString(i, "");
            if (name.isBlank()) return fallback;
            out[i] = name;
        }
        return out;
    }

    /** The folded and unfolded views, both wired the same way. */
    static void apply(Context context, NotificationCompat.Builder builder, JSONObject payload, int notificationId) {
        String[] names = names(payload.optJSONObject("texts"),
            context.getResources().getStringArray(R.array.widget_mood_names));
        RemoteViews folded = new RemoteViews(context.getPackageName(), R.layout.check_in_collapsed);
        RemoteViews unfolded = new RemoteViews(context.getPackageName(), R.layout.check_in_expanded);
        folded.setTextViewText(R.id.check_in_question, question(payload.optJSONObject("texts")));
        folded.setViewVisibility(R.id.check_in_question,
            foldedShowsQuestion(android.os.Build.VERSION.SDK_INT) ? android.view.View.VISIBLE : android.view.View.GONE);
        for (int i = 0; i < 5; i++) {
            int mood = i + 1;
            android.app.PendingIntent open = AppLaunch.openAppIntent(
                context, route(mood), key(mood), requestCode(mood), notificationId);
            folded.setOnClickPendingIntent(FOLDED[i], open);
            folded.setContentDescription(FOLDED[i], names[i]);
            unfolded.setOnClickPendingIntent(FOLDED[i], open);
            unfolded.setContentDescription(FOLDED[i], names[i]);
            unfolded.setTextViewText(LABELS[i], names[i]);
        }
        builder
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(folded)
            .setCustomBigContentView(unfolded)
            .setCustomHeadsUpContentView(folded);
    }
}

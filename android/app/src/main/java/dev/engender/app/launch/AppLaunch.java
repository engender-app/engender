package dev.engender.app.launch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import java.util.UUID;

import dev.engender.app.reminders.ReminderScheduler;

/**
 * Deep-link into an unlocked app route: a PendingIntent carrying the
 * destination as a route extra. Generalized out of ReminderAlarmReceiver's
 * own openAppIntent - MainActivity only ever stores the route
 * (ReminderScheduler. storeLaunchRoute); the JS side decides when it is safe
 * to navigate there, after app lock's own gate has cleared. So this helper
 * never bypasses app lock, it just queues where to land once it does.
 *
 * <p>The intent names {@link #OPEN_ROUTE} within this package rather than
 * MainActivity's class. Only the launcher aliases declare that action and
 * exactly one of them is enabled, so the tap starts the same alias the
 * launcher would, and Recents and the window title wear its label and icon:
 * Notes under disguise. Resolution happens when the tap lands, so a widget or
 * notification built before a disguise flip still opens the live alias.
 */
public final class AppLaunch {

    private AppLaunch() {}

    private static final String PREFS = "engender-launch-auth";
    private static final String KEY_NONCE = "nonce";
    private static final String EXTRA_NONCE = "gd_route_nonce";
    private static final String EXTRA_DISMISS = "gd_dismiss_notification";
    static final String OPEN_ROUTE = "dev.engender.app.action.OPEN_ROUTE";

    private static synchronized String nonce(Context context) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_NONCE, null);
        if (saved == null) {
            saved = UUID.randomUUID().toString();
            prefs.edit().putString(KEY_NONCE, saved).commit();
        }
        return saved;
    }

    /** Launcher aliases are exported; a route extra alone proves no origin. */
    public static String authenticatedRoute(Context context, Intent intent) {
        if (intent == null || !nonce(context).equals(intent.getStringExtra(EXTRA_NONCE))) return null;
        return intent.getStringExtra(ReminderScheduler.EXTRA_ROUTE);
    }

    static Intent routeIntent(Context context, String route, String key) {
        return new Intent(OPEN_ROUTE)
            .setPackage(context.getPackageName())
            .setData(Uri.parse("engender://open/" + Uri.encode(key)))
            .putExtra(ReminderScheduler.EXTRA_ROUTE, route)
            .putExtra(EXTRA_NONCE, nonce(context))
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    public static PendingIntent openAppIntent(Context context, String route, String key, int requestCode) {
        return PendingIntent.getActivity(
            context,
            9000 + requestCode,
            routeIntent(context, route, key),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** For a tap inside a notification's own layout, which autoCancel does not cover:
        autoCancel answers only the notification's content intent. The activity dismisses
        the notification when it arrives. */
    public static PendingIntent openAppIntent(Context context, String route, String key, int requestCode,
                                              int dismissNotificationId) {
        return PendingIntent.getActivity(
            context,
            9000 + requestCode,
            routeIntent(context, route, key).putExtra(EXTRA_DISMISS, dismissNotificationId),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** Dismisses the notification an authenticated launch names, and
        nothing for one that is not: a launcher alias is exported, so any app
        could otherwise clear this app's notifications by sending it an id. */
    public static void dismissNotification(Context context, Intent intent) {
        if (authenticatedRoute(context, intent) == null || !intent.hasExtra(EXTRA_DISMISS)) return;
        androidx.core.app.NotificationManagerCompat.from(context).cancel(intent.getIntExtra(EXTRA_DISMISS, 0));
    }
}

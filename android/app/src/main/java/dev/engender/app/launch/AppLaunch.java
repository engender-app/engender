package dev.engender.app.launch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import java.util.UUID;

import dev.engender.app.reminders.ReminderScheduler;

/**
 * Deep-link into an unlocked app route: a PendingIntent carrying the
 * destination as a route extra. Generalized out
 * of ReminderAlarmReceiver's own openAppIntent (tickets 26, 33, 34 all need
 * it) - MainActivity only ever stores the route (ReminderScheduler.
 * storeLaunchRoute); the JS side decides when it is safe to navigate there,
 * after app lock's own gate has cleared. So this helper never bypasses app
 * lock, it just queues where to land once it does.
 *
 * <p>The intent names {@link #OPEN_ROUTE} within this package rather than
 * MainActivity's class. Only the launcher aliases declare that action and
 * exactly one of them is enabled, so the tap starts the same alias the
 * launcher would, and Recents and the window title wear its label and icon:
 * Notes under disguise. Resolution happens when the tap lands, so a widget
 * or notification built before a disguise flip still opens the live alias
 * (last-audit UI 04).
 */
public final class AppLaunch {

    private AppLaunch() {}

    private static final String PREFS = "engender-launch-auth";
    private static final String KEY_NONCE = "nonce";
    private static final String EXTRA_NONCE = "gd_route_nonce";
    private static final String EXTRA_DISMISS = "gd_dismiss_notification";
    private static final String ONCE_PREFS = "engender-launch-once";
    private static final String EXTRA_ONCE = "gd_route_once";
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

    private static boolean ownNonce(Context context, Intent intent) {
        return intent != null && nonce(context).equals(intent.getStringExtra(EXTRA_NONCE));
    }

    /** Launcher aliases are exported; a route extra alone proves no origin.
        A single-use launch (openAppIntentOnce) also has to carry the
        current ticket for its key, and spends it: the same intent, or a
        copy a widget host kept, authenticates nothing a second time. */
    public static String authenticatedRoute(Context context, Intent intent) {
        if (!ownNonce(context, intent)) return null;
        String route = intent.getStringExtra(ReminderScheduler.EXTRA_ROUTE);
        String once = intent.getStringExtra(EXTRA_ONCE);
        if (once == null) {
            // A tally button built before tickets were single-use: refused, and
            // the widget is rebuilt with one (MainActivity.captureReminderRoute).
            return proposesWrite(route) ? null : route;
        }
        return spendOnceTicket(context, once) ? route : null;
    }

    /** Routes that may only arrive through a single-use launch. */
    public static boolean proposesWrite(String route) {
        return route != null && route.startsWith("/?tally=");
    }

    /** Whether this install built the launch, spent or not. */
    public static boolean isOwnLaunch(Context context, Intent intent) {
        return ownNonce(context, intent);
    }

    /** `key:ticket`, spent when it is the ticket currently issued for key. */
    private static synchronized boolean spendOnceTicket(Context context, String once) {
        int split = once.lastIndexOf(':');
        if (split <= 0) return false;
        String key = once.substring(0, split);
        android.content.SharedPreferences prefs = context.getSharedPreferences(ONCE_PREFS, Context.MODE_PRIVATE);
        String issued = prefs.getString(key, null);
        if (issued == null || !issued.equals(once.substring(split + 1))) return false;
        prefs.edit().remove(key).commit();
        return true;
    }

    /** The ticket currently issued for key, issuing one if none is. It
        changes only when a launch spends it, so every placed copy of a
        widget, rebuilt for any reason in between, carries the same one. */
    private static synchronized String onceTicket(Context context, String key) {
        android.content.SharedPreferences prefs = context.getSharedPreferences(ONCE_PREFS, Context.MODE_PRIVATE);
        String issued = prefs.getString(key, null);
        if (issued == null) {
            issued = UUID.randomUUID().toString();
            prefs.edit().putString(key, issued).commit();
        }
        return issued;
    }

    static Intent onceIntent(Context context, String route, String key) {
        String ticket = onceTicket(context, key);
        // The ticket is in the data too, so each one is its own PendingIntent
        // rather than an update of the spent one a host may still hold.
        return routeIntent(context, route, key)
            .setData(Uri.parse("engender://open/" + Uri.encode(key) + "/" + ticket))
            .putExtra(EXTRA_ONCE, key + ":" + ticket);
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

    /** A launch that writes when the person accepts it, such as a tally
        widget button (security scan GD-011). The page still asks before it
        writes; this is the second limit: the PendingIntent is spent by its
        first use (FLAG_ONE_SHOT), and its ticket by the first launch that
        carries it, so a widget host replaying a button it was handed opens
        nothing a second time. The caller rebuilds its views after a spend
        so the next tap has a fresh ticket. */
    public static PendingIntent openAppIntentOnce(Context context, String route, String key, int requestCode) {
        return PendingIntent.getActivity(
            context,
            9000 + requestCode,
            onceIntent(context, route, key),
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    /** For a tap inside a notification's own layout, which autoCancel does
        not cover: autoCancel answers only the notification's content
        intent. The activity dismisses the notification when it arrives
        (the check-in's faces, tester report 02 ticket 05). */
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
        if (!ownNonce(context, intent) || !intent.hasExtra(EXTRA_DISMISS)) return;
        androidx.core.app.NotificationManagerCompat.from(context).cancel(intent.getIntExtra(EXTRA_DISMISS, 0));
    }
}

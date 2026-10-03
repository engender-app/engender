package dev.engender.app.launch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import java.util.UUID;

import dev.engender.app.MainActivity;
import dev.engender.app.reminders.ReminderScheduler;

/**
 * Deep-link into an unlocked app route: an ACTION_VIEW PendingIntent at
 * MainActivity carrying the destination as a route extra. Generalized out
 * of ReminderAlarmReceiver's own openAppIntent (tickets 26, 33, 34 all need
 * it) - MainActivity only ever stores the route (ReminderScheduler.
 * storeLaunchRoute); the JS side decides when it is safe to navigate there,
 * after app lock's own gate has cleared. So this helper never bypasses app
 * lock, it just queues where to land once it does.
 */
public final class AppLaunch {

    private AppLaunch() {}

    private static final String PREFS = "engender-launch-auth";
    private static final String KEY_NONCE = "nonce";
    private static final String EXTRA_NONCE = "gd_route_nonce";

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
        return new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
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
}

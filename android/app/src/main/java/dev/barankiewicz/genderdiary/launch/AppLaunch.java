package dev.barankiewicz.genderdiary.launch;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import dev.barankiewicz.genderdiary.MainActivity;
import dev.barankiewicz.genderdiary.reminders.ReminderScheduler;

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

    public static PendingIntent openAppIntent(Context context, String route, String key, int requestCode) {
        Intent open = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("genderdiary://open/" + Uri.encode(key)))
            .putExtra(ReminderScheduler.EXTRA_ROUTE, route)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(
            context,
            9000 + requestCode,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}

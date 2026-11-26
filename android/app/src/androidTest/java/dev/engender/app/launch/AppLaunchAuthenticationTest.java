package dev.engender.app.launch;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.notification.StatusBarNotification;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import dev.engender.app.MainActivity;
import dev.engender.app.reminders.ReminderScheduler;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppLaunchAuthenticationTest {
    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    @Test
    public void routesWithoutThisInstallNonceAreRejected() {
        Intent foreign = new Intent().putExtra(ReminderScheduler.EXTRA_ROUTE, "/entry/new/today?seedMood=3");
        assertNull(AppLaunch.authenticatedRoute(context, foreign));
        foreign.putExtra("gd_route_nonce", "another-install");
        assertNull(AppLaunch.authenticatedRoute(context, foreign));
    }

    @Test
    public void appRoutesAuthenticateAcrossContextInstances() {
        Intent own = AppLaunch.routeIntent(context, "/entry/new/today?seedMood=3", "widget-quick-log");
        assertEquals("/entry/new/today?seedMood=3", AppLaunch.authenticatedRoute(context, own));
        assertEquals("/entry/new/today?seedMood=3", AppLaunch.authenticatedRoute(context.getApplicationContext(), own));
        own.putExtra("gd_route_nonce", "wrong-nonce");
        assertNull(AppLaunch.authenticatedRoute(context, own));
    }

    @Test
    public void exportedLauncherDoesNotStoreAnUnauthenticatedRoute() {
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE)
            .edit().remove("launch-route").commit();
        Intent foreign = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName())
            .putExtra(ReminderScheduler.EXTRA_ROUTE, "/entry/new/today?seedMood=3")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(foreign)) {
            scenario.onActivity(activity -> assertNull(context
                .getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE)
                .getString("launch-route", null)));
        }
    }

    /* The check-in's faces (tester report 02, ticket 05) sit in the
       notification's own layout, where autoCancel does not reach, so the
       activity dismisses the notification the launch names - but only for
       a launch this install built. */
    private static final int DISMISS_TEST_ID = 7990;

    @Test
    public void anAuthenticatedLaunchDismissesTheNotificationItNames() throws Exception {
        postDismissTestNotification();
        Intent own = AppLaunch.routeIntent(context, "/entry/new/today?seedMood=3", "check-in-mood-3")
            .putExtra("gd_dismiss_notification", DISMISS_TEST_ID);
        AppLaunch.dismissNotification(context, own);
        assertTrue("the notification survived its own face's launch", awaitGone(DISMISS_TEST_ID));
    }

    @Test
    public void aForeignLaunchCannotDismissANotification() throws Exception {
        postDismissTestNotification();
        Intent foreign = new Intent()
            .putExtra(ReminderScheduler.EXTRA_ROUTE, "/entry/new/today?seedMood=3")
            .putExtra("gd_dismiss_notification", DISMISS_TEST_ID);
        AppLaunch.dismissNotification(context, foreign);
        foreign.putExtra("gd_route_nonce", "another-install");
        AppLaunch.dismissNotification(context, foreign);
        Thread.sleep(300);
        assertTrue("a launch without this install's nonce dismissed a notification", posted(DISMISS_TEST_ID));
        notifications().cancel(DISMISS_TEST_ID);
    }

    @Test
    public void eachFaceIsItsOwnActivityIntent() {
        PendingIntent three = AppLaunch.openAppIntent(context, "/entry/new/today?seedMood=3", "check-in-mood-3", 23, 1);
        PendingIntent four = AppLaunch.openAppIntent(context, "/entry/new/today?seedMood=4", "check-in-mood-4", 24, 1);
        assertNotEquals(three, four);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12 refuses a notification trampoline; a face must start the activity itself.
            assertTrue(three.isActivity());
        }
        three.cancel();
        four.cancel();
    }

    private void postDismissTestNotification() throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                .grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        notifications().createNotificationChannel(
            new NotificationChannel("gd-dismiss-test", "Test", NotificationManager.IMPORTANCE_LOW));
        notifications().notify(DISMISS_TEST_ID, new Notification.Builder(context, "gd-dismiss-test")
            .setSmallIcon(dev.engender.app.R.drawable.ic_stat_mark)
            .setContentTitle("Test")
            .build());
        long deadline = System.nanoTime() + 5_000_000_000L;
        while (!posted(DISMISS_TEST_ID) && System.nanoTime() < deadline) Thread.sleep(50);
        assertTrue("the test notification was never posted", posted(DISMISS_TEST_ID));
    }

    private boolean awaitGone(int id) throws InterruptedException {
        long deadline = System.nanoTime() + 5_000_000_000L;
        while (posted(id) && System.nanoTime() < deadline) Thread.sleep(50);
        return !posted(id);
    }

    private boolean posted(int id) {
        for (StatusBarNotification sbn : notifications().getActiveNotifications()) {
            if (sbn.getId() == id) return true;
        }
        return false;
    }

    private NotificationManager notifications() {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }
}

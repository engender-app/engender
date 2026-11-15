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
        Intent foreign = new Intent().putExtra(ReminderScheduler.EXTRA_ROUTE, "/?tally=misgendered");
        assertNull(AppLaunch.authenticatedRoute(context, foreign));
        foreign.putExtra("gd_route_nonce", "another-install");
        assertNull(AppLaunch.authenticatedRoute(context, foreign));
    }

    @Test
    public void appRoutesAuthenticateAcrossContextInstances() {
        Intent own = AppLaunch.routeIntent(context, "/doubt", "doubt");
        assertEquals("/doubt", AppLaunch.authenticatedRoute(context, own));
        assertEquals("/doubt", AppLaunch.authenticatedRoute(context.getApplicationContext(), own));
        own.putExtra("gd_route_nonce", "wrong-nonce");
        assertNull(AppLaunch.authenticatedRoute(context, own));
    }

    /* The tally widget's buttons (security scan GD-011): a host that keeps a
       button it was handed, or the intent it carries, gets one launch out of
       it, and the next ticket is a different PendingIntent. */
    @Test
    public void aSingleUseLaunchAuthenticatesOnce() {
        Intent own = AppLaunch.onceIntent(context, "/?tally=misgendered", "widget-tally-test");
        Intent kept = new Intent(own);
        assertEquals("/?tally=misgendered", AppLaunch.authenticatedRoute(context, own));
        assertNull("the same launch authenticated twice", AppLaunch.authenticatedRoute(context, own));
        assertNull("a kept copy authenticated after the spend", AppLaunch.authenticatedRoute(context, kept));
        Intent next = AppLaunch.onceIntent(context, "/?tally=misgendered", "widget-tally-test");
        assertNotEquals(own.getData(), next.getData());
        assertEquals("/?tally=misgendered", AppLaunch.authenticatedRoute(context, next));
    }

    @Test
    public void aTallyRouteWithoutASingleUseTicketIsRefused() {
        Intent reusable = AppLaunch.routeIntent(context, "/?tally=misgendered", "widget-tally-misgendered");
        assertNull(AppLaunch.authenticatedRoute(context, reusable));
    }

    @Test
    public void aWidgetButtonIsSpentByItsFirstSend() throws Exception {
        String key = "widget-tally-send-test";
        PendingIntent button = AppLaunch.openAppIntentOnce(context, "/?tally=misgendered", key, 299);
        android.content.SharedPreferences tickets = context.getSharedPreferences("engender-launch-once", Context.MODE_PRIVATE);
        assertTrue(tickets.contains(key));
        button.send();
        long deadline = System.nanoTime() + 20_000_000_000L;
        while (tickets.contains(key) && System.nanoTime() < deadline) Thread.sleep(100);
        assertTrue("the launch never spent its ticket", !tickets.contains(key));
        try {
            button.send();
            throw new AssertionError("a spent widget button launched again");
        } catch (PendingIntent.CanceledException expected) {
            // FLAG_ONE_SHOT: the host's copy is dead after one use.
        }
    }

    @Test
    public void exportedLauncherDoesNotStoreAnUnauthenticatedTallyRoute() {
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE)
            .edit().remove("launch-route").commit();
        Intent foreign = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName())
            .putExtra(ReminderScheduler.EXTRA_ROUTE, "/?tally=misgendered")
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

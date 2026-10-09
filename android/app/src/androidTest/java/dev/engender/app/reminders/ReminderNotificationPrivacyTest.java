package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertThrows;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.content.Intent;
import android.service.notification.StatusBarNotification;
import android.os.Build;

import dev.engender.app.reset.DeviceStores;
import dev.engender.app.lock.LockTimingPlugin;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The notification hideNotificationTitles actually produces, on a device,
 * through the real NotificationManager, rather than the string
 * ReminderAlarmReceiverTest.resolveNotificationTitle predicts one would. A
 * locked device shows exactly what NotificationManager was handed, so this
 * is the closest a test gets to the lock screen itself without one.
 */
@RunWith(AndroidJUnit4.class)
public class ReminderNotificationPrivacyTest {

    private static final String REMINDER_ID = "r-1";
    private static final String SENSITIVE_TITLE = "Estradiol patch";
    private static final String CHANNEL_NAME = "Reminders";

    private Context context;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            InstrumentationRegistry.getInstrumentation()
                .getUiAutomation()
                .grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        }
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        notificationManager().cancelAll();
        // RemindersPlugin.ensureChannels does this from the JS sync path;
        // this test drives ReminderAlarmReceiver directly, so the channel
        // has to exist by some other means or the notification is silently
        // dropped for having none.
        notificationManager().createNotificationChannel(new NotificationChannel(
            ReminderScheduler.CHANNEL_REMINDERS, CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH));
        notificationManager().createNotificationChannel(new NotificationChannel(
            ReminderScheduler.CHANNEL_CHECK_IN, "Check-in", NotificationManager.IMPORTANCE_HIGH));
    }

    @After
    public void tearDown() {
        notificationManager().cancelAll();
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test
    public void hidingTitlesKeepsTheReminderNameOffTheNotification() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(true));

        fireReminderAlarm();

        Notification notification = findNotification();
        assertNotNull("no notification was posted", notification);
        assertEquals(CHANNEL_NAME, notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    }

    @Test
    public void byDefaultTheReminderNameShows() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(false));

        fireReminderAlarm();

        Notification notification = findNotification();
        assertNotNull("no notification was posted", notification);
        assertEquals(SENSITIVE_TITLE, notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    }

    /* Audit finding F-05, corrected by a later audit pass. hideNotificationTitles
       above is about the shade, where the OS shows everything whatever the
       app asks for. The two tests below assert that VISIBILITY_PRIVATE is
       set on the notification, not that a locked screen is actually empty -
       see the comment beside .setVisibility in ReminderAlarmReceiver.java
       for what that flag does and does not buy, and for the field that
       hides a title on every default lock screen unconditionally. */

    @Test
    public void reminderNotificationsAreHiddenOnALockedScreen() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(false));

        fireReminderAlarm();

        Notification notification = findNotification();
        assertNotNull("no notification was posted", notification);
        assertEquals(Notification.VISIBILITY_PRIVATE, notification.visibility);
    }

    @Test
    public void checkInNotificationsAreHiddenOnALockedScreen() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());

        fireCheckInAlarm();

        Notification notification = findCheckInNotification();
        assertNotNull("no check-in notification was posted", notification);
        assertEquals(Notification.VISIBILITY_PRIVATE, notification.visibility);
    }

    @Test
    public void disguisedNotificationsUseTheNotesIcon() throws Exception {
        dev.engender.app.disguise.DisguiseAlias.apply(context, true, "trans", "current");
        try {
            ReminderScheduler.saveAndSchedule(context, payload(true));
            fireReminderAlarm();
            Notification notification = findNotification();
            assertNotNull("no reminder notification was posted", notification);
            assertEquals(dev.engender.app.R.drawable.ic_launcher_disguised_foreground,
                notification.getSmallIcon().getResId());
        } finally {
            dev.engender.app.disguise.DisguiseAlias.apply(context, false, "trans", "current");
        }
    }

    @Test
    public void resetRemovesPostedTitlesAndAffirmations() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireReminderAlarm();
        fireCheckInAlarm();
        Notification reminder = findNotification();
        Notification checkIn = findCheckInNotification();
        assertNotNull("no reminder was posted", reminder);
        assertNotNull("no check-in was posted", checkIn);
        assertEquals(SENSITIVE_TITLE, reminder.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertTrue(checkIn.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
            .contains("You are allowed to take up space"));

        DeviceStores.wipe(context);

        assertNoActiveNotifications();
        fireReminderAlarm();
        fireCheckInAlarm();
        assertNoActiveNotifications();
    }

    @Test
    public void failedReminderCleanupStillClearsOtherOwnersAndNotifications() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(false));
        fireReminderAlarm();
        assertNotNull(findNotification());
        context.getSharedPreferences(LockTimingPlugin.PREFS, Context.MODE_PRIVATE)
            .edit().putString("timing", "immediately").commit();
        Context failingReminders = new ContextWrapper(context) {
            @Override
            public SharedPreferences getSharedPreferences(String name, int mode) {
                if (ReminderScheduler.PREFS.equals(name)) throw new IllegalStateException("reminder cleanup failed");
                return super.getSharedPreferences(name, mode);
            }
        };

        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> DeviceStores.wipe(failingReminders));

        assertEquals("reminder cleanup failed", failure.getMessage());
        assertTrue(context.getSharedPreferences(LockTimingPlugin.PREFS, Context.MODE_PRIVATE).getAll().isEmpty());
        assertNoActiveNotifications();
    }

    @Test
    public void resetWaitsForDeliveryThenRemovesItsNotification() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(false));
        CountDownLatch beforePost = new CountDownLatch(1);
        CountDownLatch releasePost = new CountDownLatch(1);
        CountDownLatch resetStarted = new CountDownLatch(1);
        AtomicBoolean held = new AtomicBoolean();
        AtomicBoolean resetReadPayload = new AtomicBoolean();
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Context delayed = new ContextWrapper(context) {
            @Override
            public Object getSystemService(String name) {
                if (Context.NOTIFICATION_SERVICE.equals(name) && held.compareAndSet(false, true)) {
                    beforePost.countDown();
                    try {
                        if (!releasePost.await(5, TimeUnit.SECONDS)) throw new AssertionError("delivery was not released");
                    } catch (InterruptedException e) {
                        throw new AssertionError(e);
                    }
                }
                return super.getSystemService(name);
            }
        };
        Thread delivery = new Thread(() -> {
            try {
                new ReminderAlarmReceiver().onReceive(delayed, new Intent()
                    .putExtra(ReminderScheduler.EXTRA_KIND, ReminderScheduler.KIND_REMINDER)
                    .putExtra(ReminderScheduler.EXTRA_REMINDER_ID, REMINDER_ID));
            } catch (Throwable error) { failure.set(error); }
        });
        Context observedReset = new ContextWrapper(context) {
            @Override
            public SharedPreferences getSharedPreferences(String name, int mode) {
                if (ReminderScheduler.PREFS.equals(name)) resetReadPayload.set(true);
                return super.getSharedPreferences(name, mode);
            }
        };
        Thread reset = new Thread(() -> {
            try {
                resetStarted.countDown();
                DeviceStores.wipe(observedReset);
            } catch (Throwable error) { failure.set(error); }
        });

        delivery.start();
        try {
            assertTrue("delivery never reached NotificationManager", beforePost.await(5, TimeUnit.SECONDS));
            reset.start();
            assertTrue(resetStarted.await(5, TimeUnit.SECONDS));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (!resetReadPayload.get() && reset.isAlive() && reset.getState() != Thread.State.BLOCKED
                && System.nanoTime() < deadline) {
                Thread.yield();
            }
            assertFalse("reset entered the reminder owner while delivery still held its payload", resetReadPayload.get());
            assertEquals("reset must wait for the payload already being delivered", Thread.State.BLOCKED, reset.getState());
        } finally {
            releasePost.countDown();
            delivery.join(5000);
            reset.join(5000);
        }
        assertFalse(delivery.isAlive());
        assertFalse(reset.isAlive());
        assertNull(failure.get());
        assertNoActiveNotifications();
    }

    private void assertNoActiveNotifications() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (notificationManager().getActiveNotifications().length > 0 && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        assertEquals("a notification survived the reset", 0, notificationManager().getActiveNotifications().length);
    }

    private JSONObject checkInPayload() throws Exception {
        return payload(false)
            .put("checkInEnabled", true)
            .put("checkInAffirmations", new JSONArray().put("You are allowed to take up space"));
    }

    private void fireCheckInAlarm() {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .putExtra(ReminderScheduler.EXTRA_KIND, ReminderScheduler.KIND_CHECK_IN);
        new ReminderAlarmReceiver().onReceive(context, intent);
    }

    private Notification findCheckInNotification() throws InterruptedException {
        return await(() -> {
            for (StatusBarNotification sbn : notificationManager().getActiveNotifications()) {
                if (sbn.getId() == ReminderAlarmReceiver.CHECK_IN_NOTIFICATION_ID) return sbn.getNotification();
            }
            return null;
        });
    }

    private JSONObject payload(boolean hideNotificationTitles) throws Exception {
        return new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", REMINDER_ID)
                .put("title", SENSITIVE_TITLE)
                .put("type", "med")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", false)
            .put("checkInTime", "21:00")
            .put("hideNotificationTitles", hideNotificationTitles)
            .put("latestEntryEpochDay", JSONObject.NULL)
            .put("texts", new JSONObject()
                .put("channelReminders", CHANNEL_NAME)
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));
    }

    private void fireReminderAlarm() {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .putExtra(ReminderScheduler.EXTRA_KIND, ReminderScheduler.KIND_REMINDER)
            .putExtra(ReminderScheduler.EXTRA_REMINDER_ID, REMINDER_ID);
        new ReminderAlarmReceiver().onReceive(context, intent);
    }

    private Notification findNotification() throws InterruptedException {
        return await(() -> {
            for (StatusBarNotification sbn : notificationManager().getActiveNotifications()) {
                if (("reminder:" + REMINDER_ID).equals(sbn.getTag())) return sbn.getNotification();
            }
            return null;
        });
    }

    /** Posting is a call across to the system's notification service, so a
        read taken the instant onReceive returns can beat it there. On the
        Pixel it does, roughly one batch run in two; on an emulator it never
        seemed to. Polling rather than sleeping a fixed span, so the usual
        case stays as fast as it was. */
    private static Notification await(java.util.concurrent.Callable<Notification> lookFor)
        throws InterruptedException {
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while (true) {
            Notification found;
            try {
                found = lookFor.call();
            } catch (Exception e) {
                throw new AssertionError("reading the posted notifications threw", e);
            }
            if (found != null) return found;
            if (System.nanoTime() > deadline) return null;
            Thread.sleep(50);
        }
    }

    private NotificationManager notificationManager() {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }
}

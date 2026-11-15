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

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
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

    /* The check-in's five faces (tester report 02, ticket 05). A
       notification built with custom views carries them in contentView and
       bigContentView; the generic one carries neither and lets the system
       draw its title and text. */
    @Test
    public void checkInShowsTheFacesWithTitlesShown() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());

        fireCheckInAlarm();

        Notification checkIn = findCheckInNotification();
        assertNotNull("no check-in notification was posted", checkIn);
        assertNotNull("no folded faces", checkIn.contentView);
        assertNotNull("no unfolded faces", checkIn.bigContentView);
        assertEquals("How are you today?", checkIn.extras.getCharSequence(Notification.EXTRA_SUB_TEXT).toString());
    }

    @Test
    public void hidingTitlesKeepsTheGenericCheckIn() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(true).put("checkInEnabled", true));

        fireCheckInAlarm();

        assertGenericCheckIn(findCheckInNotification());
    }

    @Test
    public void disguiseKeepsTheGenericCheckIn() throws Exception {
        dev.engender.app.disguise.DisguiseAlias.apply(context, true, "trans", "current");
        try {
            ReminderScheduler.saveAndSchedule(context, checkInPayload());
            fireCheckInAlarm();
            assertGenericCheckIn(findCheckInNotification());
        } finally {
            dev.engender.app.disguise.DisguiseAlias.apply(context, false, "trans", "current");
        }
    }

    /* Faces already in the shade must not outlive the setting that forbids
       them: turning "Hide sensitive titles" on re-syncs the payload, and
       that withdraws a check-in still drawing faces. */
    @Test
    public void hidingTitlesWithdrawsFacesAlreadyInTheShade() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull("no faces to withdraw", findCheckInNotification().contentView);

        CheckInFaces.reconcile(context, payload(true).put("checkInEnabled", true));

        // The day's prompt is not lost: the generic one takes the faces' place.
        assertGenericCheckIn(findCheckInNotification());
    }

    /* Behind a lock nothing syncs until the unlock, so turning disguise on
       cannot wait for a sync: the app clears the faces from the stored
       payload when it comes forward. */
    @Test
    public void disguiseWithdrawsFacesFromTheStoredPayloadWithoutASync() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull("no faces to withdraw", findCheckInNotification().contentView);
        dev.engender.app.disguise.DisguiseAlias.apply(context, true, "trans", "current");
        try {
            ReminderScheduler.withdrawHiddenFaces(context);
            assertGenericCheckIn(findCheckInNotification());
        } finally {
            dev.engender.app.disguise.DisguiseAlias.apply(context, false, "trans", "current");
        }
    }

    /* The replacement and the cancel obey the same rule the alarm does
       (ReminderAlarmReceiver.checkInDue): a day that already has an entry,
       a check-in switched off and a pause each mean no prompt, so faces in
       the shade are cancelled and no generic one takes their place. */
    private static int today() {
        return (int) java.time.LocalDate.now().toEpochDay();
    }

    @Test
    public void anEntrySavedAfterTheFacesAppearedLeavesNoReplacement() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull(findCheckInNotification().contentView);

        CheckInFaces.reconcile(context, payload(true).put("checkInEnabled", true).put("latestEntryEpochDay", today()));

        assertNoActiveNotifications();
    }

    @Test
    public void checkInsSwitchedOffLeaveNoReplacementUnderDisguise() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull(findCheckInNotification().contentView);
        dev.engender.app.disguise.DisguiseAlias.apply(context, true, "trans", "current");
        try {
            CheckInFaces.reconcile(context, payload(false).put("checkInEnabled", false));
            assertNoActiveNotifications();
        } finally {
            dev.engender.app.disguise.DisguiseAlias.apply(context, false, "trans", "current");
        }
    }

    @Test
    public void aPauseLeavesNoReplacement() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull(findCheckInNotification().contentView);

        CheckInFaces.reconcile(context, payload(true).put("checkInEnabled", true).put("checkInPausedThrough", today() + 1));

        assertNoActiveNotifications();
    }

    @Test
    public void facesForADayThatNowHasAnEntryAreCancelledEvenWithTitlesShown() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull(findCheckInNotification().contentView);

        CheckInFaces.reconcile(context, payload(false).put("checkInEnabled", true).put("latestEntryEpochDay", today()));

        assertNoActiveNotifications();
    }

    @Test
    public void overlappingWithdrawalsReplaceTheFacesOnce() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireCheckInAlarm();
        assertNotNull(findCheckInNotification().contentView);
        JSONObject hidden = payload(true).put("checkInEnabled", true);
        int threads = 4;
        java.util.concurrent.CountDownLatch go = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger replaced = new java.util.concurrent.atomic.AtomicInteger();
        java.util.List<Thread> workers = new java.util.ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Thread worker = new Thread(() -> {
                try {
                    go.await();
                    if (CheckInFaces.reconcile(context, hidden)) replaced.incrementAndGet();
                } catch (InterruptedException ignored) { }
            });
            worker.start();
            workers.add(worker);
        }
        go.countDown();
        for (Thread worker : workers) worker.join(10000);

        assertEquals("the faces were replaced more than once", 1, replaced.get());
    }

    @Test
    public void aGenericCheckInIsLeftInTheShadeWhenTitlesAreHidden() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload(true).put("checkInEnabled", true));
        fireCheckInAlarm();
        assertNotNull(findCheckInNotification());

        CheckInFaces.reconcile(context, payload(true).put("checkInEnabled", true));

        assertNotNull("a generic check-in was withdrawn", findCheckInNotification());
    }

    /* A face's route is the one launch route that names a mood, and the
       decision of 2026-11-10 is that no mood waits on the device for an
       unlock: behind a gate the app cannot read the route yet, so it is
       held in memory, never in preferences. */
    @Test
    public void aSeededRouteIsHeldInMemoryAndNeverInPreferences() {
        android.content.SharedPreferences prefs = context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
        ReminderScheduler.storeLaunchRoute(context, "/entry/new/today?seedMood=3");

        assertNull("a mood was written to preferences", prefs.getString("launch-route", null));
        assertEquals("/entry/new/today?seedMood=3", ReminderScheduler.consumeLaunchRoute(context));
        assertNull("consumed once", ReminderScheduler.consumeLaunchRoute(context));
    }

    @Test
    public void otherRoutesStillWaitInPreferences() {
        android.content.SharedPreferences prefs = context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
        ReminderScheduler.storeLaunchRoute(context, "/settings/reminders");

        assertEquals("/settings/reminders", prefs.getString("launch-route", null));
        assertEquals("/settings/reminders", ReminderScheduler.consumeLaunchRoute(context));
        assertNull(ReminderScheduler.consumeLaunchRoute(context));
    }

    private static void assertGenericCheckIn(Notification checkIn) {
        assertNotNull("no check-in notification was posted", checkIn);
        assertNull("faces on a check-in that must stay generic", checkIn.contentView);
        assertNull("faces on a check-in that must stay generic", checkIn.bigContentView);
        assertNull(checkIn.extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        assertEquals("Daily check-in", checkIn.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals("How are you today?", checkIn.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
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
    public void resetRemovesPostedTitlesAndCheckIn() throws Exception {
        ReminderScheduler.saveAndSchedule(context, checkInPayload());
        fireReminderAlarm();
        fireCheckInAlarm();
        Notification reminder = findNotification();
        Notification checkIn = findCheckInNotification();
        assertNotNull("no reminder was posted", reminder);
        assertNotNull("no check-in was posted", checkIn);
        assertEquals(SENSITIVE_TITLE, reminder.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals("How are you today?", checkIn.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        assertNull(checkIn.extras.getCharSequence(Notification.EXTRA_BIG_TEXT));

        DeviceStores.wipe(context);

        assertNoActiveNotifications();
        fireReminderAlarm();
        fireCheckInAlarm();
        assertNoActiveNotifications();
    }

    @Test
    public void sharedCheckInFixtureKeepsLegacyAffirmationOutOfNotification() throws Exception {
        JSONObject fixture = readCheckInFixture();
        JSONObject expected = fixture.getJSONObject("expected");
        assertFalse(expected.has("checkInAffirmations"));
        ReminderScheduler.saveAndSchedule(context, fixture.getJSONObject("input"));

        fireCheckInAlarm();

        Notification checkIn = findCheckInNotification();
        assertNotNull("no check-in was posted", checkIn);
        assertEquals(expected.getJSONObject("texts").getString("checkInBody"),
            checkIn.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        assertNull(checkIn.extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
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

    /* GD-033: hiding titles used to protect only what came next. A reminder
       already in the shade kept its title and its line of text on the lock
       screen until the person swiped it away. The switch reaches the
       notifications through the same sync that carries it. */
    private JSONObject withBodyText(JSONObject payload) throws Exception {
        payload.getJSONArray("reminders").getJSONObject(0).put("text", "Patch: " + SENSITIVE_TITLE);
        return payload;
    }

    private void postUnrelatedNotification() {
        androidx.core.app.NotificationManagerCompat.from(context).notify("unrelated", 4242,
            new androidx.core.app.NotificationCompat.Builder(context, ReminderScheduler.CHANNEL_REMINDERS)
                .setSmallIcon(dev.engender.app.R.drawable.ic_stat_mark)
                .setContentTitle("Backup finished")
                .build());
    }

    private boolean unrelatedStillPosted() {
        for (StatusBarNotification sbn : notificationManager().getActiveNotifications()) {
            if ("unrelated".equals(sbn.getTag()) && sbn.getId() == 4242) return true;
        }
        return false;
    }

    @Test
    public void hidingTitlesSanitizesTheReminderAndCheckInAlreadyPosted() throws Exception {
        ReminderScheduler.applySync(context, withBodyText(checkInPayload()));
        fireReminderAlarm();
        fireCheckInAlarm();
        postUnrelatedNotification();
        Notification before = findNotification();
        assertNotNull("no reminder was posted", before);
        assertEquals(SENSITIVE_TITLE, before.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertNotNull("no faces were posted", findCheckInNotification().contentView);

        ReminderScheduler.applySync(context, withBodyText(payload(true).put("checkInEnabled", true)));

        Notification after = findNotification();
        assertNotNull("the reminder was withdrawn instead of reposted", after);
        assertEquals(CHANNEL_NAME, after.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals("20:00", after.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        assertGenericCheckIn(findCheckInNotification());
        assertTrue("an unrelated notification was cancelled", unrelatedStillPosted());
    }

    @Test
    public void turningTitlesBackOnLeavesUnrelatedNotificationsAlone() throws Exception {
        ReminderScheduler.applySync(context, withBodyText(payload(true)));
        fireReminderAlarm();
        postUnrelatedNotification();

        ReminderScheduler.applySync(context, withBodyText(payload(false)));

        assertTrue("an unrelated notification was cancelled", unrelatedStillPosted());
        assertNotNull(findNotification());
    }

    /* The alarm that was already delivering when the switch was turned has
       the old payload in hand. It must finish first, and what it posted must
       then be sanitized, not left standing after the sync reported success. */
    @Test
    public void aDeliveryInFlightWhenTitlesAreHiddenIsSanitizedAfterwards() throws Exception {
        ReminderScheduler.applySync(context, withBodyText(payload(false)));
        CountDownLatch beforePost = new CountDownLatch(1);
        CountDownLatch releasePost = new CountDownLatch(1);
        AtomicBoolean held = new AtomicBoolean();
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
        Thread sync = new Thread(() -> {
            try {
                ReminderScheduler.applySync(context, withBodyText(payload(true)));
            } catch (Throwable error) { failure.set(error); }
        });
        delivery.start();
        try {
            assertTrue("delivery never reached NotificationManager", beforePost.await(5, TimeUnit.SECONDS));
            sync.start();
            Thread.sleep(300);
        } finally {
            releasePost.countDown();
            delivery.join(5000);
            sync.join(5000);
        }
        assertNull(failure.get());
        Notification posted = findNotification();
        assertNotNull(posted);
        assertEquals(CHANNEL_NAME, posted.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
    }

    private void assertNoActiveNotifications() throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (notificationManager().getActiveNotifications().length > 0 && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        assertEquals("a notification survived the reset", 0, notificationManager().getActiveNotifications().length);
    }

    private JSONObject readCheckInFixture() throws Exception {
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext()
                .getAssets().open("check-in-payload.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = in.read(buffer)) != -1) bytes.write(buffer, 0, count);
            return new JSONObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
        }
    }

    private JSONObject checkInPayload() throws Exception {
        return payload(false)
            .put("checkInEnabled", true);
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
    static Notification await(java.util.concurrent.Callable<Notification> lookFor)
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

package dev.engender.app.reminders;

import static org.junit.Assert.*;

import android.content.Context;
import android.os.ParcelFileDescriptor;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@RunWith(AndroidJUnit4.class)
public class RemindersQuietHoursBoundaryTest {
    private static final ZoneId ZONE = ZoneId.of("Europe/Warsaw");
    private Context context;
    private RemindersPlugin plugin;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ReminderScheduler.wipe(context);
        plugin = new RemindersPlugin() {
            @Override public Context getContext() { return context; }
        };
    }

    @After
    public void tearDown() throws Exception {
        ReminderScheduler.wipe(context);
    }

    @Test
    public void syncPersistsQuietHoursAndHoldsBothKindsUntilMorning() throws Exception {
        JSONObject payload = sync(policy(true, "22:00", "07:00"));
        assertNotNull("sync discarded quietHours", payload.optJSONObject("quietHours"));
        assertEquals("22:00", payload.getJSONObject("quietHours").getString("start"));
        assertBothAt(payload, "23:00", "2026-10-08T07:00+02:00[Europe/Warsaw]");

        final boolean[] scheduled = {false};
        ReminderScheduler.rescheduleFromStore(() -> ReminderScheduler.loadPayload(context), now(),
            saved -> fail("quiet hours need no migration"), previous -> {}, saved -> {
                assertBothAt(saved, "23:00", "2026-10-08T07:00+02:00[Europe/Warsaw]");
                scheduled[0] = true;
            });
        assertTrue("stored payload was not rescheduled", scheduled[0]);
    }

    @Test
    public void syncKeepsDisabledOutsideAndHalfOpenBoundaryBehavior() throws Exception {
        assertBothAt(sync(policy(false, "22:00", "07:00")), "23:00", "2026-10-08T23:00+02:00[Europe/Warsaw]");
        JSONObject enabled = sync(policy(true, "22:00", "07:00"));
        assertBothAt(enabled, "12:00", "2026-10-08T12:00+02:00[Europe/Warsaw]");
        assertBothAt(enabled, "22:00", "2026-10-08T07:00+02:00[Europe/Warsaw]");
        assertBothAt(enabled, "07:00", "2026-10-08T07:00+02:00[Europe/Warsaw]");
    }

    @Test
    public void syncLeavesMissingAndMalformedPoliciesToExistingQuietHoursRules() throws Exception {
        for (Object value : new Object[] {null, JSONObject.NULL, "invalid"}) {
            JSONObject payload = sync(value);
            assertNull(payload.optJSONObject("quietHours"));
            assertBothAt(payload, "23:00", "2026-10-08T23:00+02:00[Europe/Warsaw]");
        }
        JSObject invalidTime = policy(true, "bad", "07:00");
        JSONObject payload = sync(invalidTime);
        assertEquals("bad", payload.getJSONObject("quietHours").getString("start"));
        assertBothAt(payload, "06:00", "2026-10-08T07:00+02:00[Europe/Warsaw]");
        assertBothAt(sync(new JSObject()), "23:00", "2026-10-08T23:00+02:00[Europe/Warsaw]");
        assertBothAt(sync(policy(true, "07:00", "07:00")), "23:00", "2026-10-08T23:00+02:00[Europe/Warsaw]");
    }

    @Test
    public void androidAlarmsUseHeldTimesAfterSyncAndStoredReschedule() throws Exception {
        ZonedDateTime before = ZonedDateTime.now();
        JSONObject payload = sync(policy(true, "22:00", "07:00"));
        ZonedDateTime after = ZonedDateTime.now();
        ZonedDateTime due = ReminderPlanner.nextCheckIn(payload, before);
        assertEquals("test crossed the daily scheduling boundary", due,
            ReminderPlanner.nextCheckIn(payload, after));
        long expected = due.toInstant().toEpochMilli();
        assertAlarmTimes(expected);
        ReminderScheduler.rescheduleFromStore(context);
        assertAlarmTimes(expected);
    }

    private JSONObject sync(Object quietHours) throws Exception {
        JSObject input = new JSObject()
            .put("reminders", new JSArray().put(new JSObject()
                .put("id", "quiet-hours-boundary")
                .put("enabled", true).put("recurrence", "DAILY").put("time", "23:00")))
            .put("checkInEnabled", true).put("checkInTime", "23:00");
        if (quietHours != null) input.put("quietHours", quietHours);
        final boolean[] resolved = {false};
        plugin.sync(new PluginCall(null, "Reminders", "quiet-hours-boundary", "sync", input) {
            @Override public void resolve() { resolved[0] = true; }
            @Override public void reject(String message, String code, Exception error, JSObject data) {
                throw new AssertionError(message, error);
            }
        });
        assertTrue("sync did not resolve", resolved[0]);
        JSONObject payload = ReminderScheduler.loadPayload(context);
        assertNotNull("sync did not persist its payload", payload);
        return payload;
    }

    private static JSObject policy(boolean enabled, String start, String end) {
        return new JSObject().put("enabled", enabled).put("start", start).put("end", end);
    }

    private static ZonedDateTime now() {
        return ZonedDateTime.of(2026, 10, 8, 5, 0, 0, 0, ZONE);
    }

    private static void assertBothAt(JSONObject payload, String time, String expected) {
        try {
            JSONObject reminder = payload.getJSONArray("reminders").getJSONObject(0);
            reminder.put("time", time);
            assertEquals("reminder at " + time, ZonedDateTime.parse(expected),
                ReminderPlanner.nextReminder(reminder, now(), payload.optJSONObject("quietHours")));
            payload.put("checkInTime", time);
            assertEquals("check-in at " + time, ZonedDateTime.parse(expected),
                ReminderPlanner.nextCheckIn(payload, now()));
        } catch (Exception error) {
            throw new AssertionError(error);
        }
    }

    private void assertAlarmTimes(long expected) throws Exception {
        String dump;
        try (ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation()
                .getUiAutomation().executeShellCommand("dumpsys alarm");
             FileInputStream input = new FileInputStream(descriptor.getFileDescriptor());
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            dump = output.toString("UTF-8");
        }
        for (String action : new String[] {"dev.engender.app.REMINDER", "dev.engender.app.CHECK_IN"}) {
            boolean found = false;
            for (String block : dump.split("(?m)(?=^\\s*(?:RTC_WAKEUP|RTC|ELAPSED_WAKEUP|ELAPSED) #[0-9]+:)")) {
                if (block.contains("operation=PendingIntent") && block.contains("tag=*walarm*:" + action + "\n")
                    && block.contains("origWhen " + expected + " ")) found = true;
            }
            assertTrue("no " + action + " alarm with origWhen=" + expected + "\n" + dump, found);
        }
    }
}

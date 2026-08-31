package dev.barankiewicz.genderdiary.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;

/**
 * Phase 5 security ticket 02 (audit finding G-02): what a copy of the app's
 * directory reads out of the reminder store.
 *
 * <p>Read from the file rather than through the API, in the same spirit as
 * {@code AndroidEncryptionClaimTest} - an assertion that goes back through
 * {@code loadPayload} would decrypt on the way and prove nothing about the
 * bytes. "Estradiol patch" is the app's own example of what is at stake, and
 * it is the string these tests look for.
 */
@RunWith(AndroidJUnit4.class)
public class ReminderPayloadStoreTest {

    private static final String TITLE = "Estradiol patch";
    private static final String AFFIRMATION = "Your body is your own to describe";

    private Context context;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        clearStore();
    }

    @After
    public void tearDown() throws Exception {
        clearStore();
    }

    @Test
    public void theStoredPayloadHoldsNoTitleAndNoAffirmationInItsBytes() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload());

        String onDisk = preferenceBytes();
        assertFalse("the reminder title is readable on disk", onDisk.contains(TITLE));
        assertFalse("the affirmation is readable on disk", onDisk.contains(AFFIRMATION));
        assertFalse("the check-in prompt is readable on disk", onDisk.contains("How are you today?"));
        assertTrue("nothing was written at all", onDisk.contains(ReminderPayloadStore.KEY_CIPHERTEXT));

        JSONObject loaded = ReminderScheduler.loadPayload(context);
        assertNotNull(loaded);
        assertEquals(payload().toString(), loaded.toString());
    }

    @Test
    public void aPayloadFromAnOlderBuildIsRewrappedAndItsPlaintextRemoved() throws Exception {
        writeLegacyPlaintext(payload().toString());
        assertTrue("the fixture did not write the old shape", preferenceBytes().contains(TITLE));

        JSONObject loaded = ReminderScheduler.loadPayload(context);

        assertNotNull("a reminder was lost to the migration", loaded);
        assertEquals(
            TITLE,
            loaded.getJSONArray("reminders").getJSONObject(0).getString("title"));

        String onDisk = preferenceBytes();
        assertFalse("the plaintext payload is still here", onDisk.contains(TITLE));
        assertFalse("the old key is still here", onDisk.contains(ReminderPayloadStore.KEY_LEGACY_PLAINTEXT));

        // And it reads back the same way on every later fire, not only the
        // one that migrated it.
        assertEquals(payload().toString(), ReminderScheduler.loadPayload(context).toString());

        /* "Still fires", which is the half a round trip does not prove: the
           migrated rules reach AlarmManager, under the reminder's own id. */
        ReminderScheduler.rescheduleFromStore(context);
        assertTrue("the migrated reminder scheduled nothing", reminderAlarmExists());
    }

    @Test
    public void theStoreMintsTheAliasTheResetDeletes() throws Exception {
        /* What DeviceStoresTest cannot ask from the reset package: that the
           alias the reset deletes is the one this store actually wraps
           under. Minted by writing a payload rather than by hand, so a store
           that quietly moved to another alias fails here. */
        assertFalse("the fixture started with an alias", aliasExists());

        ReminderScheduler.saveAndSchedule(context, payload());
        assertTrue("the store wrapped under some other alias", aliasExists());

        ReminderScheduler.wipe(context);
        assertFalse("the wrapping key survived the reset", aliasExists());
    }

    @Test
    public void anUnparseablePayloadFromAnOlderBuildIsRemovedRatherThanKept() throws Exception {
        // It schedules nothing either way, so the only thing it can still do
        // is read as a title.
        writeLegacyPlaintext("{\"reminders\":[{\"title\":\"" + TITLE + "\"");

        assertNull(ReminderScheduler.loadPayload(context));
        assertFalse("the unparseable plaintext is still here", preferenceBytes().contains(TITLE));
    }

    @Test
    public void aPayloadWhoseKeyIsGoneReadsAsNoPayloadAtAll() throws Exception {
        ReminderScheduler.saveAndSchedule(context, payload());
        ReminderPayloadStore.deleteKey();

        // What a reset half-done looks like, and what a ciphertext restored
        // onto a different device looks like: the receiver posts nothing
        // rather than throwing out of onReceive.
        assertNull(ReminderScheduler.loadPayload(context));
    }

    /** The app's own reset: the file, the alarms these tests schedule, and
        the alias, rather than a preference clear that would leave the first
        test's alarms firing at whatever the next one wrote. */
    private void clearStore() throws Exception {
        ReminderScheduler.wipe(context);
    }

    private void writeLegacyPlaintext(String raw) {
        context
            .getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(ReminderPayloadStore.KEY_LEGACY_PLAINTEXT, raw)
            .commit();
    }

    /**
     * The preference file as a thief reads it. The empty {@code commit}
     * first is what keeps that honest whatever the store does: a write that
     * went out with {@code apply} returns before the file does, and a read
     * that raced it would report a clean file for a payload not yet
     * written.
     */
    private String preferenceBytes() throws Exception {
        context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE).edit().commit();
        File file = new File(context.getDataDir(), "shared_prefs/" + ReminderScheduler.PREFS + ".xml");
        if (!file.exists()) return "";
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    private static boolean aliasExists() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore.containsAlias(ReminderPayloadStore.ALIAS);
    }

    /** The alarm ReminderScheduler builds for the reminder in {@link
        #payload()}, if it is still scheduled. */
    private boolean reminderAlarmExists() {
        Intent intent = new Intent(context, ReminderAlarmReceiver.class)
            .setAction("dev.barankiewicz.genderdiary.REMINDER")
            .setData(Uri.parse("genderdiary://reminder/r-1"));
        return PendingIntent.getBroadcast(
            context, 41, intent, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE) != null;
    }

    private static JSONObject payload() throws Exception {
        return new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", "r-1")
                .put("title", TITLE)
                .put("type", "med")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", true)
            .put("checkInTime", "21:00")
            .put("checkInAffirmations", new JSONArray().put(AFFIRMATION))
            .put("hideNotificationTitles", false)
            .put("latestEntryEpochDay", 20313)
            .put("texts", new JSONObject()
                .put("channelReminders", "Reminders")
                .put("channelCheckIn", "Check-in")
                .put("checkInTitle", "Daily check-in")
                .put("checkInBody", "How are you today?"));
    }
}

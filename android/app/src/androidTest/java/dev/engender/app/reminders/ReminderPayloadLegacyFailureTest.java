package dev.engender.app.reminders;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * GD-031. A payload an older build left in the clear is rewrapped on first
 * read. When the rewrap fails (no key, no cipher, no commit) the read used to
 * hand the plaintext back and keep scheduling from it, so medication names and
 * schedules stayed readable on disk and in use. The failure now returns
 * nothing; a later successful read stores ciphertext and removes payload-v1.
 */
@RunWith(AndroidJUnit4.class)
public class ReminderPayloadLegacyFailureTest {

    private Context context;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ReminderPayloadStore.faults = null;
        prefs().edit().clear().commit();
        ReminderPayloadStore.deleteKey();
        prefs().edit().putString(ReminderPayloadStore.KEY_LEGACY_PLAINTEXT, legacyJson()).commit();
    }

    @After
    public void tearDown() throws Exception {
        ReminderPayloadStore.faults = null;
        prefs().edit().clear().commit();
        ReminderPayloadStore.deleteKey();
    }

    @Test
    public void aKeyGenerationFailureReturnsNoPayload() {
        ReminderPayloadStore.Faults faults = new ReminderPayloadStore.Faults();
        faults.keyGeneration = true;
        ReminderPayloadStore.faults = faults;

        assertNull(ReminderPayloadStore.read(context));
        assertNull("scheduling would still run from the plaintext", ReminderScheduler.loadPayload(context));
    }

    @Test
    public void aCipherFailureReturnsNoPayload() {
        ReminderPayloadStore.Faults faults = new ReminderPayloadStore.Faults();
        faults.cipher = true;
        ReminderPayloadStore.faults = faults;

        assertNull(ReminderPayloadStore.read(context));
    }

    @Test
    public void aCommitFailureReturnsNoPayload() {
        ReminderPayloadStore.Faults faults = new ReminderPayloadStore.Faults();
        faults.commit = true;
        ReminderPayloadStore.faults = faults;

        assertNull(ReminderPayloadStore.read(context));
    }

    @Test
    public void aRetryAfterTheFailureStoresCiphertextAndRemovesThePlaintext() {
        ReminderPayloadStore.Faults faults = new ReminderPayloadStore.Faults();
        faults.cipher = true;
        ReminderPayloadStore.faults = faults;
        assertNull(ReminderPayloadStore.read(context));
        assertNotNull(prefs().getString(ReminderPayloadStore.KEY_LEGACY_PLAINTEXT, null));

        ReminderPayloadStore.faults = null;
        JSONObject payload = ReminderPayloadStore.read(context);

        assertNotNull("the retry did not recover the reminders", payload);
        assertEquals("Estradiol patch", payload.optJSONArray("reminders").optJSONObject(0).optString("title"));
        assertNotNull(prefs().getString(ReminderPayloadStore.KEY_CIPHERTEXT, null));
        assertNull("payload-v1 is still on disk", prefs().getString(ReminderPayloadStore.KEY_LEGACY_PLAINTEXT, null));
        assertFalse(prefs().getAll().toString().contains("Estradiol"));
    }

    @Test
    public void aFailedSyncWriteLeavesAFailureTheCallerSees() {
        ReminderPayloadStore.Faults faults = new ReminderPayloadStore.Faults();
        faults.keyGeneration = true;
        ReminderPayloadStore.faults = faults;
        boolean threw = false;
        try {
            ReminderScheduler.saveAndSchedule(context, new JSONObject().put("reminders", new JSONArray()));
        } catch (Exception expected) {
            threw = true;
        }
        assertTrue("the sync reported success without storing anything", threw);
    }

    private SharedPreferences prefs() {
        return context.getSharedPreferences(ReminderScheduler.PREFS, Context.MODE_PRIVATE);
    }

    private static String legacyJson() throws Exception {
        return new JSONObject()
            .put("reminders", new JSONArray().put(new JSONObject()
                .put("id", "r-1")
                .put("title", "Estradiol patch")
                .put("time", "20:00")
                .put("recurrence", "DAILY")
                .put("enabled", true)))
            .put("checkInEnabled", false)
            .put("hideNotificationTitles", false)
            .toString();
    }
}
